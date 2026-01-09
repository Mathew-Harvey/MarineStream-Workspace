/**
 * MarineStream Workspace - Vessels Routes
 * Vessel registry and tracking
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth, requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/vessels
 * List vessels (filtered by user's organization)
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    let query;
    let params = [];

    if (req.user && req.user.role === 'admin') {
      // Admins see all vessels
      query = `
        SELECT v.*, o.name as organization_name
        FROM vessels v
        LEFT JOIN organizations o ON v.organization_id = o.id
        ORDER BY v.name
      `;
    } else if (req.user && req.user.organization_id) {
      // Users see their organization's vessels
      query = `
        SELECT v.*, o.name as organization_name
        FROM vessels v
        LEFT JOIN organizations o ON v.organization_id = o.id
        WHERE v.organization_id = $1
        ORDER BY v.name
      `;
      params = [req.user.organization_id];
    } else {
      // Unauthenticated users see demo vessels (public facing)
      query = `
        SELECT v.id, v.name, v.vessel_type, v.flag, v.is_tracked
        FROM vessels v
        WHERE v.is_tracked = true
        ORDER BY v.name
        LIMIT 10
      `;
    }

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows,
      meta: {
        total: result.rows.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error fetching vessels:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch vessels'
      }
    });
  }
});

/**
 * GET /api/vessels/:id
 * Get single vessel details
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT v.*, o.name as organization_name
       FROM vessels v
       LEFT JOIN organizations o ON v.organization_id = o.id
       WHERE v.id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Vessel not found'
        }
      });
    }

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error fetching vessel:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch vessel'
      }
    });
  }
});

/**
 * POST /api/vessels
 * Add new vessel (admin only)
 */
router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { mmsi, imo, name, vessel_type, flag, organization_id, is_tracked, metadata } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Vessel name is required'
        }
      });
    }

    const result = await db.query(
      `INSERT INTO vessels (mmsi, imo, name, vessel_type, flag, organization_id, is_tracked, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [mmsi, imo, name, vessel_type, flag, organization_id, is_tracked ?? true, metadata ?? {}]
    );

    // Log the action
    await db.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata)
       VALUES ($1, 'vessel.created', 'vessel', $2, $3)`,
      [req.user.id, result.rows[0].id, { vessel_name: name }]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error creating vessel:', err);
    
    if (err.code === '23505') { // Unique violation
      return res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE',
          message: 'A vessel with this MMSI already exists'
        }
      });
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create vessel'
      }
    });
  }
});

/**
 * PATCH /api/vessels/:id
 * Update vessel (admin only)
 */
router.patch('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { mmsi, imo, name, vessel_type, flag, organization_id, is_tracked, metadata } = req.body;

    const result = await db.query(
      `UPDATE vessels SET
        mmsi = COALESCE($2, mmsi),
        imo = COALESCE($3, imo),
        name = COALESCE($4, name),
        vessel_type = COALESCE($5, vessel_type),
        flag = COALESCE($6, flag),
        organization_id = COALESCE($7, organization_id),
        is_tracked = COALESCE($8, is_tracked),
        metadata = COALESCE($9, metadata),
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, mmsi, imo, name, vessel_type, flag, organization_id, is_tracked, metadata]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Vessel not found'
        }
      });
    }

    // Log the action
    await db.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id)
       VALUES ($1, 'vessel.updated', 'vessel', $2)`,
      [req.user.id, req.params.id]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating vessel:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update vessel'
      }
    });
  }
});

module.exports = router;
