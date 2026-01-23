/**
 * MarineStream Workspace - Authentication Middleware
 * Clerk JWT verification and user context
 * Rise-X connection management
 */

const { clerkClient } = require('@clerk/clerk-sdk-node');
const db = require('../db');

// Lazy-load services to avoid circular dependencies
let tokenManager = null;
let syncService = null;

function getTokenManager() {
  if (!tokenManager) {
    tokenManager = require('../services/tokenManager');
  }
  return tokenManager;
}

function getSyncService() {
  if (!syncService) {
    syncService = require('../services/riseXSync');
  }
  return syncService;
}

// Track recent syncs to avoid triggering too frequently
const recentSyncs = new Map();
const SYNC_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Verify Clerk session and attach user to request
 * Also checks Rise-X connection status and triggers sync if needed
 */
async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
    }

    const token = authHeader.split(' ')[1];
    
    // In development, allow a bypass token for testing
    if (process.env.NODE_ENV === 'development' && token === 'dev-bypass') {
      req.user = {
        id: 'dev-user',
        clerk_id: 'dev-clerk-id',
        email: 'dev@marinestream.io',
        full_name: 'Dev User',
        role: 'admin',
        organization_id: null,
        riseXConnected: false
      };
      return next();
    }

    // Verify with Clerk
    const session = await clerkClient.sessions.verifySession(token);
    
    if (!session) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_SESSION',
          message: 'Invalid or expired session'
        }
      });
    }

    // Get user from database with Rise-X connection status
    const result = await db.query(
      `SELECT u.*, o.name as organization_name, o.slug as organization_slug,
              urc.is_active as rise_x_connected,
              urc.last_sync_at as rise_x_last_sync
       FROM users u
       LEFT JOIN organizations o ON u.organization_id = o.id
       LEFT JOIN user_rise_x_connections urc ON u.id = urc.user_id
       WHERE u.clerk_id = $1`,
      [session.userId]
    );

    if (result.rows.length === 0) {
      // User exists in Clerk but not in our DB - create them
      const clerkUser = await clerkClient.users.getUser(session.userId);
      
      const insertResult = await db.query(
        `INSERT INTO users (clerk_id, email, full_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          clerkUser.id,
          clerkUser.emailAddresses[0]?.emailAddress,
          `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim(),
          clerkUser.imageUrl
        ]
      );
      
      req.user = {
        ...insertResult.rows[0],
        riseXConnected: false,
        riseXLastSync: null
      };
    } else {
      req.user = {
        ...result.rows[0],
        riseXConnected: result.rows[0].rise_x_connected || false,
        riseXLastSync: result.rows[0].rise_x_last_sync
      };
    }

    // Trigger background sync if connected and not recently synced
    if (req.user.riseXConnected && req.user.id) {
      triggerBackgroundSyncIfNeeded(req.user.id);
    }

    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    
    // In development, continue without auth for easier testing
    if (process.env.NODE_ENV === 'development') {
      req.user = null;
      return next();
    }
    
    res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed'
      }
    });
  }
}

/**
 * Trigger a background sync if the user hasn't synced recently
 */
function triggerBackgroundSyncIfNeeded(userId) {
  const lastSync = recentSyncs.get(userId);
  const now = Date.now();
  
  if (lastSync && (now - lastSync) < SYNC_COOLDOWN_MS) {
    return; // Recently synced, skip
  }
  
  recentSyncs.set(userId, now);
  
  // Trigger incremental sync in background
  getSyncService().incrementalSync(userId).catch(err => {
    console.warn(`Background sync failed for user ${userId}:`, err.message);
  });
}

/**
 * Optional auth - continues without user if not authenticated
 */
async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      req.user = null;
      return next();
    }

    await requireAuth(req, res, next);
  } catch (err) {
    req.user = null;
    next();
  }
}

/**
 * Require admin role
 */
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin access required'
      }
    });
  }
  next();
}

/**
 * Require internal user (Franmarine staff)
 */
async function requireInternal(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }

  // Check if user's org is internal
  if (req.user.organization_id) {
    const result = await db.query(
      'SELECT is_internal FROM organizations WHERE id = $1',
      [req.user.organization_id]
    );
    
    if (result.rows.length > 0 && result.rows[0].is_internal) {
      return next();
    }
  }

  // Admins are always internal
  if (req.user.role === 'admin') {
    return next();
  }

  res.status(403).json({
    success: false,
    error: {
      code: 'FORBIDDEN',
      message: 'Internal access only'
    }
  });
}

/**
 * Require Rise-X connection
 * Use after requireAuth to ensure user has connected their Rise-X account
 */
async function requireRiseXConnection(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Authentication required'
      }
    });
  }

  if (!req.user.riseXConnected) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'RISE_X_NOT_CONNECTED',
        message: 'Please connect your Rise-X account to access this feature'
      }
    });
  }

  next();
}

/**
 * Attach Rise-X token to request if available
 * Useful for routes that proxy to Rise-X API
 */
async function attachRiseXToken(req, res, next) {
  if (req.user && req.user.id && req.user.riseXConnected) {
    try {
      const token = await getTokenManager().getValidToken(req.user.id);
      req.riseXToken = token;
    } catch (err) {
      console.warn('Failed to get Rise-X token:', err.message);
      req.riseXToken = null;
    }
  } else {
    req.riseXToken = null;
  }
  next();
}

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireInternal,
  requireRiseXConnection,
  attachRiseXToken
};
