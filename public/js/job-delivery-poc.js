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
  btnNext6: document.getElementById('btn-next-6'),
  btnBack6: document.getElementById('btn-back-6'),
  btnBack7: document.getElementById('btn-back-7'),
  btnGenerateReport: document.getElementById('btn-generate-report'),
  btnSubmit: document.getElementById('btn-submit')
};

// Section order
const sections = ['job-type', 'vessel', 'job-setup', 'team', 'inspection', 'report-content', 'review'];

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
  elements.btnNext5?.addEventListener('click', () => goToSection('report-content'));
  elements.btnBack6?.addEventListener('click', () => goToSection('inspection'));
  elements.btnNext6?.addEventListener('click', () => goToSection('review'));
  elements.btnBack7?.addEventListener('click', () => goToSection('report-content'));
  elements.btnGenerateReport?.addEventListener('click', handleGenerateReport);
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
  
  // Inspection type change listener - re-render GA components with correct rating scale
  const inspectionTypeSelect = document.getElementById('inspection-type');
  if (inspectionTypeSelect) {
    inspectionTypeSelect.addEventListener('change', () => {
      console.log('📋 Inspection type changed, re-rendering GA components');
      renderGAComponents();
    });
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
  
  // Get inspection type to determine which rating scale to show
  const inspectionType = document.getElementById('inspection-type')?.value || '';
  const isNZCRMS = inspectionType === 'NZ CRMS Biofouling Inspection';

  if (!ga.length) {
    elements.gaComponents.innerHTML = `
      <div class="empty-state">
        <p>No General Arrangement defined for this vessel</p>
      </div>
    `;
    return;
  }

  // Build the rating options based on inspection type
  const foulingRatingOptions = isNZCRMS ? `
    <option value="">Select LOF rating...</option>
    <option value="Rank: 0">Rank 0 - No slime, no macrofouling</option>
    <option value="Rank: 1">Rank 1 - Slime layer, no macrofouling</option>
    <option value="Rank: 2">Rank 2 - 1-5% macrofouling</option>
    <option value="Rank: 3">Rank 3 - 6-15% macrofouling</option>
    <option value="Rank: 4">Rank 4 - 16-40% macrofouling</option>
    <option value="Rank: 5">Rank 5 - 41-100% macrofouling</option>
  ` : `
    <option value="">Select FR rating...</option>
    <option value="FR: 0">FR 0 - Clean, foul-free surface</option>
    <option value="FR: 10">FR 10 - Light incipient slime</option>
    <option value="FR: 20">FR 20 - Advanced slime</option>
    <option value="FR: 30">FR 30 - Grass/soft fouling</option>
    <option value="FR: 40">FR 40 - Tubeworms &lt;1/4"</option>
    <option value="FR: 50">FR 50 - Barnacles &lt;1/4"</option>
    <option value="FR: 60">FR 60 - Tubeworms + barnacles &lt;1/4"</option>
    <option value="FR: 70">FR 70 - Tubeworms + barnacles &gt;1/4"</option>
    <option value="FR: 80">FR 80 - Dense tubeworms/barnacles</option>
    <option value="FR: 90">FR 90 - Very dense growth</option>
    <option value="FR: 100">FR 100 - All forms of fouling</option>
  `;

  const foulingRatingLabel = isNZCRMS ? 'Level of Fouling (LOF)' : 'Fouling Rating (FR)';
  
  // Fouling coverage options (only shown for Australian inspection)
  const foulingCoverageField = isNZCRMS ? '' : `
    <div class="form-group">
      <label class="form-label">Fouling Coverage</label>
      <select class="form-select" data-field="foulingCoverage" data-component="\${componentId}">
        <option value="">Select coverage...</option>
        <option value="None (0%)">None (0%)</option>
        <option value="Light (1-5%)">Light (1-5%)</option>
        <option value="Considerable (6-15%)">Considerable (6-15%)</option>
        <option value="Extensive (16-40%)">Extensive (16-40%)</option>
        <option value="Very heavy (41-100%)">Very heavy (41-100%)</option>
      </select>
    </div>
  `;

  elements.gaComponents.innerHTML = ga.map((component, index) => {
    const componentId = component.id || index;
    const coverageField = isNZCRMS ? '' : `
      <div class="form-group">
        <label class="form-label">Fouling Coverage</label>
        <select class="form-select" data-field="foulingCoverage" data-component="${componentId}">
          <option value="">Select coverage...</option>
          <option value="None (0%)">None (0%)</option>
          <option value="Light (1-5%)">Light (1-5%)</option>
          <option value="Considerable (6-15%)">Considerable (6-15%)</option>
          <option value="Extensive (16-40%)">Extensive (16-40%)</option>
          <option value="Very heavy (41-100%)">Very heavy (41-100%)</option>
        </select>
      </div>
    `;
    
    return `
    <div class="ga-component" data-id="${componentId}">
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
            <label class="form-label">${foulingRatingLabel}</label>
            <select class="form-select" data-field="foulingRating" data-component="${componentId}">
              ${foulingRatingOptions}
            </select>
          </div>
          ${coverageField}
          <div class="form-group">
            <label class="form-label">PDR Rating</label>
            <select class="form-select" data-field="pdrRating" data-component="${componentId}">
              <option value="">Select PDR...</option>
              <option value="PDR: 0">PDR 0 - No AF coating</option>
              <option value="PDR: 10">PDR 10 - AF paint intact</option>
              <option value="PDR: 20">PDR 20 - AF missing from edges (AC exposed)</option>
              <option value="PDR: 30">PDR 30 - AF missing from flat areas (AC exposed)</option>
              <option value="PDR: 40">PDR 40 - AF missing from blisters (AC exposed)</option>
              <option value="PDR: 50">PDR 50 - Ruptured blisters (AC intact)</option>
              <option value="PDR: 60">PDR 60 - AF/AC missing (steel exposed, no corrosion)</option>
              <option value="PDR: 70">PDR 70 - Steel exposed at edges (corrosion present)</option>
              <option value="PDR: 80">PDR 80 - Ruptured blisters (corrosion present)</option>
              <option value="PDR: 90">PDR 90 - Area corrosion (no AF/AC)</option>
              <option value="PDR: 100">PDR 100 - Pitting, scaling, roughened steel</option>
            </select>
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Diver/Supervisor Observations</label>
          <textarea class="form-textarea" data-field="comments" data-component="${componentId}" 
                    placeholder="Describe observations for ${escapeHtml(component.name)}..."></textarea>
        </div>
      </div>
    </div>
  `;
  }).join('');
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
  
  // Collect diver names
  const divers = [];
  for (let i = 1; i <= 4; i++) {
    const name = document.getElementById(`diver-${i}`)?.value;
    if (name) divers.push(name);
  }
  const diversDisplay = divers.length > 0 ? divers.join(', ') : 'None assigned';

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
          Job Type & Inspection
        </div>
        <svg class="subsection-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="subsection-content">
        <div class="vessel-details-grid">
          <div class="detail-item">
            <label>Job Type</label>
            <span>${escapeHtml(state.selectedJobType?.name || 'Not selected')}</span>
          </div>
          <div class="detail-item">
            <label>Inspection Type</label>
            <span>${escapeHtml(document.getElementById('inspection-type')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Report Title</label>
            <span>${escapeHtml(document.getElementById('supporting-work')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Confidentiality</label>
            <span>${escapeHtml(document.getElementById('confidential')?.value || 'Not Confidential')}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="subsection">
      <div class="subsection-header" onclick="toggleSubsection(this)">
        <div class="subsection-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M2 20l2-2h16l2 2"/>
            <path d="M4 18V8a2 2 0 012-2h12a2 2 0 012 2v10"/>
          </svg>
          Vessel Details
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
          <div class="detail-item">
            <label>Commissioned</label>
            <span>${escapeHtml(document.getElementById('vessel-commissioned')?.value || vesselData.commissioned || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Gross Tonnage</label>
            <span>${escapeHtml(document.getElementById('vessel-gross-tonnage')?.value || vesselData.grossTonnage || '-')} t</span>
          </div>
          <div class="detail-item">
            <label>Length</label>
            <span>${escapeHtml(document.getElementById('vessel-length')?.value || vesselData.length || '-')} m</span>
          </div>
          <div class="detail-item">
            <label>Beam</label>
            <span>${escapeHtml(document.getElementById('vessel-beam')?.value || vesselData.beam || '-')} m</span>
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
            <label>Document Number</label>
            <span>${escapeHtml(document.getElementById('job-number')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Work Instruction</label>
            <span>${escapeHtml(document.getElementById('work-instruction-ref')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Client</label>
            <span>${escapeHtml(document.getElementById('client-name')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Client Rep</label>
            <span>${escapeHtml(document.getElementById('client-rep')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Location</label>
            <span>${escapeHtml(document.getElementById('location')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Berth/Anchorage</label>
            <span>${escapeHtml(document.getElementById('berth-location')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Inspection Date</label>
            <span>${document.getElementById('scheduled-date')?.value || '-'}</span>
          </div>
          <div class="detail-item">
            <label>Visibility</label>
            <span>${escapeHtml(document.getElementById('visibility')?.value || '-')}</span>
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
              <div class="team-email">Supervisor</div>
            </div>
          </div>
          <div class="team-member">
            <div class="team-avatar">I</div>
            <div class="team-info">
              <div class="team-name">${escapeHtml(document.getElementById('inspector-name')?.value || 'Not assigned')}</div>
              <div class="team-email">Inspector</div>
            </div>
          </div>
          <div class="team-member">
            <div class="team-avatar">R</div>
            <div class="team-info">
              <div class="team-name">${escapeHtml(document.getElementById('repair-agent-name')?.value || 'Not assigned')}</div>
              <div class="team-email">Repair Agent</div>
            </div>
          </div>
          <div class="team-member">
            <div class="team-avatar">D</div>
            <div class="team-info">
              <div class="team-name">${escapeHtml(diversDisplay)}</div>
              <div class="team-email">Divers</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="subsection">
      <div class="subsection-header" onclick="toggleSubsection(this)">
        <div class="subsection-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          Document Control
        </div>
        <svg class="subsection-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="subsection-content">
        <div class="vessel-details-grid">
          <div class="detail-item">
            <label>Prepared By</label>
            <span>${escapeHtml(document.getElementById('prepared-by')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Reviewed By</label>
            <span>${escapeHtml(document.getElementById('reviewed-by')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Approved By</label>
            <span>${escapeHtml(document.getElementById('approved-by')?.value || '-')}</span>
          </div>
          <div class="detail-item">
            <label>Revision</label>
            <span>${escapeHtml(document.getElementById('revision-number')?.value || '1')}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="subsection">
      <div class="subsection-header" onclick="toggleSubsection(this)">
        <div class="subsection-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
            <line x1="16" y1="9" x2="8" y2="9"/>
          </svg>
          Report Content
        </div>
        <svg class="subsection-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </div>
      <div class="subsection-content">
        <div class="vessel-details-grid" style="grid-template-columns: 1fr;">
          <div class="detail-item">
            <label>Executive Summary</label>
            <span>${document.getElementById('report-summary')?.value ? '✓ Entered' : '○ Not entered'}</span>
          </div>
          <div class="detail-item">
            <label>Overview</label>
            <span>${document.getElementById('report-overview')?.value ? '✓ Entered' : '○ Not entered'}</span>
          </div>
          <div class="detail-item">
            <label>Methodology</label>
            <span>${document.getElementById('report-methodology')?.value ? '✓ Entered' : '○ Not entered'}</span>
          </div>
          <div class="detail-item">
            <label>Recommendations</label>
            <span>${document.getElementById('report-recommendations')?.value ? '✓ Entered' : '○ Not entered'}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Default text templates for report sections
const defaultReportText = {
  summary: `This report documents the underwater inspection conducted on the vessel. The inspection was performed to assess the condition of the hull, appendages, and underwater fittings. Overall findings and observations are detailed in the sections below.`,
  
  overview: `The inspection was undertaken to assess the current condition of the vessel's underwater hull and appendages. This report provides a comprehensive overview of the biofouling condition and paint system integrity observed during the inspection.`,
  
  methodology: `The inspection was conducted using commercial diving operations in accordance with applicable standards and procedures. Visual assessment was performed using underwater cameras and direct observation. Fouling ratings were assigned using the standardized rating scales as referenced in this report.`,
  
  recommendations: `Based on the inspection findings, the following recommendations are provided for consideration:
• Continue monitoring the vessel's biofouling management program
• Schedule follow-up inspection as required by the vessel's biofouling management plan
• Address any areas of concern identified in this report`,
  
  supervisorDeclaration: `I certify that this inspection was conducted in accordance with the applicable procedures and standards. The observations and findings documented in this report accurately represent the condition of the vessel at the time of inspection.`,
  
  imsDeclaration: `This inspection was conducted in accordance with the vessel's Integrated Management System requirements and applicable regulatory standards.`,
  
  repairDeclaration: `Any repair work conducted was performed in accordance with approved procedures and manufacturer specifications.`,
  
  diverComments: (componentName) => `Visual inspection of ${componentName} was conducted. Observations recorded as per rating data above.`,
  
  noDataAvailable: 'No information provided'
};

// Generate Report handler (preview without API submission)
async function handleGenerateReport() {
  try {
    elements.btnGenerateReport.disabled = true;
    elements.btnGenerateReport.innerHTML = `
      <div class="spinner" style="width:16px;height:16px"></div>
      Generating report...
    `;

    // Collect form data with defaults for empty fields
    const reportData = collectFormData(true); // true = include defaults
    console.log('📄 Generating report with data:', reportData);

    const data = reportData.data;
    const vessel = data.vessel || {};
    const vesselData = vessel.data || vessel;
    const ga = vesselData.generalArrangement || [];
    const inspectionType = data.inspectionType || 'Australian Biofouling Inspection';
    const isNZCRMS = inspectionType.includes('NZ CRMS');
    
    // Format date
    const inspectionDate = data.actualDelivery?.startDateTime?.date 
      ? new Date(data.actualDelivery.startDateTime.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    // Generate HTML report
    const reportHtml = generateReportHTML(data, vessel, vesselData, ga, inspectionDate, isNZCRMS, inspectionType);
    
    // Open report preview in a new window
    const previewWindow = window.open('', '_blank', 'width=900,height=1000');
    if (previewWindow) {
      previewWindow.document.write(reportHtml);
      previewWindow.document.close();
    } else {
      showMessage('Please allow popups to view the report', 'error');
    }

  } catch (error) {
    console.error('Generate report failed:', error);
    showMessage(`Error generating report: ${error.message}`, 'error');
  } finally {
    elements.btnGenerateReport.disabled = false;
    elements.btnGenerateReport.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
      </svg>
      Generate Report (Preview)
    `;
  }
}

// Generate formatted HTML report matching the HBS template style
function generateReportHTML(data, vessel, vesselData, ga, inspectionDate, isNZCRMS, inspectionType) {
  const reportTitle = data.supportingWork || `${data.jobType || 'Biofouling Inspection'} Report`;
  const vesselName = vessel.displayName || vessel.name || 'Vessel Name';
  const confidential = data.confidential || '';
  
  // Build Table of Contents entries for GA components
  let tocEntries = '';
  let gaCounter = 5; // GA section starts at 5
  let subCounter = 1;
  ga.forEach((component, idx) => {
    if (component.frRatingData?.length > 0 || component.diverSupervisorComments) {
      tocEntries += `<tr><td style="width:20px;border:none"></td><td style="border:none;font-size:14px;text-transform:uppercase;">${gaCounter}.${subCounter} ${escapeHtml(component.name)}</td></tr>`;
      subCounter++;
    }
  });

  // Build GA sections
  let gaSections = '';
  subCounter = 1;
  ga.forEach((component, idx) => {
    const frData = component.frRatingData || [];
    const hasData = frData.length > 0 || component.diverSupervisorComments;
    
    if (hasData) {
      gaSections += `
        <div class="page" id="ga-${idx}">
          <h4>${gaCounter}.${subCounter} ${escapeHtml(component.name).toUpperCase()}</h4>
          <h4 style="margin-top:-6mm;">Observations and Findings</h4>
          ${frData.length > 0 ? generateFRTable(frData, isNZCRMS) : '<p>No rating data recorded.</p>'}
          ${component.diverSupervisorComments ? `
            <div class="comments-wrapper">
              <h5>DIVER/SUPERVISOR COMMENTS</h5>
              ${component.diverSupervisorComments}
            </div>
          ` : ''}
          ${component.expertInspectorComments ? `
            <div class="comments-wrapper">
              <h5>INSPECTOR COMMENTS</h5>
              ${component.expertInspectorComments}
            </div>
          ` : ''}
        </div>
      `;
      subCounter++;
    }
  });

  // Get document status info
  const docStatus = data.document?.status?.[0] || {};
  const reviewDate = data.reviewDate?.date 
    ? new Date(data.reviewDate.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    : inspectionDate;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(reportTitle)} - ${escapeHtml(vesselName)}</title>
  <style>
    * { font-family: 'Calibri', 'Segoe UI', sans-serif; box-sizing: border-box; }
    body { max-width: 210mm; margin: 0 auto; padding: 20mm; background: white; color: #000; font-size: 12pt; line-height: 1.4; }
    
    h1 { font-size: 28px; text-transform: uppercase; text-align: center; color: #365F91; margin-top: 50px; }
    h2 { font-size: 22px; text-transform: uppercase; text-align: center; color: #365F91; }
    h3 { font-size: 20px; text-transform: uppercase; color: #365F91; }
    h4 { font-size: 18px; text-transform: uppercase; color: #365F91; margin-bottom: 12px; }
    h5 { font-size: 14px; text-transform: uppercase; color: #365F91; margin: 16px 0 8px 0; }
    
    .page { page-break-after: always; min-height: 200mm; }
    .page:last-child { page-break-after: auto; }
    
    .header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 2px solid #365F91; margin-bottom: 20px; }
    .header img { max-height: 60px; }
    .confidential { color: #FF0000; font-weight: bold; font-size: 18px; }
    
    table { border-collapse: collapse; width: 100%; margin-bottom: 20px; }
    th { background-color: #365F91; color: white; padding: 10px; text-align: left; font-weight: bold; }
    td { border: 1px solid #000; padding: 8px; vertical-align: top; }
    
    .project-table td:first-child { background-color: #365F91; color: white; font-weight: bold; width: 200px; }
    .project-table td { border: 1px solid #000; }
    
    .toc-table td { border: none; padding: 5px 10px; }
    .toc-table { margin-top: 20px; }
    
    .fr-table th { font-size: 12px; text-align: center; }
    .fr-table td { font-size: 11px; text-align: left; word-wrap: break-word; }
    
    .rating-scale th { text-align: center; }
    .rating-scale td:first-child { text-align: center; font-weight: bold; width: 100px; }
    
    .comments-wrapper { margin: 16px 0; }
    .comments-wrapper p { margin: 8px 0; }
    
    .declaration-box { border: 1px solid #000; padding: 15px; margin: 20px 0; }
    .declaration-box h5 { background: #365F91; color: white; margin: -15px -15px 15px -15px; padding: 10px 15px; }
    
    .doc-status th { background: #365F91; color: white; }
    .doc-status td { border: 1px solid #000; }
    
    .copyright { border: 1px solid #000; padding: 15px; margin-top: 30px; font-size: 10pt; }
    .copyright-header { background: #365F91; color: white; margin: -15px -15px 15px -15px; padding: 10px 15px; text-align: center; font-weight: bold; }
    
    .end-report { text-align: center; color: #365F91; font-style: italic; margin: 40px 0; }
    
    @media print {
      body { padding: 15mm; }
      .page { page-break-after: always; }
      .no-print { display: none; }
    }
    
    .print-btn { 
      position: fixed; top: 20px; right: 20px; 
      padding: 12px 24px; background: #365F91; color: white; 
      border: none; border-radius: 8px; cursor: pointer; 
      font-size: 14px; font-weight: bold; z-index: 1000;
    }
    .print-btn:hover { background: #2a4a73; }
  </style>
</head>
<body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print / Save PDF</button>

  <!-- COVER PAGE -->
  <div class="page">
    <div class="header">
      <img src="https://cdn.marinestream.io/logos/FranMarine_wText_compressed-minV2.png" alt="Franmarine Logo">
      ${confidential ? `<span class="confidential">${escapeHtml(confidential)}</span>` : ''}
    </div>
    
    <h1 style="margin-top: 80px;">${escapeHtml(reportTitle).toUpperCase()}</h1>
    <h2>${escapeHtml(vesselName).toUpperCase()}</h2>
    <h2>${inspectionDate.toUpperCase()}</h2>
  </div>

  <!-- TABLE OF CONTENTS -->
  <div class="page">
    <h4>TABLE OF CONTENTS</h4>
    <table class="toc-table">
      ${data.report?.summary ? '<tr><td colspan="2" style="border:none;font-size:14px;text-transform:uppercase;">EXECUTIVE SUMMARY</td></tr>' : ''}
      <tr><td colspan="2" style="border:none;font-size:14px;text-transform:uppercase;">1 PROJECT PARTICULARS</td></tr>
      ${data.report?.overview ? '<tr><td colspan="2" style="border:none;font-size:14px;text-transform:uppercase;">2 OVERVIEW</td></tr>' : ''}
      ${data.report?.methodology ? '<tr><td colspan="2" style="border:none;font-size:14px;text-transform:uppercase;">3 METHODOLOGY</td></tr>' : ''}
      <tr><td colspan="2" style="border:none;font-size:14px;text-transform:uppercase;">4 REFERENCE TABLES</td></tr>
      <tr><td style="width:20px;border:none"></td><td style="border:none;font-size:14px;text-transform:uppercase;">4.1 ${isNZCRMS ? 'LEVEL OF FOULING (LOF) SCALE' : 'FOULING RATING (FR) SCALE'}</td></tr>
      <tr><td style="width:20px;border:none"></td><td style="border:none;font-size:14px;text-transform:uppercase;">4.2 PAINT DETERIORATION RATING (PDR) SCALE</td></tr>
      <tr><td colspan="2" style="border:none;font-size:14px;text-transform:uppercase;">5 GENERAL ARRANGEMENT</td></tr>
      ${tocEntries}
      ${data.report?.recommendations ? '<tr><td colspan="2" style="border:none;font-size:14px;text-transform:uppercase;">6 RECOMMENDATIONS</td></tr>' : ''}
    </table>
  </div>

  <!-- EXECUTIVE SUMMARY -->
  ${data.report?.summary ? `
  <div class="page">
    <h4>EXECUTIVE SUMMARY</h4>
    ${data.report.summary}
  </div>
  ` : ''}

  <!-- PROJECT PARTICULARS -->
  <div class="page">
    <h4>1. PROJECT PARTICULARS</h4>
    <table class="project-table">
      <tr>
        <td>PROJECT:</td>
        <td colspan="2">${escapeHtml(data.jobType || 'Biofouling Inspection')}</td>
      </tr>
      <tr>
        <td rowspan="7">VESSEL DETAILS:</td>
        <td style="border:none;">Vessel:</td>
        <td>${escapeHtml(vesselName)}</td>
      </tr>
      <tr>
        <td style="border:none;">IMO:</td>
        <td>${escapeHtml(vessel.imo || vesselData.imo || '-')}</td>
      </tr>
      <tr>
        <td style="border:none;">Commissioned:</td>
        <td>${escapeHtml(vesselData.commissioned || '-')}</td>
      </tr>
      <tr>
        <td style="border:none;">Gross Tonnage (t):</td>
        <td>${escapeHtml(vesselData.grossTonnage || '-')}</td>
      </tr>
      <tr>
        <td style="border:none;">Length (m):</td>
        <td>${escapeHtml(vesselData.length || '-')} meters</td>
      </tr>
      <tr>
        <td style="border:none;">Beam (m):</td>
        <td>${escapeHtml(vesselData.beam || '-')} meters</td>
      </tr>
      <tr>
        <td style="border:none;">Draft (m):</td>
        <td>${escapeHtml(vesselData.vesselDraft || '-')} meters</td>
      </tr>
      <tr>
        <td>DATE OF INSPECTION:</td>
        <td colspan="2">${inspectionDate}</td>
      </tr>
      ${data.visibility ? `<tr><td>VISIBILITY:</td><td colspan="2">${escapeHtml(data.visibility)}</td></tr>` : ''}
      ${data.clientDetails ? `<tr><td>CLIENT:</td><td colspan="2">${escapeHtml(data.clientDetails)}</td></tr>` : ''}
      <tr>
        <td>JOB LOCATION:</td>
        <td colspan="2">${escapeHtml(data.location?.displayName || 'Not specified')}, ${escapeHtml(data.berthAnchorageLocation || '')}</td>
      </tr>
      <tr>
        <td rowspan="${2 + (data.resourcing?.toggleRovUse === 'true' ? 1 : 0) + (data.inspector?.name ? 1 : 0)}">INSPECTION TEAM:</td>
        <td style="border:none;">Supervisor:</td>
        <td>${escapeHtml(data.supervisor?.name || '-')}</td>
      </tr>
      ${data.resourcing?.toggleRovUse === 'true' ? `<tr><td style="border:none;">ROV Unit:</td><td>${escapeHtml(data.resourcing.rovDetails || '-')}</td></tr>` : ''}
      ${data.inspector?.name ? `<tr><td style="border:none;">Inspector:</td><td>${escapeHtml(data.inspector.name)}</td></tr>` : ''}
      ${data.divers?.length > 0 ? `<tr><td style="border:none;">Divers:</td><td>${data.divers.map(d => escapeHtml(d.diverName)).join(', ')}</td></tr>` : ''}
    </table>
  </div>

  <!-- OVERVIEW -->
  ${data.report?.overview ? `
  <div class="page">
    <h4>2. OVERVIEW</h4>
    ${data.report.overview}
  </div>
  ` : ''}

  <!-- METHODOLOGY -->
  ${data.report?.methodology ? `
  <div class="page">
    <h4>3. METHODOLOGY</h4>
    ${data.report.methodology}
  </div>
  ` : ''}

  <!-- REFERENCE TABLES -->
  <div class="page">
    <h4>4. REFERENCE TABLES</h4>
    <p>The below tables are referenced throughout the report to formally standardise both biofouling and antifouling condition ratings referred to herein.</p>
    
    <h4>4.1 ${isNZCRMS ? 'LEVEL OF FOULING (LOF) SCALE' : 'FOULING RATINGS (FR) SCALE'}</h4>
    ${isNZCRMS ? generateLOFTable() : generateFRScaleTable()}
  </div>

  <div class="page">
    <h4>4.2 PAINT DETERIORATION RATING (PDR) SCALE</h4>
    ${generatePDRTable()}
  </div>

  <!-- GENERAL ARRANGEMENT -->
  <div class="page">
    <h4>5. GENERAL ARRANGEMENT</h4>
    <p>The following sections detail the observations and findings for each inspected area of the vessel's underwater hull and appendages.</p>
  </div>

  ${gaSections}

  <!-- RECOMMENDATIONS -->
  ${data.report?.recommendations ? `
  <div class="page">
    <h4>6. RECOMMENDATIONS</h4>
    ${data.report.recommendations}
  </div>
  ` : ''}

  <!-- DECLARATIONS -->
  <div class="page">
    ${data.diveSupervisor?.declaration ? `
    <div class="declaration-box">
      <h5>Supervisor Declaration</h5>
      ${data.diveSupervisor.declaration}
      <p><strong>Signed:</strong> ___________________</p>
      <p><strong>Date:</strong> ${inspectionDate}</p>
    </div>
    ` : ''}

    ${data.ims?.declaration ? `
    <div class="declaration-box">
      <h5>IMS Declaration</h5>
      ${data.ims.declaration}
      <p><strong>Signed:</strong> ___________________</p>
      <p><strong>Date:</strong> ${inspectionDate}</p>
    </div>
    ` : ''}

    <h2 class="end-report">END OF REPORT</h2>
  </div>

  <!-- DOCUMENT STATUS -->
  <div class="page">
    <table class="doc-status">
      <tr><th colspan="3">Document Status</th></tr>
      <tr>
        <td><strong>Revision:</strong> ${escapeHtml(docStatus.revision || '1')}</td>
        <td><strong>Document Owner:</strong> Adam Falconer-West</td>
        <td><strong>Document Number:</strong> ${escapeHtml(docStatus.documentNumber || '-')}</td>
      </tr>
      <tr style="background:#eee;"><td><strong>Action</strong></td><td><strong>Name and Position</strong></td><td><strong>Date</strong></td></tr>
      <tr><td>Prepared By</td><td>${escapeHtml(docStatus.preparedBy || '-')}</td><td>${inspectionDate}</td></tr>
      <tr><td>Reviewed By</td><td>${escapeHtml(data.invites?.reviewerName || '-')}</td><td>${reviewDate}</td></tr>
      <tr><td>Approved By</td><td>${escapeHtml(docStatus.approvedBy || '-')}</td><td>${reviewDate}</td></tr>
    </table>

    <div class="copyright">
      <div class="copyright-header">Copyright Notice</div>
      <p><strong>Franmarine Underwater Services Pty Ltd (FUS)</strong> is the sole owner of the intellectual property contained in any documentation bearing its name. All materials, including internet pages, document and online graphics, audio and video, are protected by copyright law.</p>
      <p>Apart from any fair dealing for the purpose of private study, research, criticism or review as permitted under the provisions of the <strong>Copyright Act 1968</strong>, no part of this document may be reproduced, transmitted in any form or re-used for any commercial purposes whatsoever without the prior written permission of FUS.</p>
      <p>This document represents the status of the topic at the date shown and is subject to change without notice. The latest version of this document is available from Document Control.</p>
      <p><strong>©${new Date().getFullYear()} FUS. All Rights Reserved.</strong></p>
    </div>
  </div>

</body>
</html>`;
}

// Generate FR Rating table for GA components
function generateFRTable(frData, isNZCRMS) {
  if (!frData || frData.length === 0) return '';
  
  const headers = isNZCRMS 
    ? '<th>Description</th><th>Level of Fouling (LOF)</th><th>PDR Rating</th><th>Comments</th>'
    : '<th>Description</th><th>Fouling Rating (Type)</th><th>Fouling Coverage</th><th>PDR Rating</th><th>Comments</th>';
  
  const rows = frData.map(row => {
    if (isNZCRMS) {
      return `<tr>
        <td>${escapeHtml(row.description || '-')}</td>
        <td>${escapeHtml(row.levelOfFoulingLoF || '-')}</td>
        <td>${escapeHtml(row.pdrRating || '-')}</td>
        <td>${escapeHtml(row.Comments || '-')}</td>
      </tr>`;
    } else {
      return `<tr>
        <td>${escapeHtml(row.description || '-')}</td>
        <td>${escapeHtml(row.foulingRatingType || '-')}</td>
        <td>${escapeHtml(row.foulingCoverage || '-')}</td>
        <td>${escapeHtml(row.pdrRating || '-')}</td>
        <td>${escapeHtml(row.Comments || '-')}</td>
      </tr>`;
    }
  }).join('');
  
  return `<table class="fr-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

// Generate FR Scale reference table
function generateFRScaleTable() {
  return `<table class="rating-scale">
    <tr><th>FOULING RATING</th><th>DESCRIPTION</th></tr>
    <tr><td>FR: 0</td><td>SOFT - A clean, foul-free surface; red and/or black AF paint or a bare metal surface.</td></tr>
    <tr><td>FR: 10</td><td>SOFT - Light shades of red and green (incipient slime). Bare metal and painted surfaces are visible beneath the fouling.</td></tr>
    <tr><td>FR: 20</td><td>SOFT - Slime as dark green patches with yellow or brown colored areas (advanced slime). Bare metal and painted surfaces may be obscured by the fouling.</td></tr>
    <tr><td>FR: 30</td><td>SOFT - Grass as filaments up to 3 inches (76 mm) in length, projections up to 1/4 inch (6.4 mm) in height; or a flat network of filaments, green, yellow, or brown in color; or soft non calcareous fouling such as sea cucumbers, sea grapes, or sea squirts projecting up to 1/4 inch (6.4 mm) in height.</td></tr>
    <tr><td>FR: 40</td><td>HARD - Calcareous fouling in the form of tubeworms less than 1/4 inch in diameter or height.</td></tr>
    <tr><td>FR: 50</td><td>HARD - Calcareous fouling in the form of barnacles less than 1/4 inch in diameter or height.</td></tr>
    <tr><td>FR: 60</td><td>HARD - Combination of tubeworms and barnacles, less than 1/4 inch (6.4 mm) in diameter or height.</td></tr>
    <tr><td>FR: 70</td><td>HARD - Combination of tubeworms and barnacles, greater than 1/4 inch in diameter or height.</td></tr>
    <tr><td>FR: 80</td><td>HARD - Tubeworms closely packed together and growing upright away from surface. Barnacles growing one on top of another, 1/4 inch or less in height. Calcareous shells appear clean or white in colour.</td></tr>
    <tr><td>FR: 90</td><td>HARD - Dense growth of tubeworms with barnacles, 1/4 inch or greater in height; Calcareous shells brown in colour (oysters and mussels); or with slime or grass overlay.</td></tr>
    <tr><td>FR: 100</td><td>COMPOSITE - All forms of fouling present, Soft and Hard, particularly soft sedentary animals without calcareous covering (tunicates) growing over various forms of hard growth.</td></tr>
  </table>`;
}

// Generate LOF Scale reference table (NZ CRMS)
function generateLOFTable() {
  return `<table class="rating-scale">
    <tr><th>LEVEL OF FOULING</th><th>DESCRIPTION</th></tr>
    <tr><td>Rank: 0</td><td>0% No slime layer. No macrofouling. Only clean surfaces.</td></tr>
    <tr><td>Rank: 1</td><td>0% Slime Layer on some or all surfaces. No macrofouling.</td></tr>
    <tr><td>Rank: 2</td><td>1-5% of visible surfaces - Macrofouling present in small patches or a few isolated individuals or small colonies.</td></tr>
    <tr><td>Rank: 3</td><td>6-15% of visible surfaces - Considerable macrofouling on surfaces.</td></tr>
    <tr><td>Rank: 4</td><td>16-40% of visible surfaces - Extensive macrofouling present but more than half of surfaces without biofouling.</td></tr>
    <tr><td>Rank: 5</td><td>41-100% of visible surfaces - Very heavy macrofouling present covering substantial portions of visible surfaces.</td></tr>
  </table>`;
}

// Generate PDR Scale reference table
function generatePDRTable() {
  return `<table class="rating-scale">
    <tr><th>RATING</th><th>DESCRIPTION</th></tr>
    <tr><td>PDR: 0</td><td>No anti-foul (AF) coating applied.</td></tr>
    <tr><td>PDR: 10</td><td>Anti-Foul (AF) Paint intact.</td></tr>
    <tr><td>PDR: 20</td><td>AF paint missing from edges, corners, seams, welds, rivet, or bolt heads to expose anti corrosion (AC) paint. (undercoat).</td></tr>
    <tr><td>PDR: 30</td><td>AF paint missing from slightly curved or flat areas to expose underlying AC paint; An AF paint with visible brush swirl marks within the outermost layer – not extending into underlying layers of paint.</td></tr>
    <tr><td>PDR: 40</td><td>AF paint missing from intact blisters to expose AC paint or an AF coating with visible brush swirl marks exposing the next underlying layer of AF or AC paint.</td></tr>
    <tr><td>PDR: 50</td><td>AF blisters ruptured to expose intact AC paint.</td></tr>
    <tr><td>PDR: 60</td><td>AF/AC paint missing or peeling to expose steel substrate, no corrosion present.</td></tr>
    <tr><td>PDR: 70</td><td>AF/AC paint removed from edges, corners, seams, welds, rivet or bolt heads to expose steel substrate with corrosion present.</td></tr>
    <tr><td>PDR: 80</td><td>Ruptured AF/AC blisters on slightly curved or flat surfaces with corrosion or corrosion stains present.</td></tr>
    <tr><td>PDR: 90</td><td>Area corrosion of steel substrate with no AF/AC paint cover due to peeling or abrasion damage.</td></tr>
    <tr><td>PDR: 100</td><td>Area corrosion showing visible surface evidence of pitting, scaling, and roughening of steel substrate.</td></tr>
  </table>`;
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

function collectFormData(includeDefaults = false) {
  const vessel = state.vesselDetails || state.selectedVessel || {};
  const selected = state.selectedVessel || {};
  
  // Helper to get value from multiple sources
  const getVal = (key) => vessel[key] || vessel.data?.[key] || selected[key] || '';
  
  // Helper to get value with default fallback
  const getWithDefault = (value, defaultValue) => {
    if (includeDefaults && (!value || value.trim() === '')) {
      return defaultValue;
    }
    return value || '';
  };
  
  // Get vessel name (with default if includeDefaults and no vessel selected)
  const vesselName = getVal('displayName') || getVal('name') || (includeDefaults ? 'Vessel Name' : 'Unknown Vessel');
  const vesselId = vessel.id || selected.id || '';
  
  // Get job type name (not the object) - with default if needed
  const jobTypeName = state.selectedJobType?.name || state.selectedJobType?.displayName || (includeDefaults ? 'Biofouling Inspection' : 'Job');
  const jobTypeId = state.selectedJobType?.id || '';
  
  // Get the vessel's GA structure
  const vesselGA = vessel.generalArrangement || vessel.data?.generalArrangement || [];
  console.log('📋 Vessel GA structure:', vesselGA);
  
  // Get inspection type to determine rating scale
  const inspectionType = document.getElementById('inspection-type')?.value || 'Australian Biofouling Inspection';
  const isNZCRMS = inspectionType === 'NZ CRMS Biofouling Inspection';
  
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
    
    // Build frRatingData array (HBS template expects array with objects)
    const frRatingData = [];
    if (foulingRating || foulingCoverage || pdrRating || comments) {
      const ratingEntry = {
        description: name,
        pdrRating: pdrRating,
        Comments: comments
      };
      
      // Add the appropriate rating field based on inspection type
      if (isNZCRMS) {
        ratingEntry.levelOfFoulingLoF = foulingRating;
      } else {
        ratingEntry.foulingRatingType = foulingRating;
        ratingEntry.foulingCoverage = foulingCoverage;
      }
      
      frRatingData.push(ratingEntry);
    }
    
    // Get default comment if includeDefaults is true and no comment provided
    const diverComments = comments 
      ? `<p>${comments}</p>` 
      : (includeDefaults && (foulingRating || pdrRating) 
          ? `<p>${defaultReportText.diverComments(name)}</p>` 
          : (originalGA.diverSupervisorComments || ''));
    
    // Include ALL components with merged data
    generalArrangement.push({
      id: id,
      name: name,
      // Include original GA data
      ...originalGA,
      // Override with user input (FR Rating data as array for HBS template)
      frRatingData: frRatingData.length > 0 ? frRatingData : (originalGA.frRatingData || []),
      // User comments (HTML formatted for HBS template)
      diverSupervisorComments: diverComments,
      expertInspectorComments: originalGA.expertInspectorComments || '',
      // Mark inspection status
      inspected: !!(foulingRating || foulingCoverage || pdrRating || comments)
    });
  });
  
  // If no GA components were rendered (user didn't go to that step), use vessel's GA
  const finalGA = generalArrangement.length > 0 ? generalArrangement : vesselGA;
  console.log(`📋 Final GA: ${finalGA.length} components`);

  // Get all form values (with defaults where appropriate)
  const todayDate = new Date().toISOString().split('T')[0];
  const jobNumber = getWithDefault(
    document.getElementById('job-number')?.value,
    `RPT-${Date.now().toString().slice(-6)}`
  );
  const workInstructionRef = document.getElementById('work-instruction-ref')?.value || '';
  const clientName = getWithDefault(
    document.getElementById('client-name')?.value,
    'Client Name Not Specified'
  );
  const clientRep = document.getElementById('client-rep')?.value || '';
  const location = getWithDefault(
    document.getElementById('location')?.value,
    'Location Not Specified'
  );
  const berthLocation = getWithDefault(
    document.getElementById('berth-location')?.value,
    'Berth/anchorage location not specified'
  );
  const scheduledDate = document.getElementById('scheduled-date')?.value || todayDate;
  const visibility = getWithDefault(
    document.getElementById('visibility')?.value,
    'Good - 3-5m'
  );
  const confidential = document.getElementById('confidential')?.value || '';
  const supportingWork = getWithDefault(
    document.getElementById('supporting-work')?.value,
    `${jobTypeName} Report`
  );
  const rovUsed = document.getElementById('rov-used')?.value || 'false';
  const rovDetails = document.getElementById('rov-details')?.value || '';
  
  // Vessel details for report
  const vesselCommissioned = document.getElementById('vessel-commissioned')?.value || getVal('commissioned') || '';
  const vesselGrossTonnage = document.getElementById('vessel-gross-tonnage')?.value || getVal('grossTonnage') || '';
  const vesselLength = document.getElementById('vessel-length')?.value || getVal('length') || '';
  const vesselBeam = document.getElementById('vessel-beam')?.value || getVal('beam') || '';
  const vesselDraft = document.getElementById('vessel-draft')?.value || getVal('vesselDraft') || getVal('draft') || '';
  
  // Team members (with defaults if includeDefaults)
  const supervisorName = getWithDefault(
    document.getElementById('supervisor-name')?.value,
    'Dive Supervisor'
  );
  const inspectorName = getWithDefault(
    document.getElementById('inspector-name')?.value,
    'Inspector'
  );
  const repairAgentName = document.getElementById('repair-agent-name')?.value || '';
  
  // Divers
  const divers = [];
  for (let i = 1; i <= 4; i++) {
    const diverName = document.getElementById(`diver-${i}`)?.value || '';
    if (diverName) {
      divers.push({ diverName });
    }
  }
  
  // Document control (with defaults if includeDefaults)
  const preparedBy = getWithDefault(
    document.getElementById('prepared-by')?.value,
    supervisorName || 'Report Author'
  );
  const reviewedBy = getWithDefault(
    document.getElementById('reviewed-by')?.value,
    'Technical Reviewer'
  );
  const approvedBy = getWithDefault(
    document.getElementById('approved-by')?.value,
    'Operations Manager'
  );
  const revisionNumber = document.getElementById('revision-number')?.value || '1';
  const reviewDate = document.getElementById('review-date')?.value || scheduledDate;
  const approvalDate = document.getElementById('approval-date')?.value || scheduledDate;
  
  // Report content (with defaults if includeDefaults is true)
  const reportSummary = getWithDefault(
    document.getElementById('report-summary')?.value,
    defaultReportText.summary
  );
  const reportOverview = getWithDefault(
    document.getElementById('report-overview')?.value,
    defaultReportText.overview
  );
  const reportMethodology = getWithDefault(
    document.getElementById('report-methodology')?.value,
    defaultReportText.methodology
  );
  const reportRecommendations = getWithDefault(
    document.getElementById('report-recommendations')?.value,
    defaultReportText.recommendations
  );
  
  // Declarations (with defaults if includeDefaults is true)
  const supervisorDeclaration = getWithDefault(
    document.getElementById('supervisor-declaration')?.value,
    defaultReportText.supervisorDeclaration
  );
  const imsDeclaration = getWithDefault(
    document.getElementById('ims-declaration')?.value,
    defaultReportText.imsDeclaration
  );
  const repairDeclaration = getWithDefault(
    document.getElementById('repair-declaration')?.value,
    defaultReportText.repairDeclaration
  );

  // Build display name as a simple string
  const displayName = `${jobTypeName} - ${vesselName}${jobNumber ? ` (${jobNumber})` : ''}`;

  // Build the complete data object matching HBS template expectations
  const workData = {
    // Job type and metadata
    jobType: jobTypeName,
    supportingWork: supportingWork,
    workInstruction: workInstructionRef,
    confidential: confidential,
    inspectionType: inspectionType,
    visibility: visibility,
    clientDetails: clientName,
    berthAnchorageLocation: berthLocation,
    
    // Vessel object (matching HBS template structure)
    vessel: {
      id: vesselId,
      displayName: getVal('displayName') || vesselName,
      name: vesselName,
      imo: getVal('imo'),
      mmsi: getVal('mmsi'),
      commissioned: vesselCommissioned,
      grossTonnage: vesselGrossTonnage,
      length: vesselLength,
      beam: vesselBeam,
      vesselDraft: vesselDraft,
      flag: getVal('flag'),
      class: getVal('class'),
      registry: getVal('registry'),
      pennant: getVal('pennant'),
      data: {
        name: vesselName,
        displayName: getVal('displayName') || vesselName,
        imo: getVal('imo'),
        commissioned: vesselCommissioned,
        grossTonnage: vesselGrossTonnage,
        length: vesselLength,
        beam: vesselBeam,
        vesselDraft: vesselDraft,
        generalArrangement: finalGA
      }
    },
    
    // Location object
    location: {
      displayName: location,
      data: { displayName: location }
    },
    
    // Actual delivery date (inspection date)
    actualDelivery: {
      startDateTime: {
        date: scheduledDate ? new Date(scheduledDate).toISOString() : new Date().toISOString(),
        offset: new Date().getTimezoneOffset() * -1,
        ticks: Date.now().toString()
      }
    },
    
    // Team assignments (matching HBS template structure)
    supervisor: { name: supervisorName },
    inspector: { name: inspectorName },
    repairAgent: { name: repairAgentName },
    divers: divers,
    
    // ROV resourcing
    resourcing: {
      toggleRovUse: rovUsed,
      rovDetails: rovDetails
    },
    
    // Invites / Client info
    invites: {
      buyer: clientRep ? [{ name: clientRep }] : [],
      reviewerName: reviewedBy
    },
    
    // Report content (HTML formatted for HBS triple-mustache)
    report: {
      summary: reportSummary ? `<p>${reportSummary.replace(/\n/g, '</p><p>')}</p>` : '',
      overview: reportOverview ? `<p>${reportOverview.replace(/\n/g, '</p><p>')}</p>` : '',
      methodology: reportMethodology ? `<p>${reportMethodology.replace(/\n/g, '</p><p>')}</p>` : '',
      recommendations: reportRecommendations ? `<p>${reportRecommendations.replace(/\n/g, '</p><p>')}</p>` : ''
    },
    
    // Declarations with signature placeholders
    diveSupervisor: {
      declaration: supervisorDeclaration ? `<p>${supervisorDeclaration.replace(/\n/g, '</p><p>')}</p>` : '',
      signature: {
        signature: '', // Would be filled by signature pad
        mode: 'light',
        date: approvalDate ? new Date(approvalDate).toISOString() : ''
      }
    },
    ims: {
      declaration: imsDeclaration ? `<p>${imsDeclaration.replace(/\n/g, '</p><p>')}</p>` : '',
      signature: {
        signature: '',
        mode: 'light',
        date: approvalDate ? new Date(approvalDate).toISOString() : ''
      }
    },
    repair: {
      declaration: repairDeclaration ? `<p>${repairDeclaration.replace(/\n/g, '</p><p>')}</p>` : '',
      signature: {
        signature: '',
        mode: 'light',
        date: approvalDate ? new Date(approvalDate).toISOString() : ''
      }
    },
    
    // Document status
    document: {
      status: [{
        revision: revisionNumber,
        documentNumber: jobNumber,
        preparedBy: preparedBy,
        approvedBy: approvedBy,
        date: {
          date: approvalDate ? new Date(approvalDate).toISOString() : ''
        }
      }]
    },
    
    // Review date
    reviewDate: {
      date: reviewDate ? new Date(reviewDate).toISOString() : ''
    },
    
    // Toggle for photo names
    togglePhotoName: { checked: false },
    
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
    
    // Work data matching HBS template expectations
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
