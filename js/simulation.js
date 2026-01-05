// ESB Fleet Planner - Simulation Engine

import { getState, updateStats, resetStats, resetSimulation as resetSimulationState, advanceDay, setPendingCharge, clearPendingCharge, addDayScore, addBonus, addPenalty, recordNightlyCharging, saveToLeaderboard } from './state.js';
import { ESB_EFFICIENCY, DIESEL_MPG, FUEL_COSTS, BATTERY_CONFIG, SIMULATION_CONFIG, WEATHER_PATTERNS, WEATHER_INFO, SCORING, CHARGING_STATIONS, MIDDAY_CHARGING, TIME_WINDOWS, CO2_CONFIG, CELEBRATION_MESSAGES, V2G_CONFIG } from './config.js';
import { interpolatePosition, calculatePathLength, haversineDistance } from './utils.js';
import { updateBusPositions, updateStops, clearBusMarkers, updateChargingStations } from './map.js';
import { updateUI, updateRouteCards, updateCostDisplay, updateFleetStatus, updatePenaltyTracker, updateWeekProgress, updateDayStats, showChargingModal, showNightlyChargingModal, updateScoreDisplay, updateTimeDisplay } from './ui.js';
import { getAvailableChargingStations, getOSRMRouteBetweenPoints } from './routing.js';

let simulationInterval = null;
let lastFrameTime = null;

/**
 * Format simulated time to human readable string
 */
function formatTime(hours) {
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : (h === 0 ? 12 : h);
    return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
}

/**
 * Calculate simulated time based on bus progress
 * - 0% to 50% progress = 5 AM to 9 AM (AM trip)
 * - 50% progress = 9 AM (arrive at school, mid-day window opens)
 * - 50% to 100% progress = 1 PM to 5 PM (PM trip)
 */
function calculateTimeFromProgress(progress, chargingTimeHours = 0, atSchool = false) {
    if (progress < 0.5 && !atSchool) {
        // AM trip: 5 AM to 9 AM based on progress 0-50%
        const amProgress = progress / 0.5; // Normalize to 0-1
        const amHours = TIME_WINDOWS.amTripEnd - TIME_WINDOWS.amTripStart; // 4 hours
        return TIME_WINDOWS.amTripStart + (amProgress * amHours);
    } else if (atSchool || chargingTimeHours > 0) {
        // At school - AM trip complete, it's 9 AM
        // Time advances during charging (9 AM - 12 PM window)
        const chargingStartTime = TIME_WINDOWS.midDayStart; // 9 AM
        const currentChargingTime = Math.min(chargingTimeHours, TIME_WINDOWS.midDayEnd - TIME_WINDOWS.midDayStart);
        return chargingStartTime + currentChargingTime;
    } else {
        // PM trip: 12 PM to 4 PM based on progress 50-100%
        const pmProgress = (progress - 0.5) / 0.5; // Normalize to 0-1
        const pmHours = TIME_WINDOWS.pmTripEnd - TIME_WINDOWS.pmTripStart; // 4 hours
        return TIME_WINDOWS.pmTripStart + (pmProgress * pmHours);
    }
}

/**
 * Get current trip phase based on progress
 */
function getTripPhase(progress, isCharging = false) {
    if (progress < 0.45) {
        return 'am';
    } else if (progress < 0.55 || isCharging) {
        return 'midday';
    } else {
        return 'pm';
    }
}

/**
 * Check if bus has arrived at school (AM trip complete)
 * This is when mid-day charging decision should be made
 */
function hasArrivedAtSchool(bus) {
    return bus.arrivedAtSchool === true;
}

/**
 * Calculate CO2 avoided for a given distance and bus type
 * Formula: (distance / MPG) * 19.4 lbs CO2 per gallon
 * Type C uses 1.5x more fuel (lower MPG)
 */
function calculateCO2Avoided(distanceMiles, busType) {
    const mpg = busType === 'typeC' ? DIESEL_MPG.typeC : DIESEL_MPG.typeA;
    const gallonsAvoided = distanceMiles / mpg;
    let co2Avoided = gallonsAvoided * CO2_CONFIG.poundsPerGallon;
    
    // Type C multiplier is already factored into lower MPG
    // But if additional multiplier is needed:
    if (busType === 'typeC') {
        co2Avoided *= CO2_CONFIG.typeCMultiplier;
    }
    
    return co2Avoided;
}

/**
 * Show a celebratory bubble at stop location
 */
function showCelebrationBubble(stopCoords, map) {
    const message = CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)];
    
    // Create bubble element
    const bubble = document.createElement('div');
    bubble.className = 'celebration-bubble';
    bubble.textContent = message;
    
    // Position bubble at stop coordinates
    if (map && stopCoords) {
        const point = map.project(stopCoords);
        bubble.style.left = `${point.x}px`;
        bubble.style.top = `${point.y}px`;
    }
    
    // Add to map container
    const mapContainer = document.getElementById('map');
    if (mapContainer) {
        mapContainer.appendChild(bubble);
        
        // Remove bubble after animation completes
        setTimeout(() => {
            bubble.remove();
        }, 2500);
    }
}

/**
 * Initialize bus for the route
 */
export function initializeBuses(routes, config) {
    const buses = routes.map((route, index) => {
        let startPosition = route.path?.[0] || route.stops?.[0]?.coords || [-78.8, 42.8];
        
        return {
            id: `bus-${index + 1}`,
            name: `Bus #${index + 1}`,
            routeId: route.id,
            routeIndex: index,
            busType: route.busType,
            position: startPosition,
            path: route.path,
            progress: 0,
            currentStopIndex: 0,
            batteryCapacity: config.batteryCapacity,
            batteryLevel: 100,
            batteryKwh: config.batteryCapacity,
            energyConsumed: 0,
            distanceTraveled: 0,
            status: 'waiting',
            dwellUntil: null,
            needsMidDayCharge: false,
            midDayChargeChecked: false,
            arrivedAtSchool: false,
            isCharging: false,
            usedMidDayCharge: false,
            tripPhase: 'am',
            // Charging-related state
            chargingTimeHours: 0,
            chargingStation: null,
            chargingRate: null,
            chargingKwhPerHour: null,
            targetChargeKwh: null,
            // Deadhead travel state
            needsReturnTrip: false,
            returnDestination: null,
            returnDistance: null,
            returnProgress: null,
            returnPath: null,
            originalPosition: null,
            deadheadProgress: null,
            deadheadDistance: null,
            deadheadPath: null,
            deadheadStartPosition: null,
            deadheadEnergyNeeded: null
        };
    });
    
    return buses;
}

/**
 * Reset bus for new day with player-chosen charge level
 * The chargePercent is the TARGET level the player chose - energy is added to reach this level
 */
