/**
 * MarineStream Fleet Command - Dashboard v2
 * Map-first design with real-time metrics overlay
 * Based on MarineStream™ Style Guide v1.0
 */

// Import shared map utilities
import { 
  getLng, 
  getLat, 
  isValidPosition, 
  normalizePosition, 
  debounce,
  escapeHtml 
} from './map-utils.js';

// Import fouling calculator module
import * as FoulingCalculator from './fouling-calculator.js';

// Import widgets
import { KanbanBoard } from './widgets/kanban.js';
import { WorkCalendar } from './widgets/calendar.js';

// ============================================
// Humorous Loading Messages
// ============================================
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

// ============================================
// State Management
// ============================================
const state = {
  // Auth state
  token: null,
  tokenExpiresAt: null,
  user: null,
  authMethod: null, // 'sso' or 'pat'
  
  // Data state
  fleet: [],
  fleets: [], // User-created fleet groupings
  summary: null,
  selectedVessel: null,
  filter: 'all', // all, ran, commercial
  selectedFleetId: null, // Currently selected fleet filter
  
  // Fleet creation state
  selectedVesselsForFleet: new Set(),
  selectedFleetColor: '#3b82f6',
  selectedFleetIcon: 'anchor',
  
  // Map state
  map: null,
  markers: new Map(), // vessel.id -> Mapbox Marker
  
  // AIS real-time tracking
  aisWebSocket: null,
  aisPositions: new Map(), // MMSI -> position data
  aisReconnectAttempts: 0,
  
  // UI state
  charts: {
    perfTrend: null
  },
  mapStyle: 'dark',
  
  // Token refresh interval
  refreshInterval: null,
  
  // Loading state
  messageIndex: 0,
  messageInterval: null,
  
  // Work panel widgets
  workPanelOpen: false,
  kanbanBoard: null,
  workCalendar: null,
  currentWorkView: 'kanban'
};

// ============================================
// Loading Screen Functions
// ============================================
function startLoadingMessages() {
  const loadingMessage = document.querySelector('.loading-message');
  if (!loadingMessage) return;
  
  loadingMessage.textContent = loadingMessages[0];
  
  state.messageInterval = setInterval(() => {
    state.messageIndex = (state.messageIndex + 1) % loadingMessages.length;
    loadingMessage.style.opacity = 0;
    
    setTimeout(() => {
      if (loadingMessage) {
        loadingMessage.textContent = loadingMessages[state.messageIndex];
        loadingMessage.style.opacity = 1;
      }
    }, 300);
  }, 3000);
}

function updateProgressBar(progress) {
  const progressBar = document.querySelector('.progress-bar');
  if (progressBar) {
    progressBar.style.width = `${Math.min(progress, 100)}%`;
  }
}

function hideLoadingScreen() {
  if (state.messageInterval) {
    clearInterval(state.messageInterval);
  }
  
  const loadingScreen = document.getElementById('loading-screen');
  if (!loadingScreen) {
    document.body.classList.remove('is-loading');
    return;
  }
  
  loadingScreen.classList.add('loading-complete');
  
  setTimeout(() => {
    loadingScreen.style.display = 'none';
    document.body.classList.remove('is-loading');
  }, 800);
}

// ============================================
// DOM Elements
// ============================================
const elements = {};

function initElements() {
  elements.authModal = document.getElementById('auth-modal');
  elements.patInput = document.getElementById('pat-input');
  elements.authSubmit = document.getElementById('auth-submit');
  elements.app = document.getElementById('app');
  
  // Summary
  elements.totalVessels = document.getElementById('total-vessels');
  elements.ranCount = document.getElementById('ran-count');
  elements.commercialCount = document.getElementById('commercial-count');
  elements.dueSoon = document.getElementById('due-soon');
  
  // Performance gauges
  elements.gaugeFon = document.getElementById('gauge-fon');
  elements.gaugeHp = document.getElementById('gauge-hp');
  elements.perfDetail = document.getElementById('perf-detail');
  elements.togglePerfDetail = document.getElementById('toggle-perf-detail');
  
  // Vessel list
  elements.vesselList = document.getElementById('vessel-list');
  elements.vesselSearch = document.getElementById('vessel-search');
  elements.vesselPanel = document.getElementById('vessel-panel');
  
  // Vessel detail
  elements.vesselDetail = document.getElementById('vessel-detail');
  elements.closeDetail = document.getElementById('close-detail');
  
  // Activity
  elements.activityFeed = document.getElementById('activity-feed');
  elements.toggleActivity = document.getElementById('toggle-activity');
  elements.activityPanel = document.getElementById('activity-panel');
  
  // User
  elements.userInitials = document.getElementById('user-initials');
  elements.userBadge = document.getElementById('user-badge');
  
  // Modals
  elements.methodologyModal = document.getElementById('methodology-modal');
  elements.methodologyBtn = document.getElementById('methodology-btn');
  elements.closeMethodology = document.getElementById('close-methodology');
  
  // Map controls
  elements.zoomIn = document.getElementById('zoom-in');
  elements.zoomOut = document.getElementById('zoom-out');
  elements.fitBounds = document.getElementById('fit-bounds');
  elements.refreshBtn = document.getElementById('refresh-btn');
  
  // Filters
  elements.filterPills = document.querySelectorAll('.filter-pill');
  elements.styleButtons = document.querySelectorAll('.style-btn');
  
  // Fleet UI
  elements.createFleetBtn = document.getElementById('create-fleet-btn');
  elements.manageFleetsBtn = document.getElementById('manage-fleets-btn');
  elements.fleetTabs = document.getElementById('fleet-tabs');
  elements.createFleetModal = document.getElementById('create-fleet-modal');
  elements.closeFleetModal = document.getElementById('close-fleet-modal');
  elements.cancelFleetBtn = document.getElementById('cancel-fleet');
  elements.saveFleetBtn = document.getElementById('save-fleet');
  elements.fleetNameInput = document.getElementById('fleet-name');
  elements.fleetDescInput = document.getElementById('fleet-description');
  elements.fleetVesselSearch = document.getElementById('fleet-vessel-search');
  elements.vesselSelector = document.getElementById('vessel-selector');
  elements.selectedVesselCount = document.getElementById('selected-vessel-count');
  elements.selectedVesselsPreview = document.getElementById('selected-vessels-preview');
  elements.colorOptions = document.querySelectorAll('.color-option');
  elements.iconOptions = document.querySelectorAll('.icon-option');
}

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Start loading screen animations
  startLoadingMessages();
  updateProgressBar(10);
  
  initElements();
  setupEventListeners();
  setupAuthEventListeners();
  updateProgressBar(20);
  
  // Check for token in URL (from bookmarklet)
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  if (urlToken) {
    console.log('✅ Token received from bookmarklet');
    // Store the token
    localStorage.setItem('marinestream_pat', urlToken);
    try {
      const payload = JSON.parse(atob(urlToken.split('.')[1]));
      localStorage.setItem('marinestream_token_expiry', (payload.exp * 1000).toString());
      localStorage.setItem('marinestream_user_info', JSON.stringify({
        name: payload.preferred_name || payload.name || 'User',
        email: payload.email
      }));
    } catch (e) {}
    // Clear URL params
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  updateProgressBar(30);
  
  // Check for stored token
  const storedToken = localStorage.getItem('marinestream_pat');
  const storedExpiry = localStorage.getItem('marinestream_token_expiry');
  
  if (storedToken && storedExpiry) {
    const remaining = parseInt(storedExpiry) - Date.now();
    if (remaining > 60000) { // More than 1 minute left
      console.log('✅ Using stored token');
      state.authMethod = 'pat';
      state.token = storedToken;
      state.tokenExpiresAt = parseInt(storedExpiry);
      
      // Get user info if available
      try {
        const userInfo = JSON.parse(localStorage.getItem('marinestream_user_info') || '{}');
        if (userInfo.name) {
          state.user = userInfo;
        }
      } catch (e) {}
      
      updateProgressBar(50);
      
      // Show app and load data
      elements.authModal?.classList.remove('active');
      elements.app?.classList.remove('hidden');
      updateUserBadge();
      startTokenStatusUpdate();
      
      updateProgressBar(70);
      await loadAllData();
      
      updateProgressBar(90);
      initMap();
      
      updateProgressBar(100);
      setTimeout(hideLoadingScreen, 500);
      return;
    }
  }
  
  // Check for stored PAT without expiry (legacy)
  const legacyPat = localStorage.getItem('marinestream_pat');
  if (legacyPat && !storedExpiry) {
    state.authMethod = 'pat';
    state.token = legacyPat;
    await tryConnectWithToken();
    updateProgressBar(100);
    setTimeout(hideLoadingScreen, 500);
    return;
  }
  
  // No auth - show login modal
  updateProgressBar(100);
  hideLoadingScreen();
  showAuthModal();
}

/**
 * Setup auth event listeners
 */
function setupAuthEventListeners() {
  // Listen for token refresh events
  window.addEventListener('auth:tokenRefreshed', () => {
    console.log('🔄 Token was refreshed');
    updateTokenStatus();
    // Update the state token
    if (window.MarineStreamAuth) {
      MarineStreamAuth.getAccessToken().then(token => {
        state.token = token;
      });
    }
  });
  
  // Listen for token expiry events
  window.addEventListener('auth:tokenExpired', () => {
    console.log('⚠️ Token expired');
    updateTokenStatus('expired');
    showAuthModal('Your session has expired. Please login again.');
  });
  
  // Listen for refresh failure events
  window.addEventListener('auth:refreshFailed', (event) => {
    console.log('❌ Token refresh failed:', event.detail);
    updateTokenStatus('expired');
    showAuthModal('Session refresh failed. Please login again.');
  });
}

/**
 * Start token status update interval
 */
let tokenStatusInterval = null;
function startTokenStatusUpdate() {
  if (tokenStatusInterval) {
    clearInterval(tokenStatusInterval);
  }
  
  // Update immediately
  updateTokenStatus();
  
  // Update every 10 seconds
  tokenStatusInterval = setInterval(updateTokenStatus, 10000);
}

/**
 * Update token status display
 */
function updateTokenStatus(forceStatus = null) {
  const statusEl = document.getElementById('token-status');
  const timerEl = document.getElementById('token-timer');
  
  if (!statusEl || !timerEl) return;
  
  if (forceStatus === 'expired') {
    statusEl.className = 'token-status expired';
    timerEl.textContent = 'Expired';
    return;
  }
  
  if (forceStatus === 'refreshing') {
    statusEl.className = 'token-status refreshing';
    timerEl.textContent = 'Refreshing...';
    return;
  }
  
  // Get expiry info from auth module
  const expiryInfo = window.MarineStreamAuth?.getTokenExpiryInfo?.();
  
  if (!expiryInfo) {
    statusEl.className = 'token-status';
    timerEl.textContent = '--:--';
    return;
  }
  
  if (expiryInfo.isExpired) {
    statusEl.className = 'token-status expired';
    timerEl.textContent = 'Expired';
    return;
  }
  
  // Format remaining time
  const mins = Math.floor(expiryInfo.remainingSeconds / 60);
  const secs = expiryInfo.remainingSeconds % 60;
  timerEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
  
  // Update status class based on time remaining
  if (expiryInfo.remainingMinutes < 5) {
    statusEl.className = 'token-status expiring-soon';
    statusEl.title = `Token expires in ${expiryInfo.remainingMinutes} minutes. Will auto-refresh if using SSO.`;
  } else {
    statusEl.className = 'token-status';
    statusEl.title = `Token expires in ${expiryInfo.remainingMinutes} minutes`;
  }
}

