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