export function resetBusForNewDay(bus, route, chargePercent = 100) {
    const state = getState();
    
    // Calculate energy charged overnight
    const currentKwh = bus.batteryKwh;
    const targetKwh = (chargePercent / 100) * bus.batteryCapacity;
    const energyToAdd = Math.max(0, targetKwh - currentKwh);
    const chargingCost = energyToAdd * FUEL_COSTS.electric.overnight;
    
    // Record overnight charging cost (this is the key fix!)
    if (energyToAdd > 0) {
        state.week.totalOvernightCost += chargingCost;
        state.stats.nightlyChargingKwh = (state.stats.nightlyChargingKwh || 0) + energyToAdd;
        state.stats.nightlyChargingCost = (state.stats.nightlyChargingCost || 0) + chargingCost;
        console.log(`Overnight charge: ${energyToAdd.toFixed(1)} kWh added, cost $${chargingCost.toFixed(2)}, target ${chargePercent}%`);
    }
    
    // Reset bus position and state
    bus.position = route.path?.[0] || route.stops?.[0]?.coords;
    bus.progress = 0;
    bus.currentStopIndex = 0;
    bus.batteryLevel = chargePercent;  // Set to player's chosen level
    bus.batteryKwh = targetKwh;         // Set to player's chosen kWh
    bus.energyConsumed = 0;
    bus.distanceTraveled = 0;
    bus.status = 'waiting';
    bus.dwellUntil = null;
    bus.needsMidDayCharge = false;
    bus.midDayChargeChecked = false;
    bus.arrivedAtSchool = false;  // Critical: reset for new day's mid-day check
    bus.isCharging = false;
    bus.usedMidDayCharge = false;
    bus.tripPhase = 'am';
    
    // Reset all charging-related state
    bus.chargingTimeHours = 0;
    bus.chargingStation = null;
    bus.chargingRate = null;
    bus.chargingKwhPerHour = null;
    bus.targetChargeKwh = null;
    bus.chargerDestination = null;
    
    // Reset all deadhead travel state
    bus.needsReturnTrip = false;
    bus.returnDestination = null;
    bus.returnDistance = null;
    bus.returnProgress = null;
    bus.returnPath = null;
    bus.originalPosition = null;
    bus.deadheadProgress = null;
    bus.deadheadDistance = null;
    bus.deadheadPath = null;
    bus.deadheadStartPosition = null;
    bus.deadheadEnergyNeeded = null;
    
    // Reset stops
    route.stops.forEach(stop => stop.completed = false);
    route.status = 'waiting';
    route.progress = 0;
}

/**
 * Start simulation
 */
export function startSimulation() {
    const state = getState();
    
    if (state.simulation.running && !state.simulation.paused) return;
    
    if (state.simulation.paused) {
        state.simulation.paused = false;
    } else {
        state.simulation.running = true;
        state.simulation.startTime = Date.now();
    }
    
    lastFrameTime = Date.now();
    calculateSpeedMultiplier();
    simulationInterval = setInterval(simulationLoop, SIMULATION_CONFIG.updateInterval);
    
    document.getElementById('btn-start').disabled = true;
    document.getElementById('btn-pause').disabled = false;
}

/**
 * Calculate speed multiplier
 */
function calculateSpeedMultiplier() {
    const state = getState();
    const maxDistance = Math.max(...state.routes.map(r => r.distance || 20));
    const realTimeHours = maxDistance / SIMULATION_CONFIG.baseSpeedMph;
    const realTimeMs = realTimeHours * 3600 * 1000;
    state.simulation.speedMultiplier = realTimeMs / SIMULATION_CONFIG.targetDuration;
}

/**
 * Pause simulation
 */
export function pauseSimulation() {
    const state = getState();
    if (!state.simulation.running) return;
    
    state.simulation.paused = true;
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    
    document.getElementById('btn-start').disabled = false;
    document.getElementById('btn-pause').disabled = true;
}

/**
 * Stop simulation
 */
export function stopSimulation() {
    const state = getState();
    state.simulation.running = false;
    state.simulation.paused = false;
    
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
}

/**
 * Main simulation loop
 */
function simulationLoop() {
    const state = getState();
    const now = Date.now();
    const deltaTime = now - (lastFrameTime || now);
    lastFrameTime = now;
    
    if (!state.simulation.running || state.simulation.paused) return;
    
    // Check for pending charge selection
    if (state.pendingCharge) return;
    
    // Check for nightly charging decision pending
    if (state.ui.showNightlyChargingModal) return;
    
    const simulatedDelta = deltaTime * state.simulation.speedMultiplier;
    state.simulation.elapsedTime += simulatedDelta;
    
    let allCompleted = true;
    
    state.buses.forEach(bus => {
        const route = state.routes.find(r => r.id === bus.routeId);
        if (!route) return;
        
        if (bus.status !== 'completed') {
            allCompleted = false;
            updateBus(bus, route, simulatedDelta);
        }
        
        // Update simulated time based on bus progress (not elapsed time)
        const isCharging = bus.isCharging || bus.status === 'charging';
        const atSchool = bus.arrivedAtSchool && bus.progress < 0.55;
        const isTravelingToCharger = bus.status === 'traveling-to-charger' || bus.status === 'returning-from-charger';
        
        // Pass charging time to advance clock during charging (time passes while charging!)
        const chargingTime = isCharging ? (bus.chargingTimeHours || 0) : 0;
        state.simulation.currentTime = calculateTimeFromProgress(bus.progress, chargingTime, atSchool || isTravelingToCharger);
        state.simulation.timeString = formatTime(state.simulation.currentTime);
        
        // Update trip phase based on progress and school arrival
        const newPhase = getTripPhase(bus.progress, isCharging || atSchool);
        if (newPhase !== state.simulation.tripPhase) {
            state.simulation.tripPhase = newPhase;
            console.log(`Trip phase: ${newPhase} at ${state.simulation.timeString} (${(bus.progress * 100).toFixed(0)}% progress)`);
        }
    });
    
    updateBusPositions(state.buses);
    updateStops(state.routes);
    updateTimeDisplay();
    updateUI();
    
    if (allCompleted) {
        handleDayComplete();
    }
}

/**
 * Handle day completion
 */
function handleDayComplete() {
    const state = getState();
    stopSimulation();
    
    // Calculate and store total electric cost for the day
    const baseEnergy = state.stats.totalEnergyConsumed - (state.stats.midDayChargingKwh || 0);
    const baseCost = baseEnergy * FUEL_COSTS.electric.overnight;
    state.stats.electricCost = baseCost + (state.stats.midDayChargingCost || 0);
    
    // Calculate day score
    calculateDayScore();
    
    // Check if more days
    const hasMoreDays = advanceDay();
    
    if (hasMoreDays) {
        // Show nightly charging decision modal
        showNightlyChargingDecision();
    } else {
        // Week complete - calculate final score and show results
        calculateFinalScore();
        showWeekResult();
    }
}

/**
 * Calculate day score
 */
