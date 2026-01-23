/**
 * MarineStream Workspace - Database Initialization
 * Run with: npm run db:init
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function initDatabase() {
  console.log('🔧 Initializing MarineStream Workspace database...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    console.log('\nPlease set DATABASE_URL in your .env file:');
    console.log('DATABASE_URL=postgresql://user:password@host:5432/marinestream_workspace\n');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }  // Render requires SSL
  });

  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL');

    // Drop existing tables to allow clean recreation
    console.log('🗑️  Dropping existing tables for clean recreation...');
    await client.query(`
      DROP TABLE IF EXISTS call_invitations CASCADE;
      DROP TABLE IF EXISTS call_history CASCADE;
      DROP TABLE IF EXISTS user_presence CASCADE;
      DROP TABLE IF EXISTS jobs CASCADE;
      DROP TABLE IF EXISTS job_drafts CASCADE;
      DROP TABLE IF EXISTS vessel_positions CASCADE;
      DROP TABLE IF EXISTS fleet_vessels CASCADE;
      DROP TABLE IF EXISTS fleets CASCADE;
      DROP TABLE IF EXISTS audit_log CASCADE;
      DROP TABLE IF EXISTS user_preferences CASCADE;
      DROP TABLE IF EXISTS app_access CASCADE;
      DROP TABLE IF EXISTS applications CASCADE;
      DROP TABLE IF EXISTS vessels CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP TABLE IF EXISTS organizations CASCADE;
    `);

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📝 Executing schema...\n');
    await client.query(schema);

    // Verify tables
    const tables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('📋 Created tables:');
    tables.rows.forEach(row => {
      console.log(`   • ${row.table_name}`);
    });

    // Count seeded data
    const orgCount = await client.query('SELECT COUNT(*) FROM organizations');
    const appCount = await client.query('SELECT COUNT(*) FROM applications');
    const vesselCount = await client.query('SELECT COUNT(*) FROM vessels');

    console.log('\n📊 Seeded data:');
    console.log(`   • ${orgCount.rows[0].count} organizations`);
    console.log(`   • ${appCount.rows[0].count} applications`);
    console.log(`   • ${vesselCount.rows[0].count} demo vessels`);

    client.release();
    console.log('\n✅ Database initialization complete!\n');

  } catch (err) {
    console.error('❌ Database initialization failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

initDatabase();
