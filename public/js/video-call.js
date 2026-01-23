/**
 * MarineStream Workspace - Video Call Manager
 * Agora SDK wrapper for video calling functionality
 */

// Agora client and tracks
let agoraClient = null;
let localAudioTrack = null;
let localVideoTrack = null;
let screenTrack = null;
let remoteUsers = new Map();

// Call state
const callState = {
  inCall: false,
  channelName: null,
  callId: null,
  isMuted: false,
  isVideoOff: false,
  isScreenSharing: false,
  isPiPMode: false,
  participants: []
};

// Agora configuration
let agoraConfig = {
  appId: null,
  configured: false
};

// Event callbacks
const eventCallbacks = {
  onUserJoined: null,
  onUserLeft: null,
  onCallEnded: null,
  onLocalTrackReady: null,
  onError: null
};

/**
 * Initialize video call module
 */
export async function initVideoCall() {
  try {
    // Load Agora SDK via CDN if not already loaded
    if (!window.AgoraRTC) {
      await loadAgoraSDK();
    }

    // Get Agora config from server
    const configResponse = await fetch('/api/video/config');
    const configResult = await configResponse.json();
    
    if (configResult.success && configResult.data.configured) {
      agoraConfig.appId = configResult.data.appId;
      agoraConfig.configured = true;
      console.log('📹 Video calling initialized');
    } else {
      console.warn('📹 Video calling not configured - Agora credentials missing');
    }

    // Restore call state from localStorage if exists
    restoreCallState();

    return agoraConfig.configured;
  } catch (error) {
    console.error('Video call init error:', error);
    return false;
  }
}

/**
 * Load Agora SDK from CDN
 */
function loadAgoraSDK() {
  return new Promise((resolve, reject) => {
    if (window.AgoraRTC) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://download.agora.io/sdk/release/AgoraRTC_N-4.20.0.js';
    script.async = true;
    script.onload = () => {
      console.log('📹 Agora SDK loaded');
      resolve();
    };
    script.onerror = () => {
      reject(new Error('Failed to load Agora SDK'));
    };
    document.head.appendChild(script);
  });
}

/**
 * Start a new video call
 */
export async function startCall(userId, userName, callType = 'video') {
  if (!agoraConfig.configured) {
    throw new Error('Video calling not configured');
  }

  if (callState.inCall) {
    throw new Error('Already in a call');
  }

  try {
    // Request call token and channel from server
    const response = await fetch('/api/video/call/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, userName, callType })
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error);
    }

    const { channelName, token, callId } = result.data;

    // Join the channel
    await joinChannel(channelName, token, callType);

    callState.callId = callId;
    saveCallState();

    return { channelName, callId };
  } catch (error) {
    console.error('Start call error:', error);
    throw error;
  }
}

/**
 * Join an existing call
 */
export async function joinCall(channelName, userId, userName) {
  if (!agoraConfig.configured) {
    throw new Error('Video calling not configured');
  }

  if (callState.inCall) {
    throw new Error('Already in a call');
  }

  try {
    // Request token from server
    const response = await fetch('/api/video/call/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName, userId, userName })
    });

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error);
    }

    const { token, callId } = result.data;

    // Join the channel
    await joinChannel(channelName, token, 'video');

    callState.callId = callId;
    saveCallState();

    return { channelName, callId };
  } catch (error) {
    console.error('Join call error:', error);
    throw error;
  }
}

/**
 * Internal: Join Agora channel
 */
