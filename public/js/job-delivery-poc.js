/**
 * Job Delivery POC - MarineStream API Frontend
 * Minimal POC for creating and managing jobs via MarineStream APIs
 */

// State
const state = {
  authenticated: false,
  workTypes: [],
  assets: [],
  selectedWorkType: null,
  selectedAsset: null,
  selectedAssetDetails: null,
  token: null
};

// DOM Elements
const elements = {
  authDot: document.getElementById('auth-dot'),
  authStatusText: document.getElementById('auth-status-text'),
  authUserInfo: document.getElementById('auth-user-info'),
  authBtn: document.getElementById('auth-btn'),
  patBtn: document.getElementById('pat-btn'),
  debugBtn: document.getElementById('debug-btn'),
  debugOutput: document.getElementById('debug-output'),
  viewAssetsBtn: document.getElementById('view-assets-btn'),
  assetsTableContainer: document.getElementById('assets-table-container'),
  assetsGroupedView: document.getElementById('assets-grouped-view'),
  assetsCount: document.getElementById('assets-count'),
  logoutBtn: document.getElementById('logout-btn'),
  patSection: document.getElementById('pat-section'),
  patInput: document.getElementById('pat-input'),
  patSubmit: document.getElementById('pat-submit'),
  patCancel: document.getElementById('pat-cancel'),
  messages: document.getElementById('messages'),
  workTypesSection: document.getElementById('work-types-section'),
  workTypesGrid: document.getElementById('work-types-grid'),
  formSection: document.getElementById('form-section'),
  selectedWorkTypeName: document.getElementById('selected-work-type-name'),
  jobForm: document.getElementById('job-form'),
  jobName: document.getElementById('job-name'),
  assetListContainer: document.getElementById('asset-list-container'),
  assetSearch: document.getElementById('asset-search'),
  assetList: document.getElementById('asset-list'),
  selectedAssetInfo: document.getElementById('selected-asset-info'),
  gaFormContainer: document.getElementById('ga-form-container'),
  jobNotes: document.getElementById('job-notes'),
  cancelBtn: document.getElementById('cancel-btn'),
  submitBtn: document.getElementById('submit-btn'),
  resultSection: document.getElementById('result-section'),
  resultJson: document.getElementById('result-json')
};

/**
 * Initialize the POC
 */
async function init() {
  console.log('🚀 Job Delivery POC initializing...');
  
  // Setup event listeners
  setupEventListeners();
  
  // Check authentication
  await checkAuth();
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Auth button (OAuth)
  elements.authBtn.addEventListener('click', () => {
    if (window.MarineStreamAuth) {
      window.MarineStreamAuth.startLogin();
    }
  });
  
  // PAT button - show PAT input
  elements.patBtn.addEventListener('click', () => {
    elements.patSection.style.display = 'block';
    elements.patInput.focus();
  });
  
  // PAT submit
  elements.patSubmit.addEventListener('click', async () => {
    const pat = elements.patInput.value.trim();
    if (!pat) {
      showMessage('Please enter a PAT', 'error');
      return;
    }
    
    // Try to use the PAT
    if (window.MarineStreamAuth && window.MarineStreamAuth.setManualToken) {
      const success = window.MarineStreamAuth.setManualToken(pat);
      if (success) {
        state.token = pat;
        state.authenticated = true;
        elements.patSection.style.display = 'none';
        elements.patInput.value = '';
        updateAuthUI();
        showMessage('Authenticated with PAT', 'success');
        await loadWorkTypes();
        await loadAssets();
      } else {
        showMessage('Invalid PAT format', 'error');
      }
    } else {
      // Fallback: just store the token directly
      localStorage.setItem('marinestream_access_token', pat);
      localStorage.setItem('marinestream_pat', pat);
      state.token = pat;
      state.authenticated = true;
      elements.patSection.style.display = 'none';
      elements.patInput.value = '';
      updateAuthUI();
      showMessage('Authenticated with PAT', 'success');
      await loadWorkTypes();
      await loadAssets();
    }
  });
  
  // PAT cancel
  elements.patCancel.addEventListener('click', () => {
    elements.patSection.style.display = 'none';
    elements.patInput.value = '';
  });
  
  // PAT input - submit on Enter
  elements.patInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      elements.patSubmit.click();
    }
  });
  
  // Logout button
  elements.logoutBtn.addEventListener('click', async () => {
    if (window.MarineStreamAuth) {
      await window.MarineStreamAuth.logout(false);
    }
    // Also clear local storage
    localStorage.removeItem('marinestream_access_token');
    localStorage.removeItem('marinestream_pat');
    localStorage.removeItem('marinestream_refresh_token');
    localStorage.removeItem('marinestream_token_expiry');
    state.authenticated = false;
    state.token = null;
    updateAuthUI();
    hideWorkTypes();
    hideForm();
    showMessage('Logged out', 'info');
  });
  
  // Debug API button
  if (elements.debugBtn) {
    elements.debugBtn.addEventListener('click', async () => {
      await debugApiConnectivity();
    });
  }
  
  // View All Assets button
  if (elements.viewAssetsBtn) {
    elements.viewAssetsBtn.addEventListener('click', async () => {
      await viewAllAssets();
    });
  }
  
  // Cancel button
  elements.cancelBtn.addEventListener('click', () => {
    hideForm();
    clearForm();
  });
  
  // Asset search
  if (elements.assetSearch) {
    elements.assetSearch.addEventListener('input', debounce((e) => {
      renderAssetList(e.target.value);
    }, 200));
  }
  
  // Form submission
  elements.jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitJob();
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
 * Check authentication status
 */
