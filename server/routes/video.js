/**
 * MarineStream Workspace - Video Calling Routes
 * Agora token generation and call management
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');
const { sendCallInvitation } = require('../lib/email-service');

// Agora token generation
let RtcTokenBuilder, RtcRole;
try {
  const agoraToken = require('agora-token');
  RtcTokenBuilder = agoraToken.RtcTokenBuilder;
  RtcRole = agoraToken.RtcRole;
} catch (e) {
  console.warn('agora-token not installed - run: npm install agora-token');
}

const AGORA_APP_ID = process.env.AGORA_APP_ID;
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE;

/**
 * Generate a unique channel name
 */
function generateChannelName() {
  return `ms-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Generate Agora RTC token
 */
function generateAgoraToken(channelName, uid, role = 'publisher', expirationSeconds = 3600) {
  if (!AGORA_APP_ID || !AGORA_APP_CERTIFICATE) {
    throw new Error('Agora credentials not configured');
  }

  if (!RtcTokenBuilder) {
    throw new Error('agora-token package not installed');
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const privilegeExpireTime = currentTime + expirationSeconds;

  const agoraRole = role === 'audience' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;

  // Use uid as string for flexibility
  const token = RtcTokenBuilder.buildTokenWithUid(
    AGORA_APP_ID,
    AGORA_APP_CERTIFICATE,
    channelName,
    uid,
    agoraRole,
    privilegeExpireTime
  );

  return token;
}

/**
 * GET /api/video/config
 * Get Agora configuration (app ID, no secret)
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    data: {
      appId: AGORA_APP_ID || '',
      configured: !!(AGORA_APP_ID && AGORA_APP_CERTIFICATE)
    }
  });
});

/**
 * POST /api/video/token
 * Generate a token for joining a call
 */
router.post('/token', async (req, res) => {
  try {
    const { channelName, uid, role = 'publisher' } = req.body;

    if (!channelName) {
      return res.status(400).json({
        success: false,
        error: 'Channel name is required'
      });
    }

    const token = generateAgoraToken(channelName, uid || 0, role);

    res.json({
      success: true,
      data: {
        token,
        channelName,
        uid: uid || 0,
        appId: AGORA_APP_ID
      }
    });
  } catch (error) {
    console.error('Token generation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/video/call/start
 * Start a new call and get token
 */
router.post('/call/start', async (req, res) => {
  try {
    const { userId, userName, callType = 'video' } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required'
      });
    }

    // Generate unique channel name
    const channelName = generateChannelName();

    // Generate token for the initiator
    const token = generateAgoraToken(channelName, 0);

    // Record call in database
    const result = await db.query(`
      INSERT INTO call_history (channel_name, initiated_by, initiator_name, call_type, status)
      VALUES ($1, $2, $3, $4, 'active')
      RETURNING id, channel_name, started_at
    `, [channelName, userId, userName, callType]);

    const call = result.rows[0];

    res.json({
      success: true,
      data: {
        callId: call.id,
        channelName: call.channel_name,
        token,
        appId: AGORA_APP_ID,
        startedAt: call.started_at
      }
    });
  } catch (error) {
    console.error('Start call error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/video/call/join
 * Join an existing call
 */
router.post('/call/join', async (req, res) => {
  try {
    const { channelName, userId, userName } = req.body;

    if (!channelName || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Channel name and user ID are required'
      });
    }

    // Check if call exists and is active
    const callResult = await db.query(`
      SELECT id, status, participants FROM call_history
      WHERE channel_name = $1
    `, [channelName]);

    if (callResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Call not found'
      });
    }

    const call = callResult.rows[0];

    if (call.status !== 'active') {
      return res.status(400).json({
        success: false,
        error: 'Call has ended'
      });
    }

    // Generate token for the joining user
    const token = generateAgoraToken(channelName, 0);

    // Update participants list
    const participants = call.participants || [];
    participants.push({
      userId,
      userName,
      joinedAt: new Date().toISOString()
    });

    await db.query(`
      UPDATE call_history
      SET participants = $1
      WHERE id = $2
    `, [JSON.stringify(participants), call.id]);

    res.json({
      success: true,
      data: {
        callId: call.id,
        channelName,
        token,
        appId: AGORA_APP_ID
      }
    });
  } catch (error) {
    console.error('Join call error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/video/call/end
 * End a call
 */
router.post('/call/end', async (req, res) => {
  try {
    const { channelName } = req.body;

    if (!channelName) {
      return res.status(400).json({
        success: false,
        error: 'Channel name is required'
      });
    }

    // Update call status
    const result = await db.query(`
      UPDATE call_history
      SET status = 'ended',
          ended_at = NOW(),
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
      WHERE channel_name = $1 AND status = 'active'
      RETURNING id, duration_seconds
    `, [channelName]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Active call not found'
      });
    }

    res.json({
      success: true,
      data: {
        callId: result.rows[0].id,
        duration: result.rows[0].duration_seconds
      }
    });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/video/invite
 * Send a call invitation
 */
router.post('/invite', async (req, res) => {
  try {
    const { channelName, fromUserId, fromUserName, toUserId, toEmail } = req.body;

    if (!channelName || !fromUserId) {
      return res.status(400).json({
        success: false,
        error: 'Channel name and from user ID are required'
      });
    }

    if (!toUserId && !toEmail) {
      return res.status(400).json({
        success: false,
        error: 'Either toUserId or toEmail is required'
      });
    }

    // Generate invite token for email invites
    const inviteToken = toEmail ? crypto.randomBytes(32).toString('hex') : null;

    // Create invitation
    const result = await db.query(`
      INSERT INTO call_invitations 
        (channel_name, from_user_id, from_user_name, to_user_id, to_email, invite_token)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, invite_token, expires_at
    `, [channelName, fromUserId, fromUserName, toUserId, toEmail, inviteToken]);

    const invitation = result.rows[0];

    // If email invite, send the email
    if (toEmail && inviteToken) {
      const emailResult = await sendCallInvitation(toEmail, fromUserName, inviteToken, channelName);
      if (!emailResult.success && !emailResult.mock) {
        console.warn(`Failed to send email to ${toEmail}:`, emailResult.error);
      }
    }

    res.json({
      success: true,
      data: {
        invitationId: invitation.id,
        inviteToken: invitation.invite_token,
        expiresAt: invitation.expires_at
      }
    });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/video/invite/:token
 * Get invitation details by token (for email links)
 */
router.get('/invite/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const result = await db.query(`
      SELECT ci.*, ch.status as call_status
      FROM call_invitations ci
      LEFT JOIN call_history ch ON ci.channel_name = ch.channel_name
      WHERE ci.invite_token = $1
    `, [token]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found'
      });
    }

    const invitation = result.rows[0];

    // Check if expired
    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({
        success: false,
        error: 'Invitation has expired'
      });
    }

    res.json({
      success: true,
      data: {
        channelName: invitation.channel_name,
        fromUserName: invitation.from_user_name,
        callStatus: invitation.call_status,
        expiresAt: invitation.expires_at
      }
    });
  } catch (error) {
    console.error('Get invite error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/video/invite/respond
 * Accept or decline an invitation
 */
router.post('/invite/respond', async (req, res) => {
  try {
    const { invitationId, accept } = req.body;

    const status = accept ? 'accepted' : 'declined';

    const result = await db.query(`
      UPDATE call_invitations
      SET status = $1, responded_at = NOW()
      WHERE id = $2 AND status = 'pending'
      RETURNING channel_name
    `, [status, invitationId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Invitation not found or already responded'
      });
    }

    res.json({
      success: true,
      data: {
        status,
        channelName: accept ? result.rows[0].channel_name : null
      }
    });
  } catch (error) {
    console.error('Respond to invite error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/video/invitations/pending
 * Get pending invitations for a user
 */
router.get('/invitations/pending/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const result = await db.query(`
      SELECT ci.*, ch.status as call_status
      FROM call_invitations ci
      LEFT JOIN call_history ch ON ci.channel_name = ch.channel_name
      WHERE ci.to_user_id = $1 
        AND ci.status = 'pending'
        AND ci.expires_at > NOW()
        AND (ch.status IS NULL OR ch.status = 'active')
      ORDER BY ci.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get pending invitations error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Clean up stale calls
 * Ends calls that have been running for too long without participants
 */
async function cleanupStaleCalls() {
  try {
    // End calls that:
    // 1. Have no participants AND started more than 5 minutes ago
    // 2. OR have been running for more than 4 hours (safety limit)
    const result = await db.query(`
      UPDATE call_history
      SET status = 'ended',
          ended_at = NOW(),
          duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
          metadata = jsonb_set(COALESCE(metadata, '{}'), '{auto_ended}', 'true')
      WHERE status = 'active'
        AND (
          (participants IS NULL OR participants = '[]'::jsonb OR jsonb_array_length(participants) = 0)
          AND started_at < NOW() - INTERVAL '5 minutes'
        )
        OR started_at < NOW() - INTERVAL '4 hours'
      RETURNING id, channel_name
    `);
    
    if (result.rows.length > 0) {
      console.log(`🧹 Auto-ended ${result.rows.length} stale call(s):`, result.rows.map(r => r.channel_name).join(', '));
    }
    
    return result.rows.length;
  } catch (error) {
    console.error('Cleanup stale calls error:', error);
    return 0;
  }
}

/**
 * GET /api/video/calls/active
 * Get active calls
 */
router.get('/calls/active', async (req, res) => {
  try {
    // First, cleanup any stale calls
    await cleanupStaleCalls();
    
    const result = await db.query(`
      SELECT id, channel_name, initiated_by, initiator_name, 
             participants, started_at, call_type
      FROM call_history
      WHERE status = 'active'
      ORDER BY started_at DESC
    `);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get active calls error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/video/calls/cleanup
 * Manually trigger cleanup of stale calls
 */
router.post('/calls/cleanup', async (req, res) => {
  try {
    const cleanedCount = await cleanupStaleCalls();
    
    res.json({
      success: true,
      data: {
        cleanedCalls: cleanedCount,
        message: cleanedCount > 0 
          ? `Cleaned up ${cleanedCount} stale call(s)` 
          : 'No stale calls to clean up'
      }
    });
  } catch (error) {
    console.error('Manual cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/video/calls/end-all
 * End all active calls for a specific user (or all if admin)
 */
router.post('/calls/end-all', async (req, res) => {
  try {
    const { userId } = req.body;
    
    let result;
    if (userId) {
      // End all calls initiated by this user
      result = await db.query(`
        UPDATE call_history
        SET status = 'ended',
            ended_at = NOW(),
            duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
            metadata = jsonb_set(COALESCE(metadata, '{}'), '{manually_ended}', 'true')
        WHERE status = 'active' AND initiated_by = $1
        RETURNING id, channel_name
      `, [userId]);
    } else {
      // End ALL active calls (admin action)
      result = await db.query(`
        UPDATE call_history
        SET status = 'ended',
            ended_at = NOW(),
            duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER,
            metadata = jsonb_set(COALESCE(metadata, '{}'), '{manually_ended}', 'true')
        WHERE status = 'active'
        RETURNING id, channel_name
      `);
    }
    
    console.log(`🛑 Manually ended ${result.rows.length} call(s)`);
    
    res.json({
      success: true,
      data: {
        endedCalls: result.rows.length,
        channels: result.rows.map(r => r.channel_name)
      }
    });
  } catch (error) {
    console.error('End all calls error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/video/calls/history
 * Get call history
 */
router.get('/calls/history', async (req, res) => {
  try {
    const { limit = 50, offset = 0, userId } = req.query;

    let query = `
      SELECT id, channel_name, initiated_by, initiator_name, 
             participants, started_at, ended_at, duration_seconds, status, call_type
      FROM call_history
    `;
    const params = [];

    if (userId) {
      query += ` WHERE initiated_by = $1 OR participants::text LIKE '%' || $1 || '%'`;
      params.push(userId);
    }

    query += ` ORDER BY started_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await db.query(query, params);

    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    console.error('Get call history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
