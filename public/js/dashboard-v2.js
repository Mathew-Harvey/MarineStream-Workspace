/**
 * MarineStream Fleet Command - Dashboard v2
 * Map-first design with real-time metrics overlay
 * NOW WITH SSO LOGIN - Automatic token refresh!
 */

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
  summary: null,
  selectedVessel: null,
  filter: 'all', // all, ran, commercial
  
  // Map state
  map: null,
  markers: [],
  
  // UI state
  charts: {
    perfTrend: null
  },
  mapStyle: 'dark',
  
  // Token refresh interval
  refreshInterval: null
};

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
}

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  initElements();
  setupEventListeners();
  setupAuthEventListeners();
  
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
      
      // Show app and load data
      elements.authModal?.classList.remove('active');
      elements.app?.classList.remove('hidden');
      updateUserBadge();
      startTokenStatusUpdate();
      await loadAllData();
      initMap();
      return;
    }
  }
  
  // Check for stored PAT without expiry (legacy)
  const legacyPat = localStorage.getItem('marinestream_pat');
  if (legacyPat && !storedExpiry) {
    state.authMethod = 'pat';
    state.token = legacyPat;
    await tryConnectWithToken();
    return;
  }
  
  // No auth - show login modal
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

/**
 * Handle logout
 */
function handleLogout() {
  if (confirm('Are you sure you want to logout?')) {
    // Clear auth state
    state.token = null;
    state.user = null;
    state.authMethod = null;
    
    // Clear stored tokens
    if (window.MarineStreamAuth) {
      MarineStreamAuth.clearTokens();
    } else {
      localStorage.removeItem('marinestream_pat');
    }
    
    // Stop token status updates
    if (tokenStatusInterval) {
      clearInterval(tokenStatusInterval);
      tokenStatusInterval = null;
    }
    
    // Show login modal
    showAuthModal();
    
    // Reset the token status display
    const timerEl = document.getElementById('token-timer');
    if (timerEl) timerEl.textContent = '--:--';
  }
}

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
 * Handle logout
 */
