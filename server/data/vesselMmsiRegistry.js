/**
 * Master MMSI Registry for MarineStream
 * 
 * This is the AUTHORITATIVE source of truth for vessel MMSI numbers.
 * Data sourced from MarineTraffic, VesselFinder, and AMSA.
 * 
 * IMPORTANT: This data should NEVER be overwritten by blank or incorrect
 * MMSI values from other sources (API responses, user input, etc.)
 * 
 * Last updated: 2026-01-09
 */

const VESSEL_MMSI_REGISTRY = {
  // ========================================
  // RAN - Royal Australian Navy
  // ========================================
  
  // Canberra Class (LHD)
  'hmas adelaide': { mmsi: '503428000', imo: '9721875', class: 'Canberra Class (LHD)', pennant: 'L01', source: 'MarineTraffic/VesselFinder', confidence: 'high' },
  'hmas canberra': { mmsi: '503778000', imo: '9608960', class: 'Canberra Class (LHD)', pennant: 'L02', source: 'MarineTraffic', confidence: 'high' },
  
  // Hobart Class (DDG)
  'hmas brisbane': { mmsi: '503567000', imo: '9612856', class: 'Hobart Class (DDG)', pennant: 'DDG 41', source: 'MarineTraffic/VesselFinder', confidence: 'high' },
  'hmas sydney': { mmsi: '503618000', imo: '9617697', class: 'Hobart Class (DDG)', pennant: 'DDG 42', source: 'MarineTraffic/VesselFinder', confidence: 'high' },
  'hmas hobart': { mmsi: '503551000', imo: '9612844', class: 'Hobart Class (DDG)', pennant: 'DDG 39', source: 'MarineTraffic', confidence: 'high' },
  
  // ANZAC Class (FFH)
  'hmas toowoomba': { mmsi: '503390000', imo: '9139233', class: 'ANZAC Class (FFH)', pennant: 'FFH 156', source: 'MarineTraffic', confidence: 'high' },
  'hmas warramunga': { mmsi: '503368000', imo: '9087628', class: 'ANZAC Class (FFH)', pennant: 'FFH 152', source: 'MarineTraffic', confidence: 'high' },
  'hmas stuart': { mmsi: '503370000', imo: '9087630', class: 'ANZAC Class (FFH)', pennant: 'FFH 153', source: 'MarineTraffic', confidence: 'high' },
  'hmas arunta': { mmsi: '503365000', imo: '9087616', class: 'ANZAC Class (FFH)', pennant: 'FFH 151', source: 'MarineTraffic', confidence: 'high' },
  'hmas ballarat': { mmsi: '503385000', imo: '9139221', class: 'ANZAC Class (FFH)', pennant: 'FFH 155', source: 'MarineTraffic', confidence: 'high' },
  'hmas perth': { mmsi: '503375000', imo: '9139209', class: 'ANZAC Class (FFH)', pennant: 'FFH 157', source: 'MarineTraffic', confidence: 'high' },
  'hmas parramatta': { mmsi: '503372000', imo: '9139197', class: 'ANZAC Class (FFH)', pennant: 'FFH 154', source: 'MarineTraffic', confidence: 'high' },
  
  // Supply Class (AOR)
  'hmas stalwart': { mmsi: '503171000', imo: '9816933', class: 'Supply Class (AOR)', pennant: 'A304', source: 'MarineTraffic', confidence: 'high' },
  'hmas supply': { mmsi: '503170000', imo: '9816921', class: 'Supply Class (AOR)', pennant: 'A195', source: 'MarineTraffic', confidence: 'high' },
  
  // Bay Class (LSD)
  'hmas choules': { mmsi: '503688000', imo: '9240756', class: 'Bay Class (LSD)', pennant: 'L100', source: 'MarineTraffic', confidence: 'high' },
  
  // Collins Class (SSG) - Submarines - No public MMSI
  'hmas dechaineux': { mmsi: null, imo: null, class: 'Collins Class (SSG)', pennant: 'SSG 76', source: 'Security restricted', confidence: 'n/a', note: 'Submarine - no AIS' },
  'hmas waller': { mmsi: null, imo: null, class: 'Collins Class (SSG)', pennant: 'SSG 75', source: 'Security restricted', confidence: 'n/a', note: 'Submarine - no AIS' },
  'hmas farncomb': { mmsi: null, imo: null, class: 'Collins Class (SSG)', pennant: 'SSG 74', source: 'Security restricted', confidence: 'n/a', note: 'Submarine - no AIS' },
  'hmas collins': { mmsi: null, imo: null, class: 'Collins Class (SSG)', pennant: 'SSG 73', source: 'Security restricted', confidence: 'n/a', note: 'Submarine - no AIS' },
  'hmas sheean': { mmsi: null, imo: null, class: 'Collins Class (SSG)', pennant: 'SSG 77', source: 'Security restricted', confidence: 'n/a', note: 'Submarine - no AIS' },
  'hmas rankin': { mmsi: null, imo: null, class: 'Collins Class (SSG)', pennant: 'SSG 78', source: 'Security restricted', confidence: 'n/a', note: 'Submarine - no AIS' },
  
  // Arafura Class (OPV)
  'hmas arafura': { mmsi: '503695000', imo: '9894485', class: 'Arafura Class (OPV)', pennant: '203', source: 'MarineTraffic', confidence: 'high' },
  
  // ========================================
  // ABF - Australian Border Force (Cape Class)
  // ========================================
  'cape sorell': { mmsi: '503579000', imo: null, class: 'Cape Class (PB)', pennant: 'H543', source: 'AMSA/MarineTraffic', confidence: 'medium' },
  'cape spencer': { mmsi: '503652000', imo: null, class: 'Evolved Cape Class', pennant: 'H819', source: 'AMSA', confidence: 'medium' },
  'cape schanck': { mmsi: '503651000', imo: null, class: 'Evolved Cape Class', pennant: 'H818', source: 'AMSA', confidence: 'medium' },
  'cape hawke': { mmsi: '503580000', imo: '4775380', class: 'Cape Class', pennant: 'P226', source: 'AMSA', confidence: 'medium' },
  
  // ========================================
  // ADV - Australian Defence Vessel
  // ========================================
  'mv sycamore': { mmsi: '503442000', imo: '9758569', class: 'ADV Class', pennant: null, source: 'MarineTraffic', confidence: 'medium' },
  
  // ========================================
  // Commercial - Svitzer Tugs
  // ========================================
  'svitzer abrolhos': { mmsi: '503022400', imo: '9881275', class: 'Traktor 2800-Z', type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  'svitzer cottesloe': { mmsi: '503101300', imo: '1045057', class: 'Damen', type: 'Tug', source: 'MarineTraffic', confidence: 'medium' },
  'svitzer koombana': { mmsi: '503034400', imo: '9905461', class: 'Damen RSD 2513', type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  'svitzer marlston': { mmsi: '503034500', imo: '9920473', class: 'Damen RSD 2513', type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  'svitzer north': { mmsi: '503022200', imo: '9881263', class: 'RAstar 3000-W', type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  'svitzer redhead': { mmsi: '503031800', imo: '9848182', class: 'RAstar 3200', type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  'svitzer tancred': { mmsi: '503012900', imo: '9654127', class: 'Damen', type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  
  // ========================================
  // Commercial - SAAM Towage
  // ========================================
  'saam james point': { mmsi: '316033100', imo: '9901946', class: null, type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  'saam saba': { mmsi: '316026200', imo: '9476379', class: null, type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  
  // ========================================
  // Commercial - Other Tugs
  // ========================================
  'yargan': { mmsi: '503164000', imo: null, class: 'Machinery', type: 'Tug', source: 'AMSA', confidence: 'low' },
  'gurrgura': { mmsi: '503007600', imo: '9635925', class: 'RAstar 3200', type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  'lillian mac': { mmsi: '503044700', imo: '9943035', class: 'Ramparts 2400SX', type: 'Tug', source: 'MarineTraffic', confidence: 'high' },
  
  // ========================================
  // Commercial - Passenger/Expedition
  // ========================================
  'coral adventurer': { mmsi: '503009700', imo: '9838644', class: 'DNV', type: 'Passenger', source: 'MarineTraffic', confidence: 'high' },
  'le soléal': { mmsi: '228359600', imo: '9641675', class: 'Bureau Veritas', type: 'Passenger', source: 'MarineTraffic', confidence: 'high' },
  'le soleal': { mmsi: '228359600', imo: '9641675', class: 'Bureau Veritas', type: 'Passenger', source: 'MarineTraffic', confidence: 'high' }, // Alt spelling
  'pacific explorer': { mmsi: '503765000', imo: '9103996', class: "Lloyd's Register", type: 'Passenger', source: 'MarineTraffic', confidence: 'high' },
  
  // ========================================
  // Commercial - Cargo/Bulk
  // ========================================
  'amis queen': { mmsi: '356997000', imo: '9852676', class: 'Bulk Carrier', type: 'Cargo', source: 'MarineTraffic', confidence: 'high' },
  'berge lyngor': { mmsi: '357591000', imo: '9448011', class: 'Bulk Carrier', type: 'Cargo', source: 'MarineTraffic', confidence: 'high' },
  'nordschelde': { mmsi: '263492000', imo: '9596038', class: 'Cargo', type: 'Cargo', source: 'MarineTraffic', confidence: 'high' },
  'polymnia': { mmsi: '215934000', imo: '9447976', class: 'Cargo', type: 'Cargo', source: 'MarineTraffic', confidence: 'high' },
  'xiamen': { mmsi: '636091984', imo: '9318151', class: 'Container', type: 'Cargo', source: 'MarineTraffic', confidence: 'high' },
  
  // ========================================
  // Commercial - Offshore/Support
  // ========================================
  'daybreak': { mmsi: '503034340', imo: null, class: '2B, 3B', type: 'Offshore', source: 'AMSA', confidence: 'medium' },
  'ocean shield': { mmsi: '503728000', imo: '9628374', class: null, type: 'Offshore', source: 'MarineTraffic', confidence: 'high' },
  'eagle le havre': { mmsi: '227013420', imo: '9795103', class: null, type: 'Tanker', source: 'MarineTraffic', confidence: 'high' },
  'mv offshore solution': { mmsi: '503011700', imo: '9784465', class: 'Other', type: 'Offshore', source: 'MarineTraffic', confidence: 'high' },
  
  // ========================================
  // Commercial - Tankers
  // ========================================
  'ecuadorian vessel': { mmsi: '735059693', imo: '9679634', class: null, type: 'Tanker', source: 'MarineTraffic', confidence: 'medium' },
  'mv absolute': { mmsi: '566814000', imo: '9869447', class: 'Tanker', type: 'Tanker', source: 'MarineTraffic', confidence: 'high' },
};

/**
 * Normalize vessel name for lookup
 * @param {string} name - Vessel name
 * @returns {string} Normalized name
 */
function normalizeVesselName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/[()]/g, '')           // Remove parentheses
    .replace(/\s*-\s*/g, ' ')       // Normalize dashes
    .replace(/h\.m\.a\.s\.?\s*/i, 'hmas ') // Normalize HMAS variants
    .trim();
}

/**
 * Look up vessel MMSI from the authoritative registry
 * @param {string} vesselName - The vessel name to look up
 * @returns {object|null} Registry entry or null if not found
 */
function lookupVessel(vesselName) {
  const normalized = normalizeVesselName(vesselName);
  return VESSEL_MMSI_REGISTRY[normalized] || null;
}

/**
 * Get authoritative MMSI for a vessel
 * Returns the registry MMSI if valid, otherwise returns the provided fallback
 * NEVER returns blank/invalid MMSI if we have a registry entry
 * 
 * @param {string} vesselName - Vessel name
 * @param {string} fallbackMmsi - MMSI from other source (API, etc.)
 * @returns {string|null} The authoritative MMSI
 */
function getAuthoritativeMmsi(vesselName, fallbackMmsi = null) {
  const entry = lookupVessel(vesselName);
  
  // If we have a registry entry with a valid MMSI, always use it
  if (entry && entry.mmsi && entry.mmsi.length === 9) {
    return entry.mmsi;
  }
  
  // If registry says submarine/no AIS, return null (don't use fallback)
  if (entry && entry.note && entry.note.includes('Submarine')) {
    return null;
  }
  
  // If fallback is valid and we don't have a registry entry, use fallback
  if (fallbackMmsi && String(fallbackMmsi).length === 9 && !/^50300\d{4}$/.test(fallbackMmsi)) {
    return String(fallbackMmsi);
  }
  
  return entry?.mmsi || null;
}

/**
 * Get all vessels from the registry
 * @returns {Array} Array of vessel entries with names
 */
function getAllVessels() {
  return Object.entries(VESSEL_MMSI_REGISTRY).map(([name, data]) => ({
    name: name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    ...data
  }));
}

/**
 * Get all valid MMSI numbers for AIS subscription
 * @returns {string[]} Array of valid 9-digit MMSI numbers
 */
function getAllValidMmsiNumbers() {
  return Object.values(VESSEL_MMSI_REGISTRY)
    .filter(v => v.mmsi && v.mmsi.length === 9)
    .map(v => v.mmsi);
}

/**
 * Validate an MMSI number
 * @param {string} mmsi - MMSI to validate
 * @returns {boolean} True if valid
 */
function isValidMmsi(mmsi) {
  if (!mmsi) return false;
  const str = String(mmsi);
  // Must be exactly 9 digits
  if (!/^\d{9}$/.test(str)) return false;
  // Reject known placeholder patterns (503000xxx)
  if (/^50300\d{4}$/.test(str)) return false;
  return true;
}

/**
 * Enrich vessel data with authoritative MMSI
 * Ensures registry MMSI is never overwritten by blank/invalid data
 * 
 * @param {object} vessel - Vessel data from API/database
 * @returns {object} Vessel with authoritative MMSI
 */
function enrichVesselWithAuthoritativeMmsi(vessel) {
  const authMmsi = getAuthoritativeMmsi(vessel.name, vessel.mmsi);
  const entry = lookupVessel(vessel.name);
  
  return {
    ...vessel,
    mmsi: authMmsi || vessel.mmsi,
    // Add registry metadata if available
    _mmsiSource: entry ? 'registry' : (vessel.mmsi ? 'api' : null),
    _mmsiConfidence: entry?.confidence || null,
    // Enrich with IMO if we have it and vessel doesn't
    imo: vessel.imo || entry?.imo || null,
    vesselClass: vessel.vesselClass || vessel.class || entry?.class || null,
  };
}

module.exports = {
  VESSEL_MMSI_REGISTRY,
  normalizeVesselName,
  lookupVessel,
  getAuthoritativeMmsi,
  getAllVessels,
  getAllValidMmsiNumbers,
  isValidMmsi,
  enrichVesselWithAuthoritativeMmsi
};
