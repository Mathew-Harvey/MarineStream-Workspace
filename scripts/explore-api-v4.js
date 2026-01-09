/**
 * MarineStream Core API Explorer v4
 * Focus on api.rise-x.io since PAT works with OIDC
 */

const https = require('https');

const PAT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkVFNEQ4MDQ2QjFBODgzMkRBRUQxNjVGOEY3NjlDRkM0QjVFMjY3MkJSUzI1NiIsIng1dCI6IjdrMkFSckdvZ3kydTBXWDQ5Mm5QeExYaVp5cyIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQucmlzZS14LmNvbSIsIm5iZiI6MTc2NzkyODI5MSwiaWF0IjoxNzY3OTI4MjkxLCJleHAiOjE3Njc5MzE4OTEsImF1ZCI6WyJkaWFuYS1hcGkiLCJhZHBjbGVhci1hcGkiXSwic2NvcGUiOlsib3BlbmlkIiwiZW1haWwiLCJwcm9maWxlIiwiZGlhbmEtYXBpIl0sImFtciI6WyJleHRlcm5hbCJdLCJjbGllbnRfaWQiOiI1Mjg3MmEyMy1kNDE5LTQ5NTEtYThkZC05YTUxOTZkMjI1NWIiLCJzdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJhdXRoX3RpbWUiOjE3NTk5NzAwOTMsImlkcCI6ImFhZCIsImVtYWlsIjoibWhhcnZleUBmcmFubWFyaW5lLmNvbS5hdSIsIm5hbWUiOiJtaGFydmV5QGZyYW5tYXJpbmUuY29tLmF1IiwiZGlhbmFTdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJwcmVmZXJyZWRfbmFtZSI6Ik1hdHQgSGFydmV5IiwiY29tcGFueUlkIjoiNjgwYjYyMGItZTFkZS01ODQ4LWJiZmMtNTJhYjU3YmQyM2VlIiwiZGF0YSI6Int9Iiwic2lkIjoiNjU5RDhEQjZGNkJDNEVBNzUyNDUyMzU2MDgxRDYyQkQiLCJqdGkiOiI0QzRDOUVEMUJCMUFDNjc4RDVBQjg3RjNCRjA1MzMxMyJ9.fbQdvaluuwW1GjuGWXVJ_feMBic76x6Vk1YhGdTcBFEkNHBLt3iciA30AT7AlVAvZw-aFcErYOlXacui15yzk8690rOUJjtaaeufswjjk7pmqLW9FfSk-QOkljhDB153zxB7QSgyafsjmN26jP18uO763EpLFo-YFs-mQCLr89SYKa1lTtOOGIB-hmIigrvtCcQAvdDl14R4Rc1W_VOoZ1J8ppYebFZcgcSOlppuO1ucmBspAWxVCJCGPrLlwhZFSHBUp4bbK_XEf_2z1PQDVJJgLln1TuBlk_cZv3U8zG6esB4OkDmheIhJflTxOPLSMgZ3YD77WNaN1ToMOzjbsA';

const COMPANY_ID = '680b620b-e1de-5848-bbfc-52ab57bd23ee';
const USER_ID = '3864d7b0-8893-400a-b829-6869b09af835';
const RAN_VESSELS_ID = '6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca';
const COMMERCIAL_VESSELS_ID = 'e7f07ad3-8dda-4f7b-b293-7de922cf3abe';
const RAN_WORKBOARD_ID = '106b26fc-b1f1-4ea5-9e95-5f7bd81ee181';

