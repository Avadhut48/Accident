// Enhanced Interactive map functionality for Mumbai Safe Route Navigator

let map;
let routeLayers = [];
let markers = [];
let currentRoutes = [];
let isFullscreen = false;

// Initialize map centered on Mumbai with modern dark tiles
function initMap() {
    map = L.map('map', {
        zoomControl: false // We'll add custom controls
    }).setView([19.0760, 72.8777], 11);
    
    // Add modern dark CartoDB tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 18,
        subdomains: 'abcd'
    }).addTo(map);
    
    // Add zoom control to bottom right
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);
    
    console.log('✅ Modern map initialized');
    
    // Add smooth zoom animation
    map.on('zoomstart', function() {
        map.getContainer().style.cursor = 'wait';
    });
    
    map.on('zoomend', function() {
        map.getContainer().style.cursor = '';
    });
}

// Clear all route layers from map
function clearRoutes() {
    routeLayers.forEach(layer => map.removeLayer(layer));
    routeLayers = [];
    
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];
}

// Get color based on risk level
function getRiskColor(riskLevel) {
    const colors = {
        'low': '#28a745',
        'medium': '#ffc107',
        'high': '#dc3545'
    };
    return colors[riskLevel] || '#6c757d';
}

// Display routes on map with modern styling and animations
function displayRoutes(routes, startName, endName) {
    clearRoutes();
    
    // Create custom start marker with pulse effect
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
    
    // Create custom end marker
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
    
    // Draw routes with animation
    routes.forEach((route, index) => {
        const color = getRiskColor(route.risk_level);
        const opacity = route.recommended ? 1.0 : 0.6;
        const weight = route.recommended ? 6 : 4;
        
        // Create animated polyline
        const polyline = L.polyline(route.waypoints, {
            color: color,
            weight: weight,
            opacity: opacity,
            routeId: route.id,
            dashArray: route.recommended ? '0' : '10, 10',
            className: 'route-line'
        }).addTo(map);
        
        // Add glow effect for recommended route
        if (route.recommended) {
            const glowLine = L.polyline(route.waypoints, {
                color: color,
                weight: weight + 6,
                opacity: 0.2,
                routeId: route.id
            }).addTo(map);
            routeLayers.push(glowLine);
        }
        
        // Enhanced popup
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
        
        // Add click event with animation
        polyline.on('click', function() {
            highlightRoute(route.id);
            showRouteDetails(route);
            // Smooth zoom to route
            map.fitBounds(polyline.getBounds(), { 
                padding: [50, 50],
                animate: true,
                duration: 0.5
            });
        });
        
        routeLayers.push(polyline);
        
        // Animate route drawing
        setTimeout(() => {
            polyline.setStyle({ opacity: opacity });
        }, index * 200);
    });
    
    // Fit map to show all routes with padding
    const allPoints = routes.flatMap(r => r.waypoints);
    map.fitBounds(allPoints, { 
        padding: [80, 80],
        animate: true,
        duration: 1
    });
    
    // Show success toast
    showToast('success', `Found ${routes.length} routes from ${startName} to ${endName}`);
}

// Display route cards in sidebar with modern design
function displayRouteCards(routes) {
    const container = document.getElementById('routeCards');
    container.innerHTML = '';
    
    routes.forEach((route, index) => {
        const card = document.createElement('div');
        card.className = `route-card ${route.risk_level}-risk ${route.recommended ? 'recommended' : ''}`;
        card.setAttribute('data-route-id', route.id);
        
        // Determine risk icon
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
        
        // Animate risk score bar
        setTimeout(() => {
            const fillBar = card.querySelector('.risk-score-fill');
            if (fillBar) {
                fillBar.style.width = route.risk_score + '%';
            }
        }, 100 + (index * 100));
        
        // Click handler to highlight route
        card.addEventListener('click', () => {
            highlightRoute(route.id);
            showRouteDetails(route);
            
            // Smooth scroll to route details on mobile
            if (window.innerWidth < 992) {
                setTimeout(() => {
                    document.getElementById('routeDetails')?.scrollIntoView({ 
                        behavior: 'smooth',
                        block: 'start'
                    });
                }, 300);
            }
        });
        
        // Add entrance animation
        card.style.opacity = '0';
        card.style.transform = 'translateX(-20px)';
        container.appendChild(card);
        
        setTimeout(() => {
            card.style.transition = 'all 0.3s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateX(0)';
        }, 50 + (index * 100));
    });
    
    document.getElementById('routeResults').style.display = 'block';
    
    // Animate container
    const resultsContainer = document.getElementById('routeResults');
    resultsContainer.style.opacity = '0';
    resultsContainer.style.transform = 'translateY(20px)';
    setTimeout(() => {
        resultsContainer.style.transition = 'all 0.5s ease';
        resultsContainer.style.opacity = '1';
        resultsContainer.style.transform = 'translateY(0)';
    }, 100);
}