async function joinChannel(channelName, token, callType) {
  // Create Agora client
  agoraClient = window.AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

  // Set up event handlers
  agoraClient.on('user-published', handleUserPublished);
  agoraClient.on('user-unpublished', handleUserUnpublished);
  agoraClient.on('user-joined', handleUserJoined);
  agoraClient.on('user-left', handleUserLeft);

  // Join channel
  await agoraClient.join(agoraConfig.appId, channelName, token, null);

  // Create and publish local tracks
  if (callType === 'video' || callType === 'screen_share') {
    [localAudioTrack, localVideoTrack] = await window.AgoraRTC.createMicrophoneAndCameraTracks();
    await agoraClient.publish([localAudioTrack, localVideoTrack]);
  } else {
    // Audio only
    localAudioTrack = await window.AgoraRTC.createMicrophoneAudioTrack();
    await agoraClient.publish([localAudioTrack]);
  }

  callState.inCall = true;
  callState.channelName = channelName;

  // Trigger callback
  if (eventCallbacks.onLocalTrackReady) {
    eventCallbacks.onLocalTrackReady(localVideoTrack);
  }

  console.log(`📹 Joined channel: ${channelName}`);
}

/**
 * Leave the current call
 */
export async function leaveCall() {
  if (!callState.inCall) {
    return;
  }

  try {
    // Stop and close local tracks
    if (localAudioTrack) {
      localAudioTrack.stop();
      localAudioTrack.close();
      localAudioTrack = null;
    }
    if (localVideoTrack) {
      localVideoTrack.stop();
      localVideoTrack.close();
      localVideoTrack = null;
    }
    if (screenTrack) {
      screenTrack.stop();
      screenTrack.close();
      screenTrack = null;
    }

    // Leave channel
    if (agoraClient) {
      await agoraClient.leave();
      agoraClient = null;
    }

    // Notify server
    await fetch('/api/video/call/end', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelName: callState.channelName })
    });

    // Clear state
    remoteUsers.clear();
    callState.inCall = false;
    callState.channelName = null;
    callState.callId = null;
    callState.isPiPMode = false;
    
    clearCallState();

    // Trigger callback
    if (eventCallbacks.onCallEnded) {
      eventCallbacks.onCallEnded();
    }

    console.log('📹 Left call');
  } catch (error) {
    console.error('Leave call error:', error);
  }
}

/**
 * Toggle microphone mute
 */
export async function toggleMute() {
  if (!localAudioTrack) return callState.isMuted;

  callState.isMuted = !callState.isMuted;
  await localAudioTrack.setEnabled(!callState.isMuted);
  
  return callState.isMuted;
}

/**
 * Toggle camera
 */
export async function toggleVideo() {
  if (!localVideoTrack) return callState.isVideoOff;

  callState.isVideoOff = !callState.isVideoOff;
  await localVideoTrack.setEnabled(!callState.isVideoOff);
  
  return callState.isVideoOff;
}

/**
 * Toggle screen sharing
 */
export async function toggleScreenShare() {
  if (!agoraClient || !callState.inCall) return false;

  try {
    if (callState.isScreenSharing) {
      // Stop screen share
      if (screenTrack) {
        await agoraClient.unpublish(screenTrack);
        screenTrack.stop();
        screenTrack.close();
        screenTrack = null;
      }
      
      // Re-publish camera
      if (localVideoTrack) {
        await agoraClient.publish(localVideoTrack);
      }
      
      callState.isScreenSharing = false;
    } else {
      // Start screen share
      screenTrack = await window.AgoraRTC.createScreenVideoTrack();
      
      // Unpublish camera and publish screen
      if (localVideoTrack) {
        await agoraClient.unpublish(localVideoTrack);
      }
      await agoraClient.publish(screenTrack);
      
      // Handle user stopping screen share via browser UI
      screenTrack.on('track-ended', async () => {
        await toggleScreenShare();
      });
      
      callState.isScreenSharing = true;
    }
    
    return callState.isScreenSharing;
  } catch (error) {
    console.error('Screen share error:', error);
    return callState.isScreenSharing;
  }
}

/**
 * Play local video in container
 */
export function playLocalVideo(containerId) {
  const track = callState.isScreenSharing ? screenTrack : localVideoTrack;
  if (track) {
    track.play(containerId);
  }
}

/**
 * Play remote video in container
 */