/**
 * Legacy SSO check - now handled by MarineStreamAuth module
 * This function is kept for backward compatibility
 */
async function checkSSOAuth() {
  // Delegate to auth module
  if (window.MarineStreamAuth) {
    const authenticated = await MarineStreamAuth.isAuthenticated();
    if (authenticated) {
      const token = await MarineStreamAuth.getAccessToken();
      const userInfo = MarineStreamAuth.getUserInfo();
      const expiryInfo = MarineStreamAuth.getTokenExpiryInfo();
      
      return {
        accessToken: token,
        user: userInfo,
        expiresAt: expiryInfo?.expiryTime?.getTime() || Date.now() + 3600000
      };
    }
  }
  return null;
}

/**
 * Legacy token refresh - now handled by MarineStreamAuth module
 */
function startTokenRefresh() {
  // Token refresh is now handled automatically by the auth module
  // We just need to update the status display
  startTokenStatusUpdate();
}

/**
 * Legacy refresh function - now handled by MarineStreamAuth module
 */
async function refreshTokenIfNeeded() {
  if (window.MarineStreamAuth && state.authMethod === 'sso') {
    const result = await MarineStreamAuth.refreshAccessToken();
    if (result) {
      state.token = result.access_token;
      return true;
    }
  }
  return false;
}


/**
 * Show authentication modal
 */
function showAuthModal(message = null) {
  elements.authModal?.classList.add('active');
  elements.app?.classList.add('hidden');
  
  // Show message if provided
  if (message) {
    const msgEl = document.querySelector('.auth-modal p:first-of-type');
    if (msgEl) {
      msgEl.textContent = message;
      msgEl.style.color = 'var(--color-warning)';
    }
  }
}

// Note: handleLogout is defined below after showAuthModal

/**
 * Update user badge with name/initials
 */
function updateUserBadge() {
  if (state.user) {
    const name = state.user.name || state.user.email || 'User';
    const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    if (elements.userInitials) elements.userInitials.textContent = initials;
    if (elements.userBadge) elements.userBadge.title = name;
  }
}

function setupEventListeners() {
  // Auth
  elements.authSubmit?.addEventListener('click', handleAuth);
  elements.patInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAuth();
  });
  
  // Logout on user badge click
  elements.userBadge?.addEventListener('click', handleLogout);
  
  // Fleet event listeners
  setupFleetEventListeners();
  
  // Filter pills
  elements.filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const filter = pill.dataset.filter;
      setFilter(filter);
    });
  });
  
  // Map style toggle
  elements.styleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setMapStyle(btn.dataset.style);
    });
  });
  
  // Map controls
  elements.zoomIn?.addEventListener('click', () => state.map?.zoomIn());
  elements.zoomOut?.addEventListener('click', () => state.map?.zoomOut());
  elements.fitBounds?.addEventListener('click', fitMapToVessels);
  elements.refreshBtn?.addEventListener('click', loadAllData);
  
  // Vessel search
  elements.vesselSearch?.addEventListener('input', (e) => {
    filterVesselList(e.target.value);
  });
  
  // Detail panel
  elements.closeDetail?.addEventListener('click', closeVesselDetail);
  
  // Performance panel toggle
  elements.togglePerfDetail?.addEventListener('click', togglePerfDetail);
  
  // Activity panel toggle
  elements.toggleActivity?.addEventListener('click', toggleActivityPanel);
  
  // Methodology modal
  elements.methodologyBtn?.addEventListener('click', () => {
    elements.methodologyModal?.classList.add('active');
  });
  elements.closeMethodology?.addEventListener('click', () => {
    elements.methodologyModal?.classList.remove('active');
  });
  elements.methodologyModal?.querySelector('.modal-backdrop')?.addEventListener('click', () => {
    elements.methodologyModal?.classList.remove('active');
  });
  
  // Work Panel event listeners
  setupWorkPanelListeners();
}

// ============================================
// Work Panel (Kanban + Calendar)
// ============================================

/**
 * Set up work panel event listeners
 */
function setupWorkPanelListeners() {
  const openBtn = document.getElementById('open-work-panel');
  const closeBtn = document.getElementById('close-work-panel');
  const overlay = document.getElementById('work-panel-overlay');
  const refreshBtn = document.getElementById('refresh-work-panel');
  const viewTabs = document.querySelectorAll('.work-view-tab');
  
  // Open panel
  openBtn?.addEventListener('click', openWorkPanel);
  
  // Close panel
  closeBtn?.addEventListener('click', closeWorkPanel);
  
  // Close on backdrop click
  overlay?.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeWorkPanel();
    }
  });
  
  // Close on Escape key
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.workPanelOpen) {
      closeWorkPanel();
    }
  });
  
  // Refresh work data
  refreshBtn?.addEventListener('click', refreshWorkPanel);
  
  // View tab switching
  viewTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      switchWorkView(view);
    });
  });
}

/**
 * Open the work panel
 */
async function openWorkPanel() {
  const overlay = document.getElementById('work-panel-overlay');
  overlay?.classList.add('active');
  state.workPanelOpen = true;
  
  // Initialize widgets if not already done
  if (!state.kanbanBoard) {
    state.kanbanBoard = new KanbanBoard('kanban-container', {
      onJobClick: (job) => {
        window.open(job.jobUrl, '_blank');
      }
    });
    await state.kanbanBoard.init();
  }
  
  if (!state.workCalendar) {
    state.workCalendar = new WorkCalendar('calendar-container', {
      onEventClick: (event) => {
        const jobUrl = event.extendedProps?.jobUrl;
        if (jobUrl) {
          window.open(jobUrl, '_blank');
        }
      }
    });
    // Only init calendar when we switch to it
  }
}

/**
 * Close the work panel
 */
function closeWorkPanel() {
  const overlay = document.getElementById('work-panel-overlay');
  overlay?.classList.remove('active');
  state.workPanelOpen = false;
}

/**
 * Refresh work panel data
 */
async function refreshWorkPanel() {
  const refreshBtn = document.getElementById('refresh-work-panel');
  if (refreshBtn) {
    refreshBtn.querySelector('svg')?.classList.add('spinning');
  }
  
  try {
    if (state.kanbanBoard) {
      await state.kanbanBoard.refresh();
    }
    if (state.workCalendar && state.currentWorkView === 'calendar') {
      await state.workCalendar.refresh();
    }
  } finally {
    if (refreshBtn) {
      refreshBtn.querySelector('svg')?.classList.remove('spinning');
    }
  }
}

/**
 * Switch between Kanban and Calendar views
 */
async function switchWorkView(view) {
  state.currentWorkView = view;
  
  // Update tab styles
  document.querySelectorAll('.work-view-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.view === view);
  });
  
  // Update panel visibility
  document.querySelectorAll('.work-view-panel').forEach(panel => {
    panel.classList.toggle('active', panel.dataset.view === view);
  });
  
  // Initialize calendar on first view
  if (view === 'calendar' && state.workCalendar && !state.workCalendar.calendar) {
    await state.workCalendar.init();
  }
}

// ============================================
// Authentication
// ============================================

/**
 * Handle SSO Login - Redirect to Rise-X/MarineStream
 */
function handleSSOLogin() {
  // Save current URL to return to after login
  const returnUrl = window.location.pathname + window.location.search;
  window.location.href = `/api/oauth/login?returnUrl=${encodeURIComponent(returnUrl)}`;
}

/**
 * Handle manual PAT entry
 */
async function handleAuth() {
  const token = elements.patInput?.value?.trim();
  
  if (!token) {
    shakeElement(elements.patInput);
    return;
  }
  
  try {
    elements.authSubmit.disabled = true;
    elements.authSubmit.innerHTML = '<span class="loading-spinner"></span>';
    
    // Verify the token first
    const response = await fetch('/api/marinestream/statistics', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      state.token = token;
      state.authMethod = 'pat';
      
      // Use the auth module to store the token properly
      if (window.MarineStreamAuth) {
        MarineStreamAuth.setManualToken(token);
      } else {
        localStorage.setItem('marinestream_pat', token);
      }
      
      // Extract user info from token
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        state.user = {
          name: payload.preferred_name || payload.name,
          email: payload.email
        };
        state.tokenExpiresAt = payload.exp * 1000;
        updateUserBadge();
      } catch (e) {}
      
      elements.authModal?.classList.remove('active');
      elements.app?.classList.remove('hidden');
      
      // Start token status monitoring
      startTokenStatusUpdate();
      
      await loadAllData();
      initMap();
    } else {
      throw new Error('Invalid token');
    }
  } catch (error) {
    alert('Connection failed. Please check your token.');
    console.error('Auth error:', error);
  } finally {
    elements.authSubmit.disabled = false;
    elements.authSubmit.innerHTML = '<span>Connect</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
}

/**
 * Try to connect with stored PAT
 */
