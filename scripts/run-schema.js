/**
 * Run database schema migrations
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function runSchema() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' 
      ? { rejectUnauthorized: false } 
      : false,
  });

  try {
    // Read the schema file
    const schemaPath = path.join(__dirname, '../server/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('Running schema migrations...');
    await pool.query(schema);
    console.log('✅ Schema migrations completed successfully');

    // Check if fleets table exists
    const result = await pool.query("SELECT to_regclass('public.fleets')");
    console.log('Fleets table exists:', result.rows[0].to_regclass !== null);

  } catch (err) {
    console.error('Error running schema:', err.message);
  } finally {
    await pool.end();
  }
}

runSchema();
