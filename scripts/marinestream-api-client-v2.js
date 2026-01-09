/**
 * MarineStream API Client v2
 * 
 * Enhanced based on the Python extraction code analysis.
 * 
 * Key discoveries:
 * - Flow Origin IDs are the key for querying work items
 * - Nested array data for biofouling assessments: generalArrangement[].frRatingData[]
 * - Date range queries supported
 * 
 * API Base: https://api.idiana.io
 */

const https = require('https');
const fs = require('fs');

const PAT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkVFNEQ4MDQ2QjFBODgzMkRBRUQxNjVGOEY3NjlDRkM0QjVFMjY3MkJSUzI1NiIsIng1dCI6IjdrMkFSckdvZ3kydTBXWDQ5Mm5QeExYaVp5cyIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQucmlzZS14LmNvbSIsIm5iZiI6MTc2NzkyODI5MSwiaWF0IjoxNzY3OTI4MjkxLCJleHAiOjE3Njc5MzE4OTEsImF1ZCI6WyJkaWFuYS1hcGkiLCJhZHBjbGVhci1hcGkiXSwic2NvcGUiOlsib3BlbmlkIiwiZW1haWwiLCJwcm9maWxlIiwiZGlhbmEtYXBpIl0sImFtciI6WyJleHRlcm5hbCJdLCJjbGllbnRfaWQiOiI1Mjg3MmEyMy1kNDE5LTQ5NTEtYThkZC05YTUxOTZkMjI1NWIiLCJzdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJhdXRoX3RpbWUiOjE3NTk5NzAwOTMsImlkcCI6ImFhZCIsImVtYWlsIjoibWhhcnZleUBmcmFubWFyaW5lLmNvbS5hdSIsIm5hbWUiOiJtaGFydmV5QGZyYW5tYXJpbmUuY29tLmF1IiwiZGlhbmFTdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJwcmVmZXJyZWRfbmFtZSI6Ik1hdHQgSGFydmV5IiwiY29tcGFueUlkIjoiNjgwYjYyMGItZTFkZS01ODQ4LWJiZmMtNTJhYjU3YmQyM2VlIiwiZGF0YSI6Int9Iiwic2lkIjoiNjU5RDhEQjZGNkJDNEVBNzUyNDUyMzU2MDgxRDYyQkQiLCJqdGkiOiI0QzRDOUVEMUJCMUFDNjc4RDVBQjg3RjNCRjA1MzMxMyJ9.fbQdvaluuwW1GjuGWXVJ_feMBic76x6Vk1YhGdTcBFEkNHBLt3iciA30AT7AlVAvZw-aFcErYOlXacui15yzk8690rOUJjtaaeufswjjk7pmqLW9FfSk-QOkljhDB153zxB7QSgyafsjmN26jP18uO763EpLFo-YFs-mQCLr89SYKa1lTtOOGIB-hmIigrvtCcQAvdDl14R4Rc1W_VOoZ1J8ppYebFZcgcSOlppuO1ucmBspAWxVCJCGPrLlwhZFSHBUp4bbK_XEf_2z1PQDVJJgLln1TuBlk_cZv3U8zG6esB4OkDmheIhJflTxOPLSMgZ3YD77WNaN1ToMOzjbsA';

const API_BASE = 'api.idiana.io';

// Known Flow Origin IDs from Python code + our discovery
const FLOW_ORIGINS = {
  // From Python schema - these are the biofouling workflow origins
  ranBiofouling1: 'c87625d0-74b4-4bef-8ab2-eb2cd65fa833',
  ranBiofouling2: 'ce374b64-dd61-4892-ae40-fd24e625be79',
  ranBiofouling3: '7a3ded1b-aa86-476a-95f7-dda9822b9518',
  ranBiofouling4: 'f7ee94cf-b2e7-4321-9a21-2a179b3830ee',
  
  // From our discovery via flow endpoint
  ranBiofoulingWorkboard: '106b26fc-b1f1-4ea5-9e95-5f7bd81ee181',
  commercialBiofoulingWorkboard: '3490a6ee-7fa6-4cc9-adee-905559229fb5',
  ranVesselsAssets: '6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',
  commercialVesselsAssets: 'e7f07ad3-8dda-4f7b-b293-7de922cf3abe'
};

