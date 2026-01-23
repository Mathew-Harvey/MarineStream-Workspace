/**
 * Rise-X OAuth Token Manager
 * 
 * Manages Rise-X OAuth tokens for users:
 * - Secure storage in PostgreSQL (encrypted)
 * - Automatic token refresh
 * - Token retrieval for API calls
 */

const https = require('https');
const crypto = require('crypto');
const db = require('../db');

// Encryption configuration
// In production, use a proper key management service
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || 
  crypto.createHash('sha256').update(process.env.CLERK_SECRET_KEY || 'dev-key').digest();
const IV_LENGTH = 16;

// Rise-X OAuth configuration
const RISEX_CONFIG = {
  hostname: 'account.rise-x.io',
  tokenPath: '/connect/token',
  userInfoPath: '/connect/userinfo',
  clientId: '52872a23-d419-4951-a8dd-9a5196d2225b'
};

// Token refresh buffer (refresh 5 minutes before expiry)
const REFRESH_BUFFER_MS = 5 * 60 * 1000;

/**
 * Encrypt a token for storage
 */
function encryptToken(token) {
  if (!token) return null;
  
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Return IV + encrypted data as hex
  return iv.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a stored token
 */
function decryptToken(encryptedData) {
  if (!encryptedData) return null;
  
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 2) return null;
    
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (err) {
    console.error('Token decryption failed:', err.message);
    return null;
  }
}

/**
 * Make HTTPS request to Rise-X
 */
function makeRiseXRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(result);
          } else {
            reject(new Error(result.error_description || result.error || `HTTP ${res.statusCode}`));
          }
        } catch (e) {
          reject(new Error('Invalid response from Rise-X'));
        }
      });
    });
    
    req.on('error', reject);
    
    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

/**
 * Token Manager class
 */
class TokenManager {
  /**
   * Store a new Rise-X connection for a user
   * Called after successful OAuth callback
   */
  async storeConnection(userId, tokenData, userInfo = null) {
    const encryptedAccessToken = encryptToken(tokenData.access_token);
    const encryptedRefreshToken = encryptToken(tokenData.refresh_token);
    
    // Calculate expiry time
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
    
    // Parse scopes
    const scopes = tokenData.scope ? tokenData.scope.split(' ') : [];
    
    try {
      const result = await db.query(`
        INSERT INTO user_rise_x_connections (
          user_id,
          rise_x_user_id,
          rise_x_email,
          access_token_encrypted,
          refresh_token_encrypted,
          token_expires_at,
          scopes,
          connected_at,
          is_active,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), true, $8)
        ON CONFLICT (user_id) DO UPDATE SET
          rise_x_user_id = EXCLUDED.rise_x_user_id,
          rise_x_email = EXCLUDED.rise_x_email,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
          token_expires_at = EXCLUDED.token_expires_at,
          scopes = EXCLUDED.scopes,
          is_active = true,
          last_token_refresh_at = NOW(),
          updated_at = NOW()
        RETURNING id
      `, [
        userId,
        userInfo?.sub || null,
        userInfo?.email || null,
        encryptedAccessToken,
        encryptedRefreshToken,
        expiresAt,
        scopes,
        JSON.stringify({ 
          token_type: tokenData.token_type,
          connected_via: 'oauth'
        })
      ]);
      
      console.log(`✅ Stored Rise-X connection for user ${userId}`);
      return result.rows[0];
    } catch (err) {
      console.error('Failed to store Rise-X connection:', err);
      throw err;
    }
  }

  /**
   * Get a valid access token for a user
   * Automatically refreshes if expired or near expiry
   */
  async getValidToken(userId) {
    // Get current connection
    const connection = await this.getConnection(userId);
    
    if (!connection) {
      return null;
    }
    
    if (!connection.is_active) {
      console.log(`Rise-X connection inactive for user ${userId}`);
      return null;
    }
    
    // Check if token needs refresh
    const now = new Date();
    const expiresAt = new Date(connection.token_expires_at);
    const needsRefresh = now.getTime() > (expiresAt.getTime() - REFRESH_BUFFER_MS);
    
    if (needsRefresh) {
      console.log(`Token expired or expiring soon for user ${userId}, refreshing...`);
      
      const refreshToken = decryptToken(connection.refresh_token_encrypted);
      if (!refreshToken) {
        console.error('Failed to decrypt refresh token');
        await this.markConnectionInactive(userId, 'refresh_token_decrypt_failed');
        return null;
      }
      
      try {
        const newTokens = await this.refreshToken(refreshToken);
        await this.updateTokens(userId, newTokens);
        return newTokens.access_token;
      } catch (err) {
        console.error('Token refresh failed:', err.message);
        await this.markConnectionInactive(userId, `refresh_failed: ${err.message}`);
        return null;
      }
    }
    
    // Return decrypted access token
    return decryptToken(connection.access_token_encrypted);
  }

  /**
   * Get user's Rise-X connection (without decrypting tokens)
   */
  async getConnection(userId) {
    try {
      const result = await db.query(`
        SELECT * FROM user_rise_x_connections
        WHERE user_id = $1
      `, [userId]);
      
      return result.rows[0] || null;
    } catch (err) {
      console.error('Failed to get Rise-X connection:', err);
      return null;
    }
  }

