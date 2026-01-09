/**
 * MarineStream Core API Explorer v2
 * Looking for the actual Diana API endpoints
 */

const https = require('https');

const PAT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkVFNEQ4MDQ2QjFBODgzMkRBRUQxNjVGOEY3NjlDRkM0QjVFMjY3MkJSUzI1NiIsIng1dCI6IjdrMkFSckdvZ3kydTBXWDQ5Mm5QeExYaVp5cyIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQucmlzZS14LmNvbSIsIm5iZiI6MTc2NzkyODI5MSwiaWF0IjoxNzY3OTI4MjkxLCJleHAiOjE3Njc5MzE4OTEsImF1ZCI6WyJkaWFuYS1hcGkiLCJhZHBjbGVhci1hcGkiXSwic2NvcGUiOlsib3BlbmlkIiwiZW1haWwiLCJwcm9maWxlIiwiZGlhbmEtYXBpIl0sImFtciI6WyJleHRlcm5hbCJdLCJjbGllbnRfaWQiOiI1Mjg3MmEyMy1kNDE5LTQ5NTEtYThkZC05YTUxOTZkMjI1NWIiLCJzdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJhdXRoX3RpbWUiOjE3NTk5NzAwOTMsImlkcCI6ImFhZCIsImVtYWlsIjoibWhhcnZleUBmcmFubWFyaW5lLmNvbS5hdSIsIm5hbWUiOiJtaGFydmV5QGZyYW5tYXJpbmUuY29tLmF1IiwiZGlhbmFTdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJwcmVmZXJyZWRfbmFtZSI6Ik1hdHQgSGFydmV5IiwiY29tcGFueUlkIjoiNjgwYjYyMGItZTFkZS01ODQ4LWJiZmMtNTJhYjU3YmQyM2VlIiwiZGF0YSI6Int9Iiwic2lkIjoiNjU5RDhEQjZGNkJDNEVBNzUyNDUyMzU2MDgxRDYyQkQiLCJqdGkiOiI0QzRDOUVEMUJCMUFDNjc4RDVBQjg3RjNCRjA1MzMxMyJ9.fbQdvaluuwW1GjuGWXVJ_feMBic76x6Vk1YhGdTcBFEkNHBLt3iciA30AT7AlVAvZw-aFcErYOlXacui15yzk8690rOUJjtaaeufswjjk7pmqLW9FfSk-QOkljhDB153zxB7QSgyafsjmN26jP18uO763EpLFo-YFs-mQCLr89SYKa1lTtOOGIB-hmIigrvtCcQAvdDl14R4Rc1W_VOoZ1J8ppYebFZcgcSOlppuO1ucmBspAWxVCJCGPrLlwhZFSHBUp4bbK_XEf_2z1PQDVJJgLln1TuBlk_cZv3U8zG6esB4OkDmheIhJflTxOPLSMgZ3YD77WNaN1ToMOzjbsA';

// Decode JWT to check expiry
function decodeJWT(token) {
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
  return payload;
}

const payload = decodeJWT(PAT);
console.log('JWT Payload:');
console.log(JSON.stringify(payload, null, 2));
console.log('\nToken expiry:', new Date(payload.exp * 1000).toISOString());
console.log('Current time:', new Date().toISOString());
console.log('Token expired:', Date.now() > payload.exp * 1000);

// Possible API base URLs based on Diana platform patterns
const API_BASES = [
  'https://diana-api.rise-x.io',
  'https://diana.rise-x.io',
  'https://api.rise-x.io/diana',
  'https://app.rise-x.io/diana-api',
  'https://app.marinestream.io/diana-api',
  'https://gateway.rise-x.io',
  'https://app.rise-x.io/graphql',
  'https://app.marinestream.io/graphql'
];

// Diana platform typical API patterns
const API_PATHS = [
  // Things (assets/vessels)
  '/api/v1/things',
  '/api/things',
  '/things',
  '/v1/things',
  '/api/v1/assets',
  '/api/assets',
  
  // Specific thing by ID
  '/api/v1/things/6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',
  '/things/6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',
  
  // Workboards
  '/api/v1/workboards',
  '/api/workboards',
  '/workboards',
  '/api/v1/workboard/106b26fc-b1f1-4ea5-9e95-5f7bd81ee181',
  
  // Common Diana endpoints
  '/api/v1/me',
  '/api/me',
  '/me',
  '/api/v1/companies',
  '/api/companies',
  '/api/v1/tenants/marinestream',
  
  // GraphQL
  '/graphql',
  
  // Health/status
  '/health',
  '/api/health',
  '/status'
];

