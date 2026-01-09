/**
 * Static Vessel Positions Database
 * Fallback positions for vessels when live tracking is unavailable
 * 
 * These are estimated/typical berthing locations for fleet vessels.
 * Updated manually based on known vessel homeports.
 */

const STATIC_POSITIONS = {
  // Australian ports for reference
  PORTS: {
    'Garden Island (Sydney)': { lat: -33.8490, lng: 151.2246 },
    'Fleet Base East (Sydney)': { lat: -33.8510, lng: 151.2274 },
    'Garden Island (Perth)': { lat: -32.0533, lng: 115.7484 },
    'HMAS Stirling': { lat: -32.0533, lng: 115.7485 },
    'Fleet Base West': { lat: -32.0533, lng: 115.7486 },
    'Darwin Naval Base': { lat: -12.4548, lng: 130.8512 },
    'Cairns (HMAS Cairns)': { lat: -16.9230, lng: 145.7755 },
    'Brisbane (Fishermans Island)': { lat: -27.3807, lng: 153.1675 },
    'Brisbane (Pinkenba)': { lat: -27.4242, lng: 153.1149 },
    'Melbourne (Webb Dock)': { lat: -37.8379, lng: 144.9257 },
    'Melbourne (Station Pier)': { lat: -37.8498, lng: 144.9325 },
    'Fremantle': { lat: -32.0569, lng: 115.7387 },
    'Adelaide (Outer Harbour)': { lat: -34.7850, lng: 138.4904 },
    'Newcastle': { lat: -32.9225, lng: 151.7817 },
    'Geelong': { lat: -38.1449, lng: 144.3582 },
    'Port Kembla': { lat: -34.4752, lng: 150.9089 },
    'Townsville': { lat: -19.2520, lng: 146.8301 },
    // International ports
    'Singapore': { lat: 1.2663, lng: 103.8199 },
    'Auckland': { lat: -36.8485, lng: 174.7633 },
    'Devonport (NZ)': { lat: -36.8267, lng: 174.7962 },
    'Portsmouth (UK)': { lat: 50.8020, lng: -1.1039 },
    'San Diego': { lat: 32.6861, lng: -117.1392 },
    'Pearl Harbor': { lat: 21.3498, lng: -157.9700 }
  },

  // Vessel home ports and estimated positions
  // Format: vessel name (lowercase) -> { lat, lng, port, note }
  VESSELS: {
    // RAN Major Fleet Units
    'hmas adelaide': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'LHD homeported Perth' },
    'hmas canberra': { lat: -33.8510, lng: 151.2274, port: 'Fleet Base East', note: 'LHD homeported Sydney' },
    'hmas supply': { lat: -33.8510, lng: 151.2274, port: 'Fleet Base East', note: 'AOR homeported Sydney' },
    'hmas stalwart': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'AOR homeported Perth' },
    'hmas choules': { lat: -33.8510, lng: 151.2274, port: 'Fleet Base East', note: 'LST homeported Sydney' },
    
    // Hobart Class Destroyers
    'hmas hobart': { lat: -33.8510, lng: 151.2274, port: 'Fleet Base East', note: 'DDG homeported Sydney' },
    'hmas brisbane': { lat: -33.8510, lng: 151.2274, port: 'Fleet Base East', note: 'DDG homeported Sydney' },
    'hmas sydney': { lat: -33.8510, lng: 151.2274, port: 'Fleet Base East', note: 'DDG homeported Sydney' },
    
    // Anzac Class Frigates
    'hmas anzac': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'FFH homeported Perth' },
    'hmas arunta': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'FFH homeported Perth' },
    'hmas warramunga': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'FFH homeported Perth' },
    'hmas stuart': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'FFH homeported Perth' },
    'hmas parramatta': { lat: -33.8510, lng: 151.2274, port: 'Fleet Base East', note: 'FFH homeported Sydney' },
    'hmas ballarat': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'FFH homeported Perth' },
    'hmas toowoomba': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'FFH homeported Perth' },
    'hmas perth': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'FFH homeported Perth' },
    
    // Hunter Class (future)
    'hmas hunter': { lat: -34.7850, lng: 138.4904, port: 'Adelaide (construction)', note: 'Hunter class under construction' },
    
    // Arafura Class OPV
    'hmas arafura': { lat: -12.4548, lng: 130.8512, port: 'Darwin', note: 'OPV homeported Darwin' },
    'hmas eyre': { lat: -12.4548, lng: 130.8512, port: 'Darwin', note: 'OPV homeported Darwin' },
    
    // Submarine Force
    'hmas collins': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'SSG homeported Perth' },
    'hmas farncomb': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'SSG homeported Perth' },
    'hmas dechaineux': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'SSG homeported Perth' },
    'hmas sheean': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'SSG homeported Perth' },
    'hmas rankin': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'SSG homeported Perth' },
    'hmas waller': { lat: -32.0533, lng: 115.7485, port: 'Fleet Base West', note: 'SSG homeported Perth' },
    
    // Mine Warfare / Hydrographic
    'hmas diamantina': { lat: -16.9230, lng: 145.7755, port: 'Cairns', note: 'Survey vessel' },
    'hmas leeuwin': { lat: -16.9230, lng: 145.7755, port: 'Cairns', note: 'Survey vessel' },
    'hmas melville': { lat: -16.9230, lng: 145.7755, port: 'Cairns', note: 'Survey vessel' },
    
    // Patrol Boats
    'adv cape class': { lat: -12.4548, lng: 130.8512, port: 'Darwin', note: 'ABF Cape Class' },
    
    // SAAM Towage - Australian Ports
    'svitzer redhead': { lat: -32.9225, lng: 151.7817, port: 'Newcastle', note: 'Tug' },
    'svitzer carrington': { lat: -32.9225, lng: 151.7817, port: 'Newcastle', note: 'Tug' },
    'svitzer clyde': { lat: -33.8510, lng: 151.2274, port: 'Sydney', note: 'Tug' },
    'svitzer glenrock': { lat: -32.9225, lng: 151.7817, port: 'Newcastle', note: 'Tug' },
    'svitzer maitland': { lat: -32.9225, lng: 151.7817, port: 'Newcastle', note: 'Tug' },
    'svitzer bondi': { lat: -33.8510, lng: 151.2274, port: 'Sydney', note: 'Tug' },
    'svitzer coogee': { lat: -33.8510, lng: 151.2274, port: 'Sydney', note: 'Tug' },
    'svitzer kurrajong': { lat: -33.8510, lng: 151.2274, port: 'Sydney', note: 'Tug' },
    'svitzer marloo': { lat: -32.0569, lng: 115.7387, port: 'Fremantle', note: 'Tug' },
    'svitzer arm': { lat: -34.7850, lng: 138.4904, port: 'Adelaide', note: 'Tug' },
    'svitzer eve': { lat: -34.7850, lng: 138.4904, port: 'Adelaide', note: 'Tug' },
    
    // SAAM Towage - No static positions, use AIS only
    // These vessels are tracked via AIS (MMSI: 316033100, 316026200)
    
    // International Fleet
    'hms queen elizabeth': { lat: 50.8020, lng: -1.1039, port: 'Portsmouth', note: 'Royal Navy CVF' },
    'hmnzs aotearoa': { lat: -36.8267, lng: 174.7962, port: 'Devonport', note: 'RNZN tanker' },
    'hmnzs te kaha': { lat: -36.8267, lng: 174.7962, port: 'Devonport', note: 'RNZN frigate' },
    'hmnzs te mana': { lat: -36.8267, lng: 174.7962, port: 'Devonport', note: 'RNZN frigate' },
    'uss carl vinson': { lat: 32.6861, lng: -117.1392, port: 'San Diego', note: 'USN CVN' },
    'uss abraham lincoln': { lat: 32.6861, lng: -117.1392, port: 'San Diego', note: 'USN CVN' },
  }
};

