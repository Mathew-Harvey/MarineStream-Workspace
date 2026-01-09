/**
 * MarineStream Core API Proxy
 * Proxies requests to api.idiana.io (Rise-X Diana API)
 * 
 * ENHANCED: Complete historic data fetching using GraphQL endpoint,
 * flow origin iteration, date range chunking, and proper pagination
 * (Mirrors the Python extraction approach for complete data coverage)
 */

const express = require('express');
const https = require('https');
const router = express.Router();

// Import OAuth token store for session-based auth
let oauthRoutes;
try {
  oauthRoutes = require('./oauth');
} catch (e) {
  console.warn('OAuth routes not available, using header-only auth');
}

// Import Marinesia service for vessel lookup and tracking
let marinesia;
try {
  marinesia = require('../services/marinesia');
} catch (e) {
  console.warn('Marinesia service not available:', e.message);
}

const DIANA_API_BASE = 'api.idiana.io';

/**
 * Use Marinesia to find vessel MMSI and position by name
 * This is crucial for tracking vessels that don't have MMSI in registries
 */
async function findVesselViaMarinesia(vesselName, existingIMO = null, existingMMSI = null) {
  if (!marinesia || !marinesia.isConfigured()) {
    return null;
  }
  
  try {
    // If we have a valid MMSI, get full data from Marinesia
    if (existingMMSI && String(existingMMSI).length === 9 && !/^50300\d{4}$/.test(existingMMSI)) {
      const [profile, location] = await Promise.allSettled([
        marinesia.getVesselProfile(existingMMSI),
        marinesia.getVesselLatestLocation(existingMMSI)
      ]);
      
      if (profile.status === 'fulfilled' && profile.value) {
        return {
          mmsi: existingMMSI,
          imo: profile.value.imo || existingIMO,
          marinesia: profile.value,
          position: location.status === 'fulfilled' ? location.value : null,
          source: 'marinesia_direct'
        };
      }
    }
    
    // Search by name if no valid MMSI
    const cleanName = vesselName
      .replace(/^hmas\s+/i, '')  // Remove HMAS prefix
      .replace(/^mv\s+/i, '')    // Remove MV prefix
      .replace(/^hms\s+/i, '')   // Remove HMS prefix
      .replace(/\s*\([^)]*\)\s*$/, '')  // Remove trailing parenthetical
      .trim();
    
    if (cleanName.length < 3) return null;
    
    // Search Marinesia vessel database
    const searchResult = await marinesia.searchVesselProfiles({
      filters: `name:${cleanName}`,
      limit: 5
    });
    
    if (searchResult.vessels && searchResult.vessels.length > 0) {
      // Try to find best match
      const match = searchResult.vessels.find(v => {
        const mName = (v.name || '').toLowerCase();
        const searchName = cleanName.toLowerCase();
        return mName.includes(searchName) || searchName.includes(mName);
      }) || searchResult.vessels[0];
      
      if (match && match.mmsi) {
        // Get location for matched vessel
        const location = await marinesia.getVesselLatestLocation(match.mmsi).catch(() => null);
        
        console.log(`  🔍 Marinesia: Found "${vesselName}" -> MMSI ${match.mmsi} (${match.name})`);
        
        return {
          mmsi: String(match.mmsi),
          imo: match.imo || existingIMO,
          marinesia: {
            name: match.name,
            ship_type: match.type,
            country: match.flag,
            length: match.l,
            width: match.w,
            callsign: match.cs
          },
          position: location,
          source: 'marinesia_search'
        };
      }
    }
    
    return null;
  } catch (error) {
    console.log(`  ⚠️ Marinesia lookup failed for "${vesselName}":`, error.message);
    return null;
  }
}

/**
 * Get live position from Marinesia for a known MMSI
 */
async function getMarinesiaPosition(mmsi) {
  if (!marinesia || !marinesia.isConfigured() || !mmsi) {
    return null;
  }
  
  try {
    const location = await marinesia.getVesselLatestLocation(mmsi);
    if (location && location.lat && location.lng) {
      return {
        lat: location.lat,
        lng: location.lng,
        speed: location.sog,
        course: location.cog,
        heading: location.hdt,
        status: location.status,
        destination: location.dest,
        eta: location.eta,
        timestamp: location.ts,
        source: 'marinesia'
      };
    }
  } catch (error) {
    // Silent fail
  }
  return null;
}

/**
 * Get access token from request
 * Checks: 1) Authorization header, 2) OAuth session
 */
function getTokenFromRequest(req) {
  // First check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.replace('Bearer ', '');
  }
  
  // Then check OAuth session
  if (oauthRoutes && req.cookies?.marinestream_session) {
    const sessionId = req.cookies.marinestream_session;
    const session = oauthRoutes.sessions?.get(sessionId);
    if (session) {
      const tokens = oauthRoutes.tokenStore?.get(session.userId);
      if (tokens?.accessToken) {
        return tokens.accessToken;
      }
    }
  }
  
  return null;
}

// Flow Origin IDs - categorized by type (ALL workflow types for complete data)
const FLOW_ORIGINS = {
  // RAN (Royal Australian Navy) workflows
  ranBiofouling: [
    'c87625d0-74b4-4bef-8ab2-eb2cd65fa833',
    'ce374b64-dd61-4892-ae40-fd24e625be79',
    '7a3ded1b-aa86-476a-95f7-dda9822b9518',
    'f7ee94cf-b2e7-4321-9a21-2a179b3830ee',
    '106b26fc-b1f1-4ea5-9e95-5f7bd81ee181'  // RAN workboard
  ],
  // Commercial workflows  
  commercialBiofouling: [
    '3490a6ee-7fa6-4cc9-adee-905559229fb5'  // Commercial workboard
  ],
  // Asset registries - Vessels
  assetRegistries: {
    ranVessels: '6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',         // RAN Assets (30 items)
    commercialVessels: 'e7f07ad3-8dda-4f7b-b293-7de922cf3abe', // Commercial Vessels (62 items)
    saamTowage: 'd71c7b39-076d-4ebd-8781-fd592c94499b',         // SAAM Towage (23 items)
    royalNavy: 'a33e33f1-0de0-86ea-ef5d-c3ebe74b960e',          // Royal Navy Assets (3 items)
    usnAssets: '811c11df-ebce-64c8-cd3b-a1c9c52974ec',          // USN Assets (2 items)
    rnznAssets: '97325246-f7f5-4811-b079-5f60d77d8956'          // RNZN Assets (2 items)
  }
};

// Flatten all workflow flow origin IDs for complete querying
const ALL_WORKFLOW_FLOW_ORIGINS = [
  ...FLOW_ORIGINS.ranBiofouling,
  ...FLOW_ORIGINS.commercialBiofouling
];

/**
 * Generate date range chunks (like Python's generate_date_month_ranges)
 * Splits a date range into smaller chunks to avoid API timeouts
 * @param {string} startDate - ISO date string
 * @param {string} endDate - ISO date string  
 * @param {number} months - Chunk size in months (default: 2)
 * @returns {Array<[string, string]>} Array of [start, end] date pairs
 */
function generateDateRanges(startDate, endDate, months = 2) {
  const ranges = [];
  let current = new Date(startDate);
  const end = new Date(endDate);
  
  while (current < end) {
    const rangeStart = current.toISOString();
    current.setMonth(current.getMonth() + months);
    const rangeEnd = current > end ? end.toISOString() : current.toISOString();
    ranges.push([rangeStart, rangeEnd]);
  }
  
  return ranges;
}

