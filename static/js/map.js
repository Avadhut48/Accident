// ═══════════════════════════════════════════════════════
// MUMBAI SAFE ROUTE NAVIGATOR - COMPLETE MAP.JS
// ═══════════════════════════════════════════════════════

let map;
let routeLayers = [];
let accidentMarkers = [];
let currentRoutes = [];
let accidentReportMode = false;
let tempAccidentMarker = null;
let selectedAccidentLocation = null;
let selectedRouteId = null; 

// ═══════════════════════════════════════════════════════
// 🚗 VEHICLE CONFIG
// ═══════════════════════════════════════════════════════

const VEHICLE_INFO = {
    car: { text: 'Cars are baseline. Standard risk applies.' },
    bike: { text: '🏍️ Bikes are 1.8x more risky.' },
    auto: { text: '🛺 Auto rickshaws are 1.5x more risky.' },
    bus: { text: '🚌 Buses are 1.2x more risky.' },
    truck: { text: '🚚 Trucks are 1.3x more risky.' }
};

// ═══════════════════════════════════════════════════════
// MAP INITIALIZATION
// ═══════════════════════════════════════════════════════

function initMap() {
    map = L.map('map').setView([19.0760, 72.8777], 11);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 18
    }).addTo(map);

    // Map Click Listener for Accident Reporting
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
// ROUTE FORM SUBMISSION
// ═══════════════════════════════════════════════════════

document.getElementById('routeForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const start = document.getElementById('startLocation').value;
    const end = document.getElementById('endLocation').value;
    const vehicleType = document.getElementById('vehicleType')?.value || 'car';

    if (!start || !end) {
        showToast('error', 'Select both locations');
        return;
    }

    document.getElementById('loadingIndicator').style.display = 'block';
    
    // Reveal the Save and Share buttons
    const saveBtn = document.getElementById('saveFavoriteBtn');
    const shareBtn = document.getElementById('shareWhatsAppBtn');
    if (saveBtn) saveBtn.style.display = 'block';
    if (shareBtn) shareBtn.style.display = 'block';

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

        displayRoutes(data.routes);
        displayRouteCards(data.routes);

        const rec = data.routes.find(r => r.recommended);
        if (rec) {
            selectRoute(rec.id);
            showRouteDetails(rec);
        }

    } catch (err) {
        showToast('error', 'Failed to load routes');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
    }
});

// ═══════════════════════════════════════════════════════
// DISPLAY ROUTES ON MAP & UI
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
            routeId: route.id
        }).addTo(map);

        polyline.on('click', () => {
            selectRoute(route.id);
            showRouteDetails(route);
        });

        routeLayers.push(polyline);
    });

    map.fitBounds(routes[0].waypoints);
}

function selectRoute(routeId) {
    selectedRouteId = routeId;
    
    // Update route cards UI
    const allCards = document.querySelectorAll('.route-card');
    allCards.forEach(card => {
        const cardRouteId = parseInt(card.dataset.routeId);
        if (cardRouteId === routeId) {
            card.classList.add('route-card-selected');
        } else {
            card.classList.remove('route-card-selected');
        }
    });
    
    // Update map polylines
    routeLayers.forEach(layer => {
        if (layer.options && layer.options.routeId === routeId) {
            layer.setStyle({ weight: 8, opacity: 1.0 });
            layer.bringToFront();
        } else {
            layer.setStyle({ weight: 4, opacity: 0.5 });
        }
    });
}

