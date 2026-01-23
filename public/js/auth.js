/**
 * MarineStream Workspace - Authentication Module
 * Clerk integration for user authentication
 */

let clerkInstance = null;
let authCallbacks = {};
let clerkReady = false;

/**
 * Initialize Clerk authentication
 */
export async function initAuth(options = {}) {
  const { publishableKey, onSignIn, onSignOut } = options;
  authCallbacks = { onSignIn, onSignOut };
  
  if (!publishableKey) {
    console.warn('No Clerk publishable key provided - auth disabled');
    return { user: null, isAuthenticated: false };
  }
  
  try {
    // Dynamically load and initialize Clerk
    console.log('⏳ Loading Clerk...');
    await loadAndInitClerk(publishableKey);
    
    clerkInstance = window.Clerk;
    clerkReady = true;
    console.log('✅ Clerk loaded and initialized');
    
    // Check current session
    const user = clerkInstance.user;
    
    if (user) {
      console.log('👤 User authenticated:', user.primaryEmailAddress?.emailAddress);
      return {
        user: formatUser(user),
        isAuthenticated: true
      };
    }
    
    // Setup auth listeners for sign-in/sign-out events
    clerkInstance.addListener(({ user }) => {
      if (user) {
        console.log('👤 User signed in:', user.primaryEmailAddress?.emailAddress);
        authCallbacks.onSignIn?.(formatUser(user));
      } else {
        console.log('👋 User signed out');
        authCallbacks.onSignOut?.();
      }
    });
    
    console.log('👤 No active session - user not signed in');
    return { user: null, isAuthenticated: false };
  } catch (error) {
    console.error('Auth initialization error:', error);
    return { user: null, isAuthenticated: false };
  }
}

/**
 * Load Clerk script and wait for it to fully initialize
 */
async function loadAndInitClerk(publishableKey) {
  // Check if Clerk is already loaded and initialized
  if (window.Clerk && window.Clerk.loaded) {
    console.log('🔐 Clerk already initialized');
    return;
  }
  
  // Remove any existing Clerk script
  const existingScript = document.querySelector('script[data-clerk-script]');
  if (existingScript) {
    existingScript.remove();
  }
  
  // Extract the Frontend API domain from the publishable key
  // pk_test_b2JsaWdpbmctbWFsbGFyZC0yLmNsZXJrLmFjY291bnRzLmRldiQ decodes to obliging-mallard-2.clerk.accounts.dev$
  const frontendApi = extractFrontendApi(publishableKey);
  console.log('🔐 Using Clerk Frontend API:', frontendApi);
  
  // Load the Clerk script from the Frontend API (includes the key)
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.setAttribute('data-clerk-script', 'true');
    script.setAttribute('data-clerk-publishable-key', publishableKey);
    script.async = true;
    script.crossOrigin = 'anonymous';
    
    // Use the Frontend API URL - this version auto-initializes correctly
    script.src = `https://${frontendApi}/npm/@clerk/clerk-js@latest/dist/clerk.browser.js`;
    
    script.onload = () => {
      console.log('📜 Clerk script loaded from Frontend API');
      resolve();
    };
    
    script.onerror = (error) => {
      console.error('Failed to load Clerk from Frontend API, trying CDN...');
      // Fallback to CDN if Frontend API fails
      loadClerkFromCDN(publishableKey).then(resolve).catch(reject);
    };
    
    document.head.appendChild(script);
  });
  
  // Wait for window.Clerk to exist and be loaded
  await waitFor(() => window.Clerk, 10000, 'Clerk object');
  
  // If Clerk.loaded is false, try calling load() explicitly
  if (!window.Clerk.loaded) {
    console.log('🔐 Calling Clerk.load() explicitly...');
    try {
      await window.Clerk.load({ publishableKey });
    } catch (e) {
      // May already be loaded, ignore
      console.log('🔐 Clerk.load() result:', e?.message || 'success');
    }
  }
  
  // Wait for Clerk to be fully ready
  await waitFor(() => window.Clerk && window.Clerk.loaded, 10000, 'Clerk loaded state');
  
  console.log('🔐 Clerk fully initialized');
}

/**
 * Extract Frontend API domain from publishable key
 */
