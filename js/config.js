// ESB Fleet Planner - Configuration

export const APP_VERSION = '3.0.0';

export const MAPBOX_TOKEN = 'pk.eyJ1IjoidnIwMG4tbnljc2J1cyIsImEiOiJjbDB5cHhoeHgxcmEyM2ptdXVkczk1M2xlIn0.qq6o-6TMurwke-t1eyetBw';

// ESB Efficiency Metrics (kWh per mile)
export const ESB_EFFICIENCY = {
    typeA: {
        fair: 1.3,      // >65°F
        cold: 1.6,      // 40-65°F (75% heating)
        extreme: 1.9    // <40°F (100% heating)
    },
    typeC: {
        // Type C is 50% higher than Type A
        fair: 1.3 * 1.5,     // 1.95 kWh/mi
        cold: 1.6 * 1.5,     // 2.4 kWh/mi
        extreme: 1.9 * 1.5   // 2.85 kWh/mi
    }
};

// Fuel Costs
export const FUEL_COSTS = {
    electric: {
        overnight: 0.18,  // $/kWh
        daytime: 0.36     // $/kWh (2x penalty)
    },
    diesel: {
        pricePerGallon: 3.00
    }
};

// V2G (Vehicle-to-Grid) Configuration
export const V2G_CONFIG = {
    enabled: true,
    dischargeRate: 0.30,           // $/kWh earned for discharging
    dischargeWindowStart: 16,      // 4 PM (after PM trip ends)
    dischargeWindowEnd: 20,        // 8 PM
    chargeWindowStart: 21,         // 9 PM
    chargeWindowEnd: 5,            // 5 AM
    minDischargeLevel: 0.20,       // Don't discharge below 20%
    dischargePowerKw: 19,          // V2G discharge rate (kW)
    schoolDaysPerYear: 180         // For annual projections
};

// Diesel MPG for comparison
export const DIESEL_MPG = {
    typeA: 9,
    typeC: 6
};

// CO2 Emissions Configuration
export const CO2_CONFIG = {
    poundsPerGallon: 19.4,  // EPA conversion factor for diesel to CO2
    typeCMultiplier: 1.5    // Type C uses 1.5x more fuel
};

// Celebratory messages for pickup bubbles
export const CELEBRATION_MESSAGES = [
    "Yay, no fumes! 🌿",
    "Clean air! 💨",
    "Zero emissions! ♻️",
    "Breathe easy! 🌬️",
    "Go green! 🌱",
    "Planet friendly! 🌍",
    "No exhaust! ✨",
    "Electric win! ⚡",
    "Kids love clean air! 👧",
    "Diesel who? 🚫",
    "Future is electric! 🔋",
    "Silent & clean! 🤫",
    "Eco warrior! 🦸",
    "Less pollution! 🌤️",
    "Healthy choice! 💚"
];

// Battery Configuration
export const BATTERY_CONFIG = {
    defaultCapacity: 100,       // Default for Type A
    typeACapacity: 100,         // Type A standard capacity
    typeCCapacity: 185,         // Type C standard capacity
    minCapacity: 80,
    maxCapacity: 220,
    safetyBuffer: 0.15,           // Keep 15% as safety reserve
    chargingNeededThreshold: 0.20, // Need charging if below 20%
    minReturnCharge: 0.15,        // Minimum 15% when returning to depot
    chargingRateKwhPerHour: 50    // DC fast charging rate
};

// Simulation Configuration
export const SIMULATION_CONFIG = {
    targetDuration: 15000,    // 15 seconds per day
    updateInterval: 50,       // ms between updates
    arrivalThreshold: 0.1,    // miles (increased to prevent skipping stops)
    baseSpeedMph: 25          // Average speed
};

// Route Generation Configuration
export const ROUTE_CONFIG = {
    circuityFactor: 2.2       // Ratio of road distance to straight-line distance
};

