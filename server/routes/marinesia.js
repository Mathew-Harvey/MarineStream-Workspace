/**
 * MarineStream Workspace - Marinesia Routes
 * Vessel profiles, images, locations, and port data via Marinesia API
 */

const express = require('express');
const router = express.Router();
const marinesia = require('../services/marinesia');
const { optionalAuth } = require('../middleware/auth');

/**
 * GET /api/marinesia/status
 * Check if Marinesia API is configured and get cache stats
 */
router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      configured: marinesia.isConfigured(),
      cache: marinesia.getCacheStats(),
    },
  });
});

// ============================================================================
// VESSEL ENDPOINTS
// ============================================================================

/**
 * GET /api/marinesia/vessel/:mmsi/profile
 * Get detailed vessel profile by MMSI
 */
router.get('/vessel/:mmsi/profile', optionalAuth, async (req, res) => {
  try {
    const { mmsi } = req.params;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    const profile = await marinesia.getVesselProfile(mmsi);
    
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Vessel profile not found',
        },
      });
    }

    res.json({
      success: true,
      data: profile,
      meta: {
        source: 'marinesia',
        mmsi,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching vessel profile:', error);
    res.status(error.message === 'RATE_LIMITED' ? 429 : 500).json({
      success: false,
      error: {
        code: error.message === 'RATE_LIMITED' ? 'RATE_LIMITED' : 'FETCH_ERROR',
        message: error.message === 'RATE_LIMITED' 
          ? 'API rate limit exceeded. Please try again later.'
          : 'Failed to fetch vessel profile',
      },
    });
  }
});

/**
 * GET /api/marinesia/vessel/:mmsi/image
 * Get vessel image by MMSI
 */
router.get('/vessel/:mmsi/image', optionalAuth, async (req, res) => {
  try {
    const { mmsi } = req.params;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    const imageData = await marinesia.getVesselImage(mmsi);
    
    if (!imageData) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Vessel image not found',
        },
      });
    }

    res.json({
      success: true,
      data: imageData,
      meta: {
        source: 'marinesia',
        mmsi,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching vessel image:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch vessel image',
      },
    });
  }
});

/**
 * GET /api/marinesia/vessel/:mmsi/location
 * Get latest vessel location by MMSI
 */
router.get('/vessel/:mmsi/location', optionalAuth, async (req, res) => {
  try {
    const { mmsi } = req.params;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    const location = await marinesia.getVesselLatestLocation(mmsi);
    
    if (!location) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Vessel location not found',
        },
      });
    }

    res.json({
      success: true,
      data: location,
      meta: {
        source: 'marinesia',
        mmsi,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching vessel location:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch vessel location',
      },
    });
  }
});

/**
 * GET /api/marinesia/vessel/:mmsi/history
 * Get historical vessel locations by MMSI
 */
router.get('/vessel/:mmsi/history', optionalAuth, async (req, res) => {
  try {
    const { mmsi } = req.params;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    const history = await marinesia.getVesselHistory(mmsi);

    res.json({
      success: true,
      data: history,
      meta: {
        source: 'marinesia',
        mmsi,
        count: history.length,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching vessel history:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch vessel history',
      },
    });
  }
});

/**
 * GET /api/marinesia/vessel/:mmsi/full
 * Get complete vessel data (profile + image + location) in one call
 */
router.get('/vessel/:mmsi/full', optionalAuth, async (req, res) => {
  try {
    const { mmsi } = req.params;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    // Fetch all data in parallel
    const [profile, imageData, location] = await Promise.allSettled([
      marinesia.getVesselProfile(mmsi),
      marinesia.getVesselImage(mmsi),
      marinesia.getVesselLatestLocation(mmsi),
    ]);

    const data = {
      mmsi,
      profile: profile.status === 'fulfilled' ? profile.value : null,
      image: imageData.status === 'fulfilled' ? imageData.value?.image : null,
      location: location.status === 'fulfilled' ? location.value : null,
    };

    res.json({
      success: true,
      data,
      meta: {
        source: 'marinesia',
        mmsi,
        hasProfile: !!data.profile,
        hasImage: !!data.image,
        hasLocation: !!data.location,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching full vessel data:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch vessel data',
      },
    });
  }
});

