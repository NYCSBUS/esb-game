// ESB Transition Simulator - Map Module

import { MAPBOX_TOKEN, MAP_CONFIG, ROUTE_COLORS } from './config.js';
import { getState, setMap } from './state.js';

/**
 * Initialize Mapbox map
 */
export function initializeMap() {
    mapboxgl.accessToken = MAPBOX_TOKEN;
    
    const state = getState();
    const center = state.config.cityCoords || MAP_CONFIG.defaultCenter;
    
    const map = new mapboxgl.Map({
        container: 'map',
        style: MAP_CONFIG.style,
        center: center,
        zoom: MAP_CONFIG.defaultZoom
    });
    
    map.on('load', () => {
        // Add sources and layers for routes
        initializeMapLayers(map);
    });
    
    // Add navigation controls
    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    
    setMap(map);
    return map;
}

/**
 * Initialize map layers for routes, stops, and buses
 */
function initializeMapLayers(map) {
    // Source for route lines
    map.addSource('routes', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });
    
    // Source for stops
    map.addSource('stops', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });
    
    // Source for buses
    map.addSource('buses', {
        type: 'geojson',
        data: {
            type: 'FeatureCollection',
            features: []
        }
    });
    
    // Route lines layer
    map.addLayer({
        id: 'routes-line',
        type: 'line',
        source: 'routes',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': ['get', 'color'],
            'line-width': 4,
            'line-opacity': 0.8
        }
    });
    
    // Route lines glow effect
    map.addLayer({
        id: 'routes-glow',
        type: 'line',
        source: 'routes',
        layout: {
            'line-join': 'round',
            'line-cap': 'round'
        },
        paint: {
            'line-color': ['get', 'color'],
            'line-width': 8,
            'line-opacity': 0.3,
            'line-blur': 4
        }
    }, 'routes-line');
    
    // Stops circle layer
    map.addLayer({
        id: 'stops-circle',
        type: 'circle',
        source: 'stops',
        paint: {
            'circle-radius': [
                'match',
                ['get', 'type'],
                'depot', 12,
                'school', 12,
                'charging', 12,
                'pickup', 10,
                'dropoff', 8, // Slightly smaller for return trip stops
                10
            ],
            'circle-color': [
                'case',
                ['get', 'completed'],
                '#22c55e',
                [
                    'match',
                    ['get', 'type'],
                    'depot', '#a855f7',
                    'pickup', '#3b82f6',
                    'dropoff', '#60a5fa', // Lighter blue for return trip
                    'school', '#f472b6',
                    'charging', '#fbbf24',
                    '#94a3b8'
                ]
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2
        }
    });
    
    // Stops labels layer
    map.addLayer({
        id: 'stops-labels',
        type: 'symbol',
        source: 'stops',
        layout: {
            'text-field': ['get', 'label'],
            'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
            'text-size': 11,
            'text-anchor': 'center',
            'text-allow-overlap': true
        },
        paint: {
            'text-color': '#ffffff'
        }
    });
    
    // Bus outer glow
    map.addLayer({
        id: 'buses-glow',
        type: 'circle',
        source: 'buses',
        paint: {
            'circle-radius': 22,
            'circle-color': ['get', 'color'],
            'circle-opacity': 0.4,
            'circle-blur': 1
        }
    });
    
    // Bus icons layer (larger, more visible)
    map.addLayer({
        id: 'buses-circle',
        type: 'circle',
        source: 'buses',
        paint: {
            'circle-radius': 16,
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 3
        }
    });
    
    // Bus emoji labels (larger)
    map.addLayer({
        id: 'buses-labels',
        type: 'symbol',
        source: 'buses',
        layout: {
            'text-field': '🚌',
            'text-size': 22,
            'text-allow-overlap': true,
            'text-ignore-placement': true
        }
    });
    
    // Click handlers
    map.on('click', 'stops-circle', (e) => {
        const properties = e.features[0].properties;
        showStopPopup(map, e.lngLat, properties);
    });
    
    map.on('click', 'buses-circle', (e) => {
        const properties = e.features[0].properties;
        showBusPopup(map, e.lngLat, properties);
    });
    
    // Cursor changes
    map.on('mouseenter', 'stops-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'stops-circle', () => {
        map.getCanvas().style.cursor = '';
    });
    
    map.on('mouseenter', 'buses-circle', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'buses-circle', () => {
        map.getCanvas().style.cursor = '';
    });
}

