// ESB Fleet Planner - Admin Panel

import { ESB_EFFICIENCY, FUEL_COSTS, DIESEL_MPG, BATTERY_CONFIG, SIMULATION_CONFIG, SCORING, CHARGING_STATIONS, MIDDAY_CHARGING, ROUTE_CONFIG, V2G_CONFIG } from './config.js';

const ADMIN_PASSWORD = 'H3lpCr3w!';
const ADMIN_SETTINGS_KEY = 'esb_admin_settings';

// Default values (from config.js)
const DEFAULT_SETTINGS = {
    efficiency: {
        typeA: { fair: 1.3, cold: 1.6, extreme: 1.9 },
        typeC: { fair: 1.95, cold: 2.4, extreme: 2.85 }
    },
    battery: {
        typeA: 100,
        typeC: 185,
        min: 80,
        max: 220
    },
    fuelCosts: {
        overnight: 0.18,
        daytime: 0.36,
        diesel: 3.00
    },
    dieselMpg: {
        typeA: 9,
        typeC: 6
    },
    scoring: {
        dayCompleted: 100,
        noMidDayCharge: 150,
        midDayPenalty: -50,
        efficientCharge: 75,
        deadheadPenalty: 5
    },
    charging: {
        level2: 13,
        level3: 50
    },
    simulation: {
        dayDuration: 15,
        baseSpeed: 25,
        schoolChargerChance: 50,
        circuityFactor: 2.2
    },
    v2g: {
        rate: 0.30,
        minLevel: 20,
        schoolDaysPerYear: 180
    }
};

let isAuthenticated = false;

/**
 * Initialize admin panel
 */
export function initAdminPanel() {
    const trigger = document.getElementById('admin-trigger');
    const panel = document.getElementById('admin-panel');
    const loginBtn = document.getElementById('admin-login-btn');
    const passwordInput = document.getElementById('admin-password');
    const closeBtn = document.getElementById('admin-close');
    const logoutBtn = document.getElementById('admin-logout');
    const saveBtn = document.getElementById('admin-save');
    const resetBtn = document.getElementById('admin-reset');
    const clearLeaderboardBtn = document.getElementById('admin-clear-leaderboard');
    
    if (!trigger || !panel) return;
    
    // Open admin panel
    trigger.addEventListener('click', () => {
        panel.classList.remove('hidden');
        if (isAuthenticated) {
            showSettings();
        } else {
            showLogin();
        }
    });
    
    // Close panel
    closeBtn?.addEventListener('click', closePanel);
    logoutBtn?.addEventListener('click', () => {
        isAuthenticated = false;
        closePanel();
    });
    
    // Login
    loginBtn?.addEventListener('click', attemptLogin);
    passwordInput?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') attemptLogin();
    });
    
    // Save settings
    saveBtn?.addEventListener('click', saveSettings);
    
    // Reset to defaults
    resetBtn?.addEventListener('click', () => {
        if (confirm('Reset all settings to default values?')) {
            localStorage.removeItem(ADMIN_SETTINGS_KEY);
            loadSettingsToUI();
            applySettings(DEFAULT_SETTINGS);
            alert('Settings reset to defaults!');
        }
    });
    
    // Clear leaderboard
    clearLeaderboardBtn?.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear the entire leaderboard? This cannot be undone.')) {
            localStorage.removeItem('esb_leaderboard');
            alert('Leaderboard cleared!');
        }
    });
    
    // Load saved settings on startup
    loadAndApplySettings();
}

/**
 * Close admin panel
 */
function closePanel() {
    const panel = document.getElementById('admin-panel');
    panel?.classList.add('hidden');
    document.getElementById('admin-password').value = '';
    document.getElementById('admin-login-error')?.classList.add('hidden');
}

/**
 * Show login screen
 */
function showLogin() {
    document.getElementById('admin-login').classList.remove('hidden');
    document.getElementById('admin-settings').classList.add('hidden');
    document.getElementById('admin-password').focus();
}

/**
 * Show settings screen
 */
function showSettings() {
    document.getElementById('admin-login').classList.add('hidden');
    document.getElementById('admin-settings').classList.remove('hidden');
    loadSettingsToUI();
}

/**
 * Attempt login
 */
function attemptLogin() {
    const password = document.getElementById('admin-password').value;
    const error = document.getElementById('admin-login-error');
    
    if (password === ADMIN_PASSWORD) {
        isAuthenticated = true;
        error?.classList.add('hidden');
        showSettings();
    } else {
        error?.classList.remove('hidden');
        document.getElementById('admin-password').value = '';
        document.getElementById('admin-password').focus();
    }
}

/**
 * Load settings to UI inputs
 */
