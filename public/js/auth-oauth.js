/**
 * MarineStream OAuth Authentication Module
 * Implements PKCE-based OAuth 2.0 flow with automatic token refresh
 */

const AUTH_CONFIG = {
  // Rise-X OIDC endpoints
  issuer: 'https://account.rise-x.io',
  authorizationEndpoint: 'https://account.rise-x.io/connect/authorize',
  tokenEndpoint: 'https://account.rise-x.io/connect/token',
  userInfoEndpoint: 'https://account.rise-x.io/connect/userinfo',
  endSessionEndpoint: 'https://account.rise-x.io/connect/endsession',
  
  // MarineStream client configuration
  clientId: '52872a23-d419-4951-a8dd-9a5196d2225b',
  
  // Our redirect URI - must be registered with Rise-X
  // For local development, we'll use our dashboard callback
  redirectUri: window.location.origin + '/auth/callback',
  
  // Scopes we need
  scopes: ['openid', 'email', 'profile', 'diana-api', 'offline_access'],
  
  // Token refresh buffer (refresh 2 minutes before expiry)
  refreshBufferSeconds: 120
};

// Storage keys
const STORAGE_KEYS = {
  accessToken: 'marinestream_access_token',
  refreshToken: 'marinestream_refresh_token',
  tokenExpiry: 'marinestream_token_expiry',
  codeVerifier: 'marinestream_code_verifier',
  authState: 'marinestream_auth_state',
  userInfo: 'marinestream_user_info'
};

// Token refresh timer
let refreshTimer = null;

/**
 * Generate a cryptographically random string for PKCE
 */
function generateRandomString(length = 64) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').slice(0, length);
}

/**
 * Generate PKCE code verifier and challenge
 */
async function generatePKCE() {
  const codeVerifier = generateRandomString(64);
  
  // Generate code challenge using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  
  // Base64URL encode the challenge
  const base64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
  const codeChallenge = base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  return { codeVerifier, codeChallenge };
}

/**
 * Start the OAuth login flow
 */
async function startLogin() {
  try {
    // Generate PKCE codes
    const { codeVerifier, codeChallenge } = await generatePKCE();
    
    // Generate state for CSRF protection
    const state = generateRandomString(32);
    
    // Store for callback verification
    localStorage.setItem(STORAGE_KEYS.codeVerifier, codeVerifier);
    localStorage.setItem(STORAGE_KEYS.authState, state);
    
    // Build authorization URL
    const params = new URLSearchParams({
      client_id: AUTH_CONFIG.clientId,
      redirect_uri: AUTH_CONFIG.redirectUri,
      response_type: 'code',
      scope: AUTH_CONFIG.scopes.join(' '),
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      // Prompt for login if needed
      prompt: 'login'
    });
    
    const authUrl = `${AUTH_CONFIG.authorizationEndpoint}?${params.toString()}`;
    
    console.log('Redirecting to login...');
    window.location.href = authUrl;
    
  } catch (error) {
    console.error('Failed to start login:', error);
    throw error;
  }
}

/**
 * Handle OAuth callback after login
 */
async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  
  // Check for errors
  if (error) {
    const errorDescription = params.get('error_description');
    console.error('OAuth error:', error, errorDescription);
    throw new Error(`Login failed: ${errorDescription || error}`);
  }
  
  // Verify state
  const savedState = localStorage.getItem(STORAGE_KEYS.authState);
  if (state !== savedState) {
    throw new Error('Invalid state - possible CSRF attack');
  }
  
  // Get code verifier
  const codeVerifier = localStorage.getItem(STORAGE_KEYS.codeVerifier);
  if (!codeVerifier) {
    throw new Error('No code verifier found');
  }
  
  // Exchange code for tokens
  const tokens = await exchangeCodeForTokens(code, codeVerifier);
  
  // Clear temporary storage
  localStorage.removeItem(STORAGE_KEYS.codeVerifier);
  localStorage.removeItem(STORAGE_KEYS.authState);
  
  // Store tokens locally
  storeTokens(tokens);
  
  // Fetch and store user info
  const userInfo = await fetchAndStoreUserInfo(tokens.access_token);
  
  // Store connection on the server (for syncing)
  await storeConnectionOnServer(tokens, userInfo);
  
  // Schedule token refresh
  scheduleTokenRefresh(tokens.expires_in);
  
  // Remove code from URL
  window.history.replaceState({}, document.title, window.location.pathname);
  
  return tokens;
}

