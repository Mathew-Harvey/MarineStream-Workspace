/**
 * Sync API Routes
 * 
 * Provides endpoints for:
 * - Triggering Rise-X data sync
 * - Monitoring sync status
 * - Managing Rise-X connections
 * - Querying synced data
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const tokenManager = require('../services/tokenManager');
const syncService = require('../services/riseXSync');

// ============================================
// Rise-X Connection Management
// ============================================

/**
 * GET /api/sync/connection
 * Get current user's Rise-X connection status
 */
router.get('/connection', requireAuth, async (req, res) => {
  try {
    const connection = await tokenManager.getConnection(req.user.id);
    
    if (!connection) {
      return res.json({
        success: true,
        data: {
          connected: false,
          message: 'No Rise-X account connected'
        }
      });
    }
    
    res.json({
      success: true,
      data: {
        connected: connection.is_active,
        riseXEmail: connection.rise_x_email,
        connectedAt: connection.connected_at,
        lastSyncAt: connection.last_sync_at,
        scopes: connection.scopes,
        tokenExpiresAt: connection.token_expires_at
      }
    });
  } catch (error) {
    console.error('Connection status error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * POST /api/sync/connection
 * Store Rise-X OAuth tokens after successful OAuth callback
 * Called from frontend after OAuth flow completes
 */
router.post('/connection', requireAuth, async (req, res) => {
  try {
    const { tokenData, userInfo } = req.body;
    
    if (!tokenData || !tokenData.access_token) {
      return res.status(400).json({
        success: false,
        error: { message: 'Token data is required' }
      });
    }
    
    // Store the connection
    await tokenManager.storeConnection(req.user.id, tokenData, userInfo);
    
    // Trigger initial sync in background (don't await)
    syncService.fullSync(req.user.id).catch(err => {
      console.error('Initial sync failed:', err);
    });
    
    res.json({
      success: true,
      data: {
        connected: true,
        message: 'Rise-X account connected successfully',
        syncStarted: true
      }
    });
  } catch (error) {
    console.error('Connection store error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * DELETE /api/sync/connection
 * Disconnect Rise-X account
 */
router.delete('/connection', requireAuth, async (req, res) => {
  try {
    await tokenManager.disconnect(req.user.id);
    
    res.json({
      success: true,
      data: {
        connected: false,
        message: 'Rise-X account disconnected'
      }
    });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// ============================================
// Sync Triggers
// ============================================

/**
 * POST /api/sync/trigger
 * Trigger a sync for the current user
 */
router.post('/trigger', requireAuth, async (req, res) => {
  try {
    const { type = 'incremental', entities = ['work_items'] } = req.body;
    
    // Check if user has Rise-X connection
    const hasConnection = await tokenManager.hasActiveConnection(req.user.id);
    if (!hasConnection) {
      return res.status(400).json({
        success: false,
        error: { 
          code: 'NO_CONNECTION',
          message: 'No active Rise-X connection. Please connect your account first.'
        }
      });
    }
    
    let result;
    
    if (type === 'full') {
      // Full sync - all entities
      result = await syncService.fullSync(req.user.id);
    } else {
      // Incremental sync - specific entities
      result = {};
      
      if (entities.includes('work_items')) {
        result.workItems = await syncService.syncWorkItems(req.user.id);
      }
      if (entities.includes('assets')) {
        result.assets = await syncService.syncAssets(req.user.id);
      }
      if (entities.includes('flows')) {
        result.flows = await syncService.syncFlows(req.user.id);
      }
    }
    
    res.json({
      success: true,
      data: {
        type,
        result,
        completedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Sync trigger error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * POST /api/sync/trigger/async
 * Trigger a sync in the background (returns immediately)
 */
router.post('/trigger/async', requireAuth, async (req, res) => {
  try {
    const { type = 'incremental' } = req.body;
    
    const hasConnection = await tokenManager.hasActiveConnection(req.user.id);
    if (!hasConnection) {
      return res.status(400).json({
        success: false,
        error: { 
          code: 'NO_CONNECTION',
          message: 'No active Rise-X connection'
        }
      });
    }
    
    // Start sync in background
    if (type === 'full') {
      syncService.fullSync(req.user.id).catch(err => {
        console.error('Background full sync failed:', err);
      });
    } else {
      syncService.incrementalSync(req.user.id).catch(err => {
        console.error('Background incremental sync failed:', err);
      });
    }
    
    res.json({
      success: true,
      data: {
        message: 'Sync started in background',
        type,
        startedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Async sync trigger error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// ============================================
// Sync Status
// ============================================

/**
 * GET /api/sync/status
 * Get sync status for all entity types
 */
router.get('/status', requireAuth, async (req, res) => {
  try {
    const status = await syncService.getSyncStatus(req.user.id);
    const connection = await tokenManager.getConnection(req.user.id);
    
    res.json({
      success: true,
      data: {
        connected: connection?.is_active || false,
        lastSyncAt: connection?.last_sync_at || null,
        entities: status
      }
    });
  } catch (error) {
    console.error('Sync status error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// ============================================
// Synced Data Queries
// ============================================

/**
 * GET /api/sync/work-items
 * Get synced work items from local database
 */
router.get('/work-items', requireAuth, async (req, res) => {
  try {
    const { limit = 100, offset = 0, status, vesselId, search } = req.query;
    
    const workItems = await syncService.getWorkItems(req.user.id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      status,
      vesselId,
      search
    });
    
    res.json({
      success: true,
      data: workItems,
      meta: {
        count: workItems.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Work items query error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * GET /api/sync/assets
 * Get synced assets from local database
 */
router.get('/assets', requireAuth, async (req, res) => {
  try {
    const { limit = 100, offset = 0, registryId, search } = req.query;
    
    const assets = await syncService.getAssets(req.user.id, {
      limit: parseInt(limit),
      offset: parseInt(offset),
      registryId,
      search
    });
    
    res.json({
      success: true,
      data: assets,
      meta: {
        count: assets.length,
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (error) {
    console.error('Assets query error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * GET /api/sync/vessels/:vesselId/assessments
 * Get biofouling assessments for a vessel
 */
router.get('/vessels/:vesselId/assessments', requireAuth, async (req, res) => {
  try {
    const { vesselId } = req.params;
    const { limit = 50, component } = req.query;
    
    const assessments = await syncService.getBiofoulingAssessments(vesselId, {
      limit: parseInt(limit),
      component
    });
    
    res.json({
      success: true,
      data: assessments,
      meta: {
        vesselId,
        count: assessments.length
      }
    });
  } catch (error) {
    console.error('Assessments query error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * GET /api/sync/logs
 * Get recent sync logs
 */
router.get('/logs', requireAuth, async (req, res) => {
  try {
    const { limit = 20 } = req.query;
    const db = require('../db');
    
    const result = await db.query(`
      SELECT * FROM sync_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `, [req.user.id, parseInt(limit)]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Sync logs error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

module.exports = router;
