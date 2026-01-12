/**
 * MarineStream Kanban Board Widget
 * Displays work items in a Kanban-style board with Pending, In Progress, and Complete columns
 */

export class KanbanBoard {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      onJobClick: options.onJobClick || ((job) => window.open(job.jobUrl, '_blank')),
      onJobCreated: options.onJobCreated || ((job) => window.open(job.jobUrl, '_blank')),
      maxItemsPerColumn: options.maxItemsPerColumn || 50,
      ...options
    };
    this.workItems = [];
    this.flowOrigins = [];
  }

  /**
   * Get auth token from localStorage
   */
  getToken() {
    return localStorage.getItem('marinestream_pat');
  }

  /**
   * Fetch work items from the API
   */
  async fetchWorkItems() {
    const token = this.getToken();
    if (!token) {
      console.warn('No auth token available for Kanban');
      return [];
    }

    try {
      const response = await fetch('/api/marinestream/work/deliveries', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      const data = await response.json();
      
      if (data.success && data.data?.allWork) {
        this.workItems = data.data.allWork;
        return this.workItems;
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch work items for Kanban:', error);
      return [];
    }
  }

  /**
   * Fetch available flow origins (job types) for creating new work
   */
  async fetchFlowOrigins() {
    const token = this.getToken();
    if (!token) return [];

    try {
      const response = await fetch('/api/marinestream/flow-origins', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      const data = await response.json();
      
      if (data.success && data.data) {
        this.flowOrigins = data.data;
        return this.flowOrigins;
      }
      return [];
    } catch (error) {
      console.error('Failed to fetch flow origins:', error);
      return [];
    }
  }

  /**
   * Create a new work item
   */
  async createWork(flowOriginId, displayName = null) {
    const token = this.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    try {
      const response = await fetch('/api/marinestream/work', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          flowOriginId,
          displayName
        })
      });
      
      const data = await response.json();
      
      if (data.success && data.data) {
        return data.data;
      }
      throw new Error(data.error?.message || 'Failed to create work item');
    } catch (error) {
      console.error('Failed to create work:', error);
      throw error;
    }
  }

  /**
   * Show the create job modal
   */
  async showCreateJobModal() {
    // Fetch flow origins if not already loaded
    if (this.flowOrigins.length === 0) {
      await this.fetchFlowOrigins();
    }

    // Create modal overlay
    const modal = document.createElement('div');
    modal.className = 'kanban-modal-overlay';
    modal.innerHTML = `
      <div class="kanban-modal">
        <div class="kanban-modal-header">
          <h3>Create New Job</h3>
          <button class="kanban-modal-close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="kanban-modal-body">
          <p class="kanban-modal-subtitle">Select the type of job to create:</p>
          <div class="kanban-flow-list">
            ${this.flowOrigins.length > 0 ? this.flowOrigins.map(flow => `
              <button class="kanban-flow-item" data-flow-id="${flow.id}">
                <div class="kanban-flow-info">
                  <span class="kanban-flow-name">${flow.displayName}</span>
                  <span class="kanban-flow-category">${this.formatCategory(flow.category)}</span>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            `).join('') : `
              <div class="kanban-no-flows">
                <p>No workflow templates available</p>
                <p class="small">Contact your administrator to set up workflows</p>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    modal.querySelector('.kanban-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Flow item click handlers
    modal.querySelectorAll('.kanban-flow-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const flowId = btn.dataset.flowId;
        btn.disabled = true;
        btn.innerHTML = `
          <div class="kanban-flow-info">
            <span class="kanban-flow-name">Creating job...</span>
          </div>
          <div class="loading-spinner small"></div>
        `;
        
        try {
          const newJob = await this.createWork(flowId);
          modal.remove();
          
          // Notify and open the new job
          if (this.options.onJobCreated) {
            this.options.onJobCreated(newJob);
          }
          
          // Refresh the board
          await this.refresh();
        } catch (error) {
          btn.disabled = false;
          btn.innerHTML = `
            <div class="kanban-flow-info">
              <span class="kanban-flow-name" style="color: var(--color-critical)">Failed: ${error.message}</span>
            </div>
          `;
          setTimeout(() => this.showCreateJobModal(), 2000);
          modal.remove();
        }
      });
    });

    document.body.appendChild(modal);
  }

  /**
   * Format category for display
   */
  formatCategory(category) {
    if (!category) return 'General';
    return category
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  /**
   * Categorize work items into Kanban columns
   */
  categorizeItems(items) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    const pending = [];
    const inProgress = [];
    const complete = [];

    items.forEach(item => {
      const status = (item.status || '').toLowerCase();
      
      // Determine column based on status and dates
      if (status === 'complete' || status === 'completed' || status === 'closed') {
        complete.push(item);
      } else if (
        status.includes('progress') || 
        status.includes('review') || 
        status.includes('delivery') ||
        status === 'resourcing' ||
        status === 'in progress'
      ) {
        inProgress.push(item);
      } else {
        // Draft, pending, awaiting, etc.
        pending.push(item);
      }
    });

    // Sort each column - most recent first
    const sortByDate = (a, b) => {
      const dateA = new Date(a.lastModified || a.createdDate || 0);
      const dateB = new Date(b.lastModified || b.createdDate || 0);
      return dateB - dateA;
    };

    return {
      pending: pending.sort(sortByDate).slice(0, this.options.maxItemsPerColumn),
      inProgress: inProgress.sort(sortByDate).slice(0, this.options.maxItemsPerColumn),
      complete: complete.sort(sortByDate).slice(0, this.options.maxItemsPerColumn)
    };
  }

  /**
   * Format date for display
   */
  formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  }

  /**
   * Get color class based on flow type
   */
  getFlowTypeColor(flowType) {
    if (!flowType) return 'default';
    if (flowType.includes('biofouling')) return 'biofouling';
    if (flowType.includes('inspection')) return 'inspection';
    if (flowType.includes('assets')) return 'assets';
    return 'default';
  }

  /**
   * Create a single Kanban card
   */
  createCard(item) {
    const card = document.createElement('div');
    card.className = `kanban-card ${this.getFlowTypeColor(item.flowType)}`;
    card.dataset.workId = item.workId;
    
    const flowLabel = item.displayName || this.getFlowLabel(item.flowType);
    const vesselName = item.vesselName || 'Unknown Vessel';
    const dateStr = this.formatDate(item.lastModified || item.createdDate);
    
    card.innerHTML = `
      <div class="kanban-card-header">
        <span class="kanban-card-code">${item.workCode || 'N/A'}</span>
        <span class="kanban-card-type">${flowLabel}</span>
      </div>
      <div class="kanban-card-vessel">${vesselName}</div>
      <div class="kanban-card-footer">
        <span class="kanban-card-status">${item.status || 'Unknown'}</span>
        <span class="kanban-card-date">${dateStr}</span>
      </div>
    `;
    
    card.addEventListener('click', () => this.options.onJobClick(item));
    return card;
  }

  /**
   * Get human-readable flow label
   */
  getFlowLabel(flowType) {
    if (!flowType) return 'Work Item';
    if (flowType.includes('biofouling')) return 'Biofouling';
    if (flowType.includes('inspection')) return 'Inspection';
    if (flowType.includes('assets')) return 'Assets';
    return 'Work Item';
  }

  /**
   * Create a Kanban column
   */
  createColumn(title, items, colorClass) {
    const column = document.createElement('div');
    column.className = `kanban-column ${colorClass}`;
    
    column.innerHTML = `
      <div class="kanban-column-header">
        <span class="kanban-column-title">${title}</span>
        <span class="kanban-column-count">${items.length}</span>
      </div>
      <div class="kanban-column-content"></div>
    `;
    
    const content = column.querySelector('.kanban-column-content');
    items.forEach(item => {
      content.appendChild(this.createCard(item));
    });
    
    if (items.length === 0) {
      content.innerHTML = '<div class="kanban-empty">No items</div>';
    }
    
    return column;
  }

  /**
   * Render the Kanban board
   */
  render(items = this.workItems) {
    if (!this.container) {
      console.error('Kanban container not found');
      return;
    }

    const categorized = this.categorizeItems(items);
    
    this.container.innerHTML = `
      <div class="kanban-board">
        <div class="kanban-header">
          <h3>Work Board</h3>
          <div class="kanban-header-actions">
            <button class="kanban-create-btn" title="Create New Job">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span>New Job</span>
            </button>
            <div class="kanban-stats">
              <span class="stat pending">${categorized.pending.length} Pending</span>
              <span class="stat progress">${categorized.inProgress.length} In Progress</span>
              <span class="stat complete">${categorized.complete.length} Complete</span>
            </div>
          </div>
        </div>
        <div class="kanban-columns"></div>
      </div>
    `;
    
    // Add create button handler
    this.container.querySelector('.kanban-create-btn')?.addEventListener('click', () => {
      this.showCreateJobModal();
    });
    
    const columnsContainer = this.container.querySelector('.kanban-columns');
    columnsContainer.appendChild(this.createColumn('Pending', categorized.pending, 'pending'));
    columnsContainer.appendChild(this.createColumn('In Progress', categorized.inProgress, 'progress'));
    columnsContainer.appendChild(this.createColumn('Complete', categorized.complete, 'complete'));
  }

  /**
   * Initialize and load data
   */
  async init() {
    this.container.innerHTML = `
      <div class="kanban-loading">
        <div class="loading-spinner"></div>
        <span>Loading work items...</span>
      </div>
    `;
    
    await this.fetchWorkItems();
    this.render();
  }

  /**
   * Refresh data
   */
  async refresh() {
    await this.fetchWorkItems();
    this.render();
  }
}

export default KanbanBoard;
