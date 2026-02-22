// ═══════════════════════════════════════════════════════
// MUMBAI SAFE ROUTE NAVIGATOR - UPDATED MAP.JS
// NEW: Shows which route is selected with visual highlighting
// ═══════════════════════════════════════════════════════

let map;
let routeLayers = [];
let markers = [];
let currentRoutes = [];
let accidentMarkers = [];
let accidentReportMode = false;
let tempAccidentMarker = null;
let selectedAccidentLocation = null;
let currentWeather = null;
let selectedRouteId = null;  // NEW: Track selected route

// ═══════════════════════════════════════════════════════
// 🚗 VEHICLE CONFIG
// ═══════════════════════════════════════════════════════

const VEHICLE_INFO = {
    car: {
        text: 'Cars are baseline. Standard risk applies.',
        warning: null
    },
    bike: {
        text: '🏍️ Bikes are 1.8x more risky.',
        warning: 'Motorcycles are highly vulnerable in rain.'
    },
    auto: {
        text: '🛺 Auto rickshaws are 1.5x more risky.',
        warning: 'Autos may tip on sharp turns.'
    },
    bus: {
        text: '🚌 Buses are 1.2x more risky.',
        warning: 'Large turning radius required.'
    },
    truck: {
        text: '🚚 Trucks are 1.3x more risky.',
        warning: 'Allow longer braking distance.'
    }
};

// ═══════════════════════════════════════════════════════
// MAP INITIALIZATION
// ═══════════════════════════════════════════════════════

function initMap() {

    map = L.map('map').setView([19.0760, 72.8777], 11);

    L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        {
            attribution: '© OpenStreetMap contributors © CARTO',
            maxZoom: 18
        }
    ).addTo(map);

    map.on('click', function (e) {

        if (!accidentReportMode) return;

        selectedAccidentLocation = e.latlng;

        if (tempAccidentMarker) {
            map.removeLayer(tempAccidentMarker);
        }

        tempAccidentMarker = L.marker(e.latlng).addTo(map);

        document.getElementById('accidentReportForm').style.display = 'block';
        document.getElementById('accidentLocationPreview').textContent =
            `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`;
    });
}

// ═══════════════════════════════════════════════════════
// VEHICLE SELECTOR
// ═══════════════════════════════════════════════════════

document.getElementById('vehicleType')?.addEventListener('change', function () {

    const info = VEHICLE_INFO[this.value];

    const text = document.getElementById('vehicleInfoText');
    const banner = document.getElementById('vehicleWarningBanner');
    const warning = document.getElementById('vehicleWarningText');

    if (text) text.textContent = info.text;

    if (info.warning) {
        warning.textContent = info.warning;
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
    }
});

// ═══════════════════════════════════════════════════════
// ROUTE FORM SUBMISSION
// ═══════════════════════════════════════════════════════

const routeForm = document.getElementById('routeForm');

if (routeForm) {
    routeForm.addEventListener('submit', async (e) => {

        e.preventDefault();

        const start = document.getElementById('startLocation').value;
        const end = document.getElementById('endLocation').value;
        const vehicleType =
            document.getElementById('vehicleType')?.value || 'car';

        if (!start || !end) {
            showToast('error', 'Select both locations');
            return;
        }

        document.getElementById('loadingIndicator').style.display = 'block';

        try {

            const response = await fetch('/api/routes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    start,
                    end,
                    vehicle_type: vehicleType
                })
            });

            const data = await response.json();

            currentRoutes = data.routes;

            displayRoutes(data.routes, data.start, data.end);
            displayRouteCards(data.routes);

            const rec = data.routes.find(r => r.recommended);
            if (rec) {
                selectRoute(rec.id);  // NEW: Auto-select recommended route
                showRouteDetails(rec);
            }

        } catch (err) {
            showToast('error', 'Failed to load routes');
        } finally {
            document.getElementById('loadingIndicator').style.display = 'none';
        }
    });
}

// ═══════════════════════════════════════════════════════
// DISPLAY ROUTES ON MAP
// ═══════════════════════════════════════════════════════

function displayRoutes(routes) {

    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];

    routes.forEach(route => {

        const color =
            route.risk_level === 'low' ? '#28a745' :
            route.risk_level === 'medium' ? '#ffc107' :
            '#dc3545';

        const polyline = L.polyline(route.waypoints, {
            color: color,
            weight: route.recommended ? 6 : 4,
            routeId: route.id  // NEW: Add route ID to polyline
        }).addTo(map);

        polyline.on('click', () => {
            selectRoute(route.id);  // NEW: Select route on click
            showRouteDetails(route);
        });

        routeLayers.push(polyline);
    });

    map.fitBounds(routes[0].waypoints);
}

// ═══════════════════════════════════════════════════════
// NEW: SELECT ROUTE FUNCTION
// ═══════════════════════════════════════════════════════

