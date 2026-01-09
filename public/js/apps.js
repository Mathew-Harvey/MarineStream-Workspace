/**
 * MarineStream Workspace - Applications Module
 * App loading, rendering, and filtering
 */

// App icons (using inline SVG for crisp rendering)
const icons = {
  dashboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>`,
  
  briefcase: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2"/>
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>
  </svg>`,
  
  'clipboard-check': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
    <rect x="9" y="3" width="6" height="4" rx="1"/>
    <path d="m9 14 2 2 4-4"/>
  </svg>`,
  
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <circle cx="11" cy="11" r="8"/>
    <path d="M21 21l-4.35-4.35"/>
  </svg>`,
  
  calculator: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="4" y="2" width="16" height="20" rx="2"/>
    <line x1="8" y1="6" x2="16" y2="6"/>
    <line x1="8" y1="10" x2="8" y2="10.01"/>
    <line x1="12" y1="10" x2="12" y2="10.01"/>
    <line x1="16" y1="10" x2="16" y2="10.01"/>
    <line x1="8" y1="14" x2="8" y2="14.01"/>
    <line x1="12" y1="14" x2="12" y2="14.01"/>
    <line x1="16" y1="14" x2="16" y2="14.01"/>
    <line x1="8" y1="18" x2="8" y2="18.01"/>
    <line x1="12" y1="18" x2="12" y2="18.01"/>
    <line x1="16" y1="18" x2="16" y2="18.01"/>
  </svg>`,
  
  'file-text': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <line x1="10" y1="9" x2="8" y2="9"/>
  </svg>`,
  
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="2" y="6" width="14" height="12" rx="2"/>
    <path d="M16 10l6-4v12l-6-4v-4z"/>
  </svg>`,
  
  default: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="3" y="3" width="18" height="18" rx="2"/>
    <path d="M12 8v8M8 12h8"/>
  </svg>`
};

// Store loaded apps
let loadedApps = [];

/**
 * Load applications from API
 */
export async function loadApps(container) {
  if (!container) return;
  
  try {
    const response = await fetch('/api/apps');
    const data = await response.json();
    
    if (data.success && data.data) {
      loadedApps = data.data.apps || [];
      renderApps(container, loadedApps);
    } else {
      // Fallback to hardcoded apps if API fails
      loadedApps = getDefaultApps();
      renderApps(container, loadedApps);
    }
  } catch (error) {
    console.error('Failed to load apps:', error);
    // Fallback to hardcoded apps
    loadedApps = getDefaultApps();
    renderApps(container, loadedApps);
  }
}

/**
 * Get default apps (fallback if API unavailable)
 */
function getDefaultApps() {
  return [
    {
      slug: 'dashboard',
      name: 'Fleet Dashboard',
      description: 'View fleet performance, vessel status, and recent work',
      url: '/dashboard.html',
      icon: 'dashboard',
      category: 'Operations',
      badge: 'NEW'
    },
    {
      slug: 'core',
      name: 'Job Delivery',
      description: 'Multi-party workflow for delivering inspection & cleaning jobs',
      url: 'https://app.marinestream.io',
      icon: 'briefcase',
      category: 'Operations'
    },
    {
      slug: 'iwc',
      name: 'IWC Approval Portal',
      description: 'Plan and get approval for in-water cleaning work',
      url: 'https://iwc-approval-portal.onrender.com',
      icon: 'clipboard-check',
      category: 'Planning & Compliance'
    },
    {
      slug: 'idguide',
      name: 'Biofouling ID Guide',
      description: 'Visual guide for diver IMS identification',
      url: 'https://mathew-harvey.github.io/BiofoulingIdGuide',
      icon: 'search',
      category: 'Reference & Analysis'
    },
    {
      slug: 'hullcalc',
      name: 'Hull Calculator',
      description: 'Calculate fouling impact on fuel costs',
      url: 'https://www.marinestream.com.au/interactive-tools/hullCalc.html',
      icon: 'calculator',
      category: 'Reference & Analysis'
    },
    {
      slug: 'docgen',
      name: 'Document Generator',
      description: 'Generate biofouling management plans',
      url: 'https://mathew-harvey.github.io/Document-Generator',
      icon: 'file-text',
      category: 'Planning & Compliance'
    },
    {
      slug: 'rov',
      name: 'ROV AutoConnect',
      description: 'Connect to Deep Trekker ROV systems',
      url: 'https://www.marinestream.com.au/core-pages/rov-autoconnect.html',
      icon: 'video',
      category: 'Operations'
    }
  ];
}

/**
 * Render apps to container
 */
function renderApps(container, apps) {
  // Clear container
  container.innerHTML = '';
  
  // Sort apps by sort_order or name
  const sortedApps = [...apps].sort((a, b) => {
    if (a.sort_order !== undefined && b.sort_order !== undefined) {
      return a.sort_order - b.sort_order;
    }
    return a.name.localeCompare(b.name);
  });
  
  // Render each app with staggered animation
  sortedApps.forEach((app, index) => {
    const card = createAppCard(app);
    card.style.animationDelay = `${index * 50}ms`;
    container.appendChild(card);
  });
}

/**
 * Create app card element
 */
function createAppCard(app) {
  const card = document.createElement('a');
  card.className = 'app-card';
  card.href = app.url;
  card.target = '_blank';
  card.rel = 'noopener noreferrer';
  card.dataset.category = app.category || 'Other';
  card.dataset.slug = app.slug;
  
  const iconSvg = icons[app.icon] || icons.default;
  
  card.innerHTML = `
    <div class="app-card-header">
      <div class="app-icon">
        ${iconSvg}
      </div>
      ${app.badge ? `
        <div class="app-badge">
          <span class="app-badge-dot"></span>
          ${app.badge}
        </div>
      ` : ''}
    </div>
    <h3 class="app-name">${escapeHtml(app.name)}</h3>
    <p class="app-description">${escapeHtml(app.description)}</p>
    <div class="app-footer">
      <span class="app-category">${escapeHtml(app.category || 'Other')}</span>
      <div class="app-arrow">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </div>
    </div>
  `;
  
  // Add animation class
  card.style.opacity = '0';
  card.style.transform = 'translateY(20px)';
  card.style.animation = 'fadeInUp 0.4s ease forwards';
  
  return card;
}

/**
 * Filter apps by category
 */
export function filterApps(container, category) {
  if (!container) return;
  
  const cards = container.querySelectorAll('.app-card');
  
  cards.forEach(card => {
    if (category === 'all' || card.dataset.category === category) {
      card.style.display = '';
      card.style.animation = 'fadeInUp 0.3s ease forwards';
    } else {
      card.style.display = 'none';
    }
  });
}

/**
 * Search apps
 */
export function searchApps(container, query) {
  if (!container) return;
  
  const normalizedQuery = query.toLowerCase().trim();
  const cards = container.querySelectorAll('.app-card');
  
  cards.forEach(card => {
    const name = card.querySelector('.app-name')?.textContent.toLowerCase() || '';
    const description = card.querySelector('.app-description')?.textContent.toLowerCase() || '';
    const category = card.dataset.category?.toLowerCase() || '';
    
    const matches = !normalizedQuery || 
      name.includes(normalizedQuery) || 
      description.includes(normalizedQuery) ||
      category.includes(normalizedQuery);
    
    card.style.display = matches ? '' : 'none';
  });
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add fadeInUp animation to document
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
document.head.appendChild(style);
