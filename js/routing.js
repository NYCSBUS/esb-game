// ESB Fleet Planner - Routing Module

import { getState, setChargingStations } from './state.js';
import { ROUTE_COLORS, CHARGING_STATIONS, ROUTE_CONFIG } from './config.js';
import { randomPointNear, randomIntInRange, calculatePathLength, generateId } from './utils.js';

/**
 * Generate a single route based on the guessed distance
 * Route: Depot → Stops → School → Stops (reverse) → Depot
 */
export async function generateRoutes(config) {
    const { cityCoords, busType, guessDistance } = config;
    const routes = [];
    
    // Generate exactly 1 route
    const targetOneWayDistance = Math.max(10, Math.min(60, guessDistance));
    
    // Generate stops
    const stops = generateStops(cityCoords, targetOneWayDistance);
    
    // Generate off-route public charging stations
    const publicChargers = generatePublicChargingStations(cityCoords, stops);
    setChargingStations(publicChargers);
    
    // Get OSRM path
    const path = await getOSRMRoute(stops);
    
    // Calculate actual round-trip distance
    const distance = calculatePathLength(path);
    const oneWay = distance / 2;
    
    routes.push({
        id: generateId(),
        name: 'Route 1',
        busType: busType,
        color: ROUTE_COLORS[0],
        stops: stops,
        path: path,
        distance: distance,
        oneWayDistance: oneWay,
        status: 'waiting',
        progress: 0,
        isVisible: true
    });
    
    return routes;
}

/**
 * Regenerate route with new distance (for mid-game adjustment)
 */
export async function regenerateRoute(newDistance) {
    const state = getState();
    const config = state.config;
    
    const targetOneWayDistance = Math.max(10, Math.min(60, newDistance));
    
    const stops = generateStops(config.cityCoords, targetOneWayDistance);
    const path = await getOSRMRoute(stops);
    const distance = calculatePathLength(path);
    
    return {
        id: generateId(),
        name: 'Route 1',
        busType: config.busType,
        color: ROUTE_COLORS[0],
        stops: stops,
        path: path,
        distance: distance,
        oneWayDistance: distance / 2,
        status: 'waiting',
        progress: 0,
        isVisible: true
    };
}

/**
 * Generate stops for a route
 * Order: Depot → Stops → School → Stops (reverse) → Depot
 */
function generateStops(center, targetOneWayDistance) {
    const stops = [];
    
    // Depot - starting point with charger (close to center, not 2 miles away)
    const depotCoords = randomPointNear(center, 0.5);
    stops.push({
        id: 'depot-start',
        type: 'depot',
        name: 'Depot',
        coords: depotCoords,
        completed: false,
        hasCharger: true,
        chargerType: 'depot',
        phase: 'outbound'
    });
    
    // Apply circuity factor to account for:
    // - Road network inefficiency (1.3-1.5x)
    // - OSRM routing through actual roads adds significant distance
    // - Balance between overestimating and underestimating
    // Configurable via admin panel (default 2.2x)
    const circuityFactor = ROUTE_CONFIG.circuityFactor;
    const adjustedDistance = targetOneWayDistance / circuityFactor;
    
    // Fixed number of stops for predictable routing
    const numStops = 3;
    const stopSpacing = adjustedDistance / (numStops + 1);
    
    // Generate stops in a straight line from depot to school (minimal variation)
    const direction = Math.random() * 2 * Math.PI;
    let currentPos = depotCoords;
    
    const stopCoords = [];
    
    for (let i = 0; i < numStops; i++) {
        // Fixed distance, no randomness
        const distance = stopSpacing;
        // No angle variation - straight line
        const angle = direction;
        
        const newLng = currentPos[0] + (distance / 69) * Math.cos(angle);
        const newLat = currentPos[1] + (distance / 69) * Math.sin(angle);
        currentPos = [newLng, newLat];
        
        stopCoords.push(currentPos);
        
        stops.push({
            id: `pickup-${i}`,
            type: 'pickup',
            name: `Stop ${i + 1}`,
            coords: currentPos,
            completed: false,
            hasCharger: false,
            phase: 'outbound'
        });
    }
    
    // School - at the end with charger option (50% chance of having charger)
    const schoolDistance = stopSpacing;
    const schoolLng = currentPos[0] + (schoolDistance / 69) * Math.cos(direction);
    const schoolLat = currentPos[1] + (schoolDistance / 69) * Math.sin(direction);
    const schoolCoords = [schoolLng, schoolLat];
    
    // 50% chance school has a charger
    const schoolHasCharger = Math.random() < 0.5;
    
    stops.push({
        id: 'school',
        type: 'school',
        name: 'School',
        coords: schoolCoords,
        completed: false,
        hasCharger: schoolHasCharger,
        chargerType: schoolHasCharger ? 'school' : null,
        phase: 'turnaround'
    });
    
    // Return trip - reverse through stops
    for (let i = numStops - 1; i >= 0; i--) {
        stops.push({
            id: `dropoff-${i}`,
            type: 'dropoff',
            name: `Stop ${i + 1}`,
            coords: stopCoords[i],
            completed: false,
            hasCharger: false,
            phase: 'return'
        });
    }
    
    // Return to depot
    stops.push({
        id: 'depot-end',
        type: 'depot',
        name: 'Depot',
        coords: depotCoords,
        completed: false,
        hasCharger: true,
        chargerType: 'depot',
        phase: 'return',
        isEnd: true
    });
    
    return stops;
}