// Highlight a specific route
function highlightRoute(routeId) {
    // Remove active class from all cards
    document.querySelectorAll('.route-card').forEach(card => {
        card.classList.remove('active');
    });
    
    // Add active class to clicked card
    const activeCard = document.querySelector(`[data-route-id="${routeId}"]`);
    if (activeCard) {
        activeCard.classList.add('active');
    }
    
    // Highlight route on map
    routeLayers.forEach(layer => {
        if (layer.options.routeId === routeId) {
            layer.setStyle({ weight: 8, opacity: 1.0 });
            layer.bringToFront();
        } else {
            layer.setStyle({ weight: 4, opacity: 0.4 });
        }
    });
}

// Show detailed route information
function showRouteDetails(route) {
    const detailsContainer = document.getElementById('detailsContent');
    
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
    
    document.getElementById('routeDetails').style.display = 'block';
}

// Form submission handler
document.getElementById('routeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const start = document.getElementById('startLocation').value;
    const end = document.getElementById('endLocation').value;
    
    if (!start || !end) {
        alert('Please select both starting point and destination');
        return;
    }
    
    if (start === end) {
        alert('Start and destination cannot be the same');
        return;
    }
    
    // Show loading indicator
    document.getElementById('loadingIndicator').style.display = 'block';
    document.getElementById('findRoutesBtn').disabled = true;
    document.getElementById('routeResults').style.display = 'none';
    document.getElementById('routeDetails').style.display = 'none';
    
    try {
        // Call API to get routes
        const response = await fetch('/api/routes', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ start, end })
        });
        
        if (!response.ok) {
            throw new Error('Failed to fetch routes');
        }
        
        const data = await response.json();
        currentRoutes = data.routes;
        
        // Display routes on map
        displayRoutes(data.routes, data.start, data.end);
        
        // Display route cards
        displayRouteCards(data.routes);
        
        // Show save favorite button
        showSaveFavoriteButton();
        
        // Automatically show details for recommended route
        const recommendedRoute = data.routes.find(r => r.recommended);
        if (recommendedRoute) {
            showRouteDetails(recommendedRoute);
            highlightRoute(recommendedRoute.id);
        }
        
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to generate routes. Please try again.');
    } finally {
        document.getElementById('loadingIndicator').style.display = 'none';
        document.getElementById('findRoutesBtn').disabled = false;
    }
});

// Initialize map on page load
window.addEventListener('load', () => {
    initMap();
    loadFavorites();
    console.log('✅ Application ready');
    
    // Add custom marker styles to head
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

// ========== FAVORITES FUNCTIONALITY ==========

let allFavorites = [];

// Load all favorites from backend
async function loadFavorites() {
    try {
        const response = await fetch('/api/favorites');
        const data = await response.json();
        
        if (data.success) {
            allFavorites = data.favorites;
            updateFavoritesDropdown();
            updateFavoritesList();
            
            // Show favorites card if there are any
            if (allFavorites.length > 0) {
                document.getElementById('savedFavorites').style.display = 'block';
            }
        }
    } catch (error) {
        console.error('Error loading favorites:', error);
    }
}

// Update favorites dropdown
function updateFavoritesDropdown() {
    const dropdown = document.getElementById('favoritesDropdown');
    dropdown.innerHTML = '<option value="">Choose a saved route...</option>';
    
    allFavorites.forEach(fav => {
        const option = document.createElement('option');
        option.value = fav.id;
        option.textContent = `⭐ ${fav.name} (${fav.start} → ${fav.end})`;
        dropdown.appendChild(option);
    });
}

// Update favorites list display
function updateFavoritesList() {
    const container = document.getElementById('favoritesList');
    
    if (allFavorites.length === 0) {
        container.innerHTML = `
            <div class="empty-favorites">
                <i class="fas fa-star"></i>
                <p>No saved favorites yet!</p>
                <p style="font-size: 0.85rem; margin-top: 0.5rem;">
                    Search for a route and save it for quick access later.
                </p>
            </div>
        `;
        document.getElementById('savedFavorites').style.display = 'none';
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
        
        // Click on item to use it
        item.addEventListener('click', (e) => {
            if (!e.target.closest('.favorite-btn')) {
                useFavorite(fav.id);
            }
        });
        
        container.appendChild(item);
    });
    
    document.getElementById('savedFavorites').style.display = 'block';
}

// Use a favorite route
async function useFavorite(favoriteId) {
    const favorite = allFavorites.find(f => f.id === favoriteId);
    if (!favorite) return;
    
    // Fill in the form
    document.getElementById('startLocation').value = favorite.start;
    document.getElementById('endLocation').value = favorite.end;
    
    // Record usage
    try {
        await fetch(`/api/favorites/${favoriteId}/use`, { method: 'POST' });
    } catch (error) {
        console.error('Error recording usage:', error);
    }
    
    // Trigger route search
    document.getElementById('findRoutesBtn').click();
    
    showToast('success', `Using favorite: ${favorite.name}`);
}

// Delete a favorite
async function deleteFavorite(favoriteId) {
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
}

// Handle favorites dropdown selection
document.getElementById('favoritesDropdown')?.addEventListener('change', (e) => {
    const favoriteId = parseInt(e.target.value);
    if (favoriteId) {
        useFavorite(favoriteId);
    }
});

// Show save favorite button after successful route search
function showSaveFavoriteButton() {
    const startLocation = document.getElementById('startLocation').value;
    const endLocation = document.getElementById('endLocation').value;
    
    if (startLocation && endLocation) {
        document.getElementById('saveFavoriteBtn').style.display = 'block';
    }
}

// Handle save favorite button click
document.getElementById('saveFavoriteBtn')?.addEventListener('click', () => {
    const start = document.getElementById('startLocation').value;
    const end = document.getElementById('endLocation').value;
    
    if (!start || !end) {
        showToast('error', 'Please select start and end locations');
        return;
    }
    
    // Fill modal with current route info
    document.getElementById('modalStartLocation').textContent = start;
    document.getElementById('modalEndLocation').textContent = end;
    document.getElementById('favoriteName').value = '';
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('saveFavoriteModal'));
    modal.show();
    
    // Focus on name input
    setTimeout(() => {
        document.getElementById('favoriteName').focus();
    }, 500);
});

