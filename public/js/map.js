/**
 * MarineStream Workspace - Map Module
 * AIS vessel tracking with Mapbox GL JS
 */

let map = null;
let markers = new Map();
let vesselData = new Map();
let websocket = null;
let callbacks = {};

// Map configuration
const config = {
  // Default center on Australian waters
  center: [133, -25],
  zoom: 4,
  minZoom: 2,
  maxZoom: 18,
  // Mapbox style (can use custom style URL if MAPBOX_ACCESS_TOKEN is set)
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'
};

/**
 * Initialize the map
 */
export async function initMap(containerId, options = {}) {
  callbacks = options;
  
  const container = document.getElementById(containerId);
  if (!container) {
    console.error('Map container not found:', containerId);
    return null;
  }
  
  try {
    // Check for Mapbox token (set by app.js from server config)
    const hasMapboxToken = typeof mapboxgl !== 'undefined' && mapboxgl.accessToken;
    
    if (hasMapboxToken) {
      // Use Mapbox style for better aesthetics
      config.style = 'mapbox://styles/mapbox/dark-v11';
      console.log('🗺️ Using Mapbox tiles');
    } else {
      console.log('🗺️ Using free CARTO tiles (no Mapbox token)');
    }
    
    // Initialize map
    map = new mapboxgl.Map({
      container: containerId,
      style: config.style,
      center: config.center,
      zoom: config.zoom,
      minZoom: config.minZoom,
      maxZoom: config.maxZoom,
      attributionControl: false
    });
    
    // Wait for map to load
    await new Promise((resolve, reject) => {
      map.on('load', resolve);
      map.on('error', reject);
    });
    
    // Add attribution
    map.addControl(new mapboxgl.AttributionControl({
      compact: true
    }), 'bottom-right');
    
    // Hide loading indicator
    const loadingEl = container.querySelector('.map-loading');
    if (loadingEl) {
      loadingEl.style.display = 'none';
    }
    
    // Load initial vessels
    await loadVessels();
    
    // Connect to WebSocket for real-time updates
    connectWebSocket();
    
    console.log('🗺️ Map initialized');
    
    return {
      instance: map,
      zoomIn,
      zoomOut,
      fitBounds: fitAllVessels,
      getVessels: () => Array.from(vesselData.values())
    };
  } catch (error) {
    console.error('Map initialization error:', error);
    
    // Show error state
    const loadingEl = container.querySelector('.map-loading');
    if (loadingEl) {
      loadingEl.innerHTML = `
        <span>Map unavailable</span>
        <small style="opacity: 0.7; margin-top: 8px;">Check connection and reload</small>
      `;
    }
    
    return null;
  }
}

/**
 * Load vessels from API
 */
async function loadVessels() {
  try {
    const response = await fetch('/api/map/vessels');
    const data = await response.json();
    
    if (data.success && data.data) {
      data.data.forEach(vessel => {
        vesselData.set(vessel.mmsi, vessel);
        if (vessel.position) {
          updateMarker(vessel);
        }
      });
      
      updateStats();
      
      // Fit map to vessels if any have positions
      const vesselsWithPositions = data.data.filter(v => v.position);
      if (vesselsWithPositions.length > 0) {
        fitAllVessels();
      }
    }
  } catch (error) {
    console.error('Failed to load vessels:', error);
  }
}

