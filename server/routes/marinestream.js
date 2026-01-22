/**
 * MarineStream Core API Proxy
 * Proxies requests to api.idiana.io (Rise-X Diana API)
 * 
 * API STRATEGY:
 * - REST API (recommended): Used for most endpoints - work queries, asset queries,
 *   flow origins, user info, and creating new work items. REST endpoints follow
 *   the pattern: GET/POST /api/v3/{resource}
 * 
 * - GraphQL API (historic extraction only): Used ONLY for the /extract endpoint
 *   which mirrors the Python extraction script for complete historic data coverage.
 *   GraphQL is used here because it can efficiently extract nested/complex data
 *   structures (like generalArrangement with fouling ratings) in a single query.
 *   Endpoint: POST /api/v3/graphql/works
 * 
 * All new endpoints should use REST API calls via makeApiRequest().
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

// Import authoritative MMSI registry - NEVER overwrite with blank/invalid data
let mmsiRegistry;
try {
  mmsiRegistry = require('../data/vesselMmsiRegistry');
  console.log(`✓ Loaded authoritative MMSI registry with ${mmsiRegistry.getAllValidMmsiNumbers().length} vessels`);
} catch (e) {
  console.warn('MMSI Registry not available:', e.message);
  mmsiRegistry = null;
}

// Import static vessel positions for fallback when live tracking unavailable
let staticPositions;
try {
  staticPositions = require('../data/vesselStaticPositions');
  console.log(`✓ Loaded static vessel positions database`);
} catch (e) {
  console.warn('Static positions not available:', e.message);
  staticPositions = null;
}

// Import Hull Fouling Calculator for performance predictions
let foulingCalculator;
try {
  foulingCalculator = require('../lib/fouling-calculator');
  console.log(`✓ Loaded Hull Fouling Calculator module`);
} catch (e) {
  console.warn('Fouling Calculator not available:', e.message);
  foulingCalculator = null;
}

const DIANA_API_BASE = 'api.idiana.io';

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
 * Generate array paths with index expansion (mirrors Python's handle_nested_paths)
 * Expands paths like 'data.generalArrangement[].items[]' into indexed paths
 * 
 * @param {string} basePath - Base path with [] markers for arrays
 * @param {string} key - Key prefix for the property
 * @param {Array<number>} maxElements - Max elements for each array level
 * @returns {Array} Array of expanded path objects
 */
function expandArrayPaths(basePath, key, maxElements = [10, 5]) {
  const paths = [];
  
  // Find all [] markers in the path
  const parts = basePath.split('[]');
  
  if (parts.length === 1) {
    // No array markers, return single path
    return [{ key, valuePaths: [`$.${basePath}`] }];
  }
  
  // Generate all combinations of indices
  function generateCombinations(depth, indices) {
    if (depth >= parts.length - 1) {
      // Build the full path with indices
      let fullPath = '$';
      for (let i = 0; i < parts.length; i++) {
        fullPath += parts[i];
        if (i < indices.length) {
          fullPath += `[${indices[i]}]`;
        }
      }
      const indexStr = indices.join('_');
      paths.push({
        key: `${key}_${indexStr}`,
        valuePaths: [fullPath]
      });
      return;
    }
    
    const maxForLevel = maxElements[depth] || 5;
    for (let i = 0; i < maxForLevel; i++) {
      generateCombinations(depth + 1, [...indices, i]);
    }
  }
  
  generateCombinations(0, []);
  return paths;
}

/**
 * Build GraphQL query for work items (mirrors Python's generate_graphql_query)
 * ENHANCED: Includes generalArrangement extraction with array path expansion
 * 
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
    // Delivery dates - both actual and forecast
    { key: 'actualDeliveryDate', valuePaths: ['$.data.actualDelivery.startDateTime', '$.actualDelivery.startDateTime', '$.data.actualDateOfDelivery'] },
    { key: 'forecastDeliveryDate', valuePaths: ['$.data.forecastDelivery.startDateTime', '$.forecastDelivery.startDateTime', '$.data.forecastDateOfDelivery', '$.data.scheduledDate'] },
    { key: 'majorContract', valuePaths: ['$.data.majorContract'] },
    { key: 'berthAnchorageLocation', valuePaths: ['$.data.berthAnchorageLocation'] }
  ];
  
  // Add generalArrangement array paths (mirrors Python schema)
  // These extract fouling rating data from nested structures
  const gaArrayPaths = [
    // GA Component level
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].GAComponent', 'GAComponent', [15]),
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].name', 'GAName', [15]),
    // Items level (nested within generalArrangement)
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].items[].foulingRatingType', 'foulingRatingType', [15, 10]),
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].items[].foulingCoverage', 'foulingCoverage', [15, 10]),
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].items[].pdrRating', 'pdrRating', [15, 10]),
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].items[].description', 'itemDescription', [15, 10]),
    // Also try frRatingData structure (alternative naming)
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].frRatingData[].foulingRatingType', 'frRatingType', [15, 10]),
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].frRatingData[].foulingCoverage', 'frRatingCoverage', [15, 10]),
    // Comments
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].diverSupervisorComments', 'diverComments', [15]),
    ...expandArrayPaths('data.ranVessel.data.generalArrangement[].expertInspectorComments', 'expertComments', [15]),
    // Also check vessel path (for commercial)
    ...expandArrayPaths('data.vessel.data.generalArrangement[].items[].foulingRatingType', 'vesselFoulingRatingType', [15, 10]),
    ...expandArrayPaths('data.vessel.data.generalArrangement[].items[].foulingCoverage', 'vesselFoulingCoverage', [15, 10])
  ];
  
  // Combine all properties
  const allProperties = [...additionalProperties, ...gaArrayPaths];
  
  const propsString = allProperties.map(p => 
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
 * Reconstruct nested generalArrangement from flattened additionalProperties
 * Mirrors Python's get_nested_properties() logic
 * 
 * @param {object} flatProps - Flattened properties object
 * @returns {Array} Reconstructed generalArrangement array
 */
function reconstructGeneralArrangement(flatProps) {
  const gaComponents = new Map();
  
  // Find all GA-related properties
  for (const [key, value] of Object.entries(flatProps)) {
    if (value === null || value === undefined || value === '') continue;
    
    // Match patterns like: GAComponent_0, foulingRatingType_0_1, etc.
    const gaMatch = key.match(/^(GAComponent|GAName)_(\d+)$/);
    const itemMatch = key.match(/^(foulingRatingType|foulingCoverage|pdrRating|itemDescription)_(\d+)_(\d+)$/);
    const frMatch = key.match(/^(frRatingType|frRatingCoverage)_(\d+)_(\d+)$/);
    const commentMatch = key.match(/^(diverComments|expertComments)_(\d+)$/);
    
    if (gaMatch) {
      const [, propName, gaIndex] = gaMatch;
      if (!gaComponents.has(gaIndex)) {
        gaComponents.set(gaIndex, { items: [], frRatingData: [] });
      }
      const comp = gaComponents.get(gaIndex);
      if (propName === 'GAComponent' || propName === 'GAName') {
        comp.name = value;
        comp.GAComponent = value;
      }
    } else if (itemMatch) {
      const [, propName, gaIndex, itemIndex] = itemMatch;
      if (!gaComponents.has(gaIndex)) {
        gaComponents.set(gaIndex, { items: [], frRatingData: [] });
      }
      const comp = gaComponents.get(gaIndex);
      
      // Ensure items array has the right size
      while (comp.items.length <= parseInt(itemIndex)) {
        comp.items.push({});
      }
      
      const item = comp.items[parseInt(itemIndex)];
      if (propName === 'foulingRatingType') item.foulingRatingType = value;
      if (propName === 'foulingCoverage') item.foulingCoverage = value;
      if (propName === 'pdrRating') item.pdrRating = value;
      if (propName === 'itemDescription') item.description = value;
    } else if (frMatch) {
      const [, propName, gaIndex, itemIndex] = frMatch;
      if (!gaComponents.has(gaIndex)) {
        gaComponents.set(gaIndex, { items: [], frRatingData: [] });
      }
      const comp = gaComponents.get(gaIndex);
      
      // Ensure frRatingData array has the right size
      while (comp.frRatingData.length <= parseInt(itemIndex)) {
        comp.frRatingData.push({});
      }
      
      const item = comp.frRatingData[parseInt(itemIndex)];
      if (propName === 'frRatingType') item.foulingRatingType = value;
      if (propName === 'frRatingCoverage') item.foulingCoverage = value;
    } else if (commentMatch) {
      const [, propName, gaIndex] = commentMatch;
      if (!gaComponents.has(gaIndex)) {
        gaComponents.set(gaIndex, { items: [], frRatingData: [] });
      }
      const comp = gaComponents.get(gaIndex);
      if (propName === 'diverComments') comp.diverSupervisorComments = value;
      if (propName === 'expertComments') comp.expertInspectorComments = value;
    }
  }
  
  // Convert map to sorted array
  const sortedKeys = Array.from(gaComponents.keys()).sort((a, b) => parseInt(a) - parseInt(b));
  return sortedKeys.map(key => {
    const comp = gaComponents.get(key);
    // Filter out empty items
    comp.items = comp.items.filter(item => 
      item.foulingRatingType !== undefined || 
      item.foulingCoverage !== undefined || 
      item.pdrRating !== undefined
    );
    comp.frRatingData = comp.frRatingData.filter(item =>
      item.foulingRatingType !== undefined ||
      item.foulingCoverage !== undefined
    );
    return comp;
  }).filter(comp => 
    comp.name || comp.items.length > 0 || comp.frRatingData.length > 0
  );
}