// Handle confirm save favorite
document.getElementById('confirmSaveFavorite')?.addEventListener('click', async () => {
    const name = document.getElementById('favoriteName').value.trim();
    const start = document.getElementById('startLocation').value;
    const end = document.getElementById('endLocation').value;
    
    if (!name) {
        alert('Please enter a name for this favorite');
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
            
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('saveFavoriteModal'));
            modal.hide();
        } else {
            showToast('error', data.error || 'Failed to save favorite');
        }
    } catch (error) {
        console.error('Error saving favorite:', error);
        showToast('error', 'Error saving favorite');
    }
});

// ========== END FAVORITES FUNCTIONALITY ==========

// Toast notification system
function showToast(type, message) {
    const toastEl = document.getElementById(type + 'Toast');
    const toastBody = document.getElementById(type + 'ToastBody');
    
    if (toastEl && toastBody) {
        toastBody.textContent = message;
        const toast = new bootstrap.Toast(toastEl);
        toast.show();
    }
}

// Swap locations button functionality
document.getElementById('swapLocations')?.addEventListener('click', () => {
    const start = document.getElementById('startLocation');
    const end = document.getElementById('endLocation');
    
    if (start && end) {
        const temp = start.value;
        start.value = end.value;
        end.value = temp;
        
        // Add visual feedback
        const button = document.getElementById('swapLocations');
        button.style.transform = 'rotate(180deg)';
        setTimeout(() => {
            button.style.transform = '';
        }, 300);
    }
});

// Map control buttons
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
    
    if (!isFullscreen) {
        mapCard.style.position = 'fixed';
        mapCard.style.top = '0';
        mapCard.style.left = '0';
        mapCard.style.width = '100vw';
        mapCard.style.height = '100vh';
        mapCard.style.zIndex = '9999';
        mapCard.style.margin = '0';
        
        document.getElementById('map').style.height = '100vh';
        icon.className = 'fas fa-compress';
        isFullscreen = true;
    } else {
        mapCard.style.position = '';
        mapCard.style.top = '';
        mapCard.style.left = '';
        mapCard.style.width = '';
        mapCard.style.height = '';
        mapCard.style.zIndex = '';
        mapCard.style.margin = '';
        
        document.getElementById('map').style.height = '650px';
        icon.className = 'fas fa-expand';
        isFullscreen = false;
    }
    
    setTimeout(() => map.invalidateSize(), 100);
});

// Help button
document.getElementById('helpBtn')?.addEventListener('click', () => {
    const helpModal = new bootstrap.Modal(document.getElementById('helpModal'));
    helpModal.show();
});

// Enhanced error handling
window.addEventListener('error', (e) => {
    console.error('Application error:', e);
    showToast('error', 'An error occurred. Please try again.');
});

// Add keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + Enter to find routes
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const button = document.getElementById('findRoutesBtn');
        if (button && !button.disabled) {
            button.click();
        }
    }
    
    // ESC to exit fullscreen
    if (e.key === 'Escape' && isFullscreen) {
        document.getElementById('fullscreenMap')?.click();
    }
});