async function checkAuth() {
  try {
    // Initialize OAuth and check for callback
    if (window.MarineStreamAuth) {
      const authResult = await window.MarineStreamAuth.initAuth();
      
      if (authResult.authenticated) {
        state.token = await window.MarineStreamAuth.getAccessToken();
        state.authenticated = !!state.token;
      }
    }
    
    // Also check for stored PAT as fallback
    if (!state.authenticated) {
      const storedPat = localStorage.getItem('marinestream_pat') || 
                        localStorage.getItem('marinestream_access_token');
      if (storedPat) {
        state.token = storedPat;
        state.authenticated = true;
      }
    }
    
    updateAuthUI();
    
    if (state.authenticated) {
      await loadWorkTypes();
      await loadAssets();
    }
  } catch (error) {
    console.error('Auth check failed:', error);
    showMessage('Authentication check failed: ' + error.message, 'error');
    updateAuthUI();
  }
}

/**
 * Update auth UI based on state
 */
function updateAuthUI() {
  if (state.authenticated) {
    elements.authDot.classList.add('authenticated');
    elements.authStatusText.textContent = 'Authenticated';
    elements.authBtn.style.display = 'none';
    elements.patBtn.style.display = 'none';
    elements.logoutBtn.style.display = 'inline-flex';
    elements.patSection.style.display = 'none';
    if (elements.debugBtn) elements.debugBtn.style.display = 'inline-flex';
    if (elements.viewAssetsBtn) elements.viewAssetsBtn.style.display = 'inline-flex';
    
    // Show user info if available
    const userInfo = window.MarineStreamAuth?.getUserInfo?.();
    if (userInfo) {
      elements.authUserInfo.textContent = userInfo.email || userInfo.name || '';
    }
    
    // Show token expiry info
    const expiryInfo = window.MarineStreamAuth?.getTokenExpiryInfo?.();
    if (expiryInfo && expiryInfo.remainingMinutes > 0) {
      elements.authUserInfo.textContent += ` (Token expires in ${expiryInfo.remainingMinutes} min)`;
    }
  } else {
    elements.authDot.classList.remove('authenticated');
    elements.authStatusText.textContent = 'Not authenticated';
    elements.authUserInfo.textContent = '';
    elements.authBtn.style.display = 'inline-flex';
    elements.patBtn.style.display = 'inline-flex';
    elements.logoutBtn.style.display = 'none';
    if (elements.debugBtn) elements.debugBtn.style.display = 'none';
    if (elements.debugOutput) elements.debugOutput.style.display = 'none';
    if (elements.viewAssetsBtn) elements.viewAssetsBtn.style.display = 'none';
    if (elements.assetsTableContainer) elements.assetsTableContainer.style.display = 'none';
  }
}

/**
 * Debug API connectivity - test which endpoints work
 */
