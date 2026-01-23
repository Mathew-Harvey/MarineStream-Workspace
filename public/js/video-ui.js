/**
 * MarineStream Workspace - Video Call UI Controller
 * Handles all video call UI interactions
 */

import { 
  initVideoCall, 
  startCall, 
  joinCall, 
  leaveCall, 
  toggleMute, 
  toggleVideo, 
  toggleScreenShare,
  playLocalVideo, 
  playRemoteVideo,
  getCallState, 
  getRemoteUsers,
  setCallbacks,
  setPiPMode,
  hasActiveCall,
  rejoinCall
} from './video-call.js';

import {
  initPresence,
  sendCallInvite,
  sendCallResponse,
  notifyPageChange,
  getOnlineUsers,
  setPresenceCallbacks,
  isConnected
} from './video-presence.js';

// DOM Elements
const elements = {
  // Buttons
  videoCallBtn: document.getElementById('video-call-btn'),
  
  // PiP Widget
  pipWidget: document.getElementById('video-pip-widget'),
  pipExpandBtn: document.getElementById('pip-expand-btn'),
  pipMinimizeBtn: document.getElementById('pip-minimize-btn'),
  pipMuteBtn: document.getElementById('pip-mute-btn'),
  pipVideoBtn: document.getElementById('pip-video-btn'),
  pipEndBtn: document.getElementById('pip-end-btn'),
  pipRemoteVideo: document.getElementById('pip-remote-video'),
  pipLocalVideo: document.getElementById('pip-local-video'),
  
  // Incoming Call Modal
  incomingCallModal: document.getElementById('incoming-call-modal'),
  callerAvatar: document.getElementById('caller-avatar'),
  callerName: document.getElementById('caller-name'),
  acceptCallBtn: document.getElementById('accept-call-btn'),
  declineCallBtn: document.getElementById('decline-call-btn'),
  
  // Start Call Modal
  startCallModal: document.getElementById('start-call-modal'),
  closeStartCallModal: document.getElementById('close-start-call-modal'),
  cancelStartCall: document.getElementById('cancel-start-call'),
  startSoloCall: document.getElementById('start-solo-call'),
  presenceList: document.getElementById('presence-list'),
  inviteEmail: document.getElementById('invite-email'),
  sendEmailInvite: document.getElementById('send-email-invite'),
  tabOnline: document.getElementById('tab-online'),
  tabInvite: document.getElementById('tab-invite')
};

// State
let currentUser = null;
let pendingIncomingCall = null;
let activeCalls = []; // Track active calls from other users

/**
 * Initialize video call UI
 */
export async function initVideoUI(user) {
  currentUser = user;
  
  if (!user) {
    console.log('📹 Video UI: No user, skipping initialization');
    return;
  }

  // Initialize video call module
  const configured = await initVideoCall();
  
  if (!configured) {
    console.warn('📹 Video calling not available');
    if (elements.videoCallBtn) {
      elements.videoCallBtn.style.display = 'none';
    }
    return;
  }

  // Initialize presence tracking
  initPresence(user.id, user.fullName, user.email);

  // Set up video call callbacks
  setCallbacks({
    onUserJoined: handleUserJoined,
    onUserLeft: handleUserLeft,
    onCallEnded: handleCallEnded,
    onLocalTrackReady: handleLocalTrackReady,
    onError: handleCallError
  });

  // Set up presence callbacks
  setPresenceCallbacks({
    onPresenceUpdate: handlePresenceUpdate,
    onIncomingCall: handleIncomingCall,
    onCallResponse: handleCallResponse,
    onPendingInvitations: handlePendingInvitations,
    onConnectionChange: handleConnectionChange
  });

  // Set up event listeners
  setupEventListeners();

  // Check for active call to rejoin (from localStorage)
  if (hasActiveCall()) {
    console.log('📹 Found active call state, attempting to rejoin...');
    const rejoined = await rejoinCall(user.id, user.fullName);
    if (rejoined) {
      showPiPWidget();
    }
  }

  // Fetch active calls from server to see if there are calls to join
  await fetchActiveCalls();

  console.log('📹 Video UI initialized');
}