function calculateDayScore() {
    const state = getState();
    let dayPoints = SCORING.dayCompleted;
    const breakdown = [`+${SCORING.dayCompleted} Day completed`];
    
    // Check for mid-day charge penalty
    if (state.stats.midDayCharges > 0) {
        dayPoints += SCORING.midDayChargePenalty;
        breakdown.push(`${SCORING.midDayChargePenalty} Mid-day charging`);
        addPenalty({ reason: 'Mid-day charging', points: SCORING.midDayChargePenalty, day: state.week.currentDay });
    } else {
        dayPoints += SCORING.noMidDayChargeBonus;
        breakdown.push(`+${SCORING.noMidDayChargeBonus} No mid-day charge`);
    }
    
    // Check overnight charging efficiency (if not first day)
    const lastNightDecision = state.nightlyCharging.decisions.find(d => d.day === state.week.currentDay);
    if (lastNightDecision) {
        const targetPercent = lastNightDecision.targetPercent;
        const actualUsed = (state.stats.totalEnergyConsumed / state.config.batteryCapacity) * 100;
        const endPercent = targetPercent - actualUsed;
        
        // Efficient if ended with 10-25% (didn't over or under charge)
        if (endPercent >= 10 && endPercent <= 25) {
            dayPoints += SCORING.efficientChargeBonus;
            breakdown.push(`+${SCORING.efficientChargeBonus} Efficient charging`);
            addBonus({ reason: 'Efficient overnight charging', points: SCORING.efficientChargeBonus, day: state.week.currentDay });
        } else if (endPercent > 25) {
            // Overcharged
            const overchargeKwh = (endPercent - 25) / 100 * state.config.batteryCapacity;
            const penalty = Math.round(overchargeKwh * SCORING.overchargePerKwhPenalty);
            dayPoints += penalty;
            breakdown.push(`${penalty} Overcharged`);
        }
    }
    
    addDayScore({ 
        day: state.week.currentDay, 
        points: dayPoints, 
        breakdown 
    });
    
    updateScoreDisplay();
}

/**
 * Show nightly charging decision modal
 */
function showNightlyChargingDecision() {
    const state = getState();
    const nextDay = state.week.currentDay; // Already advanced
    const nextDaySchedule = state.week.schedule.find(d => d.day === nextDay);
    
    if (!nextDaySchedule) {
        continueToNextDay(100);
        return;
    }
    
    const bus = state.buses[0];
    const currentBatteryPercent = bus ? bus.batteryLevel : 20;
    
    // Show the modal
    state.ui.showNightlyChargingModal = true;
    showNightlyChargingModal(nextDay, nextDaySchedule, currentBatteryPercent);
}

/**
 * Confirm nightly charging decision with optional route adjustment and V2G
 */
export function confirmNightlyCharging(targetPercent, newRouteDistance = null, v2gAmount = 0, v2gEarned = 0) {
    const state = getState();
    const bus = state.buses[0];
    
    if (!bus) return;
    
    const currentBatteryPercent = bus.batteryLevel;
    const currentKwh = bus.batteryKwh;
    
    // V2G discharge happens first (4 PM - 8 PM), then charging (9 PM - 5 AM)
    const afterV2GKwh = currentKwh - v2gAmount;
    const targetKwh = (targetPercent / 100) * bus.batteryCapacity;
    const energyToAdd = Math.max(0, targetKwh - afterV2GKwh);
    const cost = energyToAdd * FUEL_COSTS.electric.overnight;
    
    // Track V2G earnings (daily and cumulative)
    if (v2gAmount > 0) {
        state.stats.v2gEarnings = (state.stats.v2gEarnings || 0) + v2gEarned;
        state.stats.v2gKwhDischarged = (state.stats.v2gKwhDischarged || 0) + v2gAmount;
        
        // Accumulate for week totals
        state.week.totalV2GEarnings = (state.week.totalV2GEarnings || 0) + v2gEarned;
        state.week.totalV2GKwh = (state.week.totalV2GKwh || 0) + v2gAmount;
        
        console.log(`V2G: Discharged ${v2gAmount.toFixed(1)} kWh, earned $${v2gEarned.toFixed(2)}`);
    }
    
    // Get the current route distance BEFORE saving the new one
    const previousRouteDistance = state.config.adjustedRouteDistance || state.config.guessDistance;
    const needsRouteRegeneration = newRouteDistance !== null && newRouteDistance !== previousRouteDistance;
    
    // Save adjusted route distance if provided
    if (newRouteDistance !== null) {
        state.config.adjustedRouteDistance = newRouteDistance;
        if (needsRouteRegeneration) {
            console.log(`Route adjusted to ${newRouteDistance} mi one-way for next day`);
        }
    }
    
    // Record the decision
    recordNightlyCharging({
        day: state.week.currentDay,
        targetPercent,
        startPercent: currentBatteryPercent,
        energyCharged: energyToAdd,
        cost,
        routeAdjusted: needsRouteRegeneration,
        newRouteDistance: newRouteDistance,
        v2gAmount,
        v2gEarned
    });
    
    state.ui.showNightlyChargingModal = false;
    
    // Hide modal
    document.getElementById('nightly-charge-modal').classList.add('hidden');
    
    // Continue to next day with chosen charge level and potentially new route
    continueToNextDay(targetPercent, needsRouteRegeneration ? newRouteDistance : null);
}

/**
 * Continue to next day (with optional route regeneration)
 */
async function continueToNextDay(chargePercent, newRouteDistance = null) {
    const state = getState();
    
    // Reset stats for new day
    resetStats();
    resetSimulationState();
    
    // Check if we need to regenerate route
    if (newRouteDistance) {
        // Regenerate route with new distance
        console.log(`Regenerating route with new distance: ${newRouteDistance} mi`);
        
        try {
            const { regenerateRoute } = await import('./routing.js');
            const newRoute = await regenerateRoute(newRouteDistance);
            
            // Update routes array
            state.routes = [newRoute];
            
            // Update bus with new route
            state.buses.forEach(bus => {
                bus.routeId = newRoute.id;
                bus.path = newRoute.path;
                resetBusForNewDay(bus, newRoute, chargePercent);
            });
        } catch (error) {
            console.error('Failed to regenerate route:', error);
            // Fall back to existing route
            state.buses.forEach(bus => {
                const route = state.routes.find(r => r.id === bus.routeId);
                if (route) {
                    resetBusForNewDay(bus, route, chargePercent);
                }
            });
        }
    } else {
        // Use existing route
        state.buses.forEach(bus => {
            const route = state.routes.find(r => r.id === bus.routeId);
            if (route) {
                resetBusForNewDay(bus, route, chargePercent);
            }
        });
    }
    
    // Update UI
    updateWeekProgress();
    updateDayStats();
    updateRouteCards();
    updateScoreDisplay();
    
    import('./map.js').then(({ updateRouteLines, updateStops, updateBusPositions }) => {
        updateRouteLines(state.routes);
        updateStops(state.routes);
        updateBusPositions(state.buses);
    });
    
    // Auto-start next day
    setTimeout(() => {
        startSimulation();
    }, 500);
}

/**
 * Update a single bus
 */
function updateBus(bus, route, deltaTime) {
    const state = getState();
    
    // Handle dwelling
    if (bus.dwellUntil) {
        if (Date.now() < bus.dwellUntil) return;
        bus.dwellUntil = null;
    }
    
    // Handle traveling to charger (deadhead)
    if (bus.status === 'traveling-to-charger') {
        handleDeadheadTravel(bus, route, deltaTime);
        return;
    }
    
    // Handle returning from off-route charger
    if (bus.status === 'returning-from-charger') {
        handleReturnFromCharger(bus, route, deltaTime);
        return;
    }
    
    // Handle charging
    if (bus.isCharging) {
        handleCharging(bus, deltaTime);
        return;
    }
    
    // Start bus
    if (bus.status === 'waiting') {
        bus.status = 'moving';
        route.status = 'active';
    }
    
    // Move bus
    if (bus.status === 'moving') {
        moveBus(bus, route, deltaTime);
    }
}