/**
 * Store the Rise-X connection on the server
 * This enables server-side syncing with Rise-X API
 */
async function storeConnectionOnServer(tokens, userInfo) {
  try {
    // Get Clerk token for authentication
    const clerkToken = await getClerkToken();
    
    if (!clerkToken) {
      console.warn('No Clerk token available, skipping server-side connection storage');
      return;
    }
    
    const response = await fetch('/api/sync/connection', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clerkToken}`
      },
      body: JSON.stringify({
        tokenData: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_in: tokens.expires_in,
          token_type: tokens.token_type,
          scope: tokens.scope
        },
        userInfo: userInfo
      })
    });
    
    if (response.ok) {
      console.log('✅ Rise-X connection stored on server');
      window.dispatchEvent(new CustomEvent('riseX:connected'));
    } else {
      const error = await response.json();
      console.warn('Failed to store connection on server:', error);
    }
  } catch (error) {
    console.warn('Error storing connection on server:', error);
  }
}

/**
 * Get Clerk token for API authentication
 * Returns null if Clerk is not available or user is not signed in
 */
async function getClerkToken() {
  try {
    // Check if Clerk is available (from auth.js)
    if (window.Clerk && window.Clerk.session) {
      return await window.Clerk.session.getToken();
    }
    
    // Check if MarineStreamClerkAuth is available
    if (window.MarineStreamClerkAuth && window.MarineStreamClerkAuth.getToken) {
      return await window.MarineStreamClerkAuth.getToken();
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to get Clerk token:', error);
    return null;
  }
}

/**
 * Exchange authorization code for tokens
 * Uses our backend proxy to handle CORS
 */
async function exchangeCodeForTokens(code, codeVerifier) {
  // Try our proxy first, fall back to direct if needed
  const proxyUrl = '/api/oauth/token';
  
  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: AUTH_CONFIG.clientId,
      code: code,
      redirect_uri: AUTH_CONFIG.redirectUri,
      code_verifier: codeVerifier
    })
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'unknown' }));
    console.error('Token exchange failed:', error);
    throw new Error(error.error_description || error.error || 'Failed to exchange code for tokens');
  }
  
  return response.json();
}

/**
 * Refresh the access token using refresh token
 * Uses our backend proxy to handle CORS
 */
async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(STORAGE_KEYS.refreshToken);
  
  if (!refreshToken) {
    console.log('No refresh token available, login required');
    return null;
  }
  
  try {
    const response = await fetch('/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: AUTH_CONFIG.clientId,
        refresh_token: refreshToken
      })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'unknown' }));
      console.error('Token refresh failed:', error);
      // Clear tokens and require re-login
      clearTokens();
      // Dispatch event so app can handle re-login
      window.dispatchEvent(new CustomEvent('auth:refreshFailed', { detail: error }));
      return null;
    }
    
    const tokens = await response.json();
    storeTokens(tokens);
    scheduleTokenRefresh(tokens.expires_in);
    
    console.log('✅ Token refreshed successfully, expires in', tokens.expires_in, 'seconds');
    window.dispatchEvent(new CustomEvent('auth:tokenRefreshed'));
    return tokens;
    
  } catch (error) {
    console.error('Token refresh error:', error);
    return null;
  }
}

/**
 * Store tokens in localStorage
 */
function storeTokens(tokens) {
  localStorage.setItem(STORAGE_KEYS.accessToken, tokens.access_token);
  
  if (tokens.refresh_token) {
    localStorage.setItem(STORAGE_KEYS.refreshToken, tokens.refresh_token);
  }
  
  // Calculate and store expiry time
  const expiryTime = Date.now() + (tokens.expires_in * 1000);
  localStorage.setItem(STORAGE_KEYS.tokenExpiry, expiryTime.toString());
  
  // Also store as the PAT for backward compatibility
  localStorage.setItem('marinestream_pat', tokens.access_token);
}

/**
 * Clear all stored tokens
 */
function clearTokens() {
  localStorage.removeItem(STORAGE_KEYS.accessToken);
  localStorage.removeItem(STORAGE_KEYS.refreshToken);
  localStorage.removeItem(STORAGE_KEYS.tokenExpiry);
  localStorage.removeItem(STORAGE_KEYS.userInfo);
  localStorage.removeItem('marinestream_pat');
  
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/**
 * Schedule automatic token refresh
 */
function scheduleTokenRefresh(expiresInSeconds) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
  }
  
  // Refresh 2 minutes before expiry
  const refreshInMs = (expiresInSeconds - AUTH_CONFIG.refreshBufferSeconds) * 1000;
  
  if (refreshInMs > 0) {
    console.log(`Token refresh scheduled in ${Math.round(refreshInMs / 1000 / 60)} minutes`);
    
    refreshTimer = setTimeout(async () => {
      console.log('Auto-refreshing token...');
      const tokens = await refreshAccessToken();
      
      if (!tokens) {
        // Refresh failed, notify the app
        window.dispatchEvent(new CustomEvent('auth:tokenExpired'));
      }
    }, refreshInMs);
  }
}

/**
 * Get current access token, refreshing if needed
 */
async function getAccessToken() {
  const accessToken = localStorage.getItem(STORAGE_KEYS.accessToken);
  const tokenExpiry = localStorage.getItem(STORAGE_KEYS.tokenExpiry);
  
  if (!accessToken) {
    return null;
  }
  
  // Check if token is expired or about to expire
  const expiryTime = parseInt(tokenExpiry, 10);
  const bufferTime = AUTH_CONFIG.refreshBufferSeconds * 1000;
  
  if (Date.now() > expiryTime - bufferTime) {
    console.log('Token expired or expiring soon, refreshing...');
    const tokens = await refreshAccessToken();
    return tokens?.access_token || null;
  }
  
  return accessToken;
}

/**
 * Check if user is authenticated
 */
async function isAuthenticated() {
  const token = await getAccessToken();
  return !!token;
}

/**
 * Fetch and store user info
 * Uses our backend proxy to handle CORS
 */
async function fetchAndStoreUserInfo(accessToken) {
  try {
    const response = await fetch('/api/oauth/userinfo', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    if (response.ok) {
      const userInfo = await response.json();
      localStorage.setItem(STORAGE_KEYS.userInfo, JSON.stringify(userInfo));
      return userInfo;
    }
  } catch (error) {
    console.error('Failed to fetch user info:', error);
  }
  return null;
}

/**
 * Set a manual PAT (for fallback when OAuth isn't available)
 */
function setManualToken(pat) {
  // Decode the token to get expiry
  try {
    const payload = JSON.parse(atob(pat.split('.')[1]));
    const expiresIn = payload.exp - Math.floor(Date.now() / 1000);
    
    storeTokens({
      access_token: pat,
      expires_in: expiresIn,
      token_type: 'Bearer'
    });
    
    // Try to get user info
    fetchAndStoreUserInfo(pat);
    
    return true;
  } catch (error) {
    console.error('Invalid token format:', error);
    return false;
  }
}

/**
 * Check if token is about to expire (within buffer time)
 */
function isTokenExpiring() {
  const tokenExpiry = localStorage.getItem(STORAGE_KEYS.tokenExpiry);
  if (!tokenExpiry) return true;
  
  const expiryTime = parseInt(tokenExpiry, 10);
  const bufferTime = AUTH_CONFIG.refreshBufferSeconds * 1000;
  
  return Date.now() > expiryTime - bufferTime;
}

/**
 * Get token expiry info
 */
function getTokenExpiryInfo() {
  const tokenExpiry = localStorage.getItem(STORAGE_KEYS.tokenExpiry);
  if (!tokenExpiry) return null;
  
  const expiryTime = parseInt(tokenExpiry, 10);
  const now = Date.now();
  const remainingMs = expiryTime - now;
  
  return {
    expiryTime: new Date(expiryTime),
    remainingSeconds: Math.max(0, Math.floor(remainingMs / 1000)),
    remainingMinutes: Math.max(0, Math.floor(remainingMs / 60000)),
    isExpired: remainingMs <= 0,
    isExpiringSoon: remainingMs <= AUTH_CONFIG.refreshBufferSeconds * 1000
  };
}

/**
 * Get stored user info
 */
function getUserInfo() {
  const stored = localStorage.getItem(STORAGE_KEYS.userInfo);
  return stored ? JSON.parse(stored) : null;
}

/**
 * Logout - clear tokens and optionally redirect to end session
 */
async function logout(redirectToLogin = true) {
  const idToken = localStorage.getItem(STORAGE_KEYS.accessToken);
  
  clearTokens();
  
  if (redirectToLogin) {
    // Redirect to Rise-X logout, then back to our app
    const params = new URLSearchParams({
      post_logout_redirect_uri: window.location.origin + '/dashboard.html'
    });
    
    if (idToken) {
      params.set('id_token_hint', idToken);
    }
    
    window.location.href = `${AUTH_CONFIG.endSessionEndpoint}?${params.toString()}`;
  }
}

/**
 * Disconnect Rise-X account from server
 */
async function disconnectFromServer() {
  try {
    const clerkToken = await getClerkToken();
    
    if (!clerkToken) {
      console.warn('No Clerk token available');
      return false;
    }
    
    const response = await fetch('/api/sync/connection', {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${clerkToken}`
      }
    });
    
    if (response.ok) {
      // Clear local tokens
      clearTokens();
      console.log('✅ Rise-X account disconnected');
      window.dispatchEvent(new CustomEvent('riseX:disconnected'));
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Failed to disconnect:', error);
    return false;
  }
}