function selectRoute(routeId) {
    selectedRouteId = routeId;
    
    // Update all route cards
    const allCards = document.querySelectorAll('.route-card');
    allCards.forEach(card => {
        const cardRouteId = parseInt(card.dataset.routeId);
        
        if (cardRouteId === routeId) {
            // Highlight selected card
            card.classList.add('route-card-selected');
            card.style.borderColor = '#667eea';
            card.style.borderWidth = '3px';
            card.style.transform = 'scale(1.02)';
            card.style.boxShadow = '0 8px 32px rgba(102, 126, 234, 0.4)';
        } else {
            // Un-highlight other cards
            card.classList.remove('route-card-selected');
            card.style.borderColor = 'rgba(255,255,255,0.1)';
            card.style.borderWidth = '1px';
            card.style.transform = 'scale(1)';
            card.style.boxShadow = '0 4px 16px rgba(0, 0, 0, 0.3)';
        }
    });
    
    // Update polylines on map
    routeLayers.forEach(layer => {
        if (layer.options && layer.options.routeId === routeId) {
            // Highlight selected route
            layer.setStyle({
                weight: 8,
                opacity: 1.0
            });
            layer.bringToFront();
        } else {
            // Dim other routes
            layer.setStyle({
                weight: 4,
                opacity: 0.5
            });
        }
    });
}

// ═══════════════════════════════════════════════════════
// DISPLAY ROUTE CARDS (UPDATED)
// ═══════════════════════════════════════════════════════

function displayRouteCards(routes) {

    const container = document.getElementById('routeCards');
    container.innerHTML = '';

    routes.forEach(route => {

        const card = document.createElement('div');
        card.className = 'route-card';
        card.dataset.routeId = route.id;  // NEW: Add data attribute

        let vehicleBadge = '';

        if (route.vehicle_info &&
            route.vehicle_info.combined_multiplier > 1) {

            const impact =
                Math.round(
                    (route.vehicle_info.combined_multiplier - 1) * 100
                );

            vehicleBadge =
                `<span style="color:#ffc107;font-size:0.9rem;margin-left:8px;">${route.vehicle_info.vehicle_icon} +${impact}%</span>`;
        }

        // NEW: Add selected indicator
        const selectedBadge = route.recommended ? 
            '<span style="background:#28a745;color:white;padding:2px 8px;border-radius:4px;font-size:0.7rem;margin-left:8px;">RECOMMENDED</span>' : 
            '';

        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <h6 style="margin:0;">${route.name} ${vehicleBadge}</h6>
                ${selectedBadge}
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:8px;">
                <div style="text-align:center;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;">
                    <div style="font-size:1.2rem;font-weight:bold;color:#667eea;">${route.distance_km}</div>
                    <div style="font-size:0.7rem;color:#999;">KM</div>
                </div>
                <div style="text-align:center;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;">
                    <div style="font-size:1.2rem;font-weight:bold;color:#667eea;">${route.time_minutes}</div>
                    <div style="font-size:0.7rem;color:#999;">MIN</div>
                </div>
                <div style="text-align:center;padding:8px;background:rgba(255,255,255,0.05);border-radius:6px;">
                    <div style="font-size:1.2rem;font-weight:bold;color:${
                        route.risk_level === 'low' ? '#28a745' :
                        route.risk_level === 'medium' ? '#ffc107' :
                        '#dc3545'
                    };">${route.risk_score}%</div>
                    <div style="font-size:0.7rem;color:#999;">RISK</div>
                </div>
            </div>
        `;

        card.onclick = () => {
            selectRoute(route.id);  // NEW: Select on click
            showRouteDetails(route);
        };

        container.appendChild(card);
    });

    document.getElementById('routeResults').style.display = 'block';
}

// ═══════════════════════════════════════════════════════
// ROUTE DETAILS (UPDATED)
// ═══════════════════════════════════════════════════════

function showRouteDetails(route) {

    const container = document.getElementById('detailsContent');

    let vehicleImpact = '';

    if (route.vehicle_info &&
        route.vehicle_info.combined_multiplier > 1) {

        const impact =
            Math.round(
                (route.vehicle_info.combined_multiplier - 1) * 100
            );

        vehicleImpact = `
            <div class="alert alert-warning mt-3" style="border-left:4px solid #ffc107;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:1.5rem;">${route.vehicle_info.vehicle_icon}</span>
                    <div>
                        <strong>Vehicle Risk Adjustment</strong>
                        <div style="font-size:0.9rem;margin-top:4px;">
                            Risk increased by <strong>+${impact}%</strong> for ${route.vehicle_info.vehicle_name}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // NEW: Show which route is selected
    const routeNumber = route.id;
    const routeLabel = route.recommended ? 
        `<span style="color:#28a745;"><i class="fas fa-star"></i> SELECTED (Recommended)</span>` :
        `<span style="color:#667eea;"><i class="fas fa-check-circle"></i> SELECTED</span>`;

    container.innerHTML = `
        <div class="alert ${route.recommended ? 'alert-success' : 'alert-info'}" style="border-left:4px solid ${route.recommended ? '#28a745' : '#667eea'};">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong>${route.name}</strong>
                ${routeLabel}
            </div>
        </div>

        <table class="table table-sm table-dark" style="margin-top:16px;">
            <tr>
                <td><i class="fas fa-road"></i> Distance</td>
                <td><strong>${route.distance_km} km</strong></td>
            </tr>
            <tr>
                <td><i class="fas fa-clock"></i> Time</td>
                <td><strong>${route.time_minutes} minutes</strong></td>
            </tr>
            <tr>
                <td><i class="fas fa-exclamation-triangle"></i> Risk Score</td>
                <td><strong style="color:${
                    route.risk_level === 'low' ? '#28a745' :
                    route.risk_level === 'medium' ? '#ffc107' :
                    '#dc3545'
                };">${route.risk_score}% (${route.risk_level.toUpperCase()})</strong></td>
            </tr>
        </table>

        ${vehicleImpact}
        
        <div style="margin-top:16px;padding:12px;background:rgba(102,126,234,0.1);border-radius:8px;border:1px solid rgba(102,126,234,0.3);">
            <div style="font-size:0.85rem;color:#aaa;">
                <i class="fas fa-info-circle"></i> 
                Click on other route cards above to compare different routes
            </div>
        </div>
    `;

    document.getElementById('routeDetails').style.display = 'block';
}

// ═══════════════════════════════════════════════════════
// ACCIDENT REPORTING
// ═══════════════════════════════════════════════════════

document.getElementById('enableReportMode')?.addEventListener('click', () => {
    accidentReportMode = true;
    showToast('success', 'Click on map to report accident');
});

document.getElementById('submitAccidentReport')?.addEventListener('click', async () => {

    if (!selectedAccidentLocation) {
        showToast('error', 'Select location first');
        return;
    }

    const severity =
        document.getElementById('accidentSeverity').value;

    await fetch('/api/accidents/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            latitude: selectedAccidentLocation.lat,
            longitude: selectedAccidentLocation.lng,
            severity: severity
        })
    });

    showToast('success', 'Accident reported');
});
// ═══════════════════════════════════════════════════════════════════
// ADD THESE FUNCTIONS TO YOUR map.js FILE
// Place at the end of the file, before window.addEventListener('load')
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// ACCIDENT REPORTING FUNCTIONS
// ═══════════════════════════════════════════════════════════════════

