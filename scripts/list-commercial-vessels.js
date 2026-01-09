/**
 * List all commercial vessels in MarineStream
 */
const fs = require('fs');
const path = require('path');

// Read the fleet data
const dataPath = 'c:/Users/MattHarvey/.cursor/projects/c-Users-MattHarvey-OneDrive-Franmarine-Documents-dev-MarineStream-Workspace/agent-tools/be1a9842-3249-492b-9040-bd733432f9b3.txt';

try {
  const data = fs.readFileSync(dataPath, 'utf8');
  
  // Extract all vessel objects
  const vessels = [];
  const seen = new Set();
  
  // Split by vessel object boundaries and parse each
  const parts = data.split(/"id":"/);
  
  parts.forEach(part => {
    const nameMatch = part.match(/"name":"([^"]+)"/);
    const classMatch = part.match(/"class":"([^"]*)"/);
    const imoMatch = part.match(/"imo":"([^"]*)"/);
    const mmsiMatch = part.match(/"mmsi":"?([^",}]*)"?/);
    const flagMatch = part.match(/"flag":"([^"]+)"/);
    const typeMatch = part.match(/"typeCategory":"([^"]+)"/);
    const labelMatch = part.match(/"typeLabel":"([^"]+)"/);
    
    if (nameMatch) {
      const name = nameMatch[1];
      const type = typeMatch ? typeMatch[1] : 'unknown';
      const label = labelMatch ? labelMatch[1] : '';
      
      // Skip military/RAN vessels and generic entries
      if (type !== 'military' && 
          !name.startsWith('HMAS') && 
          !name.startsWith('Cape ') &&
          name !== 'Commercial Vessels' &&
          !seen.has(name)) {
        
        seen.add(name);
        vessels.push({
          name: name,
          class: classMatch ? classMatch[1] : '-',
          imo: imoMatch ? imoMatch[1] : '-',
          mmsi: mmsiMatch && mmsiMatch[1] !== 'null' ? mmsiMatch[1] : '-',
          flag: flagMatch ? flagMatch[1] : '-',
          type: label || type
        });
      }
    }
  });
  
  // Sort alphabetically
  vessels.sort((a, b) => a.name.localeCompare(b.name));
  
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                              ALL COMMERCIAL VESSELS IN MARINESTREAM                                           ║');
  console.log('╚═══════════════════════════════════════════════════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('┌────┬──────────────────────────┬────────────────────────┬────────────┬──────────────┬──────────────┐');
  console.log('│ #  │ Vessel Name              │ Class                  │ IMO        │ MMSI         │ Flag         │');
  console.log('├────┼──────────────────────────┼────────────────────────┼────────────┼──────────────┼──────────────┤');
  
  vessels.forEach((v, i) => {
    const num = String(i + 1).padStart(2, ' ');
    const name = v.name.padEnd(24).substring(0, 24);
    const cls = (v.class || '-').padEnd(22).substring(0, 22);
    const imo = (v.imo || '-').padEnd(10).substring(0, 10);
    const mmsi = (v.mmsi || '-').padEnd(12).substring(0, 12);
    const flag = (v.flag || '-').padEnd(12).substring(0, 12);
    console.log(`│ ${num} │ ${name} │ ${cls} │ ${imo} │ ${mmsi} │ ${flag} │`);
  });
  
  console.log('└────┴──────────────────────────┴────────────────────────┴────────────┴──────────────┴──────────────┘');
  console.log('');
  console.log(`TOTAL: ${vessels.length} commercial vessels`);
  console.log('');
  
  // Summary by type
  const byType = {};
  vessels.forEach(v => {
    byType[v.type] = (byType[v.type] || 0) + 1;
  });
  
  console.log('By Category:');
  Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
    console.log(`  - ${type}: ${count}`);
  });
  
  // Count with MMSI
  const withMMSI = vessels.filter(v => v.mmsi !== '-' && v.mmsi !== '').length;
  console.log('');
  console.log(`Vessels with valid MMSI: ${withMMSI}/${vessels.length}`);
  
} catch (err) {
  console.error('Error:', err.message);
}