function loadSettingsToUI() {
    const saved = getSavedSettings();
    
    // Efficiency - Type A
    setInputValue('admin-eff-a-fair', saved.efficiency.typeA.fair);
    setInputValue('admin-eff-a-cold', saved.efficiency.typeA.cold);
    setInputValue('admin-eff-a-extreme', saved.efficiency.typeA.extreme);
    
    // Efficiency - Type C
    setInputValue('admin-eff-c-fair', saved.efficiency.typeC.fair);
    setInputValue('admin-eff-c-cold', saved.efficiency.typeC.cold);
    setInputValue('admin-eff-c-extreme', saved.efficiency.typeC.extreme);
    
    // Battery
    setInputValue('admin-battery-a', saved.battery.typeA);
    setInputValue('admin-battery-c', saved.battery.typeC);
    setInputValue('admin-battery-min', saved.battery.min);
    setInputValue('admin-battery-max', saved.battery.max);
    
    // Fuel costs
    setInputValue('admin-cost-overnight', saved.fuelCosts.overnight);
    setInputValue('admin-cost-daytime', saved.fuelCosts.daytime);
    setInputValue('admin-cost-diesel', saved.fuelCosts.diesel);
    
    // Diesel MPG
    setInputValue('admin-mpg-a', saved.dieselMpg.typeA);
    setInputValue('admin-mpg-c', saved.dieselMpg.typeC);
    
    // Scoring
    setInputValue('admin-score-day', saved.scoring.dayCompleted);
    setInputValue('admin-score-no-midday', saved.scoring.noMidDayCharge);
    setInputValue('admin-score-midday-penalty', saved.scoring.midDayPenalty);
    setInputValue('admin-score-efficient', saved.scoring.efficientCharge);
    setInputValue('admin-deadhead-penalty', saved.scoring.deadheadPenalty);
    
    // Charging rates
    setInputValue('admin-charge-l2', saved.charging.level2);
    setInputValue('admin-charge-l3', saved.charging.level3);
    
    // Simulation
    setInputValue('admin-sim-duration', saved.simulation.dayDuration);
    setInputValue('admin-sim-speed', saved.simulation.baseSpeed);
    setInputValue('admin-school-charger', saved.simulation.schoolChargerChance);
    setInputValue('admin-circuity', saved.simulation.circuityFactor);
    
    // V2G
    setInputValue('admin-v2g-rate', saved.v2g.rate);
    setInputValue('admin-v2g-min-level', saved.v2g.minLevel);
    setInputValue('admin-v2g-school-days', saved.v2g.schoolDaysPerYear);
}

/**
 * Get settings from UI inputs
 */
function getSettingsFromUI() {
    return {
        efficiency: {
            typeA: {
                fair: getInputValue('admin-eff-a-fair'),
                cold: getInputValue('admin-eff-a-cold'),
                extreme: getInputValue('admin-eff-a-extreme')
            },
            typeC: {
                fair: getInputValue('admin-eff-c-fair'),
                cold: getInputValue('admin-eff-c-cold'),
                extreme: getInputValue('admin-eff-c-extreme')
            }
        },
        battery: {
            typeA: getInputValue('admin-battery-a'),
            typeC: getInputValue('admin-battery-c'),
            min: getInputValue('admin-battery-min'),
            max: getInputValue('admin-battery-max')
        },
        fuelCosts: {
            overnight: getInputValue('admin-cost-overnight'),
            daytime: getInputValue('admin-cost-daytime'),
            diesel: getInputValue('admin-cost-diesel')
        },
        dieselMpg: {
            typeA: getInputValue('admin-mpg-a'),
            typeC: getInputValue('admin-mpg-c')
        },
        scoring: {
            dayCompleted: getInputValue('admin-score-day'),
            noMidDayCharge: getInputValue('admin-score-no-midday'),
            midDayPenalty: getInputValue('admin-score-midday-penalty'),
            efficientCharge: getInputValue('admin-score-efficient'),
            deadheadPenalty: getInputValue('admin-deadhead-penalty')
        },
        charging: {
            level2: getInputValue('admin-charge-l2'),
            level3: getInputValue('admin-charge-l3')
        },
        simulation: {
            dayDuration: getInputValue('admin-sim-duration'),
            baseSpeed: getInputValue('admin-sim-speed'),
            schoolChargerChance: getInputValue('admin-school-charger'),
            circuityFactor: getInputValue('admin-circuity')
        },
        v2g: {
            rate: getInputValue('admin-v2g-rate'),
            minLevel: getInputValue('admin-v2g-min-level'),
            schoolDaysPerYear: getInputValue('admin-v2g-school-days')
        }
    };
}

/**
 * Save settings
 */
function saveSettings() {
    const settings = getSettingsFromUI();
    localStorage.setItem(ADMIN_SETTINGS_KEY, JSON.stringify(settings));
    applySettings(settings);
    alert('Settings saved! Changes will apply to the next game.');
}

/**
 * Get saved settings (or defaults)
 */
