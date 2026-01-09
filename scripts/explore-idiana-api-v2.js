/**
 * Rise-X / MarineStream API Explorer v2
 * Deeper exploration of the working endpoints
 */

const https = require('https');

const PAT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkVFNEQ4MDQ2QjFBODgzMkRBRUQxNjVGOEY3NjlDRkM0QjVFMjY3MkJSUzI1NiIsIng1dCI6IjdrMkFSckdvZ3kydTBXWDQ5Mm5QeExYaVp5cyIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQucmlzZS14LmNvbSIsIm5iZiI6MTc2NzkyODI5MSwiaWF0IjoxNzY3OTI4MjkxLCJleHAiOjE3Njc5MzE4OTEsImF1ZCI6WyJkaWFuYS1hcGkiLCJhZHBjbGVhci1hcGkiXSwic2NvcGUiOlsib3BlbmlkIiwiZW1haWwiLCJwcm9maWxlIiwiZGlhbmEtYXBpIl0sImFtciI6WyJleHRlcm5hbCJdLCJjbGllbnRfaWQiOiI1Mjg3MmEyMy1kNDE5LTQ5NTEtYThkZC05YTUxOTZkMjI1NWIiLCJzdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJhdXRoX3RpbWUiOjE3NTk5NzAwOTMsImlkcCI6ImFhZCIsImVtYWlsIjoibWhhcnZleUBmcmFubWFyaW5lLmNvbS5hdSIsIm5hbWUiOiJtaGFydmV5QGZyYW5tYXJpbmUuY29tLmF1IiwiZGlhbmFTdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJwcmVmZXJyZWRfbmFtZSI6Ik1hdHQgSGFydmV5IiwiY29tcGFueUlkIjoiNjgwYjYyMGItZTFkZS01ODQ4LWJiZmMtNTJhYjU3YmQyM2VlIiwiZGF0YSI6Int9Iiwic2lkIjoiNjU5RDhEQjZGNkJDNEVBNzUyNDUyMzU2MDgxRDYyQkQiLCJqdGkiOiI0QzRDOUVEMUJCMUFDNjc4RDVBQjg3RjNCRjA1MzMxMyJ9.fbQdvaluuwW1GjuGWXVJ_feMBic76x6Vk1YhGdTcBFEkNHBLt3iciA30AT7AlVAvZw-aFcErYOlXacui15yzk8690rOUJjtaaeufswjjk7pmqLW9FfSk-QOkljhDB153zxB7QSgyafsjmN26jP18uO763EpLFo-YFs-mQCLr89SYKa1lTtOOGIB-hmIigrvtCcQAvdDl14R4Rc1W_VOoZ1J8ppYebFZcgcSOlppuO1ucmBspAWxVCJCGPrLlwhZFSHBUp4bbK_XEf_2z1PQDVJJgLln1TuBlk_cZv3U8zG6esB4OkDmheIhJflTxOPLSMgZ3YD77WNaN1ToMOzjbsA';

const API_BASE = 'api.idiana.io';

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