async function tryConnectWithToken() {
  try {
    const response = await fetch('/api/marinestream/statistics', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (response.ok) {
      // Extract user info from token
      try {
        const payload = JSON.parse(atob(state.token.split('.')[1]));
        state.user = {
          name: payload.preferred_name || payload.name,
          email: payload.email
        };
        state.tokenExpiresAt = payload.exp * 1000;
        updateUserBadge();
      } catch (e) {}
      
      elements.authModal?.classList.remove('active');
      elements.app?.classList.remove('hidden');
      await loadAllData();
      initMap();
    } else {
      throw new Error('Token expired');
    }
  } catch (error) {
    localStorage.removeItem('marinestream_pat');
    state.token = null;
    showAuthModal();
  }
}

/**
 * Handle logout - clears all auth state and shows login modal
 */
async function handleLogout() {
  if (!confirm('Are you sure you want to logout?')) {
    return;
  }
  
  // Clear state
  state.token = null;
  state.tokenExpiresAt = null;
  state.user = null;
  state.authMethod = null;
  state.fleet = [];
  state.summary = null;
  
  // Clear refresh interval
  if (state.refreshInterval) {
    clearInterval(state.refreshInterval);
    state.refreshInterval = null;
  }
  
  // Stop token status updates
  if (tokenStatusInterval) {
    clearInterval(tokenStatusInterval);
    tokenStatusInterval = null;
  }
  
  // Clear stored tokens
  if (window.MarineStreamAuth) {
    MarineStreamAuth.clearTokens();
  } else {
    localStorage.removeItem('marinestream_pat');
  }
  localStorage.removeItem('marinestream_token_expiry');
  localStorage.removeItem('marinestream_user_info');
  
  // Clear SSO session
  try {
    await fetch('/api/oauth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) {}
  
  // Reset the token status display
  const timerEl = document.getElementById('token-timer');
  if (timerEl) timerEl.textContent = '--:--';
  
  // Show login modal
  showAuthModal();
}

// ============================================
// Data Loading
// ============================================
async function loadAllData() {
  try {
    // Build fetch options - include credentials for SSO, headers for PAT
    const fetchOptions = {
      credentials: 'include' // Always include for SSO session cookies
    };
    
    // Add Authorization header if using PAT auth
    if (state.authMethod === 'pat' && state.token) {
      fetchOptions.headers = { 'Authorization': `Bearer ${state.token}` };
    }
    
    const response = await fetch('/api/marinestream/fleet', fetchOptions);
    
    if (!response.ok) {
      if (response.status === 401) {
        // Token expired - try to refresh or show login
        if (state.authMethod === 'sso') {
          await refreshTokenIfNeeded();
          // Retry the request
          const retryResponse = await fetch('/api/marinestream/fleet', { credentials: 'include' });
          if (!retryResponse.ok) throw new Error('Session expired');
          const retryData = await retryResponse.json();
          state.fleet = retryData.data?.vessels || [];
          state.summary = retryData.data?.summary || {};
        } else {
          throw new Error('Token expired');
        }
      } else {
        throw new Error('Failed to fetch fleet data');
      }
    } else {
      const data = await response.json();
      state.fleet = data.data?.vessels || [];
      state.summary = data.data?.summary || {};
    }
    
    updateSummary();
    renderVesselList();
    renderActivityFeed();
    updateMapMarkers();
    initPerfTrendChart();
    
    // Load user-created fleet groupings
    await loadFleets();
    
    console.log('✅ Fleet data loaded:', state.fleet.length, 'vessels');
    
  } catch (error) {
    console.error('Failed to load data:', error);
    
    // If auth failed, show login
    if (error.message.includes('expired') || error.message.includes('401')) {
      handleLogout();
    }
  }
}

// ============================================
// UI Updates
// ============================================
function updateSummary() {
  const s = state.summary;
  
  if (elements.totalVessels) elements.totalVessels.textContent = s.totalVessels || 0;
  if (elements.ranCount) elements.ranCount.textContent = s.ranVessels || 0;
  if (elements.commercialCount) elements.commercialCount.textContent = s.commercialVessels || 0;
  if (elements.dueSoon) elements.dueSoon.textContent = s.vesselsDueSoon || 0;
  
  // Update gauges based on filtered vessels
  updateFleetHealth();
}

/**
 * Calculate and update fleet health based on currently visible/filtered vessels
 * This recalculates when fleet filter changes
 */
function updateFleetHealth() {
  const visibleVessels = getVisibleVessels();
  
  // Only count vessels with REAL data from the API (not placeholders)
  const vesselsWithRealFON = visibleVessels.filter(v => 
    v.performance?.hasRealData && v.performance?.freedomOfNavigation != null
  );
  const vesselsWithRealHP = visibleVessels.filter(v => 
    v.performance?.hasRealData && v.performance?.currentHullPerformance != null
  );
  
  const avgFON = vesselsWithRealFON.length > 0 
    ? Math.round(vesselsWithRealFON.reduce((sum, v) => sum + v.performance.freedomOfNavigation, 0) / vesselsWithRealFON.length)
    : null;
  const avgHP = vesselsWithRealHP.length > 0
    ? Math.round(vesselsWithRealHP.reduce((sum, v) => sum + v.performance.currentHullPerformance, 0) / vesselsWithRealHP.length)
    : null;
  
  // Update gauges
  updateGauge(elements.gaugeFon, avgFON);
  updateGauge(elements.gaugeHp, avgHP);
  
  // Update vessel health breakdown list
  renderVesselHealthList(visibleVessels);
}

/**
 * Render the vessel health breakdown list in the expanded Fleet Health panel
 * Now includes fouling rating predictions
 */
function renderVesselHealthList(vessels) {
  const listEl = document.getElementById('vessel-health-list');
  if (!listEl) return;
  
  if (vessels.length === 0) {
    listEl.innerHTML = '<div class="health-empty">No vessels in selected fleet</div>';
    return;
  }
  
  // Calculate fleet health metrics using fouling calculator
  const fleetMetrics = FoulingCalculator.calculateFleetHealthMetrics(vessels);
  
  // Render fleet health summary first
  const summaryHTML = `
    <div class="fleet-health-summary">
      <div class="health-gauge-mini">
        <div class="gauge-circle" style="--gauge-color: ${fleetMetrics.healthColor}; --gauge-value: ${(fleetMetrics.avgFoulingRating || 0) / 5 * 100}%;">
          <span class="gauge-text">${fleetMetrics.avgFoulingRating !== null ? fleetMetrics.avgFoulingRating.toFixed(1) : '--'}</span>
        </div>
        <div class="gauge-info">
          <span class="gauge-status" style="color: ${fleetMetrics.healthColor};">${fleetMetrics.healthLabel}</span>
          <span class="gauge-sublabel">Avg Fouling Rating</span>
        </div>
      </div>
      <div class="health-quick-stats">
        <div class="quick-stat">
          <span class="qs-value">${fleetMetrics.avgDaysSinceClean || '--'}</span>
          <span class="qs-label">Avg Days</span>
        </div>
        <div class="quick-stat ${fleetMetrics.needsCleaning > 0 ? 'alert' : ''}">
          <span class="qs-value">${fleetMetrics.needsCleaning}</span>
          <span class="qs-label">Need Clean</span>
        </div>
      </div>
    </div>
    <div class="health-list-header">
      <span>Vessel</span>
      <span>FR</span>
      <span>Days</span>
      <span>FON</span>
    </div>
  `;
  
  // Sort vessels: those needing cleaning first, then by FR level, then by days since clean
  const sortedVessels = [...vessels].sort((a, b) => {
    const aFR = a.foulingPrediction?.frLevel ?? -1;
    const bFR = b.foulingPrediction?.frLevel ?? -1;
    
    // Vessels needing cleaning (FR4+) first
    if (aFR >= 4 && bFR < 4) return -1;
    if (bFR >= 4 && aFR < 4) return 1;
    
    // Then by FR level descending
    if (aFR !== bFR) return bFR - aFR;
    
    // Then by days since clean
    const aDays = a.daysSinceLastClean ?? 0;
    const bDays = b.daysSinceLastClean ?? 0;
    return bDays - aDays;
  });
  
  const vesselsHTML = sortedVessels.map(vessel => {
    const perf = vessel.performance || {};
    const fouling = vessel.foulingPrediction;
    const frLevel = fouling?.frLevel;
    const frDetails = FoulingCalculator.getFRDetails(frLevel);
    const daysSinceClean = vessel.daysSinceLastClean;
    const fon = perf.hasRealData ? perf.freedomOfNavigation : null;
    
    const frDisplay = (frLevel !== null && frLevel !== undefined)
      ? `<span style="color: ${frDetails.color}; font-weight: 600;">${frDetails.name}</span>`
      : '<span class="no-data">--</span>';
    
    const daysDisplay = (daysSinceClean !== null && daysSinceClean !== undefined)
      ? `<span class="${daysSinceClean >= 90 ? 'critical' : daysSinceClean >= 60 ? 'warning' : ''}">${daysSinceClean}d</span>`
      : '<span class="no-data">--</span>';
    
    const fonDisplay = (fon !== null && fon !== undefined)
      ? `<span class="${getScoreClass(fon)}">${fon}</span>`
      : '<span class="no-data">--</span>';
    
    const typeClass = vessel.typeCategory === 'military' ? 'ran' : 
                      vessel.typeCategory === 'commercial' ? 'commercial' : 'other';
    
    // Add alert class if vessel needs cleaning (FR4+)
    const alertClass = frLevel >= 4 ? 'needs-cleaning' : frLevel >= 3 ? 'at-risk' : '';
    
    return `
      <div class="health-item ${alertClass}" data-vessel-id="${vessel.id}">
        <div class="health-vessel">
          <div class="health-indicator ${typeClass}"></div>
          <div class="health-name" title="${escapeHtml(vessel.name)}">${escapeHtml(vessel.name)}</div>
        </div>
        <div class="health-fr">${frDisplay}</div>
        <div class="health-days">${daysDisplay}</div>
        <div class="health-fon">${fonDisplay}</div>
      </div>
    `;
  }).join('');
  
  listEl.innerHTML = summaryHTML + vesselsHTML;
  
  // Add click handlers
  listEl.querySelectorAll('.health-item').forEach(item => {
    item.addEventListener('click', () => {
      const vesselId = item.dataset.vesselId;
      const vessel = state.fleet.find(v => v.id === vesselId);
      if (vessel) openVesselDetail(vessel);
    });
  });
}

function updateGauge(element, value) {
  if (!element) return;
  
  const fill = element.querySelector('.gauge-fill');
  const valueEl = element.querySelector('.gauge-value');
  
  if (value !== null && value !== undefined) {
    const dashArray = `${value}, 100`;
    if (fill) fill.style.strokeDasharray = dashArray;
    if (valueEl) valueEl.textContent = value;
    
    // Color based on value
    const color = getScoreColor(value);
    if (fill) fill.style.stroke = color;
  } else {
    if (fill) fill.style.strokeDasharray = '0, 100';
    if (valueEl) valueEl.textContent = '--';
  }
}

function renderVesselList() {
  if (!elements.vesselList) return;
  
  const vessels = getVisibleVessels();
  
  if (vessels.length === 0) {
    const message = state.selectedFleetId 
      ? 'No vessels in this fleet'
      : 'No vessels found';
    elements.vesselList.innerHTML = `<div class="empty-state">${message}</div>`;
    return;
  }
  
  elements.vesselList.innerHTML = vessels.map(vessel => {
    const hasRealData = vessel.performance?.hasRealData;
    const fon = hasRealData ? vessel.performance?.freedomOfNavigation : null;
    const scoreClass = fon !== null ? getScoreClass(fon) : 'unknown';
    const typeClass = vessel.typeCategory === 'military' ? 'ran' : 
                      vessel.typeCategory === 'commercial' ? 'commercial' : 'other';
    
    const hasPosition = isValidPosition(vessel._mapPos);
    const positionStatus = getPositionStatusText(vessel._mapPos);
    
    // Display FON score or "No data" if no real data available
    const fonDisplay = fon !== null ? fon : '<span class="no-data-label">No data</span>';
    
    return `
      <div class="vessel-item ${!hasPosition ? 'no-position' : ''}" data-vessel-id="${vessel.id}">
        <div class="vessel-indicator ${typeClass}"></div>
        <div class="vessel-info">
          <div class="vessel-name">${escapeHtml(vessel.name)}</div>
          <div class="vessel-class">${escapeHtml(vessel.class || vessel.typeLabel || 'Vessel')} <span class="vessel-position-status">${positionStatus}</span></div>
        </div>
        <div class="vessel-score">
          <span class="vessel-score-value ${scoreClass}">${fonDisplay}</span>
          <span class="vessel-score-label">FON</span>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  elements.vesselList.querySelectorAll('.vessel-item').forEach(item => {
    item.addEventListener('click', () => {
      const vesselId = item.dataset.vesselId;
      const vessel = state.fleet.find(v => v.id === vesselId);
      if (vessel) openVesselDetail(vessel);
    });
  });
}

/**
 * Get human-readable position status text
 */
function getPositionStatusText(pos) {
  if (!isValidPosition(pos)) return '⏳ Awaiting AIS';
  
  switch (pos.source) {
    case 'ais_live': return '📍 Live';
    case 'last_known': return '📍 Last Known';
    case 'static': return '⚓ Port';
    default: return '📍';
  }
}

function filterVesselList(searchTerm) {
  const items = elements.vesselList?.querySelectorAll('.vessel-item');
  const term = searchTerm.toLowerCase();
  
  items?.forEach(item => {
    const name = item.querySelector('.vessel-name')?.textContent.toLowerCase();
    const cls = item.querySelector('.vessel-class')?.textContent.toLowerCase();
    
    if (name?.includes(term) || cls?.includes(term)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

function renderActivityFeed() {
  if (!elements.activityFeed) return;
  
  // Get recent jobs from all vessels
  const recentJobs = state.fleet
    .flatMap(v => (v.recentJobs || []).map(j => ({ ...j, vessel: v.name })))
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified))
    .slice(0, 8);
  
  if (recentJobs.length === 0) {
    elements.activityFeed.innerHTML = '<div class="empty-state">No recent activity</div>';
    return;
  }
  
  elements.activityFeed.innerHTML = recentJobs.map(job => `
    <div class="activity-item">
      <div class="activity-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
      </div>
      <div class="activity-content">
        <div class="activity-title">${escapeHtml(job.workCode)}</div>
        <div class="activity-meta">${escapeHtml(job.vessel)} • ${formatRelativeTime(job.lastModified)}</div>
      </div>
    </div>
  `).join('');
}

// ============================================
// Vessel Detail
// ============================================
function openVesselDetail(vessel) {
  state.selectedVessel = vessel;
  
  // Update vessel panel to show it's selected
  elements.vesselList?.querySelectorAll('.vessel-item').forEach(item => {
    item.classList.toggle('active', item.dataset.vesselId === vessel.id);
  });
  
  // Update detail panel
  const perf = vessel.performance || {};
  const hasRealData = perf.hasRealData;
  const hasRealCleaningData = vessel.hasRealCleaningData;
  const typeClass = vessel.typeCategory === 'military' ? '' : 'commercial';
  
  document.getElementById('detail-vessel-name').textContent = vessel.name;
  document.getElementById('detail-vessel-type').textContent = vessel.typeLabel;
  document.getElementById('detail-vessel-type').className = `vessel-type-badge ${typeClass}`;
  
  // Scores - only show real data, otherwise show "No data available"
  if (hasRealData) {
    updateDetailScore('detail-fon', 'detail-fon-bar', perf.freedomOfNavigation);
    updateDetailScore('detail-hp', 'detail-hp-bar', perf.currentHullPerformance);
    updateDetailScore('detail-ytd', 'detail-ytd-bar', perf.ytdHullPerformance);
  } else {
    updateDetailScoreNoData('detail-fon', 'detail-fon-bar');
    updateDetailScoreNoData('detail-hp', 'detail-hp-bar');
    updateDetailScoreNoData('detail-ytd', 'detail-ytd-bar');
  }
  
  // Countdown - only show if real cleaning data available
  const daysEl = document.getElementById('detail-days');
  if (daysEl) {
    if (hasRealCleaningData && vessel.daysToNextClean !== null) {
      const days = vessel.daysToNextClean;
      daysEl.textContent = days;
      daysEl.className = 'countdown-value' + 
        (days <= 30 ? ' critical' : '') +
        (days > 30 && days <= 60 ? ' warning' : '');
    } else {
      daysEl.textContent = 'No data';
      daysEl.className = 'countdown-value no-data';
      daysEl.style.fontSize = '14px';
    }
  }
  
  // Info
  document.getElementById('detail-class').textContent = vessel.class || '--';
  document.getElementById('detail-pennant').textContent = vessel.pennant || '--';
  document.getElementById('detail-imo').textContent = vessel.imo || '--';
  document.getElementById('detail-mmsi').textContent = vessel.mmsi || '--';
  document.getElementById('detail-flag').textContent = vessel.flag || '--';
  document.getElementById('detail-jobs').textContent = vessel.totalJobs || 0;
  
  // History
  renderVesselHistory(vessel);
  
  // Show panel
  elements.vesselDetail?.classList.remove('hidden');
  
  // Fly to vessel on map
  flyToVessel(vessel);
}

function updateDetailScore(valueId, barId, value) {
  const valueEl = document.getElementById(valueId);
  const barEl = document.getElementById(barId);
  
  if (valueEl) {
    valueEl.textContent = value !== null ? value : '--';
    valueEl.style.color = value !== null ? getScoreColor(value) : '';
    valueEl.style.fontSize = '';
  }
  
  if (barEl) {
    barEl.style.width = value !== null ? `${value}%` : '0%';
    barEl.style.background = value !== null ? getScoreColor(value) : '';
  }
}

function updateDetailScoreNoData(valueId, barId) {
  const valueEl = document.getElementById(valueId);
  const barEl = document.getElementById(barId);
  
  if (valueEl) {
    valueEl.textContent = 'No data';
    valueEl.style.color = 'var(--text-muted)';
    valueEl.style.fontSize = '12px';
  }
  
  if (barEl) {
    barEl.style.width = '0%';
    barEl.style.background = 'var(--text-muted)';
  }
}

function renderVesselHistory(vessel) {
  const historyEl = document.getElementById('detail-history');
  if (!historyEl) return;
  
  const jobs = vessel.recentJobs || [];
  
  if (jobs.length === 0) {
    historyEl.innerHTML = '<div class="empty-state">No work history</div>';
    return;
  }
  
  historyEl.innerHTML = jobs.map(job => {
    const dotClass = job.status === 'Complete' ? 'complete' : 
                     ['Active', 'In Progress'].includes(job.status) ? 'active' : 'other';
    
    return `
      <div class="history-item">
        <div class="history-dot ${dotClass}"></div>
        <div class="history-content">
          <div class="history-code">${escapeHtml(job.workCode)}</div>
          <div class="history-name">${escapeHtml(job.displayName)}</div>
          <div class="history-date">${formatDate(job.lastModified)}</div>
        </div>
      </div>
    `;
  }).join('');
}

function closeVesselDetail() {
  state.selectedVessel = null;
  elements.vesselDetail?.classList.add('hidden');
  
  elements.vesselList?.querySelectorAll('.vessel-item').forEach(item => {
    item.classList.remove('active');
  });
}

// ============================================
// Map
// ============================================
function initMap() {
  // Get Mapbox token from config first
  fetch('/api/config')
    .then(res => res.json())
    .then(config => {
      const token = config.data?.mapbox?.accessToken;
      if (!token) {
        console.error('No Mapbox token found');
        return;
      }
      
      mapboxgl.accessToken = token;
      
      state.map = new mapboxgl.Map({
        container: 'fleet-map',
        style: getMapStyle('dark'),
        center: [134, -25], // Australia
        zoom: 4,
        pitch: 0
      });
      
      state.map.on('load', () => {
        // Load initial cached AIS positions
        loadCachedAISPositions().then(() => {
          updateMapMarkers();
        });
        
        // Connect to real-time AIS stream
        connectAISStream();
      });
    })
    .catch(err => console.error('Failed to load map config:', err));
}

// ============================================
// AIS Real-Time Tracking (via AISStream.io)
// ============================================

/**
 * Load cached AIS positions from server
 */
async function loadCachedAISPositions() {
  try {
    const response = await fetch('/api/map/positions');
    if (!response.ok) throw new Error('Failed to fetch AIS positions');
    
    const data = await response.json();
    
    if (data.success && Array.isArray(data.data)) {
      data.data.forEach(pos => {
        state.aisPositions.set(pos.mmsi, {
          lat: pos.lat,
          lng: pos.lng,
          speed: pos.speed,
          course: pos.course,
          heading: pos.heading,
          shipName: pos.shipName,
          timestamp: pos.timestamp,
          isStale: pos.isStale
        });
      });
      
      console.log(`📍 Loaded ${data.data.length} cached AIS positions (${data.meta?.live || 0} live)`);
    }
  } catch (err) {
    console.warn('Could not load cached AIS positions:', err.message);
  }
}

/**
 * Connect to real-time AIS WebSocket stream
 */
function connectAISStream() {
  // Determine WebSocket URL
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.host}/api/map/stream`;
  
  console.log('🔌 Connecting to AIS stream:', wsUrl);
  
  try {
    state.aisWebSocket = new WebSocket(wsUrl);
    
    state.aisWebSocket.onopen = () => {
      console.log('✅ Connected to AIS real-time stream');
      state.aisReconnectAttempts = 0;
      
      // Update UI to show AIS connected status
      updateAISStatus('connected');
    };
    
    state.aisWebSocket.onmessage = (event) => {
      handleAISMessage(event.data);
    };
    
    state.aisWebSocket.onclose = () => {
      console.log('🔌 AIS stream disconnected');
      updateAISStatus('disconnected');
      
      // Reconnect with exponential backoff
      const delay = Math.min(5000 * Math.pow(2, state.aisReconnectAttempts), 60000);
      state.aisReconnectAttempts++;
      
      console.log(`⏳ Reconnecting in ${delay/1000}s...`);
      setTimeout(connectAISStream, delay);
    };
    
    state.aisWebSocket.onerror = (err) => {
      console.warn('AIS WebSocket error:', err);
      updateAISStatus('error');
    };
  } catch (err) {
    console.error('Failed to connect to AIS stream:', err);
  }
  
  // Debounced marker update function to prevent rapid consecutive updates
  const debouncedMarkerUpdate = debounce(() => {
    if (state.aisPositions.size > 0 && state.fleet.length > 0) {
      let updatedCount = 0;
      state.fleet.forEach(vessel => {
        if (vessel.mmsi && state.aisPositions.has(vessel.mmsi)) {
          const aisPos = state.aisPositions.get(vessel.mmsi);
          if (aisPos.lat && aisPos.lng && vessel._mapPos?.source !== 'ais_live') {
            updateVesselMarkerPosition(vessel.mmsi);
            updatedCount++;
          }
        }
      });
      if (updatedCount > 0) {
        console.log(`🔄 Updated ${updatedCount} vessel markers with AIS positions`);
      }
    }
  }, 1000); // Debounce for 1 second
  
  // Periodically update markers to pick up AIS positions
  setInterval(() => {
    debouncedMarkerUpdate();
    // Update the AIS status
    updateAISStatus('connected');
  }, 5000); // Check every 5 seconds
}

/**
 * Handle incoming AIS message from WebSocket
 */
function handleAISMessage(data) {
  try {
    const message = JSON.parse(data);
    
    // Handle position reports
    if (message.MessageType === 'PositionReport' && message.MetaData) {
      const mmsi = String(message.MetaData.MMSI);
      const posData = message.Message?.PositionReport || {};
      
      // Store/update position for ALL vessels (not just our fleet)
      state.aisPositions.set(mmsi, {
        lat: message.MetaData.latitude,
        lng: message.MetaData.longitude,
        speed: posData.Sog,
        course: posData.Cog,
        heading: posData.TrueHeading,
        status: posData.NavigationalStatus,
        shipName: message.MetaData.ShipName,
        timestamp: new Date().toISOString(),
        isStale: false
      });
      
      // Update the marker for this vessel if it's in our fleet
      updateVesselMarkerPosition(mmsi);
      
      // Update AIS status indicator periodically (every 10 positions to reduce UI updates)
      if (state.aisPositions.size % 10 === 0) {
        updateAISStatus('connected');
      }
    }
    
    // Handle static data (vessel name, dimensions, etc.)
    if (message.MessageType === 'ShipStaticData' && message.MetaData) {
      const mmsi = String(message.MetaData.MMSI);
      const staticData = message.Message?.ShipStaticData || {};
      
      // Merge with existing position data
      const existing = state.aisPositions.get(mmsi) || {};
      state.aisPositions.set(mmsi, {
        ...existing,
        shipName: staticData.Name || message.MetaData.ShipName || existing.shipName,
        destination: staticData.Destination,
        imo: staticData.ImoNumber
      });
    }
  } catch (err) {
    // Silently ignore parse errors
  }
}

/**
 * Update a specific vessel marker with new AIS position
 */
function updateVesselMarkerPosition(mmsi) {
  const vessel = state.fleet.find(v => v.mmsi === mmsi);
  if (!vessel) return;
  
  const aisPos = state.aisPositions.get(mmsi);
  if (!aisPos || !aisPos.lat || !aisPos.lng) return;
  
  const wasNotLive = vessel._mapPos?.source !== 'ais_live';
  
  // Update vessel's position data
  vessel._mapPos = { 
    lat: aisPos.lat, 
    lng: aisPos.lng, 
    locationName: `Live GPS (${aisPos.speed?.toFixed(1) || 0} kn)`,
    source: 'ais_live',
    speed: aisPos.speed,
    course: aisPos.course,
    heading: aisPos.heading
  };
  
  if (wasNotLive) {
    const action = state.markers.has(vessel.id) ? 'LIVE' : 'NEW';
    console.log(`📍 ${action}: ${vessel.name} at ${aisPos.lat.toFixed(4)}, ${aisPos.lng.toFixed(4)}`);
  }
  
  // Create or update marker
  createOrUpdateMarker(vessel);
  
  // Update visibility based on current filter
  const marker = state.markers.get(vessel.id);
  if (marker) {
    const isVisible = isVesselVisible(vessel);
    marker.getElement().style.display = isVisible ? 'block' : 'none';
  }
}

/**
 * Update AIS tracking status indicator
 */
function updateAISStatus(status) {
  // Add a small indicator to the UI showing tracking status
  let indicator = document.getElementById('ais-status');
  
  if (!indicator) {
    // Create the indicator if it doesn't exist
    indicator = document.createElement('div');
    indicator.id = 'ais-status';
    indicator.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 16px;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 8px;
      z-index: 1000;
      background: rgba(0,0,0,0.8);
      color: white;
      flex-wrap: wrap;
      max-width: 300px;
    `;
    document.body.appendChild(indicator);
  }
  
  const statusConfig = {
    connected: { color: '#22c55e', text: 'AIS', icon: '●' },
    disconnected: { color: '#f59e0b', text: 'AIS...', icon: '○' },
    error: { color: '#ef4444', text: 'AIS Error', icon: '○' }
  };
  
  const config = statusConfig[status] || statusConfig.disconnected;
  
  // Count fleet vessels with live positions
  const fleetWithPos = state.fleet.filter(v => v.hasLivePosition || v.livePosition).length;
  const staticPos = state.fleet.filter(v => v.livePosition?.source === 'static').length;
  const aisPos = state.aisPositions.size;
  const liveCount = fleetWithPos - staticPos; // Exclude static from "live" count
  
  indicator.innerHTML = `
    <span style="display: flex; align-items: center; gap: 4px;">
      <span style="color: ${config.color}; font-size: 10px;">${config.icon}</span>
      <span>${config.text}</span>
    </span>
    <span style="opacity: 0.7; border-left: 1px solid rgba(255,255,255,0.3); padding-left: 8px;">
      📡 ${aisPos} AIS
    </span>
    ${staticPos > 0 ? `
      <span style="opacity: 0.5; border-left: 1px solid rgba(255,255,255,0.3); padding-left: 8px;">
        ⚓ ${staticPos} at port
      </span>
    ` : ''}
    <span style="opacity: 0.9; border-left: 1px solid rgba(255,255,255,0.3); padding-left: 8px; color: ${liveCount > 0 ? '#22c55e' : '#f59e0b'};">
      🚢 ${liveCount}/${state.fleet.length} live
    </span>
  `;
}

function getMapStyle(style) {
  const styles = {
    dark: 'mapbox://styles/mapbox/dark-v11',
    light: 'mapbox://styles/mapbox/light-v11',
    satellite: 'mapbox://styles/mapbox/satellite-streets-v12'
  };
  return styles[style] || styles.dark;
}

function setMapStyle(style) {
  state.mapStyle = style;
  
  elements.styleButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.style === style);
  });
  
  if (state.map) {
    state.map.setStyle(getMapStyle(style));
    
    // Re-add markers after style change
    state.map.once('style.load', () => {
      updateMapMarkers();
    });
  }
}

// Known Australian naval bases and ports with GPS coordinates
const KNOWN_LOCATIONS = {
  // Naval Bases
  'fleet base west': { lat: -32.2316, lng: 115.7450, name: 'Fleet Base West' },
  'fleet base east': { lat: -33.8350, lng: 151.2536, name: 'Fleet Base East (Sydney)' },
  'garden island west': { lat: -32.2316, lng: 115.7450, name: 'Garden Island (WA)' },
  'garden island': { lat: -33.8438, lng: 151.2297, name: 'Garden Island (Sydney)' },
  'hmas stirling': { lat: -32.2316, lng: 115.7450, name: 'HMAS Stirling' },
  'hmas coonawarra': { lat: -12.4634, lng: 130.8456, name: 'HMAS Coonawarra (Darwin)' },
  'hmas cairns': { lat: -16.9203, lng: 145.7710, name: 'HMAS Cairns' },
  'hmas waterhen': { lat: -33.8450, lng: 151.1850, name: 'HMAS Waterhen' },
  'hmas kuttabul': { lat: -33.8635, lng: 151.2200, name: 'HMAS Kuttabul' },
  'jervis bay': { lat: -35.0300, lng: 150.6900, name: 'Jervis Bay' },
  'darwin': { lat: -12.4634, lng: 130.8456, name: 'Darwin' },
  'fremantle': { lat: -32.0569, lng: 115.7439, name: 'Fremantle' },
  'henderson': { lat: -32.1833, lng: 115.7667, name: 'Henderson (AMC)' },
  // Commercial Ports
  'brisbane': { lat: -27.3800, lng: 153.1700, name: 'Brisbane' },
  'melbourne': { lat: -37.8300, lng: 144.9100, name: 'Melbourne' },
  'adelaide': { lat: -34.8500, lng: 138.5100, name: 'Adelaide' },
  'townsville': { lat: -19.2590, lng: 146.8169, name: 'Townsville' },
  'gladstone': { lat: -23.8500, lng: 151.2600, name: 'Gladstone' },
  'newcastle': { lat: -32.9283, lng: 151.7817, name: 'Newcastle' },
  'port hedland': { lat: -20.3100, lng: 118.5800, name: 'Port Hedland' },
  'dampier': { lat: -20.6600, lng: 116.7100, name: 'Dampier' },
};

function getVesselPosition(vessel) {
  // 0. FIRST: Check for live position from API
  if (vessel.livePosition && vessel.livePosition.lat && vessel.livePosition.lng) {
    const pos = vessel.livePosition;
    const speedText = pos.speed !== undefined ? `${pos.speed?.toFixed(1) || 0} kn` : '';
    
    // Handle static positions (homeport estimates)
    if (pos.source === 'static') {
      return { 
        lat: pos.lat, 
        lng: pos.lng, 
        name: pos.port || 'Estimated',
        source: 'static',
        note: pos.note
      };
    }
    
    // Handle last known positions (from database cache)
    if (pos.source === 'last_known') {
      const ageMs = pos.timestamp ? Date.now() - new Date(pos.timestamp).getTime() : 0;
      const ageHours = Math.round(ageMs / (1000 * 60 * 60));
      const ageStr = ageHours > 24 ? `${Math.round(ageHours/24)}d ago` : ageHours > 0 ? `${ageHours}h ago` : 'recent';
      return { 
        lat: pos.lat, 
        lng: pos.lng, 
        name: `Last Known (${ageStr})`,
        source: 'last_known',
        speed: pos.speed,
        course: pos.course,
        isStale: true
      };
    }
    
    // Handle AIS live positions
    return { 
      lat: pos.lat, 
      lng: pos.lng, 
      name: `Live AIS${speedText ? ` (${speedText})` : ''}`,
      source: 'ais_live',
      speed: pos.speed,
      course: pos.course,
      heading: pos.heading,
      destination: pos.destination,
      eta: pos.eta
    };
  }
  
  // 1. SECOND: Check for live AIS position from WebSocket (real-time GPS from AISStream.io)
  if (vessel.mmsi && state.aisPositions.has(vessel.mmsi)) {
    const aisPos = state.aisPositions.get(vessel.mmsi);
    if (aisPos.lat && aisPos.lng && !aisPos.isStale) {
      return { 
        lat: aisPos.lat, 
        lng: aisPos.lng, 
        name: `Live AIS (${aisPos.speed?.toFixed(1) || 0} kn)`,
        source: 'ais_live',
        speed: aisPos.speed,
        course: aisPos.course,
        heading: aisPos.heading
      };
    }
  }
  
  // 2. Check if vessel has a last known location from recent jobs
  const lastLocation = vessel.recentJobs?.[0]?.location;
  if (lastLocation) {
    const locationKey = lastLocation.toLowerCase().trim();
    for (const [key, coords] of Object.entries(KNOWN_LOCATIONS)) {
      if (locationKey.includes(key) || key.includes(locationKey)) {
        return { ...coords, source: 'job_location' };
      }
    }
  }
  
  // 2. Try to match vessel name to a home port
  const vesselNameLower = (vessel.name || '').toLowerCase();
  
  // Perth-based vessels (WA fleet)
  if (vesselNameLower.includes('stalwart') || vesselNameLower.includes('stirling') || 
      vesselNameLower.includes('collins') || vesselNameLower.includes('farncomb') ||
      vesselNameLower.includes('rankin') || vesselNameLower.includes('sheean') ||
      vesselNameLower.includes('waller') || vesselNameLower.includes('dechaineux')) {
    return { ...KNOWN_LOCATIONS['fleet base west'], source: 'home_port' };
  }
  
  // Sydney-based vessels
  if (vesselNameLower.includes('hobart') || vesselNameLower.includes('brisbane') || 
      vesselNameLower.includes('sydney') || vesselNameLower.includes('adelaide') ||
      vesselNameLower.includes('supply') || vesselNameLower.includes('choules') ||
      vesselNameLower.includes('canberra')) {
    return { ...KNOWN_LOCATIONS['fleet base east'], source: 'home_port' };
  }
  
  // Darwin-based vessels
  if (vesselNameLower.includes('armidale') || vesselNameLower.includes('patrol')) {
    return { ...KNOWN_LOCATIONS['darwin'], source: 'home_port' };
  }
  
  // Svitzer tugs - various ports
  if (vesselNameLower.includes('svitzer')) {
    if (vesselNameLower.includes('redhead')) return { ...KNOWN_LOCATIONS['newcastle'], source: 'home_port' };
    if (vesselNameLower.includes('abrolhos')) return { ...KNOWN_LOCATIONS['fremantle'], source: 'home_port' };
    return { ...KNOWN_LOCATIONS['brisbane'], source: 'home_port' };
  }
  
  // Cape class - various
  if (vesselNameLower.includes('cape')) {
    return { ...KNOWN_LOCATIONS['darwin'], source: 'home_port' };
  }
  
  // 3. Check for vessels that should NOT get fallback positions
  // (e.g., international vessels that we know aren't in Australia)
  if (vesselNameLower.includes('saam') || 
      (vessel.mmsi && vessel.mmsi.startsWith('316'))) { // Canadian MMSI prefix
    // SAAM/Canadian vessels should only appear with real AIS data
    return { lat: null, lng: null, name: 'Awaiting AIS', source: 'no_position' };
  }
  
  // 4. Use deterministic position based on vessel ID (not random!)
  // This ensures same vessel always appears at same location
  const hash = (vessel.id || vessel.name || 'unknown').split('')
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  
  const baseLocations = vessel.typeCategory === 'military' 
    ? [KNOWN_LOCATIONS['fleet base west'], KNOWN_LOCATIONS['fleet base east'], 
       KNOWN_LOCATIONS['darwin'], KNOWN_LOCATIONS['hmas cairns']]
    : [KNOWN_LOCATIONS['brisbane'], KNOWN_LOCATIONS['melbourne'], 
       KNOWN_LOCATIONS['fremantle'], KNOWN_LOCATIONS['adelaide']];
  
  const basePos = baseLocations[hash % baseLocations.length];
  
  // Small offset within port area (NOT random - deterministic from hash)
  const offsetLat = ((hash % 100) - 50) * 0.001;  // ~100m offset max
  const offsetLng = ((hash % 73) - 36) * 0.001;
  
  return { 
    lat: basePos.lat + offsetLat, 
    lng: basePos.lng + offsetLng, 
    name: basePos.name,
    source: 'fallback' 
  };
}

function updateMapMarkers() {
  if (!state.map) return;
  
  // Clear existing markers
  state.markers.forEach(marker => marker.remove());
  state.markers.clear();
  
  // Add markers for each vessel with valid position
  state.fleet.forEach(vessel => {
    const pos = getVesselPosition(vessel);
    vessel._mapPos = pos;
    
    if (!isValidPosition(pos)) return;
    
    createOrUpdateMarker(vessel);
  });
  
  updateMapMarkersVisibility();
}

// Note: getLng, getLat, isValidPosition are imported from map-utils.js

/**
 * Create or update a marker for a vessel
 * Uses a lock to prevent race conditions with AIS updates
 */
const markerUpdateLocks = new Map();

function createOrUpdateMarker(vessel) {
  if (!state.map || !isValidPosition(vessel._mapPos)) return null;
  
  // Prevent concurrent updates to the same marker
  if (markerUpdateLocks.get(vessel.id)) {
    return state.markers.get(vessel.id);
  }
  markerUpdateLocks.set(vessel.id, true);
  
  try {
    const lat = getLat(vessel._mapPos);
    const lng = getLng(vessel._mapPos);
    const existingMarker = state.markers.get(vessel.id);
    
    if (existingMarker) {
      // Update existing marker position smoothly
      existingMarker.setLngLat([lng, lat]);
      
      // Only update popup if it's not currently open
      const currentPopup = existingMarker.getPopup();
      if (!currentPopup || !currentPopup.isOpen()) {
        existingMarker.setPopup(
          new mapboxgl.Popup({ offset: 25, closeButton: false })
            .setHTML(createPopupHTML(vessel))
        );
      }
      
      // Update marker element styling without full replacement
      updateMarkerElementStyle(existingMarker.getElement(), vessel);
      
      return existingMarker;
    }
    
    // Create new marker
    const el = createMarkerElement(vessel);
    const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
      .setHTML(createPopupHTML(vessel));
    
    const marker = new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(state.map);
    
    state.markers.set(vessel.id, marker);
    return marker;
  } finally {
    markerUpdateLocks.delete(vessel.id);
  }
}

/**
 * Get marker style info based on position source
 */
function getMarkerStyle(vessel) {
  const pos = vessel._mapPos || {};
  const source = pos.source || 'fallback';
  const color = vessel.typeCategory === 'military' ? '#3b82f6' : '#10b981';
  const rotation = pos.heading || pos.course || 0;
  
  if (source === 'ais_live') {
    return { type: 'live', color, rotation, badgeColor: '#22c55e', badgeText: 'LIVE', pulse: true };
  } else if (source === 'last_known') {
    return { type: 'last_known', color, rotation, badgeColor: '#f59e0b', badgeText: 'LAST KNOWN', pulse: false };
  } else if (source === 'static') {
    return { type: 'static', color, rotation, badgeColor: '#6b7280', badgeText: 'AT PORT', pulse: false };
  } else {
    return { type: 'estimated', color, rotation, badgeColor: null, badgeText: null, pulse: false };
  }
}

/**
 * Generate marker HTML based on style
 */
function getMarkerHTML(style) {
  const { type, color, rotation, badgeColor, badgeText, pulse } = style;
  
  const pulseDiv = pulse ? `
    <div class="marker-pulse" style="
      position: absolute;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: ${color};
      opacity: 0.3;
      animation: pulse 2s infinite;
      top: -4px;
      left: -4px;
    "></div>` : '';
  
  const badgeDiv = badgeText ? `
    <div class="marker-badge" style="
      position: absolute;
      bottom: -8px;
      left: 50%;
      transform: translateX(-50%);
      background: ${badgeColor};
      color: white;
      font-size: ${type === 'static' ? '7px' : '8px'};
      font-weight: ${type === 'last_known' ? '600' : '400'};
      padding: ${type === 'static' ? '1px 3px' : '2px 4px'};
      border-radius: ${type === 'last_known' ? '3px' : '2px'};
      white-space: nowrap;
      ${type === 'last_known' ? 'text-shadow: 0 1px 1px rgba(0,0,0,0.3);' : ''}
    ">${badgeText}</div>` : '';
  
  if (type === 'static') {
    return `
      <svg viewBox="0 0 32 32" fill="none">
        <circle cx="16" cy="10" r="4" fill="${color}" stroke="#fff" stroke-width="2"/>
        <path d="M16 14L16 28M8 22L16 28L24 22" stroke="${color}" stroke-width="3" stroke-linecap="round"/>
        <path d="M8 22L16 28L24 22" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity="0.5"/>
      </svg>
      ${badgeDiv}`;
  } else if (type === 'estimated') {
    return `
      <svg viewBox="0 0 32 32" fill="none">
        <path d="M16 2L4 16h4v12h16V16h4L16 2z" fill="${color}" stroke="#fff" stroke-width="2" opacity="0.7"/>
        <rect x="10" y="18" width="12" height="6" fill="#fff" opacity="0.2"/>
      </svg>`;
  } else {
    const opacity = type === 'last_known' ? 'opacity: 0.7;' : '';
    return `
      ${pulseDiv}
      <svg viewBox="0 0 32 32" fill="none" style="transform: rotate(${rotation}deg); ${opacity}">
        <path d="M16 2L4 16h4v12h16V16h4L16 2z" fill="${color}" stroke="#fff" stroke-width="2"/>
        <circle cx="16" cy="14" r="3" fill="#fff"/>
      </svg>
      ${badgeDiv}`;
  }
}

/**
 * Create a new marker element for a vessel
 */
function createMarkerElement(vessel) {
  const el = document.createElement('div');
  el.className = 'vessel-marker';
  el.dataset.vesselId = vessel.id;
  
  const style = getMarkerStyle(vessel);
  el.innerHTML = getMarkerHTML(style);
  
  // Store current state for efficient updates
  el.dataset.markerType = style.type;
  el.dataset.rotation = String(style.rotation);
  
  // Ensure pulse animation exists
  ensurePulseAnimation();
  
  // Use onclick for consistency with updateMarkerElementStyle
  el.onclick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    openVesselDetail(vessel);
  };
  
  return el;
}

/**
 * Update an existing marker element's style without replacing it
 * Uses targeted updates to avoid full innerHTML replacement
 */
function updateMarkerElementStyle(el, vessel) {
  if (!el) return;
  
  const style = getMarkerStyle(vessel);
  const currentType = el.dataset.markerType;
  const currentRotation = el.dataset.rotation;
  
  // Only do a full update if the marker type changed
  const newType = style.type;
  const newRotation = String(style.rotation);
  
  if (currentType !== newType) {
    // Type changed - need full update
    el.innerHTML = getMarkerHTML(style);
    el.dataset.markerType = newType;
    el.dataset.rotation = newRotation;
    
    // Re-attach click handler since innerHTML was replaced
    el.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      openVesselDetail(vessel);
    };
  } else if (currentRotation !== newRotation) {
    // Only rotation changed - update just the SVG transform
    const svg = el.querySelector('svg');
    if (svg) {
      svg.style.transform = `rotate(${style.rotation}deg)`;
      el.dataset.rotation = newRotation;
    }
  }
  // If nothing changed, do nothing - avoids flicker
}

/**
 * Add pulse animation CSS if not already present
 */
function ensurePulseAnimation() {
  if (document.getElementById('marker-pulse-style')) return;
  
  const style = document.createElement('style');
  style.id = 'marker-pulse-style';
  style.textContent = `
    @keyframes pulse {
      0% { transform: scale(0.8); opacity: 0.3; }
      50% { transform: scale(1.2); opacity: 0.1; }
      100% { transform: scale(0.8); opacity: 0.3; }
    }
  `;
  document.head.appendChild(style);
}

function createPopupHTML(vessel) {
  const perf = vessel.performance || {};
  const fonColor = perf.freedomOfNavigation ? getScoreColor(perf.freedomOfNavigation) : 'var(--text-muted)';
  const hpColor = perf.currentHullPerformance ? getScoreColor(perf.currentHullPerformance) : 'var(--text-muted)';
  const pos = vessel._mapPos || {};
  const isLive = pos.source === 'ais_live';
  const isStatic = pos.source === 'static';
  const locationName = pos.locationName || 'Unknown';
  const hasMMSI = vessel.mmsi && vessel.mmsi.length === 9;
  
  // Determine tracking status message
  let locationHtml = '';
  if (isLive) {
    // Live tracking (AIS)
    const trackingColor = '#22c55e';
    const trackingBg = 'rgba(34, 197, 94, 0.15)';
    const trackingLabel = 'Live AIS Tracking';
    
    locationHtml = `
      <div class="popup-location" style="font-size: 11px; margin: 4px 0; padding: 6px 8px; background: ${trackingBg}; border-radius: 4px; border-left: 3px solid ${trackingColor};">
        <div style="display: flex; align-items: center; gap: 4px; color: ${trackingColor}; font-weight: 500;">
          <span style="font-size: 8px;">●</span>
          <span>${trackingLabel}</span>
        </div>
        <div style="color: var(--text-muted); margin-top: 2px; font-size: 10px;">
          ${pos.speed !== undefined ? `Speed: ${pos.speed?.toFixed(1) || 0} kn` : ''}
          ${pos.course !== undefined ? ` • Course: ${Math.round(pos.course || 0)}°` : ''}
        </div>
        ${pos.destination ? `
          <div style="color: var(--text-muted); margin-top: 2px; font-size: 10px;">
            📍 Destination: ${escapeHtml(pos.destination)}${pos.eta ? ` (ETA: ${pos.eta})` : ''}
          </div>
        ` : ''}
      </div>
    `;
  } else if (isStatic) {
    // Static position (homeport estimate from server)
    locationHtml = `
      <div class="popup-location" style="font-size: 11px; margin: 4px 0; padding: 6px 8px; background: rgba(100, 116, 139, 0.15); border-radius: 4px; border-left: 3px solid #6b7280;">
        <div style="display: flex; align-items: center; gap: 4px; color: #6b7280; font-weight: 500;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17 15h2v2h-2zM17 11h2v2h-2zM17 7h2v2h-2zM13.74 7l1.26.84V7zM13 15h2v2h-2zM13 11h2v2h-2zM19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM9 15h2v2H9zM9 11h2v2H9z"/>
          </svg>
          <span>At Homeport</span>
        </div>
        <div style="color: var(--text-muted); margin-top: 2px; font-size: 10px;">
          📍 ${escapeHtml(locationName)}
        </div>
        ${vessel.livePosition?.note ? `
          <div style="color: var(--text-muted); margin-top: 2px; font-size: 9px; font-style: italic;">
            ${escapeHtml(vessel.livePosition.note)}
          </div>
        ` : ''}
      </div>
    `;
  } else if (hasMMSI) {
    // Has MMSI but not broadcasting (military vessels)
    locationHtml = `
      <div class="popup-location" style="font-size: 11px; margin: 4px 0; padding: 6px 8px; background: rgba(245, 158, 11, 0.15); border-radius: 4px; border-left: 3px solid #f59e0b;">
        <div style="display: flex; align-items: center; gap: 4px; color: #f59e0b; font-weight: 500;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2v-2zm0-8h2v6h-2V9z"/>
          </svg>
          <span>AIS Not Broadcasting</span>
        </div>
        <div style="color: var(--text-muted); margin-top: 2px; font-size: 10px;">
          Showing: ${escapeHtml(locationName)}
        </div>
      </div>
    `;
  } else {
    // No MMSI configured
    locationHtml = `
      <div class="popup-location" style="font-size: 11px; margin: 4px 0; padding: 6px 8px; background: rgba(100, 116, 139, 0.15); border-radius: 4px; border-left: 3px solid #64748b;">
        <div style="display: flex; align-items: center; gap: 4px; color: #64748b; font-weight: 500;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <span>Tracking Disabled</span>
        </div>
        <div style="color: var(--text-muted); margin-top: 2px; font-size: 10px;">
          Showing home port: ${escapeHtml(locationName)}
        </div>
      </div>
    `;
  }
  
  return `
    <div class="popup-content">
      <div class="popup-header">
        <div class="popup-icon">
          <svg viewBox="0 0 24 24" fill="${vessel.typeCategory === 'military' ? '#3b82f6' : '#10b981'}">
            <path d="M12 2L4 10h3v10h10V10h3L12 2z"/>
          </svg>
        </div>
        <div class="popup-title">
          <div class="popup-name">${escapeHtml(vessel.name)}</div>
          <div class="popup-class">${escapeHtml(vessel.class || vessel.typeLabel)}</div>
        </div>
      </div>
      ${locationHtml}
      <div class="popup-scores">
        <div class="popup-score">
          <div class="popup-score-value" style="color: ${fonColor}">${perf.freedomOfNavigation || '--'}</div>
          <div class="popup-score-label">FON</div>
        </div>
        <div class="popup-score">
          <div class="popup-score-value" style="color: ${hpColor}">${perf.currentHullPerformance || '--'}</div>
          <div class="popup-score-label">Hull</div>
        </div>
      </div>
      <button class="popup-btn" onclick="window.openVesselFromMap('${vessel.id}')">View Details</button>
    </div>
  `;
}

// Global function for popup
window.openVesselFromMap = function(vesselId) {
  const vessel = state.fleet.find(v => v.id === vesselId);
  if (vessel) openVesselDetail(vessel);
};

function flyToVessel(vessel) {
  if (!state.map) return;
  
  // Only fly if vessel has valid coordinates
  if (!isValidPosition(vessel._mapPos)) {
    console.warn(`Cannot fly to ${vessel.name}: no valid position`);
    return;
  }
  
  state.map.flyTo({
    center: [getLng(vessel._mapPos), getLat(vessel._mapPos)],
    zoom: 8,
    duration: 1500
  });
}

function fitMapToVessels() {
  if (!state.map || state.fleet.length === 0) return;
  
  const bounds = new mapboxgl.LngLatBounds();
  let hasValidBounds = false;
  
  state.fleet.forEach(vessel => {
    if (isVesselVisible(vessel) && isValidPosition(vessel._mapPos)) {
      bounds.extend([getLng(vessel._mapPos), getLat(vessel._mapPos)]);
      hasValidBounds = true;
    }
  });
  
  if (hasValidBounds) {
    state.map.fitBounds(bounds, { padding: 100, duration: 1500 });
  }
}

// ============================================
// Filtering (Single source of truth)
// ============================================

/**
 * Check if a vessel matches the current filter
 * This is THE ONLY function that determines vessel visibility
 */
function isVesselVisible(vessel) {
  // Check custom fleet filter
  if (state.selectedFleetId) {
    const selectedFleet = state.fleets.find(f => f.id === state.selectedFleetId);
    if (selectedFleet && selectedFleet.vessel_ids) {
      const fleetVesselIds = Array.isArray(selectedFleet.vessel_ids) ? selectedFleet.vessel_ids : [];
      if (!fleetVesselIds.includes(vessel.id)) return false;
    }
  }
  
  // Check type filter
  if (state.filter === 'ran') {
    return vessel.typeCategory === 'military';
  } else if (state.filter === 'commercial') {
    return vessel.typeCategory === 'commercial';
  }
  
  return true;
}

/**
 * Get all vessels that match the current filter
 */
function getVisibleVessels() {
  return state.fleet.filter(isVesselVisible);
}

function setFilter(filter) {
  state.filter = filter;
  
  // Clear fleet selection when using type filters
  if (filter === 'all' || filter === 'ran' || filter === 'commercial') {
    state.selectedFleetId = null;
  }
  
  // Update all filter pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.filter === filter);
  });
  
  renderVesselList();
  updateMapMarkersVisibility();
  
  // Recalculate fleet health for the filtered vessels
  updateFleetHealth();
}

/**
 * Set filter to a specific custom fleet
 */
function setFleetFilter(fleetId) {
  state.selectedFleetId = fleetId;
  state.filter = `fleet-${fleetId}`;
  
  // Update all filter pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.filter === `fleet-${fleetId}`);
  });
  
  renderVesselList();
  updateMapMarkersVisibility();
  fitMapToFilteredVessels();
  
  // Recalculate fleet health for the selected fleet's vessels
  updateFleetHealth();
}

