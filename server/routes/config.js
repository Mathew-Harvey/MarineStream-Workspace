/**
 * MarineStream Workspace - Public Configuration Route
 * Exposes safe-to-share config values to the frontend
 */

const express = require('express');
const router = express.Router();

/**
 * GET /api/config
 * Returns public configuration for the frontend
 */
router.get('/', (req, res) => {
  res.json({
    success: true,
    data: {
      clerk: {
        publishableKey: process.env.CLERK_PUBLISHABLE_KEY || ''
      },
      mapbox: {
        accessToken: process.env.MAPBOX_ACCESS_TOKEN || ''
      },
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

module.exports = router;
