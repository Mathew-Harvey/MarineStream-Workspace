/**
 * MarineStream Job Delivery POC
 * Multi-step job creation workflow with vessel selection and GA inspection forms
 */

// State management
const state = {
  authenticated: false,
  token: null,
  currentSection: 'job-type',
  selectedJobType: null,
  selectedVessel: null,
  vesselDetails: null,
  jobTypes: [],
  vessels: [],
  formData: {
    jobNumber: '',
    clientName: '',
    location: '',
    scheduledDate: '',
    workInstructions: '',
    rovUsed: '',
    rovDetails: '',
    supervisor: { name: '', email: '' },
    inspector: { name: '', email: '' },
    approver: { name: '', email: '' },
    gaData: {}
  }
};

// DOM Elements
const elements = {
  authDot: document.getElementById('auth-dot'),
  authText: document.getElementById('auth-text'),
  authBtn: document.getElementById('auth-btn'),
  logoutBtn: document.getElementById('logout-btn'),
  navMenu: document.getElementById('nav-menu'),
  messages: document.getElementById('messages'),
  jobTypeGrid: document.getElementById('job-type-grid'),
  vesselSearch: document.getElementById('vessel-search'),
  vesselList: document.getElementById('vessel-list'),
  gaComponents: document.getElementById('ga-components'),
  gaCount: document.getElementById('ga-count'),
  reviewSummary: document.getElementById('review-summary'),
  btnNext1: document.getElementById('btn-next-1'),
  btnNext2: document.getElementById('btn-next-2'),
  btnBack2: document.getElementById('btn-back-2'),
  btnNext3: document.getElementById('btn-next-3'),
  btnBack3: document.getElementById('btn-back-3'),
  btnNext4: document.getElementById('btn-next-4'),
  btnBack4: document.getElementById('btn-back-4'),
  btnNext5: document.getElementById('btn-next-5'),
  btnBack5: document.getElementById('btn-back-5'),
  btnBack6: document.getElementById('btn-back-6'),
  btnSubmit: document.getElementById('btn-submit')
};

// Section order
const sections = ['job-type', 'vessel', 'job-setup', 'team', 'inspection', 'review'];

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  console.log('🚀 Job Delivery POC initializing...');
  setupEventListeners();
  await checkAuth();
  console.log('✅ Job Delivery POC initialized');
}

function setupEventListeners() {
  console.log('⚙️ Setting up event listeners...');
  
  // Auth buttons
  elements.authBtn?.addEventListener('click', handleLogin);
  elements.logoutBtn?.addEventListener('click', handleLogout);

  // Navigation
  elements.navMenu?.addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item');
    if (navItem) {
      const section = navItem.dataset.section;
      if (section) goToSection(section);
    }
  });

  // Navigation buttons
  elements.btnNext1?.addEventListener('click', () => goToSection('vessel'));
  elements.btnBack2?.addEventListener('click', () => goToSection('job-type'));
  elements.btnNext2?.addEventListener('click', () => goToSection('job-setup'));
  elements.btnBack3?.addEventListener('click', () => goToSection('vessel'));
  elements.btnNext3?.addEventListener('click', () => goToSection('team'));
  elements.btnBack4?.addEventListener('click', () => goToSection('job-setup'));
  elements.btnNext4?.addEventListener('click', () => goToSection('inspection'));
  elements.btnBack5?.addEventListener('click', () => goToSection('team'));
  elements.btnNext5?.addEventListener('click', () => goToSection('review'));
  elements.btnBack6?.addEventListener('click', () => goToSection('inspection'));
  elements.btnSubmit?.addEventListener('click', handleSubmit);

  // Vessel search - both debounced for typing and immediate for paste/clear
  const vesselSearchInput = document.getElementById('vessel-search');
  if (vesselSearchInput) {
    console.log('🔍 Vessel search input found, attaching listeners');
    vesselSearchInput.addEventListener('input', debounce(filterVessels, 300));
    vesselSearchInput.addEventListener('search', filterVessels); // For clear button
  } else {
    console.warn('⚠️ Vessel search input not found');
  }
}