async function makeRequest(url, options = {}) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      
      const reqOptions = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers: {
          'Authorization': `Bearer ${PAT}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'X-Tenant': 'marinestream',
          ...options.headers
        },
        timeout: 5000
      };

      const req = https.request(reqOptions, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: data,
            contentType: res.headers['content-type']
          });
        });
      });

      req.on('error', (err) => resolve({ error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        resolve({ error: 'timeout' });
      });

      if (options.body) {
        req.write(JSON.stringify(options.body));
      }
      
      req.end();
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

async function testGraphQL(baseUrl) {
  console.log(`\nTesting GraphQL at ${baseUrl}/graphql...`);
  
  // Introspection query
  const query = {
    query: `{
      __schema {
        types {
          name
        }
      }
    }`
  };
  
  const result = await makeRequest(`${baseUrl}/graphql`, {
    method: 'POST',
    body: query
  });
  
  if (!result.error && result.status === 200 && result.contentType?.includes('json')) {
    try {
      const json = JSON.parse(result.data);
      if (json.data || json.errors) {
        console.log('✓ GraphQL endpoint found!');
        console.log(JSON.stringify(json, null, 2).substring(0, 1000));
        return true;
      }
    } catch (e) {}
  }
  
  return false;
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Diana API Deep Discovery                                  ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const found = [];
  
  for (const base of API_BASES) {
    console.log(`\n--- Testing base: ${base} ---`);
    
    // Check if host resolves
    const healthResult = await makeRequest(`${base}/health`);
    if (healthResult.error && healthResult.error.includes('getaddrinfo')) {
      console.log('  ✗ Host not found');
      continue;
    }
    
    // Test GraphQL first
    await testGraphQL(base);
    
    // Test REST endpoints
    for (const path of API_PATHS.slice(0, 10)) { // Limit to first 10 for speed
      const url = `${base}${path}`;
      const result = await makeRequest(url);
      
      if (result.error) {
        continue;
      }
      
      const isJson = result.contentType?.includes('json');
      const isHtml = result.contentType?.includes('html');
      
      if (result.status === 200 && isJson) {
        console.log(`  ✓ ${path} - JSON response!`);
        try {
          const json = JSON.parse(result.data);
          console.log(`    Preview: ${JSON.stringify(json).substring(0, 200)}`);
          found.push({ url, data: json });
        } catch (e) {
          console.log(`    Raw: ${result.data.substring(0, 100)}`);
        }
      } else if (result.status === 401) {
        console.log(`  ○ ${path} - 401 (auth required - endpoint exists!)`);
        found.push({ url, note: 'requires auth' });
      } else if (result.status === 403) {
        console.log(`  ○ ${path} - 403 (forbidden - endpoint exists!)`);
        found.push({ url, note: 'forbidden' });
      } else if (result.status === 404 && isJson) {
        // Sometimes 404 with JSON body still tells us about the API
        try {
          const json = JSON.parse(result.data);
          if (json.error || json.message) {
            console.log(`  ~ ${path} - 404 but API-style response`);
          }
        } catch (e) {}
      }
    }
  }
  
  // Also try the app URLs with Accept: application/json header
  console.log('\n--- Testing app URLs with JSON Accept header ---');
  
  const appEndpoints = [
    'https://app.rise-x.io/api/things',
    'https://app.rise-x.io/api/v1/things',
    'https://app.marinestream.io/api/things',
    'https://app.marinestream.io/api/v1/things',
    'https://app.rise-x.io/api/workboards',
    'https://app.rise-x.io/api/v1/workboards'
  ];
  
  for (const url of appEndpoints) {
    const result = await makeRequest(url);
    if (!result.error) {
      const isJson = result.contentType?.includes('json');
      console.log(`${url}: ${result.status} (${isJson ? 'JSON' : 'HTML'})`);
      if (isJson && result.status === 200) {
        try {
          const json = JSON.parse(result.data);
          console.log(`  Data: ${JSON.stringify(json).substring(0, 300)}`);
          found.push({ url, data: json });
        } catch (e) {}
      }
    }
  }
  
  console.log('\n\n=== SUMMARY ===');
  if (found.length > 0) {
    console.log('Found endpoints:');
    found.forEach(f => console.log(`  - ${f.url} ${f.note || ''}`));
  } else {
    console.log('No API endpoints found. The Diana platform may use:');
    console.log('1. A different authentication method');
    console.log('2. WebSocket for data');
    console.log('3. Server-side rendering with session cookies');
  }
}

main().catch(console.error);
