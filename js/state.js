// ESB Fleet Planner - Application State

import { BATTERY_CONFIG, WEATHER_PATTERNS, SCORING, LEADERBOARD_CONFIG } from './config.js';

// Global application state
const state = {
    // Map instance
    map: null,
    
    // Player info
    player: {
        name: 'Player',
        sessionId: Date.now().toString(36)
    },
    
    // User configuration
    config: {
        city: null,
        cityCoords: null,
        busType: 'A',
        batteryCapacity: BATTERY_CONFIG.defaultCapacity,
        guessDistance: 25, // One-way distance guess
        adjustedRouteDistance: null, // Adjusted route distance (if changed during game)
        weatherPattern: 'fall' // Selected weather pattern key
    },
    
    // Week simulation state
    week: {
        currentDay: 1,
        schedule: [...WEATHER_PATTERNS.fall.schedule],
        dayResults: [], // Track results per day
        totalMidDayCharges: 0,
        totalMidDayCost: 0,
        totalOvernightCost: 0,
        totalV2GEarnings: 0,     // Cumulative V2G earnings
        totalV2GKwh: 0          // Cumulative V2G kWh discharged
    },
    
    // Current day's weather
    weather: 'fair',
    
    // Nightly charging decisions (player guesses each night)
    nightlyCharging: {
        decisions: [], // { day, targetPercent, actualPercent, energyCharged, cost }
        pendingDecision: null // Show modal for next night's charge
    },
    
    // Route (just 1 now)
    routes: [],
    
    // Bus state
    buses: [],
    
    // Charging stations (off-route public chargers)
    chargingStations: [],
    
    // Simulation state
    simulation: {
        running: false,
        paused: false,
        startTime: null,
        elapsedTime: 0,
        speedMultiplier: 1,
        lastUpdate: null,
        tripPhase: 'am', // 'am', 'midday', or 'pm'
        currentTime: 5.0, // Current simulated hour (5.0 = 5:00 AM)
        timeString: '5:00 AM', // Human-readable time
        // HVAC dial state
        hvacLevel: 3,        // 1-5 dial position (1=cold/eco, 5=hot/comfort)
        hvacLevelSamples: [],// Samples for scoring average
        // Regen braking state
        regenEventActive: false,
        regenEventStop: null,
        regenEventStartTime: null,
        regenSuccessCount: 0,
        regenPerfectCount: 0,
        regenEnergyRecovered: 0,
        // Weather shift state
        weatherShifted: false,
        originalWeather: null,
        shiftedWeather: null
    },
    
    // Daily statistics
    stats: {
        totalDistance: 0,
        totalEnergyConsumed: 0,
        totalDieselEquivalent: 0,
        electricCost: 0,
        dieselCost: 0,
        midDayCharges: 0,
        midDayChargingCost: 0,
        midDayChargingKwh: 0,
        deadheadMiles: 0,
        completedRoutes: 0
    },
    
    // Scoring
    score: {
        total: 0,
        dayScores: [], // { day, points, breakdown }
        bonuses: [],
        penalties: []
    },
    
    // Pending charging selection
    pendingCharge: null,
    
    // UI state
    ui: {
        selectedRoute: null,
        adjustedDistance: null, // For mid-game adjustments
        showNightlyChargingModal: false
    }
};

// State accessors
export function getState() {
    return state;
}

export function updateConfig(updates) {
    Object.assign(state.config, updates);
}

export function setWeather(weather) {
    state.weather = weather;
}

export function setMap(map) {
    state.map = map;
}

export function setRoutes(routes) {
    state.routes = routes;
}

export function setBuses(buses) {
    state.buses = buses;
}

export function setChargingStations(stations) {
    state.chargingStations = stations;
}

export function updateSimulation(updates) {
    Object.assign(state.simulation, updates);
}

export function updateStats(updates) {
    Object.assign(state.stats, updates);
}

export function updateWeek(updates) {
    Object.assign(state.week, updates);
}

export function updateUI(updates) {
    Object.assign(state.ui, updates);
}

export function updatePlayer(updates) {
    Object.assign(state.player, updates);
}

export function updateScore(updates) {
    Object.assign(state.score, updates);
}

export function addDayScore(dayScore) {
    state.score.dayScores.push(dayScore);
    state.score.total += dayScore.points;
}

export function addBonus(bonus) {
    state.score.bonuses.push(bonus);
    state.score.total += bonus.points;
}

export function addPenalty(penalty) {
    state.score.penalties.push(penalty);
    state.score.total += penalty.points; // penalty.points should be negative
}

