/**
 * MarineStream Workspace - Main Application
 * Entry point for the frontend
 */

import { loadConfig, getClerkKey, getMapboxToken } from './config.js';
import { initAuth, isClerkReady } from './auth.js';
import { initMap } from './map.js';
import { loadApps, filterApps } from './apps.js';
import { initVideoUI } from './video-ui.js';

// Humorous loading messages (Discord-inspired)
const loadingMessages = [
  "Scrubbing barnacles off the server...",
  "Dredging the ocean floor for pixels...",
  "Diving deeper for higher resolution...",
  "Calibrating propellers for optimal streaming...",
  "Adjusting ballast for smooth video playback...",
  "Checking hull integrity before departure...",
  "Training ROVs to capture your attention...",
  "Herding digital sea creatures into formation...",
  "Untangling oceanic fiber cables...",
  "Waking up the underwater cameraman...",
  "Applying digital antifouling coating...",
  "Negotiating with digital mermaids for screen time...",
  "Polishing pixels to maritime standards...",
  "Waiting for digital high tide...",
  "Captain is reviewing the video manifest...",
  "Calculating nautical load times..."
];

// Global state
const state = {
  user: null,
  apps: [],
  vessels: [],
  map: null,
  isAuthenticated: false,
  config: null,
  messageInterval: null,
  messageIndex: 0
};

// DOM Elements
const elements = {
  loadingScreen: document.getElementById('loading-screen'),
  loadingMessage: document.querySelector('.loading-message'),
  progressBar: document.querySelector('.progress-bar'),
  app: document.getElementById('app'),
  menuToggle: document.getElementById('menu-toggle'),
  globalSearch: document.getElementById('global-search'),
  userAvatar: document.getElementById('user-avatar'),
  userDropdown: document.getElementById('user-dropdown'),
  userName: document.getElementById('user-name'),
  userEmail: document.getElementById('user-email'),
  signoutBtn: document.getElementById('signout-btn'),
  appsGrid: document.getElementById('apps-grid'),
  filterBtns: document.querySelectorAll('.filter-btn'),
  vesselPanel: document.getElementById('vessel-panel'),
  closePanel: document.getElementById('close-panel'),
  authModal: document.getElementById('auth-modal'),
  expandMap: document.getElementById('expand-map'),
  mapModal: document.getElementById('map-modal'),
  closeMapModal: document.getElementById('close-map-modal'),
  appCount: document.getElementById('app-count')
};

/**
 * Start cycling through loading messages
 */
function startMessageCycle() {
  if (!elements.loadingMessage) return;
  
  // Set initial message
  elements.loadingMessage.textContent = loadingMessages[0];
  
  // Cycle through messages every 3 seconds
  state.messageInterval = setInterval(() => {
    state.messageIndex = (state.messageIndex + 1) % loadingMessages.length;
    
    // Fade out
    elements.loadingMessage.style.opacity = 0;
    
    setTimeout(() => {
      if (elements.loadingMessage) {
        elements.loadingMessage.textContent = loadingMessages[state.messageIndex];
        elements.loadingMessage.style.opacity = 1;
      }
    }, 300);
  }, 3000);
}

/**
 * Update the progress bar
 */
function updateProgressBar(progress) {
  if (elements.progressBar) {
    elements.progressBar.style.width = `${Math.min(progress, 100)}%`;
  }
}

/**
 * Simulate progress while loading
 */
function simulateProgress() {
  if (!elements.progressBar) return;
  
  let fakeProgress = 0;
  const progressInterval = setInterval(() => {
    if (fakeProgress < 75) {
      fakeProgress += Math.random() * 8;
      if (fakeProgress > 75) fakeProgress = 75;
      updateProgressBar(fakeProgress);
    } else {
      clearInterval(progressInterval);
    }
  }, 300);
  
  return progressInterval;
}

/**
 * Initialize the application
 */