// Load and display active accidents
async function loadActiveAccidents() {
    try {
        const resp = await fetch('/api/accidents/active');
        if (!resp.ok) {
            console.warn('Accident API not available');
            return;
        }
        
        const data = await resp.json();
        
        if (data.success) {
            renderAccidentMarkers(data.accidents);
            renderAccidentsList(data.accidents);
            
            // Update badge count
            const badge = document.getElementById('accidentCountBadge');
            if (badge) {
                badge.textContent = data.count;
            }
        }
    } catch (e) {
        console.error('Failed to load accidents:', e);
    }
}

// Render accident markers on map
function renderAccidentMarkers(accidents) {
    // Remove old markers
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
        
        // Create pulsing red marker
        const icon = L.divIcon({
            className: 'accident-marker-container',
            html: `
                <div class="accident-marker-pulse" style="background:${color};"></div>
                <div class="accident-marker-icon" style="background:${color};">
                    <i class="fas fa-exclamation" style="color:#fff;"></i>
                </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        
        const marker = L.marker([acc.latitude, acc.longitude], {
            icon: icon,
            zIndexOffset: 2000
        }).addTo(map);
        
        const timeAgo = formatTimeAgo(new Date(acc.timestamp));
        
        // Marker popup
        marker.bindPopup(`
            <div style="font-family:'Poppins',sans-serif; min-width:180px;">
                <div style="font-weight:600; color:${color}; margin-bottom:8px;">
                    <i class="fas fa-exclamation-triangle"></i> Accident Reported
                </div>
                <div style="margin-bottom:6px;">
                    <span style="background:${color}; color:white; padding:2px 8px; border-radius:4px; font-size:0.75rem; text-transform:uppercase;">
                        ${acc.severity}
                    </span>
                </div>
                ${acc.description ? `<div style="font-size:0.85rem; color:#666; margin-bottom:6px;">"${acc.description}"</div>` : ''}
                <div style="font-size:0.75rem; color:#999;">
                    <i class="fas fa-clock"></i> ${timeAgo}
                    ${acc.verified ? '<i class="fas fa-check-circle" style="color:#28a745; margin-left:8px;"></i> Verified' : ''}
                </div>
                <div style="margin-top:8px; display:flex; gap:8px;">
                    <button onclick="voteAccident('${acc.id}', 'up')" 
                            style="padding:4px 12px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                        👍 ${acc.upvotes}
                    </button>
                    <button onclick="voteAccident('${acc.id}', 'down')" 
                            style="padding:4px 12px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer; font-size:0.75rem;">
                        👎 ${acc.downvotes}
                    </button>
                </div>
            </div>
        `);
        
        accidentMarkers.push(marker);
    });
}

// Render accidents list in sidebar
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
            <div class="accident-item" onclick="map.setView([${acc.latitude}, ${acc.longitude}], 15, {animate: true})" 
                 style="background:rgba(255,255,255,0.05); padding:12px; border-radius:8px; margin-bottom:10px; cursor:pointer; transition:all 0.3s;">
                <div style="display:flex; justify-content:space-between; align-items:start; margin-bottom:6px;">
                    <span style="background:${color}; color:white; padding:3px 10px; border-radius:4px; font-size:0.7rem; text-transform:uppercase; font-weight:600;">
                        ${acc.severity}
                    </span>
                    <div style="font-size:0.7rem; color:#999;">
                        <i class="fas fa-clock"></i> ${timeAgo}
                    </div>
                </div>
                ${acc.description ? `<div style="font-size:0.8rem; color:#ccc; margin-bottom:6px;">${acc.description}</div>` : ''}
                <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
                    <div style="display:flex; gap:8px;">
                        <button onclick="event.stopPropagation(); voteAccident('${acc.id}', 'up');" 
                                style="padding:3px 8px; background:#28a745; color:white; border:none; border-radius:4px; font-size:0.7rem; cursor:pointer;">
                            👍 ${acc.upvotes}
                        </button>
                        <button onclick="event.stopPropagation(); voteAccident('${acc.id}', 'down');" 
                                style="padding:3px 8px; background:#dc3545; color:white; border:none; border-radius:4px; font-size:0.7rem; cursor:pointer;">
                            👎 ${acc.downvotes}
                        </button>
                    </div>
                    ${acc.verified ? '<span style="color:#28a745; font-size:0.7rem;"><i class="fas fa-check-circle"></i> Verified</span>' : ''}
                </div>
            </div>`;
    }).join('');
}

