# ESB Transition Simulator

**Version 1.0.0** | A gamified educational experience for school bus operators to explore the transition to Electric School Buses (ESBs).

## 🚌 Overview

This interactive web application simulates electric school bus operations across New York State cities, helping fleet owners and operators understand:

- **Energy consumption** across different weather conditions
- **Risk-free range planning** for year-round reliability
- **Cost comparisons** between electric and diesel fleets
- **Charging strategies** to minimize operational costs

## ✨ Key Features

### Interactive Configuration
- **City Selection**: Search for any city in New York State using Mapbox Places API
- **Fleet Setup**: Configure 1-5 routes with Type A (small) or Type C (full-size) buses
- **Route Parameters**: Set minimum/maximum distances and battery capacity

### Real-Time Simulation
- Routes generated using OSRM for realistic street-based paths
- Buses move along routes with battery depletion visualization
- Simulation speed optimized for ~30 second route completion
- Live tracking of energy consumption and costs

### Weather Scenarios
| Scenario | Temperature | Heating | Type A Efficiency | Type C Efficiency |
|----------|-------------|---------|-------------------|-------------------|
| Fair Weather | >65°F | 0% | 1.3 kWh/mi | 1.95 kWh/mi |
| Cold Weather | 40-65°F | 75% | 1.6 kWh/mi | 2.4 kWh/mi |
| Extreme Cold | <40°F | 100% | 1.9 kWh/mi | 2.85 kWh/mi |

### Risk-Free Range Analysis
- Routes evaluated against worst-case (extreme cold) efficiency
- Visual indicators show which routes can operate year-round
- Helps operators understand battery sizing requirements

### Cost Comparison
- **Electric Fleet**: Overnight charging at $0.18/kWh, Daytime at $0.36/kWh
- **Diesel Fleet**: Type A @ 9 MPG, Type C @ 6 MPG, $3.00/gallon
- Real-time savings calculation and annual projections

### Mid-Day Charging Logic
- System automatically detects when buses need charging
- Prioritizes avoiding mid-day charges when possible
- Tracks additional costs from daytime charging

## 🚀 Getting Started

### Prerequisites
- Python 3 (for local server)
- Modern web browser with WebGL support
- Internet connection (for Mapbox and OSRM APIs)

### Running the Application

1. **Start the local server**:
   ```bash
   cd /path/to/esb-kiosk
   python3 -m http.server 8080
   ```

2. **Open in browser**:
   Navigate to `http://localhost:8080`

3. **Configure Your Fleet**:
   - Search for a city in New York State
   - Set number of routes (1-5)
   - Choose bus type (Type A, Type C, or Mixed)
   - Adjust distance and battery parameters

4. **Run Simulation**:
   - Click "Start Simulation" to generate routes
   - Use START/PAUSE controls in the header
   - Switch between weather scenarios to see impact
   - Watch battery levels and cost comparisons update in real-time

## 📁 Project Structure

```
esb-kiosk/
├── app.js              # Main entry point
├── index.html          # HTML structure
├── css/
│   └── style.css       # Complete styling
├── js/
│   ├── config.js       # Constants, efficiency metrics, API tokens
│   ├── state.js        # Global application state
│   ├── map.js          # Mapbox initialization, GeoJSON layers
│   ├── routing.js      # OSRM route generation
│   ├── simulation.js   # Bus movement, battery depletion
│   ├── ui.js           # DOM updates, event handlers
│   └── utils.js        # Helper functions
└── README.md
```

## 🛠️ Technology Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Mapbox GL JS | 3.0.1 | Map rendering, GeoJSON layers |
| Mapbox Places API | - | City search (NY State) |
| Turf.js | 6.5.0 | Geospatial calculations |
| OSRM | Public API | Street-based routing |
| Vanilla JS | ES Modules | Application logic |

## 📊 ESB Efficiency Data

### Type A (Small Bus, ≤30 students)
- Fair Weather: 1.3 kWh/mile
- Cold Weather: 1.6 kWh/mile
- Extreme Cold: 1.8-2.0 kWh/mile (avg: 1.9)

### Type C (Full Size, ≤72 students)
- All efficiencies are 50% higher than Type A
- Fair Weather: 1.95 kWh/mile
- Cold Weather: 2.4 kWh/mile
- Extreme Cold: 2.85 kWh/mile

## 💰 Cost Parameters

### Electricity Rates
- Overnight (10PM - 6AM): $0.18/kWh
- Daytime (6AM - 10PM): $0.36/kWh

### Diesel Comparison
- Fuel Price: $3.00/gallon
- Type A MPG: 9
- Type C MPG: 6

## 🎯 Educational Goals

1. **Understand Range Anxiety**: See how weather affects range and plan accordingly
2. **Learn Risk-Free Range Concept**: Only assign ESBs to routes they can complete year-round
3. **Optimize Charging**: Maximize overnight charging to minimize costs
4. **Compare TCO**: Visualize electric vs. diesel operating costs
5. **Right-Size Batteries**: Understand the relationship between route distance and battery capacity

## 📝 License

Demonstration project for educational purposes.

---

**Built with ⚡ for cleaner, quieter school transportation**

