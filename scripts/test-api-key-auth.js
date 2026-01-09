/**
 * Test API Key Authentication with Rise-X Diana API
 * 
 * Usage: node scripts/test-api-key-auth.js <user_id> <api_key>
 */

const https = require('https');

const userId = process.argv[2] || '3864d7b0-8893-400a-b829-6869b09af835';
const apiKey = process.argv[3] || 'YOUR_API_KEY_HERE';

console.log('Testing API Key authentication...');
console.log('User ID:', userId);
console.log('API Key:', apiKey.substring(0, 8) + '...');
console.log('');

// Different authentication methods to try
const authMethods = [
  {
    name: 'Method 1: user_id + user_key query params',
    path: `/api/v3/work?user_id=${userId}&user_key=${apiKey}`,
    headers: { 'Accept': 'application/json' }
  },
  {
    name: 'Method 2: X-API-Key + X-User-Id headers',
    path: '/api/v3/work',
    headers: { 
      'Accept': 'application/json',
      'X-API-Key': apiKey,
      'X-User-Id': userId
    }
  },
  {
    name: 'Method 3: Authorization header with ApiKey scheme',
    path: '/api/v3/work',
    headers: { 
      'Accept': 'application/json',
      'Authorization': `ApiKey ${userId}:${apiKey}`
    }
  },
  {
    name: 'Method 4: Basic Auth style (base64)',
    path: '/api/v3/work',
    headers: { 
      'Accept': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${userId}:${apiKey}`).toString('base64')}`
    }
  },
  {
    name: 'Method 5: Diana-specific headers',
    path: '/api/v3/work',
    headers: { 
      'Accept': 'application/json',
      'diana-user-id': userId,
      'diana-api-key': apiKey
    }
  },
  {
    name: 'Method 6: api_key query param only',
    path: `/api/v3/work?api_key=${apiKey}`,
    headers: { 'Accept': 'application/json' }
  }
];

async function testAuth(method) {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api.idiana.io',
      port: 443,
      path: method.path,
      method: 'GET',
      headers: method.headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const success = res.statusCode === 200;
        console.log(`${success ? '✅' : '❌'} ${method.name}`);
        console.log(`   Status: ${res.statusCode}`);
        if (success) {
          try {
            const json = JSON.parse(data);
            console.log(`   Response: ${Array.isArray(json) ? json.length + ' items' : 'object'}`);
          } catch (e) {
            console.log(`   Response: ${data.substring(0, 100)}`);
          }
        } else {
          console.log(`   Response: ${data.substring(0, 100) || '(empty)'}`);
        }
        console.log('');
        resolve({ method: method.name, status: res.statusCode, success });
      });
    });

    req.on('error', (e) => {
      console.log(`❌ ${method.name}`);
      console.log(`   Error: ${e.message}`);
      console.log('');
      resolve({ method: method.name, error: e.message, success: false });
    });

    req.end();
  });
}

async function runTests() {
  console.log('Testing different auth methods against api.idiana.io...\n');
  
  const results = [];
  for (const method of authMethods) {
    const result = await testAuth(method);
    results.push(result);
    // Small delay between requests
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n=== Summary ===');
  const successful = results.filter(r => r.success);
  if (successful.length > 0) {
    console.log('✅ Working methods:');
    successful.forEach(r => console.log(`   - ${r.method}`));
  } else {
    console.log('❌ No API key auth methods worked.');
    console.log('   The API may require Bearer token (PAT) authentication only.');
  }
}

runTests();
