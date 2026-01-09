/**
 * MarineStream API Client
 * 
 * Based on Rise-X API documentation: https://help.rise-x.io/
 * API Base: https://api.idiana.io
 * 
 * Working endpoints discovered:
 * - GET /api/v3/work - List all work items
 * - GET /api/v3/work/{id}?format=standard - Get work item details
 * - GET /api/v3/flow/{id} - Get flow/workflow definition
 * - GET /api/v3/user/{id} - Get user info
 * - GET /api/v3/company/{id} - Get company info
 * - POST /api/v3/entity/create/{flow_origin_id} - Create entity
 * - POST /api/v3/entity/{entity_id}/query - Query entities (hypothetical)
 */

const https = require('https');
const fs = require('fs');

const PAT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkVFNEQ4MDQ2QjFBODgzMkRBRUQxNjVGOEY3NjlDRkM0QjVFMjY3MkJSUzI1NiIsIng1dCI6IjdrMkFSckdvZ3kydTBXWDQ5Mm5QeExYaVp5cyIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQucmlzZS14LmNvbSIsIm5iZiI6MTc2NzkyODI5MSwiaWF0IjoxNzY3OTI4MjkxLCJleHAiOjE3Njc5MzE4OTEsImF1ZCI6WyJkaWFuYS1hcGkiLCJhZHBjbGVhci1hcGkiXSwic2NvcGUiOlsib3BlbmlkIiwiZW1haWwiLCJwcm9maWxlIiwiZGlhbmEtYXBpIl0sImFtciI6WyJleHRlcm5hbCJdLCJjbGllbnRfaWQiOiI1Mjg3MmEyMy1kNDE5LTQ5NTEtYThkZC05YTUxOTZkMjI1NWIiLCJzdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJhdXRoX3RpbWUiOjE3NTk5NzAwOTMsImlkcCI6ImFhZCIsImVtYWlsIjoibWhhcnZleUBmcmFubWFyaW5lLmNvbS5hdSIsIm5hbWUiOiJtaGFydmV5QGZyYW5tYXJpbmUuY29tLmF1IiwiZGlhbmFTdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJwcmVmZXJyZWRfbmFtZSI6Ik1hdHQgSGFydmV5IiwiY29tcGFueUlkIjoiNjgwYjYyMGItZTFkZS01ODQ4LWJiZmMtNTJhYjU3YmQyM2VlIiwiZGF0YSI6Int9Iiwic2lkIjoiNjU5RDhEQjZGNkJDNEVBNzUyNDUyMzU2MDgxRDYyQkQiLCJqdGkiOiI0QzRDOUVEMUJCMUFDNjc4RDVBQjg3RjNCRjA1MzMxMyJ9.fbQdvaluuwW1GjuGWXVJ_feMBic76x6Vk1YhGdTcBFEkNHBLt3iciA30AT7AlVAvZw-aFcErYOlXacui15yzk8690rOUJjtaaeufswjjk7pmqLW9FfSk-QOkljhDB153zxB7QSgyafsjmN26jP18uO763EpLFo-YFs-mQCLr89SYKa1lTtOOGIB-hmIigrvtCcQAvdDl14R4Rc1W_VOoZ1J8ppYebFZcgcSOlppuO1ucmBspAWxVCJCGPrLlwhZFSHBUp4bbK_XEf_2z1PQDVJJgLln1TuBlk_cZv3U8zG6esB4OkDmheIhJflTxOPLSMgZ3YD77WNaN1ToMOzjbsA';

const API_BASE = 'api.idiana.io';

