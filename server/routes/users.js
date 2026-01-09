/**
 * MarineStream Workspace - Users Routes
 * User profile and preferences
 */

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireAuth } = require('../middleware/auth');

/**
 * GET /api/users/me
 * Get current user profile
 */
router.get('/me', requireAuth, async (req, res) => {
  try {
    // Get user with preferences
    const result = await db.query(
      `SELECT 
        u.*,
        o.name as organization_name,
        o.slug as organization_slug,
        o.is_internal,
        up.default_map_zoom,
        up.favorite_apps,
        up.theme,
        up.preferences
       FROM users u
       LEFT JOIN organizations o ON u.organization_id = o.id
       LEFT JOIN user_preferences up ON u.id = up.user_id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'User not found'
        }
      });
    }

    const user = result.rows[0];

    // Don't return sensitive fields
    delete user.clerk_id;

    res.json({
      success: true,
      data: user
    });
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'FETCH_ERROR',
        message: 'Failed to fetch user profile'
      }
    });
  }
});

/**
 * PATCH /api/users/me/preferences
 * Update user preferences
 */
router.patch('/me/preferences', requireAuth, async (req, res) => {
  try {
    const { default_map_zoom, favorite_apps, theme, preferences } = req.body;

    // Upsert preferences
    const result = await db.query(
      `INSERT INTO user_preferences (user_id, default_map_zoom, favorite_apps, theme, preferences)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id) DO UPDATE SET
         default_map_zoom = COALESCE($2, user_preferences.default_map_zoom),
         favorite_apps = COALESCE($3, user_preferences.favorite_apps),
         theme = COALESCE($4, user_preferences.theme),
         preferences = COALESCE($5, user_preferences.preferences),
         updated_at = NOW()
       RETURNING *`,
      [req.user.id, default_map_zoom, favorite_apps, theme, preferences]
    );

    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (err) {
    console.error('Error updating preferences:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to update preferences'
      }
    });
  }
});

/**
 * POST /api/users/me/favorites/:appId
 * Add app to favorites
 */
router.post('/me/favorites/:appId', requireAuth, async (req, res) => {
  try {
    const appId = req.params.appId;

    await db.query(
      `INSERT INTO user_preferences (user_id, favorite_apps)
       VALUES ($1, ARRAY[$2]::uuid[])
       ON CONFLICT (user_id) DO UPDATE SET
         favorite_apps = array_append(
           array_remove(user_preferences.favorite_apps, $2::uuid),
           $2::uuid
         ),
         updated_at = NOW()`,
      [req.user.id, appId]
    );

    res.json({
      success: true,
      data: { added: appId }
    });
  } catch (err) {
    console.error('Error adding favorite:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to add favorite'
      }
    });
  }
});

/**
 * DELETE /api/users/me/favorites/:appId
 * Remove app from favorites
 */
router.delete('/me/favorites/:appId', requireAuth, async (req, res) => {
  try {
    const appId = req.params.appId;

    await db.query(
      `UPDATE user_preferences
       SET favorite_apps = array_remove(favorite_apps, $2::uuid),
           updated_at = NOW()
       WHERE user_id = $1`,
      [req.user.id, appId]
    );

    res.json({
      success: true,
      data: { removed: appId }
    });
  } catch (err) {
    console.error('Error removing favorite:', err);
    res.status(500).json({
      success: false,
      error: {
        code: 'UPDATE_ERROR',
        message: 'Failed to remove favorite'
      }
    });
  }
});

module.exports = router;
