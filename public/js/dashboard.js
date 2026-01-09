/**
 * MarineStream Dashboard
 * Connects to MarineStream Core API and displays fleet data
 */

// State
let state = {
  token: localStorage.getItem('marinestream_pat'),
  fleet: [],
  workItems: [],
  statistics: null,
  currentView: 'fleet',
  selectedVessel: null,
  map: null,
  markers: [],
  performanceChart: null,
  riskChart: null
};

// DOM Elements
const elements = {
  authPrompt: document.getElementById('auth-prompt'),
  patInput: document.getElementById('pat-input'),
  authSubmit: document.getElementById('auth-submit'),
  fleetGrid: document.getElementById('fleet-grid'),
  workList: document.getElementById('work-list'),
  fleetSection: document.getElementById('fleet-section'),
  workSection: document.getElementById('work-section'),
  performanceSection: document.getElementById('performance-section'),
  assetsSection: document.getElementById('assets-section'),
  workflowSection: document.getElementById('workflow-section'),
  mapSection: document.getElementById('map-section'),
  vesselModal: document.getElementById('vessel-modal'),
  methodologyModal: document.getElementById('methodology-modal'),
  modalClose: document.getElementById('modal-close'),
  methodologyClose: document.getElementById('methodology-close'),
  methodologyBtn: document.getElementById('methodology-btn'),
  tabs: document.querySelectorAll('.tab'),
  navItems: document.querySelectorAll('.nav-item[data-view]'),
  sidebarToggle: document.getElementById('sidebar-toggle'),
  sidebar: document.getElementById('sidebar'),
  userInitials: document.getElementById('user-initials'),
  showMapBtn: document.getElementById('show-map-btn'),
  closeMapBtn: document.getElementById('close-map-btn'),
  vesselSelect: document.getElementById('vessel-select'),
  // Stats
  statVessels: document.getElementById('stat-vessels'),
  statJobs: document.getElementById('stat-jobs'),
  statActive: document.getElementById('stat-active'),
  statComplete: document.getElementById('stat-complete'),
  activityList: document.getElementById('activity-list')
};

// Ship SVG Template
const shipSVG = `
<svg viewBox="0 0 140 50" class="ship-silhouette">
  <path d="M5 38 L15 38 L20 30 L120 30 L125 22 L130 22 L135 38 L5 38" fill="currentColor"/>
  <rect x="35" y="18" width="50" height="12" fill="currentColor" opacity="0.9"/>
  <rect x="70" y="10" width="12" height="8" fill="currentColor" opacity="0.85"/>
  <rect x="95" y="14" width="10" height="16" fill="currentColor" opacity="0.8"/>
</svg>
`;

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  setupEventListeners();
  
  if (state.token) {
    await checkTokenAndLoadData();
  } else {
    showAuthPrompt();
  }
}

function setupEventListeners() {
  // Auth
  elements.authSubmit?.addEventListener('click', handleAuth);
  elements.patInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleAuth();
  });
  
  // Header tabs
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.tab));
  });
  
  // Sidebar nav items
  elements.navItems.forEach(nav => {
    nav.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(nav.dataset.view);
    });
  });
  
  // Modal close
  elements.modalClose?.addEventListener('click', closeVesselModal);
  elements.vesselModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeVesselModal);
  
  // Methodology modal
  elements.methodologyBtn?.addEventListener('click', openMethodologyModal);
  elements.methodologyClose?.addEventListener('click', closeMethodologyModal);
  elements.methodologyModal?.querySelector('.modal-backdrop')?.addEventListener('click', closeMethodologyModal);
  
  // Sidebar toggle (mobile)
  elements.sidebarToggle?.addEventListener('click', () => {
    elements.sidebar?.classList.toggle('open');
  });
  
  // Work status filter
  document.getElementById('work-status-filter')?.addEventListener('change', (e) => {
    filterWorkItems(e.target.value);
  });
  
  // Map buttons
  elements.showMapBtn?.addEventListener('click', showMapView);
  elements.closeMapBtn?.addEventListener('click', hideMapView);
  
  // Detail tabs
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.addEventListener('click', () => switchDetailTab(tab.dataset.detail));
  });
}

function showAuthPrompt() {
  elements.authPrompt?.classList.remove('hidden');
}