// Auth functions
async function checkAuth() {
  console.log('🔐 Checking authentication...');
  
  try {
    // Check for stored PAT
    const storedToken = localStorage.getItem('marinestream_pat');
    if (storedToken) {
      console.log('🔑 Found stored PAT');
      state.token = storedToken;
      state.authenticated = true;
      updateAuthUI();
      await loadInitialData();
      return;
    }

    // Check OAuth
    if (typeof MarineStreamAuth !== 'undefined') {
      console.log('🔑 Checking OAuth...');
      const token = await MarineStreamAuth.getToken();
      if (token) {
        console.log('🔑 Got OAuth token');
        state.token = token;
        state.authenticated = true;
        updateAuthUI();
        await loadInitialData();
        return;
      }
    } else {
      console.log('⚠️ MarineStreamAuth not available');
    }
  } catch (error) {
    console.error('❌ Auth check failed:', error);
  }
  
  console.log('⚠️ Not authenticated');
  state.authenticated = false;
  updateAuthUI();
  showMessage('Please click Login and enter your Personal Access Token to continue', 'info');
}

function updateAuthUI() {
  if (state.authenticated) {
    elements.authDot?.classList.add('authenticated');
    if (elements.authText) elements.authText.textContent = 'Connected';
    if (elements.authBtn) elements.authBtn.style.display = 'none';
    if (elements.logoutBtn) elements.logoutBtn.style.display = 'inline-flex';
  } else {
    elements.authDot?.classList.remove('authenticated');
    if (elements.authText) elements.authText.textContent = 'Not connected';
    if (elements.authBtn) elements.authBtn.style.display = 'inline-flex';
    if (elements.logoutBtn) elements.logoutBtn.style.display = 'none';
  }
}

async function handleLogin() {
  // Show PAT prompt for now
  const pat = prompt('Enter your MarineStream Personal Access Token:');
  if (pat) {
    localStorage.setItem('marinestream_pat', pat);
    await checkAuth();
  }
}

function handleLogout() {
  localStorage.removeItem('marinestream_pat');
  localStorage.removeItem('marinestream_oauth_token');
  state.authenticated = false;
  state.token = null;
  updateAuthUI();
  showMessage('Logged out successfully', 'success');
}

async function getToken() {
  if (state.token) return state.token;
  throw new Error('Not authenticated');
}

// Data loading
async function loadInitialData() {
  await Promise.all([
    loadJobTypes(),
    loadVessels()
  ]);
}