// Flow IDs from app URLs (these appear to be flow/workboard IDs)
const FLOWS = {
  ranBiofouling: '106b26fc-b1f1-4ea5-9e95-5f7bd81ee181',    // RAN work
  commercialBiofouling: '3490a6ee-7fa6-4cc9-adee-905559229fb5',  // Commercial work
  ranVessels: '6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',       // RAN vessels "things"
  commercialVessels: 'e7f07ad3-8dda-4f7b-b293-7de922cf3abe'  // Commercial vessels "things"
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

async function main() {
  console.log('═'.repeat(70));
  console.log('MarineStream API Data Export');
  console.log('═'.repeat(70));
  
  const results = {
    exportDate: new Date().toISOString(),
    user: null,
    company: null,
    flows: [],
    workItems: [],
    vessels: []
  };

  // 1. Get user and company info
  console.log('\n📋 Fetching user and company info...');
  try {
    const userId = '3864d7b0-8893-400a-b829-6869b09af835';
    const companyId = '680b620b-e1de-5848-bbfc-52ab57bd23ee';
    
    const [userRes, companyRes] = await Promise.all([
      makeRequest(`/api/v3/user/${userId}`),
      makeRequest(`/api/v3/company/${companyId}`)
    ]);
    
    if (userRes.statusCode === 200) {
      results.user = JSON.parse(userRes.body);
      console.log(`   ✓ User: ${results.user.displayName} (${results.user.email})`);
    }
    
    if (companyRes.statusCode === 200) {
      results.company = JSON.parse(companyRes.body);
      console.log(`   ✓ Company: ${results.company.displayName}`);
    }
  } catch (err) {
    console.log(`   ✗ Error: ${err.message}`);
  }

  // 2. Get flow definitions
  console.log('\n📊 Fetching workflow definitions...');
  for (const [name, flowId] of Object.entries(FLOWS)) {
    try {
      const res = await makeRequest(`/api/v3/flow/${flowId}`);
      if (res.statusCode === 200) {
        const flow = JSON.parse(res.body);
        results.flows.push({
          id: flowId,
          name: name,
          displayName: flow.displayName,
          flowType: flow.flowType,
          entityType: flow.entityType,
          description: flow.description
        });
        console.log(`   ✓ ${name}: ${flow.displayName || 'N/A'} (${flow.flowType || 'unknown'})`);
      } else {
        console.log(`   ✗ ${name}: ${res.statusCode}`);
      }
    } catch (err) {
      console.log(`   ✗ ${name}: ${err.message}`);
    }
  }

  // 3. Get all work items
  console.log('\n🔧 Fetching work items...');
  try {
    const res = await makeRequest('/api/v3/work');
    if (res.statusCode === 200) {
      const works = JSON.parse(res.body);
      console.log(`   ✓ Found ${works.length} work items`);
      
      // Extract vessel information from work items
      const vesselMap = new Map();
      
      for (const work of works) {
        const workSummary = {
          id: work.id,
          workCode: work.workCode,
          displayName: work.displayName,
          lastModified: work.lastModified,
          vessel: null,
          location: work.data?.berthAnchorageLocation || null,
          status: work.currentState || work.status
        };
        
        // Extract vessel from different possible locations in data
        const vessel = work.data?.ranVessel || work.data?.vessel;
        if (vessel) {
          workSummary.vessel = {
            id: vessel.id,
            name: vessel.displayName || vessel.name,
            type: vessel.thingType || vessel.entityType
          };
          
          // Add to vessel map for deduplication
          if (vessel.id && !vesselMap.has(vessel.id)) {
            vesselMap.set(vessel.id, {
              id: vessel.id,
              name: vessel.displayName || vessel.name,
              type: vessel.thingType || vessel.entityType,
              resourceId: vessel.resourceId,
              companyId: vessel.companyId
            });
          }
        }
        
        results.workItems.push(workSummary);
      }
      
      results.vessels = Array.from(vesselMap.values());
      console.log(`   ✓ Extracted ${results.vessels.length} unique vessels`);
    }
  } catch (err) {
    console.log(`   ✗ Error: ${err.message}`);
  }

  // 4. Try entity query endpoints
  console.log('\n🔍 Exploring entity/asset endpoints...');
  const entityEndpoints = [
    ['/api/v3/entity/list', 'Entity list'],
    ['/api/v3/entity/query', 'Entity query'],
    [`/api/v3/entity/${FLOWS.ranVessels}`, 'RAN Vessels entity'],
    [`/api/v3/entity/${FLOWS.ranVessels}/list`, 'RAN Vessels entity list'],
    ['/api/v3/resource', 'Resources'],
    ['/api/v3/thing/list', 'Thing list'],
    ['/api/v3/thing/query', 'Thing query'],
  ];
  
  for (const [path, name] of entityEndpoints) {
    try {
      const res = await makeRequest(path);
      console.log(`   ${res.statusCode === 200 ? '✓' : '✗'} ${name}: ${res.statusCode}`);
      if (res.statusCode === 200) {
        const body = res.body.substring(0, 100);
        console.log(`      Preview: ${body}...`);
      }
    } catch (err) {
      console.log(`   ✗ ${name}: ${err.message}`);
    }
  }

  // 5. Try POST queries to entity endpoint
  console.log('\n📤 Trying POST queries to entity endpoint...');
  const postQueries = [
    {
      path: `/api/v3/entity/${FLOWS.ranVessels}/query`,
      name: 'Query RAN Vessels',
      body: {}
    },
    {
      path: '/api/v3/work/query',
      name: 'Query Works',
      body: { flowType: 'marinestream/ranvessel/biofouling' }
    },
    {
      path: '/api/v3/thing/query',
      name: 'Query Things',
      body: { thingType: 'RanVessel' }
    }
  ];
  
  for (const query of postQueries) {
    try {
      const res = await makeRequest(query.path, 'POST', query.body);
      console.log(`   ${res.statusCode === 200 ? '✓' : '✗'} ${query.name}: ${res.statusCode}`);
      if (res.statusCode === 200) {
        console.log(`      Response: ${res.body.substring(0, 200)}...`);
      } else if (res.body) {
        console.log(`      Error: ${res.body.substring(0, 200)}`);
      }
    } catch (err) {
      console.log(`   ✗ ${query.name}: ${err.message}`);
    }
  }

  // Save results
  console.log('\n═'.repeat(70));
  console.log('SUMMARY');
  console.log('═'.repeat(70));
  console.log(`User: ${results.user?.displayName || 'N/A'}`);
  console.log(`Company: ${results.company?.displayName || 'N/A'}`);
  console.log(`Flows discovered: ${results.flows.length}`);
  console.log(`Work items: ${results.workItems.length}`);
  console.log(`Unique vessels: ${results.vessels.length}`);
  
  // Save to JSON file
  fs.writeFileSync('marinestream-data-export.json', JSON.stringify(results, null, 2));
  console.log(`\n💾 Data saved to: marinestream-data-export.json`);
  
  // Print vessels
  if (results.vessels.length > 0) {
    console.log('\n🚢 VESSELS FOUND:');
    console.log('-'.repeat(50));
    results.vessels.forEach((v, i) => {
      console.log(`${i+1}. ${v.name} (${v.type})`);
      console.log(`   ID: ${v.id}`);
    });
  }
  
  // Print recent work items
  console.log('\n📋 RECENT WORK ITEMS (Last 10):');
  console.log('-'.repeat(50));
  results.workItems.slice(0, 10).forEach((w, i) => {
    console.log(`${i+1}. ${w.workCode} - ${w.displayName}`);
    if (w.vessel) console.log(`   Vessel: ${w.vessel.name}`);
    if (w.location) console.log(`   Location: ${w.location}`);
  });
}

main().catch(console.error);
