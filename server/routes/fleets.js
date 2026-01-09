/**
 * MarineStream Workspace - Fleets Routes
 * Fleet management for grouping vessels
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { optionalAuth, requireAuth, requireAdmin } = require('../middleware/auth');

/**
 * GET /api/fleets
 * List all fleets with vessel counts and summary stats
 */
router.get('/', optionalAuth, async (req, res) => {
  try {
    const query = `
      SELECT 
        f.*,
        o.name as organization_name,
        COALESCE(fv.vessel_count, 0) as vessel_count,
        COALESCE(fv.vessel_ids, '[]'::jsonb) as vessel_ids
      FROM fleets f
      LEFT JOIN organizations o ON f.organization_id = o.id
      LEFT JOIN LATERAL (
        SELECT 
          fleet_id,
          COUNT(*) as vessel_count,
          jsonb_agg(vessel_id) as vessel_ids
        FROM fleet_vessels
        WHERE fleet_id = f.id
        GROUP BY fleet_id
      ) fv ON true
      WHERE f.is_active = true
      ORDER BY f.name
    `;

    const result = await db.query(query);

    res.json({
      success: true,
      data: result.rows,
      meta: {
        total: result.rows.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('Error fetching fleets:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch fleets'
      }
    });
  }
});

/**
 * GET /api/fleets/:id
 * Get single fleet with all vessel details
 */
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    // Get fleet details
    const fleetResult = await db.query(
      `SELECT f.*, o.name as organization_name
       FROM fleets f
       LEFT JOIN organizations o ON f.organization_id = o.id
       WHERE f.id = $1`,
      [req.params.id]
    );

    if (fleetResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Fleet not found'
        }
      });
    }

    // Get vessels in this fleet
    const vesselsResult = await db.query(
      `SELECT v.*, fv.added_at
       FROM vessels v
       INNER JOIN fleet_vessels fv ON v.id = fv.vessel_id
       WHERE fv.fleet_id = $1
       ORDER BY v.name`,
      [req.params.id]
    );

    const fleet = fleetResult.rows[0];
    fleet.vessels = vesselsResult.rows;
    fleet.vessel_count = vesselsResult.rows.length;

    res.json({
      success: true,
      data: fleet
    });
  } catch (err) {
    console.error('Error fetching fleet:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch fleet'
      }
    });
  }
});

/**
 * POST /api/fleets
 * Create a new fleet
 */
