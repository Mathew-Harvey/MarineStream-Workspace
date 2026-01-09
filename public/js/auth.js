/**
 * MarineStream Workspace - Authentication Module
 * Clerk integration for user authentication
 */

let clerkInstance = null;
let authCallbacks = {};

/**
 * Initialize Clerk authentication
 */
export async function initAuth(options = {}) {
  const { publishableKey, onSignIn, onSignOut } = options;
  authCallbacks = { onSignIn, onSignOut };
  
  // Check if Clerk script is loaded
  if (typeof window.Clerk === 'undefined') {
    console.warn('Clerk script not loaded - waiting...');
    // Wait for Clerk script to load (max 5 seconds)
    await new Promise((resolve) => {
      let attempts = 0;
      const checkClerk = setInterval(() => {
        attempts++;
        if (typeof window.Clerk !== 'undefined' || attempts > 50) {
          clearInterval(checkClerk);
          resolve();
        }
      }, 100);
    });
  }
  
  if (typeof window.Clerk === 'undefined') {
    console.warn('Clerk not available - auth disabled');
    return { user: null, isAuthenticated: false };
  }
  
  if (!publishableKey) {
    console.warn('No Clerk publishable key - auth disabled');
    return { user: null, isAuthenticated: false };
  }
  
  try {
    // Initialize Clerk with the publishable key
    await window.Clerk.load({
      publishableKey: publishableKey
    });
    
    clerkInstance = window.Clerk;
    
    // Check current session
    const user = clerkInstance.user;
    
    if (user) {
      console.log('👤 User authenticated:', user.primaryEmailAddress?.emailAddress);
      return {
        user: formatUser(user),
        isAuthenticated: true
      };
    }
    
    // Setup auth listeners
    clerkInstance.addListener(({ user }) => {
      if (user) {
        authCallbacks.onSignIn?.(formatUser(user));
      } else {
        authCallbacks.onSignOut?.();
      }
    });
    
    return { user: null, isAuthenticated: false };
  } catch (error) {
    console.error('Auth initialization error:', error);
    return { user: null, isAuthenticated: false };
  }
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