/**
 * Handle bus traveling to a charging station (deadhead travel)
 * Bus physically moves along OSRM-routed path from school to charger location
 */
function handleDeadheadTravel(bus, route, deltaTime) {
    const state = getState();
    
    if (!bus.chargerDestination || !bus.deadheadDistance) {
        // No destination set, start charging at current location
        bus.isCharging = true;
        bus.status = 'charging';
        route.status = 'charging';
        return;
    }
    
    const speedMph = SIMULATION_CONFIG.baseSpeedMph;
    const hoursElapsed = deltaTime / (3600 * 1000);
    const distanceToTravel = speedMph * hoursElapsed;
    
    // Update deadhead progress
    bus.deadheadProgress = (bus.deadheadProgress || 0) + distanceToTravel;
    bus.distanceTraveled += distanceToTravel;
    
    // Energy consumption during deadhead (multiplied by energy penalty)
    const efficiency = getEfficiency(bus.busType, state.weather);
    const energyUsed = distanceToTravel * efficiency * MIDDAY_CHARGING.energyCostDeadhead;
    bus.batteryKwh = Math.max(0, bus.batteryKwh - energyUsed);
    bus.batteryLevel = (bus.batteryKwh / bus.batteryCapacity) * 100;
    bus.energyConsumed += energyUsed;
    
    updateStats({
        totalDistance: state.stats.totalDistance + distanceToTravel,
        totalEnergyConsumed: state.stats.totalEnergyConsumed + energyUsed
    });
    
    // Check if bus ran out of battery during deadhead
    if (bus.batteryKwh <= 0) {
        bus.status = 'stranded';
        route.status = 'failed';
        triggerGameOver('stranded');
        return;
    }
    
    // Interpolate position along OSRM path if available
    const progress = Math.min(1, bus.deadheadProgress / bus.deadheadDistance);
    
    if (bus.deadheadPath && bus.deadheadPath.length > 1) {
        // Use OSRM path for smooth interpolation
        bus.position = interpolatePosition(bus.deadheadPath, progress);
    } else {
        // Fallback to linear interpolation
        const startPos = bus.deadheadStartPosition || bus.position;
        const endPos = bus.chargerDestination;
        
        if (startPos && endPos) {
            bus.position = [
                startPos[0] + (endPos[0] - startPos[0]) * progress,
                startPos[1] + (endPos[1] - startPos[1]) * progress
            ];
        }
    }
    
    // Check if arrived at charger
    if (bus.deadheadProgress >= bus.deadheadDistance) {
        bus.position = [...bus.chargerDestination];
        bus.isCharging = true;
        bus.status = 'charging';
        route.status = 'charging';
        
        // Update target charge to account for deadhead energy used plus return trip
        const returnEnergy = bus.deadheadDistance * efficiency * MIDDAY_CHARGING.energyCostDeadhead;
        bus.targetChargeKwh = Math.min(
            bus.batteryCapacity * 0.9, 
            bus.targetChargeKwh + returnEnergy
        );
        
        // Store that we need to return after charging - also fetch return path
        bus.needsReturnTrip = true;
        bus.returnDestination = bus.originalPosition;
        bus.returnDistance = bus.deadheadDistance;
        // Reverse the deadhead path for return journey
        bus.returnPath = bus.deadheadPath ? [...bus.deadheadPath].reverse() : null;
        
        console.log(`Arrived at ${bus.chargingStation} @ ${state.simulation.timeString}, starting charge at ${bus.batteryLevel.toFixed(0)}%`);
    }
}

/**
 * Move bus along route
 */
function moveBus(bus, route, deltaTime) {
    const state = getState();
    
    if (!route.path || route.path.length < 2) return;
    
    // Check if bus is stranded (0% battery) - GAME OVER
    if (bus.batteryKwh <= 0 && !bus.isCharging) {
        bus.batteryKwh = 0;
        bus.batteryLevel = 0;
        bus.status = 'stranded';
        route.status = 'failed';
        triggerGameOver('stranded');
        return;
    }
    
    const speedMph = SIMULATION_CONFIG.baseSpeedMph;
    const hoursElapsed = deltaTime / (3600 * 1000);
    const distanceToTravel = speedMph * hoursElapsed;
    
    const pathLength = calculatePathLength(route.path);
    if (pathLength === 0) return;
    
    const progressIncrement = distanceToTravel / pathLength;
    bus.progress = Math.min(1, bus.progress + progressIncrement);
    
    const newPosition = interpolatePosition(route.path, bus.progress);
    if (newPosition && !isNaN(newPosition[0]) && !isNaN(newPosition[1])) {
        bus.position = newPosition;
    }
    
    // Energy consumption
    const efficiency = getEfficiency(bus.busType, state.weather);
    const energyUsed = distanceToTravel * efficiency;
    
    bus.energyConsumed += energyUsed;
    bus.batteryKwh = Math.max(0, bus.batteryKwh - energyUsed);
    bus.batteryLevel = (bus.batteryKwh / bus.batteryCapacity) * 100;
    bus.distanceTraveled += distanceToTravel;
    
    updateStats({
        totalDistance: state.stats.totalDistance + distanceToTravel,
        totalEnergyConsumed: state.stats.totalEnergyConsumed + energyUsed
    });
    
    // Check if bus ran out of battery while not at charger - GAME OVER
    if (bus.batteryKwh <= 0 && !bus.isCharging) {
        bus.batteryKwh = 0;
        bus.batteryLevel = 0;
        bus.status = 'stranded';
        route.status = 'failed';
        triggerGameOver('stranded');
        return;
    }
    
    // Update trip phase
    if (bus.progress >= 0.45 && bus.progress <= 0.55) {
        bus.tripPhase = 'school';
        state.simulation.tripPhase = 'school';
    } else if (bus.progress > 0.55) {
        bus.tripPhase = 'pm';
        state.simulation.tripPhase = 'pm';
    }
    
    // Check stop arrivals (this will trigger mid-day charging check at school)
    checkStopArrivals(bus, route);
    
    // FALLBACK: Progress-based mid-day charging check
    // If bus reached ~50% progress (school area) but stop-based check didn't trigger
    if (bus.progress >= 0.48 && bus.progress <= 0.52 && !bus.midDayChargeChecked && !bus.arrivedAtSchool) {
        console.log(`FALLBACK: Bus at ${(bus.progress * 100).toFixed(0)}% progress - forcing school arrival check`);
        bus.arrivedAtSchool = true;
        bus.status = 'at-school';
        
        const needsCharging = checkChargingNeeds(bus, route);
        if (!needsCharging) {
            console.log(`No mid-day charging needed (fallback). Continuing to PM trip.`);
            bus.dwellUntil = Date.now() + 1000;
            bus.status = 'dwelling';
            setTimeout(() => { 
                if (bus.status === 'dwelling') bus.status = 'moving'; 
            }, 1000);
        }
        return; // Don't continue this frame
    }
    
    if (bus.progress >= 0.99) {
        completeRoute(bus, route);
    }
}

/**
 * Get efficiency based on bus type and weather
 */
