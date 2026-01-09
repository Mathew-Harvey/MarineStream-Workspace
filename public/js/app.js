/**
 * MarineStream Workspace - Main Application
 * Entry point for the frontend
 */

import { loadConfig, getClerkKey, getMapboxToken } from './config.js';
import { initAuth } from './auth.js';
import { initMap } from './map.js';
import { loadApps, filterApps } from './apps.js';

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
    
    // Initialize Clerk auth with key from config
    const clerkKey = getClerkKey();
    if (clerkKey) {
      const authResult = await initAuth({
        publishableKey: clerkKey,
        onSignIn: handleSignIn,
        onSignOut: handleSignOut
      });
      
      state.user = authResult.user;
      state.isAuthenticated = authResult.isAuthenticated;
    } else {
      console.warn('⚠️ Clerk publishable key not configured - auth disabled');
      state.user = null;
      state.isAuthenticated = false;
    }
    updateProgressBar(60);
    
    // Update UI based on auth state
    updateAuthUI();
    
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
  
  // Close auth modal if open
  elements.authModal.classList.remove('show');
  elements.authModal.classList.add('hidden');
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
    // Show user info
    elements.userName.textContent = state.user.fullName || state.user.email;
    elements.userEmail.textContent = state.user.email;
    
    // Update avatar
    if (state.user.imageUrl) {
      elements.userAvatar.innerHTML = `<img src="${state.user.imageUrl}" alt="${state.user.fullName}">`;
    } else {
      const initials = getInitials(state.user.fullName || state.user.email);
      elements.userAvatar.innerHTML = `<span>${initials}</span>`;
    }
  } else {
    elements.userName.textContent = 'Guest';
    elements.userEmail.textContent = 'Not signed in';
    elements.userAvatar.innerHTML = '<span>?</span>';
  }
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
  // User dropdown toggle
  elements.userAvatar.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.userDropdown.classList.toggle('show');
    elements.userDropdown.classList.toggle('hidden');
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
