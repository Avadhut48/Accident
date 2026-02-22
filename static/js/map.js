// Enhanced Interactive map functionality for Mumbai Safe Route Navigator
// WITH VEHICLE TYPE SELECTION FEATURE

let map;
let routeLayers = [];
let markers = [];
let currentRoutes = [];
let isFullscreen = false;
let accidentReportMode = false;
let accidentMarkers = [];
let tempAccidentMarker = null;
let selectedAccidentLocation = null;
let currentVehicleInfo = null;  // NEW: For vehicle type feature

// Initialize map centered on Mumbai with modern dark tiles
function initMap() {
    map = L.map('map', {
        zoomControl: false
    }).setView([19.0760, 72.8777], 11);
    
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 18,
        subdomains: 'abcd'
    }).addTo(map);
    
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);
    
    console.log('✅ Modern map initialized');
    
    map.on('zoomstart', function() {
        map.getContainer().style.cursor = 'wait';
    });
    
    map.on('zoomend', function() {
        map.getContainer().style.cursor = '';
    });
    
    // Map click handler for accident reporting
    map.on('click', function(e) {
        if (!accidentReportMode) return;
        
        const { lat, lng } = e.latlng;
        selectedAccidentLocation = { lat, lng };
        
        if (tempAccidentMarker) {
            map.removeLayer(tempAccidentMarker);
        }
        
        const tempIcon = L.divIcon({
            className: 'temp-accident-marker',
            html: '<div class="accident-marker" style="background:#dc3545; opacity:0.7;"><i class="fas fa-plus" style="color:#fff; font-size:14px;"></i></div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        tempAccidentMarker = L.marker([lat, lng], { icon: tempIcon }).addTo(map);
        
        const form = document.getElementById('accidentReportForm');
        const preview = document.getElementById('accidentLocationPreview');
        
        if (form) form.style.display = 'block';
        if (preview) preview.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        
        document.getElementById('map').style.cursor = '';
        
        showToast('success', 'Location selected! Fill in the details below.');
    });
}

function clearRoutes() {
    routeLayers.forEach(layer => map.removeLayer(layer));
    routeLayers = [];
    
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

function getRiskColor(riskLevel) {
    const colors = {
        'low': '#28a745',
        'medium': '#ffc107',
        'high': '#dc3545'
    };
    return colors[riskLevel] || '#6c757d';
}

function displayRoutes(routes, startName, endName) {
    clearRoutes();
    
    const startCoords = routes[0].waypoints[0];
    const startIcon = L.divIcon({
        className: 'custom-marker-container',
        html: `
            <div class="custom-marker start-marker-modern">
                <div class="marker-pulse"></div>
                <div class="marker-icon">
                    <i class="fas fa-map-marker-alt"></i>
                </div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40]
    });
    
    const startMarker = L.marker([startCoords[0], startCoords[1]], {
        icon: startIcon,
        zIndexOffset: 1000
    }).addTo(map);
    
    startMarker.bindPopup(`
        <div style="text-align: center; padding: 0.5rem;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🚗</div>
            <strong style="color: #11998e; font-size: 1.1rem;">Start</strong>
            <div style="color: #666; margin-top: 0.25rem;">${startName}</div>
        </div>
    `);
    markers.push(startMarker);
    
    const endCoords = routes[0].waypoints[routes[0].waypoints.length - 1];
    const endIcon = L.divIcon({
        className: 'custom-marker-container',
        html: `
            <div class="custom-marker end-marker-modern">
                <div class="marker-pulse end-pulse"></div>
                <div class="marker-icon">
                    <i class="fas fa-flag-checkered"></i>
                </div>
            </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 40]
    });
    
    const endMarker = L.marker([endCoords[0], endCoords[1]], {
        icon: endIcon,
        zIndexOffset: 1000
    }).addTo(map);
    
    endMarker.bindPopup(`
        <div style="text-align: center; padding: 0.5rem;">
            <div style="font-size: 2rem; margin-bottom: 0.5rem;">🏁</div>
            <strong style="color: #ee0979; font-size: 1.1rem;">Destination</strong>
            <div style="color: #666; margin-top: 0.25rem;">${endName}</div>
        </div>
    `);
    markers.push(endMarker);
    
    routes.forEach((route, index) => {
        const color = getRiskColor(route.risk_level);
        const opacity = route.recommended ? 1.0 : 0.6;
        const weight = route.recommended ? 6 : 4;
        
        const polyline = L.polyline(route.waypoints, {
            color: color,
            weight: weight,
            opacity: opacity,
            routeId: route.id,
            dashArray: route.recommended ? '0' : '10, 10',
            className: 'route-line'
        }).addTo(map);
        
        if (route.recommended) {
            const glowLine = L.polyline(route.waypoints, {
                color: color,
                weight: weight + 6,
                opacity: 0.2,
                routeId: route.id
            }).addTo(map);
            routeLayers.push(glowLine);
        }
        
        const riskIcon = route.risk_level === 'low' ? '✅' : 
                        route.risk_level === 'medium' ? '⚠️' : '🚫';
        
        const popupContent = `
            <div style="min-width: 220px; font-family: 'Poppins', sans-serif;">
                <div style="text-align: center; margin-bottom: 1rem;">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">${riskIcon}</div>
                    <h6 style="margin: 0; color: ${color}; font-weight: 600; font-size: 1.1rem;">
                        ${route.recommended ? '⭐ ' : ''}${route.name}
                    </h6>
                </div>
                <div style="background: #f8f9fa; padding: 0.75rem; border-radius: 8px;">
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 0.5rem;">
                        <div style="text-align: center;">
                            <div style="font-size: 1.3rem; font-weight: 700; color: #667eea;">${route.distance_km}</div>
                            <div style="font-size: 0.75rem; color: #999;">KILOMETERS</div>
                        </div>
                        <div style="text-align: center;">
                            <div style="font-size: 1.3rem; font-weight: 700; color: #667eea;">${route.time_minutes}</div>
                            <div style="font-size: 0.75rem; color: #999;">MINUTES</div>
                        </div>
                    </div>
                    <div style="margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid #ddd;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <span style="font-weight: 600; color: #555;">Risk Score:</span>
                            <span style="background: ${color}; color: white; padding: 0.25rem 0.75rem; border-radius: 12px; font-weight: 600;">
                                ${route.risk_score}%
                            </span>
                        </div>
                    </div>
                </div>
                ${route.recommended ? '<div style="text-align: center; margin-top: 0.75rem; color: #11998e; font-weight: 600;">⭐ Recommended Route</div>' : ''}
            </div>
        `;
        
        polyline.bindPopup(popupContent);
        
        polyline.on('click', function() {
            highlightRoute(route.id);
            showRouteDetails(route);
            map.fitBounds(polyline.getBounds(), { 
                padding: [50, 50],
                animate: true,
                duration: 0.5
            });
        });
        
        routeLayers.push(polyline);
        
        setTimeout(() => {
            polyline.setStyle({ opacity: opacity });
        }, index * 200);
    });
    
    const allPoints = routes.flatMap(r => r.waypoints);
    map.fitBounds(allPoints, { 
        padding: [80, 80],
        animate: true,
        duration: 1
    });
    
    showToast('success', `Found ${routes.length} routes from ${startName} to ${endName}`);
    
    const totalAccidents = routes.reduce((sum, r) => sum + (r.accidents_on_route || 0), 0);
    if (totalAccidents > 0) {
        setTimeout(() => {
            showToast('error', `⚠️ ${totalAccidents} active accident(s) detected on these routes!`);
        }, 500);
    }
}

function displayRouteCards(routes) {
    const container = document.getElementById('routeCards');
    if (!container) return;
    
    container.innerHTML = '';
    
    routes.forEach((route, index) => {
        const card = document.createElement('div');
        card.className = `route-card ${route.risk_level}-risk ${route.recommended ? 'recommended' : ''}`;
        card.setAttribute('data-route-id', route.id);
        
        const riskIcon = route.risk_level === 'low' ? 'fa-check-circle' : 
                        route.risk_level === 'medium' ? 'fa-exclamation-circle' : 
                        'fa-times-circle';
        
        card.innerHTML = `
            <h6><i class="fas fa-route"></i> ${route.name}</h6>
            
            <div class="risk-badge risk-${route.risk_level}">
                <i class="fas ${riskIcon}"></i>
                ${route.risk_level.toUpperCase()} RISK - ${route.risk_score}%
            </div>
            
            <div class="risk-score-bar">
                <div class="risk-score-fill ${route.risk_level}" style="width: 0%"></div>
            </div>
            
            <div class="route-stats">
                <div>
                    <span class="stat-value"><i class="fas fa-road"></i> ${route.distance_km}</span>
                    <span class="stat-label">KM</span>
                </div>
                <div>
                    <span class="stat-value"><i class="fas fa-clock"></i> ${route.time_minutes}</span>
                    <span class="stat-label">MIN</span>
                </div>
                <div>
                    <span class="stat-value"><i class="fas fa-shield-alt"></i> ${route.risk_score}%</span>
                    <span class="stat-label">RISK</span>
                </div>
            </div>
        `;
        
        setTimeout(() => {
            const fillBar = card.querySelector('.risk-score-fill');
            if (fillBar) {
                fillBar.style.width = route.risk_score + '%';
            }
        }, 100 + (index * 100));
        
        card.addEventListener('click', () => {
            highlightRoute(route.id);
            showRouteDetails(route);
            
            if (window.innerWidth < 992) {
                setTimeout(() => {
                    document.getElementById('routeDetails')?.scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });
                }, 300);
            }
        });
        
        card.style.opacity = '0';
        card.style.transform = 'translateX(-20px)';
        container.appendChild(card);
        
        setTimeout(() => {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateX(0)';
        }, 50 + (index * 100));
    });
    
    const resultsContainer = document.getElementById('routeResults');
    if (resultsContainer) {
        resultsContainer.style.display = 'block';
        resultsContainer.style.opacity = '0';
        resultsContainer.style.transform = 'translateY(20px)';
        setTimeout(() => {
            resultsContainer.style.transition = 'all 0.5s ease';
            resultsContainer.style.opacity = '1';
            resultsContainer.style.transform = 'translateY(0)';
        }, 100);
    }
}