// ============================================================================
// NEARBY / DISCOVERY ENDPOINTS
// ============================================================================

/**
 * GET /api/marinesia/vessels/nearby
 * Get vessels within a bounding box
 * Query params: lat_min, lat_max, long_min, long_max
 */
router.get('/vessels/nearby', optionalAuth, async (req, res) => {
  try {
    const { lat_min, lat_max, long_min, long_max } = req.query;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    // Validate parameters
    if (!lat_min || !lat_max || !long_min || !long_max) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing bounding box parameters. Required: lat_min, lat_max, long_min, long_max',
        },
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
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching nearby vessels:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch nearby vessels',
      },
    });
  }
});

/**
 * GET /api/marinesia/vessels/search
 * Search vessel profiles
 * Query params: page, limit, sort, order, name, country, ship_type
 */
router.get('/vessels/search', optionalAuth, async (req, res) => {
  try {
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    const { page, limit, sort, order, name, country, ship_type, imo } = req.query;
    
    // Build filters string
    const filterParts = [];
    if (name) filterParts.push(`name:${name}`);
    if (country) filterParts.push(`country:${country}`);
    if (ship_type) filterParts.push(`ship_type:${ship_type}`);
    if (imo) filterParts.push(`imo:${imo}`);
    
    const filters = filterParts.length > 0 ? filterParts.join(',') : undefined;

    const result = await marinesia.searchVesselProfiles({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      sort: sort || 'name',
      order: order || 'asc',
      filters,
    });

    res.json({
      success: true,
      data: result.vessels,
      meta: {
        source: 'marinesia',
        ...result.meta,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error searching vessels:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to search vessels',
      },
    });
  }
});

// ============================================================================
// PORT ENDPOINTS
// ============================================================================

/**
 * GET /api/marinesia/port/:id/profile
 * Get port profile by ID
 */
router.get('/port/:id/profile', optionalAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    const port = await marinesia.getPortProfile(id);
    
    if (!port) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Port not found',
        },
      });
    }

    res.json({
      success: true,
      data: port,
      meta: {
        source: 'marinesia',
        port_id: id,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching port profile:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch port profile',
      },
    });
  }
});

/**
 * GET /api/marinesia/ports/nearby
 * Get ports within a bounding box
 * Query params: lat_min, lat_max, long_min, long_max
 */
router.get('/ports/nearby', optionalAuth, async (req, res) => {
  try {
    const { lat_min, lat_max, long_min, long_max } = req.query;
    
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    // Validate parameters
    if (!lat_min || !lat_max || !long_min || !long_max) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PARAMS',
          message: 'Missing bounding box parameters. Required: lat_min, lat_max, long_min, long_max',
        },
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
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching nearby ports:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch nearby ports',
      },
    });
  }
});

/**
 * GET /api/marinesia/ports/search
 * Search ports
 * Query params: page, limit, sort, order, name, country, un_locode
 */
router.get('/ports/search', optionalAuth, async (req, res) => {
  try {
    if (!marinesia.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: {
          code: 'NOT_CONFIGURED',
          message: 'Marinesia API not configured',
        },
      });
    }

    const { page, limit, sort, order, name, country, un_locode } = req.query;
    
    // Build filters string
    const filterParts = [];
    if (name) filterParts.push(`name:${name}`);
    if (country) filterParts.push(`country:${country}`);
    if (un_locode) filterParts.push(`un_locode:${un_locode}`);
    
    const filters = filterParts.length > 0 ? filterParts.join(',') : undefined;

    const result = await marinesia.searchPorts({
      page: page ? parseInt(page) : 1,
      limit: limit ? parseInt(limit) : 10,
      sort: sort || 'name',
      order: order || 'asc',
      filters,
    });

    res.json({
      success: true,
      data: result.ports,
      meta: {
        source: 'marinesia',
        ...result.meta,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Error searching ports:', error);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to search ports',
      },
    });
  }
});

module.exports = router;
