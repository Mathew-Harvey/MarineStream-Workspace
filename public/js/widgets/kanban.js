/**
 * MarineStream Kanban Board Widget
 * Displays work items in a Kanban-style board with Pending, In Progress, and Complete columns
 */

export class KanbanBoard {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      onJobClick: options.onJobClick || ((job) => window.open(job.jobUrl, '_blank')),
      maxItemsPerColumn: options.maxItemsPerColumn || 50,
      ...options
    };
    this.workItems = [];
  }

  /**
   * Fetch work items from the API
   */
  async fetchWorkItems() {
    const token = localStorage.getItem('marinestream_pat');
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
          <div class="kanban-stats">
            <span class="stat pending">${categorized.pending.length} Pending</span>
            <span class="stat progress">${categorized.inProgress.length} In Progress</span>
            <span class="stat complete">${categorized.complete.length} Complete</span>
          </div>
        </div>
        <div class="kanban-columns"></div>
      </div>
    `;
    
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