export function getEfficiency(busType, weather) {
    const type = busType === 'A' ? 'typeA' : 'typeC';
    return ESB_EFFICIENCY[type][weather];
}

/**
 * Check stop arrivals
 */
function checkStopArrivals(bus, route) {
    if (!route.stops || bus.currentStopIndex >= route.stops.length) return;
    
    // Check multiple stops in case bus moved past several in one update
    let stopsProcessed = 0;
    const maxStopsPerUpdate = 3; // Prevent infinite loop
    
    while (stopsProcessed < maxStopsPerUpdate && bus.currentStopIndex < route.stops.length) {
        const currentStop = route.stops[bus.currentStopIndex];
        if (!currentStop) break;
        
        if (currentStop.completed) {
            bus.currentStopIndex++;
            continue;
        }
        
        const distance = haversineDistance(bus.position, currentStop.coords);
        
        // Use a more generous threshold for fast-moving simulation
        const threshold = Math.max(SIMULATION_CONFIG.arrivalThreshold, 0.15);
        
        if (distance < threshold) {
            currentStop.completed = true;
            stopsProcessed++;
            
            processStopArrival(bus, route, currentStop);
            bus.currentStopIndex++;
        } else {
            // Bus hasn't reached this stop yet
            break;
        }
    }
}

/**
 * Process arrival at a stop - handles CO2 tracking, celebrations, and school logic
 */
function processStopArrival(bus, route, currentStop) {
    // Check if we arrived at school (AM trip complete) - trigger mid-day charging check
    if (currentStop.type === 'school' && !bus.midDayChargeChecked) {
        console.log(`AM trip complete! Arrived at school @ ${getState().simulation.timeString}, Battery: ${bus.batteryLevel.toFixed(0)}%`);
        bus.arrivedAtSchool = true;
        bus.status = 'at-school';
        
        const needsCharging = checkChargingNeeds(bus, route);
        
        if (!needsCharging) {
            console.log(`No mid-day charging needed. Continuing to PM trip.`);
            bus.dwellUntil = Date.now() + 2000;
            bus.status = 'dwelling';
            setTimeout(() => { 
                if (bus.status === 'dwelling') bus.status = 'moving'; 
            }, 2000);
        }
        return;
    }
    
    // Track pickup/dropoff stops for CO2 and celebrations
    if (currentStop.type === 'pickup' || currentStop.type === 'dropoff') {
        const state = getState();
        
        // Calculate CO2 avoided since last stop (estimate ~2 miles per stop segment)
        const avgStopDistance = 2; // miles per stop segment approximation
        const co2Avoided = calculateCO2Avoided(avgStopDistance, bus.busType);
        
        // Update stats
        state.stats.co2Avoided = (state.stats.co2Avoided || 0) + co2Avoided;
        state.stats.pickupsCompleted = (state.stats.pickupsCompleted || 0) + 1;
        
        console.log(`🌿 ${currentStop.type} completed: +${co2Avoided.toFixed(1)} lbs CO2 avoided. Total: ${state.stats.co2Avoided.toFixed(1)} lbs`);
        
        // Show celebration bubble
        const map = state.map;
        if (map) {
            showCelebrationBubble(currentStop.coords, map);
        }
    }
    
    // Brief dwell for pickup/dropoff stops
    if (currentStop.type === 'pickup' || currentStop.type === 'dropoff') {
        const dwellTime = 500; // Shorter dwell for faster feedback
        bus.dwellUntil = Date.now() + dwellTime;
        bus.status = 'dwelling';
        setTimeout(() => { 
            if (bus.status === 'dwelling') bus.status = 'moving'; 
        }, dwellTime);
    }
}

/**
 * Check if mid-day charging needed (called when bus arrives at school after AM trip)
 * Returns true if charging is needed (and modal shown), false otherwise
 */
function checkChargingNeeds(bus, route) {
    const state = getState();
    
    // Only check when bus has arrived at school and hasn't been checked yet
    if (bus.isCharging || bus.midDayChargeChecked || bus.status === 'traveling-to-charger') {
        return false;
    }
    
    const schoolStop = route.stops.find(s => s.type === 'school');
    if (!schoolStop) return false;
    
    // Mark as checked so we don't keep prompting
    bus.midDayChargeChecked = true;
    
    // Calculate remaining distance (PM trip back to depot - approximately half the route)
    const remainingDistance = route.distance / 2; // PM trip is half the round-trip distance
    
    // Calculate energy needed for PM trip
    const efficiency = getEfficiency(bus.busType, state.weather);
    const energyNeeded = remainingDistance * efficiency;
    
    // Predict battery at depot
    const batteryAtDepot = bus.batteryKwh - energyNeeded;
    const batteryPercentAtDepot = (batteryAtDepot / bus.batteryCapacity) * 100;
    
    console.log(`Day ${state.week.currentDay} - Mid-day check at school:`);
    console.log(`  Current battery: ${bus.batteryLevel.toFixed(0)}% (${bus.batteryKwh.toFixed(1)} kWh)`);
    console.log(`  PM trip distance: ${remainingDistance.toFixed(1)} mi`);
    console.log(`  Energy needed for PM: ${energyNeeded.toFixed(1)} kWh`);
    console.log(`  Predicted battery at depot: ${batteryPercentAtDepot.toFixed(0)}%`);
    
    // Need charging if returning with < 15% OR if we'll run out of battery
    const needsCharging = batteryPercentAtDepot < BATTERY_CONFIG.minReturnCharge * 100;
    
    if (needsCharging) {
        bus.needsMidDayCharge = true;
        
        // Calculate energy to add to safely return with minimum buffer
        const targetBatteryAtDepot = bus.batteryCapacity * BATTERY_CONFIG.minReturnCharge;
        const energyToAdd = Math.max(0, (targetBatteryAtDepot + energyNeeded) - bus.batteryKwh);
        
        // Stop simulation and show charging station selection
        stopSimulation();
        
        // Get available charging stations (school, depot, public)
        const chargingStations = getAvailableChargingStations(route, bus.position);
        
        setPendingCharge({
            bus: bus,
            route: route,
            energyNeeded: energyToAdd,
            stations: chargingStations,
            currentBattery: bus.batteryLevel,
            timeRemaining: TIME_WINDOWS.midDayEnd - state.simulation.currentTime
        });
        
        console.log(`⚡ MID-DAY CHARGING NEEDED!`);
        console.log(`  Energy to add: ${energyToAdd.toFixed(1)} kWh`);
        showChargingModal(bus, chargingStations, energyToAdd);
        return true;
    }
    
    return false;
}

/**
 * Confirm charging at selected station with deadhead penalty
 * The bus must travel to the charging location before charging begins
 */