async function debugApiConnectivity() {
  console.log('🔧 Running API debug...');
  
  if (!elements.debugOutput) return;
  
  elements.debugOutput.style.display = 'block';
  elements.debugOutput.textContent = 'Testing API connectivity...\n\n';
  
  try {
    const token = await getToken();
    
    elements.debugOutput.textContent += `Token: ${token.substring(0, 40)}...\n\n`;
    
    const response = await fetch('/api/marinestream/debug/api', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      elements.debugOutput.textContent += `Server returned non-JSON response (${response.status}):\n${text.substring(0, 500)}...\n`;
      elements.debugOutput.textContent += '\nTip: Try restarting the server to pick up new routes.\n';
      return;
    }
    
    const result = await response.json();
    
    if (result.success) {
      elements.debugOutput.textContent += `API Base: ${result.data.apiBase}\n`;
      elements.debugOutput.textContent += `Endpoints Tested: ${result.data.totalEndpoints}\n`;
      elements.debugOutput.textContent += `Successful: ${result.data.successfulEndpoints}\n\n`;
      
      // Token info
      if (result.data.tokenInfo) {
        elements.debugOutput.textContent += '--- TOKEN INFO ---\n';
        elements.debugOutput.textContent += `Issuer: ${result.data.tokenInfo.issuer || 'unknown'}\n`;
        elements.debugOutput.textContent += `Email: ${result.data.tokenInfo.email || 'unknown'}\n`;
        elements.debugOutput.textContent += `Expiration: ${result.data.tokenInfo.expiration || 'unknown'}\n`;
        elements.debugOutput.textContent += `Is Expired: ${result.data.tokenInfo.isExpired}\n`;
        elements.debugOutput.textContent += `Scopes: ${JSON.stringify(result.data.tokenInfo.scope) || 'unknown'}\n\n`;
      }
      
      // Results
      elements.debugOutput.textContent += '--- ENDPOINT RESULTS ---\n';
      for (const [endpoint, info] of Object.entries(result.data.results)) {
        const status = info.success ? '✅' : '❌';
        elements.debugOutput.textContent += `${status} ${endpoint}: ${info.status}\n`;
        if (!info.success && info.bodyPreview) {
          elements.debugOutput.textContent += `   Preview: ${info.bodyPreview.substring(0, 100)}\n`;
        }
      }
    } else {
      elements.debugOutput.textContent += `Error: ${result.error?.message || 'Unknown error'}\n`;
    }
  } catch (error) {
    console.error('Debug failed:', error);
    elements.debugOutput.textContent += `Error: ${error.message}\n`;
  }
}

/**
 * View all assets grouped by type - for debugging
 */
async function viewAllAssets() {
  console.log('📋 Loading all assets for debug view...');
  
  if (!elements.assetsTableContainer || !elements.assetsGroupedView) return;
  
  // Toggle visibility
  if (elements.assetsTableContainer.style.display === 'block') {
    elements.assetsTableContainer.style.display = 'none';
    return;
  }
  
  elements.assetsTableContainer.style.display = 'block';
  elements.assetsGroupedView.innerHTML = '<div style="padding: 20px; text-align: center;">Loading assets...</div>';
  
  try {
    const token = await getToken();
    
    // Fetch assets from our endpoint
    const response = await fetch('/api/marinestream/assets', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const result = await response.json();
    
    if (result.success && result.data) {
      const assets = result.data.assets || [];
      
      // Update count
      if (elements.assetsCount) {
        elements.assetsCount.textContent = `(${assets.length} found)`;
      }
      
      if (assets.length === 0) {
        elements.assetsGroupedView.innerHTML = '<div style="padding: 20px; text-align: center;">No assets found</div>';
        return;
      }
      
      // Group assets by asset type (RAN Vessels, Commercial Vessels)
      // Also track work types for each asset
      const assetWorkTypes = {}; // assetName -> Set of work types
      const groups = {};
      
      assets.forEach(asset => {
        const assetType = getAssetType(asset.flowType || asset.registry || 'unknown');
        const workType = getWorkType(asset.flowType || asset.registry || '');
        const assetKey = (asset.name || '').toLowerCase();
        
        // Track work types for this asset
        if (!assetWorkTypes[assetKey]) {
          assetWorkTypes[assetKey] = new Set();
        }
        if (workType) {
          assetWorkTypes[assetKey].add(workType);
        }
        
        // Add to group (deduplicate by name within group)
        if (!groups[assetType]) {
          groups[assetType] = new Map();
        }
        
        // Only add if not already in this group (dedupe by name)
        if (!groups[assetType].has(assetKey)) {
          groups[assetType].set(assetKey, asset);
        }
      });
      
      // Convert Maps to arrays and add work types info
      const sortedGroupNames = Object.keys(groups).sort((a, b) => {
        // Put RAN Vessels first, then Commercial Vessels, then Other
        const order = { 'RAN Vessels': 1, 'Commercial Vessels': 2, 'Other Sources': 3, 'Other': 4, 'Unknown': 5 };
        return (order[a] || 99) - (order[b] || 99);
      });
      
      sortedGroupNames.forEach(groupName => {
        const assetsMap = groups[groupName];
        const assetsArray = Array.from(assetsMap.values());
        assetsArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        
        // Add work types to each asset
        assetsArray.forEach(asset => {
          const assetKey = (asset.name || '').toLowerCase();
          asset.workTypes = assetWorkTypes[assetKey] ? Array.from(assetWorkTypes[assetKey]) : [];
        });
        
        groups[groupName] = assetsArray;
      });
      
      // Build grouped HTML
      let html = '';
      let totalUniqueAssets = 0;
      
      sortedGroupNames.forEach(groupName => {
        const groupAssets = groups[groupName];
        totalUniqueAssets += groupAssets.length;
        const groupId = groupName.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
        
        html += `
          <div class="asset-group" id="group-${groupId}">
            <div class="asset-group-header" onclick="toggleAssetGroup('${groupId}')">
              <div class="asset-group-title">
                <svg class="chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
                ${groupName}
              </div>
              <span class="asset-group-count">${groupAssets.length} vessels</span>
            </div>
            <div class="asset-group-content">
              <table>
                <thead>
                  <tr>
                    <th style="width: 40px;">#</th>
                    <th>Vessel Name</th>
                    <th style="width: 150px;">Work Types</th>
                    <th style="width: 100px;">MMSI</th>
                    <th style="width: 100px;">IMO</th>
                    <th style="width: 70px;">Has GA</th>
                  </tr>
                </thead>
                <tbody>
        `;
        
        groupAssets.forEach((asset, index) => {
          const workTypeBadges = (asset.workTypes || []).map(wt => {
            const color = wt === 'Biofouling' ? '#3b82f6' : wt === 'Engineering' ? '#8b5cf6' : '#6b7280';
            return `<span style="display: inline-block; padding: 2px 6px; margin: 1px; font-size: 10px; background: ${color}; color: white; border-radius: 4px;">${wt}</span>`;
          }).join('');
          
          html += `
            <tr>
              <td>${index + 1}</td>
              <td class="asset-name">${asset.name || asset.displayName || 'Unknown'}</td>
              <td>${workTypeBadges || '<span style="color: var(--text-secondary);">-</span>'}</td>
              <td class="asset-meta">${asset.mmsi || '-'}</td>
              <td class="asset-meta">${asset.imo || '-'}</td>
              <td>${asset.hasGeneralArrangement ? '✅' : '❌'}</td>
            </tr>
          `;
        });
        
        html += `
                </tbody>
              </table>
            </div>
          </div>
        `;
      });
      
      // Update total count to reflect unique assets
      if (elements.assetsCount) {
        elements.assetsCount.textContent = `(${totalUniqueAssets} unique vessels)`;
      }
      
      elements.assetsGroupedView.innerHTML = html;
      
      // Also log summary to console
      console.log(`📋 Assets loaded: ${assets.length}`);
      console.log('   Source:', result.data.source || 'unknown');
      console.log('   By type:', Object.fromEntries(sortedGroupNames.map(g => [g, groups[g].length])));
      
    } else {
      elements.assetsGroupedView.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--color-error);">Error: ${result.error?.message || 'Unknown error'}</div>`;
    }
  } catch (error) {
    console.error('Failed to load assets:', error);
    elements.assetsGroupedView.innerHTML = `<div style="padding: 20px; text-align: center; color: var(--color-error);">Error: ${error.message}</div>`;
  }
}

