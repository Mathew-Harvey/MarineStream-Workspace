/**
 * MarineStream Workspace - Applications Routes
 * App registry and access control
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth } = require('../middleware/auth');

/**
 * GET /api/apps
 * List accessible applications for current user
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    let query;
    let params = [];

    if (req.user && req.user.role === 'admin') {
      // Admins see all apps
      query = `
        SELECT * FROM applications 
        WHERE is_active = true 
        ORDER BY sort_order, name
      `;
    } else if (req.user && req.user.organization_id) {
      // Organization users see public apps + apps granted to their org
      query = `
        SELECT DISTINCT a.* FROM applications a
        LEFT JOIN app_access aa ON a.id = aa.application_id
        WHERE a.is_active = true
          AND (
            a.visibility = 'public'
            OR aa.organization_id = $1
            OR (a.visibility = 'internal' AND EXISTS (
              SELECT 1 FROM organizations o 
              WHERE o.id = $1 AND o.is_internal = true
            ))
          )
        ORDER BY a.sort_order, a.name
      `;
      params = [req.user.organization_id];
    } else {
      // Unauthenticated or users without org see only public apps
      query = `
        SELECT * FROM applications 
        WHERE is_active = true AND visibility = 'public'
        ORDER BY sort_order, name
      `;
    }

    const result = await db.query(query, params);

    // Group by category
    const grouped = result.rows.reduce((acc, app) => {
      const category = app.category || 'Other';
      if (!acc[category]) acc[category] = [];
      acc[category].push(app);
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        apps: result.rows,
        grouped
      },
      meta: {
        total: result.rows.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error fetching apps:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch applications'
      }
    });
  }
});

/**
 * GET /api/apps/:slug
 * Get single application details
 */
router.get('/:slug', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT * FROM applications WHERE slug = $1 AND is_active = true',
      [req.params.slug]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Application not found'
        }
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error fetching app:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch application'
      }
    });
  }
});

module.exports = router;
