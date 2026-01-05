// ESB Fleet Planner - Main Entry Point

import { getState, setRoutes, setBuses, resetStats, resetSimulation, resetWeek, updatePlayer } from './js/state.js';
import { initializeMap, updateRouteLines, updateStops, updateBusPositions, fitMapToRoutes, updateChargingStations } from './js/map.js';
import { generateRoutes } from './js/routing.js';
import { initializeBuses, startSimulation, pauseSimulation } from './js/simulation.js';
import { initSplashUI, initAppUI, updateRouteCards, updateWeekProgress, updateDayStats, updateScoreDisplay } from './js/ui.js';
import { APP_VERSION, WEATHER_PATTERNS } from './js/config.js';
import { initAdminPanel } from './js/admin.js';

console.log(`ESB Fleet Planner v${APP_VERSION}`);

// Expose simulation controls globally
window.startSimulation = startSimulation;
window.pauseSimulation = pauseSimulation;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initSplashUI();
    setupStartButton();
    initAdminPanel();
});

/**
 * Setup start button
 */
function setupStartButton() {
    const startBtn = document.getElementById('start-simulation');
    
    startBtn.addEventListener('click', async () => {
        const state = getState();
        
        if (!state.config.cityCoords) {
            alert('Please select a city first');
            return;
        }
        
        // Get player name
        const playerName = document.getElementById('player-name').value.trim() || 'Player';
        updatePlayer({ name: playerName });
        
        // Show loading
        startBtn.disabled = true;
        startBtn.querySelector('.btn-text').textContent = 'Generating Route...';
        
        try {
            // Reset week state with selected weather pattern
            resetWeek();
            
            // Initialize map
            const map = initializeMap();
            
            await new Promise((resolve) => {
                if (map.loaded()) resolve();
                else map.on('load', resolve);
            });
            
            // Generate single route
            const routes = await generateRoutes(state.config);
            setRoutes(routes);
            
            // Initialize bus
            const buses = initializeBuses(routes, state.config);
            setBuses(buses);
            
            // Reset stats
            resetStats();
            resetSimulation();
            
            // Show main app
            showApp();
            
            // Initialize UI
            initAppUI();
            
            // Update map
            setTimeout(() => {
                map.resize();
                updateRouteLines(routes);
                updateStops(routes);
                updateBusPositions(buses);
                updateChargingStations();
                
                setTimeout(() => {
                    map.resize();
                    fitMapToRoutes(routes);
                }, 300);
            }, 100);
            
            // Update UI
            updateRouteCards();
            updateWeekProgress();
            updateDayStats();
            updateScoreDisplay();
            
        } catch (error) {
            console.error('Failed to start:', error);
            startBtn.disabled = false;
            startBtn.querySelector('.btn-text').textContent = 'Error - Try Again';
        }
    });
}

/**
 * Show main app, hide splash
 */
function showApp() {
    document.getElementById('splash-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
}