/**
 * Update map marker visibility based on current filter
 */
function updateMapMarkersVisibility() {
  if (!state.map || state.markers.size === 0) return;
  
  state.fleet.forEach(vessel => {
    const marker = state.markers.get(vessel.id);
    if (!marker) return;
    
    const markerEl = marker.getElement();
    if (!markerEl) return;
    
    const visible = isVesselVisible(vessel);
    markerEl.style.display = visible ? 'block' : 'none';
  });
}

/**
 * Fit map to currently filtered vessels with valid positions
 */
function fitMapToFilteredVessels() {
  if (!state.map) return;
  
  const bounds = new mapboxgl.LngLatBounds();
  let hasValidBounds = false;
  
  state.fleet.forEach(vessel => {
    if (isVesselVisible(vessel) && isValidPosition(vessel._mapPos)) {
      bounds.extend([getLng(vessel._mapPos), getLat(vessel._mapPos)]);
      hasValidBounds = true;
    }
  });
  
  if (hasValidBounds) {
    state.map.fitBounds(bounds, { padding: 100, duration: 1500 });
  }
}

/**
 * Render fleet pills in the header filter area
 */
function renderHeaderFleetPills() {
  const filterPillsContainer = document.querySelector('.filter-pills');
  if (!filterPillsContainer) return;
  
  // Remove existing fleet pills (keep the base All/RAN/Commercial)
  filterPillsContainer.querySelectorAll('.filter-pill[data-fleet-pill]').forEach(el => el.remove());
  
  // Add custom fleet pills
  state.fleets.forEach(fleet => {
    const iconMap = {
      'anchor': '⚓', 'ship': '🚢', 'radar': '📡',
      'flag': '🚩', 'star': '⭐', 'shield': '🛡️'
    };
    const icon = iconMap[fleet.icon] || '📁';
    
    const pill = document.createElement('button');
    pill.className = `filter-pill${state.filter === `fleet-${fleet.id}` ? ' active' : ''}`;
    pill.dataset.filter = `fleet-${fleet.id}`;
    pill.dataset.fleetPill = 'true';
    pill.innerHTML = `
      <span class="filter-dot" style="background: ${fleet.color || '#3b82f6'}"></span>
      ${icon} ${escapeHtml(fleet.name)}
    `;
    pill.addEventListener('click', () => setFleetFilter(fleet.id));
    
    filterPillsContainer.appendChild(pill);
  });
}