// Record nightly charging decision
export function recordNightlyCharging(decision) {
    state.nightlyCharging.decisions.push(decision);
    state.week.totalOvernightCost += decision.cost;
}

export function advanceDay() {
    const currentDay = state.week.currentDay;
    
    // Save day result
    state.week.dayResults.push({
        day: currentDay,
        weather: state.weather,
        midDayCharged: state.stats.midDayCharges > 0,
        cost: state.stats.electricCost,
        distance: state.stats.totalDistance,
        energyConsumed: state.stats.totalEnergyConsumed
    });
    
    // Accumulate weekly totals
    state.week.totalMidDayCharges += state.stats.midDayCharges;
    state.week.totalMidDayCost += state.stats.midDayChargingCost || 0;
    
    // Move to next day
    state.week.currentDay++;
    
    // Set weather for new day
    const nextDaySchedule = state.week.schedule.find(d => d.day === state.week.currentDay);
    if (nextDaySchedule) {
        state.weather = nextDaySchedule.weather;
    }
    
    return state.week.currentDay <= 3;
}

export function resetStats() {
    state.stats = {
        totalDistance: 0,
        totalEnergyConsumed: 0,
        totalDieselEquivalent: 0,
        electricCost: 0,
        dieselCost: 0,
        midDayCharges: 0,
        midDayChargingCost: 0,
        midDayChargingKwh: 0,
        nightlyChargingKwh: 0,
        nightlyChargingCost: 0,
        deadheadMiles: 0,
        completedRoutes: 0,
        co2Avoided: 0,       // Pounds of CO2 avoided
        pickupsCompleted: 0, // Number of student pickups
        v2gEarnings: 0,      // Total V2G earnings ($)
        v2gKwhDischarged: 0  // Total kWh discharged to grid
    };
}

export function resetSimulation() {
    state.simulation = {
        running: false,
        paused: false,
        startTime: null,
        elapsedTime: 0,
        speedMultiplier: 1,
        lastUpdate: null,
        tripPhase: 'am',
        currentTime: 5.0,
        timeString: '5:00 AM',
        // HVAC dial state
        hvacLevel: 3,
        hvacLevelSamples: [],
        // Regen braking state
        regenEventActive: false,
        regenEventStop: null,
        regenEventStartTime: null,
        regenSuccessCount: 0,
        regenPerfectCount: 0,
        regenEnergyRecovered: 0,
        // Weather shift state
        weatherShifted: false,
        originalWeather: null,
        shiftedWeather: null
    };
}

export function resetWeek() {
    const pattern = WEATHER_PATTERNS[state.config.weatherPattern] || WEATHER_PATTERNS.fall;
    state.week = {
        currentDay: 1,
        schedule: [...pattern.schedule],
        dayResults: [],
        totalMidDayCharges: 0,
        totalMidDayCost: 0,
        totalOvernightCost: 0,
        totalV2GEarnings: 0,
        totalV2GKwh: 0
    };
    state.weather = pattern.schedule[0].weather;
    
    // Reset scoring
    state.score = {
        total: 0,
        dayScores: [],
        bonuses: [],
        penalties: []
    };
    
    // Reset nightly charging
    state.nightlyCharging = {
        decisions: [],
        pendingDecision: null
    };
    
    // Clear any pending charge selections
    state.pendingCharge = null;
}

export function setPendingCharge(chargeData) {
    state.pendingCharge = chargeData;
}

export function clearPendingCharge() {
    state.pendingCharge = null;
}

// Leaderboard functions
export function getLeaderboard() {
    try {
        const data = localStorage.getItem(LEADERBOARD_CONFIG.storageKey);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

export function saveToLeaderboard(entry) {
    const leaderboard = getLeaderboard();
    
    leaderboard.push({
        name: entry.name,
        score: entry.score,
        weatherPattern: entry.weatherPattern,
        routeDistance: entry.routeDistance,
        midDayCharges: entry.midDayCharges,
        perfectDays: entry.perfectDays,
        date: new Date().toISOString()
    });
    
    // Sort by score descending and keep top entries
    leaderboard.sort((a, b) => b.score - a.score);
    const topEntries = leaderboard.slice(0, LEADERBOARD_CONFIG.maxEntries);
    
    try {
        localStorage.setItem(LEADERBOARD_CONFIG.storageKey, JSON.stringify(topEntries));
    } catch (e) {
        console.error('Failed to save leaderboard:', e);
    }
    
    return topEntries;
}

export function clearLeaderboard() {
    localStorage.removeItem(LEADERBOARD_CONFIG.storageKey);
}

// Debugging
if (typeof window !== 'undefined') {
    window.__ESB_STATE = state;
}

export default state;