/**
 * Get asset type (RAN Vessels or Commercial Vessels)
 */
function getAssetType(flowType) {
  if (!flowType) return 'Unknown';
  
  const ft = flowType.toLowerCase();
  
  // RAN Vessels
  if (ft.includes('ranvessel') || ft.includes('ran')) {
    return 'RAN Vessels';
  }
  
  // Commercial Vessels
  if (ft.includes('vessel') || ft.includes('commercial')) {
    return 'Commercial Vessels';
  }
  
  // Other sources
  if (ft.includes('graphql')) return 'Other Sources';
  if (ft.includes('flow-')) return 'Other Sources';
  if (ft.includes('work-')) return 'Other Sources';
  
  return 'Other';
}

/**
 * Get work type from flowType (biofouling, engineering, assets)
 */
function getWorkType(flowType) {
  if (!flowType) return '';
  
  const ft = flowType.toLowerCase();
  
  if (ft.includes('biofouling')) return 'Biofouling';
  if (ft.includes('inspection') || ft.includes('engineering')) return 'Engineering';
  if (ft.includes('assets')) return 'Assets';
  
  return '';
}

/**
 * Toggle asset group expand/collapse
 */
window.toggleAssetGroup = function(groupId) {
  const group = document.getElementById(`group-${groupId}`);
  if (group) {
    group.classList.toggle('collapsed');
  }
};

/**
 * Load work types (flow origins) from API
 */