function hideAuthPrompt() {
  elements.authPrompt?.classList.add('hidden');
}

async function handleAuth() {
  const token = elements.patInput?.value?.trim();
  
  if (!token) {
    alert('Please enter a valid Personal Access Token');
    return;
  }
  
  try {
    elements.authSubmit.textContent = 'Connecting...';
    elements.authSubmit.disabled = true;
    
    const response = await fetch('/api/marinestream/statistics', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      state.token = token;
      localStorage.setItem('marinestream_pat', token);
      hideAuthPrompt();
      await loadAllData();
    } else {
      throw new Error('Invalid token');
    }
  } catch (error) {
    alert('Failed to connect. Please check your token and try again.');
    console.error('Auth error:', error);
  } finally {
    elements.authSubmit.textContent = 'Connect';
    elements.authSubmit.disabled = false;
  }
}

async function checkTokenAndLoadData() {
  try {
    const response = await fetch('/api/marinestream/statistics', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (response.ok) {
      hideAuthPrompt();
      await loadAllData();
    } else {
      localStorage.removeItem('marinestream_pat');
      state.token = null;
      showAuthPrompt();
    }
  } catch (error) {
    console.error('Token check error:', error);
    showAuthPrompt();
  }
}

async function loadAllData() {
  showLoadingState();
  
  try {
    await Promise.all([
      loadFleet(),
      loadWorkItems(),
      loadStatistics()
    ]);
    
    // Extract user initials from token
    try {
      const payload = JSON.parse(atob(state.token.split('.')[1]));
      const name = payload.preferred_name || payload.name || 'User';
      const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
      if (elements.userInitials) elements.userInitials.textContent = initials;
    } catch (e) {
      // Ignore
    }
    
    // Initialize charts
    initializeCharts();
    
    // Populate vessel select
    populateVesselSelect();
    
  } catch (error) {
    console.error('Failed to load data:', error);
  }
}

async function loadFleet() {
  try {
    const response = await fetch('/api/marinestream/fleet', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      state.fleet = data.data?.vessels || [];
      renderFleet();
    }
  } catch (error) {
    console.error('Failed to load fleet:', error);
  }
}

async function loadWorkItems() {
  try {
    const response = await fetch('/api/marinestream/work?limit=50', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      state.workItems = data.data || [];
      renderWorkItems();
    }
  } catch (error) {
    console.error('Failed to load work items:', error);
  }
}

async function loadStatistics() {
  try {
    const response = await fetch('/api/marinestream/statistics', {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      state.statistics = data.data;
      renderStatistics();
    }
  } catch (error) {
    console.error('Failed to load statistics:', error);
  }
}

function showLoadingState() {
  if (elements.fleetGrid) {
    elements.fleetGrid.innerHTML = Array(6).fill(`
      <div class="vessel-card">
        <div class="vessel-ship skeleton" style="height: 80px;"></div>
        <div class="skeleton" style="height: 20px; width: 60%; margin-bottom: 8px;"></div>
        <div class="skeleton" style="height: 16px; width: 40%; margin-bottom: 16px;"></div>
        <div class="skeleton" style="height: 40px;"></div>
      </div>
    `).join('');
  }
}

function renderFleet() {
  if (!elements.fleetGrid) return;
  
  if (state.fleet.length === 0) {
    elements.fleetGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; text-align: center; padding: 48px; color: var(--text-secondary);">
        <p>No vessels found</p>
      </div>
    `;
    return;
  }
  
  elements.fleetGrid.innerHTML = state.fleet.map(vessel => {
    const daysToClean = vessel.daysToNextClean;
    const countdownClass = daysToClean !== null 
      ? (daysToClean < 30 ? 'danger' : daysToClean < 60 ? 'warning' : '')
      : '';
    
    const performance = vessel.performance || {};
    
    return `
      <div class="vessel-card" data-vessel-id="${vessel.id}">
        <div class="vessel-ship">
          ${shipSVG}
        </div>
        <div class="vessel-name">${escapeHtml(vessel.name)}</div>
        <div class="vessel-class">${escapeHtml(vessel.class || vessel.type || 'Vessel')}</div>
        <div class="vessel-countdown ${countdownClass}">
          ${daysToClean !== null 
            ? `<strong>${daysToClean}</strong> days to next clean`
            : 'No cleaning schedule'}
        </div>
        <div class="vessel-metrics">
          <div class="metric">
            <div class="metric-label">Freedom of<br>Navigation</div>
            <div class="metric-value ${getPerformanceClass(performance.freedomOfNavigation)}">
              <span class="metric-indicator ${getPerformanceClass(performance.freedomOfNavigation)}"></span>
              ${performance.freedomOfNavigation || '—'}
            </div>
          </div>
          <div class="metric">
            <div class="metric-label">Current Hull<br>Performance</div>
            <div class="metric-value ${getPerformanceClass(performance.currentHullPerformance)}">
              ${performance.currentHullPerformance || '—'}
            </div>
          </div>
          <div class="metric">
            <div class="metric-label">YTD Hull<br>Performance</div>
            <div class="metric-value ${getPerformanceClass(performance.ytdHullPerformance)}">
              ${performance.ytdHullPerformance || '—'}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
  
  // Add click handlers
  elements.fleetGrid.querySelectorAll('.vessel-card').forEach(card => {
    card.addEventListener('click', () => {
      const vesselId = card.dataset.vesselId;
      const vessel = state.fleet.find(v => v.id === vesselId);
      if (vessel) openVesselModal(vessel);
    });
  });
}

function renderWorkItems(items = state.workItems) {
  if (!elements.workList) return;
  
  if (items.length === 0) {
    elements.workList.innerHTML = `
      <div class="empty-state" style="text-align: center; padding: 48px; color: var(--text-secondary);">
        <p>No work items found</p>
      </div>
    `;
    return;
  }
  
  elements.workList.innerHTML = items.map(work => {
    const statusClass = getStatusClass(work.status);
    const date = new Date(work.lastModified);
    const formattedDate = formatDate(date);
    
    return `
      <div class="work-item" data-work-id="${work.id}">
        <div class="work-code">${escapeHtml(work.workCode)}</div>
        <div class="work-info">
          <div class="work-title">${escapeHtml(work.displayName)}</div>
          ${work.vessel ? `<div class="work-vessel">${escapeHtml(work.vessel.name)}</div>` : ''}
        </div>
        <div class="work-status ${statusClass}">${escapeHtml(work.status || 'Unknown')}</div>
        <div class="work-date">${formattedDate}</div>
      </div>
    `;
  }).join('');
}

function renderStatistics() {
  if (!state.statistics) return;
  
  const stats = state.statistics;
  
  if (elements.statVessels) elements.statVessels.textContent = stats.totalVessels || 0;
  if (elements.statJobs) elements.statJobs.textContent = stats.totalJobs || 0;
  
  const activeCount = Object.entries(stats.jobsByStatus || {})
    .filter(([status]) => !['Complete', 'Deleted'].includes(status))
    .reduce((sum, [, count]) => sum + count, 0);
  
  if (elements.statActive) elements.statActive.textContent = activeCount;
  if (elements.statComplete) elements.statComplete.textContent = stats.jobsByStatus?.Complete || 0;
  
  // Recent activity
  if (elements.activityList && stats.recentActivity) {
    elements.activityList.innerHTML = stats.recentActivity.map(item => `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div class="activity-content">
          <div class="activity-title">${escapeHtml(item.workCode)} - ${escapeHtml(item.displayName)}</div>
          <div class="activity-time">${formatRelativeTime(new Date(item.lastModified))}</div>
        </div>
      </div>
    `).join('');
  }
  
  // Performance metrics
  if (state.fleet.length > 0) {
    const avgPerf = Math.round(state.fleet.reduce((sum, v) => sum + (v.performance?.currentHullPerformance || 0), 0) / state.fleet.length);
    const avgFon = Math.round(state.fleet.reduce((sum, v) => sum + (v.performance?.freedomOfNavigation || 0), 0) / state.fleet.length);
    const vesselsDue = state.fleet.filter(v => v.daysToNextClean !== null && v.daysToNextClean < 30).length;
    
    document.getElementById('avg-performance')?.textContent !== undefined && (document.getElementById('avg-performance').textContent = avgPerf || '--');
    document.getElementById('avg-fon')?.textContent !== undefined && (document.getElementById('avg-fon').textContent = avgFon || '--');
    document.getElementById('vessels-due')?.textContent !== undefined && (document.getElementById('vessels-due').textContent = vesselsDue);
  }
}

function initializeCharts() {
  // Performance Chart
  const perfCtx = document.getElementById('performance-chart')?.getContext('2d');
  if (perfCtx) {
    const labels = generateDateLabels(12);
    
    state.performanceChart = new Chart(perfCtx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Hull Performance',
            data: generatePerformanceData(12, 85, 95),
            borderColor: '#3b82f6',
            backgroundColor: 'rgba(59, 130, 246, 0.1)',
            fill: true,
            tension: 0.4
          },
          {
            label: 'Freedom of Navigation',
            data: generatePerformanceData(12, 80, 98),
            borderColor: '#22c55e',
            backgroundColor: 'rgba(34, 197, 94, 0.1)',
            fill: true,
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        },
        scales: {
          y: {
            min: 60,
            max: 100,
            ticks: {
              callback: value => value + '%'
            }
          }
        }
      }
    });
  }
  
  // Risk Chart
  const riskCtx = document.getElementById('risk-chart')?.getContext('2d');
  if (riskCtx) {
    const riskData = calculateRiskDistribution();
    
    state.riskChart = new Chart(riskCtx, {
      type: 'doughnut',
      data: {
        labels: ['Excellent', 'Good', 'Warning', 'Critical'],
        datasets: [{
          data: [riskData.excellent, riskData.good, riskData.warning, riskData.critical],
          backgroundColor: ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom'
          }
        }
      }
    });
  }
}

