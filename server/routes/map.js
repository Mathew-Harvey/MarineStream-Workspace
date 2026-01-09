/**
 * MarineStream Workspace - Map Routes
 * Vessel positions and map data (with AISStream.io integration)
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');

// In-memory cache for vessel positions (updated via AISStream WebSocket)
// Key: MMSI string, Value: position data with timestamp
const vesselPositions = new Map();

// Position age threshold (positions older than this are considered stale)
const POSITION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * GET /api/map/vessels
 * Get current vessel positions (from AIS cache)
 */
router.get('/vessels', optionalAuth, async (req, res) => {
  try {
    // Get vessels from database
    const result = await db.query(
      `SELECT id, mmsi, name, vessel_type, flag, organization_id
       FROM vessels
       WHERE is_tracked = true AND mmsi IS NOT NULL`
    );

    const now = Date.now();
    
    // Merge with cached AIS positions
    const vessels = result.rows.map(vessel => {
      const position = vesselPositions.get(vessel.mmsi);
      const isStale = position ? (now - new Date(position.timestamp).getTime() > POSITION_MAX_AGE_MS) : true;
      
      return {
        ...vessel,
        position: position ? {
          lat: position.lat,
          lng: position.lon,
          speed: position.speed,
          course: position.course,
          heading: position.heading,
          status: position.status,
          shipName: position.shipName,
          isStale
        } : null,
        lastUpdate: position?.timestamp || null,
        hasLivePosition: !!position && !isStale
      };
    });

    res.json({
      success: true,
      data: vessels,
      meta: {
        total: vessels.length,
        withPosition: vessels.filter(v => v.position).length,
        withLivePosition: vessels.filter(v => v.hasLivePosition).length,
        cacheSize: vesselPositions.size,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error fetching vessel positions:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch vessel positions'
      }
    });
  }
});

/**
 * GET /api/map/positions
 * Get all cached AIS positions (for map display)
 */
router.get('/positions', optionalAuth, (req, res) => {
  const now = Date.now();
  const positions = [];
  
  vesselPositions.forEach((pos, mmsi) => {
    const age = now - new Date(pos.timestamp).getTime();
    const isStale = age > POSITION_MAX_AGE_MS;
    
    positions.push({
      mmsi,
      lat: pos.lat,
      lng: pos.lon,
      speed: pos.speed,
      course: pos.course,
      heading: pos.heading,
      status: pos.status,
      shipName: pos.shipName,
      timestamp: pos.timestamp,
      ageSeconds: Math.floor(age / 1000),
      isStale
    });
  });
  
  res.json({
    success: true,
    data: positions,
    meta: {
      total: positions.length,
      live: positions.filter(p => !p.isStale).length,
      timestamp: new Date().toISOString()
    }
  });
});

/**
 * GET /api/map/bounds
 * Get bounding box for all tracked vessels
 */
router.get('/bounds', optionalAuth, async (req, res) => {
  try {
    const positions = Array.from(vesselPositions.values());
    
    if (positions.length === 0) {
      // Default to Australian waters
      return res.json({
        success: true,
        data: {
          bounds: [
            [110, -45], // SW
            [155, -10]  // NE
          ],
          center: [133, -25],
          zoom: 4
        }
      });
    }

    const lats = positions.map(p => p.lat);
    const lons = positions.map(p => p.lon);

    const bounds = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)]
    ];

    const center = [
      (bounds[0][0] + bounds[1][0]) / 2,
      (bounds[0][1] + bounds[1][1]) / 2
    ];

    res.json({
      success: true,
      data: {
        bounds,
        center,
        zoom: 6
      }
    });
  } catch (err) {
    console.error('Error calculating bounds:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'CALC_ERROR',
        message: 'Failed to calculate bounds'
      }
    });
  }
});

/**
 * Update vessel position (called from AIS WebSocket handler in server/index.js)
 * @param {string} mmsi - Maritime Mobile Service Identity
 * @param {object} data - AIS position data
 */
function updateVesselPosition(mmsi, data) {
  // Merge with existing data to preserve static info
  const existing = vesselPositions.get(mmsi) || {};
  
  vesselPositions.set(mmsi, {
    ...existing,
    lat: data.Latitude ?? existing.lat,
    lon: data.Longitude ?? existing.lon,
    speed: data.Sog ?? existing.speed,
    course: data.Cog ?? existing.course,
    heading: data.TrueHeading ?? existing.heading,
    status: data.NavigationalStatus ?? existing.status,
    shipName: data.ShipName || existing.shipName,
    timestamp: new Date().toISOString(),
    rawTimestamp: data.Timestamp || null
  });
}

/**
 * Get cached position for a specific MMSI
 */
function getPosition(mmsi) {
  return vesselPositions.get(mmsi) || null;
}

/**
 * Get all cached positions as an object
 */
function getAllPositions() {
  const positions = {};
  vesselPositions.forEach((pos, mmsi) => {
    positions[mmsi] = pos;
  });
  return positions;
}

/**
 * Clean up stale positions (older than threshold)
 */
function cleanStalePositions() {
  const now = Date.now();
  let cleaned = 0;
  
  vesselPositions.forEach((pos, mmsi) => {
    const age = now - new Date(pos.timestamp).getTime();
    if (age > POSITION_MAX_AGE_MS * 4) { // Keep for 2 hours before cleanup
      vesselPositions.delete(mmsi);
      cleaned++;
    }
  });
  
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} stale AIS positions`);
  }
}

// Run cleanup every 10 minutes
setInterval(cleanStalePositions, 10 * 60 * 1000);

// Export for use in main server
router.updateVesselPosition = updateVesselPosition;
router.getPosition = getPosition;
router.getAllPositions = getAllPositions;
router.vesselPositions = vesselPositions;

module.exports = router;