function highlightRoute(routeId) {
    document.querySelectorAll('.route-card').forEach(card => {
        card.classList.remove('active');
    });
    
    const activeCard = document.querySelector(`[data-route-id="${routeId}"]`);
    if (activeCard) {
        activeCard.classList.add('active');
    }
    
    routeLayers.forEach(layer => {
        if (layer.options.routeId === routeId) {
            layer.setStyle({ weight: 8, opacity: 1.0 });
            layer.bringToFront();
        } else {
            layer.setStyle({ weight: 4, opacity: 0.4 });
        }
    });
}

function showRouteDetails(route) {
    const detailsContainer = document.getElementById('detailsContent');
    if (!detailsContainer) return;
    
    let riskDetailsHTML = '';
    if (route.risk_details && route.risk_details.length > 0) {
        riskDetailsHTML = `
            <h6>🚨 High-Risk Segments:</h6>
            <ul class="list-group">
                ${route.risk_details.slice(0, 5).map(detail => `
                    <li class="list-group-item d-flex justify-content-between align-items-center">
                        ${detail.road}
                        <span class="badge bg-danger">${detail.risk.toFixed(1)}% risk</span>
                    </li>
                `).join('')}
            </ul>
        `;
    }
    
    // Accident impact section
    let accidentImpactHTML = '';
    if (route.accidents_on_route && route.accidents_on_route > 0) {
        const accMult = route.accident_multiplier || 1.0;
        const impact = Math.round((accMult - 1.0) * 100);
        
        accidentImpactHTML = `
            <div style="background:rgba(220,53,69,0.1);border:1px solid #dc3545;border-radius:8px;padding:10px 14px;margin-top:12px;">
                <h6 style="margin:0 0 6px;color:#dc3545;"><i class="fas fa-exclamation-triangle"></i> Active Accidents</h6>
                <p style="margin:0;color:#666;font-size:.85rem;">
                    <strong style="color:#dc3545;">${route.accidents_on_route} accident(s)</strong> reported on this route —
                    risk increased by <strong style="color:#dc3545;">+${impact}%</strong>
                </p>
                ${route.accident_details && route.accident_details.length > 0 ? `
                    <ul style="margin:8px 0 0 0; padding-left:20px; font-size:0.75rem; color:#666;">
                        ${route.accident_details.map(a => `<li>${a.severity} accident ${a.distance_from_route_km}km from route</li>`).join('')}
                    </ul>
                ` : ''}
            </div>`;
    }
    
    // NEW: Vehicle impact section
    let vehicleImpactHTML = '';
    if (route.vehicle_impact && currentVehicleInfo) {
        const vi = route.vehicle_impact;
        
        vehicleImpactHTML = `
            <div class="vehicle-info-section">
                <div class="vehicle-info-badge">
                    <span style="font-size: 1.2rem;">${currentVehicleInfo.icon}</span>
                    <span>Route calculated for: <strong>${currentVehicleInfo.name}</strong></span>
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
                                <span class="vehicle-stat-label">Time Adjustment:</span>
                                <span class="vehicle-stat-value ${vi.time_adjustment < 1.0 ? 'increased' : 'decreased'}">
                                    ${vi.time_adjustment < 1.0 ? '+' : ''}${Math.round((1 - vi.time_adjustment) * 100)}%
                                </span>
                            </div>
                        </div>
                        <p style="margin-top: 0.5rem; margin-bottom: 0; font-size: 0.75rem; opacity: 0.9;">
                            <i class="fas fa-info-circle"></i> ${currentVehicleInfo.description}
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
    
    detailsContainer.innerHTML = `
        <div class="alert alert-custom ${route.recommended ? 'success' : 'warning'}">
            <h5>${route.recommended ? '✅ Recommended Route' : '⚠️ Alternative Route'}</h5>
            <p class="mb-0">${route.name} - ${route.risk_level.toUpperCase()} risk level</p>
        </div>
        
        <table class="details-table">
            <tr>
                <td>Total Distance</td>
                <td>${route.distance_km} km</td>
            </tr>
            <tr>
                <td>Estimated Time</td>
                <td>${route.time_minutes} minutes</td>
            </tr>
            <tr>
                <td>Risk Score</td>
                <td><span class="risk-badge risk-${route.risk_level}">${route.risk_score}%</span></td>
            </tr>
            <tr>
                <td>Risk Level</td>
                <td>${route.risk_level.toUpperCase()}</td>
            </tr>
        </table>
        
        ${vehicleImpactHTML}
        ${accidentImpactHTML}
        ${riskDetailsHTML}
        
        <div class="mt-3">
            <h6>💡 Safety Tips:</h6>
            <ul>
                ${route.risk_level === 'high' ? 
                    '<li>⚠️ This route has high accident risk. Consider alternative routes.</li>' +
                    '<li>Drive with extra caution, especially during peak hours.</li>' +
                    '<li>Maintain safe following distance.</li>'
                    : route.risk_level === 'medium' ?
                    '<li>⚡ Moderate risk route. Stay alert and follow traffic rules.</li>' +
                    '<li>Be cautious at intersections and busy junctions.</li>'
                    :
                    '<li>✅ Relatively safe route based on historical data.</li>' +
                    '<li>Continue following all traffic safety guidelines.</li>'
                }
            </ul>
        </div>
    `;
    
    const detailsEl = document.getElementById('routeDetails');
    if (detailsEl) detailsEl.style.display = 'block';
}

// Form submission handler WITH VEHICLE TYPE
document.getElementById('routeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const start = document.getElementById('startLocation').value;
    const end = document.getElementById('endLocation').value;
    const vehicleType = document.getElementById('vehicleType')?.value || 'car';  // NEW
    
    if (!start || !end) {
        showToast('error', 'Please select both starting point and destination');
        return;
    }
    
    if (start === end) {
        showToast('error', 'Start and destination cannot be the same');
        return;
    }
    
    const loadingIndicator = document.getElementById('loadingIndicator');
    const findRoutesBtn = document.getElementById('findRoutesBtn');
    const routeResults = document.getElementById('routeResults');
    const routeDetails = document.getElementById('routeDetails');
    
    if (loadingIndicator) loadingIndicator.style.display = 'block';
    if (findRoutesBtn) findRoutesBtn.disabled = true;
    if (routeResults) routeResults.style.display = 'none';
    if (routeDetails) routeDetails.style.display = 'none';
    
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
        currentVehicleInfo = data.vehicle_info;  // NEW
        
        displayRoutes(data.routes, data.start, data.end);
        displayRouteCards(data.routes);
        createComparisonChart(data.routes);
        showSaveFavoriteButton();
        
        // NEW: Show vehicle-specific toast
        if (vehicleType !== 'car' && currentVehicleInfo) {
            const impactPercent = Math.round((currentVehicleInfo.risk_multiplier - 1) * 100);
            showToast('info', `${currentVehicleInfo.icon} Routes adjusted for ${currentVehicleInfo.name}: +${impactPercent}% risk`);
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
        if (loadingIndicator) loadingIndicator.style.display = 'none';
        if (findRoutesBtn) findRoutesBtn.disabled = false;
    }
});

// ========== ACCIDENT REPORTING FUNCTIONALITY ==========

async function loadActiveAccidents() {
    try {
        const resp = await fetch('/api/accidents/active');
        if (!resp.ok) {
            console.warn('Failed to load accidents - API may not be available');
            return;
        }
        
        const data = await resp.json();
        
        if (data.success) {
            renderAccidentMarkers(data.accidents);
            renderAccidentsList(data.accidents);
            
            const badge = document.getElementById('accidentCountBadge');
            if (badge) {
                badge.textContent = data.count;
            }
        }
    } catch (e) {
        console.error('Failed to load accidents:', e);
    }
}

function renderAccidentMarkers(accidents) {
    accidentMarkers.forEach(m => map.removeLayer(m));
    accidentMarkers = [];
    
    accidents.forEach(acc => {
        const severityColors = {
            'minor': '#28a745',
            'moderate': '#ffc107',
            'severe': '#ff6b35',
            'fatal': '#dc3545'
        };
        
        const color = severityColors[acc.severity] || '#dc3545';
        
        const icon = L.divIcon({
            className: 'accident-marker-container',
            html: `
                <div class="accident-marker" style="background:${color}; width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; box-shadow: 0 2px 8px rgba(0,0,0,0.3); animation: pulse-accident 2s infinite;">
                    <i class="fas fa-exclamation" style="color:#fff; font-size:14px;"></i>
                </div>`,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        const marker = L.marker([acc.latitude, acc.longitude], {
            icon: icon,
            zIndexOffset: 2000
        }).addTo(map);
        
        const timeAgo = formatTimeAgo(new Date(acc.timestamp));
        marker.bindPopup(`
            <div style="font-family:'Poppins',sans-serif; min-width:180px;">
                <div style="font-weight:600; color:#dc3545; margin-bottom:8px;">
                    <i class="fas fa-exclamation-triangle"></i> Accident Reported
                </div>
                <div style="margin-bottom:6px;">
                    <span class="accident-severity severity-${acc.severity}" style="background:${color}; color:white; padding:2px 8px; border-radius:4px; font-size:0.75rem; text-transform:uppercase;">${acc.severity}</span>
                </div>
                ${acc.description ? `<div style="font-size:0.85rem; color:#666; margin-bottom:6px;">"${acc.description}"</div>` : ''}
                <div style="font-size:0.75rem; color:#999;">
                    <i class="fas fa-clock"></i> ${timeAgo}
                    ${acc.verified ? '<i class="fas fa-check-circle" style="color:#28a745; margin-left:8px;"></i> Verified' : ''}
                </div>
                <div style="margin-top:8px; display:flex; gap:8px;">
                    <button class="vote-btn" onclick="voteAccident('${acc.id}', 'up')" style="padding:4px 8px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer;">
                        👍 ${acc.upvotes}
                    </button>
                    <button class="vote-btn" onclick="voteAccident('${acc.id}', 'down')" style="padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer;">
                        👎 ${acc.downvotes}
                    </button>
                </div>
            </div>
        `);
        
        accidentMarkers.push(marker);
    });
}

function renderAccidentsList(accidents) {
    const container = document.getElementById('activeAccidentsContent');
    if (!container) return;
    
    if (accidents.length === 0) {
        container.innerHTML = `
            <div class="empty-history" style="text-align:center; padding:20px; color:#999;">
                <i class="fas fa-check-circle" style="color:#28a745; font-size:40px; margin-bottom:10px;"></i>
                <p>No active accidents reported</p>
            </div>`;
        return;
    }
    
    container.innerHTML = accidents.slice(0, 10).map(acc => {
        const timeAgo = formatTimeAgo(new Date(acc.timestamp));
        const severityColors = {
            'minor': '#28a745',
            'moderate': '#ffc107',
            'severe': '#ff6b35',
            'fatal': '#dc3545'
        };
        const color = severityColors[acc.severity] || '#dc3545';
        
        return `
            <div class="accident-item" data-lat="${acc.latitude}" data-lon="${acc.longitude}" style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; margin-bottom:10px; cursor:pointer; transition:all 0.3s;">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:6px;">
                    <span class="accident-severity" style="background:${color}; color:white; padding:3px 10px; border-radius:4px; font-size:0.7rem; text-transform:uppercase; font-weight:600;">${acc.severity}</span>
                    <div style="font-size:0.7rem; color:#999;">
                        <i class="fas fa-clock"></i> ${timeAgo}
                    </div>
                </div>
                ${acc.description ? `<div style="font-size:0.8rem; color:#ccc; margin-bottom:6px;">${acc.description}</div>` : ''}
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                    <div style="display:flex; gap:8px;">
                        <button class="vote-btn" onclick="voteAccident('${acc.id}', 'up'); event.stopPropagation();" style="padding:3px 8px; background:#28a745; color:white; border:none; border-radius:4px; font-size:0.7rem; cursor:pointer;">
                            👍 ${acc.upvotes}
                        </button>
                        <button class="vote-btn" onclick="voteAccident('${acc.id}', 'down'); event.stopPropagation();" style="padding:3px 8px; background:#dc3545; color:white; border:none; border-radius:4px; font-size:0.7rem; cursor:pointer;">
                            👎 ${acc.downvotes}
                        </button>
                    </div>
                    ${acc.verified ? '<span style="color:#28a745; font-size:0.7rem;"><i class="fas fa-check-circle"></i> Verified</span>' : ''}
                </div>
            </div>`;
    }).join('');
    
    container.querySelectorAll('.accident-item').forEach(item => {
        item.addEventListener('click', () => {
            const lat = parseFloat(item.dataset.lat);
            const lon = parseFloat(item.dataset.lon);
            map.setView([lat, lon], 15, { animate: true });
        });
        
        item.addEventListener('mouseenter', () => {
            item.style.background = 'rgba(255,255,255,0.1)';
        });
        
        item.addEventListener('mouseleave', () => {
            item.style.background = 'rgba(255,255,255,0.05)';
        });
    });
}

document.getElementById('enableReportMode')?.addEventListener('click', () => {
    accidentReportMode = true;
    
    const toggle = document.getElementById('reportModeToggle');
    if (toggle) toggle.style.display = 'none';
    
    showToast('info', 'Click anywhere on the map to report an accident');
    document.getElementById('map').style.cursor = 'crosshair';
});

document.getElementById('submitAccidentReport')?.addEventListener('click', async () => {
    if (!selectedAccidentLocation) {
        showToast('error', 'Please click on the map first');
        return;
    }
    
    const severity = document.getElementById('accidentSeverity')?.value;
    const description = document.getElementById('accidentDescription')?.value;
    
    try {
        const resp = await fetch('/api/accidents/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                latitude: selectedAccidentLocation.lat,
                longitude: selectedAccidentLocation.lng,
                severity: severity,
                description: description
            })
        });
        
        const data = await resp.json();
        
        if (data.success) {
            showToast('success', 'Accident reported! Thank you for keeping everyone safe.');
            cancelAccidentReport();
            loadActiveAccidents();
            map.setView([selectedAccidentLocation.lat, selectedAccidentLocation.lng], 14, { animate: true });
        } else {
            showToast('error', 'Failed to report: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        console.error('Failed to submit:', e);
        showToast('error', 'Network error. Please try again.');
    }
});

document.getElementById('cancelAccidentReport')?.addEventListener('click', cancelAccidentReport);

function cancelAccidentReport() {
    accidentReportMode = false;
    selectedAccidentLocation = null;
    
    if (tempAccidentMarker) {
        map.removeLayer(tempAccidentMarker);
        tempAccidentMarker = null;
    }
    
    const form = document.getElementById('accidentReportForm');
    const toggle = document.getElementById('reportModeToggle');
    const desc = document.getElementById('accidentDescription');
    
    if (form) form.style.display = 'none';
    if (toggle) toggle.style.display = 'block';
    if (desc) desc.value = '';
    
    document.getElementById('map').style.cursor = '';
}

window.voteAccident = async function(accidentId, voteType) {
    try {
        const resp = await fetch('/api/accidents/vote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                accident_id: accidentId,
                vote_type: voteType
            })
        });
        
        const data = await resp.json();
        
        if (data.success) {
            loadActiveAccidents();
        }
    } catch (e) {
        console.error('Failed to vote:', e);
    }
};

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

const accidentStyles = document.createElement('style');
accidentStyles.textContent = `
    @keyframes pulse-accident {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.1); opacity: 0.8; }
    }
