/**
 * MarineStream Workspace - User Presence Manager
 * WebSocket-based presence tracking and call signaling
 */

let presenceSocket = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
let heartbeatInterval = null;
let reconnectTimeout = null;
let isInitialized = false;

// Presence state
const presenceState = {
  connected: false,
  userId: null,
  userName: null,
  userEmail: null,
  onlineUsers: [],
  pendingInvitations: []
};

// Event callbacks
const presenceCallbacks = {
  onPresenceUpdate: null,
  onIncomingCall: null,
  onCallResponse: null,
  onPendingInvitations: null,
  onConnectionChange: null
};

/**
 * Initialize presence tracking
 */
export function initPresence(userId, userName, userEmail) {
  // Prevent double initialization
  if (isInitialized && presenceState.userId === userId) {
    console.log('👤 Presence already initialized for this user');
    return;
  }
  
  presenceState.userId = userId;
  presenceState.userName = userName;
  presenceState.userEmail = userEmail;
  isInitialized = true;
  
  // Cancel any pending reconnect
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  connect();
}

/**
 * Connect to presence WebSocket
 */
function connect() {
  // Don't connect if not initialized or already connected
  if (!isInitialized || !presenceState.userId) {
    console.log('👤 Presence not initialized, skipping connect');
    return;
  }
  
  if (presenceSocket && presenceSocket.readyState === WebSocket.OPEN) {
    console.log('👤 Presence already connected');
    return;
  }
  
  // Close any existing socket first
  if (presenceSocket) {
    try {
      presenceSocket.close();
    } catch (e) {
      // Ignore close errors
    }
    presenceSocket = null;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/api/presence/stream`;

  try {
    console.log('👤 Connecting to presence stream...');
    presenceSocket = new WebSocket(wsUrl);

    presenceSocket.onopen = () => {
      console.log('👤 Presence connected');
      presenceState.connected = true;
      reconnectAttempts = 0;

      // Register user
      send({
        type: 'register',
        userId: presenceState.userId,
        userName: presenceState.userName,
        userEmail: presenceState.userEmail,
        page: window.location.pathname
      });

      // Start heartbeat
      startHeartbeat();

      if (presenceCallbacks.onConnectionChange) {
        presenceCallbacks.onConnectionChange(true);
      }
    };

    presenceSocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        handleMessage(message);
      } catch (err) {
        console.error('Presence message parse error:', err);
      }
    };

    presenceSocket.onclose = (event) => {
      console.log('👤 Presence disconnected', event.code, event.reason);
      presenceState.connected = false;
      presenceSocket = null;
      stopHeartbeat();

      if (presenceCallbacks.onConnectionChange) {
        presenceCallbacks.onConnectionChange(false);
      }

      // Attempt reconnect with exponential backoff
      if (isInitialized && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 30000);
        console.log(`👤 Reconnecting in ${delay / 1000}s... (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        reconnectTimeout = setTimeout(connect, delay);
      } else if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.warn('👤 Max reconnect attempts reached. Presence disabled.');
      }
    };

    presenceSocket.onerror = (err) => {
      // Don't log as error, just a warning since WebSocket errors are common
      console.warn('👤 Presence WebSocket error - will retry');
    };
  } catch (err) {
    console.error('Presence connection error:', err);
    // Schedule reconnect
    if (isInitialized && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 30000);
      reconnectTimeout = setTimeout(connect, delay);
    }
  }
}

/**
 * Send message to presence server
 */
function send(message) {
  if (presenceSocket && presenceSocket.readyState === WebSocket.OPEN) {
    presenceSocket.send(JSON.stringify(message));
  }
}

/**
 * Handle incoming messages
 */
function handleMessage(message) {
  switch (message.type) {
    case 'presence_update':
      presenceState.onlineUsers = message.users || [];
      if (presenceCallbacks.onPresenceUpdate) {
        presenceCallbacks.onPresenceUpdate(presenceState.onlineUsers);
      }
      break;

    case 'pending_invitations':
      presenceState.pendingInvitations = message.invitations || [];
      if (presenceCallbacks.onPendingInvitations) {
        presenceCallbacks.onPendingInvitations(presenceState.pendingInvitations);
      }
      break;

    case 'incoming_call':
      if (presenceCallbacks.onIncomingCall) {
        presenceCallbacks.onIncomingCall({
          channelName: message.channelName,
          fromUserId: message.fromUserId,
          fromUserName: message.fromUserName,
          callType: message.callType
        });
      }
      break;

    case 'call_response':
      if (presenceCallbacks.onCallResponse) {
        presenceCallbacks.onCallResponse({
          accepted: message.accepted,
          fromUserId: message.fromUserId,
          fromUserName: message.fromUserName,
          channelName: message.channelName
        });
      }
      break;

    case 'heartbeat_ack':
      // Heartbeat acknowledged
      break;
  }
}

/**
 * Start heartbeat to keep connection alive
 */
function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    send({ type: 'heartbeat' });
  }, 30000); // Every 30 seconds
}

/**
 * Stop heartbeat
 */
function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

/**
 * Send call invitation via WebSocket
 */
export function sendCallInvite(toUserId, channelName, callType = 'video') {
  send({
    type: 'call_invite',
    toUserId,
    channelName,
    callType
  });
}

/**
 * Send call response via WebSocket
 */
export function sendCallResponse(toUserId, channelName, accepted) {
  send({
    type: 'call_response',
    toUserId,
    channelName,
    accepted
  });
}

/**
 * Notify page change
 */
export function notifyPageChange(page) {
  send({
    type: 'page_change',
    page
  });
}

/**
 * Get online users
 */
export function getOnlineUsers() {
  return presenceState.onlineUsers;
}

/**
 * Get pending invitations
 */
export function getPendingInvitations() {
  return presenceState.pendingInvitations;
}

/**
 * Check if user is online
 */
export function isUserOnline(userId) {
  return presenceState.onlineUsers.some(u => u.clerk_user_id === userId && u.is_online);
}

/**
 * Set event callbacks
 */
export function setPresenceCallbacks(callbacks) {
  Object.assign(presenceCallbacks, callbacks);
}

/**
 * Disconnect presence
 */
export function disconnect() {
  // Stop all timers
  stopHeartbeat();
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  // Reset state to prevent reconnection
  isInitialized = false;
  reconnectAttempts = MAX_RECONNECT_ATTEMPTS; // Prevent auto-reconnect
  
  // Close socket
  if (presenceSocket) {
    try {
      presenceSocket.close();
    } catch (e) {
      // Ignore close errors
    }
    presenceSocket = null;
  }
  
  presenceState.connected = false;
  presenceState.onlineUsers = [];
  presenceState.pendingInvitations = [];
}

/**
 * Check if connected
 */
export function isConnected() {
  return presenceState.connected;
}

// Export for global access
window.MarineStreamPresence = {
  initPresence,
  sendCallInvite,
  sendCallResponse,
  notifyPageChange,
  getOnlineUsers,
  getPendingInvitations,
  isUserOnline,
  setPresenceCallbacks,
  disconnect,
  isConnected
};