async function loadWorkTypes() {
  try {
    showMessage('Loading work types...', 'info');
    
    const token = await getToken();
    const response = await fetch('/api/marinestream/flow-origins', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch work types: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      state.workTypes = result.data;
      renderWorkTypes();
      showWorkTypesSection();
      clearMessages();
    } else {
      throw new Error(result.error?.message || 'Failed to load work types');
    }
  } catch (error) {
    console.error('Failed to load work types:', error);
    showMessage('Failed to load work types: ' + error.message, 'error');
    elements.workTypesGrid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>Failed to load work types</p>
      </div>
    `;
  }
}

/**
 * Load assets (vessels) from API
 */
async function loadAssets() {
  try {
    console.log('🔍 Loading assets...');
    
    // Show loading state
    if (elements.assetList) {
      elements.assetList.innerHTML = `
        <div class="asset-empty">
          <span class="loading-spinner"></span> Loading assets from MarineStream...
        </div>
      `;
    }
    
    const token = await getToken();
    const response = await fetch('/api/marinestream/assets', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      console.warn('Failed to fetch assets:', response.status);
      const errorText = await response.text();
      console.warn('Error response:', errorText);
      if (elements.assetList) {
        elements.assetList.innerHTML = `
          <div class="asset-empty">
            <p>Failed to load assets (${response.status})</p>
          </div>
        `;
      }
      return;
    }
    
    const result = await response.json();
    console.log('📦 Assets API response:', result);
    
    if (result.success && result.data) {
      state.assets = result.data.assets || result.data || [];
      console.log(`✅ Loaded ${state.assets.length} assets`);
      
      // Sort assets by name
      state.assets.sort((a, b) => {
        const nameA = (a.name || a.displayName || '').toLowerCase();
        const nameB = (b.name || b.displayName || '').toLowerCase();
        return nameA.localeCompare(nameB);
      });
      
      renderAssetList();
      
      if (state.assets.length === 0) {
        console.warn('⚠️ No assets returned from API');
        if (elements.assetList) {
          elements.assetList.innerHTML = `
            <div class="asset-empty">
              <p>No assets found in MarineStream registries</p>
            </div>
          `;
        }
      }
    } else {
      console.warn('⚠️ API returned success=false or no data:', result);
      if (elements.assetList) {
        elements.assetList.innerHTML = `
          <div class="asset-empty">
            <p>No assets available: ${result.error?.message || 'Unknown error'}</p>
          </div>
        `;
      }
    }
  } catch (error) {
    console.error('Failed to load assets:', error);
    if (elements.assetList) {
      elements.assetList.innerHTML = `
        <div class="asset-empty">
          <p>Error loading assets: ${error.message}</p>
        </div>
      `;
    }
  }
}

/**
 * Render asset list with metadata
 */
function renderAssetList(filter = '') {
  if (!elements.assetList) {
    console.warn('Asset list element not found');
    return;
  }
  
  console.log(`🎨 Rendering asset list with ${state.assets?.length || 0} assets, filter: "${filter}"`);
  
  elements.assetList.innerHTML = '';
  
  if (!state.assets || state.assets.length === 0) {
    elements.assetList.innerHTML = `
      <div class="asset-empty">
        <p>No assets loaded yet</p>
      </div>
    `;
    return;
  }
  
  const filterLower = filter.toLowerCase();
  const filteredAssets = state.assets.filter(asset => {
    if (!filter) return true;
    const name = (asset.name || asset.displayName || '').toLowerCase();
    const mmsi = (asset.mmsi || '').toString().toLowerCase();
    const imo = (asset.imo || '').toString().toLowerCase();
    const pennant = (asset.pennant || '').toString().toLowerCase();
    const registry = (asset.registry || '').toLowerCase();
    return name.includes(filterLower) || 
           mmsi.includes(filterLower) || 
           imo.includes(filterLower) ||
           pennant.includes(filterLower) ||
           registry.includes(filterLower);
  });
  
  console.log(`📋 Filtered to ${filteredAssets.length} assets`);
  
  if (filteredAssets.length === 0) {
    elements.assetList.innerHTML = `
      <div class="asset-empty">
        <p>No assets found${filter ? ' matching "' + escapeHtml(filter) + '"' : ''}</p>
      </div>
    `;
    return;
  }
  
  filteredAssets.forEach(asset => {
    const assetItem = document.createElement('div');
    assetItem.className = 'asset-item';
    assetItem.dataset.id = asset.id;
    
    if (state.selectedAsset && state.selectedAsset.id === asset.id) {
      assetItem.classList.add('selected');
    }
    
    // Build metadata tags
    const tags = [];
    if (asset.registry) tags.push(`<span class="asset-tag asset-tag-registry">${escapeHtml(asset.registry)}</span>`);
    if (asset.class) tags.push(`<span class="asset-tag">${escapeHtml(asset.class)}</span>`);
    if (asset.flag) tags.push(`<span class="asset-tag">${escapeHtml(asset.flag)}</span>`);
    
    assetItem.innerHTML = `
      <div class="asset-item-main">
        <div class="asset-item-name">${escapeHtml(asset.name || asset.displayName || 'Unknown')}</div>
        <div class="asset-item-tags">${tags.join('')}</div>
      </div>
      <div class="asset-item-meta">
        ${asset.mmsi ? `<span class="asset-meta-item"><strong>MMSI:</strong> ${escapeHtml(asset.mmsi)}</span>` : ''}
        ${asset.imo ? `<span class="asset-meta-item"><strong>IMO:</strong> ${escapeHtml(asset.imo)}</span>` : ''}
        ${asset.pennant ? `<span class="asset-meta-item"><strong>Pennant:</strong> ${escapeHtml(asset.pennant)}</span>` : ''}
      </div>
    `;
    
    assetItem.addEventListener('click', () => selectAsset(asset));
    elements.assetList.appendChild(assetItem);
  });
}

/**
 * Select an asset and load its details
 */
async function selectAsset(asset) {
  state.selectedAsset = asset;
  
  // Update visual selection
  document.querySelectorAll('.asset-item').forEach(item => {
    item.classList.remove('selected');
    if (item.dataset.id === asset.id) {
      item.classList.add('selected');
    }
  });
  
  // Show loading in selected asset info
  if (elements.selectedAssetInfo) {
    elements.selectedAssetInfo.innerHTML = `
      <div class="selected-asset-loading">
        <span class="loading-spinner"></span> Loading asset details...
      </div>
    `;
    elements.selectedAssetInfo.style.display = 'block';
  }
  
  // Fetch asset details with GA
  try {
    const token = await getToken();
    const response = await fetch(`/api/marinestream/asset/${asset.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to fetch asset details: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data) {
      state.selectedAssetDetails = result.data;
      renderSelectedAssetInfo(result.data);
      renderGAForm(result.data.generalArrangement);
    } else {
      throw new Error(result.error?.message || 'Failed to load asset details');
    }
  } catch (error) {
    console.error('Failed to load asset details:', error);
    if (elements.selectedAssetInfo) {
      elements.selectedAssetInfo.innerHTML = `
        <div class="message message-error">Failed to load asset details: ${escapeHtml(error.message)}</div>
      `;
    }
    // Still show a default GA form
    renderGAForm(null);
  }
}

