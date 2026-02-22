// ========== ADD THIS TO map.js ==========

// Store current vehicle info globally
let currentVehicleInfo = null;

// ========== MODIFY FORM SUBMISSION TO INCLUDE VEHICLE TYPE ==========
// In your existing form submission handler, modify the fetch call:

// FIND THIS:
body: JSON.stringify({ start, end })

// REPLACE WITH:
const vehicleType = document.getElementById('vehicleType').value;

body: JSON.stringify({ 
    start, 
    end,
    vehicle_type: vehicleType  // ADD THIS LINE
})

// ========== AFTER RECEIVING RESPONSE, STORE VEHICLE INFO ==========
// In your form submission success handler, add:

currentVehicleInfo = data.vehicle_info;

// ========== UPDATE showRouteDetails FUNCTION ==========
// Add this to your showRouteDetails function to show vehicle impact:

function showRouteDetails(route) {
    const detailsContainer = document.getElementById('detailsContent');
    
    // ... your existing code ...
    
    // NEW: Add vehicle impact section
    let vehicleImpactHTML = '';
    if (route.vehicle_impact && currentVehicleInfo) {
        const vi = route.vehicle_impact;
        
        vehicleImpactHTML = `
            <div class="vehicle-info-section" style="margin-top: 1rem;">
                <div class="vehicle-info-badge">
                    <span style="font-size: 1.2rem;">${currentVehicleInfo.icon}</span>
                    <span>Route for: <strong>${currentVehicleInfo.name}</strong></span>
                </div>
                
                ${vi.impact_percent > 0 ? `
                    <div class="vehicle-impact-warning ${vi.impact_percent > 50 ? 'high-risk' : ''}">
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                            <i class="fas fa-exclamation-triangle"></i>
                            <strong>Vehicle Risk Adjustment</strong>
                        </div>
                        <div class="vehicle-comparison">
                            <div class="vehicle-stat">
                                <span class="vehicle-stat-label">Base Risk (Car):</span>
                                <span class="vehicle-stat-value">${vi.base_risk}%</span>
                            </div>
                            <div class="vehicle-stat">
                                <span class="vehicle-stat-label">Your Vehicle:</span>
                                <span class="vehicle-stat-value increased">+${vi.impact_percent}%</span>
                            </div>
                            <div class="vehicle-stat">
                                <span class="vehicle-stat-label">Adjusted Risk:</span>
                                <span class="vehicle-stat-value increased">${vi.adjusted_risk}%</span>
                            </div>
                            <div class="vehicle-stat">
                                <span class="vehicle-stat-label">Time Factor:</span>
                                <span class="vehicle-stat-value ${vi.time_adjustment < 1.0 ? 'increased' : 'decreased'}">
                                    ${vi.time_adjustment < 1.0 ? '+' : ''}${Math.round((1 - vi.time_adjustment) * 100)}%
                                </span>
                            </div>
                        </div>
                        <p style="margin-top: 0.5rem; margin-bottom: 0; font-size: 0.75rem; opacity: 0.9;">
                            ${currentVehicleInfo.description}
                        </p>
                    </div>
                ` : `
                    <p style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin: 0;">
                        ✅ Standard risk calculation for cars
                    </p>
                `}
            </div>
        `;
    }
    
    // Insert vehicleImpactHTML into your details template
    // Place it after the route info table and before safety tips
}

// ========== OPTIONAL: ADD VEHICLE CHANGE LISTENER ==========
// Show helpful message when user changes vehicle

document.getElementById('vehicleType')?.addEventListener('change', (e) => {
    const vehicleType = e.target.value;
    const helpText = document.getElementById('vehicleHelpText');
    
    const messages = {
        'car': 'Standard risk calculation',
        'bike': 'Bikes are 80% more vulnerable in accidents. Extra caution advised.',
        'auto': 'Auto rickshaws are 50% more vulnerable. Drive carefully!',
        'truck': 'Trucks take 30% longer to maneuver. Plan for slower speeds.',
        'bus': 'Buses need more space. Time estimates adjusted.'
    };
    
    if (helpText) {
        helpText.textContent = messages[vehicleType] || messages['car'];
        
        // Add visual feedback
        helpText.style.color = vehicleType !== 'car' ? '#ffc107' : 'rgba(255,255,255,0.6)';
    }
    
    // If routes are currently displayed, show toast to re-search
    if (currentRoutes.length > 0) {
        showToast('info', 'Vehicle changed! Click "Find Routes" again to see updated risks.');
    }
});

// ========== OPTIONAL: SHOW VEHICLE ICON IN ROUTE CARDS ==========
// Modify displayRouteCards to show vehicle icon

function displayRouteCards(routes) {
    // ... existing code ...
    
    // Add vehicle icon to each card header
    if (currentVehicleInfo) {
        // Add this after the route name in the card HTML:
        card.innerHTML = `
            <h6>
                <i class="fas fa-route"></i> ${route.name}
                <span style="float: right; font-size: 1.2rem;">${currentVehicleInfo.icon}</span>
            </h6>
            ...
        `;
    }
    
    // ... rest of existing code ...
}

// ========== COMPLETE EXAMPLE: MODIFIED FORM HANDLER ==========

document.getElementById('routeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const start = document.getElementById('startLocation').value;
    const end = document.getElementById('endLocation').value;
    const vehicleType = document.getElementById('vehicleType').value;  // NEW
    
    if (!start || !end) {
        showToast('error', 'Please select both starting point and destination');
        return;
    }
    
    if (start === end) {
        showToast('error', 'Start and destination cannot be the same');
        return;
    }
    
    // Show loading
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('findRoutesBtn').disabled = true;
    
    try {
        const response = await fetch('/api/routes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
                start, 
                end,
                vehicle_type: vehicleType  // NEW
            })
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch routes');
        }
        
        const data = await response.json();
        currentRoutes = data.routes;
        currentVehicleInfo = data.vehicle_info;  // NEW: Store vehicle info
        
        // Rest of your existing code...
        displayRoutes(data.routes, data.start, data.end);
        displayRouteCards(data.routes);
        createComparisonChart(data.routes);
        showSaveFavoriteButton();
        
        // Show vehicle-specific toast
        if (vehicleType !== 'car') {
            const vi = data.vehicle_info;
            showToast('info', `${vi.icon} Routes adjusted for ${vi.name}: +${Math.round((vi.risk_multiplier - 1) * 100)}% risk`);
        }
        
        const recommendedRoute = data.routes.find(r => r.recommended);
        if (recommendedRoute) {
            showRouteDetails(recommendedRoute);
            highlightRoute(recommendedRoute.id);
        }
        
    } catch (error) {
        console.error('Error:', error);
        showToast('error', 'Failed to generate routes. Please try again.');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('findRoutesBtn').disabled = false;
    }
});
