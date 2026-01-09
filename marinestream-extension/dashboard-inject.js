/**
 * MarineStream PAT Capture - Dashboard Injection Script
 * Automatically injects the captured PAT into the Fleet Command dashboard
 */

// Check for stored PAT and inject into page localStorage
chrome.storage.local.get([
  'marinestream_pat',
  'pat_expires_at',
  'user_name',
  'user_email'
], (data) => {
  if (data.marinestream_pat) {
    const remaining = data.pat_expires_at - Date.now();
    
    // Only inject if token has more than 1 minute left
    if (remaining > 60000) {
      // Store in localStorage for the dashboard to use
      localStorage.setItem('marinestream_pat', data.marinestream_pat);
      localStorage.setItem('marinestream_token_expiry', data.pat_expires_at.toString());
      localStorage.setItem('marinestream_access_token', data.marinestream_pat);
      
      // Also store user info
      if (data.user_name) {
        localStorage.setItem('marinestream_user_info', JSON.stringify({
          name: data.user_name,
          email: data.user_email
        }));
      }
      
      console.log('✅ MarineStream PAT injected from extension!', {
        user: data.user_name,
        expiresIn: Math.round(remaining / 60000) + ' minutes'
      });
      
      // Dispatch event so the dashboard knows token is ready
      window.dispatchEvent(new CustomEvent('marinestream:token-injected', {
        detail: {
          hasToken: true,
          expiresAt: data.pat_expires_at,
          userName: data.user_name
        }
      }));
    }
  }
});

// Listen for token requests from the dashboard
window.addEventListener('marinestream:request-token', () => {
  chrome.storage.local.get([
    'marinestream_pat',
    'pat_expires_at',
    'user_name'
  ], (data) => {
    window.dispatchEvent(new CustomEvent('marinestream:token-response', {
      detail: data
    }));
  });
});

// Keep localStorage in sync with extension storage
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local') {
    if (changes.marinestream_pat) {
      const newToken = changes.marinestream_pat.newValue;
      if (newToken) {
        localStorage.setItem('marinestream_pat', newToken);
        localStorage.setItem('marinestream_access_token', newToken);
        
        // Notify dashboard
        window.dispatchEvent(new CustomEvent('marinestream:token-updated', {
          detail: { token: newToken }
        }));
      } else {
        // Token was cleared
        localStorage.removeItem('marinestream_pat');
        localStorage.removeItem('marinestream_access_token');
      }
    }
    
    if (changes.pat_expires_at) {
      const newExpiry = changes.pat_expires_at.newValue;
      if (newExpiry) {
        localStorage.setItem('marinestream_token_expiry', newExpiry.toString());
      }
    }
  }
});