/**
 * Get static position for a vessel by name
 * @param {string} vesselName - The vessel name
 * @returns {object|null} - { lat, lng, port, note, source: 'static' }
 */
function getStaticPosition(vesselName) {
  if (!vesselName) return null;
  
  const nameLower = vesselName.toLowerCase().trim();
  
  // Direct match
  if (STATIC_POSITIONS.VESSELS[nameLower]) {
    return {
      ...STATIC_POSITIONS.VESSELS[nameLower],
      source: 'static'
    };
  }
  
  // Partial match (for variations like "HMAS Stalwart" vs "Stalwart")
  for (const [key, pos] of Object.entries(STATIC_POSITIONS.VESSELS)) {
    if (nameLower.includes(key.replace('hmas ', '').replace('hms ', '').replace('hmnzs ', '').replace('uss ', '').replace('svitzer ', '')) ||
        key.includes(nameLower)) {
      return {
        ...pos,
        source: 'static'
      };
    }
  }
  
  return null;
}

/**
 * Get port coordinates by name
 * @param {string} portName - The port name
 * @returns {object|null} - { lat, lng }
 */
function getPortPosition(portName) {
  if (!portName) return null;
  
  const nameLower = portName.toLowerCase();
  
  for (const [key, pos] of Object.entries(STATIC_POSITIONS.PORTS)) {
    if (key.toLowerCase().includes(nameLower) || nameLower.includes(key.toLowerCase())) {
      return pos;
    }
  }
  
  return null;
}

/**
 * Get all static positions
 * @returns {object} - All vessel positions
 */
function getAllStaticPositions() {
  return STATIC_POSITIONS.VESSELS;
}

module.exports = {
  getStaticPosition,
  getPortPosition,
  getAllStaticPositions,
  PORTS: STATIC_POSITIONS.PORTS
};
