/**
 * MarineStream Workspace - Map Routes
 * Vessel positions and map data (with AISStream.io + Marinesia integration)
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');
const marinesia = require('../services/marinesia');

// In-memory cache for vessel positions (updated via AISStream WebSocket)
// Key: MMSI string, Value: position data with timestamp
const vesselPositions = new Map();

// Position age threshold (positions older than this are considered stale)
const POSITION_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

/**
 * GET /api/map/vessels
 * Get current vessel positions (from AIS cache, with Marinesia fallback)
 */
router.get('/vessels', optionalAuth, async (req, res) => {
  try {
    const { enrich } = req.query; // Optional: enrich=true to get Marinesia data
    
    // Get vessels from database
    const result = await db.query(
      `SELECT id, mmsi, name, vessel_type, flag, organization_id
       FROM vessels
       WHERE is_tracked = true AND mmsi IS NOT NULL`
    );

    const now = Date.now();
    
    // Merge with cached AIS positions
    let vessels = await Promise.all(result.rows.map(async vessel => {
      const position = vesselPositions.get(vessel.mmsi);
      const isStale = position ? (now - new Date(position.timestamp).getTime() > POSITION_MAX_AGE_MS) : true;
      
      // If no AIS position or stale, try Marinesia as fallback
      let fallbackPosition = null;
      let positionSource = 'aisstream';
      
      if (!position && marinesia.isConfigured()) {
        fallbackPosition = await marinesia.getFallbackPosition(vessel.mmsi);
        if (fallbackPosition) {
          positionSource = 'marinesia';
        }
      }
      
      const activePosition = position || fallbackPosition;
      
      return {
        ...vessel,
        position: activePosition ? {
          lat: activePosition.lat,
          lng: activePosition.lng || activePosition.lon,
          speed: activePosition.speed,
          course: activePosition.course,
          heading: activePosition.heading,
          status: activePosition.status,
          shipName: activePosition.shipName,
          isStale: position ? isStale : false
        } : null,
        lastUpdate: activePosition?.timestamp || null,
        hasLivePosition: (!!position && !isStale) || !!fallbackPosition,
        positionSource: activePosition ? positionSource : null
      };
    }));

    // Optionally enrich with Marinesia profile data
    if (enrich === 'true' && marinesia.isConfigured()) {
      vessels = await marinesia.enrichVessels(vessels);
    }

    res.json({
      success: true,
      data: vessels,
      meta: {
        total: vessels.length,
        withPosition: vessels.filter(v => v.position).length,
        withLivePosition: vessels.filter(v => v.hasLivePosition).length,
        cacheSize: vesselPositions.size,
        marinesiaEnabled: marinesia.isConfigured(),
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
 * GET /api/map/discover
 * Discover vessels in a region using Marinesia (for exploration)
 * Query params: lat_min, lat_max, long_min, long_max
 */
router.get('/discover', optionalAuth, async (req, res) => {
  try {
    const { lat_min, lat_max, long_min, long_max } = req.query;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured for vessel discovery'
        }
      });
    }

    if (!lat_min || !lat_max || !long_min || !long_max) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Bounding box required: lat_min, lat_max, long_min, long_max'
        }
      });
    }

    const vessels = await marinesia.getNearbyVessels(
      parseFloat(lat_min),
      parseFloat(lat_max),
      parseFloat(long_min),
      parseFloat(long_max)
    );

    res.json({
      success: true,
      data: vessels,
      meta: {
        source: 'marinesia',
        count: vessels.length,
        bounds: { lat_min, lat_max, long_min, long_max },
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error discovering vessels:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to discover vessels'
      }
    });
  }
});

/**
 * GET /api/map/ports
 * Get nearby ports for the current map view
 * Query params: lat_min, lat_max, long_min, long_max
 */
router.get('/ports', optionalAuth, async (req, res) => {
  try {
    const { lat_min, lat_max, long_min, long_max } = req.query;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured for port data'
        }
      });
    }

    if (!lat_min || !lat_max || !long_min || !long_max) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Bounding box required: lat_min, lat_max, long_min, long_max'
        }
      });
    }

    const ports = await marinesia.getNearbyPorts(
      parseFloat(lat_min),
      parseFloat(lat_max),
      parseFloat(long_min),
      parseFloat(long_max)
    );

    res.json({
      success: true,
      data: ports,
      meta: {
        source: 'marinesia',
        count: ports.length,
        bounds: { lat_min, lat_max, long_min, long_max },
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error fetching ports:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch ports'
      }
    });
  }
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
 * Also persists to database for last known position retrieval
 * @param {string} mmsi - Maritime Mobile Service Identity
 * @param {object} data - AIS position data
 */
function updateVesselPosition(mmsi, data) {
  // Merge with existing data to preserve static info
  const existing = vesselPositions.get(mmsi) || {};
  
  const newPosition = {
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
  };
  
  vesselPositions.set(mmsi, newPosition);
  
  // Persist to database (async, non-blocking)
  if (newPosition.lat && newPosition.lon) {
    savePositionToDb(mmsi, newPosition).catch(err => {
      // Log but don't fail - DB persistence is best-effort
      if (!err.message.includes('ECONNRESET')) {
        console.error(`Failed to persist position for ${mmsi}:`, err.message);
      }
    });
  }
}

/**
 * Save position to database for persistence
 */
async function savePositionToDb(mmsi, position) {
  await db.query(`
    INSERT INTO vessel_positions (mmsi, lat, lng, speed, course, heading, ship_name, source, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, 'ais', NOW())
    ON CONFLICT (mmsi) DO UPDATE SET
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      speed = EXCLUDED.speed,
      course = EXCLUDED.course,
      heading = EXCLUDED.heading,
      ship_name = COALESCE(EXCLUDED.ship_name, vessel_positions.ship_name),
      source = 'ais',
      updated_at = NOW()
  `, [
    mmsi,
    position.lat,
    position.lon,
    position.speed || null,
    position.course || null,
    position.heading || null,
    position.shipName || null
  ]);
}

/**
 * Get last known position from database for a specific MMSI
 */
async function getLastKnownPosition(mmsi) {
  try {
    const result = await db.query(
      'SELECT * FROM vessel_positions WHERE mmsi = $1',
      [mmsi]
    );
    if (result.rows.length > 0) {
      const row = result.rows[0];
      return {
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        speed: row.speed ? parseFloat(row.speed) : null,
        course: row.course ? parseFloat(row.course) : null,
        heading: row.heading,
        shipName: row.ship_name,
        source: 'last_known',
        timestamp: row.updated_at,
        isStale: true // Mark as potentially outdated
      };
    }
  } catch (err) {
    console.error(`Error fetching last known position for ${mmsi}:`, err.message);
  }
  return null;
}

/**
 * Get all last known positions from database
 */
async function getAllLastKnownPositions() {
  try {
    const result = await db.query(
      'SELECT * FROM vessel_positions ORDER BY updated_at DESC'
    );
    const positions = {};
    for (const row of result.rows) {
      positions[row.mmsi] = {
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        speed: row.speed ? parseFloat(row.speed) : null,
        course: row.course ? parseFloat(row.course) : null,
        heading: row.heading,
        shipName: row.ship_name,
        source: 'last_known',
        timestamp: row.updated_at,
        isStale: true
      };
    }
    return positions;
  } catch (err) {
    console.error('Error fetching all last known positions:', err.message);
    return {};
  }
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
router.getLastKnownPosition = getLastKnownPosition;
router.getAllLastKnownPositions = getAllLastKnownPositions;
router.vesselPositions = vesselPositions;

module.exports = router;