async function makeRequest(url, options = {}) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAT}`,
        ...options.headers
      };
      
      // Add tenant header variations
      if (options.tenant) {
        headers['X-Tenant'] = options.tenant;
        headers['X-Company-Id'] = COMPANY_ID;
      }

      const reqOptions = {
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: options.method || 'GET',
        headers,
        timeout: 10000
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
        req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
      }
      
      req.end();
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Diana API v4 - Focused API Discovery                     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  const found = [];
  
  // Based on the JWT, the API audience is "diana-api"
  // The API is likely at api.rise-x.io
  
  console.log('Testing api.rise-x.io endpoints...\n');
  
  // Comprehensive list of Diana API patterns
  const endpoints = [
    // Root/health
    '/',
    '/health',
    '/api',
    '/api/health',
    '/v1',
    '/v1/health',
    
    // Things (vessels) - various patterns
    '/things',
    '/v1/things',
    '/api/things',
    '/api/v1/things',
    `/things/${RAN_VESSELS_ID}`,
    `/v1/things/${RAN_VESSELS_ID}`,
    `/api/things/${RAN_VESSELS_ID}`,
    `/api/v1/things/${RAN_VESSELS_ID}`,
    
    // Items within a thing
    `/things/${RAN_VESSELS_ID}/items`,
    `/v1/things/${RAN_VESSELS_ID}/items`,
    `/api/things/${RAN_VESSELS_ID}/items`,
    
    // Workboards
    '/workboards',
    '/v1/workboards',
    '/api/workboards',
    '/api/v1/workboards',
    `/workboards/${RAN_WORKBOARD_ID}`,
    `/v1/workboards/${RAN_WORKBOARD_ID}`,
    
    // Cards/items on workboards
    `/workboards/${RAN_WORKBOARD_ID}/cards`,
    `/workboards/${RAN_WORKBOARD_ID}/items`,
    
    // Companies/tenants
    '/companies',
    '/v1/companies',
    `/companies/${COMPANY_ID}`,
    '/tenants',
    '/tenants/marinestream',
    
    // User endpoints
    '/me',
    '/v1/me',
    '/api/me',
    '/users/me',
    '/api/users/me',
    
    // Performance/metrics
    '/performance',
    '/metrics',
    '/analytics',
    
    // oData patterns (common in enterprise APIs)
    '/odata/things',
    '/odata/workboards',
    
    // GraphQL
    '/graphql'
  ];
  
  for (const path of endpoints) {
    const url = `https://api.rise-x.io${path}`;
    
    // Try without tenant header first
    let result = await makeRequest(url);
    
    if (result.error) {
      continue;
    }
    
    const isJson = result.contentType?.includes('json');
    const isHtml = result.contentType?.includes('html');
    
    // Show interesting results
    if (result.status === 200 && isJson && !result.data.includes('<!doctype')) {
      try {
        const json = JSON.parse(result.data);
        console.log(`✓ ${path} - 200 JSON!`);
        console.log(`  Preview: ${JSON.stringify(json).substring(0, 400)}`);
        found.push({ url, status: 200, data: json });
      } catch (e) {
        console.log(`✓ ${path} - 200 (parse error)`);
      }
    } else if (result.status === 401) {
      // 401 means endpoint exists but auth failed - interesting!
      console.log(`○ ${path} - 401 Unauthorized`);
      found.push({ url, status: 401 });
    } else if (result.status === 403) {
      console.log(`○ ${path} - 403 Forbidden`);
      found.push({ url, status: 403 });
    } else if (result.status === 404 && isJson) {
      // 404 with JSON might tell us about the API
      try {
        const json = JSON.parse(result.data);
        if (json.error || json.message || json.title) {
          console.log(`~ ${path} - 404 (API-style: ${json.message || json.title || json.error})`);
        }
      } catch (e) {}
    }
    
    // Also try with tenant header if we didn't get a good result
    if (result.status !== 200) {
      result = await makeRequest(url, { tenant: 'marinestream' });
      if (result.status === 200 && result.contentType?.includes('json')) {
        try {
          const json = JSON.parse(result.data);
          if (!result.data.includes('<!doctype')) {
            console.log(`✓ ${path} (with tenant header) - 200 JSON!`);
            console.log(`  Preview: ${JSON.stringify(json).substring(0, 400)}`);
            found.push({ url: url + ' (with tenant)', status: 200, data: json });
          }
        } catch (e) {}
      }
    }
  }
  
  // Also try GraphQL query
  console.log('\n--- Testing GraphQL ---\n');
  
  const graphqlQuery = {
    query: `
      query {
        __schema {
          queryType { name }
          mutationType { name }
          types { name kind }
        }
      }
    `
  };
  
  const graphqlEndpoints = [
    'https://api.rise-x.io/graphql',
    'https://app.rise-x.io/graphql',
    'https://app.marinestream.io/graphql'
  ];
  
  for (const url of graphqlEndpoints) {
    const result = await makeRequest(url, {
      method: 'POST',
      body: graphqlQuery
    });
    
    if (!result.error && result.status === 200 && result.contentType?.includes('json')) {
      try {
        const json = JSON.parse(result.data);
        if (json.data || json.errors) {
          console.log(`✓ GraphQL at ${url}!`);
          console.log(`  Schema: ${JSON.stringify(json).substring(0, 500)}`);
          found.push({ url, type: 'graphql', data: json });
        }
      } catch (e) {}
    } else if (result.status === 401) {
      console.log(`○ GraphQL at ${url} - 401 Unauthorized`);
    }
  }
  
  // Summary
  console.log('\n\n═══════════════════════════════════════════════════════════');
  console.log('                         RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  const successEndpoints = found.filter(f => f.status === 200);
  const authEndpoints = found.filter(f => f.status === 401 || f.status === 403);
  
  if (successEndpoints.length > 0) {
    console.log('✓ WORKING ENDPOINTS:');
    successEndpoints.forEach(f => {
      console.log(`  - ${f.url}`);
      if (f.data) {
        console.log(`    Data preview: ${JSON.stringify(f.data).substring(0, 200)}...`);
      }
    });
  }
  
  if (authEndpoints.length > 0) {
    console.log('\n○ ENDPOINTS THAT EXIST (but auth issues):');
    authEndpoints.forEach(f => console.log(`  - ${f.url} (${f.status})`));
  }
  
  if (found.length === 0) {
    console.log('No direct API endpoints found.');
    console.log('\nThe Diana platform likely uses:');
    console.log('- Session-based authentication (cookies from web login)');
    console.log('- Backend-for-Frontend pattern where API is proxied');
    console.log('- OR a different API base URL not yet discovered');
  }
}

main().catch(console.error);