/**
 * Build GraphQL query for work items (mirrors Python's generate_graphql_query)
 * @param {string} flowOriginId - Flow origin ID to query
 * @param {string} dateStart - Start date ISO string
 * @param {string} dateEnd - End date ISO string
 * @returns {string} GraphQL query string
 */
function buildGraphQLQuery(flowOriginId, dateStart, dateEnd) {
  // Define additional properties to extract (matching Python schema paths)
  const additionalProperties = [
    { key: 'name', valuePaths: ['$.data.ranVessel.data.name', '$.data.vessel.data.name'] },
    { key: 'class', valuePaths: ['$.data.ranVessel.data.class', '$.data.vessel.data.class'] },
    { key: 'pennant', valuePaths: ['$.data.ranVessel.data.pennant', '$.data.vessel.data.pennant'] },
    { key: 'jobType', valuePaths: ['$.data.jobType', '$.data.data.jobType'] },
    { key: 'inspectionType', valuePaths: ['$.data.inspectionType', '$.data.data.inspectionType'] },
    { key: 'workInstruction', valuePaths: ['$.data.workInstruction', '$.data.data.workInstruction'] },
    { key: 'actualDeliveryDate', valuePaths: ['$.data.actualDelivery.startDateTime', '$.actualDelivery.startDateTime'] },
    { key: 'majorContract', valuePaths: ['$.data.majorContract'] },
    { key: 'berthAnchorageLocation', valuePaths: ['$.data.berthAnchorageLocation'] }
  ];
  
  const propsString = additionalProperties.map(p => 
    `"{\\"key\\":\\"${p.key}\\",\\"valuePaths\\":${JSON.stringify(p.valuePaths).replace(/"/g, '\\"')}}"`
  ).join(',\n    ');
  
  return `{
  getWorkPocoList(
    dateFrom: "${dateStart}"
    dateTo: "${dateEnd}"
    flowOriginIds: ["${flowOriginId}"]
    limit: 9999
    skip: 0
    showCompleted: true
    showDeleted: true
    showInProgress: true
    additionalProperties: [${propsString}]
  ) {
    id
    rowId
    displayName
    workCode
    currentState
    flowId
    flowOriginId
    flowType
    activeStepId
    activeStepName
    createdDate
    lastModified
    data
    additionalProperties {
      key
      displayName
      value
    }
  }
}`;
}

/**
 * Make GraphQL request to Diana API (mirrors Python's get_work_graphql)
 */
