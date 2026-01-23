/**
 * MarineStream Workspace - Database Connection
 * PostgreSQL connection pool with helper methods
 */

const { Pool } = require('pg');

// Determine if we need SSL (Render databases always require SSL)
const needsSSL = process.env.NODE_ENV === 'production' || 
                 (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('render.com'));

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
  // Pool configuration optimized for cloud databases (Render)
  max: 10,                        // Reduce max connections (Render free tier limit)
  min: 1,                         // Keep at least 1 connection alive
  idleTimeoutMillis: 60000,       // Close idle connections after 60s (was 30s)
  connectionTimeoutMillis: 10000, // Wait up to 10s for connection (was 2s)
  acquireTimeoutMillis: 30000,    // Wait up to 30s to acquire from pool
  // Keep-alive to prevent connection drops
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
});

// Track connection state
let isConnected = false;

// Test connection on startup
pool.on('connect', () => {
  if (!isConnected) {
    console.log('✅ Connected to PostgreSQL');
    isConnected = true;
  }
});

pool.on('error', (err) => {
  console.error('PostgreSQL pool error:', err.message);
  isConnected = false;
});

pool.on('remove', () => {
  // Connection removed from pool - this is normal
});

/**
 * Query wrapper with automatic retry for connection issues
 */
async function queryWithRetry(text, params, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await pool.query(text, params);
    } catch (error) {
      const isConnectionError = 
        error.message.includes('Connection terminated') ||
        error.message.includes('connection timeout') ||
        error.code === 'ECONNRESET' ||
        error.code === 'EPIPE';
      
      if (isConnectionError && attempt < retries) {
        console.warn(`DB query failed (attempt ${attempt + 1}/${retries + 1}), retrying...`);
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1))); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}

module.exports = {
  query: queryWithRetry,
  getClient: () => pool.connect(),
  pool,
  isConnected: () => isConnected
};
