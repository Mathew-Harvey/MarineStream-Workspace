/**
 * MarineStream - Shared Map Utilities
 * Common functions for map operations used across map.js and dashboard-v2.js
 */

/**
 * Get longitude from position object
 * Handles 'lng', 'lon', and 'longitude' properties
 * @param {Object} pos - Position object
 * @returns {number|null} - Longitude value or null if invalid
 */
export function getLng(pos) {
  if (!pos) return null;
  const lng = pos.lng ?? pos.lon ?? pos.longitude;
  return typeof lng === 'number' && !isNaN(lng) ? lng : null;
}

/**
 * Get latitude from position object
 * Handles 'lat' and 'latitude' properties
 * @param {Object} pos - Position object
 * @returns {number|null} - Latitude value or null if invalid
 */
export function getLat(pos) {
  if (!pos) return null;
  const lat = pos.lat ?? pos.latitude;
  return typeof lat === 'number' && !isNaN(lat) ? lat : null;
}

/**
 * Check if a position object has valid coordinates
 * @param {Object} pos - Position object
 * @returns {boolean} - True if position has valid lat/lng
 */
export function isValidPosition(pos) {
  if (!pos || pos.source === 'no_position') return false;
  const lat = getLat(pos);
  const lng = getLng(pos);
  return lat !== null && lng !== null;
}

/**
 * Normalize a position object to use consistent property names
 * Always outputs { lat, lng } format
 * @param {Object} pos - Position object with any naming convention
 * @returns {Object|null} - Normalized position or null if invalid
 */
export function normalizePosition(pos) {
  if (!pos) return null;
  
  const lat = getLat(pos);
  const lng = getLng(pos);
  
  if (lat === null || lng === null) return null;
  
  return {
    lat,
    lng,
    speed: pos.speed ?? pos.sog ?? null,
    course: pos.course ?? pos.cog ?? null,
    heading: pos.heading ?? pos.trueHeading ?? null,
    status: pos.status ?? pos.navigationStatus ?? null,
    timestamp: pos.timestamp ?? null,
    source: pos.source ?? 'unknown',
    isStale: pos.isStale ?? false
  };
}

/**
 * Calculate bounds from an array of position objects
 * @param {Array} positions - Array of position objects
 * @returns {Object|null} - Bounds object or null if no valid positions
 */
export function calculateBounds(positions) {
  const validPositions = positions
    .map(p => normalizePosition(p))
    .filter(p => p !== null);
  
  if (validPositions.length === 0) return null;
  
  const lats = validPositions.map(p => p.lat);
  const lngs = validPositions.map(p => p.lng);
  
  return {
    sw: { lat: Math.min(...lats), lng: Math.min(...lngs) },
    ne: { lat: Math.max(...lats), lng: Math.max(...lngs) },
    center: {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2
    }
  };
}

/**
 * Format speed for display
 * @param {number} speed - Speed in knots
 * @returns {string} - Formatted speed string
 */
export function formatSpeed(speed) {
  if (speed === null || speed === undefined) return '--';
  return `${speed.toFixed(1)} kn`;
}

/**
 * Format course for display
 * @param {number} course - Course in degrees
 * @returns {string} - Formatted course string
 */
export function formatCourse(course) {
  if (course === null || course === undefined) return '--';
  return `${Math.round(course)}°`;
}

/**
 * Get color for vessel based on status
 * @param {Object} vessel - Vessel object
 * @returns {string} - Hex color code
 */
export function getVesselColor(vessel) {
  if (vessel.typeCategory === 'military') return '#3b82f6';
  if (vessel.typeCategory === 'commercial') return '#10b981';
  return '#C9A227'; // Default gold
}

/**
 * Get color for navigational status
 * @param {number} status - AIS navigational status code
 * @returns {string} - Hex color code
 */
export function getStatusColor(status) {
  const isMoored = status === 1 || status === 5;
  const isUnderway = status === 0 || status === 8;
  
  if (isMoored) return '#9E9E98';
  if (isUnderway) return '#2E7D4A';
  return '#C9A227';
}

/**
 * Escape HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} - Escaped HTML
 */
export function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Debounce function to limit execution rate
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} - Debounced function
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}