function generateDateLabels(months) {
  const labels = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    labels.push(date.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }));
  }
  return labels;
}

function generatePerformanceData(points, min, max) {
  const data = [];
  let value = Math.random() * (max - min) + min;
  for (let i = 0; i < points; i++) {
    value += (Math.random() - 0.5) * 5;
    value = Math.max(min, Math.min(max, value));
    data.push(Math.round(value));
  }
  return data;
}

function calculateRiskDistribution() {
  const distribution = { excellent: 0, good: 0, warning: 0, critical: 0 };
  
  state.fleet.forEach(vessel => {
    const perf = vessel.performance?.freedomOfNavigation || 0;
    if (perf >= 90) distribution.excellent++;
    else if (perf >= 80) distribution.good++;
    else if (perf >= 70) distribution.warning++;
    else distribution.critical++;
  });
  
  return distribution;
}

function populateVesselSelect() {
  if (!elements.vesselSelect) return;
  
  const options = state.fleet.map(v => 
    `<option value="${v.id}">${escapeHtml(v.name)}</option>`
  ).join('');
  
  elements.vesselSelect.innerHTML = `<option value="">All Vessels</option>${options}`;
}

function switchView(viewName) {
  state.currentView = viewName;
  
  // Update tab states
  elements.tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.tab === viewName);
  });
  
  // Update nav item states
  elements.navItems.forEach(nav => {
    nav.classList.toggle('active', nav.dataset.view === viewName);
  });
  
  // Show appropriate section
  const sections = ['fleet', 'work', 'performance', 'assets', 'workflow', 'map'];
  sections.forEach(section => {
    const el = document.getElementById(`${section}-section`);
    if (el) {
      el.classList.toggle('hidden', section !== viewName);
    }
  });
  
  // Render section content if needed
  if (viewName === 'assets') {
    renderAssetsView();
  } else if (viewName === 'workflow') {
    renderWorkflowView();
  }
}