export async function confirmCharging(stationId, station) {
    const state = getState();
    const pendingCharge = state.pendingCharge;
    
    if (!pendingCharge) return;
    
    const { bus, route, energyNeeded } = pendingCharge;
    
    bus.usedMidDayCharge = true;
    bus.chargingStation = station?.name || 'Unknown';
    bus.chargingRate = station?.rate || FUEL_COSTS.electric.daytime;
    bus.chargingKwhPerHour = station?.kwhPerHour || BATTERY_CONFIG.chargingRateKwhPerHour;
    bus.targetChargeKwh = bus.batteryKwh + energyNeeded;
    
    state.stats.midDayCharges++;
    state.week.totalMidDayCharges++;
    
    // Handle deadhead miles penalty if not at school
    const deadheadMiles = station?.deadheadMiles || 0;
    const isAtSchool = station?.locationType === 'school';
    
    if (deadheadMiles > 0 && !isAtSchool) {
        const deadheadPenalty = Math.round(deadheadMiles * MIDDAY_CHARGING.deadheadPenaltyPerMile);
        
        // Add deadhead penalty
        addPenalty({ 
            reason: `Deadhead to ${station?.locationType || 'charger'} (${deadheadMiles.toFixed(1)} mi)`, 
            points: -deadheadPenalty,
            day: state.week.currentDay 
        });
        
        state.stats.deadheadMiles = (state.stats.deadheadMiles || 0) + deadheadMiles;
        
        console.log(`Deadhead: ${deadheadMiles.toFixed(1)} mi to ${station?.name}, -${deadheadPenalty} pts`);
    }
    
    // Store the original bus position before traveling (for return journey)
    bus.originalPosition = [...bus.position];
    bus.chargerDestination = station?.coords || null;
    bus.chargerLocationType = station?.locationType || 'depot';
    
    // If charging at school (on-route), start charging immediately
    if (isAtSchool) {
        bus.isCharging = true;
        bus.status = 'charging';
        route.status = 'charging';
        console.log(`Starting mid-day charge at School @ ${state.simulation.timeString}: ${bus.batteryLevel.toFixed(0)}%`);
    } else {
        // Bus must travel to the charging location first
        bus.status = 'traveling-to-charger';
        route.status = 'deadhead';
        
        // Get OSRM route for deadhead travel
        const osrmRoute = await getOSRMRouteBetweenPoints(bus.position, station.coords);
        bus.deadheadPath = osrmRoute.path;
        bus.deadheadDistance = osrmRoute.distance;
        bus.deadheadProgress = 0;
        bus.deadheadStartPosition = [...bus.position];
        
        // Calculate energy needed for deadhead
        const efficiency = getEfficiency(bus.busType, state.weather);
        bus.deadheadEnergyNeeded = bus.deadheadDistance * efficiency;
        
        console.log(`Bus traveling to ${station?.name} @ ${state.simulation.timeString} (${bus.deadheadDistance.toFixed(1)} mi via OSRM)`);
    }
    
    clearPendingCharge();
    
    // Close modal and resume
    document.getElementById('charging-modal').classList.add('hidden');
    
    setTimeout(() => {
        startSimulation();
    }, 500);
}

/**
 * Handle charging (with variable charging rates based on station type)
 * After charging, bus may need to return to original position
 */
function handleCharging(bus, deltaTime) {
    const state = getState();
    
    // Use the station's charging rate if available
    // Level 2: 13 kWh/hr, Level 3: 50 kWh/hr
    const chargingRateKwhPerHour = bus.chargingKwhPerHour || BATTERY_CONFIG.chargingRateKwhPerHour;
    const hoursElapsed = deltaTime / (3600 * 1000);
    
    // Track total charging time for time display
    bus.chargingTimeHours = (bus.chargingTimeHours || 0) + hoursElapsed;
    
    const energyAdded = chargingRateKwhPerHour * hoursElapsed;
    
    const previousKwh = bus.batteryKwh;
    bus.batteryKwh = Math.min(bus.batteryCapacity, bus.batteryKwh + energyAdded);
    bus.batteryLevel = (bus.batteryKwh / bus.batteryCapacity) * 100;
    
    const actualEnergyAdded = bus.batteryKwh - previousKwh;
    
    // Charging cost at the station's rate
    const rate = bus.chargingRate || FUEL_COSTS.electric.daytime;
    const chargingCost = actualEnergyAdded * rate;
    state.stats.electricCost += chargingCost;
    state.stats.midDayChargingCost = (state.stats.midDayChargingCost || 0) + chargingCost;
    state.stats.midDayChargingKwh = (state.stats.midDayChargingKwh || 0) + actualEnergyAdded;
    
    const targetKwh = bus.targetChargeKwh || (bus.batteryCapacity * 0.80);
    
    // Check if charging window has expired (9 AM - 12 PM = 3 hours max)
    const maxChargingHours = MIDDAY_CHARGING.maxChargingDuration; // 3 hours
    const chargingWindowExpired = bus.chargingTimeHours >= maxChargingHours;
    
    if (bus.batteryKwh >= targetKwh || bus.batteryLevel >= 95 || chargingWindowExpired) {
        bus.isCharging = false;
        
        const route = state.routes.find(r => r.id === bus.routeId);
        
        if (chargingWindowExpired && bus.batteryKwh < targetKwh) {
            console.log(`Charging window expired at ${bus.chargingStation}! Only reached ${bus.batteryLevel.toFixed(0)}%`);
        } else {
            console.log(`Charging complete at ${bus.chargingStation} @ ${state.simulation.timeString}: ${bus.batteryLevel.toFixed(0)}%`);
        }
        
        // Reset charging time tracker
        bus.chargingTimeHours = 0;
        
        // Check if bus needs to return to route (depot charging requires return to school/route)
        if (bus.needsReturnTrip && bus.returnDestination) {
            bus.status = 'returning-from-charger';
            bus.returnProgress = 0;
            // returnPath and returnDistance should already be set from handleDeadheadTravel
            route.status = 'deadhead';
            
            console.log(`Bus returning to route from ${bus.chargingStation} (${bus.returnDistance?.toFixed(1) || 'N/A'} mi)`);
        } else {
            // Charged at school, continue route
            bus.status = 'moving';
            bus.targetChargeKwh = null;
            bus.chargingRate = null;
            bus.chargingKwhPerHour = null;
            if (route) route.status = 'active';
        }
    }
}

/**
 * Handle bus returning from off-route charger back to route
 * Uses OSRM path (reversed deadhead path) for smooth animation
 */