// Data extraction paths from Python schema
const DATA_PATHS = {
  vessel: {
    name: [
      'data.ranVessel.name',
      'data.vessel.name',
      'data.ranVessel.data.name',
      'data.vessel.data.name',
      'ranVessel.name',
      'vessel.name'
    ],
    class: [
      'data.ranVessel.data.class',
      'data.vessel.data.class',
      'data.class'
    ],
    pennant: [
      'data.ranVessel.data.pennant',
      'data.vessel.data.pennant',
      'data.pennant'
    ]
  },
  job: {
    jobType: ['data.jobType', 'data.data.jobType', 'jobType'],
    inspectionType: ['data.inspectionType', 'data.data.inspectionType', 'inspectionType'],
    workInstruction: ['data.workInstruction', 'data.data.workInstruction', 'workInstruction']
  },
  delivery: {
    actualDate: [
      'data.actualDelivery.startDateTime',
      'actualDelivery.startDateTime',
      'data.data.actualDelivery.startDateTime'
    ]
  },
  biofouling: {
    generalArrangement: 'data.ranVessel.data.generalArrangement',
    // Each GA component has frRatingData array with:
    // foulingRatingType, foulingCoverage, pdrRating, Comments, description
    // Plus: name (component), diverSupervisorComments, expertInspectorComments
  }
};

function makeRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_BASE,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${PAT}`,
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
          headers: res.headers,
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
  return path.split('.').reduce((current, key) => {
    return current && current[key] !== undefined ? current[key] : null;
  }, obj);
}

// Try multiple paths to find a value
function findValue(obj, paths) {
  for (const path of paths) {
    const value = getNestedValue(obj, path);
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return null;
}

// Extract biofouling assessment data
function extractBiofoulingData(workItem) {
  const gaData = getNestedValue(workItem, DATA_PATHS.biofouling.generalArrangement);
  if (!gaData || !Array.isArray(gaData)) return null;
  
  return gaData.map(component => ({
    componentName: component.name || 'Unknown',
    diverComments: component.diverSupervisorComments || null,
    expertComments: component.expertInspectorComments || null,
    ratings: (component.frRatingData || []).map(rating => ({
      type: rating.foulingRatingType,
      coverage: rating.foulingCoverage,
      pdrRating: rating.pdrRating,
      comments: rating.Comments,
      description: rating.description
    }))
  }));
}

async function main() {
  console.log('═'.repeat(70));
  console.log('MarineStream API Client v2 - Enhanced Data Extraction');
  console.log('═'.repeat(70));
  
  const results = {
    exportDate: new Date().toISOString(),
    workItems: [],
    biofoulingAssessments: [],
    vessels: new Map(),
    statistics: {
      totalWorks: 0,
      worksByFlowType: {},
      worksByStatus: {},
      worksByVessel: {}
    }
  };

  // 1. Query all work items with detailed data
  console.log('\n📋 Fetching all work items with full details...\n');
  
  try {
    const workListRes = await makeRequest('/api/v3/work');
    if (workListRes.statusCode !== 200) {
      console.log('Failed to fetch work list:', workListRes.statusCode);
      return;
    }
    
    const workList = JSON.parse(workListRes.body);
    console.log(`Found ${workList.length} work items. Fetching details...\n`);
    
    results.statistics.totalWorks = workList.length;
    
    // Process each work item
    for (let i = 0; i < Math.min(workList.length, 20); i++) { // Limit to 20 for demo
      const work = workList[i];
      console.log(`[${i+1}/${Math.min(workList.length, 20)}] Processing ${work.workCode}...`);
      
      // Extract data using the paths from Python schema
      const extracted = {
        // Root fields
        workId: work.id,
        workCode: work.workCode,
        displayName: work.displayName,
        flowType: work.flowType,
        flowOriginId: work.flowOriginId,
        status: work.currentState || work.status,
        createdDate: work.createdDate,
        lastModified: work.lastModified,
        
        // Vessel data
        vesselName: findValue(work, DATA_PATHS.vessel.name),
        vesselClass: findValue(work, DATA_PATHS.vessel.class),
        vesselPennant: findValue(work, DATA_PATHS.vessel.pennant),
        
        // Job data
        jobType: findValue(work, DATA_PATHS.job.jobType),
        inspectionType: findValue(work, DATA_PATHS.job.inspectionType),
        workInstruction: findValue(work, DATA_PATHS.job.workInstruction),
        
        // Delivery
        actualDeliveryDate: findValue(work, DATA_PATHS.delivery.actualDate),
        
        // Location
        location: work.data?.berthAnchorageLocation || null,
        
        // Major contract flag
        majorContract: work.data?.majorContract || null
      };
      
      // Try to get vessel info from various nested locations
      const vesselObj = work.data?.ranVessel || work.data?.vessel;
      if (vesselObj) {
        extracted.vesselId = vesselObj.id;
        extracted.vesselName = extracted.vesselName || vesselObj.displayName || vesselObj.name;
        extracted.vesselType = vesselObj.thingType || vesselObj.entityType;
        
        // Track unique vessels
        if (vesselObj.id && !results.vessels.has(vesselObj.id)) {
          results.vessels.set(vesselObj.id, {
            id: vesselObj.id,
            name: vesselObj.displayName || vesselObj.name,
            type: vesselObj.thingType || vesselObj.entityType,
            class: extracted.vesselClass,
            pennant: extracted.vesselPennant
          });
        }
      }
      
      // Extract biofouling assessment data
      const biofoulingData = extractBiofoulingData(work);
      if (biofoulingData && biofoulingData.length > 0) {
        results.biofoulingAssessments.push({
          workCode: work.workCode,
          vesselName: extracted.vesselName,
          date: extracted.lastModified,
          components: biofoulingData
        });
      }
      
      results.workItems.push(extracted);
      
      // Update statistics
      const flowType = work.flowType || 'unknown';
      const status = extracted.status || 'unknown';
      const vessel = extracted.vesselName || 'unknown';
      
      results.statistics.worksByFlowType[flowType] = (results.statistics.worksByFlowType[flowType] || 0) + 1;
      results.statistics.worksByStatus[status] = (results.statistics.worksByStatus[status] || 0) + 1;
      results.statistics.worksByVessel[vessel] = (results.statistics.worksByVessel[vessel] || 0) + 1;
    }
    
  } catch (err) {
    console.log('Error:', err.message);
  }

  // 2. Try flow origin queries (like Python code does)
  console.log('\n🔍 Testing flow origin queries...\n');
  
  for (const [name, originId] of Object.entries(FLOW_ORIGINS)) {
    try {
      // Try various query patterns
      const endpoints = [
        `/api/v3/work?flowOriginId=${originId}`,
        `/api/v3/work/query?flowOriginId=${originId}`,
        `/api/v3/flow/${originId}/work`,
        `/api/v3/flow/${originId}/items`
      ];
      
      for (const endpoint of endpoints) {
        const res = await makeRequest(endpoint);
        if (res.statusCode === 200) {
          console.log(`   ✓ ${name}: ${endpoint} works!`);
          break;
        }
      }
    } catch (err) {
      // Silently continue
    }
  }

  // Convert vessels Map to Array
  results.vessels = Array.from(results.vessels.values());

  // Print summary
  console.log('\n' + '═'.repeat(70));
  console.log('EXTRACTION SUMMARY');
  console.log('═'.repeat(70));
  console.log(`Total Work Items Processed: ${results.workItems.length}`);
  console.log(`Unique Vessels: ${results.vessels.length}`);
  console.log(`Biofouling Assessments: ${results.biofoulingAssessments.length}`);
  
  console.log('\n📊 Work by Flow Type:');
  for (const [type, count] of Object.entries(results.statistics.worksByFlowType)) {
    console.log(`   ${type}: ${count}`);
  }
  
  console.log('\n📊 Work by Status:');
  for (const [status, count] of Object.entries(results.statistics.worksByStatus)) {
    console.log(`   ${status}: ${count}`);
  }
  
  console.log('\n📊 Work by Vessel:');
  for (const [vessel, count] of Object.entries(results.statistics.worksByVessel).slice(0, 10)) {
    console.log(`   ${vessel}: ${count}`);
  }
  
  console.log('\n🚢 Vessels with Details:');
  results.vessels.forEach((v, i) => {
    console.log(`   ${i+1}. ${v.name} (${v.type || 'N/A'}) - Class: ${v.class || 'N/A'}, Pennant: ${v.pennant || 'N/A'}`);
  });

  // Save to file
  const outputData = {
    ...results,
    vessels: results.vessels
  };
  
  fs.writeFileSync('marinestream-detailed-export.json', JSON.stringify(outputData, null, 2));
  console.log('\n💾 Saved to: marinestream-detailed-export.json');
}

main().catch(console.error);