/**
 * Fetch active calls from server
 */
async function fetchActiveCalls() {
  try {
    const response = await fetch('/api/video/calls/active');
    const result = await response.json();
    
    if (result.success && result.data) {
      activeCalls = result.data;
      console.log('📞 Active calls:', activeCalls.length);
      
      // If there are active calls, update the UI
      if (activeCalls.length > 0) {
        updateCallButtonWithActiveCalls();
      }
    }
  } catch (error) {
    console.error('Failed to fetch active calls:', error);
  }
}

/**
 * Update call button to show there are active calls
 */
function updateCallButtonWithActiveCalls() {
  if (!elements.videoCallBtn) return;
  
  const callState = getCallState();
  if (callState.inCall) return; // Already in a call
  
  // Filter out calls started by current user
  const joinableCalls = activeCalls.filter(c => c.initiated_by !== currentUser?.id);
  
  if (joinableCalls.length > 0) {
    // Add a badge or indicator to show active calls
    const existingBadge = elements.videoCallBtn.querySelector('.active-calls-badge');
    if (!existingBadge) {
      const badge = document.createElement('span');
      badge.className = 'active-calls-badge';
      badge.textContent = joinableCalls.length;
      badge.style.cssText = 'position:absolute;top:-5px;right:-5px;background:#10b981;color:white;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center;';
      elements.videoCallBtn.style.position = 'relative';
      elements.videoCallBtn.appendChild(badge);
    } else {
      existingBadge.textContent = joinableCalls.length;
    }
    
    console.log('📞 Joinable calls available:', joinableCalls.length);
  }
}

/**
 * Set up event listeners
 */
function setupEventListeners() {
  // Main call button
  elements.videoCallBtn?.addEventListener('click', handleCallButtonClick);

  // PiP controls
  elements.pipExpandBtn?.addEventListener('click', handleExpandClick);
  elements.pipMinimizeBtn?.addEventListener('click', handleMinimizeClick);
  elements.pipMuteBtn?.addEventListener('click', handleMuteClick);
  elements.pipVideoBtn?.addEventListener('click', handleVideoClick);
  elements.pipEndBtn?.addEventListener('click', handleEndClick);

  // Incoming call modal
  elements.acceptCallBtn?.addEventListener('click', handleAcceptCall);
  elements.declineCallBtn?.addEventListener('click', handleDeclineCall);

  // Start call modal
  elements.closeStartCallModal?.addEventListener('click', hideStartCallModal);
  elements.cancelStartCall?.addEventListener('click', hideStartCallModal);
  elements.startSoloCall?.addEventListener('click', handleStartSoloCall);
  elements.sendEmailInvite?.addEventListener('click', handleSendEmailInvite);

  // Tab switching
  document.querySelectorAll('.start-call-tabs button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      switchTab(tab);
    });
  });

  // Make PiP widget draggable
  makeDraggable(elements.pipWidget);

  // Track page changes
  window.addEventListener('popstate', () => {
    notifyPageChange(window.location.pathname);
  });
}

/**
 * Handle main call button click
 */
function handleCallButtonClick() {
  const state = getCallState();
  
  if (state.inCall) {
    // Already in call - show PiP
    showPiPWidget();
  } else {
    // Show start call modal
    showStartCallModal();
  }
}

/**
 * Show start call modal
 */
async function showStartCallModal() {
  elements.startCallModal?.classList.remove('hidden');
  
  // Refresh active calls list
  await fetchActiveCalls();
  
  // Update the presence list with users and active calls
  updatePresenceList();
}

/**
 * Hide start call modal
 */
function hideStartCallModal() {
  elements.startCallModal?.classList.add('hidden');
}

/**
 * Switch tabs in start call modal
 */