  /**
   * Check if user has an active Rise-X connection
   */
  async hasActiveConnection(userId) {
    try {
      const result = await db.query(`
        SELECT is_active, token_expires_at 
        FROM user_rise_x_connections
        WHERE user_id = $1
      `, [userId]);
      
      if (!result.rows[0]) return false;
      
      return result.rows[0].is_active;
    } catch (err) {
      console.error('Failed to check Rise-X connection:', err);
      return false;
    }
  }

  /**
   * Refresh a Rise-X access token
   */
  async refreshToken(refreshToken) {
    const params = new URLSearchParams();
    params.append('client_id', RISEX_CONFIG.clientId);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    
    const postData = params.toString();
    
    const options = {
      hostname: RISEX_CONFIG.hostname,
      port: 443,
      path: RISEX_CONFIG.tokenPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    return makeRiseXRequest(options, postData);
  }

  /**
   * Update stored tokens after refresh
   */
  async updateTokens(userId, tokenData) {
    const encryptedAccessToken = encryptToken(tokenData.access_token);
    const encryptedRefreshToken = tokenData.refresh_token 
      ? encryptToken(tokenData.refresh_token) 
      : null;
    
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));
    
    try {
      await db.query(`
        UPDATE user_rise_x_connections SET
          access_token_encrypted = $2,
          ${encryptedRefreshToken ? 'refresh_token_encrypted = $3,' : ''}
          token_expires_at = $4,
          last_token_refresh_at = NOW(),
          updated_at = NOW()
        WHERE user_id = $1
      `, encryptedRefreshToken 
        ? [userId, encryptedAccessToken, encryptedRefreshToken, expiresAt]
        : [userId, encryptedAccessToken, expiresAt]
      );
      
      console.log(`✅ Refreshed tokens for user ${userId}`);
    } catch (err) {
      console.error('Failed to update tokens:', err);
      throw err;
    }
  }

  /**
   * Mark a connection as inactive (e.g., after revocation or failure)
   */
  async markConnectionInactive(userId, reason = null) {
    try {
      await db.query(`
        UPDATE user_rise_x_connections SET
          is_active = false,
          metadata = metadata || $2,
          updated_at = NOW()
        WHERE user_id = $1
      `, [userId, JSON.stringify({ deactivated_reason: reason, deactivated_at: new Date().toISOString() })]);
      
      console.log(`Marked Rise-X connection inactive for user ${userId}: ${reason}`);
    } catch (err) {
      console.error('Failed to mark connection inactive:', err);
    }
  }

  /**
   * Disconnect a user's Rise-X account
   */
  async disconnect(userId) {
    // Get the connection to revoke tokens
    const connection = await this.getConnection(userId);
    
    if (connection && connection.is_active) {
      // Try to revoke the token with Rise-X
      const accessToken = decryptToken(connection.access_token_encrypted);
      if (accessToken) {
        try {
          await this.revokeToken(accessToken);
        } catch (err) {
          console.warn('Token revocation failed (may already be revoked):', err.message);
        }
      }
    }
    
    // Delete the connection from database
    try {
      await db.query(`
        DELETE FROM user_rise_x_connections
        WHERE user_id = $1
      `, [userId]);
      
      console.log(`✅ Disconnected Rise-X account for user ${userId}`);
      return true;
    } catch (err) {
      console.error('Failed to disconnect Rise-X account:', err);
      throw err;
    }
  }

  /**
   * Revoke a token with Rise-X
   */
  async revokeToken(token) {
    const params = new URLSearchParams();
    params.append('token', token);
    params.append('client_id', RISEX_CONFIG.clientId);
    
    const postData = params.toString();
    
    const options = {
      hostname: RISEX_CONFIG.hostname,
      port: 443,
      path: '/connect/revocation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    return makeRiseXRequest(options, postData);
  }

  /**
   * Get Rise-X user info using an access token
   */
  async getUserInfo(accessToken) {
    const options = {
      hostname: RISEX_CONFIG.hostname,
      port: 443,
      path: RISEX_CONFIG.userInfoPath,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    };
    
    return makeRiseXRequest(options);
  }

  /**
   * Update last sync timestamp for a user's connection
   */
  async updateLastSync(userId) {
    try {
      await db.query(`
        UPDATE user_rise_x_connections SET
          last_sync_at = NOW(),
          updated_at = NOW()
        WHERE user_id = $1
      `, [userId]);
    } catch (err) {
      console.error('Failed to update last sync:', err);
    }
  }

  /**
   * Get all active connections that need sync
   * (for background sync jobs)
   */
  async getConnectionsNeedingSync(olderThanMinutes = 15) {
    try {
      const result = await db.query(`
        SELECT urc.*, u.email as user_email
        FROM user_rise_x_connections urc
        JOIN users u ON u.id = urc.user_id
        WHERE urc.is_active = true
        AND (urc.last_sync_at IS NULL OR urc.last_sync_at < NOW() - INTERVAL '${olderThanMinutes} minutes')
        ORDER BY urc.last_sync_at ASC NULLS FIRST
        LIMIT 100
      `);
      
      return result.rows;
    } catch (err) {
      console.error('Failed to get connections needing sync:', err);
      return [];
    }
  }
}

// Export singleton instance
module.exports = new TokenManager();