/**
 * Update route lines on map
 */
export function updateRouteLines(routes) {
    const state = getState();
    if (!state.map || !state.map.getSource('routes')) return;
    
    const features = routes.map((route, index) => ({
        type: 'Feature',
        properties: {
            id: route.id,
            color: ROUTE_COLORS[index % ROUTE_COLORS.length]
        },
        geometry: {
            type: 'LineString',
            coordinates: route.path || []
        }
    }));
    
    state.map.getSource('routes').setData({
        type: 'FeatureCollection',
        features
    });
}

/**
 * Update stops on map
 */
export function updateStops(routes) {
    const state = getState();
    if (!state.map || !state.map.getSource('stops')) return;
    
    const features = [];
    
    routes.forEach((route, routeIndex) => {
        if (!route.stops) return;
        
        // Track pickup sequence numbers for labeling
        let pickupCount = 0;
        let dropoffCount = 0;
        
        // Count total pickups first (for reverse numbering on return)
        const totalPickups = route.stops.filter(s => s.type === 'pickup').length;
        
        route.stops.forEach((stop, stopIndex) => {
            let label = '';
            if (stop.type === 'depot') {
                label = 'D';
            } else if (stop.type === 'pickup') {
                pickupCount++;
                label = String(pickupCount);
            } else if (stop.type === 'dropoff') {
                // On return trip, number in reverse (last pickup is first dropoff)
                dropoffCount++;
                label = String(totalPickups - dropoffCount + 1);
            } else if (stop.type === 'school') {
                label = 'S';
            } else if (stop.type === 'charging') {
                label = '⚡';
            }
            
            features.push({
                type: 'Feature',
                properties: {
                    id: `${route.id}-stop-${stopIndex}`,
                    routeId: route.id,
                    type: stop.type,
                    name: stop.name,
                    hasCharger: stop.hasCharger || false,
                    label: label,
                    completed: stop.completed || false,
                    sequence: stopIndex,
                    phase: stop.phase || 'outbound'
                },
                geometry: {
                    type: 'Point',
                    coordinates: stop.coords
                }
            });
        });
    });
    
    state.map.getSource('stops').setData({
        type: 'FeatureCollection',
        features
    });
}

// Store bus markers globally
let busMarkers = new Map();
let debugLogCount = 0;

/**
 * Clear all bus markers from the map
 */
export function clearBusMarkers() {
    busMarkers.forEach((marker, busId) => {
        marker.remove();
    });
    busMarkers.clear();
    debugLogCount = 0;
    console.log('All bus markers cleared');
}

// Track hidden routes
const hiddenRoutes = new Set();

/**
 * Set visibility of a specific route on the map
 */
export function setRouteVisibility(routeId, visible) {
    const state = getState();
    if (!state.map) return;
    
    if (visible) {
        hiddenRoutes.delete(routeId);
    } else {
        hiddenRoutes.add(routeId);
    }
    
    // Update routes visibility by re-rendering with filtered data
    updateRouteVisibility();
    
    // Hide/show bus marker
    const marker = busMarkers.get(`bus-${routeId.replace('route-', '')}`);
    
    // Find the bus for this route
    const bus = state.buses.find(b => b.routeId === routeId);
    if (bus && busMarkers.has(bus.id)) {
        const busMarker = busMarkers.get(bus.id);
        busMarker.getElement().style.display = visible ? 'flex' : 'none';
    }
}

/**
 * Update route visibility by filtering the source data
 */
