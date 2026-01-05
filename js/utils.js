// ESB Transition Simulator - Utility Functions

/**
 * Format time in HH:MM:SS format
 */
export function formatTime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    const ss = String(seconds % 60).padStart(2, '0');
    const mm = String(minutes % 60).padStart(2, '0');
    const hh = String(hours).padStart(2, '0');
    
    if (hours > 0) {
        return `${hh}:${mm}:${ss}`;
    }
    return `${mm}:${ss}`;
}

/**
 * Format time as relative (e.g., "2m ago")
 */
export function formatTimeAgo(timestamp) {
    const now = Date.now();
    const diff = now - timestamp;
    
    if (diff < 60000) {
        return 'Just now';
    }
    
    const minutes = Math.floor(diff / 60000);
    if (minutes < 60) {
        return `${minutes}m ago`;
    }
    
    const hours = Math.floor(minutes / 60);
    return `${hours}h ago`;
}

/**
 * Format distance in miles
 */
export function formatDistance(miles) {
    if (miles < 0.1) {
        return `${Math.round(miles * 5280)} ft`;
    }
    return `${miles.toFixed(1)} mi`;
}

/**
 * Format currency
 */
export function formatCurrency(amount) {
    return amount.toFixed(2);
}

/**
 * Format energy in kWh
 */
export function formatEnergy(kwh) {
    return `${kwh.toFixed(1)} kWh`;
}

/**
 * Format percentage
 */
export function formatPercent(value) {
    return `${Math.round(value * 100)}%`;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in miles
 */
export function haversineDistance(coord1, coord2) {
    const R = 3959; // Earth's radius in miles
    const lat1 = coord1[1] * Math.PI / 180;
    const lat2 = coord2[1] * Math.PI / 180;
    const dLat = (coord2[1] - coord1[1]) * Math.PI / 180;
    const dLng = (coord2[0] - coord1[0]) * Math.PI / 180;
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
}

/**
 * Linear interpolation between two points
 */
export function lerp(start, end, t) {
    return start + (end - start) * t;
}

/**
 * Interpolate position along a path
 */
export function interpolatePosition(path, progress) {
    if (!path || path.length === 0) return [0, 0];
    if (path.length === 1) return [...path[0]];
    
    // Clamp progress
    progress = Math.max(0, Math.min(1, progress));
    
    // Quick return for start/end
    if (progress <= 0) return [...path[0]];
    if (progress >= 1) return [...path[path.length - 1]];
    
    // Calculate total path length
    let totalLength = 0;
    const segmentLengths = [];
    
    for (let i = 0; i < path.length - 1; i++) {
        const length = haversineDistance(path[i], path[i + 1]);
        segmentLengths.push(length);
        totalLength += length;
    }
    
    // Handle zero-length path
    if (totalLength === 0) return [...path[0]];
    
    // Find position at progress
    const targetDistance = progress * totalLength;
    let accumulatedDistance = 0;
    
    for (let i = 0; i < segmentLengths.length; i++) {
        if (segmentLengths[i] === 0) continue; // Skip zero-length segments
        
        if (accumulatedDistance + segmentLengths[i] >= targetDistance) {
            const segmentProgress = (targetDistance - accumulatedDistance) / segmentLengths[i];
            const lng = lerp(path[i][0], path[i + 1][0], segmentProgress);
            const lat = lerp(path[i][1], path[i + 1][1], segmentProgress);
            
            // Validate result
            if (isNaN(lng) || isNaN(lat)) {
                return [...path[i]];
            }
            
            return [lng, lat];
        }
        accumulatedDistance += segmentLengths[i];
    }
    
    return [...path[path.length - 1]];
}

/**
 * Calculate path length in miles
 */
export function calculatePathLength(path) {
    if (!path || path.length < 2) return 0;
    
    let totalLength = 0;
    for (let i = 0; i < path.length - 1; i++) {
        totalLength += haversineDistance(path[i], path[i + 1]);
    }
    
    return totalLength;
}

/**
 * Generate a random number within a range
 */
export function randomInRange(min, max) {
    return Math.random() * (max - min) + min;
}

/**
 * Generate a random integer within a range
 */
export function randomIntInRange(min, max) {
    return Math.floor(randomInRange(min, max + 1));
}

/**
 * Generate a random point within bounds
 */
export function randomPointInBounds(bounds) {
    const lng = randomInRange(bounds.minLng, bounds.maxLng);
    const lat = randomInRange(bounds.minLat, bounds.maxLat);
    return [lng, lat];
}

/**
 * Generate a random point near a center point
 */
export function randomPointNear(center, radiusMiles) {
    // Convert miles to approximate degrees (rough approximation)
    const radiusDegrees = radiusMiles / 69;
    
    const angle = Math.random() * 2 * Math.PI;
    const distance = Math.random() * radiusDegrees;
    
    return [
        center[0] + distance * Math.cos(angle),
        center[1] + distance * Math.sin(angle)
    ];
}

/**
 * Debounce function
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Throttle function
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/**
 * Generate unique ID
 */
export function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Clamp value between min and max
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Calculate energy consumption for a distance
 */
export function calculateEnergyConsumption(distanceMiles, efficiency) {
    return distanceMiles * efficiency;
}

/**
 * Calculate diesel consumption for a distance
 */
export function calculateDieselConsumption(distanceMiles, mpg) {
    return distanceMiles / mpg;
}

/**
 * Check if current time is during overnight rates (10PM - 6AM)
 */
export function isOvernightRate() {
    const hour = new Date().getHours();
    return hour >= 22 || hour < 6;
}

/**
 * Get electricity rate based on time
 */
export function getElectricityRate(overnightRate, daytimeRate) {
    return isOvernightRate() ? overnightRate : daytimeRate;
}

