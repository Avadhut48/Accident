// Mumbai Safe Route Navigator — map.js v4  (with Route History)

let map;
let routeLayers   = [];
let markers       = [];
let currentRoutes = [];
let currentWeather= null;
let isFullscreen  = false;

// =========================================================================
// Map init (unchanged)
// =========================================================================
function initMap() {
    map = L.map('map', { zoomControl: false }).setView([19.0760, 72.8777], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 18, subdomains: 'abcd'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
}

function clearRoutes() {
    routeLayers.forEach(l => map.removeLayer(l));
    routeLayers = [];
    markers.forEach(m => map.removeLayer(m));
    markers = [];
}

function getRiskColor(riskLevel) {
    return { low:'#28a745', medium:'#ffc107', high:'#dc3545' }[riskLevel] || '#6c757d';
}

// =========================================================================
// Weather (unchanged from v3)
// =========================================================================
const WEATHER_EMOJI = {
    "Clear":      "☀️",
    "Rain":       "🌧️",
    "Fog":        "🌫️",
    "Heavy Rain": "⛈️"
};

const WEATHER_ICON_CLASS = {
    "Clear":      "fa-sun",
    "Rain":       "fa-cloud-rain",
    "Fog":        "fa-smog",
    "Heavy Rain": "fa-cloud-bolt"
};

const WEATHER_RISK_LABEL = {
    "Clear":      { text: "Clear skies — base risk scores apply.",                         cls: "info" },
    "Rain":       { text: "Rain detected — all route risks increased by ~20 %.",           cls: "warning" },
    "Fog":        { text: "Fog detected — visibility reduced, risks increased by ~21 %.",  cls: "warning" },
    "Heavy Rain": { text: "Heavy rain — severe visibility & grip risk, scores up ~29 %.",  cls: "danger" }
};

async function fetchWeather() {
    try {
        const resp = await fetch('/api/weather');
        if (!resp.ok) throw new Error('weather fetch failed');
        currentWeather = await resp.json();
    } catch (e) {
        console.warn('Weather fetch failed, using fallback', e);
        currentWeather = { condition:"Clear", rain_mm:0, humidity:55,
                           temp_c:28, wind_kmh:10, description:"unavailable", api_status:"error" };
    }
    renderWeatherCard(currentWeather);
    renderNavbarWeather(currentWeather);
}

function renderWeatherCard(w) {
    const cond = w.condition || "Clear";
    document.getElementById('weatherEmoji').textContent   = WEATHER_EMOJI[cond] || "⛅";
    document.getElementById('weatherCondition').textContent = cond;
    document.getElementById('weatherDesc').textContent     = w.description || "–";
    document.getElementById('weatherTemp').textContent     = (w.temp_c != null ? w.temp_c + " °C" : "–");
    document.getElementById('weatherHumidity').textContent = (w.humidity != null ? w.humidity + " %" : "–");
    document.getElementById('weatherWind').textContent     = (w.wind_kmh != null ? w.wind_kmh + " km/h" : "–");
    document.getElementById('weatherRain').textContent     = (w.rain_mm != null ? w.rain_mm + " mm" : "0 mm");

    const banner = document.getElementById('weatherRiskBanner');
    const bannerText = document.getElementById('weatherRiskText');
    const info = WEATHER_RISK_LABEL[cond] || WEATHER_RISK_LABEL["Clear"];
    bannerText.textContent = info.text;
    banner.style.borderColor = info.cls === 'danger' ? '#dc3545' :
                               info.cls === 'warning' ? '#ffc107' : '#0dcaf0';
    banner.style.background  = info.cls === 'danger' ? 'rgba(220,53,69,0.12)' :
                               info.cls === 'warning' ? 'rgba(255,193,7,0.12)' : 'rgba(13,202,255,0.12)';

    const iconEl = document.getElementById('weatherMainIcon');
    iconEl.className = 'fas ' + (WEATHER_ICON_CLASS[cond] || 'fa-cloud');

    document.getElementById('weatherSkeleton').style.display = 'none';
    document.getElementById('weatherContent').style.display  = 'block';

    if (w.api_status === 'no_key') {
        bannerText.textContent = '⚠️  No API key set — weather data is a placeholder. Set OPENWEATHER_API_KEY to enable live data.';
        banner.style.borderColor = '#6c757d';
        banner.style.background  = 'rgba(108,117,125,0.15)';
    }
}

function renderNavbarWeather(w) {
    const cond = w.condition || "Clear";
    document.getElementById('navWeatherIcon').className = 'fas ' + (WEATHER_ICON_CLASS[cond] || 'fa-cloud');
    document.getElementById('navWeatherText').textContent = cond + (w.temp_c != null ? '  ' + w.temp_c + '°C' : '');
}

// =========================================================================
// ═══ ROUTE HISTORY ═══ (NEW)
// =========================================================================

async function loadHistory() {
    try {
        const resp = await fetch('/api/history?limit=10');
        if (!resp.ok) throw new Error('history fetch failed');
        const data = await resp.json();
        
        if (data.success && data.history.length > 0) {
            renderHistory(data.history);
            document.getElementById('historyActions').style.display = 'block';
        } else {
            document.getElementById('historyContent').innerHTML = `
                <div class="empty-history">
                    <i class="fas fa-clock-rotate-left"></i>
                    <p>No searches yet</p>
                </div>`;
            document.getElementById('historyActions').style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to load history:', e);
    }
}

function renderHistory(history) {
    const container = document.getElementById('historyContent');
    
    if (history.length === 0) {
        container.innerHTML = `
            <div class="empty-history">
                <i class="fas fa-clock-rotate-left"></i>
                <p>No searches yet</p>
            </div>`;
        return;
    }
    
    container.innerHTML = history.map(item => {
        const timestamp = new Date(item.timestamp);
        const timeStr = formatTimeAgo(timestamp);
        const riskClass = item.chosen_route.risk_level;
        
        return `
            <div class="history-item" data-start="${item.start}" data-end="${item.end}">
                <div class="history-route-path">
                    <span class="history-location">${item.start}</span>
                    <i class="fas fa-arrow-right history-arrow"></i>
                    <span class="history-location">${item.end}</span>
                </div>
                <div class="history-meta">
                    <div class="history-timestamp">
                        <i class="fas fa-clock"></i>
                        <span>${timeStr}</span>
                    </div>
                    <span class="history-risk-badge history-risk-${riskClass}">
                        ${item.chosen_route.risk_score}%
                    </span>
                </div>
            </div>`;
    }).join('');
    
    // Add click handlers to re-run searches
    container.querySelectorAll('.history-item').forEach(item => {
        item.addEventListener('click', () => {
            const start = item.dataset.start;
            const end = item.dataset.end;
            
            // Set form values and submit
            document.getElementById('startLocation').value = start;
            document.getElementById('endLocation').value = end;
            document.getElementById('routeForm').dispatchEvent(new Event('submit'));
        });
    });
}

async function loadPopularRoutes() {
    try {
        const resp = await fetch('/api/history/popular?limit=5');
        if (!resp.ok) throw new Error('popular routes fetch failed');
        const data = await resp.json();
        
        if (data.success && data.popular_routes.length > 0) {
            renderPopularRoutes(data.popular_routes);
            document.getElementById('popularCard').style.display = 'block';
        }
    } catch (e) {
        console.error('Failed to load popular routes:', e);
    }
}

function renderPopularRoutes(routes) {
    const container = document.getElementById('popularContent');
    
    container.innerHTML = routes.map((route, idx) => {
        const riskClass = route.avg_risk < 35 ? 'low' : (route.avg_risk < 60 ? 'medium' : 'high');
        return `
            <div class="popular-route-item" data-start="${route.start}" data-end="${route.end}">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <div style="flex:1;">
                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                            <div class="popular-route-count">${idx + 1}</div>
                            <div style="color:#fff; font-weight:600; font-size:0.9rem;">
                                ${route.start} → ${route.end}
                            </div>
                        </div>
                        <div style="font-size:0.7rem; color:#aaa;">
                            Searched ${route.count} time${route.count > 1 ? 's' : ''}
                        </div>
                    </div>
                    <span class="history-risk-badge history-risk-${riskClass}">
                        ${route.avg_risk}%
                    </span>
                </div>
            </div>`;
    }).join('');
    
    // Add click handlers
    container.querySelectorAll('.popular-route-item').forEach(item => {
        item.addEventListener('click', () => {
            const start = item.dataset.start;
            const end = item.dataset.end;
            document.getElementById('startLocation').value = start;
            document.getElementById('endLocation').value = end;
            document.getElementById('routeForm').dispatchEvent(new Event('submit'));
        });
    });
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    
    return date.toLocaleDateString();
}

async function clearHistory() {
    if (!confirm('Are you sure you want to clear all route history?')) return;
    
    try {
        const resp = await fetch('/api/history/clear', { method: 'POST' });
        if (!resp.ok) throw new Error('clear failed');
        const data = await resp.json();
        
        if (data.success) {
            showToast('success', 'History cleared successfully');
            loadHistory();
            document.getElementById('popularCard').style.display = 'none';
        }
    } catch (e) {
        console.error('Failed to clear history:', e);
        showToast('error', 'Failed to clear history');
    }
}

// =========================================================================
// Route display (unchanged structure from v3)
// =========================================================================
function displayRoutes(routes, startName, endName) {
    clearRoutes();

    const startCoords = routes[0].waypoints[0];
    const startIcon = L.divIcon({
        className: 'custom-marker-container',
        html: `<div class="custom-marker start-marker-modern">
                 <div class="marker-pulse"></div>
                 <div class="marker-icon"><i class="fas fa-map-marker-alt"></i></div>
               </div>`,
        iconSize: [40,40], iconAnchor: [20,40]
    });
    const startMarker = L.marker([startCoords[0], startCoords[1]], { icon: startIcon, zIndexOffset:1000 }).addTo(map);
    startMarker.bindPopup(`<div style="text-align:center;padding:.5rem;">
        <div style="font-size:2rem;">🚗</div>
        <strong style="color:#11998e;font-size:1.1rem;">Start</strong>
        <div style="color:#666;">${startName}</div></div>`);
    markers.push(startMarker);

    const endCoords = routes[0].waypoints[routes[0].waypoints.length-1];
    const endIcon = L.divIcon({
        className: 'custom-marker-container',
        html: `<div class="custom-marker end-marker-modern">
                 <div class="marker-pulse end-pulse"></div>
                 <div class="marker-icon"><i class="fas fa-flag-checkered"></i></div>
               </div>`,
        iconSize: [40,40], iconAnchor: [20,40]
    });
    const endMarker = L.marker([endCoords[0], endCoords[1]], { icon: endIcon, zIndexOffset:1000 }).addTo(map);
    endMarker.bindPopup(`<div style="text-align:center;padding:.5rem;">
        <div style="font-size:2rem;">🏁</div>
        <strong style="color:#ee0979;font-size:1.1rem;">Destination</strong>
        <div style="color:#666;">${endName}</div></div>`);
    markers.push(endMarker);

    routes.forEach((route, idx) => {
        const color   = getRiskColor(route.risk_level);
        const opacity = route.recommended ? 1.0 : 0.6;
        const weight  = route.recommended ? 6 : 4;

        const polyline = L.polyline(route.waypoints, {
            color, weight, opacity, routeId: route.id,
            dashArray: route.recommended ? '0' : '10,10',
            className: 'route-line'
        }).addTo(map);

        if (route.recommended) {
            const glow = L.polyline(route.waypoints, { color, weight: weight+6, opacity:0.2, routeId: route.id }).addTo(map);
            routeLayers.push(glow);
        }

        const riskIcon = route.risk_level==='low' ? '✅' : route.risk_level==='medium' ? '⚠️' : '🚫';
        polyline.bindPopup(`
            <div style="min-width:220px;font-family:'Poppins',sans-serif;">
              <div style="text-align:center;margin-bottom:.75rem;">
                <div style="font-size:2rem;">${riskIcon}</div>
                <h6 style="margin:0;color:${color};font-weight:600;font-size:1.1rem;">
                  ${route.recommended ? '⭐ ' : ''}${route.name}</h6>
              </div>
              <div style="background:#f8f9fa;padding:.75rem;border-radius:8px;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:.75rem;">
                  <div style="text-align:center;">
                    <div style="font-size:1.3rem;font-weight:700;color:#667eea;">${route.distance_km}</div>
                    <div style="font-size:.75rem;color:#999;">KM</div>
                  </div>
                  <div style="text-align:center;">
                    <div style="font-size:1.3rem;font-weight:700;color:#667eea;">${route.time_minutes}</div>
                    <div style="font-size:.75rem;color:#999;">MIN</div>
                  </div>
                </div>
                <div style="margin-top:.75rem;padding-top:.75rem;border-top:1px solid #ddd;display:flex;justify-content:space-between;align-items:center;">
                  <span style="font-weight:600;color:#555;">Risk Score:</span>
                  <span style="background:${color};color:#fff;padding:.25rem .75rem;border-radius:12px;font-weight:600;">${route.risk_score}%</span>
                </div>
              </div>
              ${route.recommended ? '<div style="text-align:center;margin-top:.75rem;color:#11998e;font-weight:600;">⭐ Recommended</div>' : ''}
            </div>`);

        polyline.on('click', function() {
            highlightRoute(route.id);
            showRouteDetails(route);
            map.fitBounds(polyline.getBounds(), { padding:[50,50], animate:true, duration:0.5 });
        });
        routeLayers.push(polyline);
        setTimeout(() => polyline.setStyle({ opacity }), idx * 200);
    });

    const allPts = routes.flatMap(r => r.waypoints);
    map.fitBounds(allPts, { padding:[80,80], animate:true, duration:1 });
    showToast('success', `Found ${routes.length} routes from ${startName} to ${endName}`);
}

function displayRouteCards(routes) {
    const container = document.getElementById('routeCards');
    container.innerHTML = '';
    routes.forEach((route, idx) => {
        const card = document.createElement('div');
        card.className = `route-card ${route.risk_level}-risk ${route.recommended ? 'recommended' : ''}`;
        card.setAttribute('data-route-id', route.id);
        const riskIcon = route.risk_level==='low' ? 'fa-check-circle' :
                         route.risk_level==='medium' ? 'fa-exclamation-circle' : 'fa-times-circle';
        card.innerHTML = `
            <h6><i class="fas fa-route"></i> ${route.name}</h6>
            <div class="risk-badge risk-${route.risk_level}">
                <i class="fas ${riskIcon}"></i>
                ${route.risk_level.toUpperCase()} RISK - ${route.risk_score}%
            </div>
            <div class="risk-score-bar"><div class="risk-score-fill ${route.risk_level}" style="width:0%"></div></div>
            <div class="route-stats">
                <div><span class="stat-value"><i class="fas fa-road"></i> ${route.distance_km}</span><span class="stat-label">KM</span></div>
                <div><span class="stat-value"><i class="fas fa-clock"></i> ${route.time_minutes}</span><span class="stat-label">MIN</span></div>
                <div><span class="stat-value"><i class="fas fa-shield-alt"></i> ${route.risk_score}%</span><span class="stat-label">RISK</span></div>
            </div>`;
        setTimeout(() => { const f = card.querySelector('.risk-score-fill'); if(f) f.style.width = route.risk_score+'%'; }, 100+idx*100);
        card.addEventListener('click', () => {
            highlightRoute(route.id);
            showRouteDetails(route);
            if (window.innerWidth < 992)
                setTimeout(() => document.getElementById('routeDetails')?.scrollIntoView({ behavior:'smooth' }), 300);
        });
        card.style.opacity = '0';
        card.style.transform = 'translateX(-20px)';
        container.appendChild(card);
        setTimeout(() => { card.style.transition='all .3s ease'; card.style.opacity='1'; card.style.transform='translateX(0)'; }, 50+idx*100);
    });
    document.getElementById('routeResults').style.display = 'block';
    const res = document.getElementById('routeResults');
    res.style.opacity='0'; res.style.transform='translateY(20px)';
    setTimeout(() => { res.style.transition='all .5s ease'; res.style.opacity='1'; res.style.transform='translateY(0)'; }, 100);
}

function highlightRoute(routeId) {
    document.querySelectorAll('.route-card').forEach(c => c.classList.remove('active'));
    const active = document.querySelector(`[data-route-id="${routeId}"]`);
    if (active) active.classList.add('active');
    routeLayers.forEach(l => {
        if (l.options.routeId === routeId) { l.setStyle({ weight:8, opacity:1.0 }); l.bringToFront(); }
        else l.setStyle({ weight:4, opacity:0.4 });
    });
}

function showRouteDetails(route) {
    const container = document.getElementById('detailsContent');

    let riskDetailsHTML = '';
    if (route.risk_details && route.risk_details.length) {
        riskDetailsHTML = `<h6>🚨 High-Risk Segments:</h6>
            <ul class="list-group">
                ${route.risk_details.slice(0,5).map(d =>
                    `<li class="list-group-item d-flex justify-content-between align-items-center">
                        ${d.road} <span class="badge bg-danger">${d.risk.toFixed(1)}% risk</span></li>`
                ).join('')}
            </ul>`;
    }

    let weatherImpactHTML = '';
    if (currentWeather && currentWeather.condition && currentWeather.condition !== 'Clear') {
        const cond = currentWeather.condition;
        const emoji = WEATHER_EMOJI[cond] || '🌤️';
        const mults = { Rain:'~20 %', Fog:'~21 %', 'Heavy Rain':'~29 %' };
        weatherImpactHTML = `
            <div style="background:rgba(255,193,7,0.1);border:1px solid #ffc107;border-radius:8px;padding:10px 14px;margin-top:12px;">
                <h6 style="margin:0 0 6px;color:#fff;"><i class="fas fa-cloud-rain" style="color:#ffc107;"></i> Weather Impact</h6>
                <p style="margin:0;color:#ccc;font-size:.82rem;">
                    Current condition: <strong style="color:#fff;">${emoji} ${cond}</strong> —
                    all route risk scores on this trip are elevated by <strong style="color:#ffc107;">${mults[cond]||''}</strong>
                    compared to clear-sky baseline.
                </p>
            </div>`;
    }

    const tips = route.risk_level === 'high'
        ? '<li>⚠️ High accident risk on this route. Consider alternatives.</li><li>Drive with extra caution, especially during peak hours.</li><li>Maintain safe following distance.</li>'
        : route.risk_level === 'medium'
        ? '<li>⚡ Moderate risk. Stay alert and follow traffic rules.</li><li>Be cautious at intersections and busy junctions.</li>'
        : '<li>✅ Relatively safe route based on historical data.</li><li>Continue following all traffic safety guidelines.</li>';

    container.innerHTML = `
        <div class="alert alert-custom ${route.recommended ? 'success' : 'warning'}">
            <h5>${route.recommended ? '✅ Recommended Route' : '⚠️ Alternative Route'}</h5>
            <p class="mb-0">${route.name} – ${route.risk_level.toUpperCase()} risk level</p>
        </div>
        <table class="details-table">
            <tr><td>Total Distance</td><td>${route.distance_km} km</td></tr>
            <tr><td>Estimated Time</td><td>${route.time_minutes} minutes</td></tr>
            <tr><td>Risk Score</td><td><span class="risk-badge risk-${route.risk_level}">${route.risk_score}%</span></td></tr>
            <tr><td>Risk Level</td><td>${route.risk_level.toUpperCase()}</td></tr>
        </table>
        ${weatherImpactHTML}
        ${riskDetailsHTML}
        <div class="mt-3"><h6>💡 Safety Tips:</h6><ul>${tips}</ul></div>`;

    document.getElementById('routeDetails').style.display = 'block';
}

// =========================================================================
// Form submission (with history refresh)
// =========================================================================
document.getElementById('routeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const start = document.getElementById('startLocation').value;
    const end   = document.getElementById('endLocation').value;
    if (!start || !end) { alert('Please select both locations'); return; }
    if (start === end)  { alert('Start and destination cannot be the same'); return; }

    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('findRoutesBtn').disabled = true;
    document.getElementById('routeResults').style.display = 'none';
    document.getElementById('routeDetails').style.display = 'none';

    try {
        const response = await fetch('/api/routes', {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify({ start, end, weather: currentWeather })
        });
        if (!response.ok) throw new Error('route fetch failed');
        const data = await response.json();
        currentRoutes = data.routes;

        if (data.weather && (!currentWeather || data.weather.condition !== currentWeather.condition)) {
            currentWeather = data.weather;
            renderWeatherCard(currentWeather);
            renderNavbarWeather(currentWeather);
        }

        displayRoutes(data.routes, data.start, data.end);
        displayRouteCards(data.routes);

        const rec = data.routes.find(r => r.recommended);
        if (rec) { showRouteDetails(rec); highlightRoute(rec.id); }

        // ═══ REFRESH HISTORY ═══ (NEW)
        loadHistory();
        loadPopularRoutes();

    } catch (err) {
        console.error(err);
        showToast('error', 'Failed to generate routes. Please try again.');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('findRoutesBtn').disabled = false;
    }
});

// =========================================================================
// Page load
// =========================================================================
window.addEventListener('load', () => {
    initMap();
    fetchWeather();
    loadHistory();      // ← NEW
    loadPopularRoutes(); // ← NEW

    const style = document.createElement('style');
    style.textContent = `
        .custom-marker-container { background:none !important; border:none !important; }
        .custom-marker { position:relative; width:40px; height:40px; }
        .marker-pulse { position:absolute; width:40px; height:40px; border-radius:50%;
            background:rgba(17,153,142,.4); animation:pulse-animation 2s infinite; }
        .end-pulse { background:rgba(238,9,121,.4); }
        @keyframes pulse-animation { 0%{transform:scale(1);opacity:1} 50%{transform:scale(1.3);opacity:.5} 100%{transform:scale(1);opacity:1} }
        .marker-icon { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%);
            width:32px; height:32px; background:linear-gradient(135deg,#11998e,#38ef7d);
            border-radius:50%; display:flex; align-items:center; justify-content:center;
            color:#fff; font-size:16px; box-shadow:0 4px 12px rgba(0,0,0,.3); z-index:1; }
        .end-marker-modern .marker-icon { background:linear-gradient(135deg,#ee0979,#ff6a00); }
        .route-line { filter:drop-shadow(0 2px 4px rgba(0,0,0,.3)); }
        .weather-stat-box {
            background:rgba(255,255,255,.06); border-radius:8px; padding:8px 6px;
            text-align:center; display:flex; flex-direction:column; align-items:center; gap:2px;
        }
        .weather-stat-box i { font-size:.9rem; }
        .weather-stat-box span { font-size:.85rem; font-weight:600; color:#fff; }
        .weather-stat-box small { font-size:.68rem; color:#999; text-transform:uppercase; letter-spacing:.4px; }
        .weather-risk-banner {
            border:1px solid #0dcaf0; border-radius:8px; padding:8px 12px;
            background:rgba(13,202,255,.12); display:flex; align-items:center; gap:8px;
        }
        .weather-risk-banner i { color:#0dcaf0; flex-shrink:0; }
        .weather-risk-banner span { font-size:.78rem; color:#ccc; line-height:1.4; }`;
    document.head.appendChild(style);
});

// =========================================================================
// Utility
// =========================================================================
function showToast(type, message) {
    const el = document.getElementById(type+'Toast');
    const body = document.getElementById(type+'ToastBody');
    if (el && body) { body.textContent = message; new bootstrap.Toast(el).show(); }
}

document.getElementById('swapLocations')?.addEventListener('click', () => {
    const s = document.getElementById('startLocation'), e = document.getElementById('endLocation');
    if (s && e) { const t = s.value; s.value = e.value; e.value = t; }
    const btn = document.getElementById('swapLocations');
    btn.style.transform = 'rotate(180deg)';
    setTimeout(() => btn.style.transform = '', 300);
});

document.getElementById('recenterMap')?.addEventListener('click', () => {
    if (currentRoutes.length) map.fitBounds(currentRoutes.flatMap(r=>r.waypoints), { padding:[80,80], animate:true });
    else map.setView([19.0760, 72.8777], 11, { animate:true });
});

document.getElementById('fullscreenMap')?.addEventListener('click', () => {
    const mc = document.querySelector('.map-card');
    const ic = document.querySelector('#fullscreenMap i');
    if (!isFullscreen) {
        Object.assign(mc.style, { position:'fixed', top:'0', left:'0', width:'100vw', height:'100vh', zIndex:'9999', margin:'0' });
        document.getElementById('map').style.height = '100vh';
        ic.className = 'fas fa-compress'; isFullscreen = true;
    } else {
        ['position','top','left','width','height','zIndex','margin'].forEach(p => mc.style[p]='');
        document.getElementById('map').style.height = '650px';
        ic.className = 'fas fa-expand'; isFullscreen = false;
    }
    setTimeout(() => map.invalidateSize(), 100);
});

document.getElementById('helpBtn')?.addEventListener('click', () => new bootstrap.Modal(document.getElementById('helpModal')).show());

// ═══ CLEAR HISTORY BUTTON ═══ (NEW)
document.getElementById('clearHistoryBtn')?.addEventListener('click', clearHistory);

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey||e.metaKey) && e.key==='Enter') document.getElementById('findRoutesBtn')?.click();
    if (e.key==='Escape' && isFullscreen) document.getElementById('fullscreenMap')?.click();
});

window.addEventListener('error', (e) => { console.error(e); showToast('error','An error occurred.'); });