/**
 * MarineStream Core API Explorer v5
 * Now that we know api.rise-x.io works, let's find the right paths
 */

const https = require('https');

const PAT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkVFNEQ4MDQ2QjFBODgzMkRBRUQxNjVGOEY3NjlDRkM0QjVFMjY3MkJSUzI1NiIsIng1dCI6IjdrMkFSckdvZ3kydTBXWDQ5Mm5QeExYaVp5cyIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQucmlzZS14LmNvbSIsIm5iZiI6MTc2NzkyODI5MSwiaWF0IjoxNzY3OTI4MjkxLCJleHAiOjE3Njc5MzE4OTEsImF1ZCI6WyJkaWFuYS1hcGkiLCJhZHBjbGVhci1hcGkiXSwic2NvcGUiOlsib3BlbmlkIiwiZW1haWwiLCJwcm9maWxlIiwiZGlhbmEtYXBpIl0sImFtciI6WyJleHRlcm5hbCJdLCJjbGllbnRfaWQiOiI1Mjg3MmEyMy1kNDE5LTQ5NTEtYThkZC05YTUxOTZkMjI1NWIiLCJzdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJhdXRoX3RpbWUiOjE3NTk5NzAwOTMsImlkcCI6ImFhZCIsImVtYWlsIjoibWhhcnZleUBmcmFubWFyaW5lLmNvbS5hdSIsIm5hbWUiOiJtaGFydmV5QGZyYW5tYXJpbmUuY29tLmF1IiwiZGlhbmFTdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJwcmVmZXJyZWRfbmFtZSI6Ik1hdHQgSGFydmV5IiwiY29tcGFueUlkIjoiNjgwYjYyMGItZTFkZS01ODQ4LWJiZmMtNTJhYjU3YmQyM2VlIiwiZGF0YSI6Int9Iiwic2lkIjoiNjU5RDhEQjZGNkJDNEVBNzUyNDUyMzU2MDgxRDYyQkQiLCJqdGkiOiI0QzRDOUVEMUJCMUFDNjc4RDVBQjg3RjNCRjA1MzMxMyJ9.fbQdvaluuwW1GjuGWXVJ_feMBic76x6Vk1YhGdTcBFEkNHBLt3iciA30AT7AlVAvZw-aFcErYOlXacui15yzk8690rOUJjtaaeufswjjk7pmqLW9FfSk-QOkljhDB153zxB7QSgyafsjmN26jP18uO763EpLFo-YFs-mQCLr89SYKa1lTtOOGIB-hmIigrvtCcQAvdDl14R4Rc1W_VOoZ1J8ppYebFZcgcSOlppuO1ucmBspAWxVCJCGPrLlwhZFSHBUp4bbK_XEf_2z1PQDVJJgLln1TuBlk_cZv3U8zG6esB4OkDmheIhJflTxOPLSMgZ3YD77WNaN1ToMOzjbsA';

const COMPANY_ID = '680b620b-e1de-5848-bbfc-52ab57bd23ee';
const RAN_VESSELS_ID = '6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca';

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

async function testEndpoint(path, description) {
  const url = `https://api.rise-x.io${path}`;
  const result = await makeRequest(url);
  
  if (result.error) {
    console.log(`✗ ${path} - ${result.error}`);
    return null;
  }
  
  const isJson = result.contentType?.includes('json');
  
  if (result.status === 200) {
    if (isJson) {
      try {
        const json = JSON.parse(result.data);
        console.log(`✓ ${path} - 200 OK`);
        console.log(`  ${description}: ${JSON.stringify(json).substring(0, 300)}`);
        return json;
      } catch (e) {
        console.log(`✓ ${path} - 200 (non-JSON)`);
      }
    } else {
      console.log(`✓ ${path} - 200 (HTML/other)`);
    }
  } else if (result.status === 401) {
    console.log(`○ ${path} - 401 Unauthorized`);
    if (result.data) {
      try {
        const json = JSON.parse(result.data);
        console.log(`  Error: ${json.message || json.error || JSON.stringify(json)}`);
      } catch (e) {}
    }
  } else if (result.status === 403) {
    console.log(`○ ${path} - 403 Forbidden`);
  } else if (result.status === 404) {
    // Check if 404 has useful API info
    if (isJson && result.data) {
      try {
        const json = JSON.parse(result.data);
        if (json.type || json.traceId) {
          console.log(`~ ${path} - 404 (API-style response)`);
          console.log(`  ${JSON.stringify(json)}`);
        }
      } catch (e) {}
    }
  }
  
  return null;
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Diana API v5 - Detailed Path Discovery                   ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // Root is confirmed working
  console.log('=== Testing known working endpoints ===\n');
  await testEndpoint('/', 'API root');
  
  console.log('\n=== Testing tenant-based paths ===\n');
  // Maybe the tenant is in the path
  const tenantPaths = [
    '/marinestream',
    '/marinestream/',
    '/marinestream/things',
    '/marinestream/workboards',
    `/marinestream/things/${RAN_VESSELS_ID}`,
    '/tenants/marinestream',
    '/tenants/marinestream/things',
    `/companies/${COMPANY_ID}`,
    `/companies/${COMPANY_ID}/things`,
  ];
  
  for (const path of tenantPaths) {
    await testEndpoint(path, 'Response');
  }
  
  console.log('\n=== Testing OData-style endpoints ===\n');
  const odataPaths = [
    '/odata',
    '/odata/$metadata',
    '/odata/Things',
    '/odata/Workboards',
    `/odata/Things('${RAN_VESSELS_ID}')`,
    '/OData/Things',
  ];
  
  for (const path of odataPaths) {
    await testEndpoint(path, 'Response');
  }
  
  console.log('\n=== Testing common API patterns ===\n');
  const commonPaths = [
    '/api/v1',
    '/v1',
    '/v2',
    '/api/v2',
    '/swagger',
    '/swagger.json',
    '/swagger/v1/swagger.json',
    '/.well-known',
    '/openapi',
    '/openapi.json',
  ];
  
  for (const path of commonPaths) {
    await testEndpoint(path, 'Response');
  }
  
  console.log('\n=== Testing Diana-specific patterns ===\n');
  const dianaPaths = [
    '/diana',
    '/diana/things',
    '/diana/v1/things',
    '/core',
    '/core/things',
    '/assets',
    '/assets/types',
    '/catalog',
    '/catalog/things',
  ];
  
  for (const path of dianaPaths) {
    await testEndpoint(path, 'Response');
  }
  
  console.log('\n=== Testing with query parameters ===\n');
  const queryPaths = [
    '/things?companyId=' + COMPANY_ID,
    '/things?tenant=marinestream',
    '/api/things?companyId=' + COMPANY_ID,
  ];
  
  for (const path of queryPaths) {
    await testEndpoint(path, 'Response');
  }
  
  console.log('\n=== Summary ===');
  console.log('The API is at https://api.rise-x.io/ (v3.64.0)');
  console.log('Need to discover the correct path structure or request documentation.');
}

main().catch(console.error);
