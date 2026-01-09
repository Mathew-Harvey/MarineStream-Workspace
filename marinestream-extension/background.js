/**
 * MarineStream PAT Capture - Background Service Worker
 * Intercepts API requests to capture the Bearer token
 */

// Listen for web requests to the Diana API
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Look for Authorization header
    const authHeader = details.requestHeaders?.find(
      h => h.name.toLowerCase() === 'authorization'
    );
    
    if (authHeader && authHeader.value.startsWith('Bearer ')) {
      const token = authHeader.value.replace('Bearer ', '');
      
      // Validate it looks like a JWT
      if (token.split('.').length === 3) {
        // Decode to check expiry
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          const expiresAt = payload.exp * 1000;
          const now = Date.now();
          
          // Only store if token has more than 5 minutes left
          if (expiresAt > now + 5 * 60 * 1000) {
            // Store the token
            chrome.storage.local.set({
              marinestream_pat: token,
              pat_expires_at: expiresAt,
              pat_captured_at: now,
              user_name: payload.preferred_name || payload.name || 'User',
              user_email: payload.email
            }, () => {
              console.log('✅ PAT captured!', {
                user: payload.preferred_name,
                expiresIn: Math.round((expiresAt - now) / 60000) + ' minutes'
              });
              
              // Update badge to show success
              chrome.action.setBadgeText({ text: '✓' });
              chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
              
              // Clear badge after 3 seconds
              setTimeout(() => {
                updateBadgeWithExpiry();
              }, 3000);
            });
          }
        } catch (e) {
          console.error('Failed to decode token:', e);
        }
      }
    }
  },
  { 
    urls: [
      'https://api.idiana.io/*',
      'https://*.rise-x.io/*'
    ] 
  },
  ['requestHeaders']
);

// Update badge to show time remaining
function updateBadgeWithExpiry() {
  chrome.storage.local.get(['pat_expires_at'], (data) => {
    if (data.pat_expires_at) {
      const remaining = data.pat_expires_at - Date.now();
      
      if (remaining <= 0) {
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
      } else if (remaining < 10 * 60 * 1000) {
        // Less than 10 minutes
        const mins = Math.ceil(remaining / 60000);
        chrome.action.setBadgeText({ text: mins + 'm' });
        chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
      } else {
        // Good amount of time left
        const mins = Math.round(remaining / 60000);
        chrome.action.setBadgeText({ text: mins + 'm' });
        chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
      }
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  });
}

// Update badge every minute
setInterval(updateBadgeWithExpiry, 60000);

// Initial badge update
updateBadgeWithExpiry();

// Handle messages from popup or content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getToken') {
    chrome.storage.local.get([
      'marinestream_pat', 
      'pat_expires_at',
      'user_name',
      'user_email'
    ], (data) => {
      sendResponse(data);
    });
    return true; // Keep channel open for async response
  }
  
  if (request.action === 'clearToken') {
    chrome.storage.local.remove([
      'marinestream_pat',
      'pat_expires_at',
      'pat_captured_at',
      'user_name',
      'user_email'
    ], () => {
      chrome.action.setBadgeText({ text: '' });
      sendResponse({ success: true });
    });
    return true;
  }
});

// Listen for extension install
chrome.runtime.onInstalled.addListener(() => {
  console.log('MarineStream PAT Capture extension installed!');
  chrome.action.setBadgeText({ text: '' });
});
