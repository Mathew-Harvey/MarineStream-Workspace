/**
 * Quick fix script to ensure the vessels table exists with correct schema
 * Run with: node scripts/fix-vessels-table.js
 */

require('dotenv').config();
const { Pool } = require('pg');

async function fixVesselsTable() {
  console.log('🔧 Fixing vessels table...\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('render.com') 
      ? { rejectUnauthorized: false } 
      : false,
  });

  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL');

    // Check if vessels table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'vessels'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.log('📝 Creating vessels table...');
      await client.query(`
        CREATE TABLE IF NOT EXISTS vessels (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          mmsi VARCHAR(20) UNIQUE,
          imo VARCHAR(20),
          name VARCHAR(255) NOT NULL,
          vessel_type VARCHAR(100),
          flag VARCHAR(10),
          length_meters DECIMAL(8,2),
          beam_meters DECIMAL(8,2),
          organization_id UUID,
          is_tracked BOOLEAN DEFAULT TRUE,
          metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log('✅ Created vessels table');
    } else {
      console.log('✅ Vessels table exists');
      
      // Check if mmsi column exists
      const columnCheck = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = 'vessels' 
          AND column_name = 'mmsi'
        );
      `);

      if (!columnCheck.rows[0].exists) {
        console.log('📝 Adding mmsi column...');
        await client.query(`
          ALTER TABLE vessels ADD COLUMN mmsi VARCHAR(20) UNIQUE;
        `);
        console.log('✅ Added mmsi column');
      } else {
        console.log('✅ mmsi column exists');
      }
    }

    // Check if vessel_positions table exists
    const posTableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'vessel_positions'
      );
    `);

    if (!posTableCheck.rows[0].exists) {
      console.log('📝 Creating vessel_positions table...');
      await client.query(`
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
        );
      `);
      console.log('✅ Created vessel_positions table');
    } else {
      console.log('✅ vessel_positions table exists');
    }

    // Show current table structure
    const columns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'vessels' 
      ORDER BY ordinal_position;
    `);

    console.log('\n📋 Vessels table structure:');
    columns.rows.forEach(col => {
      console.log(`   • ${col.column_name}: ${col.data_type}`);
    });

    // Count vessels
    const count = await client.query('SELECT COUNT(*) FROM vessels');
    console.log(`\n📊 Vessels in table: ${count.rows[0].count}`);

    client.release();
    console.log('\n✅ Fix complete!\n');

  } catch (err) {
    console.error('❌ Fix failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

fixVesselsTable();