function showMapView() {
  switchView('map');
  initializeMap();
}

function hideMapView() {
  switchView('fleet');
}

function initializeMap() {
  if (state.map) return;
  
  // Get Mapbox token from config
  fetch('/api/config')
    .then(res => res.json())
    .then(config => {
      mapboxgl.accessToken = config.data?.mapbox?.accessToken || 'pk.eyJ1IjoibWFyaW5lc3RyZWFtIiwiYSI6ImNsOXM4ZHB3djBhNGwzdnFyNDBtbXI0ZzAifQ.8Pj2N0M0KjPjUhRPgPglrw';
      
      state.map = new mapboxgl.Map({
        container: 'fleet-map',
        style: 'mapbox://styles/mapbox/light-v11', // Light mode style
        center: [134, -25], // Australia
        zoom: 4,
        pitch: 0
      });
      
      state.map.on('load', () => {
        addVesselMarkers();
      });
      
      // Add navigation controls
      state.map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    });
}

function addVesselMarkers() {
  state.fleet.forEach(vessel => {
    // Generate random position around Australia for demo
    const lat = -15 - Math.random() * 20;
    const lng = 115 + Math.random() * 35;
    
    // Create marker element
    const el = document.createElement('div');
    el.className = 'vessel-marker';
    el.innerHTML = `
      <svg viewBox="0 0 24 24" width="24" height="24">
        <path d="M12 2L2 12h3v8h14v-8h3L12 2z" fill="#f59e0b" stroke="#000" stroke-width="1"/>
      </svg>
    `;
    el.style.cursor = 'pointer';
    
    // Create popup
    const popup = new mapboxgl.Popup({ offset: 25, closeButton: false })
      .setHTML(createVesselPopup(vessel));
    
    // Add marker
    const marker = new mapboxgl.Marker(el)
      .setLngLat([lng, lat])
      .setPopup(popup)
      .addTo(state.map);
    
    state.markers.push(marker);
  });
}