export function playRemoteVideo(uid, containerId) {
  const user = remoteUsers.get(uid);
  if (user && user.videoTrack) {
    user.videoTrack.play(containerId);
  }
}

/**
 * Get call state
 */
export function getCallState() {
  return { ...callState };
}

/**
 * Get remote users
 */
export function getRemoteUsers() {
  return Array.from(remoteUsers.values());
}

/**
 * Set event callbacks
 */
export function setCallbacks(callbacks) {
  Object.assign(eventCallbacks, callbacks);
}

/**
 * Toggle PiP mode
 */
export function setPiPMode(enabled) {
  callState.isPiPMode = enabled;
  saveCallState();
  return callState.isPiPMode;
}

// Event Handlers
async function handleUserPublished(user, mediaType) {
  await agoraClient.subscribe(user, mediaType);
  
  if (mediaType === 'video') {
    remoteUsers.set(user.uid, {
      uid: user.uid,
      videoTrack: user.videoTrack,
      audioTrack: remoteUsers.get(user.uid)?.audioTrack
    });
  }
  
  if (mediaType === 'audio') {
    remoteUsers.set(user.uid, {
      uid: user.uid,
      videoTrack: remoteUsers.get(user.uid)?.videoTrack,
      audioTrack: user.audioTrack
    });
    user.audioTrack.play();
  }
  
  console.log(`📹 Remote user ${user.uid} published ${mediaType}`);
}

async function handleUserUnpublished(user, mediaType) {
  if (mediaType === 'video') {
    const remoteUser = remoteUsers.get(user.uid);
    if (remoteUser) {
      remoteUser.videoTrack = null;
    }
  }
  console.log(`📹 Remote user ${user.uid} unpublished ${mediaType}`);
}

function handleUserJoined(user) {
  remoteUsers.set(user.uid, { uid: user.uid });
  callState.participants.push(user.uid);
  
  if (eventCallbacks.onUserJoined) {
    eventCallbacks.onUserJoined(user);
  }
  
  console.log(`📹 Remote user ${user.uid} joined`);
}

function handleUserLeft(user) {
  remoteUsers.delete(user.uid);
  callState.participants = callState.participants.filter(p => p !== user.uid);
  
  if (eventCallbacks.onUserLeft) {
    eventCallbacks.onUserLeft(user);
  }
  
  console.log(`📹 Remote user ${user.uid} left`);
}

// State persistence for PiP across page navigation
function saveCallState() {
  if (callState.inCall) {
    localStorage.setItem('marinestream_call_state', JSON.stringify({
      channelName: callState.channelName,
      callId: callState.callId,
      isPiPMode: callState.isPiPMode,
      timestamp: Date.now()
    }));
  }
}

function restoreCallState() {
  try {
    const saved = localStorage.getItem('marinestream_call_state');
    if (saved) {
      const state = JSON.parse(saved);
      // Only restore if saved within last 2 hours
      if (Date.now() - state.timestamp < 2 * 60 * 60 * 1000) {
        callState.channelName = state.channelName;
        callState.callId = state.callId;
        callState.isPiPMode = state.isPiPMode;
        return state;
      } else {
        clearCallState();
      }
    }
  } catch (e) {
    clearCallState();
  }
  return null;
}

function clearCallState() {
  localStorage.removeItem('marinestream_call_state');
}

/**
 * Check if there's an active call to rejoin
 */
export function hasActiveCall() {
  const saved = restoreCallState();
  return saved !== null;
}

/**
 * Rejoin a call after page navigation
 */
export async function rejoinCall(userId, userName) {
  const saved = restoreCallState();
  if (saved && saved.channelName) {
    try {
      await joinCall(saved.channelName, userId, userName);
      callState.isPiPMode = saved.isPiPMode;
      return true;
    } catch (error) {
      console.error('Rejoin call error:', error);
      clearCallState();
      return false;
    }
  }
  return false;
}

// Export for global access
window.MarineStreamVideoCall = {
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
};