// Time Windows (in simulated hours)
export const TIME_WINDOWS = {
    dayStart: 5,          // 5:00 AM - Day begins
    amTripStart: 5,       // 5:00 AM - AM trip starts from depot
    amTripEnd: 9,         // 9:00 AM - AM trip arrives at school (50% progress)
    midDayStart: 9,       // 9:00 AM - Mid-day charging window opens
    midDayEnd: 12,        // 12:00 PM (noon) - Mid-day charging window closes
    pmTripStart: 12,      // 12:00 PM - PM trip starts from school  
    pmTripEnd: 16,        // 4:00 PM - PM trip ends at depot (100% progress)
    dayEnd: 16            // 4:00 PM - Day ends
};

// Time is now calculated based on route progress, not elapsed real time
// This ensures:
// - AM trip (0-50% progress): 5 AM to 9 AM
// - Mid-day at school (50%): 9 AM
// - PM trip (50-100% progress): 1 PM to 5 PM

// Map Configuration
export const MAP_CONFIG = {
    defaultCenter: [-73.935242, 40.730610],
    defaultZoom: 11,
    style: 'mapbox://styles/mapbox/dark-v11'
};

// New York State bounds for city search
export const NY_STATE_BOUNDS = {
    minLng: -79.763,
    maxLng: -71.856,
    minLat: 40.496,
    maxLat: 45.015
};

// Route Colors
export const ROUTE_COLORS = [
    '#5cb884', // Primary green
    '#6ba3d6', // Blue
    '#e8b339', // Amber
    '#e86565', // Red
    '#a855f7'  // Purple
];

// Weather Patterns - Player selects one at start (3-day game)
export const WEATHER_PATTERNS = {
    spring: {
        name: 'Spring Days',
        description: 'Mild temperatures, mostly fair weather',
        icon: '🌸',
        schedule: [
            { day: 1, name: 'Day 1', weather: 'fair', icon: '☀️' },
            { day: 2, name: 'Day 2', weather: 'fair', icon: '☀️' },
            { day: 3, name: 'Day 3', weather: 'cold', icon: '🌤️' }
        ],
        difficulty: 'Easy'
    },
    fall: {
        name: 'Fall Days',
        description: 'Mixed conditions, getting colder',
        icon: '🍂',
        schedule: [
            { day: 1, name: 'Day 1', weather: 'fair', icon: '☀️' },
            { day: 2, name: 'Day 2', weather: 'cold', icon: '🌤️' },
            { day: 3, name: 'Day 3', weather: 'extreme', icon: '❄️' }
        ],
        difficulty: 'Medium'
    },
    winter: {
        name: 'Winter Days',
        description: 'Cold snap with extreme conditions',
        icon: '❄️',
        schedule: [
            { day: 1, name: 'Day 1', weather: 'cold', icon: '🌤️' },
            { day: 2, name: 'Day 2', weather: 'extreme', icon: '❄️' },
            { day: 3, name: 'Day 3', weather: 'extreme', icon: '❄️' }
        ],
        difficulty: 'Hard'
    },
    polar: {
        name: 'Polar Vortex',
        description: 'Arctic conditions all 3 days!',
        icon: '🥶',
        schedule: [
            { day: 1, name: 'Day 1', weather: 'extreme', icon: '❄️' },
            { day: 2, name: 'Day 2', weather: 'extreme', icon: '❄️' },
            { day: 3, name: 'Day 3', weather: 'extreme', icon: '❄️' }
        ],
        difficulty: 'Expert'
    }
};

// Default week schedule (will be overridden by player selection)
export const WEEK_SCHEDULE = WEATHER_PATTERNS.fall.schedule;

// Weather Scenario Info
export const WEATHER_INFO = {
    fair: {
        name: 'Fair',
        temp: '>65°F',
        icon: '☀️',
        description: 'Optimal conditions'
    },
    cold: {
        name: 'Cold',
        temp: '40-65°F',
        icon: '🌤️',
        description: 'Heating needed 75%'
    },
    extreme: {
        name: 'Extreme',
        temp: '<40°F',
        icon: '❄️',
        description: 'Continuous heating'
    }
};