// ============================================
// Charts
// ============================================
function initPerfTrendChart() {
  const ctx = document.getElementById('perf-trend-chart')?.getContext('2d');
  if (!ctx) return;
  
  if (state.charts.perfTrend) {
    state.charts.perfTrend.destroy();
  }
  
  const labels = generateDateLabels(6);
  
  state.charts.perfTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Avg Hull Performance',
        data: generateTrendData(6, 80, 95),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          min: 60,
          max: 100,
          display: false
        }
      }
    }
  });
}

function generateDateLabels(months) {
  const labels = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    labels.push(date.toLocaleDateString('en-AU', { month: 'short' }));
  }
  return labels;
}

function generateTrendData(points, min, max) {
  const data = [];
  let value = (min + max) / 2;
  for (let i = 0; i < points; i++) {
    value += (Math.random() - 0.5) * 5;
    value = Math.max(min, Math.min(max, value));
    data.push(Math.round(value));
  }
  return data;
}

// ============================================
// Panel Toggles
// ============================================
function togglePerfDetail() {
  const btn = elements.togglePerfDetail;
  const detail = elements.perfDetail;
  
  btn?.classList.toggle('expanded');
  detail?.classList.toggle('hidden');
}

function toggleActivityPanel() {
  const btn = elements.toggleActivity;
  const feed = elements.activityFeed;
  
  btn?.classList.toggle('collapsed');
  
  if (feed) {
    feed.style.display = btn?.classList.contains('collapsed') ? 'none' : '';
  }
}