async function handleLogout() {
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
  
  // Clear storage
  localStorage.removeItem('marinestream_pat');
  
  // Clear SSO session
  try {
    await fetch('/api/oauth/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch (e) {}
  
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
  
  // Update gauges
  updateGauge(elements.gaugeFon, s.avgFON);
  updateGauge(elements.gaugeHp, s.avgHullPerformance);
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
  
  let vessels = state.fleet;
  
  // Apply filter
  if (state.filter === 'ran') {
    vessels = vessels.filter(v => v.typeCategory === 'military');
  } else if (state.filter === 'commercial') {
    vessels = vessels.filter(v => v.typeCategory === 'commercial');
  }
  
  if (vessels.length === 0) {
    elements.vesselList.innerHTML = '<div class="empty-state">No vessels found</div>';
    return;
  }
  
  elements.vesselList.innerHTML = vessels.map(vessel => {
    const fon = vessel.performance?.freedomOfNavigation;
    const scoreClass = fon ? getScoreClass(fon) : 'unknown';
    const typeClass = vessel.typeCategory === 'military' ? 'ran' : 
                      vessel.typeCategory === 'commercial' ? 'commercial' : 'other';
    
    return `
      <div class="vessel-item" data-vessel-id="${vessel.id}">
        <div class="vessel-indicator ${typeClass}"></div>
        <div class="vessel-info">
          <div class="vessel-name">${escapeHtml(vessel.name)}</div>
          <div class="vessel-class">${escapeHtml(vessel.class || vessel.typeLabel || 'Vessel')}</div>
        </div>
        <div class="vessel-score">
          <span class="vessel-score-value ${scoreClass}">${fon !== null ? fon : '--'}</span>
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
  const typeClass = vessel.typeCategory === 'military' ? '' : 'commercial';
  
  document.getElementById('detail-vessel-name').textContent = vessel.name;
  document.getElementById('detail-vessel-type').textContent = vessel.typeLabel;
  document.getElementById('detail-vessel-type').className = `vessel-type-badge ${typeClass}`;
  
  // Scores
  updateDetailScore('detail-fon', 'detail-fon-bar', perf.freedomOfNavigation);
  updateDetailScore('detail-hp', 'detail-hp-bar', perf.currentHullPerformance);
  updateDetailScore('detail-ytd', 'detail-ytd-bar', perf.ytdHullPerformance);
  
  // Countdown
  const daysEl = document.getElementById('detail-days');
  if (daysEl) {
    const days = vessel.daysToNextClean;
    daysEl.textContent = days !== null ? days : '--';
    daysEl.className = 'countdown-value' + 
      (days !== null && days <= 30 ? ' critical' : '') +
      (days !== null && days > 30 && days <= 60 ? ' warning' : '');
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
  }
  
  if (barEl) {
    barEl.style.width = value !== null ? `${value}%` : '0%';
    barEl.style.background = value !== null ? getScoreColor(value) : '';
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
        updateMapMarkers();
      });
    })
    .catch(err => console.error('Failed to load map config:', err));
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

function updateMapMarkers() {
  if (!state.map) return;
  
  // Clear existing markers
  state.markers.forEach(m => m.remove());
  state.markers = [];
  
  // Add markers for each vessel
  state.fleet.forEach(vessel => {
    // Generate realistic positions around Australian waters
    const basePositions = {
      'military': [
        { lat: -33.85, lng: 151.21 },  // Sydney
        { lat: -35.03, lng: 150.69 },  // Jervis Bay
        { lat: -32.93, lng: 151.78 },  // Newcastle
        { lat: -12.43, lng: 130.84 },  // Darwin
        { lat: -31.95, lng: 115.86 },  // Perth/Fremantle
        { lat: -19.26, lng: 146.82 },  // Townsville
      ],
      'commercial': [
        { lat: -27.47, lng: 153.03 },  // Brisbane
        { lat: -37.84, lng: 144.95 },  // Melbourne
        { lat: -34.93, lng: 138.60 },  // Adelaide
        { lat: -23.85, lng: 151.26 },  // Gladstone
        { lat: -21.15, lng: 149.18 },  // Mackay
        { lat: -20.45, lng: 148.75 },  // Bowen
      ]
    };
    
    const positions = vessel.typeCategory === 'military' ? basePositions.military : basePositions.commercial;
    const pos = positions[Math.floor(Math.random() * positions.length)];
    
    // Add some randomness
    const lat = pos.lat + (Math.random() - 0.5) * 2;
    const lng = pos.lng + (Math.random() - 0.5) * 2;
    
    vessel._mapPos = { lat, lng };
    
    // Create marker element
    const el = createMarkerElement(vessel);
    
    // Create popup
    const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
      .setHTML(createPopupHTML(vessel));
    
    // Add marker
    const marker = new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(state.map);
    
    state.markers.push(marker);
  });
}

function createMarkerElement(vessel) {
  const el = document.createElement('div');
  el.className = 'vessel-marker';
  
  const color = vessel.typeCategory === 'military' ? '#3b82f6' : '#10b981';
  
  el.innerHTML = `
    <svg viewBox="0 0 32 32" fill="none">
      <path d="M16 2L4 16h4v12h16V16h4L16 2z" fill="${color}" stroke="#fff" stroke-width="2"/>
      <rect x="10" y="18" width="12" height="6" fill="#fff" opacity="0.3"/>
    </svg>
  `;
  
  el.addEventListener('click', () => openVesselDetail(vessel));
  
  return el;
}

function createPopupHTML(vessel) {
  const perf = vessel.performance || {};
  const fonColor = perf.freedomOfNavigation ? getScoreColor(perf.freedomOfNavigation) : 'var(--text-muted)';
  const hpColor = perf.currentHullPerformance ? getScoreColor(perf.currentHullPerformance) : 'var(--text-muted)';
  
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
  if (!state.map || !vessel._mapPos) return;
  
  state.map.flyTo({
    center: [vessel._mapPos.lng, vessel._mapPos.lat],
    zoom: 8,
    duration: 1500
  });
}

function fitMapToVessels() {
  if (!state.map || state.fleet.length === 0) return;
  
  const bounds = new mapboxgl.LngLatBounds();
  
  state.fleet.forEach(vessel => {
    if (vessel._mapPos) {
      bounds.extend([vessel._mapPos.lng, vessel._mapPos.lat]);
    }
  });
  
  state.map.fitBounds(bounds, { padding: 100, duration: 1500 });
}

// ============================================
// Filtering
// ============================================
function setFilter(filter) {
  state.filter = filter;
  
  elements.filterPills.forEach(pill => {
    pill.classList.toggle('active', pill.dataset.filter === filter);
  });
  
  renderVesselList();
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
// Utilities
// ============================================
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

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