function createVesselPopup(vessel) {
  const performance = vessel.performance || {};
  
  return `
    <div class="vessel-popup">
      <div class="vessel-popup-header">
        <div class="vessel-popup-photo">
          ${vessel.photoUrl 
            ? `<img src="${vessel.photoUrl}" alt="${vessel.name}">`
            : `<svg viewBox="0 0 60 40"><path d="M5 30 L10 30 L15 22 L45 22 L50 16 L55 30 L5 30" fill="currentColor"/><rect x="20" y="12" width="20" height="10" fill="currentColor"/></svg>`
          }
        </div>
        <div>
          <div class="vessel-popup-name">${escapeHtml(vessel.name)}</div>
          <div class="vessel-popup-class">${escapeHtml(vessel.class || vessel.type || 'Vessel')}</div>
        </div>
      </div>
      <div class="vessel-popup-details">
        <div class="vessel-popup-detail">
          <span class="vessel-popup-detail-label">IMO</span>
          <span class="vessel-popup-detail-value">${vessel.imo || '—'}</span>
        </div>
        <div class="vessel-popup-detail">
          <span class="vessel-popup-detail-label">MMSI</span>
          <span class="vessel-popup-detail-value">${vessel.mmsi || '—'}</span>
        </div>
        <div class="vessel-popup-detail">
          <span class="vessel-popup-detail-label">FON Score</span>
          <span class="vessel-popup-detail-value">${performance.freedomOfNavigation || '—'}</span>
        </div>
        <div class="vessel-popup-detail">
          <span class="vessel-popup-detail-label">Hull Perf</span>
          <span class="vessel-popup-detail-value">${performance.currentHullPerformance || '—'}</span>
        </div>
      </div>
      <button class="vessel-popup-btn" onclick="window.openVesselFromMap('${vessel.id}')">
        View Details & History
      </button>
    </div>
  `;
}

// Global function for map popup
window.openVesselFromMap = function(vesselId) {
  const vessel = state.fleet.find(v => v.id === vesselId);
  if (vessel) openVesselModal(vessel);
};

function renderAssetsView() {
  const assetsGrid = document.getElementById('assets-grid');
  if (!assetsGrid) return;
  
  assetsGrid.innerHTML = state.fleet.map(vessel => `
    <div class="asset-card">
      <div class="vessel-ship" style="height: 60px;">
        ${shipSVG}
      </div>
      <h4 style="font-weight: 600; margin-bottom: 4px;">${escapeHtml(vessel.name)}</h4>
      <p style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(vessel.class || vessel.type || 'Vessel')}</p>
      <div style="margin-top: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 12px;">
        <div><span style="color: var(--text-tertiary);">IMO:</span> ${vessel.imo || '—'}</div>
        <div><span style="color: var(--text-tertiary);">MMSI:</span> ${vessel.mmsi || '—'}</div>
        <div><span style="color: var(--text-tertiary);">Flag:</span> ${vessel.flag || 'AU'}</div>
        <div><span style="color: var(--text-tertiary);">Jobs:</span> ${vessel.totalJobs || 0}</div>
      </div>
    </div>
  `).join('');
}