function getSavedSettings() {
    try {
        const saved = localStorage.getItem(ADMIN_SETTINGS_KEY);
        if (saved) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
        }
    } catch (e) {
        console.error('Error loading admin settings:', e);
    }
    return DEFAULT_SETTINGS;
}

/**
 * Load and apply settings on startup
 */
function loadAndApplySettings() {
    const settings = getSavedSettings();
    applySettings(settings);
}

/**
 * Apply settings to the config objects
 * Note: This modifies the imported config objects directly
 */
function applySettings(settings) {
    // Update ESB_EFFICIENCY
    ESB_EFFICIENCY.typeA.fair = settings.efficiency.typeA.fair;
    ESB_EFFICIENCY.typeA.cold = settings.efficiency.typeA.cold;
    ESB_EFFICIENCY.typeA.extreme = settings.efficiency.typeA.extreme;
    ESB_EFFICIENCY.typeC.fair = settings.efficiency.typeC.fair;
    ESB_EFFICIENCY.typeC.cold = settings.efficiency.typeC.cold;
    ESB_EFFICIENCY.typeC.extreme = settings.efficiency.typeC.extreme;
    
    // Update BATTERY_CONFIG
    BATTERY_CONFIG.typeACapacity = settings.battery.typeA;
    BATTERY_CONFIG.typeCCapacity = settings.battery.typeC;
    BATTERY_CONFIG.defaultCapacity = settings.battery.typeA;
    BATTERY_CONFIG.minCapacity = settings.battery.min;
    BATTERY_CONFIG.maxCapacity = settings.battery.max;
    
    // Update FUEL_COSTS
    FUEL_COSTS.electric.overnight = settings.fuelCosts.overnight;
    FUEL_COSTS.electric.daytime = settings.fuelCosts.daytime;
    FUEL_COSTS.diesel.pricePerGallon = settings.fuelCosts.diesel;
    
    // Update DIESEL_MPG
    DIESEL_MPG.typeA = settings.dieselMpg.typeA;
    DIESEL_MPG.typeC = settings.dieselMpg.typeC;
    
    // Update SCORING
    SCORING.dayCompleted = settings.scoring.dayCompleted;
    SCORING.noMidDayChargeBonus = settings.scoring.noMidDayCharge;
    SCORING.midDayChargePenalty = settings.scoring.midDayPenalty;
    SCORING.efficientChargeBonus = settings.scoring.efficientCharge;
    
    // Update MIDDAY_CHARGING
    MIDDAY_CHARGING.deadheadPenaltyPerMile = settings.scoring.deadheadPenalty;
    
    // Update charging rates in CHARGING_STATIONS
    if (CHARGING_STATIONS.depot?.types) {
        CHARGING_STATIONS.depot.types.level2.kwhPerHour = settings.charging.level2;
        CHARGING_STATIONS.depot.types.level3.kwhPerHour = settings.charging.level3;
    }
    if (CHARGING_STATIONS.school?.types) {
        CHARGING_STATIONS.school.types.level2.kwhPerHour = settings.charging.level2;
        CHARGING_STATIONS.school.types.level3.kwhPerHour = settings.charging.level3;
        CHARGING_STATIONS.school.availabilityChance = settings.simulation.schoolChargerChance / 100;
    }
    if (CHARGING_STATIONS.public?.types) {
        CHARGING_STATIONS.public.types.level2.kwhPerHour = settings.charging.level2;
        CHARGING_STATIONS.public.types.level3.kwhPerHour = settings.charging.level3;
    }
    
    // Update SIMULATION_CONFIG
    SIMULATION_CONFIG.targetDuration = settings.simulation.dayDuration * 1000;
    SIMULATION_CONFIG.baseSpeedMph = settings.simulation.baseSpeed;
    
    // Update ROUTE_CONFIG
    ROUTE_CONFIG.circuityFactor = settings.simulation.circuityFactor;
    
    // Update V2G_CONFIG
    V2G_CONFIG.dischargeRate = settings.v2g.rate;
    V2G_CONFIG.minDischargeLevel = settings.v2g.minLevel / 100;
    V2G_CONFIG.schoolDaysPerYear = settings.v2g.schoolDaysPerYear;
    
    // Update battery slider if it exists
    const batterySlider = document.getElementById('battery-capacity');
    if (batterySlider) {
        batterySlider.min = settings.battery.min;
        batterySlider.max = settings.battery.max;
    }
    
    console.log('Admin settings applied:', settings);
}

/**
 * Helper: Set input value
 */
function setInputValue(id, value) {
    const input = document.getElementById(id);
    if (input) input.value = value;
}

/**
 * Helper: Get input value as number
 */
function getInputValue(id) {
    const input = document.getElementById(id);
    return input ? parseFloat(input.value) || 0 : 0;
}

/**
 * Export settings getter for other modules
 */
export function getAdminSettings() {
    return getSavedSettings();
}