// ============================================
// Fleet Management
// ============================================

/**
 * Setup fleet-related event listeners
 */
function setupFleetEventListeners() {
  // Open create fleet modal
  elements.createFleetBtn?.addEventListener('click', openCreateFleetModal);
  
  // Close create fleet modal
  elements.closeFleetModal?.addEventListener('click', closeCreateFleetModal);
  elements.cancelFleetBtn?.addEventListener('click', closeCreateFleetModal);
  elements.createFleetModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeCreateFleetModal);
  
  // Save fleet
  elements.saveFleetBtn?.addEventListener('click', saveFleet);
  
  // Fleet vessel search
  elements.fleetVesselSearch?.addEventListener('input', (e) => {
    filterVesselSelectorList(e.target.value);
  });
  
  // Color picker
  elements.colorOptions?.forEach(option => {
    option.addEventListener('click', () => {
      elements.colorOptions.forEach(o => o.classList.remove('active'));
      option.classList.add('active');
      state.selectedFleetColor = option.dataset.color;
    });
  });
  
  // Icon picker
  elements.iconOptions?.forEach(option => {
    option.addEventListener('click', () => {
      elements.iconOptions.forEach(o => o.classList.remove('active'));
      option.classList.add('active');
      state.selectedFleetIcon = option.dataset.icon;
    });
  });
}