/**
 * Convert GraphQL additional properties to nested data format
 * ENHANCED: Reconstructs generalArrangement from flattened properties
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
  
  // Reconstruct generalArrangement from flattened properties
  const reconstructedGA = reconstructGeneralArrangement(converted);
  
  // Also try to parse existing data.generalArrangement if it's a string
  let existingGA = null;
  if (workItem.data) {
    const vesselData = workItem.data.ranVessel?.data || workItem.data.vessel?.data || {};
    if (typeof vesselData.generalArrangement === 'string') {
      try {
        existingGA = JSON.parse(vesselData.generalArrangement);
      } catch {
        // Ignore parse errors
      }
    } else if (Array.isArray(vesselData.generalArrangement)) {
      existingGA = vesselData.generalArrangement;
    }
  }
  
  // Use existing GA if available, otherwise use reconstructed
  const finalGA = existingGA && existingGA.length > 0 ? existingGA : 
                  reconstructedGA.length > 0 ? reconstructedGA : null;
  
  // Merge with existing data
  const result = {
    ...workItem,
    data: {
      ...(workItem.data || {}),
      ...converted
    }
  };
  
  // Add reconstructed generalArrangement to vessel data
  if (finalGA && finalGA.length > 0) {
    if (result.data.ranVessel?.data) {
      result.data.ranVessel.data.generalArrangement = finalGA;
    } else if (result.data.vessel?.data) {
      result.data.vessel.data.generalArrangement = finalGA;
    } else {
      // Create a vessel structure if none exists
      result.data.reconstructedGA = finalGA;
    }
  }
  
  return result;
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

/**
 * Get rating data from a component (handles both 'items' and 'frRatingData' structures)
 * @param {object} component - GA component
 * @returns {Array} Array of rating objects
 */
function getRatingDataFromComponent(component) {
  // Try frRatingData first (original structure)
  if (component.frRatingData && Array.isArray(component.frRatingData) && component.frRatingData.length > 0) {
    return component.frRatingData;
  }
  // Try items (Python structure)
  if (component.items && Array.isArray(component.items) && component.items.length > 0) {
    return component.items;
  }
  // Return empty array if no data
  return [];
}

/**
 * Extract fouling rating value from a rating object
 * Handles various field names: foulingRatingType, foulingRating, frType, etc.
 */
