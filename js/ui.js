// ESB Fleet Planner - UI Module

import { getState, updateUI as updateUIState, getLeaderboard, updatePlayer } from './state.js';
import { MAPBOX_TOKEN, ESB_EFFICIENCY, FUEL_COSTS, DIESEL_MPG, BATTERY_CONFIG, WEATHER_PATTERNS, WEATHER_INFO, SCORING, V2G_CONFIG } from './config.js';
import { formatCurrency, debounce } from './utils.js';
import { calculateElectricCost, calculateDieselCost, confirmCharging, confirmNightlyCharging, getEfficiency } from './simulation.js';

/**
 * Initialize splash screen
 */
export function initSplashUI() {
    setupPlayerName();
    setupCitySearch();
    setupWeatherPatternSelection();
    setupScenarioConfig();
    setupGuessSlider();
    displayLeaderboard();
    updateOptimalHint();
}

/**
 * Setup player name input
 */
function setupPlayerName() {
    const playerInput = document.getElementById('player-name');
    const state = getState();
    
    playerInput.addEventListener('input', (e) => {
        const name = e.target.value.trim() || 'Player';
        updatePlayer({ name });
    });
}

/**
 * Setup city search
 */
function setupCitySearch() {
    const searchInput = document.getElementById('city-search');
    const suggestionsContainer = document.getElementById('city-suggestions');
    const selectedCityDisplay = document.getElementById('selected-city-display');
    const startBtn = document.getElementById('start-simulation');
    
    const searchCities = debounce(async (query) => {
        if (query.length < 2) {
            suggestionsContainer.classList.remove('active');
            return;
        }
        
        try {
            const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?` +
                `access_token=${MAPBOX_TOKEN}` +
                `&types=place` +
                `&country=US` +
                `&bbox=-79.763,40.496,-71.856,45.015` +
                `&limit=5`;
            
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.features && data.features.length > 0) {
                suggestionsContainer.innerHTML = data.features.map(place => `
                    <div class="suggestion-item" data-coords="${place.center.join(',')}" data-name="${place.place_name}">
                        <div class="city-name">${place.text}</div>
                        <div class="city-region">${place.place_name.replace(place.text + ', ', '')}</div>
                    </div>
                `).join('');
                
                suggestionsContainer.classList.add('active');
                
                suggestionsContainer.querySelectorAll('.suggestion-item').forEach(item => {
                    item.addEventListener('click', () => {
                        const coords = item.dataset.coords.split(',').map(Number);
                        const name = item.dataset.name;
                        
                        searchInput.value = '';
                        selectedCityDisplay.textContent = '📍 ' + name;
                        selectedCityDisplay.classList.add('active');
                        suggestionsContainer.classList.remove('active');
                        
                        const state = getState();
                        state.config.city = name;
                        state.config.cityCoords = coords;
                        
                        startBtn.disabled = false;
                        startBtn.querySelector('.btn-text').textContent = 'Start Challenge';
                    });
                });
            }
        } catch (error) {
            console.error('City search error:', error);
        }
    }, 300);
    
    searchInput.addEventListener('input', (e) => searchCities(e.target.value));
    
    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !suggestionsContainer.contains(e.target)) {
            suggestionsContainer.classList.remove('active');
        }
    });
}

/**
 * Setup weather pattern selection
 */
function setupWeatherPatternSelection() {
    const state = getState();
    const patternsContainer = document.getElementById('weather-patterns');
    
    patternsContainer.querySelectorAll('.weather-pattern-card').forEach(card => {
        card.addEventListener('click', () => {
            patternsContainer.querySelectorAll('.weather-pattern-card').forEach(c => c.classList.remove('selected'));
            card.classList.add('selected');
            state.config.weatherPattern = card.dataset.pattern;
            updateOptimalHint();
        });
    });
}

/**
 * Update optimal hint based on settings
 */
function updateOptimalHint() {
    const state = getState();
    const hint = document.getElementById('optimal-hint');
    if (!hint) return;
    
    const pattern = WEATHER_PATTERNS[state.config.weatherPattern] || WEATHER_PATTERNS.fall;
    
    // Find the worst weather in this pattern
    const worstWeather = pattern.schedule.reduce((worst, day) => {
        if (day.weather === 'extreme') return 'extreme';
        if (day.weather === 'cold' && worst !== 'extreme') return 'cold';
        return worst;
    }, 'fair');
    
    const efficiency = getEfficiency(state.config.busType, worstWeather);
    const usableCapacity = state.config.batteryCapacity * (1 - BATTERY_CONFIG.safetyBuffer);
    const maxOneWay = Math.floor((usableCapacity / efficiency) / 2);
    
    hint.innerHTML = `
        <div class="hint-box">
            <span class="hint-icon">💡</span>
            <span>With ${pattern.name}, worst weather is <strong>${WEATHER_INFO[worstWeather].name}</strong> (${efficiency} kWh/mi).
            Max safe one-way: <strong>~${maxOneWay} mi</strong></span>
        </div>
    `;
}

/**
 * Setup scenario configuration
 */
function setupScenarioConfig() {
    const state = getState();
    
    // Bus type pills
    document.querySelectorAll('.pill-btn[data-type]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pill-btn[data-type]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.config.busType = btn.dataset.type;
            
            // Set default battery capacity based on bus type
            // Type A: 100 kWh, Type C: 185 kWh
            const defaultCapacity = btn.dataset.type === 'A' ? 100 : 185;
            state.config.batteryCapacity = defaultCapacity;
            
            // Update battery slider and display
            const batterySlider = document.getElementById('battery-capacity');
            const batteryDisplay = document.getElementById('battery-display');
            if (batterySlider) {
                batterySlider.value = defaultCapacity;
                batteryDisplay.textContent = defaultCapacity + ' kWh';
            }
            
            updateOptimalHint();
        });
    });
    
    // Battery slider
    const batterySlider = document.getElementById('battery-capacity');
    const batteryDisplay = document.getElementById('battery-display');
    
    if (batterySlider) {
        batterySlider.addEventListener('input', () => {
            state.config.batteryCapacity = parseInt(batterySlider.value);
            batteryDisplay.textContent = batterySlider.value + ' kWh';
            updateOptimalHint();
        });
    }
}

/**
 * Setup guess slider
 */
function setupGuessSlider() {
    const state = getState();
    const guessSlider = document.getElementById('guess-distance');
    const guessValue = document.getElementById('guess-value');
    const calcOneWay = document.getElementById('calc-one-way');
    const calcTotal = document.getElementById('calc-total');
    
    if (!guessSlider) return;
    
    guessSlider.addEventListener('input', () => {
        const guess = parseInt(guessSlider.value);
        state.config.guessDistance = guess;
        
        guessValue.textContent = guess;
        calcOneWay.textContent = guess + ' mi';
        calcTotal.textContent = (guess * 2) + ' mi';
    });
    
    state.config.guessDistance = parseInt(guessSlider.value);
}

/**
 * Display leaderboard on splash screen
 */
function displayLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    
    const leaderboard = getLeaderboard();
    
    if (leaderboard.length === 0) {
        list.innerHTML = '<p class="no-scores">No scores yet. Be the first!</p>';
        return;
    }
    
    list.innerHTML = leaderboard.slice(0, 5).map((entry, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`;
        const pattern = WEATHER_PATTERNS[entry.weatherPattern];
        return `
            <div class="leaderboard-row">
                <span class="rank">${medal}</span>
                <span class="player-name">${entry.name}</span>
                <span class="pattern-icon">${pattern?.icon || '🍂'}</span>
                <span class="player-score">${entry.score.toLocaleString()}</span>
            </div>
        `;
    }).join('');
}

/**
 * Initialize main app UI
 */
export function initAppUI() {
    const state = getState();
    
    // Set header info
    document.getElementById('header-city').textContent = state.config.city?.split(',')[0] || '';
    document.getElementById('display-guess').textContent = state.config.guessDistance + ' mi';
    
    // Build week progress
    buildWeekProgress();
    
    // Update day stats
    updateDayStats();
    updateScoreDisplay();
    
    // Setup control buttons
    setupControlButtons();
}

/**
 * Build week progress display
 */
function buildWeekProgress() {
    const state = getState();
    const container = document.getElementById('week-progress');
    if (!container) return;
    
    container.innerHTML = `
        <div class="week-row">
            ${state.week.schedule.map(day => `
                <div class="day-box ${day.day === state.week.currentDay ? 'current' : ''}" data-day="${day.day}">
                    <span class="day-name">${day.name}</span>
                    <span class="day-icon">${day.icon}</span>
                </div>
            `).join('')}
        </div>
    `;
}

/**
 * Update day stats display
 */
export function updateDayStats() {
    const state = getState();
    const daySchedule = state.week.schedule.find(d => d.day === state.week.currentDay) || state.week.schedule[0];
    
    // Header
    document.getElementById('current-day').textContent = state.week.currentDay;
    document.getElementById('day-weather').textContent = daySchedule.icon;
    
    // Stats panel
    const weatherInfo = WEATHER_INFO[daySchedule.weather];
    document.getElementById('stat-weather').textContent = `${weatherInfo.icon} ${weatherInfo.name}`;
    
    const efficiency = ESB_EFFICIENCY[state.config.busType === 'C' ? 'typeC' : 'typeA'][daySchedule.weather];
    document.getElementById('stat-efficiency').textContent = efficiency.toFixed(2) + ' kWh/mi';
    document.getElementById('stat-battery').textContent = state.config.batteryCapacity + ' kWh';
    
    const usableCapacity = state.config.batteryCapacity * (1 - BATTERY_CONFIG.safetyBuffer);
    const maxRange = usableCapacity / efficiency;
    document.getElementById('stat-range').textContent = Math.round(maxRange) + ' mi';
    document.getElementById('stat-route').textContent = (state.config.guessDistance * 2) + ' mi';
    
    // Diesel cost
    const dieselMpg = DIESEL_MPG[state.config.busType === 'C' ? 'typeC' : 'typeA'];
    const dieselCostPerMile = FUEL_COSTS.diesel.pricePerGallon / dieselMpg;
    document.getElementById('diesel-cost').textContent = '$' + dieselCostPerMile.toFixed(2) + '/mi';
}

/**
 * Update week progress display
 */
export function updateWeekProgress() {
    const state = getState();
    
    document.querySelectorAll('.day-box').forEach(box => {
        const dayNum = parseInt(box.dataset.day);
        const dayResult = state.week.dayResults.find(d => d.day === dayNum);
        
        box.classList.remove('current', 'completed', 'charged');
        
        if (dayNum === state.week.currentDay) {
            box.classList.add('current');
        } else if (dayResult) {
            box.classList.add('completed');
            if (dayResult.midDayCharged) {
                box.classList.add('charged');
            }
        }
    });
}

/**
 * Update score display
 */
export function updateScoreDisplay() {
    const state = getState();
    
    // Header score
    const scoreEl = document.getElementById('current-score');
    if (scoreEl) scoreEl.textContent = state.score.total.toLocaleString();
    
    // Score breakdown
    const breakdown = document.getElementById('score-breakdown');
    if (!breakdown) return;
    
    const items = [];
    
    // Day scores
    state.score.dayScores.forEach(ds => {
        items.push(`<div class="score-item"><span>Day ${ds.day}</span><span>+${ds.points}</span></div>`);
    });
    
    // Bonuses
    state.score.bonuses.forEach(b => {
        items.push(`<div class="score-item bonus"><span>${b.reason}</span><span>+${b.points}</span></div>`);
    });
    
    // Penalties
    state.score.penalties.forEach(p => {
        items.push(`<div class="score-item penalty"><span>${p.reason}</span><span>${p.points}</span></div>`);
    });
    
    breakdown.innerHTML = items.length > 0 ? items.join('') : '<p class="no-scores">Start day to earn points</p>';
}

/**
 * Setup control buttons
 */
function setupControlButtons() {
    document.getElementById('btn-start').addEventListener('click', () => {
        if (window.startSimulation) window.startSimulation();
    });
    
    document.getElementById('btn-pause').addEventListener('click', () => {
        if (window.pauseSimulation) window.pauseSimulation();
    });
    
    document.getElementById('btn-reset').addEventListener('click', () => {
        location.reload();
    });
}

/**
 * Update route cards
 */
export function updateRouteCards() {
    const state = getState();
    const container = document.getElementById('routes-list');
    if (!container) return;
    
    container.innerHTML = state.routes.map(route => {
        const bus = state.buses.find(b => b.routeId === route.id);
        if (!bus) return '';
        
        const batteryClass = bus.batteryLevel > 50 ? '' : bus.batteryLevel > 25 ? 'warning' : 'danger';
        const statusText = bus.status.charAt(0).toUpperCase() + bus.status.slice(1);
        
        // Determine phase
        const phase = bus.tripPhase === 'pm' ? { text: '🌆 PM', class: 'pm' } : { text: '🌅 AM', class: 'am' };
        
        return `
            <div class="route-card ${state.ui.selectedRoute === route.id ? 'active' : ''}">
                <div class="route-header">
                    <span class="route-name">${route.name}</span>
                    <span class="route-type-badge">Type ${route.busType}</span>
                </div>
                <div class="route-stats">
                    <span>📍 ${(route.distance / 2).toFixed(1)} mi one-way</span>
                    <span class="route-phase ${phase.class}">${phase.text}</span>
                </div>
                <div class="battery-row">
                    <span class="battery-icon">🔋</span>
                    <div class="battery-bar">
                        <div class="battery-fill ${batteryClass}" style="width: ${bus.batteryLevel}%"></div>
                    </div>
                    <span class="battery-pct">${Math.round(bus.batteryLevel)}%</span>
                </div>
                <span class="route-status ${bus.status}">${statusText}</span>
            </div>
        `;
    }).join('');
}

/**
 * Update trip indicator with time
 */
function updateTripIndicator() {
    const state = getState();
    const indicator = document.getElementById('trip-indicator');
    const tripText = document.getElementById('trip-text');
    
    if (!indicator || !tripText) return;
    
    const phase = state.simulation.tripPhase;
    
    if (phase === 'pm') {
        indicator.classList.add('pm');
        indicator.classList.remove('midday');
        tripText.textContent = '🌆 PM Trip';
    } else if (phase === 'midday') {
        indicator.classList.add('midday');
        indicator.classList.remove('pm');
        tripText.textContent = '⏳ Mid-Day';
    } else {
        indicator.classList.remove('pm', 'midday');
        tripText.textContent = '🌅 AM Trip';
    }
}

/**
 * Update time display in header
 */
export function updateTimeDisplay() {
    const state = getState();
    
    // Update time in header
    const timeDisplay = document.getElementById('current-time');
    if (timeDisplay) {
        timeDisplay.textContent = state.simulation.timeString || '5:00 AM';
    }
    
    // Update trip indicator
    updateTripIndicator();
}

/**
 * Update fleet status
 */
export function updateFleetStatus() {
    const state = getState();
    updateTripIndicator();
}

/**
 * Update penalty tracker
 */
export function updatePenaltyTracker() {
    const state = getState();
    
    // Overnight charges
    const overnightCharges = document.getElementById('overnight-charges');
    const overnightCost = document.getElementById('overnight-cost');
    
    let totalOvernightKwh = 0;
    state.nightlyCharging.decisions.forEach(d => {
        totalOvernightKwh += d.energyCharged;
    });
    
    if (overnightCharges) overnightCharges.textContent = Math.round(totalOvernightKwh) + ' kWh';
    if (overnightCost) overnightCost.textContent = '$' + state.week.totalOvernightCost.toFixed(2);
    
    // Mid-day charges
    const middayCharges = document.getElementById('midday-charges');
    const middayCost = document.getElementById('midday-cost');
    
    const totalMidDayKwh = state.stats.midDayChargingKwh || 0;
    const totalMidDayCost = state.week.totalMidDayCost + (state.stats.midDayChargingCost || 0);
    
    if (middayCharges) middayCharges.textContent = Math.round(totalMidDayKwh) + ' kWh';
    if (middayCost) middayCost.textContent = '$' + totalMidDayCost.toFixed(2);
}

/**
 * Update cost display
 */
export function updateCostDisplay() {
    const electricCost = calculateElectricCost();
    const dieselCost = calculateDieselCost();
    
    const state = getState();
    const totalDistance = state.stats.totalDistance || 0;
    
    const electricCostPerMile = totalDistance > 0 ? electricCost / totalDistance : 0;
    const dieselCostPerMile = totalDistance > 0 ? dieselCost / totalDistance : 0;
    const savingsPerMile = dieselCostPerMile - electricCostPerMile;
    
    const evCostEl = document.getElementById('ev-cost');
    const savingsEl = document.getElementById('savings');
    
    if (evCostEl) evCostEl.textContent = '$' + electricCostPerMile.toFixed(2) + '/mi';
    if (savingsEl) savingsEl.textContent = '$' + Math.max(0, savingsPerMile).toFixed(2) + '/mi';
}

/**
 * Show nightly charging decision modal with route adjustment option
 * Now flows better: shows warning if route can't complete, then charge level, then route adjustment
 */
export function showNightlyChargingModal(nextDay, nextDaySchedule, currentBatteryPercent) {
    const state = getState();
    const modal = document.getElementById('nightly-charge-modal');
    
    // Update modal header
    document.getElementById('nightly-day-info').textContent = `Day ${nextDay} Planning`;
    document.getElementById('forecast-icon').textContent = nextDaySchedule.icon;
    document.getElementById('forecast-weather').textContent = WEATHER_INFO[nextDaySchedule.weather].name;
    
    const efficiency = ESB_EFFICIENCY[state.config.busType === 'C' ? 'typeC' : 'typeA'][nextDaySchedule.weather];
    document.getElementById('forecast-efficiency').textContent = efficiency.toFixed(2) + ' kWh/mi';
    
    document.getElementById('nightly-current-battery').textContent = Math.round(currentBatteryPercent) + '%';
    document.getElementById('nightly-battery-capacity').textContent = state.config.batteryCapacity + ' kWh';
    
    // Calculate max range at 100% charge
    const maxRangeAt100 = Math.floor(state.config.batteryCapacity / efficiency);
    document.getElementById('nightly-max-range').textContent = maxRangeAt100 + ' mi';
    
    const currentRouteDistance = state.config.adjustedRouteDistance || state.config.guessDistance;
    const currentRoundTrip = currentRouteDistance * 2;
    const energyNeeded = currentRoundTrip * efficiency;
    
    // Check if current route can complete on a single charge at 100%
    const canCompleteOnSingleCharge = energyNeeded <= state.config.batteryCapacity * 0.85; // 85% usable
    
    // Show/hide warning banner
    const warningBanner = document.getElementById('route-warning-banner');
    if (!canCompleteOnSingleCharge) {
        warningBanner.classList.remove('hidden');
    } else {
        warningBanner.classList.add('hidden');
    }
    
    const bus = state.buses[0];
    const currentKwh = bus ? bus.batteryKwh : state.config.batteryCapacity * 0.2;
    
    // V2G Setup
    const v2gSection = document.getElementById('v2g-section');
    const v2gToggle = document.getElementById('v2g-enabled');
    const v2gDetails = document.getElementById('v2g-details');
    const v2gDischargeKwh = document.getElementById('v2g-discharge-kwh');
    const v2gEarningsDisplay = document.getElementById('v2g-earnings');
    const v2gCurrentSoc = document.getElementById('v2g-current-soc');
    
    // Calculate V2G potential
    const minDischargeKwh = state.config.batteryCapacity * V2G_CONFIG.minDischargeLevel;
    const availableForV2G = Math.max(0, currentKwh - minDischargeKwh);
    const v2gEarnings = availableForV2G * V2G_CONFIG.dischargeRate;
    
    // Update V2G display
    if (v2gSection) {
        v2gDischargeKwh.textContent = Math.round(availableForV2G) + ' kWh';
        v2gEarningsDisplay.textContent = '+$' + v2gEarnings.toFixed(2);
        v2gCurrentSoc.textContent = Math.round(currentBatteryPercent) + '%';
        
        // Only show V2G if there's energy to discharge
        if (availableForV2G <= 5) {
            v2gSection.style.display = 'none';
        } else {
            v2gSection.style.display = 'block';
        }
        
        // Toggle handler
        v2gToggle.addEventListener('change', function() {
            if (this.checked) {
                v2gDetails.classList.remove('hidden');
            } else {
                v2gDetails.classList.add('hidden');
            }
        });
    }
    
    // Setup charge slider FIRST (Step 1)
    const slider = document.getElementById('nightly-charge-level');
    const percentDisplay = document.getElementById('nightly-charge-percent');
    const kwhDisplay = document.getElementById('nightly-charge-kwh');
    const costDisplay = document.getElementById('nightly-charge-cost');
    const usableRangeDisplay = document.getElementById('nightly-usable-range');
    
    // Set slider to suggested value
    const suggestedPercent = canCompleteOnSingleCharge 
        ? Math.min(100, Math.ceil((energyNeeded * 1.2 / state.config.batteryCapacity) * 100))
        : 100; // Suggest 100% if route is too long
    slider.value = Math.max(suggestedPercent, Math.round(currentBatteryPercent));
    
    // Setup route adjustment slider (Step 2)
    const routeSlider = document.getElementById('nightly-route-adjust');
    const routeValue = document.getElementById('nightly-route-new');
    const roundtripDisplay = document.getElementById('nightly-roundtrip');
    const adjustedEnergyDisplay = document.getElementById('nightly-adjusted-energy');
    const safetyIndicator = document.getElementById('route-safety-indicator');
    const safetyMarginDisplay = document.getElementById('nightly-safety-margin');
    const routeHint = document.getElementById('route-adjustment-hint');
    
    // Set initial value to current route distance
    routeSlider.value = currentRouteDistance;
    
    function updateChargeDisplay() {
        const targetPercent = parseInt(slider.value);
        const targetKwh = (targetPercent / 100) * state.config.batteryCapacity;
        const energyToAdd = Math.max(0, targetKwh - currentKwh);
        const cost = energyToAdd * FUEL_COSTS.electric.overnight;
        const usableRange = Math.floor(targetKwh / efficiency);
        
        percentDisplay.textContent = targetPercent + '%';
        kwhDisplay.textContent = '+' + Math.round(energyToAdd) + ' kWh';
        costDisplay.textContent = '$' + cost.toFixed(2);
        usableRangeDisplay.textContent = usableRange + ' mi';
        
        // Update route adjustment to recalculate margin
        updateRouteAdjustment();
    }
    
    function updateRouteAdjustment() {
        const newDistance = parseInt(routeSlider.value);
        const roundTrip = newDistance * 2;
        const adjustedEnergy = roundTrip * efficiency;
        
        routeValue.textContent = newDistance + ' mi';
        roundtripDisplay.textContent = roundTrip + ' mi';
        adjustedEnergyDisplay.textContent = '~' + Math.round(adjustedEnergy) + ' kWh';
        
        // Calculate safety margin based on charge slider value
        const targetPercent = parseInt(slider.value);
        const targetKwh = (targetPercent / 100) * state.config.batteryCapacity;
        const usableRange = Math.floor(targetKwh / efficiency);
        const safetyMargin = ((targetKwh - adjustedEnergy) / adjustedEnergy) * 100;
        
        safetyMarginDisplay.textContent = (safetyMargin >= 0 ? '+' : '') + Math.round(safetyMargin) + '%';
        
        // Update hint and styling based on whether route fits
        if (roundTrip > usableRange) {
            safetyIndicator.classList.add('danger');
            safetyIndicator.classList.remove('safe-margin');
            routeHint.textContent = '⚠️ Route exceeds usable range - mid-day charging required!';
            routeHint.classList.add('danger');
        } else if (safetyMargin < 15) {
            safetyIndicator.classList.remove('danger');
            safetyIndicator.classList.add('safe-margin');
            routeHint.textContent = '⚡ Tight margin - consider reducing route or increasing charge';
            routeHint.classList.remove('danger');
        } else {
            safetyIndicator.classList.remove('danger');
            safetyIndicator.classList.add('safe-margin');
            routeHint.textContent = '✓ Route fits within usable range';
            routeHint.classList.remove('danger');
        }
    }
    
    slider.addEventListener('input', updateChargeDisplay);
    routeSlider.addEventListener('input', updateRouteAdjustment);
    
    // Initial updates
    updateChargeDisplay();
    updateRouteAdjustment();
    
    // Confirm button
    document.getElementById('confirm-nightly-charge').onclick = () => {
        const targetPercent = parseInt(slider.value);
        const newRouteDistance = parseInt(routeSlider.value);
        
        // Get V2G decision
        const v2gEnabled = v2gToggle ? v2gToggle.checked : false;
        const v2gAmount = v2gEnabled ? availableForV2G : 0;
        const v2gEarned = v2gEnabled ? v2gEarnings : 0;
        
        // Save adjusted route distance
        state.config.adjustedRouteDistance = newRouteDistance;
        
        confirmNightlyCharging(targetPercent, newRouteDistance, v2gAmount, v2gEarned);
    };
    
    modal.classList.remove('hidden');
}

/**
 * Show charging station selection modal with improved options
 * Displays Level 2 and Level 3 options with deadhead penalties
 */
export function showChargingModal(bus, stations, energyNeeded) {
    const modal = document.getElementById('charging-modal');
    const batteryDisplay = document.getElementById('charging-battery');
    const neededDisplay = document.getElementById('charging-needed');
    const stationList = document.getElementById('station-list');
    
    batteryDisplay.textContent = Math.round(bus.batteryLevel) + '%';
    neededDisplay.textContent = '+' + Math.round(energyNeeded) + ' kWh';
    
    // Group stations by location type
    const schoolStations = stations.filter(s => s.locationType === 'school');
    const depotStations = stations.filter(s => s.locationType === 'depot');
    const publicStations = stations.filter(s => s.locationType === 'public');
    
    let html = '';
    
    // School options (on-route, no deadhead)
    if (schoolStations.length > 0) {
        html += `<div class="station-group">
            <div class="station-group-header">🏫 At School (No Deadhead)</div>
            ${renderStationOptions(schoolStations, energyNeeded, 0)}
        </div>`;
    } else {
        // No school charger available
        html += `<div class="station-group no-charger">
            <div class="station-group-header">🏫 School</div>
            <div class="no-charger-warning">⚠️ No charger available at this school</div>
        </div>`;
    }
    
    // Depot options (requires deadhead back to depot)
    if (depotStations.length > 0) {
        html += `<div class="station-group">
            <div class="station-group-header">🏠 Return to Depot (Deadhead Required)</div>
            ${renderStationOptions(depotStations, energyNeeded, 1)}
        </div>`;
    }
    
    // Public options (off-route detour)
    if (publicStations.length > 0) {
        html += `<div class="station-group">
            <div class="station-group-header">⚡ Public Chargers (Detour Required)</div>
            ${renderStationOptions(publicStations, energyNeeded, schoolStations.length + depotStations.length)}
        </div>`;
    }
    
    stationList.innerHTML = html;
    
    // Station selection
    let selectedStation = stations[0];
    
    stationList.querySelectorAll('.station-option').forEach(option => {
        option.addEventListener('click', () => {
            stationList.querySelectorAll('.station-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            selectedStation = stations.find(s => s.id === option.dataset.stationId);
        });
    });
    
    // Confirm button
    document.getElementById('confirm-charging').onclick = () => {
        if (selectedStation) {
            confirmCharging(selectedStation.id, selectedStation);
        }
    };
    
    modal.classList.remove('hidden');
}

/**
 * Render station options with all details
 */
function renderStationOptions(stations, energyNeeded, startIndex) {
    return stations.map((station, index) => {
        const energyCost = energyNeeded * station.rate;
        const chargeTime = Math.ceil(energyNeeded / station.kwhPerHour * 60);
        const hasDeadhead = station.deadheadMiles > 0;
        
        // Calculate deadhead penalty points
        const deadheadPenalty = hasDeadhead ? Math.round(station.deadheadMiles * 5) : 0;
        
        // Charger type badge class
        const chargerClass = station.chargerLevel === 'level3' ? 'level3' : 'level2';
        
        return `
            <div class="station-option ${startIndex + index === 0 ? 'selected' : ''} ${hasDeadhead ? 'has-deadhead' : ''}" 
                 data-station-id="${station.id}">
                <span class="station-icon">${station.icon}</span>
                <div class="station-info">
                    <div class="station-name">
                        ${station.name}
                        <span class="station-charger-type ${chargerClass}">${station.chargerType}</span>
                    </div>
                    <div class="station-detail">~${chargeTime} min charge time</div>
                    ${hasDeadhead ? `
                        <div class="station-detail deadhead">
                            ⚠️ ${station.deadheadMiles.toFixed(1)} mi deadhead (-${deadheadPenalty} pts)
                        </div>
                    ` : '<div class="station-detail">✓ On-route, no extra travel</div>'}
                </div>
                <div class="station-costs">
                    <span class="station-energy-cost">$${energyCost.toFixed(2)}</span>
                    ${hasDeadhead ? `<span class="station-total-penalty">-${deadheadPenalty} pts</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Main UI update
 */
export function updateUI() {
    updateFleetStatus();
    updateRouteCards();
    updatePenaltyTracker();
    updateCostDisplay();
    updateCO2Display();
}

/**
 * Update CO2 emissions avoided display
 */
export function updateCO2Display() {
    const state = getState();
    
    const co2Element = document.getElementById('co2-avoided');
    const pickupsElement = document.getElementById('pickups-completed');
    
    if (co2Element) {
        const co2 = state.stats.co2Avoided || 0;
        co2Element.textContent = co2.toFixed(1);
        
        // Add pulse animation when value changes
        co2Element.classList.add('pulse');
        setTimeout(() => co2Element.classList.remove('pulse'), 300);
    }
    
    if (pickupsElement) {
        pickupsElement.textContent = state.stats.pickupsCompleted || 0;
    }
}