function extractFrontendApi(publishableKey) {
  try {
    // Remove 'pk_test_' or 'pk_live_' prefix
    const encoded = publishableKey.replace(/^pk_(test|live)_/, '');
    // Base64 decode
    const decoded = atob(encoded);
    // Remove trailing '$' if present
    return decoded.replace(/\$$/, '');
  } catch (e) {
    console.error('Failed to extract Frontend API from key:', e);
    return 'clerk.accounts.dev';
  }
}

/**
 * Fallback: Load Clerk from CDN
 */
async function loadClerkFromCDN(publishableKey) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.setAttribute('data-clerk-script', 'true');
    script.setAttribute('data-clerk-publishable-key', publishableKey);
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    script.async = true;
    script.crossOrigin = 'anonymous';
    
    script.onload = () => {
      console.log('📜 Clerk script loaded from CDN');
      resolve();
    };
    
    script.onerror = reject;
    
    document.head.appendChild(script);
  });
}

/**
 * Helper to wait for a condition with timeout
 */
function waitFor(condition, timeout, description = 'condition') {
  return new Promise((resolve, reject) => {
    if (condition()) {
      resolve();
      return;
    }
    
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
      if (condition()) {
        clearInterval(checkInterval);
        resolve();
      } else if (Date.now() - startTime > timeout) {
        clearInterval(checkInterval);
        reject(new Error(`Timeout waiting for ${description}`));
      }
    }, 100);
  });
}

/**
 * Check if Clerk is ready for use
 */
export function isClerkReady() {
  // Check our internal flag AND that Clerk instance has required methods
  return clerkReady && window.Clerk && (
    window.Clerk.loaded || 
    typeof window.Clerk.openSignIn === 'function' ||
    typeof window.Clerk.mountSignIn === 'function'
  );
}

/**
 * Format Clerk user object
 */
function formatUser(clerkUser) {
  if (!clerkUser) return null;
  
  return {
    id: clerkUser.id,
    email: clerkUser.primaryEmailAddress?.emailAddress,
    fullName: clerkUser.fullName || `${clerkUser.firstName || ''} ${clerkUser.lastName || ''}`.trim(),
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
    imageUrl: clerkUser.imageUrl
  };
}

/**
 * Open sign in modal
 */
export function openSignIn() {
  if (!clerkInstance) {
    console.warn('Clerk not initialized');
    return;
  }
  
  clerkInstance.openSignIn({
    appearance: {
      elements: {
        rootBox: {
          width: '100%'
        },
        card: {
          border: 'none',
          boxShadow: 'none'
        },
        headerTitle: {
          display: 'none'
        },
        headerSubtitle: {
          display: 'none'
        }
      },
      variables: {
        colorPrimary: '#C9A227',
        colorText: '#1A1A19',
        borderRadius: '8px'
      }
    }
  });
}

/**
 * Open sign up modal
 */
export function openSignUp() {
  if (!clerkInstance) {
    console.warn('Clerk not initialized');
    return;
  }
  
  clerkInstance.openSignUp({
    appearance: {
      variables: {
        colorPrimary: '#C9A227',
        colorText: '#1A1A19',
        borderRadius: '8px'
      }
    }
  });
}

/**
 * Sign out current user
 */
export async function signOut() {
  if (!clerkInstance) {
    console.warn('Clerk not initialized');
    return;
  }
  
  await clerkInstance.signOut();
  authCallbacks.onSignOut?.();
}

/**
 * Get current user
 */
export function getCurrentUser() {
  if (!clerkInstance || !clerkInstance.user) {
    return null;
  }
  return formatUser(clerkInstance.user);
}

/**
 * Get auth token for API requests
 */
export async function getToken() {
  if (!clerkInstance || !clerkInstance.session) {
    return null;
  }
  
  try {
    return await clerkInstance.session.getToken();
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated() {
  return !!(clerkInstance && clerkInstance.user);
}

/**
 * Get the Clerk instance
 */
export function getClerkInstance() {
  return clerkInstance;
}

// Export as window global for use by other scripts (like auth-oauth.js)
window.MarineStreamClerkAuth = {
  initAuth,
  openSignIn,
  openSignUp,
  signOut,
  getCurrentUser,
  getToken,
  isAuthenticated,
  getClerkInstance
};