async function loadJobTypes() {
  console.log('📋 Loading job types...');
  try {
    const token = await getToken();
    const response = await fetch('/api/marinestream/flow-origins', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    console.log('📋 Job types API result:', result);
    
    if (result.success && result.data && result.data.length > 0) {
      state.jobTypes = result.data;
      console.log(`✅ Loaded ${state.jobTypes.length} job types from API`);
      renderJobTypes();
    } else {
      console.log('⚠️ No job types from API, using defaults');
      state.jobTypes = getDefaultJobTypes();
      renderJobTypes();
    }
  } catch (error) {
    console.error('❌ Failed to load job types:', error);
    // Show default job types
    state.jobTypes = getDefaultJobTypes();
    renderJobTypes();
  }
}

function getDefaultJobTypes() {
  return [
    {
      id: 'biofouling-inspection',
      name: 'Biofouling Inspection',
      description: 'Pre-clean inspection to assess marine growth on hull surfaces',
      icon: 'search'
    },
    {
      id: 'biofouling-clean',
      name: 'Biofouling Clean',
      description: 'In-water hull cleaning with capture and filtration',
      icon: 'droplet'
    },
    {
      id: 'engineering-inspection',
      name: 'Engineering Inspection',
      description: 'Technical inspection of propulsion and machinery',
      icon: 'settings'
    },
    {
      id: 'engineering-repair',
      name: 'Engineering Repair',
      description: 'In-water repair and maintenance work',
      icon: 'tool'
    }
  ];
}

function renderJobTypes() {
  if (!elements.jobTypeGrid) return;

  const icons = {
    search: '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>',
    droplet: '<path d="M12 2.69l5.66 5.66a8 8 0 11-11.31 0z"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>',
    tool: '<path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>'
  };

  elements.jobTypeGrid.innerHTML = state.jobTypes.map(jt => `
    <div class="job-type-card ${state.selectedJobType?.id === jt.id ? 'selected' : ''}" 
         data-id="${jt.id}" onclick="selectJobType('${jt.id}')">
      <div class="job-type-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
          ${icons[jt.icon] || icons.search}
        </svg>
      </div>
      <div class="job-type-name">${escapeHtml(jt.name)}</div>
      <div class="job-type-desc">${escapeHtml(jt.description)}</div>
    </div>
  `).join('');
}

async function loadVessels() {
  if (!elements.vesselList) {
    console.error('vesselList element not found');
    return;
  }

  console.log('🚢 Loading vessels...');
  elements.vesselList.innerHTML = `
    <div class="loading">
      <div class="spinner"></div>
      Loading vessels from API...
    </div>
  `;

  try {
    const token = await getToken();
    console.log('🔑 Token available:', token ? 'Yes' : 'No');
    
    const response = await fetch('/api/marinestream/assets', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('📡 API Response status:', response.status);
    const result = await response.json();
    console.log('📦 API Result:', result);
    
    if (result.success && result.data?.assets) {
      state.vessels = result.data.assets;
      console.log(`✅ Loaded ${state.vessels.length} vessels`);
      
      // If user has typed a search query, apply filter
      const query = elements.vesselSearch?.value || '';
      if (query) {
        filterVessels();
      } else {
        renderVessels(state.vessels);
      }
    } else {
      console.warn('⚠️ No vessels in response:', result);
      elements.vesselList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48">
            <path d="M2 20l2-2h16l2 2"/>
            <path d="M4 18V8a2 2 0 012-2h12a2 2 0 012 2v10"/>
          </svg>
          <p>No vessels found</p>
          <p style="font-size: 12px; margin-top: 8px; opacity: 0.7;">
            ${result.error || 'Check console for details'}
          </p>
        </div>
      `;
    }
  } catch (error) {
    console.error('❌ Failed to load vessels:', error);
    elements.vesselList.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="48" height="48" style="color: #ef4444;">
          <circle cx="12" cy="12" r="10"/>
          <path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
        <p style="color: #ef4444;">Failed to load vessels</p>
        <p style="font-size: 12px; margin-top: 8px; opacity: 0.7;">${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}

function renderVessels(vessels) {
  if (!elements.vesselList) return;

  if (!vessels.length) {
    elements.vesselList.innerHTML = `
      <div class="empty-state">
        <p>No vessels found</p>
      </div>
    `;
    return;
  }

  elements.vesselList.innerHTML = vessels.map(vessel => {
    const isRan = vessel.flowType?.toLowerCase().includes('ran');
    const typeClass = isRan ? 'ran' : 'commercial';
    const typeLabel = isRan ? 'RAN' : 'Commercial';

    return `
      <div class="vessel-card ${state.selectedVessel?.id === vessel.id ? 'selected' : ''}" 
           onclick="selectVessel('${vessel.id}')">
        <div class="vessel-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="24" height="24">
            <path d="M2 20l2-2h16l2 2"/>
            <path d="M4 18V8a2 2 0 012-2h12a2 2 0 012 2v10"/>
          </svg>
        </div>
        <div class="vessel-info">
          <div class="vessel-name">${escapeHtml(vessel.name || vessel.displayName || 'Unknown')}</div>
          <div class="vessel-meta">
            ${vessel.mmsi ? `MMSI: ${vessel.mmsi}` : ''}
            ${vessel.imo ? ` • IMO: ${vessel.imo}` : ''}
          </div>
        </div>
        <div class="vessel-badges">
          <span class="vessel-badge ${typeClass}">${typeLabel}</span>
          ${vessel.hasGeneralArrangement ? '<span class="vessel-badge" style="background:#10b981;color:white">GA</span>' : ''}
        </div>
      </div>
    `;
  }).join('');
}

function filterVessels() {
  const query = elements.vesselSearch?.value.toLowerCase() || '';
  console.log(`🔍 Filtering vessels with query: "${query}", total vessels: ${state.vessels.length}`);
  
  if (!state.vessels.length) {
    console.warn('⚠️ No vessels to filter - vessels still loading');
    // Show loading state instead of empty
    if (elements.vesselList) {
      elements.vesselList.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          Searching...
        </div>
      `;
    }
    return;
  }
  
  const filtered = state.vessels.filter(v => {
    const name = (v.name || v.displayName || '').toLowerCase();
    const mmsi = (v.mmsi || '').toLowerCase();
    const imo = (v.imo || '').toLowerCase();
    return name.includes(query) || mmsi.includes(query) || imo.includes(query);
  });
  
  console.log(`📋 Filtered to ${filtered.length} vessels`);
  renderVessels(filtered);
}

// Selection handlers (exposed to window)
window.selectJobType = function(id) {
  state.selectedJobType = state.jobTypes.find(jt => jt.id === id);
  renderJobTypes();
  elements.btnNext1.disabled = false;
};

window.selectVessel = async function(id) {
  state.selectedVessel = state.vessels.find(v => v.id === id);
  console.log('🚢 Selected vessel:', state.selectedVessel);
  
  renderVessels(state.vessels.filter(v => 
    !elements.vesselSearch?.value || 
    (v.name || v.displayName || '').toLowerCase().includes(elements.vesselSearch.value.toLowerCase())
  ));
  elements.btnNext2.disabled = false;

  // Load vessel details with GA
  if (state.selectedVessel) {
    await loadVesselDetails(id);
    // Auto-populate form fields with vessel data
    populateFormFromVessel();
  }
};

async function loadVesselDetails(assetId) {
  try {
    const token = await getToken();
    const response = await fetch(`/api/marinestream/asset/${assetId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    if (result.success && result.data) {
      // Merge API response with original vessel data to preserve all metadata
      state.vesselDetails = {
        ...state.selectedVessel,  // Original data with mmsi, imo, etc.
        ...result.data,           // API response (may have GA, etc.)
        // Ensure we don't lose important fields
        mmsi: result.data.mmsi || state.selectedVessel?.mmsi || '',
        imo: result.data.imo || state.selectedVessel?.imo || '',
        flag: result.data.flag || state.selectedVessel?.flag || '',
        class: result.data.class || state.selectedVessel?.class || '',
        name: result.data.name || state.selectedVessel?.name || '',
        displayName: result.data.displayName || state.selectedVessel?.displayName || state.selectedVessel?.name || ''
      };
      console.log('📦 Merged vessel details:', state.vesselDetails);
      updateVesselDisplay();
      renderGAComponents();
    } else {
      // Use selected vessel data if API fails
      state.vesselDetails = state.selectedVessel;
      updateVesselDisplay();
      renderGAComponents();
    }
  } catch (error) {
    console.error('Failed to load vessel details:', error);
    // Use selected vessel data
    state.vesselDetails = state.selectedVessel;
    updateVesselDisplay();
    renderGAComponents();
  }
}

function updateVesselDisplay() {
  const vessel = state.vesselDetails || state.selectedVessel;
  if (!vessel) return;

  // Get values from multiple possible locations
  const getName = () => vessel.displayName || vessel.name || vessel.data?.displayName || vessel.data?.name || 'Unknown';
  const getImo = () => vessel.imo || vessel.data?.imo || state.selectedVessel?.imo || '-';
  const getMmsi = () => vessel.mmsi || vessel.data?.mmsi || state.selectedVessel?.mmsi || '-';
  const getFlag = () => vessel.flag || vessel.data?.flag || state.selectedVessel?.flag || '-';
  const getClass = () => vessel.class || vessel.data?.class || state.selectedVessel?.class || '-';
  
  console.log('🖼️ Updating vessel display:', { name: getName(), imo: getImo(), mmsi: getMmsi() });
  
  document.getElementById('display-vessel-name').textContent = getName();
  document.getElementById('display-imo').textContent = getImo();
  document.getElementById('display-mmsi').textContent = getMmsi();
  document.getElementById('display-flag').textContent = getFlag();
  document.getElementById('display-class').textContent = getClass();

  // Update vessel type badge
  const flowType = vessel.flowType || state.selectedVessel?.flowType || '';
  const isRan = flowType.toLowerCase().includes('ran');
  const typeEl = document.getElementById('display-vessel-type');
  if (typeEl) {
    typeEl.textContent = isRan ? 'RAN' : 'Commercial';
    typeEl.className = `vessel-badge ${isRan ? 'ran' : 'commercial'}`;
  }

  // Update GA count
  const ga = vessel.generalArrangement || vessel.data?.generalArrangement || [];
  if (elements.gaCount) {
    elements.gaCount.textContent = ga.length;
  }
}

/**
 * Populate form fields with vessel metadata
 */
function populateFormFromVessel() {
  const vessel = state.vesselDetails || state.selectedVessel;
  const selected = state.selectedVessel || {};
  if (!vessel) return;

  // Merge all possible data sources
  const getData = (key) => vessel[key] || vessel.data?.[key] || selected[key] || '';
  
  console.log('📝 Populating form from vessel:', {
    name: getData('name') || getData('displayName'),
    mmsi: getData('mmsi'),
    imo: getData('imo'),
    owner: getData('owner'),
    operator: getData('operator')
  });

  // Auto-populate client name if we have owner/operator info
  const clientNameInput = document.getElementById('client-name');
  if (clientNameInput && !clientNameInput.value) {
    const client = getData('owner') || getData('operator') || getData('clientName');
    if (client) clientNameInput.value = client;
  }

  // Auto-populate location if vessel has a port/location
  const locationInput = document.getElementById('location');
  if (locationInput && !locationInput.value) {
    const location = getData('port') || getData('location') || getData('homePort');
    if (location) locationInput.value = location;
  }

  // Set today's date as default if not set
  const dateInput = document.getElementById('scheduled-date');
  if (dateInput && !dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Generate a job number suggestion
  const jobNumberInput = document.getElementById('job-number');
  if (jobNumberInput && !jobNumberInput.value) {
    const vesselName = (getData('displayName') || getData('name') || 'JOB').substring(0, 3).toUpperCase();
    const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
    jobNumberInput.value = `${vesselName}-${dateStr}`;
  }
}

function renderGAComponents() {
  if (!elements.gaComponents) return;

  const vessel = state.vesselDetails || state.selectedVessel;
  if (!vessel) {
    elements.gaComponents.innerHTML = `
      <div class="empty-state">
        <p>Select a vessel to see inspection areas</p>
      </div>
    `;
    return;
  }

  const vesselData = vessel.data || vessel;
  const ga = vesselData.generalArrangement || vessel.generalArrangement || getDefaultGA();

  if (!ga.length) {
    elements.gaComponents.innerHTML = `
      <div class="empty-state">
        <p>No General Arrangement defined for this vessel</p>
      </div>
    `;
    return;
  }

  elements.gaComponents.innerHTML = ga.map((component, index) => `
    <div class="ga-component" data-id="${component.id || index}">
      <div class="ga-component-header" onclick="toggleGAComponent(this)">
        <svg class="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
        <span class="ga-component-name">${escapeHtml(component.name)}</span>
        <span class="ga-component-status">Pending</span>
      </div>
      <div class="ga-component-body">
        <div class="rating-grid">
          <div class="form-group">
            <label class="form-label">Fouling Rating</label>
            <select class="form-select" data-field="foulingRating" data-component="${component.id || index}">
              <option value="">Select rating...</option>
              <option value="FR 10">FR 10 - Light slime</option>
              <option value="FR 20">FR 20 - Advanced slime</option>
              <option value="FR 30">FR 30 - Soft macrofouling</option>
              <option value="FR 40">FR 40 - Tubeworms &lt;1/4"</option>
              <option value="FR 50">FR 50 - Barnacles &lt;1/4"</option>
              <option value="FR 60">FR 60 - Tubeworms + barnacles &lt;1/4"</option>
              <option value="FR 70">FR 70 - Tubeworms + barnacles &gt;1/4"</option>
              <option value="FR 80">FR 80 - Dense tubeworms</option>
              <option value="FR 90">FR 90 - Very dense growth</option>
              <option value="FR 100">FR 100 - Severe fouling</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fouling Coverage</label>
            <select class="form-select" data-field="foulingCoverage" data-component="${component.id || index}">
              <option value="">Select coverage...</option>
              <option value="None">None (0%)</option>
              <option value="Light">Light (1-5%)</option>
              <option value="Considerable">Considerable (6-15%)</option>
              <option value="Extensive">Extensive (16-40%)</option>
              <option value="Very heavy">Very heavy (41-100%)</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">PDR Rating</label>
            <select class="form-select" data-field="pdrRating" data-component="${component.id || index}">
              <option value="">Select PDR...</option>
              <option value="PDR 10">PDR 10 - AF paint intact</option>
              <option value="PDR 20">PDR 20 - AF paint missing from edges</option>
              <option value="PDR 30">PDR 30 - AF paint missing from flat areas</option>
              <option value="PDR 40">PDR 40 - Bare steel exposed</option>
              <option value="PDR 50">PDR 50 - Corrosion/pitting visible</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Description / Comments</label>
          <textarea class="form-textarea" data-field="comments" data-component="${component.id || index}" 
                    placeholder="Describe observations for ${escapeHtml(component.name)}..."></textarea>
        </div>
      </div>
    </div>
  `).join('');
}

function getDefaultGA() {
  return [
    { id: '1', name: 'Hull Plate Forward' },
    { id: '2', name: 'Hull Plate Midships' },
    { id: '3', name: 'Hull Plate Aft' },
    { id: '4', name: 'Bow Thruster' },
    { id: '5', name: 'Propeller / Azimuth - Port' },
    { id: '6', name: 'Propeller / Azimuth - Starboard' },
    { id: '7', name: 'Rudder' },
    { id: '8', name: 'Bilge Keel - Port' },
    { id: '9', name: 'Bilge Keel - Starboard' },
    { id: '10', name: 'Sea Chest 1' },
    { id: '11', name: 'Sea Chest 2' },
    { id: '12', name: 'Draft Marks' }
  ];
}

window.toggleGAComponent = function(header) {
  const component = header.closest('.ga-component');
  component.classList.toggle('expanded');
};

window.toggleSubsection = function(header) {
  const subsection = header.closest('.subsection');
  subsection.classList.toggle('collapsed');
};

// Navigation
window.goToSection = function(sectionId) {
  console.log(`📍 Navigating to section: ${sectionId}`);
  
  // Update state
  state.currentSection = sectionId;

  // Update nav
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === sectionId);
  });

  // Update sections
  document.querySelectorAll('.section').forEach(section => {
    section.classList.toggle('active', section.id === `section-${sectionId}`);
  });

  // Special handling for vessel section - re-render if vessels loaded
  if (sectionId === 'vessel' && state.vessels.length) {
    const query = elements.vesselSearch?.value || '';
    if (query) {
      filterVessels();
    } else {
      renderVessels(state.vessels);
    }
  }

  // Special handling for review section
  if (sectionId === 'review') {
    renderReviewSummary();
  }

  // Scroll to top
  window.scrollTo(0, 0);
};

function renderReviewSummary() {
  if (!elements.reviewSummary) return;

  const vessel = state.vesselDetails || state.selectedVessel;
  const vesselData = vessel?.data || vessel || {};

  elements.reviewSummary.innerHTML = `
    <div class="subsection">
      <div class="subsection-header" onclick="toggleSubsection(this)">
        <div class="subsection-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <rect x="3" y="3" width="7" height="7"/>
            <rect x="14" y="3" width="7" height="7"/>
            <rect x="14" y="14" width="7" height="7"/>
            <rect x="3" y="14" width="7" height="7"/>
          </svg>
          Job Type
        </div>
        <svg class="subsection-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="subsection-content">
        <p><strong>${escapeHtml(state.selectedJobType?.name || 'Not selected')}</strong></p>
        <p>${escapeHtml(state.selectedJobType?.description || '')}</p>
      </div>
    </div>

    <div class="subsection">
      <div class="subsection-header" onclick="toggleSubsection(this)">
        <div class="subsection-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M2 20l2-2h16l2 2"/>
            <path d="M4 18V8a2 2 0 012-2h12a2 2 0 012 2v10"/>
          </svg>
          Vessel
        </div>
        <svg class="subsection-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="subsection-content">
        <div class="vessel-details-grid">
          <div class="detail-item">
            <label>Name</label>
            <span>${escapeHtml(vesselData.displayName || vesselData.name || vessel?.name || '-')}</span>
          </div>
          <div class="detail-item">
            <label>IMO</label>
            <span>${vesselData.imo || vessel?.imo || '-'}</span>
          </div>
          <div class="detail-item">
            <label>MMSI</label>
            <span>${vesselData.mmsi || vessel?.mmsi || '-'}</span>
          </div>
          <div class="detail-item">
            <label>Flag</label>
            <span>${vesselData.flag || '-'}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="subsection">
      <div class="subsection-header" onclick="toggleSubsection(this)">
        <div class="subsection-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          Job Details
        </div>
        <svg class="subsection-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="subsection-content">
        <div class="vessel-details-grid">
          <div class="detail-item">
            <label>Job Number</label>
            <span>${escapeHtml(document.getElementById('job-number')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Client</label>
            <span>${escapeHtml(document.getElementById('client-name')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Location</label>
            <span>${escapeHtml(document.getElementById('location')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Date</label>
            <span>${document.getElementById('scheduled-date')?.value || '-'}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="subsection">
      <div class="subsection-header" onclick="toggleSubsection(this)">
        <div class="subsection-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
          </svg>
          Delivery Team
        </div>
        <svg class="subsection-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="subsection-content">
        <div class="form-grid">
          <div class="team-member">
            <div class="team-avatar">S</div>
            <div class="team-info">
              <div class="team-name">${escapeHtml(document.getElementById('supervisor-name')?.value || 'Not assigned')}</div>
              <div class="team-email">${escapeHtml(document.getElementById('supervisor-email')?.value || '-')} • Supervisor</div>
            </div>
          </div>
          <div class="team-member">
            <div class="team-avatar">I</div>
            <div class="team-info">
              <div class="team-name">${escapeHtml(document.getElementById('inspector-name')?.value || 'Not assigned')}</div>
              <div class="team-email">${escapeHtml(document.getElementById('inspector-email')?.value || '-')} • Inspector</div>
            </div>
          </div>
          <div class="team-member">
            <div class="team-avatar">A</div>
            <div class="team-info">
              <div class="team-name">${escapeHtml(document.getElementById('approver-name')?.value || 'Not assigned')}</div>
              <div class="team-email">${escapeHtml(document.getElementById('approver-email')?.value || '-')} • Approver</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Submit handler
async function handleSubmit() {
  try {
    elements.btnSubmit.disabled = true;
    elements.btnSubmit.innerHTML = `
      <div class="spinner" style="width:16px;height:16px"></div>
      Creating job...
    `;

    // Collect form data
    const jobData = collectFormData();
    console.log('📝 Submitting job data:', jobData);

    const token = await getToken();
    const response = await fetch('/api/marinestream/work', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(jobData)
    });

    const result = await response.json();
    console.log('📤 Submit result:', result);
    
    if (result.success) {
      showMessage('Job created successfully!', 'success');
      // Reset form or redirect
    } else {
      // Handle error object properly
      const errorMsg = typeof result.error === 'object' 
        ? JSON.stringify(result.error) 
        : (result.error || result.message || 'Failed to create job');
      throw new Error(errorMsg);
    }
  } catch (error) {
    console.error('Submit failed:', error);
    const errorText = error.message || String(error);
    showMessage(`Error: ${errorText}`, 'error');
  } finally {
    elements.btnSubmit.disabled = false;
    elements.btnSubmit.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="M22 2L11 13"/>
        <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
      </svg>
      Create Job
    `;
  }
}

function collectFormData() {
  const vessel = state.vesselDetails || state.selectedVessel || {};
  const selected = state.selectedVessel || {};
  
  // Helper to get value from multiple sources
  const getVal = (key) => vessel[key] || vessel.data?.[key] || selected[key] || '';
  
  // Get vessel name
  const vesselName = getVal('displayName') || getVal('name') || 'Unknown Vessel';
  const vesselId = vessel.id || selected.id || '';
  
  // Get job type name (not the object)
  const jobTypeName = state.selectedJobType?.name || state.selectedJobType?.displayName || 'Job';
  const jobTypeId = state.selectedJobType?.id || '';
  
  // Get the vessel's GA structure
  const vesselGA = vessel.generalArrangement || vessel.data?.generalArrangement || [];
  console.log('📋 Vessel GA structure:', vesselGA);
  
  // Collect GA inspection data - include ALL components
  const generalArrangement = [];
  document.querySelectorAll('.ga-component').forEach(component => {
    const id = component.dataset.id;
    const name = component.querySelector('.ga-component-name')?.textContent || `Component ${id}`;
    
    // Get user input values
    const foulingRating = component.querySelector('[data-field="foulingRating"]')?.value || '';
    const foulingCoverage = component.querySelector('[data-field="foulingCoverage"]')?.value || '';
    const pdrRating = component.querySelector('[data-field="pdrRating"]')?.value || '';
    const comments = component.querySelector('[data-field="comments"]')?.value || '';
    
    // Find original GA component data if exists
    const originalGA = vesselGA.find(g => String(g.id) === String(id) || g.name === name) || {};
    
    // Include ALL components with merged data
    generalArrangement.push({
      id: id,
      name: name,
      // Include original GA data
      ...originalGA,
      // Override with user input (FR Rating data)
      frRatingData: {
        rating: foulingRating || originalGA.frRatingData?.rating || '',
        coverage: foulingCoverage || originalGA.frRatingData?.coverage || '',
        pdr: pdrRating || originalGA.frRatingData?.pdr || ''
      },
      // User comments
      expertInspectorComments: comments || originalGA.expertInspectorComments || '',
      // Mark inspection status
      inspected: !!(foulingRating || foulingCoverage || pdrRating || comments)
    });
  });
  
  // If no GA components were rendered (user didn't go to that step), use vessel's GA
  const finalGA = generalArrangement.length > 0 ? generalArrangement : vesselGA;
  console.log(`📋 Final GA: ${finalGA.length} components`);

  // Get form values
  const jobNumber = document.getElementById('job-number')?.value || '';
  const clientName = document.getElementById('client-name')?.value || '';
  const location = document.getElementById('location')?.value || '';
  const scheduledDate = document.getElementById('scheduled-date')?.value || '';
  const workInstructions = document.getElementById('work-instructions')?.value || '';
  const rovUsed = document.getElementById('rov-used')?.value || '';
  const rovDetails = document.getElementById('rov-details')?.value || '';

  // Build display name as a simple string
  const displayName = `${jobTypeName} - ${vesselName}${jobNumber ? ` (${jobNumber})` : ''}`;

  // Build the work item - data object uses FLAT structure with string values where possible
  const workData = {
    // Vessel info - using FLAT fields, not nested object for critical data
    vesselId: vesselId,
    vesselName: vesselName,
    vesselDisplayName: getVal('displayName') || vesselName,
    vesselMmsi: getVal('mmsi'),
    vesselImo: getVal('imo'),
    vesselFlag: getVal('flag'),
    vesselClass: getVal('class'),
    vesselRegistry: getVal('registry'),
    vesselPennant: getVal('pennant'),
    
    // Also include full vessel object for systems that expect it
    vessel: {
      id: vesselId,
      name: vesselName,
      displayName: getVal('displayName') || vesselName,
      mmsi: getVal('mmsi'),
      imo: getVal('imo'),
      flag: getVal('flag'),
      class: getVal('class'),
      registry: getVal('registry'),
      pennant: getVal('pennant')
    },
    
    // Job metadata - FLAT string fields
    jobNumber: jobNumber,
    clientName: clientName,
    location: location,
    scheduledDate: scheduledDate,
    workInstructions: workInstructions,
    
    // ROV - simple fields
    rovUsed: rovUsed === 'yes',
    rovDetails: rovDetails,
    
    // Team - as strings for display
    supervisorName: document.getElementById('supervisor-name')?.value || '',
    supervisorEmail: document.getElementById('supervisor-email')?.value || '',
    inspectorName: document.getElementById('inspector-name')?.value || '',
    inspectorEmail: document.getElementById('inspector-email')?.value || '',
    approverName: document.getElementById('approver-name')?.value || '',
    approverEmail: document.getElementById('approver-email')?.value || '',
    
    // Job type - as strings not objects
    jobTypeId: jobTypeId,
    jobTypeName: jobTypeName,
    
    // General Arrangement inspection data (all components)
    generalArrangement: finalGA,
    
    // Timestamps
    createdAt: new Date().toISOString(),
    createdBy: 'POC Frontend'
  };

  console.log('📋 Work data being submitted:', workData);

  return {
    // Required: flow origin ID (job type)
    flowOriginId: jobTypeId,
    
    // Display name for the work item (simple string)
    displayName: displayName,
    
    // Work data
    data: workData
  };
}

// Utility functions
function showMessage(text, type = 'info') {
  if (!elements.messages) return;
  elements.messages.innerHTML = `<div class="message ${type}">${escapeHtml(text)}</div>`;
  setTimeout(() => {
    elements.messages.innerHTML = '';
  }, 5000);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function debounce(fn, delay) {
  let timer;
  return function(...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