// Vote on accident (upvote/downvote)
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
            loadActiveAccidents();  // Refresh
        }
    } catch (e) {
        console.error('Failed to vote:', e);
    }
};

// Format time ago (e.g., "5m ago", "1h ago")
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    return Math.floor(seconds / 86400) + 'd ago';
}

// Cancel accident report
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
    showToast('info', 'Report mode canceled');
}

// Cancel button handler
document.getElementById('cancelAccidentReport')?.addEventListener('click', cancelAccidentReport);

// ═══════════════════════════════════════════════════════════════════
// MODIFY YOUR window.addEventListener('load') TO INCLUDE:
// ═══════════════════════════════════════════════════════════════════

// CHANGE FROM:
// window.addEventListener('load', () => {
//     initMap();
// });

// TO:
window.addEventListener('load', () => {
    initMap();
    loadActiveAccidents();  // ADD THIS LINE
    
    // Auto-refresh accidents every 60 seconds
    setInterval(loadActiveAccidents, 60000);  // ADD THIS LINE
});

// ═══════════════════════════════════════════════════════════════════
// ADD THIS CSS FOR PULSING ACCIDENT MARKERS
// ═══════════════════════════════════════════════════════════════════

const accidentStyles = document.createElement('style');
accidentStyles.textContent = `
    .accident-marker-container {
        position: relative;
        background: none !important;
        border: none !important;
    }
    
    .accident-marker-pulse {
        position: absolute;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        opacity: 0.6;
        animation: pulse-accident 2s infinite;
    }
    
    .accident-marker-icon {
        position: absolute;
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        z-index: 1;
    }
    
    @keyframes pulse-accident {
        0%, 100% { 
            transform: scale(1); 
            opacity: 0.6; 
        }
        50% { 
            transform: scale(1.3); 
            opacity: 0.3; 
        }
    }
    
    .accident-item:hover {
        background: rgba(255, 255, 255, 0.1) !important;
        transform: translateX(4px);
    }
`;
document.head.appendChild(accidentStyles);

// ═══════════════════════════════════════════════════════
// TOAST SYSTEM
// ═══════════════════════════════════════════════════════

function showToast(type, message) {

    const toastEl = document.getElementById(type + 'Toast');
    const toastBody = document.getElementById(type + 'ToastBody');

    if (!toastEl) {
        alert(message);
        return;
    }

    toastBody.textContent = message;
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

// ═══════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════

window.addEventListener('load', () => {
    initMap();
});