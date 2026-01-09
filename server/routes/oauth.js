/**
 * OAuth Proxy Routes
 * Proxies OAuth token requests to Rise-X to handle CORS
 */

const express = require('express');
const https = require('https');
const router = express.Router();

const RISEX_CONFIG = {
  hostname: 'account.rise-x.io',
  tokenPath: '/connect/token',
  userInfoPath: '/connect/userinfo'
};

/**
 * Proxy request to Rise-X token endpoint
 * POST /api/oauth/token
 */
router.post('/token', async (req, res) => {
  try {
    const { grant_type, code, redirect_uri, code_verifier, refresh_token, client_id } = req.body;
    
    // Build form data for token request
    const params = new URLSearchParams();
    params.append('client_id', client_id);
    params.append('grant_type', grant_type);
    
    if (grant_type === 'authorization_code') {
      params.append('code', code);
      params.append('redirect_uri', redirect_uri);
      params.append('code_verifier', code_verifier);
    } else if (grant_type === 'refresh_token') {
      params.append('refresh_token', refresh_token);
    }
    
    const postData = params.toString();
    
    const options = {
      hostname: RISEX_CONFIG.hostname,
      port: 443,
      path: RISEX_CONFIG.tokenPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };
    
    const proxyReq = https.request(options, (proxyRes) => {
      let data = '';
      
      proxyRes.on('data', chunk => data += chunk);
      
      proxyRes.on('end', () => {
        try {
          const result = JSON.parse(data);
          
          if (proxyRes.statusCode === 200) {
            // Log token info (not the actual token) for debugging
            console.log('OAuth token issued:', {
              grant_type,
              expires_in: result.expires_in,
              token_type: result.token_type,
              has_refresh_token: !!result.refresh_token
            });
          } else {
            console.error('OAuth token error:', result);
          }
          
          res.status(proxyRes.statusCode).json(result);
        } catch (e) {
          console.error('Failed to parse token response:', data);
          res.status(500).json({ error: 'invalid_response', error_description: 'Failed to parse token response' });
        }
      });
    });
    
    proxyReq.on('error', (error) => {
      console.error('OAuth proxy error:', error);
      res.status(500).json({ error: 'server_error', error_description: error.message });
    });
    
    proxyReq.write(postData);
    proxyReq.end();
    
  } catch (error) {
    console.error('OAuth token endpoint error:', error);
    res.status(500).json({ error: 'server_error', error_description: error.message });
  }
});

/**
 * Proxy request to Rise-X userinfo endpoint
 * GET /api/oauth/userinfo
 */
router.get('/userinfo', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'unauthorized', error_description: 'No token provided' });
  }
  
  const options = {
    hostname: RISEX_CONFIG.hostname,
    port: 443,
    path: RISEX_CONFIG.userInfoPath,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`
    }
  };
  
  const proxyReq = https.request(options, (proxyRes) => {
    let data = '';
    
    proxyRes.on('data', chunk => data += chunk);
    
    proxyRes.on('end', () => {
      try {
        const result = JSON.parse(data);
        res.status(proxyRes.statusCode).json(result);
      } catch (e) {
        res.status(500).json({ error: 'invalid_response', error_description: 'Failed to parse userinfo response' });
      }
    });
  });
  
  proxyReq.on('error', (error) => {
    console.error('UserInfo proxy error:', error);
    res.status(500).json({ error: 'server_error', error_description: error.message });
  });
  
  proxyReq.end();
});

/**
 * Revoke token
 * POST /api/oauth/revoke
 */
router.post('/revoke', async (req, res) => {
  const { token, token_type_hint, client_id } = req.body;
  
  const params = new URLSearchParams();
  params.append('token', token);
  params.append('client_id', client_id);
  if (token_type_hint) {
    params.append('token_type_hint', token_type_hint);
  }
  
  const postData = params.toString();
  
  const options = {
    hostname: RISEX_CONFIG.hostname,
    port: 443,
    path: '/connect/revocation',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const proxyReq = https.request(options, (proxyRes) => {
    let data = '';
    
    proxyRes.on('data', chunk => data += chunk);
    
    proxyRes.on('end', () => {
      if (proxyRes.statusCode === 200) {
        res.json({ success: true });
      } else {
        try {
          const result = JSON.parse(data);
          res.status(proxyRes.statusCode).json(result);
        } catch (e) {
          res.status(proxyRes.statusCode).json({ error: 'revocation_failed' });
        }
      }
    });
  });
  
  proxyReq.on('error', (error) => {
    console.error('Token revocation error:', error);
    res.status(500).json({ error: 'server_error', error_description: error.message });
  });
  
  proxyReq.write(postData);
  proxyReq.end();
});

module.exports = router;