/**
 * Render selected asset info panel
 */
function renderSelectedAssetInfo(assetDetails) {
  if (!elements.selectedAssetInfo) return;
  
  const gaSource = assetDetails.generalArrangementSource;
  let gaSourceText = '';
  if (gaSource) {
    if (gaSource.type === 'default_template') {
      gaSourceText = '<span class="ga-source ga-source-default">Using default GA template</span>';
    } else if (gaSource.workCode) {
      gaSourceText = `<span class="ga-source ga-source-work">GA from: ${escapeHtml(gaSource.workCode)} (${new Date(gaSource.lastModified).toLocaleDateString()})</span>`;
    }
  }
  
  elements.selectedAssetInfo.innerHTML = `
    <div class="selected-asset-header">
      <h4>${escapeHtml(assetDetails.name)}</h4>
      ${gaSourceText}
    </div>
    <div class="selected-asset-details">
      ${assetDetails.vesselType ? `<span><strong>Type:</strong> ${escapeHtml(assetDetails.vesselType)}</span>` : ''}
      ${assetDetails.mmsi ? `<span><strong>MMSI:</strong> ${escapeHtml(assetDetails.mmsi)}</span>` : ''}
      ${assetDetails.imo ? `<span><strong>IMO:</strong> ${escapeHtml(assetDetails.imo)}</span>` : ''}
      ${assetDetails.pennant ? `<span><strong>Pennant:</strong> ${escapeHtml(assetDetails.pennant)}</span>` : ''}
      ${assetDetails.class ? `<span><strong>Class:</strong> ${escapeHtml(assetDetails.class)}</span>` : ''}
      ${assetDetails.flag ? `<span><strong>Flag:</strong> ${escapeHtml(assetDetails.flag)}</span>` : ''}
    </div>
  `;
  elements.selectedAssetInfo.style.display = 'block';
}

/**
 * Render General Arrangement form sections
 */
function renderGAForm(generalArrangement) {
  if (!elements.gaFormContainer) return;
  
  // Use default template if no GA provided
  const gaData = generalArrangement || getDefaultGATemplate();
  
  if (!gaData || gaData.length === 0) {
    elements.gaFormContainer.innerHTML = `
      <div class="ga-empty">
        <p>No General Arrangement components available for this asset.</p>
      </div>
    `;
    elements.gaFormContainer.style.display = 'block';
    return;
  }
  
  let html = `
    <div class="ga-header">
      <h4>General Arrangement Components (${gaData.length})</h4>
      <p class="ga-description">Describe the condition or findings for each hull zone/component:</p>
    </div>
    <div class="ga-components">
  `;
  
  gaData.forEach((component, index) => {
    const componentName = component.name || component.GAComponent || `Component ${index + 1}`;
    const componentDesc = component.description || '';
    const componentId = component.GAComponent || `ga_${index}`;
    
    html += `
      <div class="ga-component" data-index="${index}">
        <div class="ga-component-header">
          <span class="ga-component-number">${index + 1}</span>
          <span class="ga-component-name">${escapeHtml(componentName)}</span>
        </div>
        ${componentDesc ? `<p class="ga-component-desc">${escapeHtml(componentDesc)}</p>` : ''}
        <textarea 
          class="form-textarea ga-component-input" 
          name="ga_${componentId}" 
          data-component-id="${componentId}"
          data-component-name="${escapeHtml(componentName)}"
          placeholder="Describe the condition, fouling observed, or any findings for ${escapeHtml(componentName)}..."
        ></textarea>
      </div>
    `;
  });
  
  html += '</div>';
  
  elements.gaFormContainer.innerHTML = html;
  elements.gaFormContainer.style.display = 'block';
}