`;
document.head.appendChild(accidentStyles);

// ========== FAVORITES FUNCTIONALITY ==========

let allFavorites = [];

async function loadFavorites() {
    try {
        const response = await fetch('/api/favorites');
        const data = await response.json();
        
        if (data.success) {
            allFavorites = data.favorites;
            updateFavoritesDropdown();
            updateFavoritesList();
            
            if (allFavorites.length > 0) {
                const favCard = document.getElementById('savedFavorites');
                if (favCard) favCard.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error loading favorites:', error);
    }
}

function updateFavoritesDropdown() {
    const dropdown = document.getElementById('favoritesDropdown');
    if (!dropdown) return;
    
    dropdown.innerHTML = '<option value="">Choose a saved route...</option>';
    
    allFavorites.forEach(fav => {
        const option = document.createElement('option');
        option.value = fav.id;
        option.textContent = `⭐ ${fav.name} (${fav.start} → ${fav.end})`;
        dropdown.appendChild(option);
    });
}

function updateFavoritesList() {
    const container = document.getElementById('favoritesList');
    if (!container) return;
    
    if (allFavorites.length === 0) {
        container.innerHTML = `
            <div class="empty-favorites">
                <i class="fas fa-star"></i>
                <p>No saved favorites yet!</p>
            </div>
        `;
        const favCard = document.getElementById('savedFavorites');
        if (favCard) favCard.style.display = 'none';
        return;
    }
    
    container.innerHTML = '';
    allFavorites.forEach(fav => {
        const item = document.createElement('div');
        item.className = 'favorite-item';
        item.innerHTML = `
            <div class="favorite-header">
                <div class="favorite-name">
                    <i class="fas fa-star"></i>
                    ${fav.name}
                </div>
                <div class="favorite-actions">
                    <button class="favorite-btn use" title="Use this route" onclick="useFavorite(${fav.id})">
                        <i class="fas fa-play"></i>
                    </button>
                    <button class="favorite-btn delete" title="Delete" onclick="deleteFavorite(${fav.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="favorite-route">
                <span><i class="fas fa-map-marker-alt"></i> ${fav.start}</span>
                <span><i class="fas fa-arrow-right"></i></span>
                <span><i class="fas fa-flag-checkered"></i> ${fav.end}</span>
            </div>
            <div class="favorite-meta">
                <span>Added: ${new Date(fav.created_at).toLocaleDateString()}</span>
                <span>Used: ${fav.used_count || 0} times</span>
            </div>
        `;
        
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.favorite-btn')) {
                useFavorite(fav.id);
            }
        });
        
        container.appendChild(item);
    });
    
    const favCard = document.getElementById('savedFavorites');
    if (favCard) favCard.style.display = 'block';
}

window.useFavorite = async function(favoriteId) {
    const favorite = allFavorites.find(f => f.id === favoriteId);
    if (!favorite) return;
    
    document.getElementById('startLocation').value = favorite.start;
    document.getElementById('endLocation').value = favorite.end;
    
    try {
        await fetch(`/api/favorites/${favoriteId}/use`, { method: 'POST' });
    } catch (error) {
        console.error('Error recording usage:', error);
    }
    
    document.getElementById('findRoutesBtn').click();
    
    showToast('success', `Using favorite: ${favorite.name}`);
};

window.deleteFavorite = async function(favoriteId) {
    if (!confirm('Are you sure you want to delete this favorite?')) {
        return;
    }
    
    try {
        const response = await fetch(`/api/favorites/${favoriteId}`, {
            method: 'DELETE'
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('success', 'Favorite deleted successfully');
            loadFavorites();
        } else {
            showToast('error', 'Failed to delete favorite');
        }
    } catch (error) {
        console.error('Error deleting favorite:', error);
        showToast('error', 'Error deleting favorite');
    }
};

document.getElementById('favoritesDropdown')?.addEventListener('change', (e) => {
    const favoriteId = parseInt(e.target.value);
    if (favoriteId) {
        useFavorite(favoriteId);
    }
});

function showSaveFavoriteButton() {
    const startLocation = document.getElementById('startLocation')?.value;
    const endLocation = document.getElementById('endLocation')?.value;
    
    if (startLocation && endLocation) {
        const saveBtn = document.getElementById('saveFavoriteBtn');
        const shareBtn = document.getElementById('shareWhatsAppBtn');
        if (saveBtn) saveBtn.style.display = 'block';
        if (shareBtn) shareBtn.style.display = 'block';
    }
}

// ========== ROUTE COMPARISON CHART ==========

let comparisonChart = null;

function createComparisonChart(routes) {
    const ctx = document.getElementById('routeComparisonChart');
    
    if (!ctx) return;
    
    if (comparisonChart) {
        comparisonChart.destroy();
    }
    
    const routeNames = routes.map(r => r.name);
    const riskScores = routes.map(r => r.risk_score);
    const timesMinutes = routes.map(r => r.time_minutes);
    const distancesKm = routes.map(r => r.distance_km);
    
    const riskColors = routes.map(r => {
        if (r.risk_level === 'low') return 'rgba(40, 167, 69, 0.8)';
        if (r.risk_level === 'medium') return 'rgba(255, 193, 7, 0.8)';
        return 'rgba(220, 53, 69, 0.8)';
    });
    
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: routeNames,
            datasets: [
                {
                    label: 'Risk Score (%)',
                    data: riskScores,
                    backgroundColor: riskColors,
                    borderColor: riskColors.map(c => c.replace('0.8', '1')),
                    borderWidth: 2,
                    yAxisID: 'y'
                },
                {
                    label: 'Time (minutes)',
                    data: timesMinutes,
                    backgroundColor: 'rgba(102, 126, 234, 0.8)',
                    borderColor: 'rgba(102, 126, 234, 1)',
                    borderWidth: 2,
                    yAxisID: 'y1'
                },
                {
                    label: 'Distance (km)',
                    data: distancesKm,
                    backgroundColor: 'rgba(52, 211, 153, 0.8)',
                    borderColor: 'rgba(52, 211, 153, 1)',
                    borderWidth: 2,
                    yAxisID: 'y1'
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            plugins: {
                title: {
                    display: true,
                    text: 'Route Comparison: Risk vs Time vs Distance',
                    color: '#fff',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                },
                legend: {
                    labels: {
                        color: '#fff',
                        font: {
                            size: 12
                        }
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    titleColor: '#fff',
                    bodyColor: '#fff',
                    callbacks: {
                        afterLabel: function(context) {
                            if (context.datasetIndex === 0) {
                                const route = routes[context.dataIndex];
                                return `Level: ${route.risk_level.toUpperCase()}`;
                            }
                        }
                    }
                }
            },
            scales: {
                y: {
                    type: 'linear',
                    display: true,
                    position: 'left',
                    title: {
                        display: true,
                        text: 'Risk Score (%)',
                        color: '#fff'
                    },
                    ticks: {
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                y1: {
                    type: 'linear',
                    display: true,
                    position: 'right',
                    title: {
                        display: true,
                        text: 'Time (min) / Distance (km)',
                        color: '#fff'
                    },
                    ticks: {
                        color: '#fff'
                    },
                    grid: {
                        drawOnChartArea: false,
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        color: '#fff'
                    },
                    grid: {
                        color: 'rgba(255, 255, 255, 0.1)'
                    }
                }
            }
        }
    });
    
    const chartContainer = document.getElementById('comparisonChart');
    if (chartContainer) {
        chartContainer.style.display = 'block';
        
        setTimeout(() => {
            chartContainer.style.opacity = '0';
            chartContainer.style.transform = 'translateY(20px)';
            setTimeout(() => {
                chartContainer.style.transition = 'all 0.5s ease';
                chartContainer.style.opacity = '1';
                chartContainer.style.transform = 'translateY(0)';
            }, 100);
        }, 100);
    }
}

// ========== WHATSAPP SHARING ==========

let currentRoutesForSharing = [];

document.getElementById('shareWhatsAppBtn')?.addEventListener('click', () => {
    const start = document.getElementById('startLocation')?.value;
    const end = document.getElementById('endLocation')?.value;
    
    if (!start || !end || currentRoutes.length === 0) {
        showToast('error', 'Please find routes first');
        return;
    }
    
    currentRoutesForSharing = currentRoutes;
    
    const shareStart = document.getElementById('shareStartLocation');
    const shareEnd = document.getElementById('shareEndLocation');
    if (shareStart) shareStart.textContent = start;
    if (shareEnd) shareEnd.textContent = end;
    
    const optionsContainer = document.getElementById('shareRouteOptions');
    if (!optionsContainer) return;
    
    optionsContainer.innerHTML = '';
    
    currentRoutes.forEach((route, index) => {
        const option = document.createElement('div');
        option.className = 'share-route-option';
        
        const riskIcon = route.risk_level === 'low' ? '🟢' : 
                        route.risk_level === 'medium' ? '🟡' : '🔴';
        
        option.innerHTML = `
            <div class="route-name">
                ${riskIcon} ${route.name}
                ${route.recommended ? ' ⭐ (Recommended)' : ''}
            </div>
            <div class="route-stats">
                <span>📍 ${route.distance_km} km</span>
                <span>⏱️ ${route.time_minutes} min</span>
                <span>⚡ ${route.risk_score}% risk</span>
            </div>
        `;
        
        option.addEventListener('click', () => {
            shareRouteViaWhatsApp(route, start, end);
        });
        
        optionsContainer.appendChild(option);
    });
    
    const modal = new bootstrap.Modal(document.getElementById('shareWhatsAppModal'));
    modal.show();
});

function shareRouteViaWhatsApp(route, start, end) {
    const riskEmoji = route.risk_level === 'low' ? '🟢' : 
                     route.risk_level === 'medium' ? '🟡' : '🔴';
    
    const message = `