/**
 * Get Rise-X connection status from server
 */
async function getConnectionStatus() {
  try {
    const clerkToken = await getClerkToken();
    
    if (!clerkToken) {
      return { connected: false, error: 'Not authenticated' };
    }
    
    const response = await fetch('/api/sync/connection', {
      headers: {
        'Authorization': `Bearer ${clerkToken}`
      }
    });
    
    if (response.ok) {
      const result = await response.json();
      return result.data;
    }
    
    return { connected: false };
  } catch (error) {
    console.error('Failed to get connection status:', error);
    return { connected: false, error: error.message };
  }
}

/**
 * Trigger a sync from the server
 */
async function triggerSync(type = 'incremental') {
  try {
    const clerkToken = await getClerkToken();
    
    if (!clerkToken) {
      return { success: false, error: 'Not authenticated' };
    }
    
    const response = await fetch('/api/sync/trigger', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clerkToken}`
      },
      body: JSON.stringify({ type })
    });
    
    return await response.json();
  } catch (error) {
    console.error('Sync failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Get sync status from server
 */
async function getSyncStatus() {
  try {
    const clerkToken = await getClerkToken();
    
    if (!clerkToken) {
      return { success: false, error: 'Not authenticated' };
    }
    
    const response = await fetch('/api/sync/status', {
      headers: {
        'Authorization': `Bearer ${clerkToken}`
      }
    });
    
    return await response.json();
  } catch (error) {
    console.error('Failed to get sync status:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Initialize auth on page load
 */
async function initAuth() {
  // Check if this is a callback from OAuth
  if (window.location.pathname === '/auth/callback' || window.location.search.includes('code=')) {
    try {
      await handleCallback();
      // Redirect to dashboard after successful login
      window.location.href = '/dashboard.html';
      return { authenticated: true, callback: true };
    } catch (error) {
      console.error('Callback handling failed:', error);
      return { authenticated: false, error: error.message };
    }
  }
  
  // Check for existing valid token
  const authenticated = await isAuthenticated();
  
  if (authenticated) {
    // Set up refresh timer based on stored expiry
    const tokenExpiry = localStorage.getItem(STORAGE_KEYS.tokenExpiry);
    if (tokenExpiry) {
      const remainingMs = parseInt(tokenExpiry, 10) - Date.now();
      if (remainingMs > 0) {
        scheduleTokenRefresh(Math.floor(remainingMs / 1000));
      }
    }
  }
  
  return { authenticated };
}

// Export functions
window.MarineStreamAuth = {
  // Core auth
  startLogin,
  handleCallback,
  refreshAccessToken,
  getAccessToken,
  isAuthenticated,
  logout,
  initAuth,
  clearTokens,
  
  // User info
  getUserInfo,
  fetchAndStoreUserInfo,
  
  // Manual PAT support
  setManualToken,
  
  // Token status
  isTokenExpiring,
  getTokenExpiryInfo,
  
  // Rise-X connection management
  getConnectionStatus,
  disconnectFromServer,
  triggerSync,
  getSyncStatus,
  
  // For backward compatibility
  getToken: getAccessToken,
  
  // Config (for debugging)
  config: AUTH_CONFIG
};