async function init() {
  console.log('🚢 MarineStream Workspace initializing...');
  
  // Start loading animations
  startMessageCycle();
  const progressInterval = simulateProgress();
  
  try {
    // Load configuration from server first
    state.config = await loadConfig();
    updateProgressBar(40);
    
    // Set Mapbox access token if available
    const mapboxToken = getMapboxToken();
    if (mapboxToken && typeof mapboxgl !== 'undefined') {
      mapboxgl.accessToken = mapboxToken;
      console.log('🗺️ Mapbox token configured');
    }
    
    // Initialize Clerk auth with key from config (non-blocking)
    const clerkKey = getClerkKey();
    if (clerkKey) {
      try {
        const authResult = await initAuth({
          publishableKey: clerkKey,
          onSignIn: handleSignIn,
          onSignOut: handleSignOut
        });
        
        state.user = authResult.user;
        state.isAuthenticated = authResult.isAuthenticated;
        
        // Initialize video UI for already-authenticated users
        if (authResult.isAuthenticated && authResult.user) {
          initVideoUI(authResult.user).then(() => {
            checkCallInviteUrl();
          }).catch(err => {
            console.warn('Video UI init error:', err);
          });
        }
      } catch (authError) {
        console.warn('⚠️ Auth initialization failed - continuing without auth:', authError.message);
        state.user = null;
        state.isAuthenticated = false;
      }
    } else {
      console.warn('⚠️ Clerk publishable key not configured - auth disabled');
      state.user = null;
      state.isAuthenticated = false;
    }
    updateProgressBar(60);
    
    // Update UI based on auth state (don't throw if Clerk isn't ready)
    try {
      updateAuthUI();
    } catch (uiError) {
      console.warn('⚠️ Could not update auth UI:', uiError.message);
    }
    
    // Load applications
    await loadApps(elements.appsGrid);
    updateProgressBar(80);
    
    // Initialize map
    state.map = await initMap('map', {
      onVesselClick: handleVesselClick
    });
    updateProgressBar(95);
    
    // Setup event listeners
    setupEventListeners();
    
    // Complete loading
    updateProgressBar(100);
    
    // Hide loading screen after a brief moment
    setTimeout(() => {
      hideLoadingScreen();
    }, 500);
    
    console.log('✅ MarineStream Workspace ready');
  } catch (error) {
    console.error('Failed to initialize:', error);
    updateProgressBar(100);
    hideLoadingScreen();
    showError('Failed to load the workspace. Please refresh the page.');
  }
}

/**
 * Hide loading screen with animation
 */
function hideLoadingScreen() {
  // Stop message cycling
  if (state.messageInterval) {
    clearInterval(state.messageInterval);
  }
  
  if (!elements.loadingScreen) {
    document.body.classList.remove('is-loading');
    return;
  }
  
  // Add completion class for fade animation
  elements.loadingScreen.classList.add('loading-complete');
  
  // Wait for animation and then hide
  setTimeout(() => {
    elements.loadingScreen.style.display = 'none';
    document.body.classList.remove('is-loading');
    if (elements.app) {
      elements.app.classList.remove('hidden');
    }
  }, 800);
}

/**
 * Handle successful sign in
 */
function handleSignIn(user) {
  state.user = user;
  state.isAuthenticated = true;
  updateAuthUI();
  
  // Reload apps with user-specific access
  loadApps(elements.appsGrid);
  
  // Initialize video calling UI
  initVideoUI(user).then(() => {
    // Check for call invite in URL (from email invite)
    checkCallInviteUrl();
  }).catch(err => {
    console.warn('Video UI init error:', err);
  });
  
  // Close auth modal if open
  elements.authModal.classList.remove('show');
  elements.authModal.classList.add('hidden');
}

/**
 * Check URL for call invite token and join if valid
 */