async function main() {
  console.log('Rise-X API Deep Exploration v2');
  console.log('================================\n');

  // 1. Get full work list
  console.log('1. FETCHING ALL WORK ITEMS...\n');
  try {
    const workRes = await makeRequest('/api/v3/work');
    if (workRes.statusCode === 200) {
      const works = JSON.parse(workRes.body);
      console.log(`Found ${works.length} work items:\n`);
      
      works.forEach((work, i) => {
        console.log(`  [${i+1}] ${work.workCode} - ${work.displayName}`);
        console.log(`      ID: ${work.id}`);
        console.log(`      Last Modified: ${work.lastModified}`);
        if (work.data?.ranVessel?.displayName) {
          console.log(`      Vessel: ${work.data.ranVessel.displayName}`);
        }
        if (work.data?.vessel?.displayName) {
          console.log(`      Vessel: ${work.data.vessel.displayName}`);
        }
        console.log('');
      });

      // Try to get details of first work item
      if (works.length > 0) {
        const firstWorkId = works[0].id;
        console.log(`\n2. FETCHING FIRST WORK ITEM DETAILS: ${firstWorkId}\n`);
        const detailRes = await makeRequest(`/api/v3/work/${firstWorkId}?format=standard`);
        console.log(`Status: ${detailRes.statusCode}`);
        if (detailRes.statusCode === 200) {
          const detail = JSON.parse(detailRes.body);
          console.log('Keys:', Object.keys(detail).join(', '));
          console.log('\nFull response (truncated):');
          console.log(JSON.stringify(detail, null, 2).substring(0, 3000));
        } else {
          console.log('Response:', detailRes.body.substring(0, 500));
        }
      }
    }
  } catch (err) {
    console.log('Error:', err.message);
  }

  // 3. Explore additional endpoints
  console.log('\n\n3. EXPLORING ADDITIONAL ENDPOINTS...\n');
  
  const endpoints = [
    // Entity/Resource patterns
    ['/api/v3/entity', 'Entity list'],
    ['/api/v3/resource', 'Resource list'],
    ['/api/v3/resources', 'Resources list'],
    
    // Tenant/Company specific
    ['/api/v3/tenant', 'Tenant info'],
    ['/api/v3/me', 'Current user'],
    
    // Workboard patterns
    ['/api/v3/workboards', 'Workboards list'],
    ['/api/v3/dashboard', 'Dashboard'],
    ['/api/v3/dashboards', 'Dashboards list'],
    
    // Thing patterns (from the app URLs)
    ['/api/v3/thing', 'Thing list'],
    ['/api/v3/thingtype', 'Thing types'],
    ['/api/v3/thingtypes', 'Thing types list'],
    
    // Query patterns
    ['/api/v3/query', 'Query endpoint'],
    ['/api/v3/search', 'Search endpoint'],
    
    // Swagger/OpenAPI
    ['/swagger', 'Swagger UI'],
    ['/swagger/v1/swagger.json', 'Swagger JSON'],
    ['/api-docs', 'API Docs'],
  ];

  for (const [path, name] of endpoints) {
    try {
      const res = await makeRequest(path);
      console.log(`${name} (${path}): ${res.statusCode}`);
      if (res.statusCode === 200) {
        const body = res.body.substring(0, 200);
        console.log(`  Response preview: ${body}...`);
      }
    } catch (err) {
      console.log(`${name} (${path}): Error - ${err.message}`);
    }
  }

  // 4. Get flow details to understand workboards
  console.log('\n\n4. FLOW DETAILS FOR RAN BIOFOULING...\n');
  try {
    const flowRes = await makeRequest('/api/v3/flow/106b26fc-b1f1-4ea5-9e95-5f7bd81ee181');
    if (flowRes.statusCode === 200) {
      const flow = JSON.parse(flowRes.body);
      console.log('Flow name:', flow.displayName);
      console.log('Flow type:', flow.flowType);
      console.log('Entity type:', flow.entityType);
      console.log('Environment:', flow.environment);
      console.log('Description:', flow.description);
      
      // Look for workboard-related properties
      console.log('\nAll top-level keys:', Object.keys(flow).join(', '));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }

  // 5. Try to list flows
  console.log('\n\n5. LISTING ALL FLOWS...\n');
  try {
    const flowsRes = await makeRequest('/api/v3/flow');
    console.log(`Status: ${flowsRes.statusCode}`);
    if (flowsRes.statusCode === 200) {
      const flows = JSON.parse(flowsRes.body);
      if (Array.isArray(flows)) {
        console.log(`Found ${flows.length} flows:`);
        flows.slice(0, 10).forEach(f => {
          console.log(`  - ${f.displayName || f.name} (${f.id})`);
        });
      } else {
        console.log('Response:', JSON.stringify(flows, null, 2).substring(0, 1000));
      }
    } else {
      console.log('Response:', flowsRes.body.substring(0, 300));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

main().catch(console.error);