function switchTab(tab) {
  document.querySelectorAll('.start-call-tabs button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  
  elements.tabOnline?.classList.toggle('hidden', tab !== 'online');
  elements.tabInvite?.classList.toggle('hidden', tab !== 'invite');
}

/**
 * Update presence list in modal
 */
function updatePresenceList() {
  const users = getOnlineUsers();
  const otherUsers = users.filter(u => u.clerk_user_id !== currentUser?.id);
  
  if (!elements.presenceList) return;
  
  // Build HTML with active calls section first
  let html = '';
  
  // Show active calls section if there are joinable calls
  const joinableCalls = activeCalls.filter(c => c.initiated_by !== currentUser?.id);
  if (joinableCalls.length > 0) {
    html += `
      <div class="active-calls-section" style="margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border-color, #333);">
        <h4 style="font-size: 12px; text-transform: uppercase; color: #10b981; margin-bottom: 8px;">
          📞 Active Calls (${joinableCalls.length})
        </h4>
        ${joinableCalls.map(call => `
          <div class="active-call-item" style="display: flex; align-items: center; gap: 12px; padding: 8px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; margin-bottom: 8px;">
            <div class="call-icon" style="width: 32px; height: 32px; background: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" width="16" height="16">
                <path d="M15.05 5A5 5 0 0 1 19 8.95M15.05 1A9 9 0 0 1 23 8.94m-1 7.98v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </div>
            <div class="call-info" style="flex: 1;">
              <div style="font-weight: 500;">${escapeHtml(call.initiator_name || 'Unknown')}'s call</div>
              <div style="font-size: 11px; color: var(--text-secondary, #999);">Started ${formatTimeAgo(call.started_at)}</div>
            </div>
            <button class="join-call-btn" data-channel="${call.channel_name}" style="padding: 6px 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">
              Join
            </button>
          </div>
        `).join('')}
      </div>
    `;
  }
  
  // Show online users
  if (otherUsers.length === 0 && joinableCalls.length === 0) {
    html = `
      <p style="color: var(--text-secondary); text-align: center; padding: 20px;">
        No other users online
      </p>
    `;
  } else if (otherUsers.length > 0) {
    html += `
      <h4 style="font-size: 12px; text-transform: uppercase; color: var(--text-secondary, #999); margin-bottom: 8px;">
        Online Users (${otherUsers.length})
      </h4>
    `;
    html += otherUsers.map(user => `
      <div class="presence-user" data-user-id="${user.clerk_user_id}">
        <div class="user-avatar">
          ${user.user_name ? user.user_name.charAt(0).toUpperCase() : '?'}
          <span class="online-indicator ${user.is_online ? '' : 'offline'}"></span>
        </div>
        <div class="user-info">
          <div class="user-name">${escapeHtml(user.user_name || 'Unknown')}</div>
          <div class="user-status">${user.is_online ? 'Online' : 'Away'}</div>
        </div>
        <button class="call-user-btn" data-user-id="${user.clerk_user_id}" data-user-name="${escapeHtml(user.user_name || '')}">
          Call
        </button>
      </div>
    `).join('');
  }
  
  elements.presenceList.innerHTML = html;
  
  // Add click handlers for call buttons
  elements.presenceList.querySelectorAll('.call-user-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userId;
      const userName = btn.dataset.userName;
      handleCallUser(userId, userName);
    });
  });
  
  // Add click handlers for join call buttons
  elements.presenceList.querySelectorAll('.join-call-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const channelName = btn.dataset.channel;
      await handleJoinActiveCall(channelName);
    });
  });
}

/**
 * Handle joining an active call
 */
async function handleJoinActiveCall(channelName) {
  try {
    hideStartCallModal();
    
    // Join the existing call
    await joinCall(channelName, currentUser.id, currentUser.fullName);
    
    showPiPWidget();
    updateCallButton(true);
    
    console.log('📞 Joined active call:', channelName);
  } catch (error) {
    console.error('Join active call error:', error);
    alert('Failed to join call: ' + error.message);
  }
}

/**
 * Format time ago for display
 */
