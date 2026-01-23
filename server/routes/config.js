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
  // Support both naming conventions for Clerk key
  const clerkKey = process.env.CLERK_PUBLISHABLE_KEY || 
                   process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || 
                   '';
  
  res.json({
    success: true,
    data: {
      clerk: {
        publishableKey: clerkKey
      },
      mapbox: {
        accessToken: process.env.MAPBOX_ACCESS_TOKEN || ''
      },
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

module.exports = router;
