/**
 * MarineStream Core API Explorer v3
 * Deeper exploration based on OIDC discovery
 */

const https = require('https');

const PAT = 'eyJhbGciOiJSUzI1NiIsImtpZCI6IkVFNEQ4MDQ2QjFBODgzMkRBRUQxNjVGOEY3NjlDRkM0QjVFMjY3MkJSUzI1NiIsIng1dCI6IjdrMkFSckdvZ3kydTBXWDQ5Mm5QeExYaVp5cyIsInR5cCI6ImF0K2p3dCJ9.eyJpc3MiOiJodHRwczovL2FjY291bnQucmlzZS14LmNvbSIsIm5iZiI6MTc2NzkyODI5MSwiaWF0IjoxNzY3OTI4MjkxLCJleHAiOjE3Njc5MzE4OTEsImF1ZCI6WyJkaWFuYS1hcGkiLCJhZHBjbGVhci1hcGkiXSwic2NvcGUiOlsib3BlbmlkIiwiZW1haWwiLCJwcm9maWxlIiwiZGlhbmEtYXBpIl0sImFtciI6WyJleHRlcm5hbCJdLCJjbGllbnRfaWQiOiI1Mjg3MmEyMy1kNDE5LTQ5NTEtYThkZC05YTUxOTZkMjI1NWIiLCJzdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJhdXRoX3RpbWUiOjE3NTk5NzAwOTMsImlkcCI6ImFhZCIsImVtYWlsIjoibWhhcnZleUBmcmFubWFyaW5lLmNvbS5hdSIsIm5hbWUiOiJtaGFydmV5QGZyYW5tYXJpbmUuY29tLmF1IiwiZGlhbmFTdWIiOiIzODY0ZDdiMC04ODkzLTQwMGEtYjgyOS02ODY5YjA5YWY4MzUiLCJwcmVmZXJyZWRfbmFtZSI6Ik1hdHQgSGFydmV5IiwiY29tcGFueUlkIjoiNjgwYjYyMGItZTFkZS01ODQ4LWJiZmMtNTJhYjU3YmQyM2VlIiwiZGF0YSI6Int9Iiwic2lkIjoiNjU5RDhEQjZGNkJDNEVBNzUyNDUyMzU2MDgxRDYyQkQiLCJqdGkiOiI0QzRDOUVEMUJCMUFDNjc4RDVBQjg3RjNCRjA1MzMxMyJ9.fbQdvaluuwW1GjuGWXVJ_feMBic76x6Vk1YhGdTcBFEkNHBLt3iciA30AT7AlVAvZw-aFcErYOlXacui15yzk8690rOUJjtaaeufswjjk7pmqLW9FfSk-QOkljhDB153zxB7QSgyafsjmN26jP18uO763EpLFo-YFs-mQCLr89SYKa1lTtOOGIB-hmIigrvtCcQAvdDl14R4Rc1W_VOoZ1J8ppYebFZcgcSOlppuO1ucmBspAWxVCJCGPrLlwhZFSHBUp4bbK_XEf_2z1PQDVJJgLln1TuBlk_cZv3U8zG6esB4OkDmheIhJflTxOPLSMgZ3YD77WNaN1ToMOzjbsA';

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
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          ...(options.auth ? { 'Authorization': `Bearer ${PAT}` } : {}),
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
  console.log('║  Diana API v3 - OIDC & API Discovery                      ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  // 1. Fetch OIDC configuration
  console.log('1. Fetching OIDC configuration...\n');
  const oidcResult = await makeRequest('https://account.rise-x.com/.well-known/openid-configuration');
  if (!oidcResult.error && oidcResult.status === 200) {
    const oidcConfig = JSON.parse(oidcResult.data);
    console.log('OIDC Configuration:');
    console.log(`  Issuer: ${oidcConfig.issuer}`);
    console.log(`  Auth Endpoint: ${oidcConfig.authorization_endpoint}`);
    console.log(`  Token Endpoint: ${oidcConfig.token_endpoint}`);
    console.log(`  UserInfo Endpoint: ${oidcConfig.userinfo_endpoint}`);
    console.log(`  Scopes: ${oidcConfig.scopes_supported?.slice(0, 10).join(', ')}`);
  }
  
  // 2. Try UserInfo endpoint with our token
  console.log('\n2. Testing UserInfo endpoint with PAT...\n');
  const userInfoResult = await makeRequest('https://account.rise-x.com/connect/userinfo', { auth: true });
  console.log(`UserInfo Status: ${userInfoResult.status}`);
  if (userInfoResult.status === 200) {
    console.log('UserInfo:', userInfoResult.data);
  } else {
    console.log('Response:', userInfoResult.data?.substring(0, 500));
  }
  
  // 3. Look for API endpoints on the app domain - maybe there's a BFF pattern
  console.log('\n3. Looking for Backend-for-Frontend (BFF) API...\n');
  
  // Diana platform typically has these API patterns
  const bffEndpoints = [
    // Diana core API patterns
    '/app/api/me',
    '/app/api/user',
    '/app/api/config',
    '/app/api/things',
    '/app/api/v1/things',
    '/app/api/workboards',
    '/app/api/v1/workboards',
    
    // Gateway patterns
    '/gateway/things',
    '/gateway/api/things',
    '/bff/things',
    '/bff/api/things',
    
    // Direct Diana API patterns
    '/diana/api/things',
    '/diana/things',
    
    // Common REST patterns with tenant
    '/marinestream/api/things',
    '/marinestream/api/v1/things',
    '/api/marinestream/things',
    '/api/v1/marinestream/things',
    
    // Try the specific thing ID patterns
    '/app/api/things/6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',
    '/api/things/6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',
    '/gateway/things/6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca',
    
    // Workboard patterns
    '/app/api/workboards/106b26fc-b1f1-4ea5-9e95-5f7bd81ee181',
    '/api/workboards/106b26fc-b1f1-4ea5-9e95-5f7bd81ee181'
  ];
  
  const found = [];
  
  for (const path of bffEndpoints) {
    const url = `https://app.marinestream.io${path}`;
    const result = await makeRequest(url, { auth: true });
    
    if (result.error) {
      continue;
    }
    
    const isJson = result.contentType?.includes('json');
    
    // We're looking for JSON responses that aren't the SPA shell
    if (result.status === 200 && isJson) {
      try {
        const data = JSON.parse(result.data);
        // Check if it's actual API data, not just SPA config
        if (!result.data.includes('<!doctype')) {
          console.log(`✓ ${path} - JSON API found!`);
          console.log(`  Data: ${JSON.stringify(data).substring(0, 300)}...`);
          found.push({ path, data });
        }
      } catch (e) {}
    } else if (result.status === 401) {
      console.log(`○ ${path} - 401 Unauthorized (API exists, needs different auth)`);
      found.push({ path, note: '401' });
    } else if (result.status === 403) {
      console.log(`○ ${path} - 403 Forbidden (API exists, access denied)`);
      found.push({ path, note: '403' });
    }
  }
  
  // 4. Check if there's a separate API subdomain
  console.log('\n4. Checking for separate API subdomains...\n');
  
  const apiDomains = [
    'https://api.marinestream.io',
    'https://diana.marinestream.io',
    'https://gateway.marinestream.io'
  ];
  
  for (const domain of apiDomains) {
    const result = await makeRequest(`${domain}/health`, { auth: true });
    if (!result.error) {
      console.log(`${domain}: ${result.status} (${result.contentType || 'no content-type'})`);
      if (result.status === 200) {
        console.log(`  Response: ${result.data.substring(0, 200)}`);
      }
    } else {
      console.log(`${domain}: ${result.error}`);
    }
  }
  
  // 5. Try introspecting the token to see what resources it grants access to
  console.log('\n5. Token introspection...\n');
  const introspectResult = await makeRequest('https://account.rise-x.com/connect/introspect', {
    method: 'POST',
    body: `token=${PAT}&token_type_hint=access_token`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
  console.log(`Introspection Status: ${introspectResult.status}`);
  if (introspectResult.data) {
    console.log(`Response: ${introspectResult.data.substring(0, 500)}`);
  }
  
  // Summary
  console.log('\n\n=== SUMMARY ===');
  console.log(`Found ${found.length} potential API endpoints:`);
  found.forEach(f => console.log(`  - ${f.path} ${f.note || ''}`));
  
  console.log('\n=== NEXT STEPS ===');
  console.log('The Diana platform appears to use session-based auth for the web app.');
  console.log('Options:');
  console.log('1. Request API documentation from Rise-X/Diana team');
  console.log('2. Use browser automation to capture authenticated API calls');
  console.log('3. Check if there\'s a machine-to-machine OAuth flow available');
}

main().catch(console.error);