async function checkCallInviteUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const inviteToken = urlParams.get('join_call');
  
  if (!inviteToken) return;
  
  try {
    // Get invite details
    const response = await fetch(`/api/video/invite/${inviteToken}`);
    const result = await response.json();
    
    if (!result.success) {
      console.warn('Invalid call invite:', result.error);
      return;
    }
    
    const { channelName, fromUserName, callStatus } = result.data;
    
    // Check if call is still active
    if (callStatus !== 'active') {
      alert(`The call from ${fromUserName} has ended.`);
      // Clean up URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }
    
    // Prompt user to join
    if (confirm(`${fromUserName} invited you to a video call. Join now?`)) {
      // Import video functions
      const { joinCall } = await import('./video-call.js');
      await joinCall(channelName, state.user.id, state.user.fullName);
      
      // Show PiP widget
      document.getElementById('video-pip-widget')?.classList.remove('hidden');
      document.getElementById('video-call-btn')?.classList.add('in-call');
    }
    
    // Clean up URL
    window.history.replaceState({}, '', window.location.pathname);
    
  } catch (error) {
    console.error('Join call from URL error:', error);
  }
}

/**
 * Handle sign out
 */
function handleSignOut() {
  state.user = null;
  state.isAuthenticated = false;
  updateAuthUI();
  
  // Reload apps for public view
  loadApps(elements.appsGrid);
}

/**
 * Update UI based on authentication state
 */
function updateAuthUI() {
  if (state.user) {
    // User is signed in
    elements.userName.textContent = state.user.fullName || state.user.email;
    elements.userEmail.textContent = state.user.email;
    
    // Update avatar
    if (state.user.imageUrl) {
      elements.userAvatar.innerHTML = `<img src="${state.user.imageUrl}" alt="${state.user.fullName}">`;
    } else {
      const initials = getInitials(state.user.fullName || state.user.email);
      elements.userAvatar.innerHTML = `<span>${initials}</span>`;
    }
    
    // Hide auth modal if shown
    if (elements.authModal) {
      elements.authModal.classList.add('hidden');
      elements.authModal.classList.remove('show');
    }
  } else {
    // User is NOT signed in - show sign-in prompt
    elements.userName.textContent = 'Guest';
    elements.userEmail.textContent = 'Click to sign in';
    elements.userAvatar.innerHTML = '<span>?</span>';
    
    // Show sign-in prompt in auth modal
    showSignInPrompt();
  }
}

/**
 * Show sign-in prompt/modal
 */
function showSignInPrompt() {
  if (!elements.authModal) return;
  
  const clerkAuthDiv = document.getElementById('clerk-auth');
  if (!clerkAuthDiv) return;
  
  // Clear any existing content
  clerkAuthDiv.innerHTML = '';
  
  // Create a simple sign-in button that opens Clerk's native modal
  const signInBtn = document.createElement('button');
  signInBtn.className = 'btn btn-primary';
  signInBtn.style.cssText = `
    width: 100%;
    padding: 14px 24px;
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    background: #FF6600;
    color: white;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
  `;
  signInBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
      <polyline points="10 17 15 12 10 7"/>
      <line x1="15" y1="12" x2="3" y2="12"/>
    </svg>
    Sign In with Email or Social
  `;
  
  signInBtn.addEventListener('mouseenter', () => {
    signInBtn.style.background = '#e55a00';
    signInBtn.style.transform = 'translateY(-1px)';
  });
  signInBtn.addEventListener('mouseleave', () => {
    signInBtn.style.background = '#FF6600';
    signInBtn.style.transform = 'translateY(0)';
  });
  
  signInBtn.addEventListener('click', () => {
    // Close our modal first
    closeAuthModal();
    
    // Open Clerk's native sign-in modal
    if (isClerkReady() && window.Clerk && window.Clerk.openSignIn) {
      window.Clerk.openSignIn({
        appearance: {
          variables: {
            colorPrimary: '#FF6600',
            colorText: '#1a1a19',
            borderRadius: '8px'
          }
        }
      });
    } else {
      console.warn('Clerk sign-in not available yet');
      alert('Sign-in is still loading. Please try again in a moment.');
    }
  });
  
  clerkAuthDiv.appendChild(signInBtn);
  
  // Add "or create account" text
  const signUpText = document.createElement('p');
  signUpText.style.cssText = 'text-align: center; margin-top: 16px; color: #666; font-size: 14px;';
  signUpText.innerHTML = `Don't have an account? <a href="#" id="open-signup" style="color: #FF6600; text-decoration: none; font-weight: 500;">Sign up</a>`;
  clerkAuthDiv.appendChild(signUpText);
  
  // Add click handler for sign up link
  setTimeout(() => {
    document.getElementById('open-signup')?.addEventListener('click', (e) => {
      e.preventDefault();
      closeAuthModal();
      if (window.Clerk && window.Clerk.openSignUp) {
        window.Clerk.openSignUp({
          appearance: {
            variables: {
              colorPrimary: '#FF6600'
            }
          }
        });
      }
    });
  }, 0);
  
  // Show our modal
  elements.authModal.classList.remove('hidden');
  elements.authModal.classList.add('show');
}

