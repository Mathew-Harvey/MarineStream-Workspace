/**
 * MarineStream Workspace - Map Routes
 * Vessel positions and map data
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');

// In-memory cache for vessel positions (updated via WebSocket)
const vesselPositions = new Map();

/**
 * GET /api/map/vessels
 * Get current vessel positions (from cache)
 */
router.get('/vessels', optionalAuth, async (req, res) => {
  try {
    // Get vessels from database
    const result = await db.query(
      `SELECT id, mmsi, name, vessel_type, flag, organization_id
       FROM vessels
       WHERE is_tracked = true AND mmsi IS NOT NULL`
    );

    // Merge with cached positions
    const vessels = result.rows.map(vessel => {
      const position = vesselPositions.get(vessel.mmsi);
      return {
        ...vessel,
        position: position || null,
        lastUpdate: position?.timestamp || null
      };
    });

    res.json({
      success: true,
      data: vessels,
      meta: {
        total: vessels.length,
        withPosition: vessels.filter(v => v.position).length,
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
 * Update vessel position (called from AIS WebSocket handler)
 */
function updateVesselPosition(mmsi, data) {
  vesselPositions.set(mmsi, {
    lat: data.Latitude,
    lon: data.Longitude,
    speed: data.Sog,
    course: data.Cog,
    heading: data.TrueHeading,
    status: data.NavigationalStatus,
    timestamp: new Date().toISOString()
  });
}

// Export for use in main server
router.updateVesselPosition = updateVesselPosition;
router.vesselPositions = vesselPositions;

module.exports = router;