/**
 * Generate public charging stations OFF the route
 * These are available for mid-day charging but require a detour
 */
function generatePublicChargingStations(center, stops) {
    const stations = [];
    
    // Find the school location (mid-point of route)
    const schoolStop = stops.find(s => s.type === 'school');
    if (!schoolStop) return stations;
    
    // Generate 2-3 public charging stations near the school
    const numStations = randomIntInRange(2, 3);
    
    for (let i = 0; i < numStations; i++) {
        // Place stations 1-3 miles away from the school
        const distance = 1 + Math.random() * 2;
        const angle = (i / numStations) * 2 * Math.PI + Math.random() * 0.5;
        
        const lng = schoolStop.coords[0] + (distance / 69) * Math.cos(angle);
        const lat = schoolStop.coords[1] + (distance / 69) * Math.sin(angle);
        
        stations.push({
            id: `public-charger-${i + 1}`,
            type: 'public',
            name: `Public Charger #${i + 1}`,
            coords: [lng, lat],
            hasCharger: true,
            chargerType: 'public',
            distanceFromSchool: distance,
            rate: CHARGING_STATIONS.public.rate
        });
    }
    
    return stations;
}

/**
 * Get all available charging options for mid-day charging
 * Includes both Level 2 and Level 3 (DC Fast) options where available
 * Calculates deadhead miles for depot (bus must return from school to depot)
 */