/**
 * Get initials from name
 */
function getInitials(name) {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Handle vessel marker click
 */
function handleVesselClick(vessel) {
  // Update panel content
  document.getElementById('panel-vessel-name').textContent = vessel.name || 'Unknown Vessel';
  document.getElementById('panel-vessel-type').textContent = vessel.vessel_type || '—';
  document.getElementById('panel-vessel-flag').textContent = vessel.flag || '—';
  document.getElementById('panel-vessel-mmsi').textContent = vessel.mmsi || '—';
  
  if (vessel.position) {
    document.getElementById('panel-vessel-speed').textContent = 
      vessel.position.speed ? `${vessel.position.speed.toFixed(1)} kn` : '—';
    document.getElementById('panel-vessel-course').textContent = 
      vessel.position.course ? `${vessel.position.course.toFixed(0)}°` : '—';
    document.getElementById('panel-vessel-status').textContent = 
      getNavStatus(vessel.position.status);
    document.getElementById('panel-vessel-position').textContent = 
      `${vessel.position.lat.toFixed(5)}, ${vessel.position.lon.toFixed(5)}`;
  }
  
  // Update job delivery link
  const jobsLink = document.getElementById('panel-view-jobs');
  jobsLink.href = `https://app.marinestream.io/vessels/${vessel.mmsi || ''}`;
  
  // Show panel
  elements.vesselPanel.classList.add('show');
  elements.vesselPanel.classList.remove('hidden');
}

/**
 * Get navigational status text
 */
function getNavStatus(code) {
  const statuses = {
    0: 'Underway (engine)',
    1: 'At anchor',
    2: 'Not under command',
    3: 'Restricted maneuver',
    4: 'Constrained by draught',
    5: 'Moored',
    6: 'Aground',
    7: 'Engaged in fishing',
    8: 'Underway (sailing)',
    15: 'Undefined'
  };
  return statuses[code] || '—';
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // User dropdown toggle / sign-in trigger
  elements.userAvatar.addEventListener('click', (e) => {
    e.stopPropagation();
    
    if (state.isAuthenticated) {
      // User is signed in - show dropdown
      elements.userDropdown.classList.toggle('show');
      elements.userDropdown.classList.toggle('hidden');
    } else {
      // User is NOT signed in - trigger sign-in
      try {
        if (isClerkReady() && window.Clerk && window.Clerk.openSignIn) {
          window.Clerk.openSignIn({
            appearance: {
              variables: {
                colorPrimary: '#FF6600'
              }
            }
          });
        } else {
          // Fallback: show auth modal
          showSignInPrompt();
        }
      } catch (error) {
        console.warn('Could not open sign-in:', error.message);
        showSignInPrompt();
      }
    }
  });
  
  // Close dropdown on outside click
  document.addEventListener('click', () => {
    elements.userDropdown.classList.remove('show');
    elements.userDropdown.classList.add('hidden');
  });
  
  // Sign out button
  elements.signoutBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    if (window.Clerk) {
      await window.Clerk.signOut();
    }
    handleSignOut();
  });
  
  // Filter buttons
  elements.filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      
      // Update active state
      elements.filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Filter apps
      filterApps(elements.appsGrid, category);
    });
  });
  
  // Close vessel panel
  elements.closePanel?.addEventListener('click', () => {
    elements.vesselPanel.classList.remove('show');
    elements.vesselPanel.classList.add('hidden');
  });
  
  // Global search (keyboard shortcut)
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      elements.globalSearch.focus();
    }
    
    // Close panel on Escape
    if (e.key === 'Escape') {
      elements.vesselPanel.classList.remove('show');
      elements.vesselPanel.classList.add('hidden');
      elements.userDropdown.classList.remove('show');
      elements.userDropdown.classList.add('hidden');
    }
  });
  
  // Search input
  elements.globalSearch?.addEventListener('input', debounce((e) => {
    const query = e.target.value.toLowerCase().trim();
    
    if (!query) {
      filterApps(elements.appsGrid, 'all');
      return;
    }
    
    // Search apps
    const appCards = elements.appsGrid.querySelectorAll('.app-card:not(.app-card--skeleton)');
    appCards.forEach(card => {
      const name = card.querySelector('.app-name')?.textContent.toLowerCase() || '';
      const desc = card.querySelector('.app-description')?.textContent.toLowerCase() || '';
      const matches = name.includes(query) || desc.includes(query);
      card.style.display = matches ? '' : 'none';
    });
  }, 200));
  
  // Map controls
  document.getElementById('zoom-in')?.addEventListener('click', () => {
    state.map?.zoomIn();
  });
  
  document.getElementById('zoom-out')?.addEventListener('click', () => {
    state.map?.zoomOut();
  });
  
  document.getElementById('fit-bounds')?.addEventListener('click', () => {
    state.map?.fitBounds();
  });
  
  document.getElementById('fullscreen-map')?.addEventListener('click', () => {
    const mapSection = document.querySelector('.map-section');
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      mapSection.requestFullscreen();
    }
  });
  
  // Expand map to modal
  elements.expandMap?.addEventListener('click', () => {
    if (elements.mapModal) {
      elements.mapModal.classList.remove('hidden');
      elements.mapModal.classList.add('show');
      
      // Trigger map resize after modal opens
      setTimeout(() => {
        state.map?.resize();
      }, 100);
    }
  });
  
  // Close map modal
  elements.closeMapModal?.addEventListener('click', () => {
    if (elements.mapModal) {
      elements.mapModal.classList.remove('show');
      elements.mapModal.classList.add('hidden');
    }
  });
  
  // Close modal on backdrop click
  elements.mapModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    elements.mapModal.classList.remove('show');
    elements.mapModal.classList.add('hidden');
  });
  
  // Auth modal close handlers
  document.getElementById('close-auth-modal')?.addEventListener('click', closeAuthModal);
  document.getElementById('auth-modal-backdrop')?.addEventListener('click', closeAuthModal);
  document.getElementById('continue-guest')?.addEventListener('click', (e) => {
    e.preventDefault();
    closeAuthModal();
  });
}

/**
 * Close the auth modal
 */
function closeAuthModal() {
  if (elements.authModal) {
    elements.authModal.classList.remove('show');
    elements.authModal.classList.add('hidden');
  }
}

/**
 * Debounce helper
 */
function debounce(fn, delay) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Show error message
 */
function showError(message) {
  console.error(message);
  // Could add toast notification here
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Export for debugging
window.MarineStream = { state };