/**
 * Get default GA template for vessels without one
 */
function getDefaultGATemplate() {
  return [
    { name: 'Bow Thruster', GAComponent: 'bow_thruster', description: 'Bow thruster tunnel and surrounds' },
    { name: 'Forward Hull - Port', GAComponent: 'hull_fwd_port', description: 'Forward hull section, port side' },
    { name: 'Forward Hull - Starboard', GAComponent: 'hull_fwd_stbd', description: 'Forward hull section, starboard side' },
    { name: 'Midship Hull - Port', GAComponent: 'hull_mid_port', description: 'Midship hull section, port side' },
    { name: 'Midship Hull - Starboard', GAComponent: 'hull_mid_stbd', description: 'Midship hull section, starboard side' },
    { name: 'Aft Hull - Port', GAComponent: 'hull_aft_port', description: 'Aft hull section, port side' },
    { name: 'Aft Hull - Starboard', GAComponent: 'hull_aft_stbd', description: 'Aft hull section, starboard side' },
    { name: 'Flat Bottom', GAComponent: 'flat_bottom', description: 'Flat bottom area' },
    { name: 'Sea Chests', GAComponent: 'sea_chests', description: 'Sea chest intakes and gratings' },
    { name: 'Propeller(s)', GAComponent: 'propellers', description: 'Propeller(s) and shaft(s)' },
    { name: 'Rudder', GAComponent: 'rudder', description: 'Rudder and steering gear' },
    { name: 'Waterline', GAComponent: 'waterline', description: 'Boot top and waterline area' }
  ];
}

/**
 * Collect GA form data
 */
function collectGAFormData() {
  const gaData = [];
  const inputs = document.querySelectorAll('.ga-component-input');
  
  inputs.forEach(input => {
    const value = input.value.trim();
    if (value) {
      gaData.push({
        componentId: input.dataset.componentId,
        componentName: input.dataset.componentName,
        description: value
      });
    }
  });
  
  return gaData;
}

/**
 * Render work types grid
 */