/**
 * Load fleets from API
 */
async function loadFleets() {
  try {
    const response = await fetch('/api/fleets');
    if (!response.ok) throw new Error('Failed to fetch fleets');
    
    const data = await response.json();
    state.fleets = data.data || [];
    
    // Render fleet pills in header (main filter location)
    renderHeaderFleetPills();
    
    // Also render sidebar tabs (for quick access)
    renderFleetTabs();
    
    console.log(`✅ Loaded ${state.fleets.length} fleets`);
  } catch (err) {
    console.warn('Could not load fleets:', err.message);
    state.fleets = [];
  }
}

/**
 * Render fleet tabs in the vessel panel
 */
function renderFleetTabs() {
  if (!elements.fleetTabs) return;
  
  // Keep "All Vessels" tab, add fleet tabs
  const allVesselsTab = `
    <button class="fleet-tab ${state.selectedFleetId === null ? 'active' : ''}" data-fleet="all">
      <span class="fleet-tab-icon">🚢</span>
      <span class="fleet-tab-name">All</span>
      <span class="fleet-tab-count">${state.fleet.length}</span>
    </button>
  `;
  
  const fleetTabsHTML = state.fleets.map(fleet => {
    const iconMap = {
      'anchor': '⚓',
      'ship': '🚢',
      'radar': '📡',
      'flag': '🚩',
      'star': '⭐',
      'shield': '🛡️'
    };
    const icon = iconMap[fleet.icon] || '⚓';
    const isActive = state.selectedFleetId === fleet.id;
    
    return `
      <button class="fleet-tab ${isActive ? 'active' : ''}" data-fleet="${fleet.id}" title="${escapeHtml(fleet.name)}">
        <span class="fleet-tab-color" style="background: ${fleet.color}"></span>
        <span class="fleet-tab-name">${escapeHtml(fleet.name)}</span>
        <span class="fleet-tab-count">${fleet.vessel_count || 0}</span>
      </button>
    `;
  }).join('');
  
  elements.fleetTabs.innerHTML = allVesselsTab + fleetTabsHTML;
  
  // Add click handlers
  elements.fleetTabs.querySelectorAll('.fleet-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const fleetId = tab.dataset.fleet === 'all' ? null : tab.dataset.fleet;
      selectFleet(fleetId);
    });
  });
}

