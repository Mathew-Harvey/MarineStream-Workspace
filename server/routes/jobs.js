/**
 * MarineStream Workspace - Jobs Routes
 * Handles job drafts and local job storage with user metadata
 */

const express = require('express');
const router = express.Router();
const db = require('../db');

/**
 * POST /api/jobs/draft - Create a new job draft
 */
router.post('/draft', async (req, res) => {
  try {
    const { data } = req.body;
    
    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Missing draft data'
      });
    }
    
    // Extract user info from metadata
    const userId = data.metadata?.userId || null;
    const userEmail = data.metadata?.userEmail || null;
    
    // Insert new draft
    const result = await db.query(`
      INSERT INTO job_drafts (user_id, user_email, data, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING id, created_at
    `, [userId, userEmail, JSON.stringify(data)]);
    
    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        createdAt: result.rows[0].created_at
      }
    });
  } catch (error) {
    console.error('Create draft error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/jobs/draft - Update an existing job draft
 */
router.put('/draft', async (req, res) => {
  try {
    const { id, data } = req.body;
    
    if (!id || !data) {
      return res.status(400).json({
        success: false,
        error: 'Missing draft ID or data'
      });
    }
    
    // Update existing draft
    const result = await db.query(`
      UPDATE job_drafts 
      SET data = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING id, updated_at
    `, [JSON.stringify(data), id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Draft not found'
      });
    }
    
    res.json({
      success: true,
      data: {
        id: result.rows[0].id,
        updatedAt: result.rows[0].updated_at
      }
    });
  } catch (error) {
    console.error('Update draft error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/draft/current - Get the current user's most recent draft
 */
router.get('/draft/current', async (req, res) => {
  try {
    // Get most recent draft (optionally filter by user if auth available)
    const result = await db.query(`
      SELECT id, user_id, user_email, data, created_at, updated_at
      FROM job_drafts
      WHERE status = 'draft'
      ORDER BY updated_at DESC
      LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      return res.json({
        success: true,
        data: null
      });
    }
    
    const draft = result.rows[0];
    res.json({
      success: true,
      data: {
        id: draft.id,
        userId: draft.user_id,
        userEmail: draft.user_email,
        data: draft.data,
        createdAt: draft.created_at,
        updatedAt: draft.updated_at
      }
    });
  } catch (error) {
    console.error('Get draft error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/draft/:id - Get a specific draft by ID
 */
router.get('/draft/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT id, user_id, user_email, data, created_at, updated_at
      FROM job_drafts
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Draft not found'
      });
    }
    
    const draft = result.rows[0];
    res.json({
      success: true,
      data: {
        id: draft.id,
        userId: draft.user_id,
        userEmail: draft.user_email,
        data: draft.data,
        createdAt: draft.created_at,
        updatedAt: draft.updated_at
      }
    });
  } catch (error) {
    console.error('Get draft error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/jobs/draft/:id - Delete a draft
 */
router.delete('/draft/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      DELETE FROM job_drafts
      WHERE id = $1
      RETURNING id
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Draft not found'
      });
    }
    
    res.json({
      success: true,
      message: 'Draft deleted'
    });
  } catch (error) {
    console.error('Delete draft error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/jobs - Create a finalized job (from draft)
 * Saves locally and optionally syncs to Rise-X
 */
router.post('/', async (req, res) => {
  try {
    const { draftId, data, syncToRiseX } = req.body;
    
    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Missing job data'
      });
    }
    
    const userId = data.metadata?.userId || null;
    const userEmail = data.metadata?.userEmail || null;
    const vesselName = data.data?.vessel?.name || data.data?.vessel?.displayName || 'Unknown';
    const jobType = data.data?.jobType || 'Job';
    
    // Insert the job
    const result = await db.query(`
      INSERT INTO jobs (
        user_id, user_email, vessel_name, job_type, 
        data, risex_synced, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
      RETURNING id, created_at
    `, [userId, userEmail, vesselName, jobType, JSON.stringify(data), false]);
    
    const jobId = result.rows[0].id;
    
    // If there was a draft, mark it as submitted
    if (draftId) {
      await db.query(`
        UPDATE job_drafts 
        SET status = 'submitted', job_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [jobId, draftId]);
    }
    
    // Attempt Rise-X sync if requested and PAT available
    let riseXSyncResult = null;
    if (syncToRiseX && data.metadata?.riseXConnected) {
      try {
        // This would call the Rise-X API to create the job
        // For now, we'll mark it as pending sync
        riseXSyncResult = { status: 'pending', message: 'Sync queued' };
        
        // Update job with sync status
        await db.query(`
          UPDATE jobs SET risex_sync_status = 'pending', updated_at = NOW()
          WHERE id = $1
        `, [jobId]);
      } catch (syncError) {
        console.error('Rise-X sync failed:', syncError);
        riseXSyncResult = { status: 'failed', error: syncError.message };
      }
    }
    
    res.json({
      success: true,
      data: {
        id: jobId,
        createdAt: result.rows[0].created_at,
        riseXSync: riseXSyncResult
      }
    });
  } catch (error) {
    console.error('Create job error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs - List all jobs
 */
router.get('/', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;
    
    const result = await db.query(`
      SELECT id, user_id, user_email, vessel_name, job_type, 
             risex_synced, risex_sync_status, created_at, updated_at
      FROM jobs
      ORDER BY created_at DESC
      LIMIT $1 OFFSET $2
    `, [limit, offset]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('List jobs error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/jobs/:id - Get a specific job
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.query(`
      SELECT id, user_id, user_email, vessel_name, job_type, 
             data, risex_synced, risex_sync_status, risex_job_id,
             created_at, updated_at
      FROM jobs
      WHERE id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Job not found'
      });
    }
    
    res.json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Get job error:', error);
    res.json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