🗺️ *Mumbai Safe Route Navigator*

📍 *Route:* ${start} → ${end}
🛣️ *Type:* ${route.name}

${route.recommended ? '⭐ *RECOMMENDED - Safest Route*\n\n' : ''}
📊 *Route Details:*
${riskEmoji} Risk Level: ${route.risk_level.toUpperCase()} (${route.risk_score}%)
📏 Distance: ${route.distance_km} km
⏱️ Time: ${route.time_minutes} minutes

${route.risk_level === 'high' ? '⚠️ *Warning:* This route has high accident risk. Drive carefully!\n\n' : ''}
${route.risk_level === 'low' ? '✅ This is a safe route. Have a pleasant journey!\n\n' : ''}

💡 *Safety Tips:*
${getSafetyTips(route.risk_level)}

🚗 Stay safe and drive carefully!

---
Generated by Mumbai Safe Route Navigator
`.trim();
    
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
    
    window.open(whatsappUrl, '_blank');
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('shareWhatsAppModal'));
    if (modal) modal.hide();
    
    showToast('success', 'Opening WhatsApp...');
}

function getSafetyTips(riskLevel) {
    const tips = {
        'low': '- Maintain steady speed\n- Stay in your lane\n- Enjoy your safe journey',
        'medium': '- Stay alert for sudden stops\n- Watch for two-wheelers\n- Maintain safe distance',
        'high': '- Avoid sudden lane changes\n- Drive extra cautiously\n- Be aware at intersections\n- Consider alternative route'
    };
    return tips[riskLevel] || tips['medium'];
}

document.getElementById('saveFavoriteBtn')?.addEventListener('click', () => {
    const start = document.getElementById('startLocation')?.value;
    const end = document.getElementById('endLocation')?.value;
    
    if (!start || !end) {
        showToast('error', 'Please select start and end locations');
        return;
    }
    
    const modalStart = document.getElementById('modalStartLocation');
    const modalEnd = document.getElementById('modalEndLocation');
    const favName = document.getElementById('favoriteName');
    
    if (modalStart) modalStart.textContent = start;
    if (modalEnd) modalEnd.textContent = end;
    if (favName) favName.value = '';
    
    const modal = new bootstrap.Modal(document.getElementById('saveFavoriteModal'));
    modal.show();
    
    setTimeout(() => {
        if (favName) favName.focus();
    }, 500);
});

document.getElementById('confirmSaveFavorite')?.addEventListener('click', async () => {
    const name = document.getElementById('favoriteName')?.value.trim();
    const start = document.getElementById('startLocation')?.value;
    const end = document.getElementById('endLocation')?.value;
    
    if (!name) {
        showToast('error', 'Please enter a name for this favorite');
        return;
    }
    
    try {
        const response = await fetch('/api/favorites', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, start, end })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showToast('success', 'Favorite saved successfully!');
            loadFavorites();
            
            const modal = bootstrap.Modal.getInstance(document.getElementById('saveFavoriteModal'));
            if (modal) modal.hide();
        } else {
            showToast('error', data.error || 'Failed to save favorite');
        }
    } catch (error) {
        console.error('Error saving favorite:', error);
        showToast('error', 'Error saving favorite');
    }
});

// Toast notification system
function showToast(type, message) {
    const toastEl = document.getElementById(type + 'Toast');
    const toastBody = document.getElementById(type + 'ToastBody');
    
    if (toastEl && toastBody) {
        toastBody.textContent = message;
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// Swap locations button
document.getElementById('swapLocations')?.addEventListener('click', () => {
    const start = document.getElementById('startLocation');
    const end = document.getElementById('endLocation');
    
    if (start && end) {
        const temp = start.value;
        start.value = end.value;
        end.value = temp;
        
        const button = document.getElementById('swapLocations');
        if (button) {
            button.style.transform = 'rotate(180deg)';
            setTimeout(() => {
                button.style.transform = '';
            }, 300);
        }
    }
});

// Map controls
document.getElementById('recenterMap')?.addEventListener('click', () => {
    if (currentRoutes.length > 0) {
        const allPoints = currentRoutes.flatMap(r => r.waypoints);
        map.fitBounds(allPoints, { 
            padding: [80, 80],
            animate: true,
            duration: 0.8
        });
    } else {
        map.setView([19.0760, 72.8777], 11, {
            animate: true,
            duration: 0.8
        });
    }
});

document.getElementById('fullscreenMap')?.addEventListener('click', () => {
    const mapCard = document.querySelector('.map-card');
    const icon = document.querySelector('#fullscreenMap i');
    
    if (!isFullscreen && mapCard) {
        mapCard.style.position = 'fixed';
        mapCard.style.top = '0';
        mapCard.style.left = '0';
        mapCard.style.width = '100vw';
        mapCard.style.height = '100vh';
        mapCard.style.zIndex = '9999';
        mapCard.style.margin = '0';
        
        document.getElementById('map').style.height = '100vh';
        if (icon) icon.className = 'fas fa-compress';
        isFullscreen = true;
    } else if (mapCard) {
        mapCard.style.position = '';
        mapCard.style.top = '';
        mapCard.style.left = '';
        mapCard.style.width = '';
        mapCard.style.height = '';
        mapCard.style.zIndex = '';
        mapCard.style.margin = '';
        
        document.getElementById('map').style.height = '650px';
        if (icon) icon.className = 'fas fa-expand';
        isFullscreen = false;
    }
    
    setTimeout(() => map.invalidateSize(), 100);
});

document.getElementById('helpBtn')?.addEventListener('click', () => {
    const helpModal = new bootstrap.Modal(document.getElementById('helpModal'));
    helpModal.show();
});

window.addEventListener('error', (e) => {
    console.error('Application error:', e);
});

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const button = document.getElementById('findRoutesBtn');
        if (button && !button.disabled) {
            button.click();
        }
    }
    
    if (e.key === 'Escape' && isFullscreen) {
        document.getElementById('fullscreenMap')?.click();
    }
});

// NEW: Vehicle type change handler
document.getElementById('vehicleType')?.addEventListener('change', (e) => {
    const vehicleType = e.target.value;
    const helpText = document.getElementById('vehicleHelpText');
    
    const messages = {
        'car': 'Standard risk calculation',
        'bike': '🏍️ Bikes are 80% more vulnerable in accidents. Extra caution advised.',
        'auto': '🛺 Auto rickshaws are 50% more vulnerable. Drive carefully!',
        'truck': '🚚 Trucks take 30% longer to maneuver. Plan for slower speeds.',
        'bus': '🚌 Buses need more space. Time estimates adjusted.'
    };
    
    if (helpText) {
        const icon = '<i class="fas fa-info-circle"></i> ';
        helpText.innerHTML = icon + (messages[vehicleType] || messages['car']);
        helpText.style.color = vehicleType !== 'car' ? '#ffc107' : 'rgba(255,255,255,0.6)';
    }
    
    if (currentRoutes && currentRoutes.length > 0) {
        showToast('info', '🚗 Vehicle changed! Click "Find Routes" again to see updated risks.');
    }
});

// Initialize on page load
window.addEventListener('load', () => {
    initMap();
    loadFavorites();
    loadActiveAccidents();
    
    setInterval(loadActiveAccidents, 60000);
    
    console.log('✅ Application ready with vehicle type support');
    
    const style = document.createElement('style');
    style.textContent = `
        .custom-marker-container {
            background: none !important;
            border: none !important;
        }
        
        .custom-marker {
            position: relative;
            width: 40px;
            height: 40px;
        }
        
        .marker-pulse {
            position: absolute;
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: rgba(17, 153, 142, 0.4);
            animation: pulse-animation 2s infinite;
        }
        
        .end-pulse {
            background: rgba(238, 9, 121, 0.4);
        }
        
        @keyframes pulse-animation {
            0% {
                transform: scale(1);
                opacity: 1;
            }
            50% {
                transform: scale(1.3);
                opacity: 0.5;
            }
            100% {
                transform: scale(1);
                opacity: 1;
            }
        }
        
        .marker-icon {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 32px;
            height: 32px;
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 16px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
            z-index: 1;
        }
        
        .end-marker-modern .marker-icon {
            background: linear-gradient(135deg, #ee0979 0%, #ff6a00 100%);
        }
        
        .route-line {
            filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
        }
    `;
    document.head.appendChild(style);
});