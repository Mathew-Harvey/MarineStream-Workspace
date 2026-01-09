/**
 * MarineStream Core API Explorer
 * Discovers and tests available API endpoints
 */

const https = require('https');

const PAT = process.env.MARINESTREAM_PAT || 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkVFNEQ4MDQ2QjFBODgzMkRBRUQxNjVGOEY3NjlDRkM0QjVFMjY3MkJSUzI1NiIsIng1dCI6IjdrMkFSckdvZ3kydTBXWDQ5Mm5QeExYaVp5cyIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQucmlzZS14LmNvbSIsIm5iZiI6MTc2NzkyODI5MSwiaWF0IjoxNzY3OTI4MjkxLCJleHAiOjE3Njc5MzE4OTEsImF1ZCI6WyJkaWFuYS1hcGkiLCJhZHBjbGVhci1hcGkiXSwic2NvcGUiOlsib3BlbmlkIiwiZW1haWwiLCJwcm9maWxlIiwiZGlhbmEtYXBpIl0sImFtciI6WyJleHRlcm5hbCJdLCJjbGllbnRfaWQiOiI1Mjg3MmEyMy1kNDE5LTQ5NTEtYThkZC05YTUxOTZkMjI1NWIiLCJzdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJhdXRoX3RpbWUiOjE3NTk5NzAwOTMsImlkcCI6ImFhZCIsImVtYWlsIjoibWhhcnZleUBmcmFubWFyaW5lLmNvbS5hdSIsIm5hbWUiOiJtaGFydmV5QGZyYW5tYXJpbmUuY29tLmF1IiwiZGlhbmFTdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJwcmVmZXJyZWRfbmFtZSI6Ik1hdHQgSGFydmV5IiwiY29tcGFueUlkIjoiNjgwYjYyMGItZTFkZS01ODQ4LWJiZmMtNTJhYjU3YmQyM2VlIiwiZGF0YSI6Int9Iiwic2lkIjoiNjU5RDhEQjZGNkJDNEVBNzUyNDUyMzU2MDgxRDYyQkQiLCJqdGkiOiI0QzRDOUVEMUJCMUFDNjc4RDVBQjg3RjNCRjA1MzMxMyJ9.fbQdvaluuwW1GjuGWXVJ_feMBic76x6Vk1YhGdTcBFEkNHBLt3iciA30AT7AlVAvZw-aFcErYOlXacui15yzk8690rOUJjtaaeufswjjk7pmqLW9FfSk-QOkljhDB153zxB7QSgyafsjmN26jP18uO763EpLFo-YFs-mQCLr89SYKa1lTtOOGIB-hmIigrvtCcQAvdDl14R4Rc1W_VOoZ1J8ppYebFZcgcSOlppuO1ucmBspAWxVCJCGPrLlwhZFSHBUp4bbK_XEf_2z1PQDVJJgLln1TuBlk_cZv3U8zG6esB4OkDmheIhJflTxOPLSMgZ3YD77WNaN1ToMOzjbsA';

// Known endpoints to explore
const ENDPOINTS = {
  // Things (vessels)
  ranVessels: '/marinestream/things/6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',
  commercialVessels: '/marinestream/things/e7f07ad3-8dda-4f7b-b293-7de922cf3abe',
  
  // Workboards (jobs)
  ranWork: '/marinestream/workboard/106b26fc-b1f1-4ea5-9e95-5f7bd81ee181',
  commercialWork: '/marinestream/workboard/3490a6ee-7fa6-4cc9-adee-905559229fb5',
  
  // Performance
  dataExplorer: '/marinestream/performance/explorer'
};

// Possible base URLs
const BASE_URLS = [
  'https://app.marinestream.io',
  'https://app.rise-x.io',
  'https://diana-api.rise-x.io',
  'https://api.rise-x.io'
];

// Possible API prefixes
const API_PREFIXES = [
  '',
  '/api',
  '/api/v1',
  '/diana-api'
];

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
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
        ...options.headers
      },
      timeout: 10000
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });

    req.on('error', (err) => {
      resolve({ error: err.message });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'timeout' });
    });

    req.end();
  });
}

async function exploreEndpoint(name, path) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log(`Path: ${path}`);
  console.log('='.repeat(60));

  for (const baseUrl of BASE_URLS) {
    for (const prefix of API_PREFIXES) {
      const fullUrl = `${baseUrl}${prefix}${path}`;
      console.log(`\n→ Trying: ${fullUrl}`);
      
      const result = await makeRequest(fullUrl);
      
      if (result.error) {
        console.log(`  ✗ Error: ${result.error}`);
        continue;
      }
      
      console.log(`  Status: ${result.status}`);
      
      if (result.status === 200) {
        console.log(`  ✓ SUCCESS!`);
        try {
          const json = JSON.parse(result.data);
          console.log(`  Response preview:`);
          console.log(JSON.stringify(json, null, 2).substring(0, 1000));
          if (result.data.length > 1000) {
            console.log(`  ... (${result.data.length} total bytes)`);
          }
          return { url: fullUrl, data: json };
        } catch (e) {
          console.log(`  Raw response (first 500 chars):`);
          console.log(result.data.substring(0, 500));
        }
      } else if (result.status === 401) {
        console.log(`  ✗ Unauthorized (token may be expired)`);
      } else if (result.status === 404) {
        console.log(`  ✗ Not found`);
      } else if (result.status === 301 || result.status === 302) {
        console.log(`  → Redirect to: ${result.headers.location}`);
      }
    }
  }
  
  return null;
}

async function discoverApiStructure() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  MarineStream Core API Explorer                           ║');
  console.log('║  Discovering available endpoints...                       ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // First, let's try to find any API docs or schema
  console.log('\n--- Looking for API documentation ---\n');
  
  const docPaths = [
    '/swagger',
    '/swagger/v1/swagger.json',
    '/api-docs',
    '/openapi.json',
    '/.well-known/openapi.json'
  ];
  
  for (const docPath of docPaths) {
    for (const baseUrl of BASE_URLS) {
      const result = await makeRequest(`${baseUrl}${docPath}`);
      if (!result.error && result.status === 200) {
        console.log(`Found docs at: ${baseUrl}${docPath}`);
        try {
          const json = JSON.parse(result.data);
          console.log('API Schema found!');
          console.log(JSON.stringify(json, null, 2).substring(0, 2000));
        } catch (e) {
          console.log(result.data.substring(0, 500));
        }
      }
    }
  }
  
  // Now explore the known endpoints
  console.log('\n--- Exploring Known Endpoints ---\n');
  
  const results = {};
  for (const [name, path] of Object.entries(ENDPOINTS)) {
    results[name] = await exploreEndpoint(name, path);
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  for (const [name, result] of Object.entries(results)) {
    if (result) {
      console.log(`✓ ${name}: ${result.url}`);
    } else {
      console.log(`✗ ${name}: Not found`);
    }
  }
}

// Run
discoverApiStructure().catch(console.error);
