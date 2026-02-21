// Real-Time Traffic Integration for Web Interface
// Integrates Google Maps API with existing Indian Traffic System

class RealTimeTraffic {
    constructor(apiKey) {
        this.apiKey = apiKey;
        this.directionsService = new google.maps.DirectionsService();
        this.directionsRenderer = new google.maps.DirectionsRenderer({
            suppressMarkers: false,
            polylineOptions: {
                strokeWeight: 5,
                strokeOpacity: 0.7
            }
        });
        this.trafficLayer = new google.maps.TrafficLayer();
    }

    /**
     * Initialize real-time traffic features
     */
    init(map) {
        this.map = map;
        this.directionsRenderer.setMap(map);
        
        // Add traffic layer toggle
        this.addTrafficLayerControl();
    }

    /**
     * Get route with real-time traffic data
     */
    async getRouteWithTraffic(start, end, options = {}) {
        const request = {
            origin: start,
            destination: end,
            travelMode: google.maps.TravelMode.DRIVING,
            drivingOptions: {
                departureTime: options.departureTime || new Date(),
                trafficModel: google.maps.TrafficModel.BEST_GUESS
            },
            provideRouteAlternatives: true,
            avoidTolls: options.avoidTolls || false,
            avoidHighways: options.avoidHighways || false
        };

        return new Promise((resolve, reject) => {
            this.directionsService.route(request, (result, status) => {
                if (status === 'OK') {
                    const routes = this.processTrafficRoutes(result);
                    resolve(routes);
                } else {
                    reject(`Directions request failed: ${status}`);
                }
            });
        });
    }

    /**
     * Process routes with traffic information
     */
    processTrafficRoutes(directionsResult) {
        const routes = [];
        
        directionsResult.routes.forEach((route, index) => {
            const leg = route.legs[0];
            
            // Calculate traffic delay
            const normalDuration = leg.duration.value;
            const trafficDuration = leg.duration_in_traffic ? leg.duration_in_traffic.value : normalDuration;
            const delaySeconds = trafficDuration - normalDuration;
            const delayMinutes = Math.round(delaySeconds / 60);

            // Determine traffic level
            let trafficLevel, trafficColor, severity;
            if (delayMinutes < 5) {
                trafficLevel = 'Light';
                trafficColor = '#4CAF50';
                severity = 'low';
            } else if (delayMinutes < 15) {
                trafficLevel = 'Moderate';
                trafficColor = '#FF9800';
                severity = 'medium';
            } else {
                trafficLevel = 'Heavy';
                trafficColor = '#F44336';
                severity = 'high';
            }

            routes.push({
                routeIndex: index,
                summary: route.summary,
                distance: {
                    value: leg.distance.value,
                    text: leg.distance.text,
                    km: (leg.distance.value / 1000).toFixed(2)
                },
                duration: {
                    normal: {
                        value: normalDuration,
                        text: leg.duration.text,
                        minutes: Math.round(normalDuration / 60)
                    },
                    traffic: {
                        value: trafficDuration,
                        text: leg.duration_in_traffic ? leg.duration_in_traffic.text : leg.duration.text,
                        minutes: Math.round(trafficDuration / 60)
                    },
                    delay: {
                        value: delaySeconds,
                        minutes: delayMinutes,
                        text: `${delayMinutes} min delay`
                    }
                },
                traffic: {
                    level: trafficLevel,
                    color: trafficColor,
                    severity: severity
                },
                startAddress: leg.start_address,
                endAddress: leg.end_address,
                steps: leg.steps.map(step => ({
                    instruction: step.instructions,
                    distance: step.distance.text,
                    duration: step.duration.text
                })),
                warnings: route.warnings || [],
                polyline: route.overview_polyline
            });
        });

        // Sort by traffic duration (fastest first)
        routes.sort((a, b) => a.duration.traffic.value - b.duration.traffic.value);

        return {
            routes: routes,
            bestRoute: routes[0],
            alternatives: routes.slice(1)
        };
    }

    /**
     * Display route on map with traffic colors
     */
    displayRoute(route, map) {
        // Clear previous route
        this.directionsRenderer.setDirections(null);
        
        // Create custom polyline with traffic color
        const path = google.maps.geometry.encoding.decodePath(route.polyline);
        
        const routeLine = new google.maps.Polyline({
            path: path,
            strokeColor: route.traffic.color,
            strokeOpacity: 0.8,
            strokeWeight: 6,
            map: map
        });

        // Add markers for start and end
        new google.maps.Marker({
            position: path[0],
            map: map,
            label: 'S',
            title: 'Start: ' + route.startAddress
        });

        new google.maps.Marker({
            position: path[path.length - 1],
            map: map,
            label: 'D',
            title: 'End: ' + route.endAddress
        });

        // Fit bounds to show entire route
        const bounds = new google.maps.LatLngBounds();
        path.forEach(point => bounds.extend(point));
        map.fitBounds(bounds);

        return routeLine;
    }