// Scoring Configuration
export const SCORING = {
    // Base points per day completed
    dayCompleted: 100,
    
    // Bonus for completing without mid-day charge
    noMidDayChargeBonus: 150,
    
    // Penalty for mid-day charging
    midDayChargePenalty: -50,
    
    // Points for efficient overnight charging (guessed within 10%)
    efficientChargeBonus: 75,
    
    // Points lost for overcharging overnight
    overchargePerKwhPenalty: -2,
    
    // Points lost for undercharging (ran out)
    underchargePenalty: -100,
    
    // Perfect route prediction bonus
    perfectRoutePrediction: 500,
    
    // Difficulty multipliers
    difficultyMultiplier: {
        'Easy': 1.0,
        'Medium': 1.5,
        'Hard': 2.0,
        'Expert': 3.0
    },
    
    // Perfect week bonus
    perfectWeekBonus: 1000
};

// Charging Station Types with Level 2 and Level 3 options
// Level 2: 13 kWh/hr, Level 3: 50 kWh/hr
export const CHARGING_STATIONS = {
    depot: {
        name: 'Depot',
        icon: '🏠',
        types: {
            level2: {
                name: 'Level 2',
                rate: FUEL_COSTS.electric.daytime,
                kwhPerHour: 13,  // 13 kWh/hr for Level 2
                description: 'Slower, cheaper'
            },
            level3: {
                name: 'DC Fast',
                rate: FUEL_COSTS.electric.daytime * 1.3, // 30% premium for fast charging
                kwhPerHour: 50,  // 50 kWh/hr for Level 3
                description: 'Faster, more expensive'
            }
        },
        available: 'anytime',
        requiresDeadhead: true
    },
    school: {
        name: 'School',
        icon: '🏫',
        types: {
            level2: {
                name: 'Level 2',
                rate: FUEL_COSTS.electric.daytime,
                kwhPerHour: 13,  // 13 kWh/hr for Level 2
                description: 'Slower, cheaper'
            },
            level3: {
                name: 'DC Fast',
                rate: FUEL_COSTS.electric.daytime * 1.2, // 20% premium for DC fast
                kwhPerHour: 50,  // 50 kWh/hr for Level 3
                description: 'Faster, more expensive'
            }
        },
        available: 'daytime',
        requiresDeadhead: false,
        availabilityChance: 0.5  // 50% chance school has charger
    },
    public: {
        name: 'Public Charger',
        icon: '⚡',
        types: {
            level2: {
                name: 'Level 2',
                rate: FUEL_COSTS.electric.daytime * 1.4, // 40% premium for public L2
                kwhPerHour: 13,  // 13 kWh/hr for Level 2
                description: 'Slower, expensive'
            },
            level3: {
                name: 'DC Fast',
                rate: FUEL_COSTS.electric.daytime * 1.6, // 60% premium for public DC fast
                kwhPerHour: 50,  // 50 kWh/hr for Level 3
                description: 'Fastest, most expensive'
            }
        },
        available: 'anytime',
        requiresDeadhead: true
    }
};

// Mid-Day Charging Configuration
export const MIDDAY_CHARGING = {
    timeWindow: { start: 9, end: 12 }, // 9 AM to 12 PM (noon)
    deadheadPenaltyPerMile: 5, // Points penalty per deadhead mile
    energyCostDeadhead: 1.5, // Extra energy cost multiplier for deadhead miles
    minChargeLevel: 20,      // Minimum charge level to trigger mid-day charging
    maxChargingDuration: 3   // Maximum 3 hours available for mid-day charging (9 AM - 12 PM)
};

// Leaderboard Configuration
export const LEADERBOARD_CONFIG = {
    maxEntries: 10,
    storageKey: 'esb_leaderboard'
};