function renderWorkTypes() {
  elements.workTypesGrid.innerHTML = '';
  
  if (state.workTypes.length === 0) {
    elements.workTypesGrid.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M12 8v8m-4-4h8"/>
        </svg>
        <p>No work types available</p>
      </div>
    `;
    return;
  }
  
  state.workTypes.forEach(workType => {
    const card = document.createElement('div');
    card.className = 'work-type-card';
    card.dataset.id = workType.flowOriginId || workType.id;
    
    card.innerHTML = `
      <div class="work-type-name">${escapeHtml(workType.displayName || workType.name || 'Unknown')}</div>
      <div class="work-type-category">${escapeHtml(workType.category || 'General')}</div>
      <div class="work-type-id">${workType.flowOriginId || workType.id || ''}</div>
    `;
    
    card.addEventListener('click', () => selectWorkType(workType));
    
    elements.workTypesGrid.appendChild(card);
  });
}

/**
 * Select a work type
 */
function selectWorkType(workType) {
  state.selectedWorkType = workType;
  
  // Update visual selection
  document.querySelectorAll('.work-type-card').forEach(card => {
    card.classList.remove('selected');
    if (card.dataset.id === (workType.flowOriginId || workType.id)) {
      card.classList.add('selected');
    }
  });
  
  // Show form
  elements.selectedWorkTypeName.textContent = workType.displayName || workType.name || 'Selected Work Type';
  showForm();
  
  // Pre-populate job name
  elements.jobName.value = `New ${workType.displayName || workType.name || 'Job'} - ${new Date().toLocaleDateString()}`;
}

/**
 * Submit job to API
 */
async function submitJob() {
  if (!state.selectedWorkType) {
    showMessage('Please select a work type first', 'error');
    return;
  }
  
  const jobName = elements.jobName.value.trim();
  if (!jobName) {
    showMessage('Please enter a job name', 'error');
    return;
  }
  
  if (!state.selectedAsset) {
    showMessage('Please select an asset (vessel) first', 'error');
    return;
  }
  
  // Disable submit button
  elements.submitBtn.disabled = true;
  elements.submitBtn.innerHTML = '<span class="loading-spinner"></span> Creating...';
  
  try {
    const token = await getToken();
    
    // Build job data
    const jobData = {
      flowOriginId: state.selectedWorkType.flowOriginId || state.selectedWorkType.id,
      displayName: jobName,
      data: {}
    };
    
    // Add selected asset info
    jobData.data.assetId = state.selectedAsset.id;
    jobData.data.assetName = state.selectedAsset.name || state.selectedAsset.displayName;
    if (state.selectedAsset.mmsi) jobData.data.mmsi = state.selectedAsset.mmsi;
    if (state.selectedAsset.imo) jobData.data.imo = state.selectedAsset.imo;
    
    // Add notes if provided
    const notes = elements.jobNotes?.value?.trim();
    if (notes) {
      jobData.data.notes = notes;
    }
    
    // Collect GA form data
    const gaFormData = collectGAFormData();
    if (gaFormData.length > 0) {
      jobData.data.generalArrangement = gaFormData;
    }
    
    console.log('Creating job:', jobData);
    
    const response = await fetch('/api/marinestream/work', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(jobData)
    });
    
    const result = await response.json();
    
    // Show result
    showResult(result);
    
    if (response.ok && result.success) {
      showMessage('Job created successfully!', 'success');
      clearForm();
      hideForm();
    } else {
      showMessage(`Failed to create job: ${result.error?.message || 'Unknown error'}`, 'error');
    }
  } catch (error) {
    console.error('Failed to create job:', error);
    showMessage('Failed to create job: ' + error.message, 'error');
    showResult({ error: error.message });
  } finally {
    elements.submitBtn.disabled = false;
    elements.submitBtn.innerHTML = 'Create Job';
  }
}

/**
 * Get current access token
 */
async function getToken() {
  // Try MarineStreamAuth first
  if (window.MarineStreamAuth) {
    try {
      const token = await window.MarineStreamAuth.getAccessToken();
      if (token) {
        state.token = token;
        return token;
      }
    } catch (e) {
      console.warn('MarineStreamAuth.getAccessToken failed:', e);
    }
  }
  
  // Fallback to stored token
  if (state.token) {
    return state.token;
  }
  
  // Check localStorage
  const storedToken = localStorage.getItem('marinestream_pat') || 
                      localStorage.getItem('marinestream_access_token');
  if (storedToken) {
    state.token = storedToken;
    return storedToken;
  }
  
  throw new Error('No access token available. Please authenticate first.');
}

/**
 * Show message
 */
function showMessage(text, type = 'info') {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message message-${type}`;
  messageDiv.textContent = text;
  
  // Clear previous messages of same type
  elements.messages.innerHTML = '';
  elements.messages.appendChild(messageDiv);
  
  // Auto-remove success/info messages after 5 seconds
  if (type !== 'error') {
    setTimeout(() => {
      messageDiv.remove();
    }, 5000);
  }
}

/**
 * Clear messages
 */
function clearMessages() {
  elements.messages.innerHTML = '';
}

/**
 * Show result section
 */
function showResult(result) {
  elements.resultJson.textContent = JSON.stringify(result, null, 2);
  elements.resultSection.classList.add('visible');
}

/**
 * Show work types section
 */
function showWorkTypesSection() {
  elements.workTypesSection.style.display = 'block';
}

/**
 * Hide work types section
 */
function hideWorkTypes() {
  elements.workTypesSection.style.display = 'none';
}

/**
 * Show form section
 */
function showForm() {
  elements.formSection.classList.add('visible');
  elements.jobName.focus();
}

/**
 * Hide form section
 */
function hideForm() {
  elements.formSection.classList.remove('visible');
  state.selectedWorkType = null;
  document.querySelectorAll('.work-type-card').forEach(card => {
    card.classList.remove('selected');
  });
}

/**
 * Clear form
 */
function clearForm() {
  elements.jobName.value = '';
  if (elements.jobNotes) elements.jobNotes.value = '';
  if (elements.assetSearch) elements.assetSearch.value = '';
  
  // Clear asset selection
  state.selectedAsset = null;
  state.selectedAssetDetails = null;
  document.querySelectorAll('.asset-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  // Clear selected asset info
  if (elements.selectedAssetInfo) {
    elements.selectedAssetInfo.style.display = 'none';
    elements.selectedAssetInfo.innerHTML = '';
  }
  
  // Clear GA form
  if (elements.gaFormContainer) {
    elements.gaFormContainer.style.display = 'none';
    elements.gaFormContainer.innerHTML = '';
  }
  
  elements.resultSection.classList.remove('visible');
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