function displayRouteCards(routes) {
    const container = document.getElementById('routeCards');
    container.innerHTML = '';

    routes.forEach(route => {
        const card = document.createElement('div');
        card.className = 'route-card p-3 mb-2 rounded glass-card';
        card.dataset.routeId = route.id;

        const color =
            route.risk_level === 'low' ? '#28a745' :
            route.risk_level === 'medium' ? '#ffc107' :
            '#dc3545';

        const selectedBadge = route.recommended ? 
            '<span class="badge bg-success">Recommended</span>' : '';

        card.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h6 class="mb-0 text-white">${route.name}</h6>
                ${selectedBadge}
            </div>
            <div class="d-flex justify-content-between text-muted small">
                <span><i class="fas fa-road"></i> ${route.distance_km} km</span>
                <span><i class="fas fa-clock"></i> ${route.time_minutes} min</span>
                <span style="color:${color}; font-weight:bold;"><i class="fas fa-shield-alt"></i> Risk: ${route.risk_score}%</span>
            </div>
        `;

        card.onclick = () => {
            selectRoute(route.id);
            showRouteDetails(route);
        };

        container.appendChild(card);
    });

    document.getElementById('routeResults').style.display = 'block';
}

function showRouteDetails(route) {
    const container = document.getElementById('detailsContent');
    const color = route.risk_level === 'low' ? '#28a745' : route.risk_level === 'medium' ? '#ffc107' : '#dc3545';
    
    container.innerHTML = `
        <div class="alert ${route.recommended ? 'alert-success' : 'alert-info'} mb-3" style="border-left: 4px solid ${color};">
            <strong>${route.name}</strong> - Currently Selected Route
        </div>
        <ul class="list-group list-group-flush bg-transparent">
            <li class="list-group-item bg-transparent text-white border-secondary"><i class="fas fa-road text-primary"></i> Distance: <strong>${route.distance_km} km</strong></li>
            <li class="list-group-item bg-transparent text-white border-secondary"><i class="fas fa-clock text-info"></i> Time: <strong>${route.time_minutes} mins</strong></li>
            <li class="list-group-item bg-transparent text-white border-secondary"><i class="fas fa-exclamation-triangle text-warning"></i> Risk Score: <strong style="color:${color}">${route.risk_score}% (${route.risk_level.toUpperCase()})</strong></li>
        </ul>
    `;

    document.getElementById('routeDetails').style.display = 'block';
}

// ═══════════════════════════════════════════════════════
// ACCIDENT REPORTING & DISPLAY
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

    const severity = document.getElementById('accidentSeverity').value;
    const desc = document.getElementById('accidentDescription')?.value || '';

    try {
        await fetch('/api/accidents/report', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                latitude: selectedAccidentLocation.lat,
                longitude: selectedAccidentLocation.lng,
                severity: severity,
                description: desc
            })
        });

        showToast('success', 'Accident reported successfully');
        cancelAccidentReport();
        loadActiveAccidents();
    } catch (err) {
        showToast('error', 'Failed to report accident');
    }
});

function cancelAccidentReport() {
    accidentReportMode = false;
    selectedAccidentLocation = null;
    
    if (tempAccidentMarker) {
        map.removeLayer(tempAccidentMarker);
        tempAccidentMarker = null;
    }
    
    const form = document.getElementById('accidentReportForm');
    const desc = document.getElementById('accidentDescription');
    
    if (form) form.style.display = 'none';
    if (desc) desc.value = '';
}

document.getElementById('cancelAccidentReport')?.addEventListener('click', cancelAccidentReport);

async function loadActiveAccidents() {
    try {
        const resp = await fetch('/api/accidents/active');
        const data = await resp.json();
        
        if (data.success) {
            // Remove old markers
            accidentMarkers.forEach(m => map.removeLayer(m));
            accidentMarkers = [];
            
            data.accidents.forEach(acc => {
                const color = acc.severity === 'minor' ? '#28a745' : acc.severity === 'moderate' ? '#ffc107' : '#dc3545';
                
                // Create pulsing marker (Requires CSS injected below)
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
                
                const marker = L.marker([acc.latitude, acc.longitude], { icon: icon }).addTo(map);
                marker.bindPopup(`<b>${acc.severity.toUpperCase()} Accident</b><br>${acc.description || 'Watch out for delays.'}`);
                accidentMarkers.push(marker);
            });
        }
    } catch (e) {
        console.error('Failed to load accidents:', e);
    }
}

// ═══════════════════════════════════════════════════════
// FOOLPROOF MODAL TRIGGERS (FAVORITES & WHATSAPP)
// ═══════════════════════════════════════════════════════

// 1. Load Favorites on Boot
async function loadFavorites() {
    try {
        const response = await fetch('/api/favorites');
        const data = await response.json();
        
        if (data.success && data.favorites) {
            const container = document.getElementById('favoritesContainer');
            if (!container) return;
            
            container.innerHTML = '';
            
            data.favorites.forEach(fav => {
                const btn = document.createElement('button');
                btn.className = 'btn btn-sm btn-outline-secondary m-1';
                btn.innerHTML = fav.name;
                btn.onclick = (e) => {
                    e.preventDefault();
                    const startInput = document.getElementById('startLocation');
                    const endInput = document.getElementById('endLocation');
                    
                    if (!startInput.value) {
                        startInput.value = fav.locationName;
                    } else {
                        endInput.value = fav.locationName;
                    }
                };
                container.appendChild(btn);
            });
        }
    } catch (err) {
        console.error('Failed to load favorites');
    }
}

// 2. Open Save Favorite Modal
window.triggerSaveFavorite = function() {
    const start = document.getElementById('startLocation').value;
    const end = document.getElementById('endLocation').value;
    
    if (!start || !end) return showToast('error', 'Please calculate a route first.');

    document.getElementById('modalStartLocation').textContent = start;
    document.getElementById('modalEndLocation').textContent = end;
    
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('saveFavoriteModal'));
    modal.show();
};

// 3. Save Favorite Action
window.confirmSaveFavoriteAction = async function() {
    const name = document.getElementById('favoriteName').value;
    const end = document.getElementById('endLocation').value;
    
    if (!name) return showToast('error', 'Enter a name for this favorite');
    
    try {
        const getResp = await fetch('/api/favorites');
        let favs = (await getResp.json()).favorites || [];
        favs.push({ id: 'fav_' + Date.now(), name: '⭐ ' + name, locationName: end });
        
        await fetch('/api/favorites', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ favorites: favs }) 
        });
        
        showToast('success', 'Favorite saved successfully!');
        document.getElementById('favoriteName').value = ''; 
        
        bootstrap.Modal.getInstance(document.getElementById('saveFavoriteModal')).hide();
        loadFavorites();
    } catch (err) { 
        showToast('error', 'Failed to save favorite'); 
    }
};

// 4. Open WhatsApp Share Modal
window.triggerShareWhatsApp = function() {
    if (!selectedRouteId) return showToast('error', 'Select a route to share first.');
    
    document.getElementById('shareStartLocation').textContent = document.getElementById('startLocation').value;
    document.getElementById('shareEndLocation').textContent = document.getElementById('endLocation').value;
    
    const route = currentRoutes.find(r => r.id === selectedRouteId);
    document.getElementById('shareRouteOptions').innerHTML = `
        <div class="alert alert-info">Sharing: <strong>${route.name}</strong></div>
        <button class="btn btn-success w-100" onclick="executeShare()">
            <i class="fab fa-whatsapp"></i> Send Now
        </button>
    `;
    
    const modal = bootstrap.Modal.getOrCreateInstance(document.getElementById('shareWhatsAppModal'));
    modal.show();
};

// 5. Execute WhatsApp Share (with Popup Bypass)
window.executeShare = async function() {
    const route = currentRoutes.find(r => r.id === selectedRouteId);
    if (!route) return;

    const routeData = {
        start: document.getElementById('startLocation').value,
        end: document.getElementById('endLocation').value,
        vehicle_type: document.getElementById('vehicleType')?.value || 'car',
        selected_route_id: route.id
    };

    let fallbackPopup = null;
    if (!navigator.share || !window.isSecureContext) {
        fallbackPopup = window.open('about:blank', '_blank');
    }

    try {
        const response = await fetch('/api/share-route', { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify(routeData) 
        });
        
        const data = await response.json();
        
        if (data.success) {
            const shareUrl = `${window.location.origin}/route/${data.route_id}`;
            const text = `🚗 I'm taking the "${route.name}" from ${routeData.start} to ${routeData.end}.\nRisk level: ${route.risk_level.toUpperCase()}.\nTrack my safe route here: ${shareUrl}`;
            
            if (navigator.share && window.isSecureContext) {
                try {
                    await navigator.share({ title: 'Safe Route', text: text, url: shareUrl });
                } catch (shareErr) {
                    console.warn("Share cancelled or failed");
                }
            } else if (fallbackPopup) {
                fallbackPopup.location.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
            }

            const modalEl = document.getElementById('shareWhatsAppModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
        }
    } catch (err) {
        console.error('Error sharing route:', err);
        showToast('error', 'Could not generate share link.');
        if (fallbackPopup) fallbackPopup.close(); 
    }
};

// ═══════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════

function showToast(type, message) {
    const toastBody = document.getElementById(type + 'ToastBody');
    if (toastBody) toastBody.textContent = message;
    
    const toastEl = document.getElementById(type + 'Toast');
    if (toastEl) {
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    } else {
        alert(message);
    }
}

// Swap locations button
document.getElementById('swapLocations')?.addEventListener('click', () => {
    const start = document.getElementById('startLocation');
    const end = document.getElementById('endLocation');
    const temp = start.value;
    start.value = end.value;
    end.value = temp;
});

// CSS for Pulsing Accident Markers
const accidentStyles = document.createElement('style');
accidentStyles.textContent = `
    .accident-marker-container { position: relative; background: none !important; border: none !important; }
    .accident-marker-pulse { position: absolute; width: 32px; height: 32px; border-radius: 50%; opacity: 0.6; animation: pulse-accident 2s infinite; }
    .accident-marker-icon { position: absolute; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3); z-index: 1; }
    @keyframes pulse-accident { 0%, 100% { transform: scale(1); opacity: 0.6; } 50% { transform: scale(1.3); opacity: 0.3; } }
`;
document.head.appendChild(accidentStyles);

// ═══════════════════════════════════════════════════════
// UNIFIED INIT ON LOAD
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// FORCE-BIND EVENT LISTENERS (Failsafe)
// ═══════════════════════════════════════════════════════
setTimeout(() => {
    // 1. Bind the main "Save as Favorite" button under the route form
    const saveBtn = document.getElementById('saveFavoriteBtn');
    if (saveBtn) saveBtn.onclick = window.triggerSaveFavorite;

    // 2. Bind the "Save Favorite" confirm button inside the modal
    const confirmSaveBtn = document.getElementById('confirmSaveFavorite');
    if (confirmSaveBtn) confirmSaveBtn.onclick = window.confirmSaveFavoriteAction;

    // 3. Bind the "Share via WhatsApp" button
    const shareBtn = document.getElementById('shareWhatsAppBtn');
    if (shareBtn) shareBtn.onclick = window.triggerShareWhatsApp;
}, 500); // Slight delay to ensure HTML is fully rendered
window.addEventListener('load', () => {
    initMap();
    loadActiveAccidents();
    loadFavorites(); 
    
    // Auto-refresh accidents every 60 seconds
    setInterval(loadActiveAccidents, 60000); 

    // Handle shared routes (hydration)
    if (typeof preloadedRouteData !== 'undefined' && preloadedRouteData) {
        document.getElementById('startLocation').value = preloadedRouteData.start;
        document.getElementById('endLocation').value = preloadedRouteData.end;
        if (document.getElementById('vehicleType')) {
            document.getElementById('vehicleType').value = preloadedRouteData.vehicle_type;
        }
        
        // Programmatically submit the form
        const routeForm = document.getElementById('routeForm');
        if (routeForm) {
            routeForm.dispatchEvent(new Event('submit'));
        }
    }
});