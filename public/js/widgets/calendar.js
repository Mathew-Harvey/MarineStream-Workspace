/**
 * MarineStream Calendar Widget
 * Displays work items in a month-view calendar
 * Uses FullCalendar library for the calendar functionality
 */

export class WorkCalendar {
  constructor(containerId, options = {}) {
    this.container = document.getElementById(containerId);
    this.options = {
      onEventClick: options.onEventClick || ((event) => window.open(event.extendedProps.jobUrl, '_blank')),
      onJobCreated: options.onJobCreated || ((job) => window.open(job.jobUrl, '_blank')),
      initialView: options.initialView || 'dayGridMonth',
      ...options
    };
    this.calendar = null;
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
      console.warn('No auth token available for Calendar');
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
      console.error('Failed to fetch work items for Calendar:', error);
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
    modal.className = 'calendar-modal-overlay';
    modal.innerHTML = `
      <div class="calendar-modal">
        <div class="calendar-modal-header">
          <h3>Create New Job</h3>
          <button class="calendar-modal-close" aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div class="calendar-modal-body">
          <p class="calendar-modal-subtitle">Select the type of job to create:</p>
          <div class="calendar-flow-list">
            ${this.flowOrigins.length > 0 ? this.flowOrigins.map(flow => `
              <button class="calendar-flow-item" data-flow-id="${flow.id}">
                <div class="calendar-flow-info">
                  <span class="calendar-flow-name">${flow.displayName}</span>
                  <span class="calendar-flow-category">${this.formatCategory(flow.category)}</span>
                </div>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
            `).join('') : `
              <div class="calendar-no-flows">
                <p>No workflow templates available</p>
                <p class="small">Contact your administrator to set up workflows</p>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    modal.querySelector('.calendar-modal-close').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.remove();
    });

    // Flow item click handlers
    modal.querySelectorAll('.calendar-flow-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const flowId = btn.dataset.flowId;
        btn.disabled = true;
        btn.innerHTML = `
          <div class="calendar-flow-info">
            <span class="calendar-flow-name">Creating job...</span>
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
          
          // Refresh the calendar
          await this.refresh();
        } catch (error) {
          btn.disabled = false;
          btn.innerHTML = `
            <div class="calendar-flow-info">
              <span class="calendar-flow-name" style="color: var(--color-critical)">Failed: ${error.message}</span>
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
   * Convert work items to FullCalendar events
   */
  convertToEvents(items) {
    const events = [];
    
    items.forEach(item => {
      // Use actual delivery date or forecast delivery date or created date
      const eventDate = item.actualDeliveryDate || item.forecastDeliveryDate || item.createdDate;
      
      if (!eventDate) return;
      
      const date = new Date(eventDate);
      if (isNaN(date.getTime())) return;
      
      // Determine color based on status and flow type
      const color = this.getEventColor(item);
      const isComplete = item.status?.toLowerCase().includes('complete');
      
      events.push({
        id: item.workId,
        title: item.workCode || 'Unknown',
        start: date.toISOString().split('T')[0],
        backgroundColor: color.bg,
        borderColor: color.border,
        textColor: color.text,
        classNames: [
          `event-${this.getFlowClass(item.flowType)}`,
          isComplete ? 'event-complete' : '',
          item.actualDeliveryDate ? 'event-delivered' : 'event-scheduled'
        ].filter(Boolean),
        extendedProps: {
          workCode: item.workCode,
          vesselName: item.vesselName,
          status: item.status,
          flowType: item.flowType,
          displayName: item.displayName,
          jobUrl: item.jobUrl,
          isDelivered: !!item.actualDeliveryDate,
          originalData: item
        }
      });
    });
    
    return events;
  }

  /**
   * Get event color based on flow type and status
   */
  getEventColor(item) {
    const flowType = item.flowType || '';
    const status = (item.status || '').toLowerCase();
    
    // Complete items
    if (status.includes('complete')) {
      return { bg: '#22c55e', border: '#16a34a', text: '#fff' };
    }
    
    // By flow type
    if (flowType.includes('biofouling')) {
      return { bg: '#3b82f6', border: '#2563eb', text: '#fff' };
    }
    if (flowType.includes('inspection')) {
      return { bg: '#8b5cf6', border: '#7c3aed', text: '#fff' };
    }
    if (flowType.includes('assets')) {
      return { bg: '#f59e0b', border: '#d97706', text: '#fff' };
    }
    
    // Default
    return { bg: '#6b7280', border: '#4b5563', text: '#fff' };
  }

  /**
   * Get CSS class for flow type
   */
  getFlowClass(flowType) {
    if (!flowType) return 'default';
    if (flowType.includes('biofouling')) return 'biofouling';
    if (flowType.includes('inspection')) return 'inspection';
    if (flowType.includes('assets')) return 'assets';
    return 'default';
  }

  /**
   * Create tooltip content for an event
   */
  createTooltipContent(event) {
    const props = event.extendedProps;
    return `
      <div class="calendar-tooltip">
        <div class="tooltip-header">
          <strong>${props.workCode}</strong>
          <span class="tooltip-status ${props.isDelivered ? 'delivered' : 'scheduled'}">
            ${props.isDelivered ? 'Delivered' : 'Scheduled'}
          </span>
        </div>
        <div class="tooltip-vessel">${props.vesselName || 'Unknown Vessel'}</div>
        <div class="tooltip-type">${props.displayName || 'Work Item'}</div>
        <div class="tooltip-action">Click to open job</div>
      </div>
    `;
  }

  /**
   * Render the calendar
   */
  async render() {
    if (!this.container) {
      console.error('Calendar container not found');
      return;
    }

    // Check if FullCalendar is loaded
    if (typeof FullCalendar === 'undefined') {
      this.container.innerHTML = `
        <div class="calendar-error">
          <p>Calendar library not loaded</p>
        </div>
      `;
      return;
    }

    const events = this.convertToEvents(this.workItems);
    
    // Clear existing calendar
    if (this.calendar) {
      this.calendar.destroy();
    }

    this.container.innerHTML = '';
    
    // Create calendar element
    const calendarEl = document.createElement('div');
    calendarEl.className = 'fc-container';
    this.container.appendChild(calendarEl);
    
    // Initialize FullCalendar
    this.calendar = new FullCalendar.Calendar(calendarEl, {
      initialView: this.options.initialView,
      headerToolbar: {
        left: 'prev,next today',
        center: 'title',
        right: 'createJob dayGridMonth,dayGridWeek,listWeek'
      },
      customButtons: {
        createJob: {
          text: '+ New Job',
          click: () => this.showCreateJobModal()
        }
      },
      events: events,
      eventClick: (info) => {
        info.jsEvent.preventDefault();
        this.options.onEventClick(info.event);
      },
      eventDidMount: (info) => {
        // Add tooltip
        info.el.setAttribute('title', `${info.event.extendedProps.workCode} - ${info.event.extendedProps.vesselName || 'Unknown'}`);
      },
      dayMaxEvents: 3,
      moreLinkClick: 'popover',
      height: 'auto',
      aspectRatio: 1.5,
      firstDay: 1, // Monday
      eventDisplay: 'block',
      displayEventTime: false,
      themeSystem: 'standard'
    });
    
    this.calendar.render();
  }

  /**
   * Render a simple fallback calendar without FullCalendar
   */
  renderFallback() {
    if (!this.container) return;
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Group events by date
    const eventsByDate = {};
    this.workItems.forEach(item => {
      const dateStr = item.actualDeliveryDate || item.forecastDeliveryDate;
      if (!dateStr) return;
      
      const date = new Date(dateStr);
      const key = date.toISOString().split('T')[0];
      
      if (!eventsByDate[key]) {
        eventsByDate[key] = [];
      }
      eventsByDate[key].push(item);
    });
    
    // Generate calendar HTML
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startPad = (firstDay.getDay() + 6) % 7; // Adjust for Monday start
    
    let html = `
      <div class="calendar-simple">
        <div class="calendar-header">
          <div class="cal-nav-group">
            <button class="cal-nav prev" data-action="prev">‹</button>
            <button class="cal-nav next" data-action="next">›</button>
          </div>
          <h3 class="cal-title">${monthNames[currentMonth]} ${currentYear}</h3>
          <button class="cal-create-btn" title="Create New Job">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 5v14M5 12h14"/>
            </svg>
            New Job
          </button>
        </div>
        <div class="calendar-grid">
          <div class="cal-days">
            ${dayNames.map(d => `<div class="cal-day-name">${d}</div>`).join('')}
          </div>
          <div class="cal-dates">
    `;
    
    // Empty cells for padding
    for (let i = 0; i < startPad; i++) {
      html += '<div class="cal-cell empty"></div>';
    }
    
    // Days of the month
    for (let day = 1; day <= lastDay.getDate(); day++) {
      const dateKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayEvents = eventsByDate[dateKey] || [];
      const isToday = day === now.getDate() && currentMonth === now.getMonth();
      
      html += `
        <div class="cal-cell ${isToday ? 'today' : ''} ${dayEvents.length > 0 ? 'has-events' : ''}">
          <span class="cal-date">${day}</span>
          ${dayEvents.length > 0 ? `
            <div class="cal-events">
              ${dayEvents.slice(0, 3).map(e => `
                <div class="cal-event ${this.getFlowClass(e.flowType)}" 
                     data-work-id="${e.workId}"
                     data-job-url="${e.jobUrl}"
                     title="${e.workCode} - ${e.vesselName || 'Unknown'}">
                  ${e.workCode}
                </div>
              `).join('')}
              ${dayEvents.length > 3 ? `<div class="cal-more">+${dayEvents.length - 3} more</div>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }
    
    html += `
          </div>
        </div>
        <div class="calendar-legend">
          <span class="legend-item biofouling"><span class="dot"></span> Biofouling</span>
          <span class="legend-item inspection"><span class="dot"></span> Inspection</span>
          <span class="legend-item assets"><span class="dot"></span> Assets</span>
        </div>
      </div>
    `;
    
    this.container.innerHTML = html;
    
    // Add click handlers for events
    this.container.querySelectorAll('.cal-event').forEach(el => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const jobUrl = el.dataset.jobUrl;
        if (jobUrl) {
          window.open(jobUrl, '_blank');
        }
      });
    });
    
    // Add create button handler
    this.container.querySelector('.cal-create-btn')?.addEventListener('click', () => {
      this.showCreateJobModal();
    });
  }

  /**
   * Initialize and load data
   */
  async init() {
    this.container.innerHTML = `
      <div class="calendar-loading">
        <div class="loading-spinner"></div>
        <span>Loading calendar...</span>
      </div>
    `;
    
    await this.fetchWorkItems();
    
    // Check if FullCalendar is available
    if (typeof FullCalendar !== 'undefined') {
      await this.render();
    } else {
      // Use fallback simple calendar
      this.renderFallback();
    }
  }

  /**
   * Refresh data
   */
  async refresh() {
    await this.fetchWorkItems();
    if (this.calendar) {
      const events = this.convertToEvents(this.workItems);
      this.calendar.removeAllEvents();
      this.calendar.addEventSource(events);
    } else {
      this.renderFallback();
    }
  }

  /**
   * Navigate to a specific date
   */
  goToDate(date) {
    if (this.calendar) {
      this.calendar.gotoDate(date);
    }
  }

  /**
   * Destroy the calendar
   */
  destroy() {
    if (this.calendar) {
      this.calendar.destroy();
      this.calendar = null;
    }
  }
}

export default WorkCalendar;
