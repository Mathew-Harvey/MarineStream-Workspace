/**
 * MarineStream Workspace - Authentication Middleware
 * Clerk JWT verification and user context
 */

const { clerkClient } = require('@clerk/clerk-sdk-node');
const db = require('../db');

/**
 * Verify Clerk session and attach user to request
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
        organization_id: null
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

    // Get user from database
    const result = await db.query(
      `SELECT u.*, o.name as organization_name, o.slug as organization_slug
       FROM users u
       LEFT JOIN organizations o ON u.organization_id = o.id
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
      
      req.user = insertResult.rows[0];
    } else {
      req.user = result.rows[0];
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

module.exports = {
  requireAuth,
  optionalAuth,
  requireAdmin,
  requireInternal
};