/**
 * Select a fleet to filter the vessel list
 */
async function selectFleet(fleetId) {
  state.selectedFleetId = fleetId;
  
  // Update tab active state
  elements.fleetTabs?.querySelectorAll('.fleet-tab').forEach(tab => {
    const tabFleetId = tab.dataset.fleet === 'all' ? null : tab.dataset.fleet;
    tab.classList.toggle('active', tabFleetId === fleetId);
  });
  
  // Re-render vessel list with fleet filter
  renderVesselList();
  
  // Recalculate fleet health for the selected fleet's vessels
  updateFleetHealth();
  updateMapMarkersVisibility();
  
  // If a fleet is selected, fly to show those vessels on the map
  if (fleetId) {
    const fleet = state.fleets.find(f => f.id === fleetId);
    if (fleet && fleet.vessel_ids) {
      // Get vessels in this fleet
      const fleetVesselIds = Array.isArray(fleet.vessel_ids) ? fleet.vessel_ids : [];
      const fleetVessels = state.fleet.filter(v => fleetVesselIds.includes(v.id));
      
      if (fleetVessels.length > 0 && state.map) {
        // Fit map to show fleet vessels
        const bounds = new mapboxgl.LngLatBounds();
        fleetVessels.forEach(v => {
          if (isValidPosition(v._mapPos)) {
            bounds.extend([getLng(v._mapPos), getLat(v._mapPos)]);
          }
        });
        if (!bounds.isEmpty()) {
          state.map.fitBounds(bounds, { padding: 100, duration: 1500 });
        }
      }
    }
  }
}

/**
 * Open the create fleet modal
 */
function openCreateFleetModal() {
  // Reset form
  if (elements.fleetNameInput) elements.fleetNameInput.value = '';
  if (elements.fleetDescInput) elements.fleetDescInput.value = '';
  if (elements.fleetVesselSearch) elements.fleetVesselSearch.value = '';
  
  state.selectedVesselsForFleet.clear();
  state.selectedFleetColor = '#3b82f6';
  state.selectedFleetIcon = 'anchor';
  
  // Reset color/icon selections
  elements.colorOptions?.forEach(o => o.classList.toggle('active', o.dataset.color === '#3b82f6'));
  elements.iconOptions?.forEach(o => o.classList.toggle('active', o.dataset.icon === 'anchor'));
  
  // Populate vessel selector
  renderVesselSelector();
  updateSelectedVesselUI();
  
  // Show modal
  elements.createFleetModal?.classList.add('active');
}

/**
 * Close the create fleet modal
 */
function closeCreateFleetModal() {
  elements.createFleetModal?.classList.remove('active');
}

/**
 * Render the vessel selector list in the create fleet modal
 */
function renderVesselSelector() {
  if (!elements.vesselSelector) return;
  
  if (state.fleet.length === 0) {
    elements.vesselSelector.innerHTML = '<div class="vessel-selector-empty">No vessels available</div>';
    return;
  }
  
  elements.vesselSelector.innerHTML = state.fleet.map(vessel => {
    const isSelected = state.selectedVesselsForFleet.has(vessel.id);
    const typeClass = vessel.typeCategory === 'military' ? 'ran' : 
                      vessel.typeCategory === 'commercial' ? 'commercial' : 'other';
    const typeColor = vessel.typeCategory === 'military' ? 'var(--color-ran)' : 
                      vessel.typeCategory === 'commercial' ? 'var(--color-commercial)' : 'var(--text-muted)';
    
    return `
      <label class="vessel-checkbox ${isSelected ? 'selected' : ''}" data-vessel-id="${vessel.id}">
        <input type="checkbox" ${isSelected ? 'checked' : ''}>
        <span class="vessel-checkbox-indicator" style="background: ${typeColor}"></span>
        <div class="vessel-checkbox-info">
          <div class="vessel-checkbox-name">${escapeHtml(vessel.name)}</div>
          <div class="vessel-checkbox-type">${escapeHtml(vessel.class || vessel.typeLabel || 'Vessel')}</div>
        </div>
      </label>
    `;
  }).join('');
  
  // Add change handlers
  elements.vesselSelector.querySelectorAll('.vessel-checkbox').forEach(checkbox => {
    const input = checkbox.querySelector('input');
    const vesselId = checkbox.dataset.vesselId;
    
    input?.addEventListener('change', () => {
      if (input.checked) {
        state.selectedVesselsForFleet.add(vesselId);
        checkbox.classList.add('selected');
      } else {
        state.selectedVesselsForFleet.delete(vesselId);
        checkbox.classList.remove('selected');
      }
      updateSelectedVesselUI();
    });
  });
}

/**
 * Filter the vessel selector list
 */
function filterVesselSelectorList(searchTerm) {
  const items = elements.vesselSelector?.querySelectorAll('.vessel-checkbox');
  const term = searchTerm.toLowerCase();
  
  items?.forEach(item => {
    const name = item.querySelector('.vessel-checkbox-name')?.textContent.toLowerCase();
    const type = item.querySelector('.vessel-checkbox-type')?.textContent.toLowerCase();
    
    if (name?.includes(term) || type?.includes(term)) {
      item.style.display = '';
    } else {
      item.style.display = 'none';
    }
  });
}

/**
 * Update the selected vessel count and preview chips
 */
function updateSelectedVesselUI() {
  const count = state.selectedVesselsForFleet.size;
  
  // Update count badge
  if (elements.selectedVesselCount) {
    elements.selectedVesselCount.textContent = `${count} selected`;
  }
  
  // Update preview chips
  if (elements.selectedVesselsPreview) {
    if (count === 0) {
      elements.selectedVesselsPreview.innerHTML = '';
    } else {
      const selectedVessels = state.fleet.filter(v => state.selectedVesselsForFleet.has(v.id));
      elements.selectedVesselsPreview.innerHTML = selectedVessels.map(vessel => `
        <div class="selected-vessel-chip" data-vessel-id="${vessel.id}">
          <span>${escapeHtml(vessel.name)}</span>
          <button class="remove-chip" title="Remove">×</button>
        </div>
      `).join('');
      
      // Add remove handlers
      elements.selectedVesselsPreview.querySelectorAll('.remove-chip').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const chip = btn.closest('.selected-vessel-chip');
          const vesselId = chip.dataset.vesselId;
          
          state.selectedVesselsForFleet.delete(vesselId);
          chip.remove();
          
          // Uncheck the checkbox
          const checkbox = elements.vesselSelector?.querySelector(`[data-vessel-id="${vesselId}"]`);
          if (checkbox) {
            checkbox.classList.remove('selected');
            checkbox.querySelector('input').checked = false;
          }
          
          updateSelectedVesselUI();
        });
      });
    }
  }
  
  // Enable/disable save button
  if (elements.saveFleetBtn) {
    elements.saveFleetBtn.disabled = count === 0;
  }
}

/**
 * Save the new fleet
 */
async function saveFleet() {
  const name = elements.fleetNameInput?.value?.trim();
  const description = elements.fleetDescInput?.value?.trim();
  const vesselIds = Array.from(state.selectedVesselsForFleet);
  
  if (!name) {
    shakeElement(elements.fleetNameInput);
    elements.fleetNameInput?.focus();
    return;
  }
  
  if (vesselIds.length === 0) {
    alert('Please select at least one vessel for the fleet.');
    return;
  }
  
  try {
    elements.saveFleetBtn.disabled = true;
    elements.saveFleetBtn.innerHTML = '<span class="loading-spinner"></span>';
    
    const response = await fetch('/api/fleets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name,
        description,
        color: state.selectedFleetColor,
        icon: state.selectedFleetIcon,
        vessel_ids: vesselIds
      })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Failed to create fleet');
    }
    
    const result = await response.json();
    console.log('✅ Fleet created:', result.data);
    
    // Reload fleets and close modal
    await loadFleets();
    closeCreateFleetModal();
    
    // Show success feedback
    showToast(`Fleet "${name}" created with ${vesselIds.length} vessel(s)`);
    
  } catch (err) {
    console.error('Error creating fleet:', err);
    alert(err.message || 'Failed to create fleet. Please try again.');
  } finally {
    if (elements.saveFleetBtn) {
      elements.saveFleetBtn.disabled = false;
      elements.saveFleetBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
        <span>Create Fleet</span>
      `;
    }
  }
}

/**
 * Show a toast notification
 */
function showToast(message) {
  // Create toast element
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
    <span>${escapeHtml(message)}</span>
  `;
  toast.style.cssText = `
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(100px);
    background: var(--bg-panel);
    border: 1px solid var(--border-color);
    border-radius: var(--radius-lg);
    padding: 12px 20px;
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--text-primary);
    font-size: 14px;
    font-weight: 500;
    box-shadow: var(--shadow-lg);
    z-index: 9999;
    transition: transform 0.3s ease;
  `;
  toast.querySelector('svg').style.cssText = `
    width: 20px;
    height: 20px;
    color: var(--color-excellent);
  `;
  
  document.body.appendChild(toast);
  
  // Animate in
  requestAnimationFrame(() => {
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  
  // Remove after delay
  setTimeout(() => {
    toast.style.transform = 'translateX(-50%) translateY(100px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// Utilities
// ============================================
// Note: escapeHtml is imported from map-utils.js

function getScoreClass(value) {
  if (value >= 90) return 'excellent';
  if (value >= 80) return 'good';
  if (value >= 70) return 'warning';
  return 'critical';
}

function getScoreColor(value) {
  if (value >= 90) return '#22c55e';
  if (value >= 80) return '#3b82f6';
  if (value >= 70) return '#f59e0b';
  return '#ef4444';
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}

function formatRelativeTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return formatDate(dateStr);
}

function shakeElement(element) {
  if (!element) return;
  element.style.animation = 'none';
  element.offsetHeight; // Trigger reflow
  element.style.animation = 'shake 0.5s ease';
}

// Shake animation (add to CSS)
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-10px); }
    75% { transform: translateX(10px); }
  }
`;
document.head.appendChild(style);
