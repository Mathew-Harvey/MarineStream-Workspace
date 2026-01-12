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
      initialView: options.initialView || 'dayGridMonth',
      ...options
    };
    this.calendar = null;
    this.workItems = [];
  }

  /**
   * Fetch work items from the API
   */
  async fetchWorkItems() {
    const token = localStorage.getItem('marinestream_pat');
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
        right: 'dayGridMonth,dayGridWeek,listWeek'
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
          <button class="cal-nav prev" data-action="prev">‹</button>
          <h3 class="cal-title">${monthNames[currentMonth]} ${currentYear}</h3>
          <button class="cal-nav next" data-action="next">›</button>
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