function extractFoulingRating(rating) {
  // Try various field names
  const value = rating.foulingRatingType ?? 
                rating.foulingRating ?? 
                rating.frType ?? 
                rating.fr ??
                rating.type;
  
  // Parse string like "FR3" or just "3"
  if (typeof value === 'string') {
    const match = value.match(/(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
  return parseFloat(value) || 0;
}

/**
 * Extract coverage value from a rating object
 * Handles various field names and formats
 */
function extractCoverageValue(rating) {
  const value = rating.foulingCoverage ?? 
                rating.coverage ?? 
                rating.coveragePercent ?? 
                rating.area;
  
  // Handle percentage strings like "25%" or just numbers
  if (typeof value === 'string') {
    const match = value.match(/([\d.]+)/);
    return match ? parseFloat(match[1]) : 0;
  }
  return parseFloat(value) || 0;
}

// Calculate Freedom of Navigation (FON) Score from biofouling data
// FON = 100 - (Σ FR_i × Coverage_i × Weight_i)
// ENHANCED: Handles both 'items' and 'frRatingData' structures
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
    'port': 0.9,
    'starboard': 0.9,
    'keel': 1.1,
    'default': 1.0
  };
  
  generalArrangement.forEach(component => {
    const ratingData = getRatingDataFromComponent(component);
    if (ratingData.length === 0) return;
    
    const componentName = (component.name || component.GAComponent || '').toLowerCase();
    let weight = componentWeights.default;
    
    // Match component to weight
    for (const [key, w] of Object.entries(componentWeights)) {
      if (componentName.includes(key)) {
        weight = w;
        break;
      }
    }
    
    ratingData.forEach(rating => {
      const fr = extractFoulingRating(rating);  // FR 0-5
      const coverage = extractCoverageValue(rating);  // 0-100%
      
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
// ENHANCED: Handles both 'items' and 'frRatingData' structures
function calculateHullPerformance(generalArrangement) {
  if (!generalArrangement || !Array.isArray(generalArrangement)) return null;
  
  let totalFRWeighted = 0;
  let totalWeight = 0;
  
  generalArrangement.forEach(component => {
    const ratingData = getRatingDataFromComponent(component);
    if (ratingData.length === 0) return;
    
    ratingData.forEach(rating => {
      const fr = extractFoulingRating(rating);
      const coverage = extractCoverageValue(rating);
      
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

/**
 * Calculate weighted average fouling rating from generalArrangement
 * @param {Array} generalArrangement - GA data
 * @returns {number|null} Weighted average FR (0-5) or null if no data
 */
function calculateAverageFoulingRating(generalArrangement) {
  if (!generalArrangement || !Array.isArray(generalArrangement)) return null;
  
  let totalFRWeighted = 0;
  let totalWeight = 0;
  let dataPoints = 0;
  
  generalArrangement.forEach(component => {
    const ratingData = getRatingDataFromComponent(component);
    
    ratingData.forEach(rating => {
      const fr = extractFoulingRating(rating);
      const coverage = extractCoverageValue(rating);
      
      // If no coverage specified, assume equal weight
      const weight = coverage > 0 ? coverage / 100 : 1;
      totalFRWeighted += fr * weight;
      totalWeight += weight;
      dataPoints++;
    });
  });
  
  if (dataPoints === 0) return null;
  if (totalWeight === 0) totalWeight = dataPoints; // Fallback for missing coverage
  
  return Math.round((totalFRWeighted / totalWeight) * 10) / 10;
}

// Extract comprehensive vessel data from work item
function extractVesselFromWork(work) {
  const vesselObj = work.data?.ranVessel || work.data?.vessel;
  if (!vesselObj) return null;
  
  const vesselData = vesselObj.data || {};
  const typeInfo = detectVesselType(vesselObj, work.flowType);
  
  // Get vessel name first - needed for registry lookup
  const vesselName = vesselObj.displayName || vesselObj.name || findValue(work, [
    'data.ranVessel.data.name',
    'data.vessel.data.name',
    'data.ranVessel.name',
    'data.vessel.name'
  ]) || 'Unknown Vessel';
  
  // Search for MMSI in multiple possible locations (fallback)
  const apiMmsi = vesselData.mmsi || vesselData.MMSI || findValue(work, [
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
  
  // Search for IMO in multiple locations (fallback)
  const apiImo = vesselData.imo || vesselData.IMO || findValue(work, [
    'data.ranVessel.data.imo',
    'data.ranVessel.data.IMO',
    'data.vessel.data.imo',
    'data.vessel.data.IMO',
    'data.ranVessel.data.imoNumber',
    'data.vessel.data.imoNumber'
  ]);
  
  // ==========================================
  // AUTHORITATIVE MMSI LOOKUP
  // Registry MMSI takes priority - NEVER overwrite with blank/invalid
  // ==========================================
  let mmsi = apiMmsi;
  let imo = apiImo;
  let mmsiSource = 'api';
  
  if (mmsiRegistry) {
    const authMmsi = mmsiRegistry.getAuthoritativeMmsi(vesselName, apiMmsi);
    if (authMmsi) {
      mmsi = authMmsi;
      mmsiSource = 'registry';
    }
    // Also get authoritative IMO if available
    const registryEntry = mmsiRegistry.lookupVessel(vesselName);
    if (registryEntry && registryEntry.imo && !imo) {
      imo = registryEntry.imo;
    }
  }
  
  return {
    id: vesselObj.id,
    name: vesselName,
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
    mmsiSource: mmsiSource,
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
        
        // Deduplicate by work ID and filter out deleted items
        const workMap = new Map();
        let deletedCount = 0;
        for (const work of allFlowResults) {
          if (work.id && !workMap.has(work.id)) {
            // Skip deleted work items
            const isDeleted = work.isDeleted === true || 
                              work.workState === 'Deleted' ||
                              work.workStateName === 'Deleted' ||
                              work.status === 'Deleted' ||
                              work.currentState === 'Deleted';
            
            if (isDeleted) {
              deletedCount++;
              continue;
            }
            
            workMap.set(work.id, work);
          }
        }
        allWorkItems = Array.from(workMap.values());
        fetchMethod = 'rest-comprehensive';
        
        if (deletedCount > 0) {
          console.log(`  🗑️ Filtered out ${deletedCount} deleted work items`);
        }
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
    // and bfmpProperties (daysSinceLastClean, fouling data)
    // =========================================================
    console.log('📦 Fetching vessel data from asset registries...');
    const assetMMSILookup = new Map(); // name -> { mmsi, registry, bfmpProperties }
    
    for (const [registryName, registryId] of Object.entries(FLOW_ORIGINS.assetRegistries)) {
      try {
        const assetRes = await makeApiRequest(`/api/v3/thing?thingTypeId=${registryId}`, token);
        
        if (assetRes.statusCode === 200) {
          const assets = JSON.parse(assetRes.body);
          let mmsiCount = 0;
          let bfmpCount = 0;
          
          assets.forEach(asset => {
            const name = (asset.displayName || asset.name || asset.data?.name || '').toLowerCase().trim();
            const mmsi = asset.data?.mmsi || asset.data?.MMSI;
            
            // Extract bfmpProperties for fouling data
            const bfmpProperties = asset.data?.bfmpProperties || null;
            const daysSinceLastClean = bfmpProperties?.daysSinceLastClean ?? null;
            
            if (name) {
              const assetData = {
                mmsi: mmsi ? String(mmsi) : null,
                imo: asset.data?.imo || asset.data?.IMO || null,
                registry: registryName,
                assetId: asset.id,
                // BFMP (Biofouling Management Plan) properties
                bfmpProperties: bfmpProperties,
                daysSinceLastClean: daysSinceLastClean,
                lastCleanDate: bfmpProperties?.lastCleanDate || null,
                foulingRating: bfmpProperties?.foulingRating || null,
                // Vessel configuration for fouling calculations
                vesselConfig: {
                  length: asset.data?.length || asset.data?.loa || null,
                  beam: asset.data?.beam || asset.data?.breadth || null,
                  draft: asset.data?.draft || null,
                  type: asset.data?.vesselType || asset.data?.type || null
                }
              };
              
              assetMMSILookup.set(name, assetData);
              
              if (mmsi && String(mmsi).length >= 7) mmsiCount++;
              if (daysSinceLastClean !== null) bfmpCount++;
            }
          });
          
          console.log(`  ✓ ${registryName}: ${assets.length} assets (${mmsiCount} MMSI, ${bfmpCount} with BFMP data)`);
        }
      } catch (err) {
        console.log(`  ⚠ ${registryName}: ${err.message}`);
      }
    }
    
    console.log(`📡 Total asset lookup entries: ${assetMMSILookup.size}`);
    
    // Merge MMSI and BFMP data into vessels from work items
    let mmsiEnhanced = 0;
    let bfmpEnhanced = 0;
    vesselMap.forEach((vessel, vesselId) => {
      // Try to find asset data by vessel name
      const vesselNameLower = (vessel.name || '').toLowerCase().trim();
      
      if (assetMMSILookup.has(vesselNameLower)) {
        const assetData = assetMMSILookup.get(vesselNameLower);
        
        // Update MMSI if not already set
        if ((!vessel.mmsi || vessel.mmsi === '-') && assetData.mmsi) {
          vessel.mmsi = assetData.mmsi;
          mmsiEnhanced++;
        }
        
        // Update IMO if not already set
        if (!vessel.imo && assetData.imo) vessel.imo = assetData.imo;
        vessel.assetRegistry = assetData.registry;
        
        // Add BFMP (Biofouling Management Plan) data
        vessel.bfmpProperties = assetData.bfmpProperties;
        vessel.daysSinceLastClean = assetData.daysSinceLastClean;
        vessel.lastCleanDate = assetData.lastCleanDate;
        vessel.apiFoulingRating = assetData.foulingRating;
        
        // Add vessel configuration for fouling calculations
        if (assetData.vesselConfig) {
          vessel.vesselConfig = assetData.vesselConfig;
        }
        
        if (assetData.daysSinceLastClean !== null) {
          bfmpEnhanced++;
        }
      } else {
        // Try partial match for MMSI (for cases like "HMAS Stalwart" vs "Stalwart")
        for (const [assetName, assetData] of assetMMSILookup) {
          if (vesselNameLower.includes(assetName) || assetName.includes(vesselNameLower)) {
            if ((!vessel.mmsi || vessel.mmsi === '-') && assetData.mmsi) {
              vessel.mmsi = assetData.mmsi;
              mmsiEnhanced++;
            }
            if (!vessel.imo && assetData.imo) vessel.imo = assetData.imo;
            vessel.assetRegistry = assetData.registry;
            
            // Also add BFMP data from partial match
            if (assetData.daysSinceLastClean !== null) {
              vessel.daysSinceLastClean = assetData.daysSinceLastClean;
              vessel.bfmpProperties = assetData.bfmpProperties;
              bfmpEnhanced++;
            }
            break;
          }
        }
      }
    });
    
    console.log(`📊 Enhanced ${mmsiEnhanced} vessels with MMSI, ${bfmpEnhanced} with BFMP data`);
    
    // =========================================================
    // ADD: Include vessels from registries with NO work history
    // This ensures all registered vessels appear on the map
    // =========================================================
    let addedFromRegistries = 0;
    const existingVesselNames = new Set(
      Array.from(vesselMap.values()).map(v => (v.name || '').toLowerCase().trim())
    );
    
    // First try API registry data
    for (const [assetName, assetData] of assetMMSILookup) {
      if (!existingVesselNames.has(assetName)) {
        const newVesselId = assetData.assetId || `registry-${assetName.replace(/\s+/g, '-')}`;
        
        vesselMap.set(newVesselId, {
          id: newVesselId,
          name: assetName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
          mmsi: assetData.mmsi,
          imo: assetData.imo,
          assetRegistry: assetData.registry,
          category: assetData.registry.includes('ran') ? 'RAN' : 
                   assetData.registry.includes('royal') ? 'Royal Navy' :
                   assetData.registry.includes('usn') ? 'USN' :
                   assetData.registry.includes('rnzn') ? 'RNZN' : 'Commercial',
          jobs: [],
          totalJobs: 0,
          latestAssessment: null,
          performance: { freedomOfNavigation: null, currentHullPerformance: null, ytdHullPerformance: null, assessmentDate: null },
          hasWorkHistory: false,
          registrySource: assetData.registry
        });
        existingVesselNames.add(assetName);
        addedFromRegistries++;
      }
    }
    
    // FALLBACK: Use local MMSI registry if API returned nothing
    if (mmsiRegistry && assetMMSILookup.size === 0) {
      console.log('📦 Using local MMSI registry as fallback for vessel data...');
      const localRegistry = mmsiRegistry.VESSEL_MMSI_REGISTRY || {};
      
      for (const [vesselName, vesselData] of Object.entries(localRegistry)) {
        if (!existingVesselNames.has(vesselName) && vesselData.mmsi) {
          const newVesselId = `local-registry-${vesselName.replace(/\s+/g, '-')}`;
          
          // Determine category from vessel type/name
          let category = 'Commercial';
          if (vesselName.includes('hmas') || vesselName.includes('hma ')) category = 'RAN';
          else if (vesselName.includes('hms ')) category = 'Royal Navy';
          else if (vesselName.includes('uss ')) category = 'USN';
          else if (vesselName.includes('hmnzs')) category = 'RNZN';
          
          vesselMap.set(newVesselId, {
            id: newVesselId,
            name: vesselName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
            mmsi: vesselData.mmsi,
            imo: vesselData.imo || null,
            class: vesselData.class || null,
            type: vesselData.type || null,
            category: category,
            jobs: [],
            totalJobs: 0,
            latestAssessment: null,
            performance: { freedomOfNavigation: null, currentHullPerformance: null, ytdHullPerformance: null, assessmentDate: null },
            hasWorkHistory: false,
            registrySource: 'local-mmsi-registry'
          });
          existingVesselNames.add(vesselName);
          addedFromRegistries++;
        }
      }
    }
    
    if (addedFromRegistries > 0) {
      console.log(`📦 Added ${addedFromRegistries} vessels from registries (no work history yet)`);
    }
    
    // =========================================================
    // FALLBACK 1: Use last known positions from database
    // =========================================================
    const mapRoutes = require('./map');
    const lastKnownPositions = await mapRoutes.getAllLastKnownPositions();
    let lastKnownCount = 0;
    
    for (const [vesselId, vessel] of vesselMap) {
      if (!vessel.livePosition && vessel.mmsi && lastKnownPositions[vessel.mmsi]) {
        const lastPos = lastKnownPositions[vessel.mmsi];
        vessel.livePosition = {
          lat: lastPos.lat,
          lng: lastPos.lng,
          speed: lastPos.speed,
          course: lastPos.course,
          heading: lastPos.heading,
          source: 'last_known',
          timestamp: lastPos.timestamp,
          isStale: true
        };
        vessel.hasLivePosition = true;
        lastKnownCount++;
      }
    }
    
    if (lastKnownCount > 0) {
      console.log(`📍 Last known: Loaded ${lastKnownCount} cached positions from database`);
    }
    
    // =========================================================
    // FALLBACK 2: Use static positions for vessels without live data
    // =========================================================
    if (staticPositions) {
      let staticFallbackCount = 0;
      
      for (const [vesselId, vessel] of vesselMap) {
        if (!vessel.livePosition) {
          const staticPos = staticPositions.getStaticPosition(vessel.name);
          if (staticPos) {
            vessel.livePosition = {
              lat: staticPos.lat,
              lng: staticPos.lng,
              port: staticPos.port,
              note: staticPos.note,
              source: 'static',
              timestamp: new Date().toISOString()
            };
            staticFallbackCount++;
          }
        }
      }
      
      if (staticFallbackCount > 0) {
        console.log(`📍 Static fallback: Assigned ${staticFallbackCount} vessels to estimated positions`);
      }
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
      
      // Track if this vessel has real biofouling data from the API
      const hasRealFoulingData = vessel.performance.freedomOfNavigation !== null;
      const hasRealCleaningData = daysToNextClean !== null || vessel.daysSinceLastClean !== null;
      
      // If no biofouling assessment data, leave as null (don't generate placeholders)
      // The frontend will display "No data available" for vessels without real data
      vessel.performance.hasRealData = hasRealFoulingData;
      vessel.performance.hasRealCleaningData = hasRealCleaningData;
      
      // Calculate days since last clean - prefer API data, fallback to job data
      let daysSinceLastClean = vessel.daysSinceLastClean ?? null;
      
      // If no API data, calculate from last completed cleaning job
      if ((daysSinceLastClean === null || daysSinceLastClean === undefined) && lastClean) {
        const cleanDate = new Date(lastClean.lastModified);
        daysSinceLastClean = Math.floor((new Date() - cleanDate) / (1000 * 60 * 60 * 24));
      }
      
      // Calculate fouling prediction if we have cleaning data
      let foulingPrediction = null;
      if (foulingCalculator && daysSinceLastClean !== null && daysSinceLastClean !== undefined) {
        foulingPrediction = foulingCalculator.predictFoulingRating(daysSinceLastClean, 'mixed', 0.5);
        
        // If we have an API fouling rating, use it to validate/override prediction
        if (vessel.apiFoulingRating !== null && vessel.apiFoulingRating !== undefined) {
          foulingPrediction.apiFoulingRating = vessel.apiFoulingRating;
          foulingPrediction.frLevel = vessel.apiFoulingRating;
        }
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
        daysSinceLastClean,
        hasRealCleaningData,
        totalJobs: vessel.jobs.length,
        completedJobs: vessel.jobs.filter(j => j.status === 'Complete').length,
        activeJobs: vessel.jobs.filter(j => !['Complete', 'Deleted', 'Cancelled'].includes(j.status)).length,
        lastActivity: vessel.jobs[0]?.lastModified || null,
        performance: vessel.performance,
        foulingPrediction,
        recentJobs: vessel.jobs.slice(0, 5),
        // Live position from AIS
        livePosition: vessel.livePosition || null,
        hasLivePosition: !!vessel.livePosition,
        // Vessel configuration for calculations
        vesselConfig: vessel.vesselConfig || null,
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

    // Count vessels with positions
    const vesselsWithLivePosition = vessels.filter(v => v.hasLivePosition).length;
    const staticPositionsCount = vessels.filter(v => v.livePosition?.source === 'static').length;
    
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
          staticPositions: staticPositionsCount
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
    
    // Filter out deleted work items
    workItems = workItems.filter(w => {
      const isDeleted = w.isDeleted === true || 
                        w.workState === 'Deleted' ||
                        w.workStateName === 'Deleted' ||
                        w.status === 'Deleted' ||
                        w.currentState === 'Deleted';
      return !isDeleted;
    });
    
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

// Forward reference to deliveries endpoint - must be defined BEFORE :id route
// The actual implementation is defined later but we need this here for route ordering
router.get('/work/deliveries', deliveriesHandler);

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

// GET /api/marinestream/flow-origins - Get available flow origins for creating new work
// These are the templates/workflows that can be used to start new jobs
// Note: Uses hardcoded flow origins since the API doesn't provide this endpoint
router.get('/flow-origins', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    // Use our known flow origins (API doesn't provide a flow listing endpoint)
    // These are the flow origin IDs used for creating new work items
    const availableWorkflows = [
      // RAN Biofouling workflows
      {
        id: 'c87625d0-74b4-4bef-8ab2-eb2cd65fa833',
        displayName: 'RAN Biofouling',
        description: 'Royal Australian Navy biofouling inspection and cleaning workflow',
        flowType: 'biofouling',
        category: 'ran_biofouling',
        canCreateNew: true
      },
      {
        id: 'ce374b64-dd61-4892-ae40-fd24e625be79',
        displayName: 'RAN Engineering',
        description: 'Royal Australian Navy engineering inspection workflow',
        flowType: 'engineering',
        category: 'ran_engineering',
        canCreateNew: true
      },
      {
        id: '7a3ded1b-aa86-476a-95f7-dda9822b9518',
        displayName: 'RAN Assets',
        description: 'Royal Australian Navy assets workflow',
        flowType: 'assets',
        category: 'ran_assets',
        canCreateNew: true
      },
      {
        id: 'f7ee94cf-b2e7-4321-9a21-2a179b3830ee',
        displayName: 'RAN Workboard',
        description: 'Royal Australian Navy workboard',
        flowType: 'workboard',
        category: 'ran_workboard',
        canCreateNew: true
      },
      // Commercial Biofouling workflows
      {
        id: 'f46b1946-b7f9-4ecb-88d3-dc2b6a8e2a39',
        displayName: 'Biofouling',
        description: 'Commercial biofouling inspection and cleaning workflow',
        flowType: 'biofouling',
        category: 'commercial_biofouling',
        canCreateNew: true
      },
      {
        id: '3e2d5ca9-7e4c-4b43-9152-78f3c0b35d4a',
        displayName: 'Engineering',
        description: 'Commercial engineering inspection workflow',
        flowType: 'engineering',
        category: 'commercial_engineering',
        canCreateNew: true
      }
    ];
    
    res.json({
      success: true,
      data: availableWorkflows,
      help: 'Use these flow origin IDs with POST /api/marinestream/work to create new jobs'
    });
  } catch (error) {
    console.error('Flow Origins API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * Helper to determine flow category based on flow origin properties
 */
function determineFlowCategory(flowOrigin) {
  const name = (flowOrigin.displayName || flowOrigin.name || '').toLowerCase();
  const description = (flowOrigin.description || '').toLowerCase();
  
  if (name.includes('ran') || description.includes('ran')) {
    if (name.includes('biofouling') || description.includes('biofouling')) {
      return 'ran-biofouling';
    } else if (name.includes('engineering') || description.includes('engineering')) {
      return 'ran-engineering';
    }
    return 'ran';
  }
  
  if (name.includes('commercial') || name.includes('biofouling')) {
    return 'commercial';
  }
  
  if (name.includes('engineering')) {
    return 'engineering';
  }
  
  return 'other';
}

// POST /api/marinestream/work - Create a new work item (job)
// Uses the Diana API: POST /api/v3/flow/{flowId}/startAt?stepName={stepName}
router.post('/work', async (req, res) => {
  console.log('🚀 POST /work endpoint hit');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  const token = getTokenFromRequest(req);
  
  if (!token) {
    console.log('❌ No token found in request');
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }
  
  console.log('✅ Token found, length:', token.length);

  try {
    const { flowOriginId, flowId: providedFlowId, stepName, displayName, data } = req.body;
    
    // We need either flowId or flowOriginId
    const inputId = providedFlowId || flowOriginId;
    
    if (!inputId) {
      return res.status(400).json({
        success: false,
        error: { message: 'flowId or flowOriginId is required to create a new work item' }
      });
    }
    
    console.log(`📝 Creating new work item, input ID: ${inputId}`);
    
    // Step 1: Get flow details directly using the provided ID
    // The flowOriginId IS the flowId for the startAt endpoint
    console.log('🔍 Fetching flow details...');
    
    const flowResult = await makeApiRequest(`/api/v3/flow/${inputId}`, token);
    
    let actualFlowId = inputId;
    let startStepName = stepName;
    
    if (flowResult.statusCode === 200) {
      const flowData = JSON.parse(flowResult.body);
      console.log(`✅ Flow found: ${flowData.displayName || flowData.name}`);
      
      // Use the flow's id if different from input
      if (flowData.id) {
        actualFlowId = flowData.id;
        console.log(`📋 Using flowId: ${actualFlowId}`);
      }
      
      // Find the first step that allows startAt
      if (!startStepName) {
        if (flowData.steps && flowData.steps.length > 0) {
          const firstStep = flowData.steps.find(s => s.allowStartAt) || flowData.steps[0];
          startStepName = firstStep.name || firstStep.id;
          console.log('📍 Found step:', startStepName);
        } else if (flowData.firstStepName) {
          startStepName = flowData.firstStepName;
          console.log('📍 Using firstStepName:', startStepName);
        }
      }
    } else {
      console.log(`⚠️ Could not fetch flow details (${flowResult.statusCode}), using ID directly`);
      console.log('📋 Response:', flowResult.body?.substring(0, 200));
    }
    
    // Build the API path for startAt
    let apiPath = `/api/v3/flow/${actualFlowId}/startAt`;
    if (startStepName) {
      apiPath += `?stepName=${encodeURIComponent(startStepName)}`;
    }
    
    console.log(`🌐 POST https://${DIANA_API_BASE}${apiPath}`);
    
    // Make POST request to Diana API to create work
    // According to docs, body should be {} or contain initial data
    const postData = JSON.stringify(data || {});
    
    // Headers including Environment header (required for MarineStream)
    const requestHeaders = {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json, text/plain, */*',
      'Content-Type': 'application/json-patch+json',
      'Content-Length': Buffer.byteLength(postData),
      'Environment': 'marinestream'  // Required for MarineStream environment
    };
    
    console.log('📤 Request headers:', JSON.stringify(requestHeaders, null, 2).replace(token, '[REDACTED]'));
    console.log('📤 Request body:', postData);
    
    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: DIANA_API_BASE,
        port: 443,
        path: apiPath,
        method: 'POST',
        headers: requestHeaders
      };

      const req = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: data
          });
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
    
    if (result.statusCode === 200 || result.statusCode === 201) {
      const newWork = JSON.parse(result.body);
      console.log(`✅ Created new work item: ${newWork.id} (${newWork.workCode})`);
      
      res.json({
        success: true,
        data: {
          workId: newWork.id,
          workCode: newWork.workCode,
          displayName: newWork.displayName,
          flowType: newWork.flowType,
          status: newWork.currentState,
          jobUrl: `https://app.marinestream.io/marinestream/work/${newWork.id}`
        }
      });
    } else {
      // Parse the error response to get more details
      let errorDetails = result.body;
      try {
        errorDetails = JSON.parse(result.body);
      } catch (e) {
        // Keep as string if not valid JSON
      }
      
      console.error(`❌ Failed to create work item: ${result.statusCode}`);
      console.error('📋 Response headers:', JSON.stringify(result.headers, null, 2));
      console.error('📋 Response body:', typeof errorDetails === 'object' ? JSON.stringify(errorDetails, null, 2) : errorDetails);
      console.error('📋 Full API path used:', apiPath);
      console.error('📋 FlowId used:', actualFlowId);
      console.error('📋 StepName used:', startStepName || 'none');
      
      res.status(result.statusCode).json({
        success: false,
        error: { 
          message: 'Failed to create work item',
          details: errorDetails
        }
      });
    }
  } catch (error) {
    console.error('Create Work API error:', error);
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

// GET /api/marinestream/work/deliveries - List all work items with delivery dates
// Uses REST API: GET /api/v3/work/{work_id}?format=standard (per Rise-X docs)
// Note: Route is registered earlier (before /work/:id) but handler is defined here
async function deliveriesHandler(req, res) {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    console.log('📅 Fetching all work items with delivery dates (REST API)...');
    
    const allWorkItems = [];
    const errors = [];
    
    // Method 1: Try fetching open work items for each flow origin
    // Uses: GET /api/v3/work/user/open?flowOriginId={flowid}
    console.log('  📋 Fetching open work items by flow origin...');
    for (const flowOriginId of ALL_WORKFLOW_FLOW_ORIGINS) {
      try {
        const workRes = await makeApiRequest(`/api/v3/work/user/open?flowOriginId=${flowOriginId}`, token);
        
        if (workRes.statusCode === 200) {
          const works = JSON.parse(workRes.body);
          if (works.length > 0) {
            allWorkItems.push(...works);
            console.log(`    ✓ Flow ${flowOriginId.substring(0, 8)}...: ${works.length} items`);
          }
        } else if (workRes.statusCode !== 401) {
          console.log(`    ⚠ Flow ${flowOriginId.substring(0, 8)}...: status ${workRes.statusCode}`);
        }
      } catch (err) {
        errors.push({ flowOriginId, error: err.message });
      }
    }
    
    // Method 2: Try the base /work endpoint
    // Uses: GET /api/v3/work
    console.log('  📋 Fetching from base /work endpoint...');
    try {
      const baseWorkRes = await makeApiRequest('/api/v3/work', token);
      if (baseWorkRes.statusCode === 200) {
        const baseWorks = JSON.parse(baseWorkRes.body);
        if (baseWorks.length > 0) {
          allWorkItems.push(...baseWorks);
          console.log(`    ✓ Base /work: ${baseWorks.length} items`);
        }
      } else {
        console.log(`    ⚠ Base /work: status ${baseWorkRes.statusCode}`);
      }
    } catch (err) {
      errors.push({ endpoint: '/work', error: err.message });
    }
    
    // Method 3: Try fetching work items assigned to user
    // Uses: GET /api/v3/work/user/assigned
    console.log('  📋 Fetching user assigned work...');
    try {
      const assignedRes = await makeApiRequest('/api/v3/work/user/assigned', token);
      if (assignedRes.statusCode === 200) {
        const assignedWorks = JSON.parse(assignedRes.body);
        if (assignedWorks.length > 0) {
          allWorkItems.push(...assignedWorks);
          console.log(`    ✓ User assigned: ${assignedWorks.length} items`);
        }
      }
    } catch (err) {
      // Silent fail for this optional endpoint
    }
    
    // Deduplicate by work ID and filter out deleted items
    const workMap = new Map();
    let deletedCount = 0;
    for (const work of allWorkItems) {
      if (work.id && !workMap.has(work.id)) {
        // Skip deleted work items
        const isDeleted = work.isDeleted === true || 
                          work.workState === 'Deleted' ||
                          work.workStateName === 'Deleted' ||
                          work.status === 'Deleted' ||
                          work.currentState === 'Deleted';
        
        if (isDeleted) {
          deletedCount++;
          continue;
        }
        
        workMap.set(work.id, work);
      }
    }
    
    if (deletedCount > 0) {
      console.log(`🗑️ Filtered out ${deletedCount} deleted work items`);
    }
    console.log(`📊 Processing ${workMap.size} unique work items...`);
    
    // For each work item, try to get full details if we don't have delivery dates
    // Uses: GET /api/v3/work/{work_id}?format=standard
    const workWithDates = [];
    let detailsFetched = 0;
    
    for (const [workId, work] of workMap) {
      // Check if we already have delivery dates in the summary data
      let actualDelivery = findDeliveryDate(work, 'actual');
      let forecastDelivery = findDeliveryDate(work, 'forecast');
      
      // If missing dates and we have few items, fetch full details
      if ((!actualDelivery && !forecastDelivery) && workMap.size <= 100 && detailsFetched < 50) {
        try {
          const detailRes = await makeApiRequest(`/api/v3/work/${workId}?format=standard`, token);
          if (detailRes.statusCode === 200) {
            const fullWork = JSON.parse(detailRes.body);
            actualDelivery = findDeliveryDate(fullWork, 'actual');
            forecastDelivery = findDeliveryDate(fullWork, 'forecast');
            detailsFetched++;
            
            // Also update vessel info if available
            if (fullWork.data) {
              work.data = { ...work.data, ...fullWork.data };
            }
          }
        } catch (err) {
          // Silent fail for detail fetch
        }
      }
      
      const vessel = work.data?.ranVessel || work.data?.vessel;
      const vesselName = vessel?.displayName || vessel?.name || vessel?.data?.name || null;
      
      // Determine time category
      const now = new Date();
      let timeCategory = 'unknown';
      
      if (work.currentState === 'Complete' || work.status === 'Complete') {
        timeCategory = 'historic';
      } else if (forecastDelivery) {
        const forecastDate = new Date(forecastDelivery);
        if (forecastDate < now) {
          timeCategory = 'overdue';
        } else if (forecastDate.toDateString() === now.toDateString()) {
          timeCategory = 'today';
        } else {
          timeCategory = 'future';
        }
      } else if (work.currentState === 'InProgress' || work.currentState === 'Draft') {
        timeCategory = 'in_progress';
      }
      
      workWithDates.push({
        workId: work.id,
        workCode: work.workCode,
        displayName: work.displayName,
        flowType: work.flowType,
        flowOriginId: work.flowOriginId,
        status: work.currentState || work.status || 'Unknown',
        createdDate: work.createdDate,
        lastModified: work.lastModified,
        vesselName,
        // Delivery dates
        actualDeliveryDate: actualDelivery,
        forecastDeliveryDate: forecastDelivery,
        // Time category
        timeCategory,
        // Link to job
        jobUrl: `https://app.marinestream.io/marinestream/work/${work.id}`
      });
    }
    
    // Sort by forecast date (future first), then by last modified
    workWithDates.sort((a, b) => {
      // Future items first
      if (a.timeCategory === 'future' && b.timeCategory !== 'future') return -1;
      if (b.timeCategory === 'future' && a.timeCategory !== 'future') return 1;
      
      // Then by date
      const dateA = a.forecastDeliveryDate || a.actualDeliveryDate || a.lastModified;
      const dateB = b.forecastDeliveryDate || b.actualDeliveryDate || b.lastModified;
      
      if (dateA && dateB) {
        return new Date(dateB) - new Date(dateA);
      }
      return 0;
    });
    
    // Group by category
    const byCategory = {
      future: workWithDates.filter(w => w.timeCategory === 'future'),
      today: workWithDates.filter(w => w.timeCategory === 'today'),
      overdue: workWithDates.filter(w => w.timeCategory === 'overdue'),
      in_progress: workWithDates.filter(w => w.timeCategory === 'in_progress'),
      historic: workWithDates.filter(w => w.timeCategory === 'historic'),
      unknown: workWithDates.filter(w => w.timeCategory === 'unknown')
    };
    
    // Group by flow type
    const byFlowType = {};
    workWithDates.forEach(w => {
      const flowType = w.flowType || 'unknown';
      if (!byFlowType[flowType]) {
        byFlowType[flowType] = [];
      }
      byFlowType[flowType].push(w);
    });
    
    console.log(`✅ Found ${workWithDates.length} work items:`);
    console.log(`   - Future: ${byCategory.future.length}`);
    console.log(`   - Today: ${byCategory.today.length}`);
    console.log(`   - Overdue: ${byCategory.overdue.length}`);
    console.log(`   - In Progress: ${byCategory.in_progress.length}`);
    console.log(`   - Historic: ${byCategory.historic.length}`);
    console.log(`   - With Forecast Date: ${workWithDates.filter(w => w.forecastDeliveryDate).length}`);
    console.log(`   - With Actual Date: ${workWithDates.filter(w => w.actualDeliveryDate).length}`);
    
    res.json({
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        totalWorkItems: workWithDates.length,
        detailsFetched,
        summary: {
          future: byCategory.future.length,
          today: byCategory.today.length,
          overdue: byCategory.overdue.length,
          inProgress: byCategory.in_progress.length,
          historic: byCategory.historic.length,
          withForecastDate: workWithDates.filter(w => w.forecastDeliveryDate).length,
          withActualDate: workWithDates.filter(w => w.actualDeliveryDate).length
        },
        byCategory,
        byFlowType,
        allWork: workWithDates,
        errors: errors.length > 0 ? errors : undefined
      }
    });
  } catch (error) {
    console.error('Deliveries endpoint error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
}

/**
 * Extract date value from potentially nested date object
 * MarineStream returns dates as objects like: { date: "2025-08-30T00:12:47.942Z", offset: 480, timezone: "Australia/Perth" }
 */
function extractDateValue(dateObj) {
  if (!dateObj) return null;
  
  // If it's already a string, return it
  if (typeof dateObj === 'string') {
    return dateObj;
  }
  
  // If it's an object with a date property, extract it
  if (typeof dateObj === 'object') {
    // Try common date object formats
    if (dateObj.date) return dateObj.date;
    if (dateObj.startDateTime) return extractDateValue(dateObj.startDateTime);
    if (dateObj.endDateTime) return extractDateValue(dateObj.endDateTime);
    if (dateObj.dateTime) return dateObj.dateTime;
    if (dateObj.value) return dateObj.value;
    
    // If it has a ticks property, convert to ISO string
    if (dateObj.ticks) {
      try {
        return new Date(parseInt(dateObj.ticks)).toISOString();
      } catch (e) {
        return null;
      }
    }
  }
  
  return null;
}

/**
 * Find delivery date in work item data
 * Searches various possible field locations
 */
function findDeliveryDate(work, type) {
  if (!work) return null;
  
  const data = work.data || {};
  
  if (type === 'actual') {
    return extractDateValue(data.actualDelivery?.startDateTime) ||
           extractDateValue(data.actualDelivery?.endDateTime) ||
           extractDateValue(data.actualDelivery) ||
           extractDateValue(data.actualDateOfDelivery) ||
           extractDateValue(data.actualDate) ||
           extractDateValue(data.completedDate) ||
           extractDateValue(work.actualDelivery?.startDateTime) ||
           extractDateValue(work.actualDelivery) ||
           null;
  }
  
  if (type === 'forecast') {
    return extractDateValue(data.forecastDelivery?.startDateTime) ||
           extractDateValue(data.forecastDelivery?.endDateTime) ||
           extractDateValue(data.forecastDelivery) ||
           extractDateValue(data.forecastDateOfDelivery) ||
           extractDateValue(data.forecastDate) ||
           extractDateValue(data.scheduledDate) ||
           extractDateValue(data.plannedDate) ||
           extractDateValue(data.dueDate) ||
           extractDateValue(work.forecastDelivery?.startDateTime) ||
           extractDateValue(work.forecastDelivery) ||
           null;
  }
  
  return null;
}

// GET /api/marinestream/debug/fouling/:vesselName - Debug endpoint to check fouling data for a vessel
router.get('/debug/fouling/:vesselName', async (req, res) => {
  const token = getTokenFromRequest(req);
  const { vesselName } = req.params;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    console.log(`🔍 Debug: Searching for fouling data for vessel "${vesselName}"...`);
    
    const results = {
      vesselName,
      timestamp: new Date().toISOString(),
      sources: {},
      rawData: {}
    };
    
    // 1. Check asset registries for bfmpProperties
    console.log('  📦 Checking asset registries...');
    for (const [registryName, registryId] of Object.entries(FLOW_ORIGINS.assetRegistries)) {
      try {
        const assetRes = await makeApiRequest(`/api/v3/thing?thingTypeId=${registryId}`, token);
        
        if (assetRes.statusCode === 200) {
          const assets = JSON.parse(assetRes.body);
          const matchingAsset = assets.find(a => {
            const name = (a.displayName || a.name || a.data?.name || '').toLowerCase();
            return name.includes(vesselName.toLowerCase()) || vesselName.toLowerCase().includes(name);
          });
          
          if (matchingAsset) {
            results.sources[registryName] = {
              found: true,
              assetId: matchingAsset.id,
              name: matchingAsset.displayName || matchingAsset.name,
              bfmpProperties: matchingAsset.data?.bfmpProperties || null,
              daysSinceLastClean: matchingAsset.data?.bfmpProperties?.daysSinceLastClean ?? null,
              foulingRating: matchingAsset.data?.bfmpProperties?.foulingRating ?? null,
              generalArrangement: matchingAsset.data?.generalArrangement || null,
              rawData: matchingAsset.data
            };
            console.log(`    ✓ Found in ${registryName}: ${matchingAsset.displayName}`);
            
            // Store full raw data for debugging
            results.rawData[registryName] = matchingAsset;
          }
        }
      } catch (err) {
        results.sources[registryName] = { found: false, error: err.message };
      }
    }
    
    // 2. Check work items for biofouling assessments
    console.log('  📋 Checking work items...');
    const workItems = [];
    
    for (const flowOriginId of ALL_WORKFLOW_FLOW_ORIGINS) {
      try {
        const workRes = await makeApiRequest(`/api/v3/work/user/open?flowOriginId=${flowOriginId}`, token);
        
        if (workRes.statusCode === 200) {
          const works = JSON.parse(workRes.body);
          
          works.forEach(work => {
            const vessel = work.data?.ranVessel || work.data?.vessel;
            const vName = vessel?.displayName || vessel?.name || vessel?.data?.name || '';
            
            if (vName.toLowerCase().includes(vesselName.toLowerCase())) {
              const vesselData = vessel?.data || {};
              workItems.push({
                workId: work.id,
                workCode: work.workCode,
                flowType: work.flowType,
                status: work.currentState,
                lastModified: work.lastModified,
                vesselName: vName,
                hasGeneralArrangement: !!vesselData.generalArrangement,
                generalArrangementLength: Array.isArray(vesselData.generalArrangement) ? vesselData.generalArrangement.length : 0,
                generalArrangement: vesselData.generalArrangement || null,
                bfmpProperties: vesselData.bfmpProperties || null
              });
            }
          });
        }
      } catch (err) {
        console.log(`    ⚠ Flow ${flowOriginId.substring(0, 8)}...: ${err.message}`);
      }
    }
    
    // Sort work items by date (newest first)
    workItems.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
    results.workItems = workItems;
    results.workItemCount = workItems.length;
    
    // 3. Find the most recent assessment with GA data
    const latestWithGA = workItems.find(w => w.hasGeneralArrangement && w.status === 'Complete');
    if (latestWithGA) {
      results.latestAssessment = {
        workCode: latestWithGA.workCode,
        date: latestWithGA.lastModified,
        generalArrangementComponents: latestWithGA.generalArrangementLength,
        sampleData: Array.isArray(latestWithGA.generalArrangement) 
          ? latestWithGA.generalArrangement.slice(0, 2).map(comp => ({
              name: comp.name || comp.GAComponent,
              hasItems: !!(comp.items && comp.items.length),
              hasFrRatingData: !!(comp.frRatingData && comp.frRatingData.length),
              itemCount: comp.items?.length || 0,
              frRatingDataCount: comp.frRatingData?.length || 0,
              sampleItem: comp.items?.[0] || comp.frRatingData?.[0] || null
            }))
          : null
      };
    }
    
    // Calculate what we can extract
    if (latestWithGA?.generalArrangement) {
      const fon = calculateFONScore(latestWithGA.generalArrangement);
      const hp = calculateHullPerformance(latestWithGA.generalArrangement);
      const avgFR = calculateAverageFoulingRating(latestWithGA.generalArrangement);
      
      results.calculatedMetrics = {
        freedomOfNavigation: fon,
        hullPerformance: hp,
        averageFoulingRating: avgFR
      };
    }
    
    console.log(`  ✅ Debug complete. Found ${workItems.length} work items, ${Object.keys(results.sources).length} registry matches.`);
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Debug endpoint error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

// GET /api/marinestream/debug/dates - Discover all date fields in work items
router.get('/debug/dates', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  if (!token) {
    return res.status(401).json({ success: false, error: { message: 'Authorization token required' } });
  }

  try {
    console.log('🔍 Discovering date fields in work items...');
    
    // Fetch a sample of work items
    const workRes = await makeApiRequest('/api/v3/work', token);
    
    if (workRes.statusCode !== 200) {
      return res.status(workRes.statusCode).json({ success: false, error: { message: 'Failed to fetch work' } });
    }

    const workItems = JSON.parse(workRes.body);
    const dateFieldsFound = new Set();
    const sampleDates = {};
    
    // Helper function to find date fields recursively
    function findDateFields(obj, path = '') {
      if (!obj || typeof obj !== 'object') return;
      
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        // Check if key suggests a date field
        const isDateKey = /date|time|delivery|scheduled|forecast|actual|created|modified|start|end/i.test(key);
        
        // Check if value looks like a date
        const isDateValue = typeof value === 'string' && 
          (/^\d{4}-\d{2}-\d{2}/.test(value) || /T\d{2}:\d{2}/.test(value));
        
        if (isDateKey || isDateValue) {
          dateFieldsFound.add(currentPath);
          if (!sampleDates[currentPath]) {
            sampleDates[currentPath] = [];
          }
          if (sampleDates[currentPath].length < 3 && value) {
            sampleDates[currentPath].push(value);
          }
        }
        
        // Recurse into objects and arrays
        if (typeof value === 'object' && value !== null) {
          if (Array.isArray(value)) {
            value.slice(0, 2).forEach((item, i) => {
              findDateFields(item, `${currentPath}[${i}]`);
            });
          } else {
            findDateFields(value, currentPath);
          }
        }
      }
    }
    
    // Analyze each work item
    workItems.slice(0, 20).forEach(work => {
      findDateFields(work);
    });
    
    // Sort and categorize date fields
    const sortedFields = Array.from(dateFieldsFound).sort();
    const deliveryFields = sortedFields.filter(f => /delivery|scheduled|forecast|actual/i.test(f));
    const otherDateFields = sortedFields.filter(f => !/delivery|scheduled|forecast|actual/i.test(f));
    
    console.log(`✅ Found ${sortedFields.length} date-related fields`);
    
    res.json({
      success: true,
      data: {
        totalWorkItemsAnalyzed: Math.min(workItems.length, 20),
        deliveryDateFields: deliveryFields,
        otherDateFields: otherDateFields,
        allDateFields: sortedFields,
        sampleValues: sampleDates
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
  }
});

// GET /api/marinestream/debug/structure - Debug endpoint to show data structure for a single work item
router.get('/debug/structure/:workId', async (req, res) => {
  const token = getTokenFromRequest(req);
  const { workId } = req.params;
  
  if (!token) {
    return res.status(401).json({ success: false, error: { message: 'Authorization token required' } });
  }

  try {
    const result = await makeApiRequest(`/api/v3/work/${workId}?format=standard`, token);
    
    if (result.statusCode !== 200) {
      return res.status(result.statusCode).json({ success: false, error: { message: 'Failed to fetch work item' } });
    }

    const work = JSON.parse(result.body);
    
    // Analyze the data structure
    function analyzeStructure(obj, path = '') {
      const analysis = {};
      
      if (obj === null) return { type: 'null', path };
      if (obj === undefined) return { type: 'undefined', path };
      if (Array.isArray(obj)) {
        return {
          type: 'array',
          length: obj.length,
          path,
          sample: obj.slice(0, 2).map((item, i) => analyzeStructure(item, `${path}[${i}]`))
        };
      }
      if (typeof obj === 'object') {
        const keys = Object.keys(obj);
        return {
          type: 'object',
          keys: keys,
          path,
          children: keys.reduce((acc, key) => {
            acc[key] = analyzeStructure(obj[key], `${path}.${key}`);
            return acc;
          }, {})
        };
      }
      return { type: typeof obj, value: String(obj).substring(0, 100), path };
    }
    
    res.json({
      success: true,
      data: {
        workId,
        workCode: work.workCode,
        flowType: work.flowType,
        structure: analyzeStructure(work, 'work'),
        raw: work
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: { message: error.message } });
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

// GET /api/marinestream/debug/api - Test various API endpoints to diagnose connectivity
router.get('/debug/api', async (req, res) => {
  try {
    const token = getTokenFromRequest(req);
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authorization token required' }
      });
    }

    console.log('🔧 DEBUG: Testing API connectivity with token:', token.substring(0, 30) + '...');
  
  // Try to decode the JWT to see its claims
  let tokenInfo = {};
  try {
    const parts = token.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      tokenInfo = {
        issuer: payload.iss,
        subject: payload.sub,
        audience: payload.aud,
        scope: payload.scope,
        expiration: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'unknown',
        isExpired: payload.exp ? Date.now() > payload.exp * 1000 : 'unknown',
        email: payload.email,
        name: payload.name || payload.preferred_name
      };
      console.log('   Token claims:', JSON.stringify(tokenInfo, null, 2));
    }
  } catch (e) {
    tokenInfo = { error: 'Could not decode JWT: ' + e.message };
  }
  
  const results = {};
  
  // Test GET endpoints
  const getEndpoints = [
    '/api/v3/user',
    '/api/v3/work',
    '/api/v3/thing',
    '/api/v3/things',  // Try plural
    '/api/v3/thingtype',
    '/api/v3/thingtypes', // Try plural
    '/api/v3/flow',
    '/api/v3/floworigin',
    '/api/v3/work/user/open',
    '/api/v3/work/user/assigned',
  ];
  
  // Also test a specific thing registry with POST
  const postTests = [
    {
      path: '/api/v3/thing',
      body: { thingTypeId: '6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca' } // RAN Vessels
    },
    {
      path: '/api/v3/thing/search',
      body: { query: '' }
    }
  ];
  
  console.log('   Testing GET endpoints...');
  const endpoints = getEndpoints;
  
  for (const endpoint of endpoints) {
    try {
      console.log(`   Testing ${endpoint}...`);
      const result = await makeApiRequest(endpoint, token);
      results[endpoint] = {
        status: result.statusCode,
        bodyPreview: result.body?.substring(0, 300) || 'empty',
        success: result.statusCode >= 200 && result.statusCode < 300
      };
      console.log(`   ${endpoint}: ${result.statusCode}`);
    } catch (err) {
      results[endpoint] = { status: 'error', message: err.message };
      console.log(`   ${endpoint}: ERROR - ${err.message}`);
    }
  }
  
  // Test POST endpoints
  console.log('   Testing POST endpoints...');
  for (const test of postTests) {
    try {
      console.log(`   Testing POST ${test.path}...`);
      const result = await makeApiRequest(test.path, token, 'POST', test.body);
      results[`POST ${test.path}`] = {
        status: result.statusCode,
        bodyPreview: result.body?.substring(0, 300) || 'empty',
        success: result.statusCode >= 200 && result.statusCode < 300
      };
      console.log(`   POST ${test.path}: ${result.statusCode}`);
    } catch (err) {
      results[`POST ${test.path}`] = { status: 'error', message: err.message };
      console.log(`   POST ${test.path}: ERROR - ${err.message}`);
    }
  }
  
  // Count successes
    const successCount = Object.values(results).filter(r => r.success).length;
    
    res.json({
      success: true,
      data: {
        apiBase: DIANA_API_BASE,
        tokenPreview: token.substring(0, 30) + '...',
        tokenInfo,
        totalEndpoints: Object.keys(results).length,
        successfulEndpoints: successCount,
        results
      }
    });
  } catch (error) {
    console.error('Debug API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message, stack: error.stack }
    });
  }
});

// GET /api/marinestream/assets - Get all vessels/assets
// Strategy: Extract unique assets from work items since /api/v3/thing endpoint is broken
router.get('/assets', async (req, res) => {
  const token = getTokenFromRequest(req);
  
  console.log('📦 GET /api/marinestream/assets called');
  console.log('   Token present:', !!token, token ? `(${token.substring(0, 20)}...)` : '');
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    const assetMap = new Map(); // Use map to deduplicate by name
    
    // Helper function to extract asset from work item
    const extractAsset = (work, source) => {
      // The vessel/asset data can be nested in various locations
      const vesselData = work.data?.ranVessel || 
                        work.data?.vessel || 
                        work.data?.commercialVessel ||
                        null;
      
      // IMPORTANT: Prioritize nested vessel name over work.displayName
      // work.displayName is often the work item name (e.g., "RAN Biofouling"), not the vessel
      const assetName = vesselData?.displayName ||
                       vesselData?.name ||
                       vesselData?.data?.name ||
                       work.data?.assetName || 
                       work.data?.vesselName ||
                       work.data?.vessel?.displayName ||
                       work.data?.vessel?.name ||
                       work.data?.ranVessel?.displayName ||
                       work.data?.ranVessel?.name;
      
      // Skip if no vessel name found or if it looks like a workflow name
      if (!assetName) return null;
      
      // Skip generic workflow names that aren't actual vessels
      const skipNames = ['biofouling', 'engineering', 'ran biofouling', 'ran engineering', 
                        'commercial biofouling', 'commercial engineering', 'assets', 
                        'ran assets', 'commercial vessels', 'inspection'];
      if (skipNames.includes(assetName.toLowerCase())) return null;
      
      const mmsi = vesselData?.data?.mmsi || 
                  vesselData?.data?.MMSI || 
                  vesselData?.mmsi ||
                  work.data?.mmsi || '';
      const imo = vesselData?.data?.imo || 
                 vesselData?.data?.IMO || 
                 vesselData?.imo ||
                 work.data?.imo || '';
      
      return {
        id: vesselData?.id || work.data?.assetId || work.id,
        name: assetName,
        displayName: assetName,
        mmsi: mmsi,
        imo: imo,
        class: vesselData?.data?.class || work.data?.class || '',
        pennant: vesselData?.data?.pennant || work.data?.pennant || '',
        flag: vesselData?.data?.flag || work.data?.flag || '',
        registry: source,
        workItemId: work.id,
        flowType: work.flowType,
        hasGeneralArrangement: !!(work.data?.generalArrangement || vesselData?.data?.generalArrangement)
      };
    };
    
    console.log('   📋 Fetching assets from multiple sources...');
    
    // 1. Fetch from base /work endpoint
    const workResult = await makeApiRequest('/api/v3/work', token);
    
    if (workResult.statusCode === 200) {
      const workItems = JSON.parse(workResult.body);
      console.log(`   📦 Base /work: ${workItems.length} items`);
      
      // Debug: Log first few work items to understand structure
      if (workItems.length > 0) {
        console.log('   🔍 Sample work item structure:');
        const sample = workItems[0];
        console.log('      - displayName:', sample.displayName);
        console.log('      - flowType:', sample.flowType);
        console.log('      - data keys:', sample.data ? Object.keys(sample.data).join(', ') : 'none');
        if (sample.data?.ranVessel) {
          console.log('      - ranVessel.displayName:', sample.data.ranVessel.displayName);
          console.log('      - ranVessel.name:', sample.data.ranVessel.name);
        }
        if (sample.data?.vessel) {
          console.log('      - vessel.displayName:', sample.data.vessel?.displayName);
          console.log('      - vessel.name:', sample.data.vessel?.name);
        }
      }
      
      for (const work of workItems) {
        const asset = extractAsset(work, 'work-base');
        if (asset && !assetMap.has(asset.name.toLowerCase())) {
          assetMap.set(asset.name.toLowerCase(), asset);
        }
      }
    }
    
    // 2. Fetch from open work items
    const openWorkResult = await makeApiRequest('/api/v3/work/user/open', token);
    
    if (openWorkResult.statusCode === 200) {
      const openWorkItems = JSON.parse(openWorkResult.body);
      console.log(`   📦 Open work: ${openWorkItems.length} items`);
      
      for (const work of openWorkItems) {
        const asset = extractAsset(work, 'work-open');
        if (asset && !assetMap.has(asset.name.toLowerCase())) {
          assetMap.set(asset.name.toLowerCase(), asset);
        }
      }
    }
    
    // 3. Query each known flow origin for more coverage
    console.log('   📋 Querying flow origins for additional assets...');
    
    for (const flowOriginId of ALL_WORKFLOW_FLOW_ORIGINS) {
      try {
        const flowWorkResult = await makeApiRequest(`/api/v3/work/user/open?flowOriginId=${flowOriginId}`, token);
        
        if (flowWorkResult.statusCode === 200) {
          const flowWorkItems = JSON.parse(flowWorkResult.body);
          
          if (flowWorkItems.length > 0) {
            console.log(`   📦 Flow ${flowOriginId.substring(0, 8)}...: ${flowWorkItems.length} items`);
            
            for (const work of flowWorkItems) {
              const asset = extractAsset(work, `flow-${flowOriginId.substring(0, 8)}`);
              if (asset && !assetMap.has(asset.name.toLowerCase())) {
                assetMap.set(asset.name.toLowerCase(), asset);
              }
            }
          }
        }
      } catch (err) {
        // Silent fail for individual flow queries
      }
    }
    
    // 4. Try GraphQL for more complete coverage
    console.log('   📋 Trying GraphQL for additional assets...');
    
    for (const flowOriginId of ALL_WORKFLOW_FLOW_ORIGINS.slice(0, 5)) { // Limit to first 5 to avoid timeout
      try {
        // Simple GraphQL query to get work items
        const query = `query {
          works(
            flowOriginIds: ["${flowOriginId}"]
            limit: 500
            showCompleted: true
            showDeleted: false
            showInProgress: true
          ) {
            id
            displayName
            flowType
            data
          }
        }`;
        
        const graphQLResult = await makeGraphQLRequest(query, token);
        
        if (graphQLResult.statusCode === 200) {
          const graphQLData = JSON.parse(graphQLResult.body);
          const graphQLWorks = graphQLData?.data?.works || [];
          
          if (graphQLWorks.length > 0) {
            console.log(`   📦 GraphQL flow ${flowOriginId.substring(0, 8)}...: ${graphQLWorks.length} items`);
            
            for (const work of graphQLWorks) {
              const asset = extractAsset(work, `graphql-${flowOriginId.substring(0, 8)}`);
              if (asset && !assetMap.has(asset.name.toLowerCase())) {
                assetMap.set(asset.name.toLowerCase(), asset);
              }
            }
          }
        }
      } catch (err) {
        // Silent fail for GraphQL queries
      }
    }
    
    console.log(`   ✅ Total unique assets after GraphQL: ${assetMap.size}`);
    
    // Convert map to array
    const allAssets = Array.from(assetMap.values());
    
    // Extract unique MMSI values
    const mmsiList = allAssets
      .filter(a => a.mmsi && String(a.mmsi).length === 9)
      .map(a => ({ name: a.name, mmsi: a.mmsi, registry: a.registry }));
    
    console.log(`📦 Total unique assets extracted: ${allAssets.length}`);
    console.log(`📡 Vessels with valid MMSI: ${mmsiList.length}`);
    
    res.json({
      success: true,
      data: {
        totalAssets: allAssets.length,
        source: 'work-items',
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

// GET /api/marinestream/asset/:assetId - Get single asset details with generalArrangement
// This endpoint fetches the asset and any associated GA template from work items
router.get('/asset/:assetId', async (req, res) => {
  const token = getTokenFromRequest(req);
  const { assetId } = req.params;
  
  if (!token) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authorization token required' }
    });
  }

  try {
    console.log(`🔍 Fetching asset details for ${assetId}...`);
    
    // Try to get the asset directly using thing API
    const assetRes = await makeApiRequest(`/api/v3/thing/${assetId}`, token);
    
    let asset = null;
    if (assetRes.statusCode === 200) {
      asset = JSON.parse(assetRes.body);
    }
    
    // If direct fetch failed, search through registries
    if (!asset) {
      for (const [registryName, registryId] of Object.entries(FLOW_ORIGINS.assetRegistries)) {
        if (registryId.includes('_FLOW_ORIGIN_ID')) continue;
        
        try {
          const result = await makeApiRequest(`/api/v3/thing?thingTypeId=${registryId}`, token);
          if (result.statusCode === 200) {
            const assets = JSON.parse(result.body);
            asset = assets.find(a => a.id === assetId);
            if (asset) {
              asset.registry = registryName;
              break;
            }
          }
        } catch (err) {
          // Continue to next registry
        }
      }
    }
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        error: { message: 'Asset not found' }
      });
    }
    
    // Extract asset details
    const assetDetails = {
      id: asset.id,
      name: asset.displayName || asset.name || asset.data?.name,
      registry: asset.registry || asset.thingType,
      mmsi: asset.data?.mmsi || asset.data?.MMSI,
      imo: asset.data?.imo || asset.data?.IMO,
      class: asset.data?.class,
      pennant: asset.data?.pennant,
      flag: asset.data?.flag,
      vesselType: asset.data?.vesselType || asset.data?.type,
      // Include generalArrangement if it exists on the asset
      generalArrangement: asset.data?.generalArrangement || null,
      // Include raw data for debugging
      rawData: asset.data
    };
    
    // If no GA on asset, look for it in recent work items
    if (!assetDetails.generalArrangement) {
      const vesselName = assetDetails.name;
      
      for (const flowOriginId of ALL_WORKFLOW_FLOW_ORIGINS) {
        try {
          const workRes = await makeApiRequest(`/api/v3/work/user/open?flowOriginId=${flowOriginId}`, token);
          
          if (workRes.statusCode === 200) {
            const works = JSON.parse(workRes.body);
            
            // Find work items for this vessel that have GA data
            for (const work of works) {
              const vessel = work.data?.ranVessel || work.data?.vessel;
              const vName = vessel?.displayName || vessel?.name || vessel?.data?.name || '';
              
              if (vName.toLowerCase() === vesselName.toLowerCase() || 
                  vName.toLowerCase().includes(vesselName.toLowerCase())) {
                const vesselData = vessel?.data || {};
                
                if (vesselData.generalArrangement && Array.isArray(vesselData.generalArrangement)) {
                  assetDetails.generalArrangement = vesselData.generalArrangement;
                  assetDetails.generalArrangementSource = {
                    workId: work.id,
                    workCode: work.workCode,
                    flowType: work.flowType,
                    lastModified: work.lastModified
                  };
                  break;
                }
              }
            }
            
            if (assetDetails.generalArrangement) break;
          }
        } catch (err) {
          // Continue to next flow
        }
      }
    }
    
    // If still no GA, provide a default template based on vessel type
    if (!assetDetails.generalArrangement) {
      // Default GA template for biofouling inspections
      assetDetails.generalArrangement = getDefaultGATemplate(assetDetails.vesselType);
      assetDetails.generalArrangementSource = { type: 'default_template' };
    }
    
    console.log(`✅ Asset found: ${assetDetails.name}, GA components: ${assetDetails.generalArrangement?.length || 0}`);
    
    res.json({
      success: true,
      data: assetDetails
    });
  } catch (error) {
    console.error('Asset details API error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message }
    });
  }
});

/**
 * Get default General Arrangement template based on vessel type
 * These are the standard hull zones for biofouling inspection
 */
function getDefaultGATemplate(vesselType) {
  // Standard hull zones for most vessels
  const standardZones = [
    { name: 'Bow Thruster', GAComponent: 'bow_thruster', description: 'Bow thruster tunnel and surrounds' },
    { name: 'Forward Hull - Port', GAComponent: 'hull_fwd_port', description: 'Forward hull section, port side' },
    { name: 'Forward Hull - Starboard', GAComponent: 'hull_fwd_stbd', description: 'Forward hull section, starboard side' },
    { name: 'Midship Hull - Port', GAComponent: 'hull_mid_port', description: 'Midship hull section, port side' },
    { name: 'Midship Hull - Starboard', GAComponent: 'hull_mid_stbd', description: 'Midship hull section, starboard side' },
    { name: 'Aft Hull - Port', GAComponent: 'hull_aft_port', description: 'Aft hull section, port side' },
    { name: 'Aft Hull - Starboard', GAComponent: 'hull_aft_stbd', description: 'Aft hull section, starboard side' },
    { name: 'Flat Bottom', GAComponent: 'flat_bottom', description: 'Flat bottom area' },
    { name: 'Sea Chests', GAComponent: 'sea_chests', description: 'Sea chest intakes and gratings' },
    { name: 'Propeller - Port', GAComponent: 'prop_port', description: 'Port propeller and shaft' },
    { name: 'Propeller - Starboard', GAComponent: 'prop_stbd', description: 'Starboard propeller and shaft' },
    { name: 'Rudder', GAComponent: 'rudder', description: 'Rudder and steering gear' },
    { name: 'Stern Tube', GAComponent: 'stern_tube', description: 'Stern tube seals and area' },
    { name: 'Waterline - Boot Top', GAComponent: 'boot_top', description: 'Boot top and waterline area' },
    { name: 'Bilge Keels', GAComponent: 'bilge_keels', description: 'Bilge keels, if fitted' }
  ];
  
  return standardZones;
}

module.exports = router;
