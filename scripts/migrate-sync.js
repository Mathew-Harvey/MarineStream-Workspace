/**
 * MarineStream Workspace - Sync Schema Migration
 * Run with: npm run db:migrate-sync
 * 
 * This migration adds the Rise-X sync tables to the database.
 * Safe to run multiple times (uses IF NOT EXISTS).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

async function migrateSyncSchema() {
  console.log('🔧 Running Rise-X Sync schema migration...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Determine if SSL is needed
  const isRender = process.env.DATABASE_URL.includes('render.com');
  const isProduction = process.env.NODE_ENV === 'production';
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: (isProduction || isRender) ? { rejectUnauthorized: false } : false,
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL');

    // Read sync schema
    const schemaPath = path.join(__dirname, '../server/db/schema-sync.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📝 Executing sync schema migration...\n');
    await client.query(schema);

    // Verify new tables
    const newTables = [
      'user_rise_x_connections',
      'rise_x_work_items',
      'rise_x_assets',
      'biofouling_assessments',
      'sync_state',
      'sync_logs',
      'rise_x_flows'
    ];

    console.log('📋 Verifying tables:');
    for (const tableName of newTables) {
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [tableName]);
      
      const exists = result.rows[0].exists;
      console.log(`   ${exists ? '✅' : '❌'} ${tableName}`);
    }

    // Verify indexes
    const indexCount = await client.query(`
      SELECT COUNT(*) 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname LIKE 'idx_rise_x%' OR indexname LIKE 'idx_sync_%' OR indexname LIKE 'idx_biofouling_%' OR indexname LIKE 'idx_user_rise_x%'
    `);
    console.log(`\n📊 Created ${indexCount.rows[0].count} indexes for sync tables`);

    // Verify triggers
    const triggerCount = await client.query(`
      SELECT COUNT(*) 
      FROM pg_trigger 
      WHERE tgname LIKE 'update_%_updated_at'
    `);
    console.log(`⚡ Created ${triggerCount.rows[0].count} update triggers`);

    client.release();
    console.log('\n✅ Sync schema migration complete!\n');

  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrateSyncSchema();