function updateRouteVisibility() {
    const state = getState();
    if (!state.map || !state.routes) return;
    
    // Filter routes based on visibility
    const visibleRoutes = state.routes.filter(r => !hiddenRoutes.has(r.id));
    
    // Update route lines
    if (state.map.getSource('routes')) {
        const features = visibleRoutes.map((route, index) => {
            const originalIndex = state.routes.findIndex(r => r.id === route.id);
            return {
                type: 'Feature',
                properties: {
                    id: route.id,
                    color: ROUTE_COLORS[originalIndex % ROUTE_COLORS.length]
                },
                geometry: {
                    type: 'LineString',
                    coordinates: route.path || []
                }
            };
        });
        
        state.map.getSource('routes').setData({
            type: 'FeatureCollection',
            features
        });
    }
    
    // Update stops
    if (state.map.getSource('stops')) {
        const features = [];
        
        visibleRoutes.forEach((route, routeIndex) => {
            if (!route.stops) return;
            const originalIndex = state.routes.findIndex(r => r.id === route.id);
            
            route.stops.forEach((stop, stopIndex) => {
                let label = '';
                if (stop.type === 'depot') {
                    label = 'D';
                } else if (stop.type === 'pickup') {
                    label = String(stop.sequence || stopIndex);
                } else if (stop.type === 'school') {
                    label = `S${stop.schoolIndex || 1}`;
                } else if (stop.type === 'charging') {
                    label = '⚡';
                }
                
                features.push({
                    type: 'Feature',
                    properties: {
                        id: `${route.id}-stop-${stopIndex}`,
                        routeId: route.id,
                        type: stop.type,
                        name: stop.name,
                        hasCharger: stop.hasCharger || false,
                        label: label,
                        completed: stop.completed || false,
                        color: ROUTE_COLORS[originalIndex % ROUTE_COLORS.length]
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: stop.coords
                    }
                });
            });
        });
        
        state.map.getSource('stops').setData({
            type: 'FeatureCollection',
            features
        });
    }
}

/**
 * Update bus positions on map using HTML markers
 */