function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'just now';
  if (diffMins === 1) return '1 minute ago';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours === 1) return '1 hour ago';
  return `${diffHours} hours ago`;
}

/**
 * Handle calling a specific user
 */
async function handleCallUser(userId, userName) {
  try {
    hideStartCallModal();
    
    // Start the call
    const { channelName } = await startCall(currentUser.id, currentUser.fullName);
    
    // Send invite to the user
    sendCallInvite(userId, channelName, 'video');
    
    // Also send via API for persistence
    await fetch('/api/video/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelName,
        fromUserId: currentUser.id,
        fromUserName: currentUser.fullName,
        toUserId: userId
      })
    });
    
    showPiPWidget();
    updateCallButton(true);
    
  } catch (error) {
    console.error('Call user error:', error);
    alert('Failed to start call: ' + error.message);
  }
}

/**
 * Handle starting a solo call (waiting for others)
 */
async function handleStartSoloCall() {
  try {
    hideStartCallModal();
    
    await startCall(currentUser.id, currentUser.fullName);
    
    showPiPWidget();
    updateCallButton(true);
    
  } catch (error) {
    console.error('Start solo call error:', error);
    alert('Failed to start call: ' + error.message);
  }
}

/**
 * Handle sending email invite
 */
async function handleSendEmailInvite() {
  const email = elements.inviteEmail?.value?.trim();
  
  if (!email) {
    alert('Please enter an email address');
    return;
  }
  
  try {
    // Start a call first if not already in one
    const state = getCallState();
    let channelName = state.channelName;
    
    if (!state.inCall) {
      const result = await startCall(currentUser.id, currentUser.fullName);
      channelName = result.channelName;
      showPiPWidget();
      updateCallButton(true);
    }
    
    // Send email invite
    const response = await fetch('/api/video/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelName,
        fromUserId: currentUser.id,
        fromUserName: currentUser.fullName,
        toEmail: email
      })
    });
    
    const result = await response.json();
    
    if (result.success) {
      alert(`Invite sent to ${email}`);
      elements.inviteEmail.value = '';
      hideStartCallModal();
    } else {
      throw new Error(result.error);
    }
    
  } catch (error) {
    console.error('Email invite error:', error);
    alert('Failed to send invite: ' + error.message);
  }
}

/**
 * Show incoming call modal
 */
function showIncomingCallModal(fromUserName) {
  if (elements.callerName) {
    elements.callerName.textContent = fromUserName || 'Unknown';
  }
  if (elements.callerAvatar) {
    elements.callerAvatar.textContent = fromUserName ? fromUserName.charAt(0).toUpperCase() : '?';
  }
  elements.incomingCallModal?.classList.remove('hidden');
}

/**
 * Hide incoming call modal
 */
function hideIncomingCallModal() {
  elements.incomingCallModal?.classList.add('hidden');
  pendingIncomingCall = null;
}

/**
 * Handle accepting incoming call
 */
async function handleAcceptCall() {
  if (!pendingIncomingCall) return;
  
  try {
    hideIncomingCallModal();
    
    // Send response via WebSocket
    sendCallResponse(pendingIncomingCall.fromUserId, pendingIncomingCall.channelName, true);
    
    // Join the call
    await joinCall(pendingIncomingCall.channelName, currentUser.id, currentUser.fullName);
    
    showPiPWidget();
    updateCallButton(true);
    
  } catch (error) {
    console.error('Accept call error:', error);
    alert('Failed to join call: ' + error.message);
  }
}

/**
 * Handle declining incoming call
 */
function handleDeclineCall() {
  if (pendingIncomingCall) {
    sendCallResponse(pendingIncomingCall.fromUserId, pendingIncomingCall.channelName, false);
  }
  hideIncomingCallModal();
}

/**
 * Show PiP widget
 */
