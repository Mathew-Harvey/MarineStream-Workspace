require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function createTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS vessel_positions (
        mmsi VARCHAR(20) PRIMARY KEY,
        lat DECIMAL(10, 6) NOT NULL,
        lng DECIMAL(11, 6) NOT NULL,
        speed DECIMAL(5, 1),
        course DECIMAL(5, 1),
        heading INTEGER,
        ship_name VARCHAR(255),
        destination VARCHAR(255),
        source VARCHAR(50) DEFAULT 'ais',
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Created vessel_positions table');
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_vessel_positions_updated 
      ON vessel_positions(updated_at DESC)
    `);
    console.log('✅ Created index on vessel_positions');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await pool.end();
  }
}

createTable();