export function updateBusPositions(buses) {
    const state = getState();
    if (!state.map) {
        return;
    }
    
    // Log first call to verify function is running
    if (debugLogCount === 0) {
        console.log(`updateBusPositions called with ${buses.length} buses`);
        debugLogCount++;
    }
    
    const activeBusIds = new Set();
    
    buses.forEach((bus, index) => {
        // Skip completed buses
        if (bus.status === 'completed') {
            return;
        }
        
        // Get position - try bus.position first, then route path
        let lng, lat;
        
        if (bus.position && Array.isArray(bus.position) && bus.position.length >= 2) {
            lng = parseFloat(bus.position[0]);
            lat = parseFloat(bus.position[1]);
        }
        
        // If position is invalid, try to get from route path
        if (!isFinite(lng) || !isFinite(lat) || (lng === 0 && lat === 0)) {
            const route = state.routes.find(r => r.id === bus.routeId);
            if (route && route.path && route.path.length > 0) {
                // Use progress to interpolate position, or first point if at start
                const pathIndex = Math.min(
                    Math.floor(bus.progress * (route.path.length - 1)),
                    route.path.length - 1
                );
                const point = route.path[pathIndex];
                if (point && point.length >= 2) {
                    lng = parseFloat(point[0]);
                    lat = parseFloat(point[1]);
                }
            }
        }
        
        // Final validation
        if (!isFinite(lng) || !isFinite(lat)) {
            if (debugLogCount < 10) {
                console.warn(`Bus ${bus.id}: Invalid coordinates after all attempts`);
                debugLogCount++;
            }
            return;
        }
        
        // Additional range check for NY state (roughly -80 to -71 lng, 40 to 45 lat)
        if (lng < -80 || lng > -71 || lat < 40 || lat > 46) {
            if (debugLogCount < 10) {
                console.warn(`Bus ${bus.id}: Coordinates out of NY range: [${lng}, ${lat}]`);
                debugLogCount++;
            }
            // Don't skip, might still be valid
        }
        
        activeBusIds.add(bus.id);
        const colorIndex = typeof bus.routeIndex === 'number' ? bus.routeIndex : index;
        const color = ROUTE_COLORS[colorIndex % ROUTE_COLORS.length];
        
        try {
            // Get battery color
            const batteryPercent = bus.batteryLevel || 100;
            const batteryColor = batteryPercent > 50 ? '#22c55e' : 
                                 batteryPercent > 25 ? '#fbbf24' : 
                                 batteryPercent > 10 ? '#f97316' : '#ef4444';
            
            if (busMarkers.has(bus.id)) {
                // Update existing marker position
                const marker = busMarkers.get(bus.id);
                marker.setLngLat([lng, lat]);
                // Update battery label and color
                const el = marker.getElement();
                const label = el.querySelector('.bus-battery-label');
                const dot = el.querySelector('.bus-dot');
                if (label) {
                    label.textContent = `${batteryPercent.toFixed(0)}%`;
                    label.style.background = batteryColor;
                }
                if (dot) {
                    dot.style.borderColor = batteryColor;
                }
            } else {
                // Log marker creation
                console.log(`✅ Creating bus marker: ${bus.id} at [${lng.toFixed(4)}, ${lat.toFixed(4)}]`);
                
                // Create simple, fixed-size marker that behaves like native GIS markers
                const el = document.createElement('div');
                el.className = 'bus-marker-simple';
                el.innerHTML = `
                    <div class="bus-dot" style="border-color: ${batteryColor};"></div>
                    <div class="bus-battery-label" style="background: ${batteryColor};">${batteryPercent.toFixed(0)}%</div>
                `;
                
                // Create and add marker with fixed position (no rotation)
                const marker = new mapboxgl.Marker({
                    element: el,
                    anchor: 'center',
                    rotationAlignment: 'map',
                    pitchAlignment: 'map'
                })
                .setLngLat([lng, lat])
                .addTo(state.map);
                
                busMarkers.set(bus.id, marker);
                console.log(`✅ Marker added to map for ${bus.id}, total markers: ${busMarkers.size}`);
            }
        } catch (err) {
            console.error(`❌ Error creating marker for ${bus.id}:`, err.message);
        }
    });
    
    // Remove markers for buses that are no longer active
    busMarkers.forEach((marker, busId) => {
        if (!activeBusIds.has(busId)) {
            marker.remove();
            busMarkers.delete(busId);
        }
    });
}

/**
 * Show popup for a stop
 */
function showStopPopup(map, lngLat, properties) {
    const popup = new mapboxgl.Popup({ closeOnClick: true })
        .setLngLat(lngLat)
        .setHTML(`
            <div style="padding: 8px; color: #1a1a2e;">
                <strong>${properties.name}</strong><br>
                <span style="text-transform: capitalize;">${properties.type}</span>
                ${properties.completed ? '<br><span style="color: #22c55e;">✓ Completed</span>' : ''}
            </div>
        `)
        .addTo(map);
}

/**
 * Show popup for a bus
 */
function showBusPopup(map, lngLat, properties) {
    const batteryColor = properties.battery > 50 ? '#22c55e' : 
                         properties.battery > 25 ? '#fbbf24' : '#ef4444';
    
    const popup = new mapboxgl.Popup({ closeOnClick: true })
        .setLngLat(lngLat)
        .setHTML(`
            <div style="padding: 8px; color: #1a1a2e;">
                <strong>${properties.name}</strong><br>
                <span style="color: ${batteryColor};">🔋 ${Math.round(properties.battery)}%</span><br>
                <span style="text-transform: capitalize;">Status: ${properties.status}</span>
            </div>
        `)
        .addTo(map);
}

/**
 * Fit map bounds to show all routes
 */