/**
 * Connect to WebSocket for real-time AIS updates
 */
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/map/stream`;
  
  try {
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = () => {
      console.log('📡 Connected to vessel stream');
    };
    
    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleAISMessage(message);
      } catch (e) {
        console.error('Failed to parse AIS message:', e);
      }
    };
    
    websocket.onclose = () => {
      console.log('📡 Vessel stream disconnected - reconnecting in 5s...');
      setTimeout(connectWebSocket, 5000);
    };
    
    websocket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  } catch (error) {
    console.error('Failed to connect WebSocket:', error);
    setTimeout(connectWebSocket, 5000);
  }
}

/**
 * Handle incoming AIS message
 */
function handleAISMessage(message) {
  if (!message.MetaData || !message.Message) return;
  
  const mmsi = message.MetaData.MMSI?.toString();
  if (!mmsi) return;
  
  // Get or create vessel data
  let vessel = vesselData.get(mmsi);
  if (!vessel) {
    vessel = {
      mmsi,
      name: message.MetaData.ShipName || 'Unknown',
      vessel_type: null,
      flag: null
    };
    vesselData.set(mmsi, vessel);
  }
  
  // Update name if available
  if (message.MetaData.ShipName) {
    vessel.name = message.MetaData.ShipName;
  }
  
  // Extract position from message
  const positionReport = message.Message.PositionReport;
  if (positionReport) {
    vessel.position = {
      lat: positionReport.Latitude,
      lon: positionReport.Longitude,
      speed: positionReport.Sog,
      course: positionReport.Cog,
      heading: positionReport.TrueHeading,
      status: positionReport.NavigationalStatus,
      timestamp: new Date().toISOString()
    };
    
    updateMarker(vessel);
  }
  
  updateStats();
}

/**
 * Update or create marker for vessel
 */
function updateMarker(vessel) {
  if (!map || !vessel.position) return;
  
  const { lat, lon, course, speed, status } = vessel.position;
  
  // Check if marker exists
  let marker = markers.get(vessel.mmsi);
  
  if (marker) {
    // Update position with animation
    marker.setLngLat([lon, lat]);
    
    // Update rotation
    const el = marker.getElement();
    if (el && course !== undefined) {
      el.style.transform = `rotate(${course}deg)`;
    }
  } else {
    // Create new marker
    const el = createMarkerElement(vessel, status);
    
    marker = new mapboxgl.Marker({
      element: el,
      rotation: course || 0,
      rotationAlignment: 'map'
    })
      .setLngLat([lon, lat])
      .addTo(map);
    
    // Add click handler
    el.addEventListener('click', () => {
      callbacks.onVesselClick?.(vessel);
    });
    
    markers.set(vessel.mmsi, marker);
  }
}

/**
 * Create custom marker element
 */
function createMarkerElement(vessel, status) {
  const el = document.createElement('div');
  el.className = 'vessel-marker';
  
  // Determine color based on status
  const isUnderway = status === 0 || status === 8;
  const isMoored = status === 1 || status === 5;
  const color = isMoored ? '#9E9E98' : (isUnderway ? '#2E7D4A' : '#C9A227');
  
  el.innerHTML = `
    <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
      <path d="M12 0L20 8V24L12 32L4 24V8L12 0Z" fill="${color}" stroke="#1A1A19" stroke-width="1"/>
      <circle cx="12" cy="12" r="4" fill="#1A1A19" opacity="0.3"/>
    </svg>
  `;
  
  el.style.cssText = `
    cursor: pointer;
    transition: transform 0.3s ease;
  `;
  
  el.title = vessel.name || vessel.mmsi;
  
  return el;
}

/**
 * Update map statistics
 */
function updateStats() {
  const vesselCount = document.getElementById('vessel-count');
  const inPortCount = document.getElementById('vessels-in-port');
  
  if (vesselCount) {
    vesselCount.textContent = vesselData.size;
  }
  
  if (inPortCount) {
    const moored = Array.from(vesselData.values()).filter(v => 
      v.position && (v.position.status === 1 || v.position.status === 5)
    ).length;
    inPortCount.textContent = moored;
  }
}

/**
 * Zoom in
 */
function zoomIn() {
  if (map) {
    map.zoomIn();
  }
}

/**
 * Zoom out
 */
function zoomOut() {
  if (map) {
    map.zoomOut();
  }
}

/**
 * Fit map to show all vessels
 */
function fitAllVessels() {
  if (!map) return;
  
  const positions = Array.from(vesselData.values())
    .filter(v => v.position)
    .map(v => [v.position.lon, v.position.lat]);
  
  if (positions.length === 0) {
    // Default to Australian waters
    map.flyTo({
      center: config.center,
      zoom: config.zoom,
      duration: 1000
    });
    return;
  }
  
  if (positions.length === 1) {
    map.flyTo({
      center: positions[0],
      zoom: 10,
      duration: 1000
    });
    return;
  }
  
  // Calculate bounds
  const bounds = positions.reduce((bounds, coord) => {
    return bounds.extend(coord);
  }, new mapboxgl.LngLatBounds(positions[0], positions[0]));
  
  map.fitBounds(bounds, {
    padding: 60,
    maxZoom: 12,
    duration: 1000
  });
}

/**
 * Cleanup on page unload
 */
window.addEventListener('beforeunload', () => {
  if (websocket) {
    websocket.close();
  }
});