    /**
     * Compare traffic at different times
     */
    async compareTrafficTimes(start, end) {
        const times = [
            { hour: 8, label: 'Morning Peak (8 AM)' },
            { hour: 14, label: 'Afternoon (2 PM)' },
            { hour: 18, label: 'Evening Peak (6 PM)' },
            { hour: 22, label: 'Night (10 PM)' }
        ];

        const comparisons = [];

        for (const time of times) {
            const departureTime = new Date();
            departureTime.setHours(time.hour, 0, 0, 0);

            try {
                const result = await this.getRouteWithTraffic(start, end, {
                    departureTime: departureTime
                });

                comparisons.push({
                    time: time.label,
                    hour: time.hour,
                    duration: result.bestRoute.duration.traffic.minutes,
                    durationText: result.bestRoute.duration.traffic.text,
                    delay: result.bestRoute.duration.delay.minutes,
                    trafficLevel: result.bestRoute.traffic.level
                });
            } catch (error) {
                console.error(`Error checking time ${time.label}:`, error);
            }

            // Small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // Find best and worst times
        const bestTime = comparisons.reduce((min, curr) => 
            curr.duration < min.duration ? curr : min
        );

        const worstTime = comparisons.reduce((max, curr) => 
            curr.duration > max.duration ? curr : max
        );

        return {
            comparisons: comparisons,
            bestTime: bestTime,
            worstTime: worstTime,
            timeSavings: worstTime.duration - bestTime.duration
        };
    }

    /**
     * Add traffic layer control to map
     */
    addTrafficLayerControl() {
        const controlDiv = document.createElement('div');
        controlDiv.style.margin = '10px';

        const controlUI = document.createElement('div');
        controlUI.style.backgroundColor = '#fff';
        controlUI.style.border = '2px solid #fff';
        controlUI.style.borderRadius = '3px';
        controlUI.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
        controlUI.style.cursor = 'pointer';
        controlUI.style.textAlign = 'center';
        controlUI.style.padding = '10px';
        controlUI.style.fontSize = '14px';
        controlUI.innerHTML = '🚦 Toggle Traffic';
        controlDiv.appendChild(controlUI);

        let trafficVisible = false;

        controlUI.addEventListener('click', () => {
            trafficVisible = !trafficVisible;
            this.trafficLayer.setMap(trafficVisible ? this.map : null);
            controlUI.style.backgroundColor = trafficVisible ? '#4CAF50' : '#fff';
            controlUI.style.color = trafficVisible ? '#fff' : '#000';
        });

        this.map.controls[google.maps.ControlPosition.TOP_RIGHT].push(controlDiv);
    }

    /**
     * Get live traffic conditions in an area
     */
    async getAreaTrafficConditions(location, radiusKm = 5) {
        // Use Distance Matrix API to check traffic to nearby points
        const center = await this.geocodeLocation(location);
        if (!center) return null;

        const nearbyPoints = this.generateNearbyPoints(center, radiusKm);
        const distanceMatrixService = new google.maps.DistanceMatrixService();

        return new Promise((resolve, reject) => {
            distanceMatrixService.getDistanceMatrix({
                origins: [center],
                destinations: nearbyPoints,
                travelMode: google.maps.TravelMode.DRIVING,
                drivingOptions: {
                    departureTime: new Date(),
                    trafficModel: google.maps.TrafficModel.BEST_GUESS
                }
            }, (response, status) => {
                if (status === 'OK') {
                    const conditions = this.analyzeAreaTraffic(response);
                    resolve(conditions);
                } else {
                    reject(`Distance Matrix request failed: ${status}`);
                }
            });
        });
    }

    /**
     * Analyze area traffic from distance matrix
     */
    analyzeAreaTraffic(response) {
        let totalDelay = 0;
        let count = 0;

        response.rows[0].elements.forEach(element => {
            if (element.status === 'OK' && element.duration_in_traffic) {
                const delay = element.duration_in_traffic.value - element.duration.value;
                totalDelay += delay;
                count++;
            }
        });

        const avgDelayMinutes = count > 0 ? totalDelay / count / 60 : 0;

        let condition, color;
        if (avgDelayMinutes < 2) {
            condition = 'Free Flow';
            color = '#4CAF50';
        } else if (avgDelayMinutes < 5) {
            condition = 'Light Traffic';
            color = '#8BC34A';
        } else if (avgDelayMinutes < 10) {
            condition = 'Moderate Traffic';
            color = '#FF9800';
        } else {
            condition = 'Heavy Traffic';
            color = '#F44336';
        }

        return {
            condition: condition,
            color: color,
            avgDelay: Math.round(avgDelayMinutes),
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Geocode location to coordinates
     */
    async geocodeLocation(location) {
        const geocoder = new google.maps.Geocoder();

        return new Promise((resolve, reject) => {
            geocoder.geocode({ address: location }, (results, status) => {
                if (status === 'OK') {
                    resolve(results[0].geometry.location);
                } else {
                    reject(`Geocoding failed: ${status}`);
                }
            });
        });
    }

    /**
     * Generate nearby points for traffic sampling
     */
    generateNearbyPoints(center, radiusKm) {
        const latOffset = radiusKm / 111; // 1 degree latitude ≈ 111km
        const lngOffset = radiusKm / (111 * Math.cos(center.lat() * Math.PI / 180));

        return [
            new google.maps.LatLng(center.lat() + latOffset, center.lng()), // North
            new google.maps.LatLng(center.lat() - latOffset, center.lng()), // South
            new google.maps.LatLng(center.lat(), center.lng() + lngOffset), // East
            new google.maps.LatLng(center.lat(), center.lng() - lngOffset)  // West
        ];
    }

    /**
     * Predict arrival time
     */
    async predictArrivalTime(start, end, departureTime = null) {
        const depTime = departureTime || new Date();
        
        const result = await this.getRouteWithTraffic(start, end, {
            departureTime: depTime
        });

        const route = result.bestRoute;
        const arrivalTime = new Date(depTime.getTime() + route.duration.traffic.value * 1000);

        return {
            departure: depTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            arrival: arrivalTime.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
            duration: route.duration.traffic.text,
            delay: route.duration.delay.text,
            trafficLevel: route.traffic.level,
            distance: route.distance.text
        };
    }
}

// UI Helper Functions
function displayTrafficRouteInfo(routeData, containerId) {
    const container = document.getElementById(containerId);
    
    const html = `
        <div class="traffic-route-info">
            <h3>🚗 ${routeData.bestRoute.summary}</h3>
            
            <div class="traffic-stats">
                <div class="stat-card">
                    <span class="label">Distance</span>
                    <span class="value">${routeData.bestRoute.distance.text}</span>
                </div>
                
                <div class="stat-card">
                    <span class="label">Normal Time</span>
                    <span class="value">${routeData.bestRoute.duration.normal.text}</span>
                </div>
                
                <div class="stat-card">
                    <span class="label">With Traffic</span>
                    <span class="value">${routeData.bestRoute.duration.traffic.text}</span>
                </div>
                
                <div class="stat-card" style="background: ${routeData.bestRoute.traffic.color}20;">
                    <span class="label">Delay</span>
                    <span class="value" style="color: ${routeData.bestRoute.traffic.color}">
                        ${routeData.bestRoute.duration.delay.text}
                    </span>
                </div>
            </div>
            
            <div class="traffic-indicator" style="background: ${routeData.bestRoute.traffic.color}">
                ${routeData.bestRoute.traffic.level} Traffic
            </div>
            
            ${routeData.alternatives.length > 0 ? `
                <div class="alternatives">
                    <h4>Alternative Routes (${routeData.alternatives.length})</h4>
                    ${routeData.alternatives.map((alt, idx) => `
                        <div class="alt-route">
                            <strong>Route ${idx + 2}:</strong> ${alt.summary}<br>
                            <small>
                                ${alt.distance.text} • ${alt.duration.traffic.text} • 
                                ${alt.duration.delay.minutes} min delay
                            </small>
                        </div>
                    `).join('')}
                </div>
            ` : ''}
        </div>
    `;
    
    container.innerHTML = html;
}

function displayTimeComparison(comparisonData, containerId) {
    const container = document.getElementById(containerId);
    
    const html = `
        <div class="time-comparison">
            <h3>⏰ Best Time to Travel</h3>
            
            <div class="comparison-grid">
                ${comparisonData.comparisons.map(item => `
                    <div class="time-card ${item === comparisonData.bestTime ? 'best-time' : ''}">
                        <div class="time-label">${item.time}</div>
                        <div class="time-duration">${item.durationText}</div>
                        <div class="time-traffic">${item.trafficLevel}</div>
                    </div>
                `).join('')}
            </div>
            
            <div class="recommendation">
                <strong>💡 Recommendation:</strong><br>
                Travel at <strong>${comparisonData.bestTime.time}</strong> 
                to save <strong>${comparisonData.timeSavings} minutes</strong>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { RealTimeTraffic, displayTrafficRouteInfo, displayTimeComparison };
}
