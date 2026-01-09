/**
 * Rise-X / MarineStream API Explorer
 * Based on API documentation from https://help.rise-x.io/
 * 
 * API Base URL: https://api.idiana.io
 * 
 * Key endpoints:
 * - GET /api/v3/work/{work_id}?format=standard - Get work data
 * - GET /api/v3/flow/{flow_id} - Get flow data
 * - POST /api/v3/work - Create work
 * - POST /api/v3/flow/submit/{work_id} - Submit workflow step
 */

const https = require('https');

// PAT from the user (still valid based on previous testing with UserInfo endpoint)
const PAT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkVFNEQ4MDQ2QjFBODgzMkRBRUQxNjVGOEY3NjlDRkM0QjVFMjY3MkJSUzI1NiIsIng1dCI6IjdrMkFSckdvZ3kydTBXWDQ5Mm5QeExYaVp5cyIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQucmlzZS14LmNvbSIsIm5iZiI6MTc2NzkyODI5MSwiaWF0IjoxNzY3OTI4MjkxLCJleHAiOjE3Njc5MzE4OTEsImF1ZCI6WyJkaWFuYS1hcGkiLCJhZHBjbGVhci1hcGkiXSwic2NvcGUiOlsib3BlbmlkIiwiZW1haWwiLCJwcm9maWxlIiwiZGlhbmEtYXBpIl0sImFtciI6WyJleHRlcm5hbCJdLCJjbGllbnRfaWQiOiI1Mjg3MmEyMy1kNDE5LTQ5NTEtYThkZC05YTUxOTZkMjI1NWIiLCJzdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJhdXRoX3RpbWUiOjE3NTk5NzAwOTMsImlkcCI6ImFhZCIsImVtYWlsIjoibWhhcnZleUBmcmFubWFyaW5lLmNvbS5hdSIsIm5hbWUiOiJtaGFydmV5QGZyYW5tYXJpbmUuY29tLmF1IiwiZGlhbmFTdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJwcmVmZXJyZWRfbmFtZSI6Ik1hdHQgSGFydmV5IiwiY29tcGFueUlkIjoiNjgwYjYyMGItZTFkZS01ODQ4LWJiZmMtNTJhYjU3YmQyM2VlIiwiZGF0YSI6Int9Iiwic2lkIjoiNjU5RDhEQjZGNkJDNEVBNzUyNDUyMzU2MDgxRDYyQkQiLCJqdGkiOiI0QzRDOUVEMUJCMUFDNjc4RDVBQjg3RjNCRjA1MzMxMyJ9.fbQdvaluuwW1GjuGWXVJ_feMBic76x6Vk1YhGdTcBFEkNHBLt3iciA30AT7AlVAvZw-aFcErYOlXacui15yzk8690rOUJjtaaeufswjjk7pmqLW9FfSk-QOkljhDB153zxB7QSgyafsjmN26jP18uO763EpLFo-YFs-mQCLr89SYKa1lTtOOGIB-hmIigrvtCcQAvdDl14R4Rc1W_VOoZ1J8ppYebFZcgcSOlppuO1ucmBspAWxVCJCGPrLlwhZFSHBUp4bbK_XEf_2z1PQDVJJgLln1TuBlk_cZv3U8zG6esB4OkDmheIhJflTxOPLSMgZ3YD77WNaN1ToMOzjbsA';

// API Base URL from documentation
const API_BASE = 'api.idiana.io';

// IDs extracted from the user's provided URLs
const IDS = {
  // Things (Assets/Vessels)
  ranVessels: '6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',
  commercialVessels: 'e7f07ad3-8dda-4f7b-b293-7de922cf3abe',
  
  // Workboards
  ranWork: '106b26fc-b1f1-4ea5-9e95-5f7bd81ee181',
  commercialWork: '3490a6ee-7fa6-4cc9-adee-905559229fb5',
  
  // User info from JWT
  userId: '3864d7b0-8893-400a-b829-6869b09af835',
  companyId: '680b620b-e1de-5848-bbfc-52ab57bd23ee'
};

function makeRequest(path, method = 'GET') {
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
    req.end();
  });
}

async function testEndpoint(name, path) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`URL: https://${API_BASE}${path}`);
  console.log('='.repeat(60));
  
  try {
    const result = await makeRequest(path);
    console.log(`Status: ${result.statusCode}`);
    console.log(`Content-Type: ${result.headers['content-type']}`);
    
    if (result.statusCode === 200) {
      try {
        const json = JSON.parse(result.body);
        console.log('Response (formatted):');
        console.log(JSON.stringify(json, null, 2).substring(0, 2000));
        if (JSON.stringify(json).length > 2000) {
          console.log('... (truncated)');
        }
      } catch {
        console.log('Response (raw):');
        console.log(result.body.substring(0, 1000));
      }
    } else {
      console.log('Response:', result.body.substring(0, 500));
    }
  } catch (error) {
    console.log('Error:', error.message);
  }
}

async function main() {
  console.log('Rise-X / iDiana API Explorer');
  console.log('============================\n');
  
  // Check token expiry
  const payload = JSON.parse(Buffer.from(PAT.split('.')[1], 'base64').toString());
  const expiry = new Date(payload.exp * 1000);
  const now = new Date();
  console.log(`Token expires: ${expiry.toISOString()}`);
  console.log(`Current time:  ${now.toISOString()}`);
  console.log(`Token ${expiry > now ? 'is VALID' : 'has EXPIRED'}\n`);
  
  if (expiry < now) {
    console.log('⚠️  Token has expired! Need a fresh PAT to continue.');
    return;
  }

  // Test various API endpoints based on documentation
  const endpoints = [
    // API Root/Version
    ['API Root', '/'],
    ['API Version', '/api/v3'],
    
    // Work endpoints (from documentation)
    ['Work - RAN Work', `/api/v3/work/${IDS.ranWork}?format=standard`],
    ['Work - Commercial Work', `/api/v3/work/${IDS.commercialWork}?format=standard`],
    
    // Try workboard endpoints (guessing based on app URLs)
    ['Workboard - RAN', `/api/v3/workboard/${IDS.ranWork}`],
    ['Workboard Query', `/api/v3/workboard/${IDS.ranWork}/query`],
    
    // Thing/Asset endpoints (guessing based on app URLs)
    ['Thing - RAN Vessels', `/api/v3/thing/${IDS.ranVessels}`],
    ['Thing - Commercial Vessels', `/api/v3/thing/${IDS.commercialVessels}`],
    
    // Try "things" plural
    ['Things - RAN Vessels', `/api/v3/things/${IDS.ranVessels}`],
    
    // Try asset endpoints
    ['Asset - RAN Vessels', `/api/v3/asset/${IDS.ranVessels}`],
    
    // User/Company endpoints
    ['User Info', `/api/v3/user/${IDS.userId}`],
    ['Company Info', `/api/v3/company/${IDS.companyId}`],
    
    // Performance/Explorer endpoints (guessing)
    ['Performance Explorer', `/api/v3/performance/explorer`],
    ['Performance Query', `/api/v3/performance/query`],
    
    // Flow endpoints (from documentation)
    ['Flow - RAN Work', `/api/v3/flow/${IDS.ranWork}`],
    
    // OData style queries
    ['OData Work Query', `/api/v3/odata/work`],
    ['OData Things Query', `/api/v3/odata/things`],
    
    // List all
    ['List Works', `/api/v3/work`],
    ['List Things', `/api/v3/things`],
    ['List Assets', `/api/v3/assets`],
  ];

  for (const [name, path] of endpoints) {
    await testEndpoint(name, path);
  }
}

main().catch(console.error);
