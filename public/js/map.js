/**
 * MarineStream Workspace - Map Module
 * AIS vessel tracking with Mapbox GL JS
 */

import { getLng, getLat, isValidPosition, normalizePosition, escapeHtml, debounce } from './map-utils.js';

let map = null;
let markers = new Map();
let portMarkers = new Map();
let vesselData = new Map();
let vesselProfiles = new Map(); // Vessel profile cache
let websocket = null;
let callbacks = {};
let activePopupMmsi = null; // Track which vessel has an open popup

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
    
    // Load ports when map moves (debounced)
    let portLoadTimeout = null;
    map.on('moveend', () => {
      if (portLoadTimeout) clearTimeout(portLoadTimeout);
      portLoadTimeout = setTimeout(() => {
        if (map.getZoom() >= 6) { // Only load ports when zoomed in enough
          loadNearbyPorts();
        } else {
          // Clear port markers when zoomed out
          portMarkers.forEach(marker => marker.remove());
          portMarkers.clear();
        }
      }, 500);
    });
    
    console.log('🗺️ Map initialized');
    
    return {
      instance: map,
      zoomIn,
      zoomOut,
      fitBounds: fitAllVessels,
      getVessels: () => Array.from(vesselData.values()),
      getVesselProfile: getVesselProfile,
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
 * Get vessel profile from cache
 */
function getVesselProfile(mmsi) {
  return vesselProfiles.get(mmsi) || null;
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
      lng: positionReport.Longitude,
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
  
  const pos = vessel.position;
  const lat = getLat(pos);
  const lng = getLng(pos);
  
  // Validate coordinates
  if (lat === null || lng === null) {
    console.warn(`Invalid position for vessel ${vessel.mmsi}:`, pos);
    return;
  }
  
  const course = pos.course;
  const status = pos.status;
  
  // Check if marker exists
  let marker = markers.get(vessel.mmsi);
  
  if (marker) {
    // Update position with animation
    marker.setLngLat([lng, lat]);
    
    // Update rotation
    const el = marker.getElement();
    if (el && course !== undefined) {
      const svg = el.querySelector('svg');
      if (svg) svg.style.transform = `rotate(${course}deg)`;
    }
  } else {
    // Create new marker
    const el = createMarkerElement(vessel, status);
    
    marker = new mapboxgl.Marker({
      element: el,
      rotationAlignment: 'map'
    })
      .setLngLat([lng, lat])
      .addTo(map);
    
    // Add click handler for vessel detail popup
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      showVesselPopup(vessel, marker);
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
  
  // Determine color based on status and source
  const isUnderway = status === 0 || status === 8;
  const isMoored = status === 1 || status === 5;
  const isDiscovered = vessel.isDiscovered;
  const isLive = vessel.positionSource === 'aisstream' || !vessel.position?.isStale;
  
  let color = '#C9A227'; // Default gold
  if (isMoored) color = '#9E9E98';
  else if (isUnderway) color = '#2E7D4A';
  
  // Discovered vessels have different styling
  if (isDiscovered) {
    color = '#6366f1'; // Indigo for discovered vessels
  }
  
  const course = vessel.position?.course || 0;
  
  el.innerHTML = `
    <div style="position: relative;">
      ${isLive ? `
        <div style="
          position: absolute;
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: ${color};
          opacity: 0.2;
          animation: vesselPulse 2s infinite;
          top: -4px;
          left: -4px;
        "></div>
      ` : ''}
      <svg width="24" height="32" viewBox="0 0 24 32" fill="none" style="transform: rotate(${course}deg);">
        <path d="M12 0L20 8V24L12 32L4 24V8L12 0Z" fill="${color}" stroke="#1A1A19" stroke-width="1"/>
        <circle cx="12" cy="12" r="4" fill="#1A1A19" opacity="0.3"/>
      </svg>
      ${isLive ? `
        <div style="
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          background: #22c55e;
          color: white;
          font-size: 7px;
          padding: 1px 3px;
          border-radius: 2px;
          font-weight: 600;
        ">LIVE</div>
      ` : ''}
      ${isDiscovered ? `
        <div style="
          position: absolute;
          bottom: -6px;
          left: 50%;
          transform: translateX(-50%);
          background: #6366f1;
          color: white;
          font-size: 7px;
          padding: 1px 3px;
          border-radius: 2px;
          font-weight: 600;
        ">AIS</div>
      ` : ''}
    </div>
  `;
  
  el.style.cssText = `
    cursor: pointer;
    transition: transform 0.2s ease;
  `;
  
  el.title = vessel.name || vessel.mmsi;
  
  return el;
}

/**
 * Show vessel popup with details
 */
function showVesselPopup(vessel, marker) {
  // If clicking the same vessel that has an open popup, toggle it closed
  if (activePopupMmsi === vessel.mmsi) {
    closeAllPopups();
    return;
  }
  
  // Close any existing popups first
  closeAllPopups();
  
  // Create and show new popup
  const popupContent = createBasicPopupContent(vessel);
  
  const popup = new mapboxgl.Popup({ 
    offset: 25, 
    closeButton: true, 
    maxWidth: '320px',
    closeOnClick: false // Prevent map clicks from closing popup unexpectedly
  })
    .setHTML(popupContent)
    .on('close', () => {
      // Clear active popup tracking when popup is closed
      if (activePopupMmsi === vessel.mmsi) {
        activePopupMmsi = null;
      }
    });
  
  // Set popup and show it
  marker.setPopup(popup);
  popup.addTo(map);
  activePopupMmsi = vessel.mmsi;
  
  // Trigger callback
  callbacks.onVesselClick?.(vessel);
}

/**
 * Close all open popups on the map
 */
function closeAllPopups() {
  markers.forEach((marker) => {
    const popup = marker.getPopup();
    if (popup && popup.isOpen()) {
      popup.remove();
    }
  });
  activePopupMmsi = null;
}

/**
 * Create basic popup content
 */
function createBasicPopupContent(vessel) {
  const pos = vessel.position || {};
  const speed = pos.speed !== undefined ? `${pos.speed.toFixed(1)} kn` : '--';
  const course = pos.course !== undefined ? `${Math.round(pos.course)}°` : '--';
  
  return `
    <div class="vessel-popup">
      <div class="vessel-popup-header">
        <h3>${vessel.name || 'Unknown Vessel'}</h3>
        <span class="vessel-popup-mmsi">MMSI: ${vessel.mmsi}</span>
      </div>
      <div class="vessel-popup-body">
        <div class="vessel-popup-row">
          <span class="label">Type:</span>
          <span class="value">${vessel.vessel_type || '--'}</span>
        </div>
        <div class="vessel-popup-row">
          <span class="label">Flag:</span>
          <span class="value">${vessel.flag || '--'}</span>
        </div>
        <div class="vessel-popup-row">
          <span class="label">Speed:</span>
          <span class="value">${speed}</span>
        </div>
        <div class="vessel-popup-row">
          <span class="label">Course:</span>
          <span class="value">${course}</span>
        </div>
      </div>
    </div>
  `;
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
    .filter(v => v.position && isValidPosition(v.position))
    .map(v => [getLng(v.position), getLat(v.position)]);
  
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

/**
 * Add CSS for vessel popups and markers
 */
const markerStyles = document.createElement('style');
markerStyles.textContent = `
  @keyframes vesselPulse {
    0% { transform: scale(0.8); opacity: 0.2; }
    50% { transform: scale(1.2); opacity: 0.05; }
    100% { transform: scale(0.8); opacity: 0.2; }
  }
  
  .vessel-popup {
    font-family: 'DM Sans', system-ui, sans-serif;
    min-width: 200px;
  }
  
  .vessel-popup.enriched {
    min-width: 280px;
  }
  
  .vessel-popup-image {
    margin: -10px -10px 10px -10px;
    border-radius: 8px 8px 0 0;
    overflow: hidden;
    max-height: 150px;
  }
  
  .vessel-popup-image img {
    width: 100%;
    height: auto;
    object-fit: cover;
  }
  
  .vessel-popup-header {
    margin-bottom: 12px;
  }
  
  .vessel-popup-header h3 {
    margin: 0 0 4px 0;
    font-size: 16px;
    font-weight: 600;
    color: #1A1A19;
  }
  
  .vessel-popup-mmsi,
  .vessel-popup-type {
    font-size: 12px;
    color: #9E9E98;
  }
  
  .vessel-popup-body {
    font-size: 13px;
  }
  
  .vessel-popup-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    border-bottom: 1px solid #EEEEEC;
  }
  
  .vessel-popup-row:last-child {
    border-bottom: none;
  }
  
  .vessel-popup-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  
  .vessel-popup-item {
    display: flex;
    flex-direction: column;
  }
  
  .vessel-popup-item .label,
  .vessel-popup-row .label {
    font-size: 11px;
    color: #9E9E98;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  
  .vessel-popup-item .value,
  .vessel-popup-row .value {
    font-size: 13px;
    color: #1A1A19;
    font-weight: 500;
  }
  
  .vessel-popup-destination {
    margin-top: 12px;
    padding: 8px;
    background: #F5F5F3;
    border-radius: 6px;
  }
  
  .vessel-popup-destination .label {
    font-size: 11px;
    color: #9E9E98;
  }
  
  .vessel-popup-destination .value {
    font-weight: 500;
    color: #1A1A19;
  }
  
  .vessel-popup-destination .eta {
    display: block;
    font-size: 11px;
    color: #C9A227;
    margin-top: 2px;
  }
  
  .vessel-popup-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 12px;
    padding-top: 8px;
    border-top: 1px solid #EEEEEC;
    font-size: 11px;
  }
  
  .vessel-popup-footer .source-badge {
    background: #E5C968;
    color: #1A1A19;
    padding: 2px 6px;
    border-radius: 4px;
    font-weight: 500;
  }
  
  .vessel-popup-footer .timestamp {
    color: #9E9E98;
  }
  
  .vessel-popup-loading {
    text-align: center;
    padding: 8px;
    color: #9E9E98;
    font-size: 12px;
    animation: pulse 1.5s infinite;
  }
  
  @keyframes pulse {
    0%, 100% { opacity: 0.5; }
    50% { opacity: 1; }
  }
  
  .port-marker {
    transition: transform 0.2s ease;
  }
  
  .port-marker:hover {
    transform: scale(1.2);
    opacity: 1 !important;
  }
  
  /* Mapbox popup overrides */
  .mapboxgl-popup-content {
    padding: 12px;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  }
`;
document.head.appendChild(markerStyles);