function renderWorkflowView() {
  const workflowGrid = document.getElementById('workflow-grid');
  if (!workflowGrid) return;
  
  const workflows = [
    { name: 'RAN Biofouling Inspection', status: 'Active', count: 12 },
    { name: 'Commercial Biofouling', status: 'Active', count: 8 },
    { name: 'In-Water Cleaning', status: 'Active', count: 5 },
    { name: 'Hull Performance Review', status: 'Pending', count: 3 }
  ];
  
  workflowGrid.innerHTML = workflows.map(wf => `
    <div class="workflow-card">
      <h4 style="font-weight: 600; margin-bottom: 8px;">${wf.name}</h4>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span class="work-status ${wf.status.toLowerCase()}">${wf.status}</span>
        <span style="font-size: 24px; font-weight: 700; color: var(--accent-primary);">${wf.count}</span>
      </div>
      <p style="font-size: 12px; color: var(--text-tertiary); margin-top: 8px;">Active work items</p>
    </div>
  `).join('');
}

function filterWorkItems(status) {
  if (!status) {
    renderWorkItems(state.workItems);
  } else {
    const filtered = state.workItems.filter(w => w.status === status);
    renderWorkItems(filtered);
  }
}

function openVesselModal(vessel) {
  state.selectedVessel = vessel;
  
  const modal = elements.vesselModal;
  const nameEl = document.getElementById('modal-vessel-name');
  const statusEl = document.getElementById('modal-vessel-status');
  const photoEl = document.getElementById('vessel-photo-img');
  const photoPlaceholder = document.querySelector('.vessel-photo-placeholder');
  
  if (nameEl) nameEl.textContent = vessel.name;
  if (statusEl) statusEl.textContent = vessel.type || 'Vessel';
  
  // Handle photo
  if (vessel.photoUrl && photoEl) {
    photoEl.src = vessel.photoUrl;
    photoEl.style.display = 'block';
    if (photoPlaceholder) photoPlaceholder.style.display = 'none';
  } else {
    if (photoEl) photoEl.style.display = 'none';
    if (photoPlaceholder) photoPlaceholder.style.display = 'flex';
  }
  
  renderVesselDetails('info');
  modal?.classList.add('open');
}

function closeVesselModal() {
  elements.vesselModal?.classList.remove('open');
  state.selectedVessel = null;
}

function openMethodologyModal() {
  elements.methodologyModal?.classList.add('open');
}

function closeMethodologyModal() {
  elements.methodologyModal?.classList.remove('open');
}

function switchDetailTab(tabName) {
  document.querySelectorAll('.detail-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.detail === tabName);
  });
  
  renderVesselDetails(tabName);
}

