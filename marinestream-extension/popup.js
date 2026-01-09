/**
 * MarineStream PAT Capture - Popup Script
 */

document.addEventListener('DOMContentLoaded', () => {
  updateStatus();
  
  // Update status every second for timer
  setInterval(updateStatus, 1000);
});

function updateStatus() {
  chrome.runtime.sendMessage({ action: 'getToken' }, (data) => {
    const container = document.getElementById('token-status');
    
    if (data && data.marinestream_pat) {
      const remaining = data.pat_expires_at - Date.now();
      const mins = Math.floor(remaining / 60000);
      const secs = Math.floor((remaining % 60000) / 1000);
      
      let timerClass = '';
      let statusClass = 'success';
      let statusIcon = '✓';
      
      if (remaining <= 0) {
        timerClass = 'danger';
        statusClass = 'error';
        statusIcon = '✗';
      } else if (remaining < 10 * 60 * 1000) {
        timerClass = 'warning';
        statusClass = 'warning';
        statusIcon = '⚠';
      }
      
      const initials = (data.user_name || 'User')
        .split(' ')
        .map(n => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
      
      container.innerHTML = `
        <div class="status-card">
          <div class="status-header">
            <div class="status-icon ${statusClass}">${statusIcon}</div>
            <div class="status-text">${remaining > 0 ? 'PAT Active' : 'PAT Expired'}</div>
          </div>
          
          <div class="user-info">
            <div class="user-avatar">${initials}</div>
            <div class="user-name">${data.user_name || 'Unknown User'}</div>
          </div>
          
          <div class="status-details">
            ${remaining > 0 
              ? `Expires in:`
              : `Token expired. Visit MarineStream to get a new one.`
            }
          </div>
          
          ${remaining > 0 ? `
            <div class="timer ${timerClass}">
              ${mins}:${secs.toString().padStart(2, '0')}
            </div>
          ` : ''}
          
          <button class="btn btn-primary" id="copy-btn">
            Copy PAT to Clipboard
          </button>
          
          <button class="btn btn-secondary" id="open-dashboard">
            Open Fleet Command
          </button>
          
          <button class="btn btn-danger" id="clear-btn">
            Clear Token
          </button>
        </div>
      `;
      
      // Add event listeners
      document.getElementById('copy-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(data.marinestream_pat).then(() => {
          const btn = document.getElementById('copy-btn');
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy PAT to Clipboard';
          }, 2000);
        });
      });
      
      document.getElementById('open-dashboard').addEventListener('click', () => {
        // Store token in a way the dashboard can access
        chrome.storage.local.set({ dashboard_ready: true }, () => {
          chrome.tabs.create({ url: 'http://localhost:3000/dashboard.html' });
        });
      });
      
      document.getElementById('clear-btn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ action: 'clearToken' }, () => {
          updateStatus();
        });
      });
      
    } else {
      container.innerHTML = `
        <div class="no-token">
          <div class="no-token-icon">🔑</div>
          <div class="status-text">No PAT Captured</div>
        </div>
        
        <div class="instructions">
          <strong>To capture your PAT:</strong>
          <ol>
            <li>Go to <a href="https://app.marinestream.io" target="_blank">app.marinestream.io</a></li>
            <li>Log in if needed</li>
            <li>Click on any Work item or Asset</li>
            <li>The PAT will be captured automatically!</li>
          </ol>
        </div>
        
        <button class="btn btn-primary" id="open-marinestream">
          Open MarineStream
        </button>
      `;
      
      document.getElementById('open-marinestream').addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://app.marinestream.io' });
      });
    }
  });
}