export function fitMapToRoutes(routes) {
    const state = getState();
    if (!state.map || !routes.length) return;
    
    try {
        // Collect all valid coordinates from route paths
        const validCoords = [];
        
        routes.forEach(route => {
            if (route.path && Array.isArray(route.path)) {
                route.path.forEach(coord => {
                    if (Array.isArray(coord) && coord.length >= 2) {
                        const lng = parseFloat(coord[0]);
                        const lat = parseFloat(coord[1]);
                        // Check valid and in reasonable range for NY
                        if (isFinite(lng) && isFinite(lat) && 
                            lng >= -80 && lng <= -70 && 
                            lat >= 40 && lat <= 46) {
                            validCoords.push([lng, lat]);
                        }
                    }
                });
            }
            // Also try stops if path doesn't have valid coords
            if (route.stops && Array.isArray(route.stops)) {
                route.stops.forEach(stop => {
                    if (stop.coords && Array.isArray(stop.coords) && stop.coords.length >= 2) {
                        const lng = parseFloat(stop.coords[0]);
                        const lat = parseFloat(stop.coords[1]);
                        if (isFinite(lng) && isFinite(lat) && 
                            lng >= -80 && lng <= -70 && 
                            lat >= 40 && lat <= 46) {
                            validCoords.push([lng, lat]);
                        }
                    }
                });
            }
        });
        
        console.log(`fitMapToRoutes: Found ${validCoords.length} valid coordinates`);
        
        if (validCoords.length < 2) {
            console.warn('Not enough valid coordinates for fitBounds, centering on city');
            if (state.config.cityCoords) {
                state.map.flyTo({
                    center: state.config.cityCoords,
                    zoom: 12,
                    duration: 1000
                });
            }
            return;
        }
        
        // Calculate bounds manually
        let minLng = Infinity, maxLng = -Infinity;
        let minLat = Infinity, maxLat = -Infinity;
        
        validCoords.forEach(([lng, lat]) => {
            minLng = Math.min(minLng, lng);
            maxLng = Math.max(maxLng, lng);
            minLat = Math.min(minLat, lat);
            maxLat = Math.max(maxLat, lat);
        });
        
        console.log(`fitMapToRoutes: Bounds [${minLng.toFixed(4)}, ${minLat.toFixed(4)}] to [${maxLng.toFixed(4)}, ${maxLat.toFixed(4)}]`);
        
        state.map.fitBounds(
            [[minLng, minLat], [maxLng, maxLat]],
            {
                padding: 60,
                duration: 1000,
                maxZoom: 14
            }
        );
    } catch (error) {
        console.warn('Could not fit map to routes:', error);
        // Fallback: center on city
        if (state.config.cityCoords) {
            state.map.flyTo({
                center: state.config.cityCoords,
                zoom: 12,
                duration: 1000
            });
        }
    }
}

/**
 * Center map on a specific bus
 */
export function centerOnBus(busId) {
    const state = getState();
    if (!state.map) return;
    
    const bus = state.buses.find(b => b.id === busId);
    if (bus && bus.position) {
        state.map.flyTo({
            center: bus.position,
            zoom: 14,
            duration: 1000
        });
    }
}

/**
 * Center map on city
 */
export function centerOnCity(coords) {
    const state = getState();
    if (!state.map) return;
    
    state.map.flyTo({
        center: coords,
        zoom: MAP_CONFIG.defaultZoom,
        duration: 1500
    });
}

/**
 * Update public charging stations on map (off-route chargers)
 */
export function updateChargingStations() {
    const state = getState();
    if (!state.map) return;
    
    // Add charging stations as additional markers
    state.chargingStations.forEach(station => {
        // Check if marker already exists
        const markerId = `charger-${station.id}`;
        
        // Create marker element
        const el = document.createElement('div');
        el.className = 'charger-marker';
        el.innerHTML = `
            <div class="charger-icon">⚡</div>
        `;
        
        // Create marker
        new mapboxgl.Marker({
            element: el,
            anchor: 'center'
        })
        .setLngLat(station.coords)
        .addTo(state.map);
    });
}