function renderVesselDetails(tab) {
  const vessel = state.selectedVessel;
  if (!vessel) return;
  
  const contentEl = document.getElementById('detail-content');
  if (!contentEl) return;
  
  switch (tab) {
    case 'info':
      contentEl.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px;">
          <div><span style="font-size: 11px; color: var(--text-tertiary); text-transform: uppercase;">Class</span><div style="font-weight: 500;">${escapeHtml(vessel.class || '—')}</div></div>
          <div><span style="font-size: 11px; color: var(--text-tertiary); text-transform: uppercase;">Pennant</span><div style="font-weight: 500;">${escapeHtml(vessel.pennant || '—')}</div></div>
          <div><span style="font-size: 11px; color: var(--text-tertiary); text-transform: uppercase;">IMO</span><div style="font-weight: 500;">${escapeHtml(vessel.imo || '—')}</div></div>
          <div><span style="font-size: 11px; color: var(--text-tertiary); text-transform: uppercase;">MMSI</span><div style="font-weight: 500;">${escapeHtml(vessel.mmsi || '—')}</div></div>
          <div><span style="font-size: 11px; color: var(--text-tertiary); text-transform: uppercase;">Flag</span><div style="font-weight: 500;">${escapeHtml(vessel.flag || 'AU')}</div></div>
          <div><span style="font-size: 11px; color: var(--text-tertiary); text-transform: uppercase;">Total Jobs</span><div style="font-weight: 500;">${vessel.totalJobs || 0}</div></div>
          <div><span style="font-size: 11px; color: var(--text-tertiary); text-transform: uppercase;">Completed</span><div style="font-weight: 500;">${vessel.completedJobs || 0}</div></div>
          <div><span style="font-size: 11px; color: var(--text-tertiary); text-transform: uppercase;">Active</span><div style="font-weight: 500;">${vessel.activeJobs || 0}</div></div>
        </div>
      `;
      break;
      
    case 'jobs':
      const jobs = vessel.jobs || [];
      contentEl.innerHTML = jobs.length > 0 ? jobs.slice(0, 10).map(job => `
        <div class="work-item" style="cursor: default; margin-bottom: 8px;">
          <div class="work-code">${escapeHtml(job.workCode)}</div>
          <div class="work-info">
            <div class="work-title">${escapeHtml(job.displayName)}</div>
            ${job.location ? `<div class="work-vessel">${escapeHtml(job.location)}</div>` : ''}
          </div>
          <div class="work-status ${getStatusClass(job.status)}">${escapeHtml(job.status)}</div>
        </div>
      `).join('') : '<p style="color: var(--text-secondary);">No jobs found for this vessel.</p>';
      break;
      
    case 'performance':
      const perf = vessel.performance || {};
      contentEl.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px;">
          <div style="text-align: center; padding: 16px; background: var(--bg-tertiary); border-radius: 8px;">
            <div style="font-size: 32px; font-weight: 700; color: var(--accent-success);">${perf.freedomOfNavigation || '—'}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">FON Score</div>
          </div>
          <div style="text-align: center; padding: 16px; background: var(--bg-tertiary); border-radius: 8px;">
            <div style="font-size: 32px; font-weight: 700; color: var(--accent-secondary);">${perf.currentHullPerformance || '—'}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">Current Hull Perf</div>
          </div>
          <div style="text-align: center; padding: 16px; background: var(--bg-tertiary); border-radius: 8px;">
            <div style="font-size: 32px; font-weight: 700; color: var(--accent-primary);">${perf.ytdHullPerformance || '—'}</div>
            <div style="font-size: 12px; color: var(--text-secondary);">YTD Performance</div>
          </div>
        </div>
        <p style="font-size: 13px; color: var(--text-secondary);">Performance scores are calculated based on biofouling assessment data. <button style="background: none; border: none; color: var(--accent-primary); cursor: pointer; text-decoration: underline;" onclick="document.getElementById('methodology-btn').click()">View methodology</button></p>
      `;
      break;
      
    case 'history':
      const history = vessel.jobs?.filter(j => j.status === 'Complete') || [];
      contentEl.innerHTML = `
        <h4 style="font-size: 14px; font-weight: 600; margin-bottom: 16px;">Completed Work History</h4>
        ${history.length > 0 ? history.map(job => `
          <div style="padding: 12px; border-left: 3px solid var(--accent-success); background: var(--bg-tertiary); margin-bottom: 8px; border-radius: 0 8px 8px 0;">
            <div style="font-weight: 600;">${escapeHtml(job.workCode)}</div>
            <div style="font-size: 13px; color: var(--text-secondary);">${escapeHtml(job.displayName)}</div>
            ${job.location ? `<div style="font-size: 12px; color: var(--text-tertiary);">📍 ${escapeHtml(job.location)}</div>` : ''}
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">${formatDate(new Date(job.lastModified))}</div>
          </div>
        `).join('') : '<p style="color: var(--text-secondary);">No completed work history found.</p>'}
      `;
      break;
  }
}

// Utility functions
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function getPerformanceClass(value) {
  if (!value) return '';
  if (value >= 90) return 'excellent';
  if (value >= 80) return 'good';
  if (value >= 70) return 'warning';
  return 'danger';
}

function getStatusClass(status) {
  if (!status) return '';
  const normalized = status.toLowerCase().replace(/\s+/g, '-');
  return normalized;
}

function formatDate(date) {
  const now = new Date();
  const diff = now - date;
  
  if (diff < 24 * 60 * 60 * 1000) {
    return formatRelativeTime(date);
  }
  
  return date.toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
  });
}

function formatRelativeTime(date) {
  const now = new Date();
  const diff = now - date;
  
  const minutes = Math.floor(diff / (60 * 1000));
  const hours = Math.floor(diff / (60 * 60 * 1000));
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}
