/**
 * Update all apps to public visibility
 */
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function updateApps() {
  try {
    // Update all apps to public visibility
    const result = await pool.query(`
      UPDATE applications 
      SET visibility = 'public',
          description = CASE slug 
            WHEN 'core' THEN 'Multi-party workflow for delivering inspection & cleaning jobs (MarineStream Core)'
            WHEN 'iwc' THEN 'Planning and getting approval for in-water cleaning work'
            ELSE description 
          END
    `);
    
    console.log('Updated', result.rowCount, 'apps to public visibility');
    
    // Show all apps
    const apps = await pool.query('SELECT slug, name, visibility FROM applications ORDER BY sort_order');
    console.log('\nCurrent apps:');
    apps.rows.forEach(app => {
      console.log(`  - ${app.name} (${app.slug}): ${app.visibility}`);
    });
    
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

updateApps();