export function getAvailableChargingStations(route) {
    const state = getState();
    const stations = [];
    
    // Get school and depot locations for distance calculations
    const schoolStop = route.stops.find(s => s.type === 'school');
    const depotStop = route.stops.find(s => s.type === 'depot' && !s.isEnd);
    
    // Calculate distance from school to depot (for deadhead calculation)
    let schoolToDepotDistance = 0;
    if (schoolStop && depotStop) {
        schoolToDepotDistance = haversineDistanceBasic(schoolStop.coords, depotStop.coords);
    }
    
    // Add school charging options (Level 2 and Level 3) - only if school has charger
    if (schoolStop && schoolStop.hasCharger) {
        // School Level 2
        stations.push({
            id: 'school-level2',
            locationType: 'school',
            name: 'School',
            icon: CHARGING_STATIONS.school.icon,
            coords: schoolStop.coords,
            chargerType: 'Level 2',
            chargerLevel: 'level2',
            rate: CHARGING_STATIONS.school.types.level2.rate,
            kwhPerHour: CHARGING_STATIONS.school.types.level2.kwhPerHour,
            deadheadMiles: 0, // Already at school
            onRoute: true,
            description: 'Slower, cheaper'
        });
        
        // School Level 3 / DC Fast
        stations.push({
            id: 'school-level3',
            locationType: 'school',
            name: 'School',
            icon: CHARGING_STATIONS.school.icon,
            coords: schoolStop.coords,
            chargerType: 'DC Fast',
            chargerLevel: 'level3',
            rate: CHARGING_STATIONS.school.types.level3.rate,
            kwhPerHour: CHARGING_STATIONS.school.types.level3.kwhPerHour,
            deadheadMiles: 0, // Already at school
            onRoute: true,
            description: 'Faster, more expensive'
        });
    }
    
    // Add depot charging options (requires deadhead from school)
    if (depotStop) {
        const deadheadRoundTrip = schoolToDepotDistance * 2; // Go to depot and return for PM trip
        
        // Depot Level 2
        stations.push({
            id: 'depot-level2',
            locationType: 'depot',
            name: 'Depot',
            icon: CHARGING_STATIONS.depot.icon,
            coords: depotStop.coords,
            chargerType: 'Level 2',
            chargerLevel: 'level2',
            rate: CHARGING_STATIONS.depot.types.level2.rate,
            kwhPerHour: CHARGING_STATIONS.depot.types.level2.kwhPerHour,
            deadheadMiles: deadheadRoundTrip,
            onRoute: false,
            description: `+${deadheadRoundTrip.toFixed(1)} mi deadhead`
        });
        
        // Depot Level 3 / DC Fast
        stations.push({
            id: 'depot-level3',
            locationType: 'depot',
            name: 'Depot',
            icon: CHARGING_STATIONS.depot.icon,
            coords: depotStop.coords,
            chargerType: 'DC Fast',
            chargerLevel: 'level3',
            rate: CHARGING_STATIONS.depot.types.level3.rate,
            kwhPerHour: CHARGING_STATIONS.depot.types.level3.kwhPerHour,
            deadheadMiles: deadheadRoundTrip,
            onRoute: false,
            description: `+${deadheadRoundTrip.toFixed(1)} mi deadhead`
        });
    }
    
    // Add public charging stations (off-route, requires detour)
    state.chargingStations.forEach(station => {
        const detourRoundTrip = station.distanceFromSchool * 2;
        
        // Public Level 2
        stations.push({
            id: `${station.id}-level2`,
            locationType: 'public',
            name: station.name,
            icon: CHARGING_STATIONS.public.icon,
            coords: station.coords,
            chargerType: 'Level 2',
            chargerLevel: 'level2',
            rate: CHARGING_STATIONS.public.types.level2.rate,
            kwhPerHour: CHARGING_STATIONS.public.types.level2.kwhPerHour,
            deadheadMiles: detourRoundTrip,
            onRoute: false,
            description: `+${detourRoundTrip.toFixed(1)} mi detour, slow`
        });
        
        // Public Level 3 / DC Fast
        stations.push({
            id: `${station.id}-level3`,
            locationType: 'public',
            name: station.name,
            icon: CHARGING_STATIONS.public.icon,
            coords: station.coords,
            chargerType: 'DC Fast',
            chargerLevel: 'level3',
            rate: CHARGING_STATIONS.public.types.level3.rate,
            kwhPerHour: CHARGING_STATIONS.public.types.level3.kwhPerHour,
            deadheadMiles: detourRoundTrip,
            onRoute: false,
            description: `+${detourRoundTrip.toFixed(1)} mi detour, fast`
        });
    });
    
    // Sort by total cost (deadhead + charging)
    return stations.sort((a, b) => {
        // Prioritize on-route (school) first
        if (a.onRoute && !b.onRoute) return -1;
        if (!a.onRoute && b.onRoute) return 1;
        // Then by rate
        return a.rate - b.rate;
    });
}

/**
 * Simple haversine distance calculation (miles)
 */
function haversineDistanceBasic(coord1, coord2) {
    const R = 3959; // Earth's radius in miles
    const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const dLon = (coord2[0] - coord1[0]) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(coord1[1] * Math.PI / 180) * Math.cos(coord2[1] * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

/**
 * Get OSRM route for stops
 */
async function getOSRMRoute(stops) {
    try {
        const coords = stops.map(s => s.coords.join(',')).join(';');
        const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes[0]) {
            return data.routes[0].geometry.coordinates;
        }
    } catch (error) {
        console.error('OSRM routing error:', error);
    }
    
    // Fallback: straight lines
    return stops.map(s => s.coords);
}

/**
 * Get OSRM route between two coordinate points
 * Returns { path: coordinates[], distance: number (miles) }
 */
export async function getOSRMRouteBetweenPoints(startCoords, endCoords) {
    try {
        const coordString = `${startCoords[0]},${startCoords[1]};${endCoords[0]},${endCoords[1]}`;
        const url = `https://router.project-osrm.org/route/v1/driving/${coordString}?overview=full&geometries=geojson`;
        
        const response = await fetch(url);
        const data = await response.json();
        
        if (data.code === 'Ok' && data.routes && data.routes[0]) {
            const route = data.routes[0];
            const distanceMeters = route.distance;
            const distanceMiles = distanceMeters / 1609.34;
            
            return {
                path: route.geometry.coordinates,
                distance: distanceMiles
            };
        }
    } catch (error) {
        console.error('OSRM point-to-point routing error:', error);
    }
    
    // Fallback: straight line with estimated distance
    const straightLineDistance = haversine(startCoords, endCoords);
    return {
        path: [startCoords, endCoords],
        distance: straightLineDistance * 1.3 // Approximate road distance
    };
}