function handleReturnFromCharger(bus, route, deltaTime) {
    const state = getState();
    
    if (!bus.returnDestination || !bus.returnDistance) {
        bus.status = 'moving';
        route.status = 'active';
        return;
    }
    
    const speedMph = SIMULATION_CONFIG.baseSpeedMph;
    const hoursElapsed = deltaTime / (3600 * 1000);
    const distanceToTravel = speedMph * hoursElapsed;
    
    bus.returnProgress = (bus.returnProgress || 0) + distanceToTravel;
    bus.distanceTraveled += distanceToTravel;
    
    // Energy consumption during return
    const efficiency = getEfficiency(bus.busType, state.weather);
    const energyUsed = distanceToTravel * efficiency * MIDDAY_CHARGING.energyCostDeadhead;
    bus.batteryKwh = Math.max(0, bus.batteryKwh - energyUsed);
    bus.batteryLevel = (bus.batteryKwh / bus.batteryCapacity) * 100;
    bus.energyConsumed += energyUsed;
    
    updateStats({
        totalDistance: state.stats.totalDistance + distanceToTravel,
        totalEnergyConsumed: state.stats.totalEnergyConsumed + energyUsed
    });
    
    // Check if bus ran out of battery during return
    if (bus.batteryKwh <= 0) {
        bus.status = 'stranded';
        route.status = 'failed';
        triggerGameOver('stranded');
        return;
    }
    
    // Interpolate position along return path
    const progress = Math.min(1, bus.returnProgress / bus.returnDistance);
    
    if (bus.returnPath && bus.returnPath.length > 1) {
        // Use OSRM return path for smooth interpolation
        bus.position = interpolatePosition(bus.returnPath, progress);
    } else {
        // Fallback to linear interpolation
        const startPos = bus.chargerDestination || bus.position;
        const endPos = bus.returnDestination;
        
        if (startPos && endPos) {
            bus.position = [
                startPos[0] + (endPos[0] - startPos[0]) * progress,
                startPos[1] + (endPos[1] - startPos[1]) * progress
            ];
        }
    }
    
    // Check if arrived back at route
    if (bus.returnProgress >= bus.returnDistance) {
        bus.position = [...bus.returnDestination];
        bus.status = 'moving';
        route.status = 'active';
        
        // Clean up all deadhead/return state
        bus.chargerDestination = null;
        bus.deadheadProgress = null;
        bus.deadheadDistance = null;
        bus.deadheadStartPosition = null;
        bus.deadheadPath = null;
        bus.originalPosition = null;
        bus.returnDestination = null;
        bus.returnDistance = null;
        bus.returnProgress = null;
        bus.returnPath = null;
        bus.needsReturnTrip = false;
        bus.targetChargeKwh = null;
        bus.chargingRate = null;
        bus.chargingKwhPerHour = null;
        
        console.log(`Bus returned to route @ ${state.simulation.timeString}, resuming PM trip at ${bus.batteryLevel.toFixed(0)}%`);
    }
}

/**
 * Complete route
 */
function completeRoute(bus, route) {
    bus.status = 'completed';
    route.status = 'completed';
    bus.progress = 1;
    
    const state = getState();
    state.stats.completedRoutes++;
    
    route.stops.forEach(stop => stop.completed = true);
}

/**
 * Calculate final score
 */
function calculateFinalScore() {
    const state = getState();
    const pattern = WEATHER_PATTERNS[state.config.weatherPattern] || WEATHER_PATTERNS.fall;
    
    // Check for perfect route prediction
    const efficiency = getEfficiency(state.config.busType, 'extreme');
    const usableCapacity = state.config.batteryCapacity * (1 - BATTERY_CONFIG.safetyBuffer);
    const optimalOneWay = Math.floor((usableCapacity / efficiency) / 2);
    
    if (Math.abs(state.config.guessDistance - optimalOneWay) <= 3) {
        addBonus({ reason: 'Perfect route prediction', points: SCORING.perfectRoutePrediction });
    }
    
    // Check for perfect week (no mid-day charges)
    if (state.week.totalMidDayCharges === 0) {
        addBonus({ reason: 'Perfect week - no mid-day charges', points: SCORING.perfectWeekBonus });
    }
    
    // Apply difficulty multiplier
    const multiplier = SCORING.difficultyMultiplier[pattern.difficulty] || 1;
    if (multiplier !== 1) {
        const bonusFromDifficulty = Math.round(state.score.total * (multiplier - 1));
        if (bonusFromDifficulty > 0) {
            addBonus({ reason: `${pattern.difficulty} difficulty bonus`, points: bonusFromDifficulty });
        }
    }
    
    updateScoreDisplay();
}

/**
 * Show week result modal
 */
function showWeekResult() {
    const state = getState();
    const modal = document.getElementById('completion-modal');
    const header = document.getElementById('modal-header');
    const icon = document.getElementById('result-icon');
    const title = document.getElementById('result-title');
    const summary = document.getElementById('result-summary');
    const finalScore = document.getElementById('final-score');
    const leaderboardEntry = document.getElementById('leaderboard-entry');
    
    const totalCharges = state.week.totalMidDayCharges;
    const isWin = totalCharges === 0;
    const pattern = WEATHER_PATTERNS[state.config.weatherPattern] || WEATHER_PATTERNS.fall;
    
    // Calculate totals
    let totalDistance = 0;
    let totalElectricCost = state.week.totalOvernightCost;
    
    state.week.dayResults.forEach(day => {
        totalDistance += day.distance;
        totalElectricCost += day.cost;
    });
    
    // Calculate diesel equivalent
    const mpg = state.config.busType === 'A' ? DIESEL_MPG.typeA : DIESEL_MPG.typeC;
    const dieselCost = (totalDistance / mpg) * FUEL_COSTS.diesel.pricePerGallon;
    
    if (isWin) {
        header.classList.add('win');
        header.classList.remove('lose');
        icon.textContent = '🏆';
        title.textContent = 'Perfect Week!';
    } else {
        header.classList.add('lose');
        header.classList.remove('win');
        icon.textContent = '⚡';
        title.textContent = 'Challenge Complete!';
    }
    
    // Display final score
    finalScore.textContent = state.score.total.toLocaleString();
    
    // Generate day breakdown
    const dayRows = state.week.dayResults.map(day => {
        const dayInfo = state.week.schedule.find(d => d.day === day.day);
        const dayScore = state.score.dayScores.find(s => s.day === day.day);
        return `
            <div class="result-row ${day.midDayCharged ? 'penalty' : 'success'}">
                <span>${dayInfo?.name || 'Day'} ${dayInfo?.icon || ''}</span>
                <span>${day.midDayCharged ? '⚡ Charged' : '✓ OK'}</span>
                <span class="day-points">${dayScore ? '+' + dayScore.points : ''}</span>
            </div>
        `;
    }).join('');
    
    // Calculate optimal distance
    const efficiency = getEfficiency(state.config.busType, 'extreme');
    const usableCapacity = state.config.batteryCapacity * (1 - BATTERY_CONFIG.safetyBuffer);
    const optimalOneWay = Math.floor((usableCapacity / efficiency) / 2);
    
    // Score breakdown
    const bonusRows = state.score.bonuses.map(b => `
        <div class="result-row bonus">
            <span>🌟 ${b.reason}</span>
            <span>+${b.points}</span>
        </div>
    `).join('');
    
    summary.innerHTML = `
        <div class="result-row">
            <span>Weather Challenge</span>
            <span>${pattern.icon} ${pattern.name}</span>
        </div>
        <div class="result-row">
            <span>Your Route Distance</span>
            <span>${state.config.guessDistance} mi one-way</span>
        </div>
        <div class="result-row ${Math.abs(state.config.guessDistance - optimalOneWay) <= 3 ? 'success' : ''}">
            <span>Optimal Distance</span>
            <span>${optimalOneWay} mi one-way</span>
        </div>
        
        <div style="font-weight: 500; margin: 1rem 0 0.5rem; color: #a0a8b3; font-size: 0.85rem;">Daily Results:</div>
        ${dayRows}
        
        ${bonusRows}
        
        <div class="result-row">
            <span>Week Electric Cost</span>
            <span>$${totalElectricCost.toFixed(2)}</span>
        </div>
        <div class="result-row">
            <span>Diesel Would Cost</span>
            <span>$${dieselCost.toFixed(2)}</span>
        </div>
        
        ${generateAnnualProjections(state, totalDistance, totalElectricCost, dieselCost)}
    `;
    
    // Save to leaderboard
    const perfectDays = state.week.dayResults.filter(d => !d.midDayCharged).length;
    const leaderboard = saveToLeaderboard({
        name: state.player.name,
        score: state.score.total,
        weatherPattern: state.config.weatherPattern,
        routeDistance: state.config.guessDistance,
        midDayCharges: totalCharges,
        perfectDays
    });
    
    // Check leaderboard position
    const position = leaderboard.findIndex(e => e.score === state.score.total && e.name === state.player.name) + 1;
    
    if (position <= 10) {
        leaderboardEntry.classList.remove('hidden');
        document.getElementById('leaderboard-position').textContent = `#${position}`;
    } else {
        leaderboardEntry.classList.add('hidden');
    }
    
    modal.classList.remove('hidden');
    
    document.getElementById('modal-close').onclick = () => modal.classList.add('hidden');
    document.getElementById('modal-restart').onclick = () => location.reload();
}