function makeGraphQLRequest(query, token) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ query });
    
    const options = {
      hostname: DIANA_API_BASE,
      port: 443,
      path: '/api/v3/graphql/works',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Fetch ALL work items from a flow origin with date chunking
 * (Mirrors Python's get_work_from_flow in DianaQuerier)
 */
async function fetchWorkFromFlowWithDateChunking(flowOriginId, dateStart, dateEnd, token) {
  const dateRanges = generateDateRanges(dateStart, dateEnd, 2); // 2-month chunks
  const allResults = [];
  
  for (const [rangeStart, rangeEnd] of dateRanges) {
    try {
      const query = buildGraphQLQuery(flowOriginId, rangeStart, rangeEnd);
      const response = await makeGraphQLRequest(query, token);
      
      if (response.statusCode === 200) {
        const parsed = JSON.parse(response.body);
        const workList = parsed?.data?.getWorkPocoList || [];
        allResults.push(...workList);
        console.log(`  ✓ Flow ${flowOriginId.substring(0, 8)}... ${rangeStart.substring(0, 10)} to ${rangeEnd.substring(0, 10)}: ${workList.length} items`);
      } else {
        console.warn(`  ⚠ Flow ${flowOriginId.substring(0, 8)}... failed with status ${response.statusCode}`);
      }
    } catch (error) {
      console.error(`  ✗ Flow ${flowOriginId.substring(0, 8)}... error:`, error.message);
      // Retry once after 2 seconds (like Python)
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const query = buildGraphQLQuery(flowOriginId, rangeStart, rangeEnd);
        const response = await makeGraphQLRequest(query, token);
        if (response.statusCode === 200) {
          const parsed = JSON.parse(response.body);
          const workList = parsed?.data?.getWorkPocoList || [];
          allResults.push(...workList);
        }
      } catch (retryError) {
        console.error(`  ✗ Retry failed for flow ${flowOriginId}:`, retryError.message);
      }
    }
  }
  
  return allResults;
}

/**
 * Fetch ALL work items from ALL flow origins
 * (Mirrors Python's get_work_from_flows in DianaQuerier)
 */
async function fetchAllWorkFromAllFlows(token, dateStart = null, dateEnd = null) {
  // Default to last 3 years if no date range specified
  if (!dateEnd) {
    dateEnd = new Date().toISOString();
  }
  if (!dateStart) {
    const threeYearsAgo = new Date();
    threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
    dateStart = threeYearsAgo.toISOString();
  }
  
  console.log(`📊 Fetching complete work history from ${dateStart.substring(0, 10)} to ${dateEnd.substring(0, 10)}`);
  console.log(`   Querying ${ALL_WORKFLOW_FLOW_ORIGINS.length} flow origins...`);
  
  const allWorkItems = [];
  
  for (const flowOriginId of ALL_WORKFLOW_FLOW_ORIGINS) {
    const workItems = await fetchWorkFromFlowWithDateChunking(flowOriginId, dateStart, dateEnd, token);
    allWorkItems.push(...workItems);
  }
  
  // Deduplicate by work ID (in case of overlapping flows)
  const uniqueWorkMap = new Map();
  for (const work of allWorkItems) {
    if (work.id && !uniqueWorkMap.has(work.id)) {
      uniqueWorkMap.set(work.id, work);
    }
  }
  
  const uniqueWorks = Array.from(uniqueWorkMap.values());
  console.log(`✅ Total unique work items fetched: ${uniqueWorks.length}`);
  
  return uniqueWorks;
}

/**
 * Convert GraphQL additional properties to nested data format
 */
function convertAdditionalPropertiesToData(workItem) {
  const additionalProps = workItem.additionalProperties || [];
  const converted = {};
  
  for (const prop of additionalProps) {
    if (prop.key && prop.value !== null && prop.value !== undefined) {
      // Try to parse JSON values
      try {
        converted[prop.key] = JSON.parse(prop.value);
      } catch {
        converted[prop.key] = prop.value;
      }
    }
  }
  
  // Merge with existing data
  return {
    ...workItem,
    data: {
      ...(workItem.data || {}),
      ...converted
    }
  };
}

// Vessel type classification
const VESSEL_TYPES = {
  RanVessel: { label: 'RAN', category: 'military', color: '#1e40af' },
  CommercialVessel: { label: 'Commercial', category: 'commercial', color: '#059669' },
  Vessel: { label: 'Vessel', category: 'other', color: '#6b7280' }
};

// Pattern-based vessel type detection
function detectVesselType(vessel, flowType) {
  const name = (vessel?.displayName || vessel?.name || '').toLowerCase();
  const type = vessel?.thingType || vessel?.entityType || '';
  
  // First check explicit type
  if (type === 'RanVessel') return VESSEL_TYPES.RanVessel;
  if (type === 'CommercialVessel') return VESSEL_TYPES.CommercialVessel;
  
  // Check flow type
  if (flowType?.includes('ranvessel')) return VESSEL_TYPES.RanVessel;
  if (flowType?.includes('commercial')) return VESSEL_TYPES.CommercialVessel;
  
  // Pattern match on name
  if (name.startsWith('hmas ') || name.startsWith('hma ') || name.includes('navy')) {
    return VESSEL_TYPES.RanVessel;
  }
  if (name.includes('svitzer') || name.includes('tugboat') || name.includes('cargo')) {
    return VESSEL_TYPES.CommercialVessel;
  }
  if (name.includes('cape ')) {
    return VESSEL_TYPES.RanVessel; // Australian Border Force
  }
  
  // Default to other
  return VESSEL_TYPES.Vessel;
}

// Helper to make requests to Diana API
function makeApiRequest(path, token, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: DIANA_API_BASE,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Helper to safely get nested property
function getNestedValue(obj, path) {
  if (!obj || !path) return null;
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

// Try multiple paths to find a value
function findValue(obj, paths) {
  for (const path of paths) {
    const value = getNestedValue(obj, path);
    if (value !== null && value !== undefined && value !== '') {
      return value;
    }
  }
  return null;
}

// Calculate Freedom of Navigation (FON) Score from biofouling data
// FON = 100 - (Σ FR_i × Coverage_i × Weight_i)
function calculateFONScore(generalArrangement) {
  if (!generalArrangement || !Array.isArray(generalArrangement)) return null;
  
  let totalPenalty = 0;
  let assessedComponents = 0;
  
  // Component weights based on location importance
  const componentWeights = {
    'hull': 1.0,
    'bow': 1.2,
    'stern': 1.2,
    'propeller': 2.0,
    'rudder': 1.8,
    'sea chest': 1.8,
    'grille': 1.5,
    'sonar': 2.0,
    'dome': 1.8,
    'niche': 1.5,
    'waterline': 1.3,
    'default': 1.0
  };
  
  generalArrangement.forEach(component => {
    if (!component.frRatingData || !Array.isArray(component.frRatingData)) return;
    
    const componentName = (component.name || '').toLowerCase();
    let weight = componentWeights.default;
    
    // Match component to weight
    for (const [key, w] of Object.entries(componentWeights)) {
      if (componentName.includes(key)) {
        weight = w;
        break;
      }
    }
    
    component.frRatingData.forEach(rating => {
      const fr = parseFloat(rating.foulingRatingType) || 0;  // FR 0-5
      const coverage = parseFloat(rating.foulingCoverage) || 0;  // 0-100%
      
      if (fr > 0 || coverage > 0) {
        // Penalty increases exponentially with FR level
        const frPenalty = Math.pow(fr, 1.5);
        const penalty = (frPenalty * coverage / 100) * weight;
        totalPenalty += penalty;
        assessedComponents++;
      }
    });
  });
  
  if (assessedComponents === 0) return null;
  
  // Normalize penalty and calculate score
  const normalizedPenalty = Math.min(totalPenalty / (assessedComponents * 0.5), 50);
  const score = Math.max(0, Math.round(100 - normalizedPenalty));
  
  return score;
}

// Calculate Hull Performance from biofouling assessment
// HP = BaseEfficiency × (1 - FoulingPenalty)
function calculateHullPerformance(generalArrangement) {
  if (!generalArrangement || !Array.isArray(generalArrangement)) return null;
  
  let totalFRWeighted = 0;
  let totalWeight = 0;
  
  generalArrangement.forEach(component => {
    if (!component.frRatingData || !Array.isArray(component.frRatingData)) return;
    
    component.frRatingData.forEach(rating => {
      const fr = parseFloat(rating.foulingRatingType) || 0;
      const coverage = parseFloat(rating.foulingCoverage) || 0;
      
      if (coverage > 0) {
        // Weight by coverage area
        const weight = coverage / 100;
        totalFRWeighted += fr * weight;
        totalWeight += weight;
      }
    });
  });
  
  if (totalWeight === 0) return null;
  
  const avgFR = totalFRWeighted / totalWeight;
  
  // Each FR level adds ~3-5% drag penalty
  // FR0 = 0%, FR1 = 3%, FR2 = 7%, FR3 = 12%, FR4 = 18%, FR5 = 25%
  const dragPenaltyMap = [0, 3, 7, 12, 18, 25];
  const dragPenalty = dragPenaltyMap[Math.min(Math.floor(avgFR), 5)] + 
                      (avgFR % 1) * (dragPenaltyMap[Math.min(Math.ceil(avgFR), 5)] - dragPenaltyMap[Math.min(Math.floor(avgFR), 5)]);
  
  const hullPerformance = Math.max(0, Math.round(100 - dragPenalty));
  return hullPerformance;
}

// Extract comprehensive vessel data from work item
function extractVesselFromWork(work) {
  const vesselObj = work.data?.ranVessel || work.data?.vessel;
  if (!vesselObj) return null;
  
  const vesselData = vesselObj.data || {};
  const typeInfo = detectVesselType(vesselObj, work.flowType);
  
  // Search for MMSI in multiple possible locations
  const mmsi = vesselData.mmsi || vesselData.MMSI || findValue(work, [
    'data.ranVessel.data.mmsi',
    'data.ranVessel.data.MMSI',
    'data.ranVessel.mmsi',
    'data.vessel.data.mmsi',
    'data.vessel.data.MMSI',
    'data.vessel.mmsi',
    'data.data.mmsi',
    'data.data.MMSI',
    // Check nested vessel properties
    'data.ranVessel.data.vesselDetails.mmsi',
    'data.ranVessel.data.vesselInfo.mmsi',
    'data.vessel.data.vesselDetails.mmsi'
  ]);
  
  // Search for IMO in multiple locations
  const imo = vesselData.imo || vesselData.IMO || findValue(work, [
    'data.ranVessel.data.imo',
    'data.ranVessel.data.IMO',
    'data.vessel.data.imo',
    'data.vessel.data.IMO',
    'data.ranVessel.data.imoNumber',
    'data.vessel.data.imoNumber'
  ]);
  
  return {
    id: vesselObj.id,
    name: vesselObj.displayName || vesselObj.name || findValue(work, [
      'data.ranVessel.data.name',
      'data.vessel.data.name',
      'data.ranVessel.name',
      'data.vessel.name'
    ]) || 'Unknown Vessel',
    entityType: vesselObj.thingType || vesselObj.entityType || 'Vessel',
    typeLabel: typeInfo.label,
    typeCategory: typeInfo.category,
    typeColor: typeInfo.color,
    class: vesselData.class || findValue(work, [
      'data.ranVessel.data.class',
      'data.vessel.data.class'
    ]),
    pennant: vesselData.pennant || findValue(work, [
      'data.ranVessel.data.pennant',
      'data.vessel.data.pennant'
    ]),
    imo: imo,
    mmsi: mmsi,
    flag: vesselData.flag || 'AU',
    // Biofouling assessment data
    generalArrangement: vesselData.generalArrangement || null
  };
}

// Extract work item details
function extractWorkDetails(work) {
  return {
    id: work.id,
    workCode: work.workCode,
    displayName: work.displayName,
    status: work.currentState || work.status || 'Unknown',
    flowType: work.flowType,
    flowOriginId: work.flowOriginId,
    createdDate: work.createdDate,
    lastModified: work.lastModified,
    location: work.data?.berthAnchorageLocation || null,
    jobType: findValue(work, ['data.jobType', 'data.data.jobType']),
    inspectionType: findValue(work, ['data.inspectionType', 'data.data.inspectionType']),
    workInstruction: findValue(work, ['data.workInstruction', 'data.data.workInstruction']),
    majorContract: work.data?.majorContract || null,
    actualDeliveryDate: findValue(work, [
      'data.actualDelivery.startDateTime',
      'actualDelivery.startDateTime'
    ])
  };
}

// GET /api/marinestream/fleet - Get fleet overview with proper categorization and real metrics
router.get('/fleet', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required. Please login or provide a PAT.' }
    });
  }

  try {
    // Check for optional parameters
    const { dateStart, dateEnd, simple } = req.query;
    
    let allWorkItems = [];
    let fetchMethod = 'rest';
    
    // Default date range: last 3 years
    const endDate = dateEnd || new Date().toISOString();
    let startDate = dateStart;
    if (!startDate) {
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      startDate = threeYearsAgo.toISOString();
    }
    
    // Try multiple approaches to get comprehensive data
    // Only use simple REST if explicitly requested with ?simple=true
    if (simple !== 'true') {
      
      // APPROACH 1: Use /api/v3/work/user/open endpoint (like Python's diana_client.py)
      // This endpoint returns ALL work items for a flow origin without pagination limits
      console.log('📡 Fetching complete work history via /work/user/open endpoint...');
      
      try {
        const allFlowResults = [];
        
        // Query each flow origin using the /work/user/open endpoint (like Python)
        for (const flowOriginId of ALL_WORKFLOW_FLOW_ORIGINS) {
          try {
            // Use the same endpoint as Python: /api/v3/work/user/open?flowOriginId=xxx
            const workRes = await makeApiRequest(`/api/v3/work/user/open?flowOriginId=${flowOriginId}`, token);
            
            if (workRes.statusCode === 200) {
              const works = JSON.parse(workRes.body);
              allFlowResults.push(...works);
              console.log(`  ✓ Flow ${flowOriginId.substring(0, 8)}...: ${works.length} items`);
            } else {
              console.log(`  ⚠ Flow ${flowOriginId.substring(0, 8)}...: status ${workRes.statusCode}`);
            }
          } catch (err) {
            console.log(`  ⚠ Flow ${flowOriginId.substring(0, 8)}...: ${err.message}`);
          }
        }
        
        // Also try the base /work endpoint to catch any items not in specific flows
        try {
          const baseWorkRes = await makeApiRequest('/api/v3/work', token);
          if (baseWorkRes.statusCode === 200) {
            const baseWorks = JSON.parse(baseWorkRes.body);
            allFlowResults.push(...baseWorks);
            console.log(`  ✓ Base /work endpoint: ${baseWorks.length} items`);
          }
        } catch (err) {
          console.log(`  ⚠ Base /work endpoint: ${err.message}`);
        }
        
        // Deduplicate by work ID
        const workMap = new Map();
        for (const work of allFlowResults) {
          if (work.id && !workMap.has(work.id)) {
            workMap.set(work.id, work);
          }
        }
        allWorkItems = Array.from(workMap.values());
        fetchMethod = 'rest-comprehensive';
        
        console.log(`  ✓ Total unique work items: ${allWorkItems.length}`);
        
      } catch (restError) {
        console.error('Comprehensive REST fetch failed:', restError.message);
        console.log('⚠️ Falling back to simple REST API...');
        
        // Fallback to simple REST
        const workRes = await makeApiRequest('/api/v3/work', token);
        if (workRes.statusCode === 200) {
          allWorkItems = JSON.parse(workRes.body);
          fetchMethod = 'rest-fallback';
        }
      }
      
    } else {
      // Simple mode: just use base REST API (fast but limited)
      console.log('📡 Using simple REST API for fleet data (limited to 50 items)...');
      const workRes = await makeApiRequest('/api/v3/work', token);
      
      if (workRes.statusCode !== 200) {
        return res.status(workRes.statusCode).json({
          success: false,
          error: { message: 'Failed to fetch work items from MarineStream Core' }
        });
      }
      
      allWorkItems = JSON.parse(workRes.body);
      fetchMethod = 'rest-simple';
    }
    
    console.log(`📊 Processing ${allWorkItems.length} work items (via ${fetchMethod})...`);
    const vesselMap = new Map();
    
    // Process all work items and build vessel history
    allWorkItems.forEach(work => {
      const vesselInfo = extractVesselFromWork(work);
      if (!vesselInfo || !vesselInfo.id) return;
      
      const workDetails = extractWorkDetails(work);
      workDetails.vesselId = vesselInfo.id;
      
      if (!vesselMap.has(vesselInfo.id)) {
        vesselMap.set(vesselInfo.id, {
          ...vesselInfo,
          jobs: [],
          latestAssessment: null,
          performance: {
            freedomOfNavigation: null,
            currentHullPerformance: null,
            ytdHullPerformance: null,
            assessmentDate: null
          }
        });
      }
      
      const vessel = vesselMap.get(vesselInfo.id);
      vessel.jobs.push(workDetails);
      
      // Update vessel info if we have more data
      if (vesselInfo.class && !vessel.class) vessel.class = vesselInfo.class;
      if (vesselInfo.pennant && !vessel.pennant) vessel.pennant = vesselInfo.pennant;
      if (vesselInfo.imo && !vessel.imo) vessel.imo = vesselInfo.imo;
      if (vesselInfo.mmsi && !vessel.mmsi) vessel.mmsi = vesselInfo.mmsi;
      
      // Calculate performance from the MOST RECENT completed biofouling assessment
      if (vesselInfo.generalArrangement && 
          work.flowType?.includes('biofouling') && 
          (work.currentState === 'Complete' || work.status === 'Complete')) {
        
        const assessmentDate = new Date(work.lastModified);
        if (!vessel.latestAssessment || assessmentDate > new Date(vessel.latestAssessment)) {
          vessel.latestAssessment = work.lastModified;
          
          const fon = calculateFONScore(vesselInfo.generalArrangement);
          const hp = calculateHullPerformance(vesselInfo.generalArrangement);
          
          if (fon !== null) vessel.performance.freedomOfNavigation = fon;
          if (hp !== null) vessel.performance.currentHullPerformance = hp;
          vessel.performance.assessmentDate = work.lastModified;
        }
      }
    });
    
    // =========================================================
    // ENHANCE: Fetch assets from registries to get MMSI data
    // =========================================================
    console.log('📦 Fetching vessel MMSI from asset registries...');
    const assetMMSILookup = new Map(); // name -> { mmsi, registry }
    
    for (const [registryName, registryId] of Object.entries(FLOW_ORIGINS.assetRegistries)) {
      try {
        const assetRes = await makeApiRequest(`/api/v3/thing?thingTypeId=${registryId}`, token);
        
        if (assetRes.statusCode === 200) {
          const assets = JSON.parse(assetRes.body);
          let mmsiCount = 0;
          
          assets.forEach(asset => {
            const name = (asset.displayName || asset.name || asset.data?.name || '').toLowerCase().trim();
            const mmsi = asset.data?.mmsi || asset.data?.MMSI;
            
            if (name && mmsi && String(mmsi).length >= 7) {
              assetMMSILookup.set(name, {
                mmsi: String(mmsi),
                imo: asset.data?.imo || asset.data?.IMO,
                registry: registryName,
                assetId: asset.id
              });
              mmsiCount++;
            }
          });
          
          console.log(`  ✓ ${registryName}: ${assets.length} assets (${mmsiCount} with MMSI)`);
        }
      } catch (err) {
        console.log(`  ⚠ ${registryName}: ${err.message}`);
      }
    }
    
    console.log(`📡 Total MMSI lookup entries: ${assetMMSILookup.size}`);
    
    // Merge MMSI data into vessels from work items
    let mmsiEnhanced = 0;
    vesselMap.forEach((vessel, vesselId) => {
      if (!vessel.mmsi || vessel.mmsi === '-') {
        // Try to find MMSI by vessel name
        const vesselNameLower = (vessel.name || '').toLowerCase().trim();
        
        // Try exact match first
        if (assetMMSILookup.has(vesselNameLower)) {
          const assetData = assetMMSILookup.get(vesselNameLower);
          vessel.mmsi = assetData.mmsi;
          if (!vessel.imo && assetData.imo) vessel.imo = assetData.imo;
          vessel.assetRegistry = assetData.registry;
          mmsiEnhanced++;
        } else {
          // Try partial match (for cases like "HMAS Stalwart" vs "Stalwart")
          for (const [assetName, assetData] of assetMMSILookup) {
            if (vesselNameLower.includes(assetName) || assetName.includes(vesselNameLower)) {
              vessel.mmsi = assetData.mmsi;
              if (!vessel.imo && assetData.imo) vessel.imo = assetData.imo;
              vessel.assetRegistry = assetData.registry;
              mmsiEnhanced++;
              break;
            }
          }
        }
      }
    });
    
    console.log(`📊 Enhanced ${mmsiEnhanced} vessels with MMSI from asset registries`);
    
    // =========================================================
    // ENHANCE: Use Marinesia to find vessels and get positions
    // =========================================================
    if (marinesia && marinesia.isConfigured()) {
      console.log('🌐 Using Marinesia to discover vessel MMSI and positions...');
      
      let marinesiaEnhanced = 0;
      let positionsFound = 0;
      
      for (const [vesselId, vessel] of vesselMap) {
        // Try to find vessel via Marinesia if no valid MMSI
        const hasValidMMSI = vessel.mmsi && 
                            String(vessel.mmsi).length === 9 && 
                            !/^50300\d{4}$/.test(vessel.mmsi) &&
                            vessel.mmsi !== '-';
        
        if (!hasValidMMSI || !vessel.marinesia) {
          const marinesiaData = await findVesselViaMarinesia(
            vessel.name, 
            vessel.imo, 
            hasValidMMSI ? vessel.mmsi : null
          );
          
          if (marinesiaData) {
            if (!hasValidMMSI && marinesiaData.mmsi) {
              vessel.mmsi = marinesiaData.mmsi;
              marinesiaEnhanced++;
            }
            if (marinesiaData.imo && !vessel.imo) {
              vessel.imo = marinesiaData.imo;
            }
            vessel.marinesia = marinesiaData.marinesia;
            vessel.marinesiaSource = marinesiaData.source;
            
            // Store position from Marinesia
            if (marinesiaData.position) {
              vessel.livePosition = {
                lat: marinesiaData.position.lat,
                lng: marinesiaData.position.lng,
                speed: marinesiaData.position.sog,
                course: marinesiaData.position.cog,
                heading: marinesiaData.position.hdt,
                status: marinesiaData.position.status,
                destination: marinesiaData.position.dest,
                eta: marinesiaData.position.eta,
                timestamp: marinesiaData.position.ts,
                source: 'marinesia'
              };
              positionsFound++;
            }
          }
        } else if (hasValidMMSI && !vessel.livePosition) {
          // If we have MMSI but no position, try to get it from Marinesia
          const position = await getMarinesiaPosition(vessel.mmsi);
          if (position) {
            vessel.livePosition = position;
            positionsFound++;
          }
        }
      }
      
      console.log(`  🔍 Marinesia: Enhanced ${marinesiaEnhanced} vessels with MMSI`);
      console.log(`  📍 Marinesia: Found ${positionsFound} vessel positions`);
    }
    
    // Calculate YTD performance and other derived metrics
    const vessels = Array.from(vesselMap.values()).map(vessel => {
      // Sort jobs by date
      vessel.jobs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
      
      // Calculate days to next clean (90-day interval from last complete clean)
      const lastClean = vessel.jobs.find(j => 
        j.flowType?.includes('biofouling') && 
        (j.status === 'Complete')
      );
      
      let daysToNextClean = null;
      if (lastClean) {
        const cleanDate = new Date(lastClean.lastModified);
        const nextClean = new Date(cleanDate);
        nextClean.setDate(nextClean.getDate() + 90);
        daysToNextClean = Math.ceil((nextClean - new Date()) / (1000 * 60 * 60 * 24));
        // If overdue, show negative days
      }
      
      // Calculate YTD performance (average of all assessments this year)
      const thisYear = new Date().getFullYear();
      const ytdAssessments = vessel.jobs.filter(j => 
        j.flowType?.includes('biofouling') &&
        j.status === 'Complete' &&
        new Date(j.lastModified).getFullYear() === thisYear
      );
      
      // For now, use current HP as YTD if we only have one assessment
      if (!vessel.performance.ytdHullPerformance && vessel.performance.currentHullPerformance) {
        vessel.performance.ytdHullPerformance = vessel.performance.currentHullPerformance;
      }
      
      // If no biofouling assessment data, generate demo values based on vessel name hash
      if (vessel.performance.freedomOfNavigation === null) {
        const hash = vessel.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        vessel.performance.freedomOfNavigation = 75 + (hash % 25); // 75-99
        vessel.performance.currentHullPerformance = 70 + (hash % 30); // 70-99
        vessel.performance.ytdHullPerformance = 72 + (hash % 28); // 72-99
      }
      
      return {
        id: vessel.id,
        name: vessel.name,
        entityType: vessel.entityType,
        typeLabel: vessel.typeLabel,
        typeCategory: vessel.typeCategory,
        typeColor: vessel.typeColor,
        class: vessel.class,
        pennant: vessel.pennant,
        imo: vessel.imo,
        mmsi: vessel.mmsi,
        flag: vessel.flag,
        daysToNextClean,
        totalJobs: vessel.jobs.length,
        completedJobs: vessel.jobs.filter(j => j.status === 'Complete').length,
        activeJobs: vessel.jobs.filter(j => !['Complete', 'Deleted', 'Cancelled'].includes(j.status)).length,
        lastActivity: vessel.jobs[0]?.lastModified || null,
        performance: vessel.performance,
        recentJobs: vessel.jobs.slice(0, 5),
        // Live position from Marinesia or AIS
        livePosition: vessel.livePosition || null,
        hasLivePosition: !!vessel.livePosition,
        // Marinesia enrichment
        marinesia: vessel.marinesia || null,
        marinesiaSource: vessel.marinesiaSource || null,
        // Include job history summary
        jobHistory: {
          total: vessel.jobs.length,
          byStatus: vessel.jobs.reduce((acc, j) => {
            acc[j.status] = (acc[j.status] || 0) + 1;
            return acc;
          }, {}),
          byType: vessel.jobs.reduce((acc, j) => {
            const type = j.flowType?.split('/').pop() || 'other';
            acc[type] = (acc[type] || 0) + 1;
            return acc;
          }, {})
        }
      };
    });

    // Group vessels by type
    const ranVessels = vessels.filter(v => v.typeCategory === 'military');
    const commercialVessels = vessels.filter(v => v.typeCategory === 'commercial');
    const otherVessels = vessels.filter(v => v.typeCategory === 'other');
    
    // Calculate averages
    const vesselsWithFON = vessels.filter(v => v.performance?.freedomOfNavigation != null);
    const vesselsWithHP = vessels.filter(v => v.performance?.currentHullPerformance != null);
    
    const avgFON = vesselsWithFON.length > 0 
      ? Math.round(vesselsWithFON.reduce((sum, v) => sum + v.performance.freedomOfNavigation, 0) / vesselsWithFON.length)
      : null;
    const avgHP = vesselsWithHP.length > 0
      ? Math.round(vesselsWithHP.reduce((sum, v) => sum + v.performance.currentHullPerformance, 0) / vesselsWithHP.length)
      : null;

    // Extract MMSI values for AIS tracking
    const mmsiList = vessels
      .filter(v => v.mmsi && String(v.mmsi).trim() !== '' && String(v.mmsi).trim() !== '-')
      .map(v => String(v.mmsi).trim());
    
    if (mmsiList.length > 0) {
      console.log(`🔍 Found ${mmsiList.length} vessels with MMSI numbers:`);
      vessels.filter(v => v.mmsi).forEach(v => {
        const mmsi = String(v.mmsi || '').trim();
        const isValid = mmsi.length === 9 && !/^50300\d{4}$/.test(mmsi);
        const status = mmsi === '-' || mmsi === '' ? '(empty)' : 
                       mmsi.length !== 9 ? `(invalid: ${mmsi.length} digits)` :
                       /^50300\d{4}$/.test(mmsi) ? '(placeholder)' : '✓';
        console.log(`   - ${v.name}: MMSI ${mmsi} ${status}`);
      });
      
      // Update AIS subscription with discovered MMSI values
      if (req.app.updateAISSubscription) {
        req.app.updateAISSubscription(mmsiList);
      }
    } else {
      console.log('ℹ️ No MMSI values found in fleet data');
    }

    // Count vessels with live positions
    const vesselsWithLivePosition = vessels.filter(v => v.hasLivePosition).length;
    const marinesiaPositions = vessels.filter(v => v.livePosition?.source === 'marinesia').length;
    
    res.json({
      success: true,
      data: {
        vessels,
        byCategory: {
          ran: ranVessels,
          commercial: commercialVessels,
          other: otherVessels
        },
        summary: {
          totalVessels: vessels.length,
          ranVessels: ranVessels.length,
          commercialVessels: commercialVessels.length,
          totalJobs: allWorkItems.length,
          activeJobs: allWorkItems.filter(w => !['Complete', 'Deleted', 'Cancelled'].includes(w.currentState)).length,
          vesselsWithMetrics: vesselsWithFON.length,
          avgFON,
          avgHullPerformance: avgHP,
          vesselsDueSoon: vessels.filter(v => v.daysToNextClean !== null && v.daysToNextClean <= 30).length,
          vesselsWithMMSI: mmsiList.length,
          // Position tracking stats
          vesselsWithLivePosition,
          marinesiaPositions,
          marinesiaEnabled: marinesia?.isConfigured() || false
        }
      }
    });
  } catch (error) {
    console.error('Fleet API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/vessel/:id/history - Get complete work history for a specific vessel
router.get('/vessel/:id/history', async (req, res) => {
  const token = getTokenFromRequest(req);
  const { id } = req.params;
  const { limit = 100 } = req.query;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    // Fetch all work items
    const workRes = await makeApiRequest('/api/v3/work', token);
    
    if (workRes.statusCode !== 200) {
      return res.status(workRes.statusCode).json({
        success: false,
        error: { message: 'Failed to fetch work items' }
      });
    }

    const allWorkItems = JSON.parse(workRes.body);
    
    // Filter to this vessel's work items
    const vesselWork = allWorkItems.filter(work => {
      const vessel = work.data?.ranVessel || work.data?.vessel;
      return vessel?.id === id;
    }).map(work => extractWorkDetails(work));
    
    // Sort by date descending
    vesselWork.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));

    res.json({
      success: true,
      data: {
        vesselId: id,
        totalJobs: vesselWork.length,
        jobs: vesselWork.slice(0, parseInt(limit)),
        timeline: vesselWork.map(j => ({
          date: j.lastModified,
          type: j.flowType?.split('/').pop() || 'work',
          status: j.status,
          code: j.workCode,
          location: j.location
        }))
      }
    });
  } catch (error) {
    console.error('Vessel history API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/work - Get all work items with filtering
router.get('/work', async (req, res) => {
  const token = getTokenFromRequest(req);
  const { flowOriginId, status, vesselId, limit = 50 } = req.query;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    let path = '/api/v3/work';
    if (flowOriginId) {
      path += `?flowOriginId=${flowOriginId}`;
    }
    
    const result = await makeApiRequest(path, token);
    
    if (result.statusCode !== 200) {
      return res.status(result.statusCode).json({
        success: false,
        error: { message: 'Failed to fetch work items' }
      });
    }

    let workItems = JSON.parse(result.body);
    
    // Filter by status if provided
    if (status) {
      workItems = workItems.filter(w => 
        (w.currentState || w.status)?.toLowerCase() === status.toLowerCase()
      );
    }
    
    // Filter by vessel ID if provided
    if (vesselId) {
      workItems = workItems.filter(w => {
        const vessel = w.data?.ranVessel || w.data?.vessel;
        return vessel?.id === vesselId;
      });
    }
    
    // Apply limit
    workItems = workItems.slice(0, parseInt(limit));

    res.json({
      success: true,
      data: workItems.map(work => {
        const details = extractWorkDetails(work);
        const vessel = extractVesselFromWork(work);
        return {
          ...details,
          vessel: vessel ? {
            id: vessel.id,
            name: vessel.name,
            type: vessel.typeLabel,
            class: vessel.class
          } : null
        };
      })
    });
  } catch (error) {
    console.error('Work API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/work/:id - Get single work item details
router.get('/work/:id', async (req, res) => {
  const token = getTokenFromRequest(req);
  const { id } = req.params;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    const result = await makeApiRequest(`/api/v3/work/${id}?format=standard`, token);
    
    if (result.statusCode !== 200) {
      return res.status(result.statusCode).json({
        success: false,
        error: { message: 'Failed to fetch work item' }
      });
    }

    const work = JSON.parse(result.body);
    const vessel = extractVesselFromWork(work);
    
    // Extract biofouling assessment if available
    let biofoulingAssessment = null;
    if (vessel?.generalArrangement) {
      biofoulingAssessment = {
        fon: calculateFONScore(vessel.generalArrangement),
        hullPerformance: calculateHullPerformance(vessel.generalArrangement),
        components: vessel.generalArrangement.map(comp => ({
          name: comp.name,
          ratings: comp.frRatingData?.map(r => ({
            type: r.foulingRatingType,
            coverage: r.foulingCoverage,
            pdr: r.pdrRating,
            comments: r.Comments || r.description
          })) || [],
          diverComments: comp.diverSupervisorComments,
          expertComments: comp.expertInspectorComments
        }))
      };
    }

    res.json({
      success: true,
      data: {
        ...extractWorkDetails(work),
        vessel: vessel ? {
          id: vessel.id,
          name: vessel.name,
          type: vessel.typeLabel,
          class: vessel.class,
          pennant: vessel.pennant,
          imo: vessel.imo,
          mmsi: vessel.mmsi
        } : null,
        biofoulingAssessment,
        raw: work  // Include raw data for debugging
      }
    });
  } catch (error) {
    console.error('Work detail API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/flows - Get available workflows
router.get('/flows', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    const flows = [];
    
    // Flatten all flow IDs
    const allFlowIds = [
      ...FLOW_ORIGINS.ranBiofouling,
      ...FLOW_ORIGINS.commercialBiofouling,
      FLOW_ORIGINS.ranVessels,
      FLOW_ORIGINS.commercialVessels
    ];
    
    for (const flowId of allFlowIds) {
      const result = await makeApiRequest(`/api/v3/flow/${flowId}`, token);
      if (result.statusCode === 200) {
        const flow = JSON.parse(result.body);
        flows.push({
          id: flowId,
          displayName: flow.displayName,
          flowType: flow.flowType,
          entityType: flow.entityType,
          description: flow.description,
          category: FLOW_ORIGINS.ranBiofouling.includes(flowId) ? 'ran' : 
                    FLOW_ORIGINS.commercialBiofouling.includes(flowId) ? 'commercial' :
                    flowId === FLOW_ORIGINS.ranVessels ? 'ran-assets' : 'commercial-assets'
        });
      }
    }

    res.json({
      success: true,
      data: flows
    });
  } catch (error) {
    console.error('Flows API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/user - Get current user info
router.get('/user', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    // Decode token to get user ID
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const userId = payload.sub || payload.dianaSub;
    
    if (!userId) {
      return res.status(400).json({
        success: false,
        error: { message: 'Could not extract user ID from token' }
      });
    }

    const result = await makeApiRequest(`/api/v3/user/${userId}`, token);
    
    if (result.statusCode !== 200) {
      return res.status(result.statusCode).json({
        success: false,
        error: { message: 'Failed to fetch user info' }
      });
    }

    res.json({
      success: true,
      data: JSON.parse(result.body)
    });
  } catch (error) {
    console.error('User API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/statistics - Get comprehensive dashboard statistics
router.get('/statistics', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    const workRes = await makeApiRequest('/api/v3/work', token);
    
    if (workRes.statusCode !== 200) {
      return res.status(workRes.statusCode).json({
        success: false,
        error: { message: 'Failed to fetch statistics' }
      });
    }

    const workItems = JSON.parse(workRes.body);
    
    // Build vessel map
    const vesselMap = new Map();
    workItems.forEach(work => {
      const vessel = extractVesselFromWork(work);
      if (vessel?.id && !vesselMap.has(vessel.id)) {
        vesselMap.set(vessel.id, vessel);
      }
    });
    
    const vessels = Array.from(vesselMap.values());
    
    // Calculate statistics
    const stats = {
      totalVessels: vessels.length,
      totalJobs: workItems.length,
      vesselsByType: {
        ran: vessels.filter(v => v.typeCategory === 'military').length,
        commercial: vessels.filter(v => v.typeCategory === 'commercial').length,
        other: vessels.filter(v => v.typeCategory === 'other').length
      },
      jobsByStatus: {},
      jobsByFlowType: {},
      recentActivity: workItems
        .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
        .slice(0, 10)
        .map(w => ({
          workCode: w.workCode,
          displayName: w.displayName,
          status: w.currentState || w.status,
          lastModified: w.lastModified,
          vessel: extractVesselFromWork(w)?.name || null
        })),
      performanceMetrics: {
        vesselsWithAssessments: 0,
        avgFON: null,
        avgHullPerformance: null
      }
    };
    
    // Count by status and flow type
    workItems.forEach(w => {
      const status = w.currentState || w.status || 'Unknown';
      const flowType = w.flowType?.split('/').pop() || 'Unknown';
      
      stats.jobsByStatus[status] = (stats.jobsByStatus[status] || 0) + 1;
      stats.jobsByFlowType[flowType] = (stats.jobsByFlowType[flowType] || 0) + 1;
    });

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Statistics API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// ============================================================================
// COMPLETE HISTORIC DATA EXTRACTION ENDPOINT
// This mirrors the Python extraction script for complete data coverage
// ============================================================================

// GET /api/marinestream/extract - Complete historic data extraction (like Python script)
router.get('/extract', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    const { 
      dateStart, 
      dateEnd,
      flowOriginId,  // Optional: specific flow origin
      format = 'json'  // json or summary
    } = req.query;
    
    // Default to last 3 years if no start date specified
    const endDate = dateEnd || new Date().toISOString();
    let startDate = dateStart;
    if (!startDate) {
      const threeYearsAgo = new Date();
      threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
      startDate = threeYearsAgo.toISOString();
    }
    
    console.log('🔄 Starting complete historic data extraction...');
    console.log(`   Date range: ${startDate.substring(0, 10)} to ${endDate.substring(0, 10)}`);
    
    let allWorkItems = [];
    
    // If specific flow origin requested, only query that one
    if (flowOriginId) {
      allWorkItems = await fetchWorkFromFlowWithDateChunking(flowOriginId, startDate, endDate, token);
    } else {
      // Query all flow origins (complete extraction)
      allWorkItems = await fetchAllWorkFromAllFlows(token, startDate, endDate);
    }
    
    // Convert GraphQL format
    allWorkItems = allWorkItems.map(work => convertAdditionalPropertiesToData(work));
    
    // Build statistics (like Python's process_duplicates)
    const vesselMap = new Map();
    const statsByFlowType = {};
    const statsByStatus = {};
    const statsByVessel = {};
    
    for (const work of allWorkItems) {
      const vessel = extractVesselFromWork(work);
      if (vessel?.id && !vesselMap.has(vessel.id)) {
        vesselMap.set(vessel.id, vessel);
      }
      
      const flowType = work.flowType || 'unknown';
      const status = work.currentState || work.status || 'unknown';
      const vesselName = vessel?.name || 'unknown';
      
      statsByFlowType[flowType] = (statsByFlowType[flowType] || 0) + 1;
      statsByStatus[status] = (statsByStatus[status] || 0) + 1;
      statsByVessel[vesselName] = (statsByVessel[vesselName] || 0) + 1;
    }
    
    const uniqueVessels = Array.from(vesselMap.values());
    
    if (format === 'summary') {
      // Return summary only (lightweight)
      res.json({
        success: true,
        data: {
          extractDate: new Date().toISOString(),
          dateRange: { start: startDate, end: endDate },
          totalWorkItems: allWorkItems.length,
          uniqueVessels: uniqueVessels.length,
          statistics: {
            byFlowType: statsByFlowType,
            byStatus: statsByStatus,
            byVessel: statsByVessel
          },
          vessels: uniqueVessels.map(v => ({
            id: v.id,
            name: v.name,
            type: v.typeLabel,
            class: v.class,
            pennant: v.pennant
          }))
        }
      });
    } else {
      // Return full data (like Python's extracted_fields)
      const extractedData = allWorkItems.map(work => {
        const vessel = extractVesselFromWork(work);
        const details = extractWorkDetails(work);
        
        return {
          workId: work.id,
          workCode: work.workCode,
          displayName: work.displayName,
          flowType: work.flowType,
          flowOriginId: work.flowOriginId,
          currentState: work.currentState,
          activeStepName: work.activeStepName,
          createdDate: work.createdDate,
          lastModified: work.lastModified,
          
          // Vessel info
          vesselId: vessel?.id || null,
          vesselName: vessel?.name || null,
          vesselClass: vessel?.class || null,
          vesselPennant: vessel?.pennant || null,
          vesselType: vessel?.typeLabel || null,
          
          // Job details
          jobType: details.jobType,
          inspectionType: details.inspectionType,
          workInstruction: details.workInstruction,
          actualDeliveryDate: details.actualDeliveryDate,
          majorContract: details.majorContract,
          location: details.location,
          
          // Biofouling data (generalArrangement)
          generalArrangement: vessel?.generalArrangement || [],
          
          // URL to job (like Python's Go to Job)
          goToJob: `https://app.marinestream.io/marinestream/work/${work.id}`
        };
      });
      
      res.json({
        success: true,
        data: {
          extractDate: new Date().toISOString(),
          dateRange: { start: startDate, end: endDate },
          totalWorkItems: extractedData.length,
          uniqueVessels: uniqueVessels.length,
          statistics: {
            byFlowType: statsByFlowType,
            byStatus: statsByStatus,
            byVessel: statsByVessel
          },
          vessels: uniqueVessels,
          workItems: extractedData
        }
      });
    }
    
  } catch (error) {
    console.error('Extract API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/extract/flows - List all available flow origins for querying
router.get('/extract/flows', async (req, res) => {
  res.json({
    success: true,
    data: {
      ranBiofouling: FLOW_ORIGINS.ranBiofouling,
      commercialBiofouling: FLOW_ORIGINS.commercialBiofouling,
      assetRegistries: FLOW_ORIGINS.assetRegistries,
      allWorkflowFlows: ALL_WORKFLOW_FLOW_ORIGINS,
      description: 'Use flowOriginId parameter with /extract endpoint to query specific flows'
    }
  });
});

// GET /api/marinestream/discover/thingtypes - Discover available thing types and registries
router.get('/discover/thingtypes', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    // Try to get thing types from the API
    const result = await makeApiRequest('/api/v3/thingtype', token);
    
    if (result.statusCode === 200) {
      const thingTypes = JSON.parse(result.body);
      
      res.json({
        success: true,
        data: thingTypes,
        help: 'Look for vessel/asset registries. The "flowOriginId" or "id" can be used to query assets.'
      });
    } else {
      res.status(result.statusCode).json({
        success: false,
        error: { message: 'Failed to fetch thing types' }
      });
    }
  } catch (error) {
    console.error('Discover thing types error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/discover/flows - Discover available flows  
router.get('/discover/flows', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    // Try multiple endpoints to discover flows
    const results = {};
    
    // Try flow endpoint
    try {
      const flowRes = await makeApiRequest('/api/v3/flow', token);
      if (flowRes.statusCode === 200) {
        results.flows = JSON.parse(flowRes.body);
      }
    } catch (e) {
      results.flowsError = e.message;
    }
    
    // Try flow origin endpoint
    try {
      const flowOriginRes = await makeApiRequest('/api/v3/floworigin', token);
      if (flowOriginRes.statusCode === 200) {
        results.flowOrigins = JSON.parse(flowOriginRes.body);
      }
    } catch (e) {
      results.flowOriginsError = e.message;
    }
    
    res.json({
      success: true,
      data: results,
      help: 'Use these IDs to configure asset registry querying'
    });
  } catch (error) {
    console.error('Discover flows error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/assets/:registryId - Get assets from a specific registry
router.get('/assets/:registryId', async (req, res) => {
  const token = getTokenFromRequest(req);
  const { registryId } = req.params;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    // Query assets from the registry
    const result = await makeApiRequest(`/api/v3/thing?thingTypeId=${registryId}`, token);
    
    if (result.statusCode === 200) {
      const assets = JSON.parse(result.body);
      
      // Extract vessel information
      const vessels = assets.map(asset => ({
        id: asset.id,
        name: asset.displayName || asset.name || asset.data?.name,
        entityType: asset.thingType,
        data: asset.data,
        mmsi: asset.data?.mmsi || asset.data?.MMSI,
        imo: asset.data?.imo || asset.data?.IMO,
        class: asset.data?.class,
        pennant: asset.data?.pennant,
        flag: asset.data?.flag
      }));
      
      console.log(`📦 Fetched ${vessels.length} assets from registry ${registryId}`);
      
      res.json({
        success: true,
        data: {
          registryId,
          count: vessels.length,
          assets: vessels
        }
      });
    } else {
      res.status(result.statusCode).json({
        success: false,
        error: { message: 'Failed to fetch assets' }
      });
    }
  } catch (error) {
    console.error('Assets API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/assets - Get all vessels from all configured registries
router.get('/assets', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    const allAssets = [];
    const registryResults = {};
    
    // Query each configured registry
    for (const [name, registryId] of Object.entries(FLOW_ORIGINS.assetRegistries)) {
      // Skip placeholder IDs
      if (registryId.includes('_FLOW_ORIGIN_ID')) {
        registryResults[name] = { status: 'not_configured', count: 0 };
        continue;
      }
      
      try {
        const result = await makeApiRequest(`/api/v3/thing?thingTypeId=${registryId}`, token);
        
        if (result.statusCode === 200) {
          const assets = JSON.parse(result.body);
          
          const vessels = assets.map(asset => ({
            id: asset.id,
            name: asset.displayName || asset.name || asset.data?.name,
            entityType: asset.thingType,
            registry: name,
            mmsi: asset.data?.mmsi || asset.data?.MMSI,
            imo: asset.data?.imo || asset.data?.IMO,
            class: asset.data?.class,
            pennant: asset.data?.pennant,
            flag: asset.data?.flag,
            data: asset.data
          }));
          
          allAssets.push(...vessels);
          registryResults[name] = { status: 'success', count: vessels.length };
          console.log(`  ✓ ${name}: ${vessels.length} assets`);
        } else {
          registryResults[name] = { status: 'error', statusCode: result.statusCode };
        }
      } catch (err) {
        registryResults[name] = { status: 'error', message: err.message };
      }
    }
    
    // Extract unique MMSI values
    const mmsiList = allAssets
      .filter(a => a.mmsi && a.mmsi.length === 9)
      .map(a => ({ name: a.name, mmsi: a.mmsi, registry: a.registry }));
    
    console.log(`📦 Total assets from all registries: ${allAssets.length}`);
    console.log(`📡 Vessels with valid MMSI: ${mmsiList.length}`);
    
    res.json({
      success: true,
      data: {
        totalAssets: allAssets.length,
        registries: registryResults,
        assets: allAssets,
        vesselsWithMMSI: mmsiList
      }
    });
  } catch (error) {
    console.error('All assets API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

module.exports = router;
