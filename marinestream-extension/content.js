/**
 * MarineStream PAT Capture - Content Script
 * Runs on MarineStream pages to show capture notifications
 */

// Listen for storage changes (token captured)
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.marinestream_pat) {
    showCaptureNotification();
  }
});

// Check if we already have a token when page loads
chrome.storage.local.get(['marinestream_pat', 'pat_expires_at', 'user_name'], (data) => {
  if (data.marinestream_pat) {
    const remaining = data.pat_expires_at - Date.now();
    if (remaining > 5 * 60 * 1000) {
      // Token is valid, show subtle indicator
      showTokenIndicator(data);
    }
  }
});

function showCaptureNotification() {
  // Remove any existing notification
  const existing = document.getElementById('ms-pat-notification');
  if (existing) existing.remove();
  
  const notification = document.createElement('div');
  notification.id = 'ms-pat-notification';
  notification.innerHTML = `
    <style>
      #ms-pat-notification {
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #0f172a, #1e293b);
        border: 1px solid #334155;
        border-radius: 12px;
        padding: 16px 20px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.4);
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: slideIn 0.3s ease;
        max-width: 320px;
      }
      
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateX(20px);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      
      #ms-pat-notification .header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 12px;
      }
      
      #ms-pat-notification .icon {
        width: 32px;
        height: 32px;
        background: #22c55e;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 16px;
      }
      
      #ms-pat-notification .title {
        color: #f1f5f9;
        font-weight: 600;
        font-size: 14px;
      }
      
      #ms-pat-notification .subtitle {
        color: #94a3b8;
        font-size: 12px;
      }
      
      #ms-pat-notification .message {
        color: #cbd5e1;
        font-size: 13px;
        line-height: 1.5;
        margin-bottom: 12px;
      }
      
      #ms-pat-notification .btn {
        display: inline-block;
        padding: 8px 16px;
        background: linear-gradient(135deg, #3b82f6, #2563eb);
        color: white;
        border: none;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        margin-right: 8px;
      }
      
      #ms-pat-notification .btn:hover {
        filter: brightness(1.1);
      }
      
      #ms-pat-notification .btn-ghost {
        background: transparent;
        color: #94a3b8;
      }
      
      #ms-pat-notification .btn-ghost:hover {
        color: #f1f5f9;
      }
      
      #ms-pat-notification .close {
        position: absolute;
        top: 8px;
        right: 8px;
        width: 24px;
        height: 24px;
        background: none;
        border: none;
        color: #64748b;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
      }
      
      #ms-pat-notification .close:hover {
        color: #f1f5f9;
      }
    </style>
    
    <button class="close" onclick="this.parentElement.remove()">×</button>
    
    <div class="header">
      <div class="icon">✓</div>
      <div>
        <div class="title">PAT Captured!</div>
        <div class="subtitle">Fleet Command ready</div>
      </div>
    </div>
    
    <div class="message">
      Your authentication token has been captured. You can now use the Fleet Command dashboard without manual token entry.
    </div>
    
    <a href="http://localhost:3000/dashboard.html" class="btn" target="_blank">
      Open Fleet Command
    </a>
    <button class="btn btn-ghost" onclick="this.parentElement.parentElement.remove()">
      Dismiss
    </button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-hide after 10 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.style.animation = 'slideIn 0.3s ease reverse';
      setTimeout(() => notification.remove(), 300);
    }
  }, 10000);
}

function showTokenIndicator(data) {
  // Remove any existing indicator
  const existing = document.getElementById('ms-pat-indicator');
  if (existing) existing.remove();
  
  const remaining = data.pat_expires_at - Date.now();
  const mins = Math.round(remaining / 60000);
  
  const indicator = document.createElement('div');
  indicator.id = 'ms-pat-indicator';
  indicator.innerHTML = `
    <style>
      #ms-pat-indicator {
        position: fixed;
        bottom: 20px;
        right: 20px;
        background: rgba(15, 23, 42, 0.9);
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 8px 12px;
        z-index: 999998;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 12px;
        color: #94a3b8;
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      #ms-pat-indicator:hover {
        background: rgba(30, 41, 59, 0.95);
        color: #f1f5f9;
      }
      
      #ms-pat-indicator .dot {
        width: 8px;
        height: 8px;
        background: #22c55e;
        border-radius: 50%;
      }
      
      #ms-pat-indicator.warning .dot { background: #f59e0b; }
    </style>
    
    <span class="dot"></span>
    <span>Fleet Command: ${mins}m remaining</span>
  `;
  
  if (mins < 10) {
    indicator.classList.add('warning');
  }
  
  indicator.addEventListener('click', () => {
    window.open('http://localhost:3000/dashboard.html', '_blank');
  });
  
  document.body.appendChild(indicator);
}