router.post('/', optionalAuth, async (req, res) => {
  try {
    const { name, description, color, icon, vessel_ids, organization_id, metadata } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Fleet name is required'
        }
      });
    }

    if (!vessel_ids || vessel_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one vessel must be selected for the fleet'
        }
      });
    }

    // Start transaction
    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Create fleet
      const fleetResult = await client.query(
        `INSERT INTO fleets (name, description, color, icon, organization_id, created_by, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          name, 
          description || null, 
          color || '#3b82f6', 
          icon || 'anchor',
          organization_id || null,
          req.user?.id || null,
          metadata || {}
        ]
      );

      const fleet = fleetResult.rows[0];

      // Add vessels to fleet
      for (const vesselId of vessel_ids) {
        await client.query(
          `INSERT INTO fleet_vessels (fleet_id, vessel_id, added_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (fleet_id, vessel_id) DO NOTHING`,
          [fleet.id, vesselId, req.user?.id || null]
        );
      }

      // Log the action
      await client.query(
        `INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata)
         VALUES ($1, 'fleet.created', 'fleet', $2, $3)`,
        [req.user?.id || null, fleet.id, { fleet_name: name, vessel_count: vessel_ids.length }]
      );

      await client.query('COMMIT');

      // Fetch the complete fleet with vessels
      const completeFleet = await db.query(
        `SELECT f.*, 
                array_agg(fv.vessel_id) as vessel_ids,
                COUNT(fv.vessel_id) as vessel_count
         FROM fleets f
         LEFT JOIN fleet_vessels fv ON f.id = fv.fleet_id
         WHERE f.id = $1
         GROUP BY f.id`,
        [fleet.id]
      );

      res.status(201).json({
        success: true,
        data: completeFleet.rows[0]
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error creating fleet:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'CREATE_ERROR',
        message: 'Failed to create fleet'
      }
    });
  }
});

/**
 * PATCH /api/fleets/:id
 * Update fleet details
 */
router.patch('/:id', optionalAuth, async (req, res) => {
  try {
    const { name, description, color, icon, metadata } = req.body;

    const result = await db.query(
      `UPDATE fleets SET
        name = COALESCE($2, name),
        description = COALESCE($3, description),
        color = COALESCE($4, color),
        icon = COALESCE($5, icon),
        metadata = COALESCE($6, metadata),
        updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id, name, description, color, icon, metadata]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Fleet not found'
        }
      });
    }

    // Log the action
    await db.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id)
       VALUES ($1, 'fleet.updated', 'fleet', $2)`,
      [req.user?.id || null, req.params.id]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating fleet:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update fleet'
      }
    });
  }
});

/**
 * DELETE /api/fleets/:id
 * Delete fleet (soft delete - sets is_active to false)
 */
router.delete('/:id', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      `UPDATE fleets SET is_active = false, updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Fleet not found'
        }
      });
    }

    // Log the action
    await db.query(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id)
       VALUES ($1, 'fleet.deleted', 'fleet', $2)`,
      [req.user?.id || null, req.params.id]
    );

    res.json({
      success: true,
      message: 'Fleet deleted successfully'
    });
  } catch (err) {
    console.error('Error deleting fleet:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'DELETE_ERROR',
        message: 'Failed to delete fleet'
      }
    });
  }
});

/**
 * POST /api/fleets/:id/vessels
 * Add vessels to fleet
 */
router.post('/:id/vessels', optionalAuth, async (req, res) => {
  try {
    const { vessel_ids } = req.body;

    if (!vessel_ids || vessel_ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'At least one vessel ID is required'
        }
      });
    }

    // Verify fleet exists
    const fleetCheck = await db.query('SELECT id FROM fleets WHERE id = $1 AND is_active = true', [req.params.id]);
    if (fleetCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Fleet not found'
        }
      });
    }

    // Add vessels
    let addedCount = 0;
    for (const vesselId of vessel_ids) {
      const result = await db.query(
        `INSERT INTO fleet_vessels (fleet_id, vessel_id, added_by)
         VALUES ($1, $2, $3)
         ON CONFLICT (fleet_id, vessel_id) DO NOTHING
         RETURNING id`,
        [req.params.id, vesselId, req.user?.id || null]
      );
      if (result.rows.length > 0) addedCount++;
    }

    res.json({
      success: true,
      message: `Added ${addedCount} vessel(s) to fleet`,
      data: { added_count: addedCount }
    });
  } catch (err) {
    console.error('Error adding vessels to fleet:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to add vessels to fleet'
      }
    });
  }
});

/**
 * DELETE /api/fleets/:id/vessels/:vesselId
 * Remove vessel from fleet
 */
router.delete('/:id/vessels/:vesselId', optionalAuth, async (req, res) => {
  try {
    const result = await db.query(
      `DELETE FROM fleet_vessels
       WHERE fleet_id = $1 AND vessel_id = $2
       RETURNING id`,
      [req.params.id, req.params.vesselId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Vessel not found in this fleet'
        }
      });
    }

    res.json({
      success: true,
      message: 'Vessel removed from fleet'
    });
  } catch (err) {
    console.error('Error removing vessel from fleet:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to remove vessel from fleet'
      }
    });
  }
});

/**
 * PUT /api/fleets/:id/vessels
 * Replace all vessels in a fleet (for reordering/updating)
 */
router.put('/:id/vessels', optionalAuth, async (req, res) => {
  try {
    const { vessel_ids } = req.body;

    if (!vessel_ids) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'vessel_ids array is required'
        }
      });
    }

    const client = await db.getClient();
    
    try {
      await client.query('BEGIN');

      // Remove all existing vessels from fleet
      await client.query('DELETE FROM fleet_vessels WHERE fleet_id = $1', [req.params.id]);

      // Add new vessels
      for (const vesselId of vessel_ids) {
        await client.query(
          `INSERT INTO fleet_vessels (fleet_id, vessel_id, added_by)
           VALUES ($1, $2, $3)`,
          [req.params.id, vesselId, req.user?.id || null]
        );
      }

      await client.query('COMMIT');

      res.json({
        success: true,
        message: `Updated fleet with ${vessel_ids.length} vessel(s)`,
        data: { vessel_count: vessel_ids.length }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Error updating fleet vessels:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update fleet vessels'
      }
    });
  }
});

module.exports = router;