function showPiPWidget() {
  elements.pipWidget?.classList.remove('hidden');
  setPiPMode(true);
  
  // Play videos
  playLocalVideo('pip-local-video');
  
  const remoteUsers = getRemoteUsers();
  if (remoteUsers.length > 0) {
    playRemoteVideo(remoteUsers[0].uid, 'pip-remote-video');
  }
}

/**
 * Hide PiP widget
 */
function hidePiPWidget() {
  elements.pipWidget?.classList.add('hidden');
  setPiPMode(false);
}

/**
 * Update call button state
 */
function updateCallButton(inCall) {
  if (elements.videoCallBtn) {
    elements.videoCallBtn.classList.toggle('in-call', inCall);
    const span = elements.videoCallBtn.querySelector('span');
    if (span) {
      span.textContent = inCall ? 'In Call' : 'Call';
    }
  }
}

// PiP Control Handlers
function handleExpandClick() {
  // TODO: Open full call panel
  console.log('Expand to full panel');
}

function handleMinimizeClick() {
  elements.pipWidget?.classList.toggle('minimized');
}

async function handleMuteClick() {
  const isMuted = await toggleMute();
  elements.pipMuteBtn?.classList.toggle('active', isMuted);
}

async function handleVideoClick() {
  const isOff = await toggleVideo();
  elements.pipVideoBtn?.classList.toggle('active', isOff);
}

async function handleEndClick() {
  await leaveCall();
  hidePiPWidget();
  updateCallButton(false);
}

// Video Call Callbacks
function handleUserJoined(user) {
  console.log('📹 User joined:', user.uid);
  // Play remote video
  setTimeout(() => {
    playRemoteVideo(user.uid, 'pip-remote-video');
  }, 500);
}

function handleUserLeft(user) {
  console.log('📹 User left:', user.uid);
}

function handleCallEnded() {
  hidePiPWidget();
  updateCallButton(false);
}

function handleLocalTrackReady(videoTrack) {
  playLocalVideo('pip-local-video');
}

function handleCallError(error) {
  console.error('📹 Call error:', error);
  alert('Call error: ' + error.message);
}

// Presence Callbacks
function handlePresenceUpdate(users) {
  console.log('👤 Presence update:', users.length, 'users');
  // Update the presence list if modal is open
  if (!elements.startCallModal?.classList.contains('hidden')) {
    updatePresenceList();
  }
}

function handleIncomingCall(data) {
  console.log('📞 Incoming call from:', data.fromUserName);
  pendingIncomingCall = data;
  showIncomingCallModal(data.fromUserName);
}

function handleCallResponse(data) {
  if (data.accepted) {
    console.log('📞 Call accepted by:', data.fromUserName);
  } else {
    console.log('📞 Call declined by:', data.fromUserName);
    alert(`${data.fromUserName || 'User'} declined the call`);
  }
}

function handlePendingInvitations(invitations) {
  if (invitations.length > 0) {
    const latest = invitations[0];
    pendingIncomingCall = {
      channelName: latest.channel_name,
      fromUserId: latest.from_user_id,
      fromUserName: latest.from_user_name
    };
    showIncomingCallModal(latest.from_user_name);
  }
}

function handleConnectionChange(connected) {
  console.log('👤 Presence connection:', connected ? 'connected' : 'disconnected');
}

/**
 * Make element draggable
 */
function makeDraggable(element) {
  if (!element) return;
  
  let isDragging = false;
  let startX, startY, startLeft, startTop;
  
  const header = element.querySelector('.pip-header');
  if (!header) return;
  
  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('button')) return;
    
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    
    const rect = element.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });
  
  function handleMouseMove(e) {
    if (!isDragging) return;
    
    const deltaX = e.clientX - startX;
    const deltaY = e.clientY - startY;
    
    element.style.left = `${startLeft + deltaX}px`;
    element.style.top = `${startTop + deltaY}px`;
    element.style.right = 'auto';
    element.style.bottom = 'auto';
  }
  
  function handleMouseUp() {
    isDragging = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }
}

/**
 * Escape HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Export for global access
window.MarineStreamVideoUI = {
  initVideoUI
};