/**
 * Generate annual projections HTML
 */
function generateAnnualProjections(state, weekDistance, weekElectricCost, weekDieselCost) {
    const schoolDays = V2G_CONFIG.schoolDaysPerYear;
    const gameDays = 3; // Our game is 3 days
    const multiplier = schoolDays / gameDays;
    
    // Annual projections
    const annualDistance = weekDistance * multiplier;
    const annualElectricCost = weekElectricCost * multiplier;
    const annualDieselCost = weekDieselCost * multiplier;
    
    // V2G earnings - use week totals (accumulated across all days)
    const weekV2GEarnings = state.week.totalV2GEarnings || 0;
    const annualV2GEarnings = weekV2GEarnings * multiplier;
    
    // Net electric cost after V2G
    const annualNetElectric = Math.max(0, annualElectricCost - annualV2GEarnings);
    
    // Total savings
    const annualSavings = annualDieselCost - annualNetElectric;
    
    // CO2 avoided
    const weekCO2 = state.stats.co2Avoided || 0;
    const annualCO2 = weekCO2 * multiplier;
    
    return `
        <div class="annual-projections">
            <h4>📊 Annual Projections (${schoolDays} School Days)</h4>
            <div class="projection-grid">
                <div class="projection-card electric">
                    <div class="projection-label">Electric Bus</div>
                    <div class="projection-type">⚡ ESB</div>
                    <div class="projection-row">
                        <span>Charging Cost</span>
                        <span>$${annualElectricCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                    </div>
                    <div class="projection-row v2g">
                        <span>V2G Earnings</span>
                        <span>-$${annualV2GEarnings.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                    </div>
                    <div class="projection-row total">
                        <span>Net Cost</span>
                        <span>$${annualNetElectric.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                    </div>
                </div>
                
                <div class="projection-card diesel">
                    <div class="projection-label">Diesel Bus</div>
                    <div class="projection-type">⛽ Diesel</div>
                    <div class="projection-row">
                        <span>Fuel Cost</span>
                        <span>$${annualDieselCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                    </div>
                    <div class="projection-row">
                        <span>V2G Opportunity</span>
                        <span>$0</span>
                    </div>
                    <div class="projection-row total">
                        <span>Total Cost</span>
                        <span>$${annualDieselCost.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                    </div>
                </div>
                
                <div class="projection-savings">
                    <div class="projection-savings-label">Annual Savings with Electric</div>
                    <div class="projection-savings-value">$${annualSavings.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</div>
                    <div class="projection-savings-note">🌍 ${Math.round(annualCO2).toLocaleString()} lbs CO₂ avoided</div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Trigger game over when bus runs out of battery
 */
function triggerGameOver(reason) {
    stopSimulation();
    
    const state = getState();
    const modal = document.getElementById('completion-modal');
    const header = document.getElementById('modal-header');
    const icon = document.getElementById('result-icon');
    const title = document.getElementById('result-title');
    const summary = document.getElementById('result-summary');
    const finalScore = document.getElementById('final-score');
    const leaderboardEntry = document.getElementById('leaderboard-entry');
    
    // Set lose state
    header.classList.add('lose');
    header.classList.remove('win');
    icon.textContent = '💀';
    title.textContent = 'Bus Stranded!';
    
    finalScore.textContent = '0';
    
    const pattern = WEATHER_PATTERNS[state.config.weatherPattern] || WEATHER_PATTERNS.fall;
    
    summary.innerHTML = `
        <div class="result-row penalty">
            <span>⚠️ Game Over</span>
            <span>Bus ran out of battery!</span>
        </div>
        <div class="result-row">
            <span>Day</span>
            <span>${state.week.currentDay} of 3</span>
        </div>
        <div class="result-row">
            <span>Weather</span>
            <span>${pattern.schedule[state.week.currentDay - 1]?.icon || ''} ${WEATHER_INFO[state.weather]?.name || state.weather}</span>
        </div>
        <div class="result-row">
            <span>Your Route Distance</span>
            <span>${state.config.guessDistance} mi one-way</span>
        </div>
        <div style="margin-top: 1rem; padding: 1rem; background: rgba(232, 101, 101, 0.1); border-radius: 8px; text-align: center;">
            <p style="color: #e86565; font-weight: 600;">💡 Tip: Choose shorter routes or charge more overnight to avoid running out of battery!</p>
        </div>
    `;
    
    leaderboardEntry.classList.add('hidden');
    modal.classList.remove('hidden');
    
    document.getElementById('modal-close').onclick = () => modal.classList.add('hidden');
    document.getElementById('modal-restart').onclick = () => location.reload();
}

/**
 * Calculate electric cost (net of V2G earnings)
 */
export function calculateElectricCost() {
    const state = getState();
    const baseEnergy = state.stats.totalEnergyConsumed - (state.stats.midDayChargingKwh || 0);
    const baseCost = baseEnergy * FUEL_COSTS.electric.overnight;
    const chargingCost = baseCost + (state.stats.midDayChargingCost || 0);
    const v2gEarnings = state.stats.v2gEarnings || 0;
    
    // Net cost = charging cost minus V2G earnings
    return Math.max(0, chargingCost - v2gEarnings);
}

/**
 * Calculate electric cost breakdown (for annual projections)
 */
export function calculateElectricCostBreakdown() {
    const state = getState();
    const baseEnergy = state.stats.totalEnergyConsumed - (state.stats.midDayChargingKwh || 0);
    const baseCost = baseEnergy * FUEL_COSTS.electric.overnight;
    const chargingCost = baseCost + (state.stats.midDayChargingCost || 0);
    const v2gEarnings = state.stats.v2gEarnings || 0;
    
    return {
        chargingCost,
        v2gEarnings,
        netCost: Math.max(0, chargingCost - v2gEarnings),
        totalDistance: state.stats.totalDistance || 0,
        v2gKwh: state.stats.v2gKwhDischarged || 0
    };
}

/**
 * Calculate diesel cost
 */
export function calculateDieselCost() {
    const state = getState();
    let totalGallons = 0;
    
    state.buses.forEach(bus => {
        const mpg = bus.busType === 'A' ? DIESEL_MPG.typeA : DIESEL_MPG.typeC;
        totalGallons += bus.distanceTraveled / mpg;
    });
    
    return totalGallons * FUEL_COSTS.diesel.pricePerGallon;
}
