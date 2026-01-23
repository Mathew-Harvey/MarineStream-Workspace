/**
 * MarineStream Workspace - Main Server
 * Express server with PostgreSQL, Clerk auth, and AIS WebSocket relay
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { WebSocketServer } = require('ws');
const http = require('http');

// Route imports
const authRoutes = require('./routes/auth');
const appsRoutes = require('./routes/apps');
const vesselsRoutes = require('./routes/vessels');
const fleetsRoutes = require('./routes/fleets');
const usersRoutes = require('./routes/users');
const mapRoutes = require('./routes/map');
const configRoutes = require('./routes/config');
const marinestreamRoutes = require('./routes/marinestream');
const oauthRoutes = require('./routes/oauth');
const syncRoutes = require('./routes/sync');
const jobsRoutes = require('./routes/jobs');
const videoRoutes = require('./routes/video');

// Authoritative MMSI Registry - NEVER overwrite with blank/invalid data
let mmsiRegistry;
try {
  mmsiRegistry = require('./data/vesselMmsiRegistry');
  console.log(`✓ Loaded authoritative MMSI registry: ${mmsiRegistry.getAllValidMmsiNumbers().length} vessels with valid MMSI`);
} catch (e) {
  console.warn('⚠️ MMSI Registry not available:', e.message);
  mmsiRegistry = null;
}

// AIS position cache (shared between routes and WebSocket handler)
const aisPositionCache = mapRoutes.vesselPositions;

// Database
const db = require('./db');

const app = express();
const server = http.createServer(app);

// WebSocket servers - use noServer mode for proper path-based routing
const wss = new WebSocketServer({ noServer: true });
const presenceWss = new WebSocketServer({ noServer: true });
const presenceClients = new Map(); // Map of userId -> ws connection

// Handle WebSocket upgrades manually for proper path routing
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  
  if (pathname === '/api/map/stream') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else if (pathname === '/api/presence/stream') {
    presenceWss.handleUpgrade(request, socket, head, (ws) => {
      presenceWss.emit('connection', ws, request);
    });
  } else {
    // Unknown WebSocket path - destroy the socket
    socket.destroy();
  }
});

// Middleware - CORS configuration for production and development
const allowedOrigins = [
  'http://localhost:3000',
  'https://marinestream-workspace.onrender.com',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || origin.endsWith('.onrender.com')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Serve assets from assets directory
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    service: 'MarineStream Workspace'
  });
});

// API Routes
app.use('/api/config', configRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/apps', appsRoutes);
app.use('/api/vessels', vesselsRoutes);
app.use('/api/fleets', fleetsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/marinestream', marinestreamRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/video', videoRoutes);

// Auth callback page
app.get('/auth/callback', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/auth/callback.html'));
});

// SPA fallback - serve index.html for all non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// AIS WebSocket relay setup
const WebSocket = require('ws');
let aisConnection = null;
const connectedClients = new Set();
let currentTrackedMMSI = new Set(); // Track which MMSIs we're subscribed to
let discoveredFleetMMSI = []; // Store MMSI discovered from fleet API (persists across reconnects)

// Initialize with authoritative MMSI registry on startup
if (mmsiRegistry) {
  discoveredFleetMMSI = mmsiRegistry.getAllValidMmsiNumbers();
  console.log(`📡 Pre-loaded ${discoveredFleetMMSI.length} authoritative MMSI for AIS tracking`);
}

// Function to update AIS subscription with new MMSI list
function updateAISSubscription(mmsiList) {
  // Filter to valid MMSI (9 digits, not placeholder patterns)
  const validMMSI = mmsiList.filter(m => {
    if (!m || typeof m !== 'string') return false;
    // Must be 9 digits
    if (m.length !== 9) return false;
    // Skip placeholder-looking MMSI (503000xxx pattern used in demo data)
    if (/^50300\d{4}$/.test(m)) return false;
    return true;
  });
  
  // MERGE with authoritative registry - NEVER lose registry MMSI
  let allMMSI = [...validMMSI];
  if (mmsiRegistry) {
    const registryMMSI = mmsiRegistry.getAllValidMmsiNumbers();
    const merged = new Set([...allMMSI, ...registryMMSI]);
    allMMSI = [...merged];
  }
  
  // Store for reconnections
  if (allMMSI.length > 0) {
    discoveredFleetMMSI = allMMSI;
    console.log(`💾 Stored ${allMMSI.length} MMSI for AIS tracking (${validMMSI.length} from API + registry)`);
  }
  
  if (!aisConnection || aisConnection.readyState !== WebSocket.OPEN) {
    console.log('⚠️ Cannot update AIS subscription - not connected (will apply on reconnect)');
    return false;
  }
  
  if (allMMSI.length === 0) {
    console.log('ℹ️ No valid MMSI numbers to track via AIS');
    return false;
  }
  
  // Check if we need to update
  const newSet = new Set(allMMSI);
  const hasChanges = allMMSI.some(m => !currentTrackedMMSI.has(m)) || 
                     [...currentTrackedMMSI].some(m => !newSet.has(m));
  
  if (!hasChanges && currentTrackedMMSI.size > 0) {
    console.log('ℹ️ AIS subscription unchanged');
    return true;
  }
  
  currentTrackedMMSI = newSet;
  
  console.log(`📡 Updating AIS subscription: ${allMMSI.length} vessels`);
  allMMSI.slice(0, 10).forEach(m => console.log(`   - MMSI: ${m}`));
  if (allMMSI.length > 10) console.log(`   ... and ${allMMSI.length - 10} more`);
  
  // Send updated subscription
  aisConnection.send(JSON.stringify({
    APIKey: process.env.AISSTREAM_API_KEY,
    BoundingBoxes: [[[-90, -180], [90, 180]]], // World-wide 
    FiltersShipMMSI: allMMSI,
    FilterMessageTypes: ['PositionReport', 'ShipStaticData']
  }));
  
  return true;
}

// Store reference for route handlers to access
app.updateAISSubscription = updateAISSubscription;

function connectToAISStream() {
  if (!process.env.AISSTREAM_API_KEY) {
    console.warn('⚠️  AISSTREAM_API_KEY not configured - vessel tracking disabled');
    return;
  }

  aisConnection = new WebSocket('wss://stream.aisstream.io/v0/stream');

  aisConnection.on('open', async () => {
    console.log('✅ Connected to AISstream.io');
    
    // WORLDWIDE bounding box - we track vessels globally (SAAM Towage operates in Canada, etc.)
    const worldwideBounds = [[[-90, -180], [90, 180]]];
    
    // PRIORITY 1: Use discovered fleet MMSI (from MarineStream API)
    if (discoveredFleetMMSI.length > 0) {
      console.log(`📡 Using ${discoveredFleetMMSI.length} discovered fleet MMSI for AIS tracking (worldwide)`);
      discoveredFleetMMSI.forEach(m => console.log(`   - MMSI: ${m}`));
      currentTrackedMMSI = new Set(discoveredFleetMMSI);
      
      aisConnection.send(JSON.stringify({
        APIKey: process.env.AISSTREAM_API_KEY,
        BoundingBoxes: worldwideBounds,
        FiltersShipMMSI: discoveredFleetMMSI,
        FilterMessageTypes: ['PositionReport', 'ShipStaticData']
      }));
      return;
    }
    
    // PRIORITY 2: Use worldwide bounding box to catch all vessels
    // This allows us to track SAAM Towage (Canada), Royal Navy (UK), USN (global), etc.
    console.log('🌍 Using worldwide bounding box for AIS (waiting for fleet MMSI from dashboard)');
    console.log('   Fleet data will update subscription with specific MMSI on first dashboard load');
    
    aisConnection.send(JSON.stringify({
      APIKey: process.env.AISSTREAM_API_KEY,
      BoundingBoxes: worldwideBounds,
      FilterMessageTypes: ['PositionReport', 'ShipStaticData']
    }));
  });

  aisConnection.on('message', (data) => {
    // Parse and store the AIS message
    try {
      const message = JSON.parse(data.toString());
      
      // Store position data in cache
      if (message.MessageType === 'PositionReport' && message.MetaData) {
        const mmsi = String(message.MetaData.MMSI);
        const posData = message.Message?.PositionReport || {};
        
        // Update position cache using the map routes function
        mapRoutes.updateVesselPosition(mmsi, {
          Latitude: message.MetaData.latitude,
          Longitude: message.MetaData.longitude,
          Sog: posData.Sog,
          Cog: posData.Cog,
          TrueHeading: posData.TrueHeading,
          NavigationalStatus: posData.NavigationalStatus,
          ShipName: message.MetaData.ShipName,
          Timestamp: message.MetaData.time_utc
        });
        
        console.log(`📍 AIS Position: ${message.MetaData.ShipName || mmsi} @ ${message.MetaData.latitude?.toFixed(4)}, ${message.MetaData.longitude?.toFixed(4)}`);
      }
      
      // Also handle ShipStaticData for vessel info
      if (message.MessageType === 'ShipStaticData' && message.MetaData) {
        const mmsi = String(message.MetaData.MMSI);
        const staticData = message.Message?.ShipStaticData || {};
        
        // Merge with existing position if available
        const existing = aisPositionCache.get(mmsi) || {};
        aisPositionCache.set(mmsi, {
          ...existing,
          shipName: staticData.Name || message.MetaData.ShipName,
          callSign: staticData.CallSign,
          imo: staticData.ImoNumber,
          shipType: staticData.Type,
          destination: staticData.Destination,
          dimensions: staticData.Dimension
        });
      }
      
      // Relay to all connected clients (only valid JSON)
      const jsonStr = JSON.stringify(message);
      connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(jsonStr);
          } catch (sendErr) {
            console.error('Error sending to client:', sendErr.message);
          }
        }
      });
    } catch (err) {
      // If parse fails, don't relay - could be malformed data
      console.warn('Failed to parse AIS message, not relaying:', err.message);
    }
  });

  aisConnection.on('close', () => {
    console.log('🔌 AISstream connection closed - reconnecting in 5s...');
    setTimeout(connectToAISStream, 5000);
  });

  aisConnection.on('error', (err) => {
    console.error('AISstream error:', err.message);
  });
}

// Handle client WebSocket connections (AIS)
wss.on('connection', (ws, req) => {
  console.log('📱 Client connected to vessel stream');
  connectedClients.add(ws);

  ws.on('close', () => {
    connectedClients.delete(ws);
    console.log('📱 Client disconnected from vessel stream');
  });

  ws.on('error', (err) => {
    console.error('Client WebSocket error:', err.message);
    connectedClients.delete(ws);
  });
});

// Handle presence WebSocket connections
presenceWss.on('connection', (ws, req) => {
  console.log('👤 Client connected to presence stream');
  let userId = null;
  let userName = null;

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      switch (message.type) {
        case 'register':
          // User registers their presence
          userId = message.userId;
          userName = message.userName;
          presenceClients.set(userId, ws);
          
          // Update database (with error handling for missing tables)
          try {
            await db.query(`
              INSERT INTO user_presence (clerk_user_id, user_email, user_name, is_online, socket_id, current_page, updated_at)
              VALUES ($1, $2, $3, true, $4, $5, NOW())
              ON CONFLICT (clerk_user_id) DO UPDATE SET
                is_online = true,
                user_name = COALESCE($3, user_presence.user_name),
                socket_id = $4,
                current_page = $5,
                last_seen = NOW(),
                updated_at = NOW()
            `, [userId, message.userEmail, userName, `ws-${Date.now()}`, message.page || '/']);
            
            console.log(`👤 User registered: ${userName || userId}`);
            
            // Broadcast updated presence list
            broadcastPresence();
            
            // Send pending call invitations
            const pendingResult = await db.query(`
              SELECT ci.*, ch.status as call_status
              FROM call_invitations ci
              LEFT JOIN call_history ch ON ci.channel_name = ch.channel_name
              WHERE ci.to_user_id = $1 
                AND ci.status = 'pending'
                AND ci.expires_at > NOW()
                AND (ch.status IS NULL OR ch.status = 'active')
            `, [userId]);
            
            if (pendingResult.rows.length > 0) {
              ws.send(JSON.stringify({
                type: 'pending_invitations',
                invitations: pendingResult.rows
              }));
            }
          } catch (dbErr) {
            // Tables may not exist yet - continue without DB
            console.warn('Presence DB error (tables may not exist):', dbErr.message);
          }
          break;

        case 'page_change':
          // User navigated to a different page
          if (userId) {
            try {
              await db.query(`
                UPDATE user_presence SET current_page = $1, updated_at = NOW()
                WHERE clerk_user_id = $2
              `, [message.page, userId]);
            } catch (dbErr) {
              // Ignore DB errors for page change
            }
          }
          break;

        case 'call_invite':
          // Forward call invitation to target user
          const targetWs = presenceClients.get(message.toUserId);
          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: 'incoming_call',
              channelName: message.channelName,
              fromUserId: userId,
              fromUserName: userName,
              callType: message.callType || 'video'
            }));
          }
          break;

        case 'call_response':
          // Forward call response to caller
          const callerWs = presenceClients.get(message.toUserId);
          if (callerWs && callerWs.readyState === WebSocket.OPEN) {
            callerWs.send(JSON.stringify({
              type: 'call_response',
              accepted: message.accepted,
              fromUserId: userId,
              fromUserName: userName,
              channelName: message.channelName
            }));
          }
          break;

        case 'heartbeat':
          // Keep connection alive and update last_seen
          if (userId) {
            try {
              await db.query(`
                UPDATE user_presence SET last_seen = NOW(), updated_at = NOW()
                WHERE clerk_user_id = $1
              `, [userId]);
            } catch (dbErr) {
              // Ignore DB errors for heartbeat
            }
          }
          ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
          break;
      }
    } catch (err) {
      console.error('Presence message error:', err);
    }
  });

  ws.on('close', async () => {
    if (userId) {
      presenceClients.delete(userId);
      
      // Update database (with error handling)
      try {
        await db.query(`
          UPDATE user_presence SET is_online = false, last_seen = NOW(), updated_at = NOW()
          WHERE clerk_user_id = $1
        `, [userId]);
        console.log(`👤 User disconnected: ${userName || userId}`);
        // Broadcast updated presence list
        broadcastPresence();
      } catch (dbErr) {
        console.log(`👤 User disconnected: ${userName || userId} (DB update skipped)`);
      }
    }
  });

  ws.on('error', (err) => {
    console.error('Presence WebSocket error:', err.message);
    if (userId) {
      presenceClients.delete(userId);
    }
  });
});

// Broadcast presence list to all connected clients
async function broadcastPresence() {
  try {
    let users = [];
    try {
      const result = await db.query(`
        SELECT clerk_user_id, user_name, user_email, is_online, current_page, last_seen
        FROM user_presence
        WHERE is_online = true OR last_seen > NOW() - INTERVAL '5 minutes'
        ORDER BY is_online DESC, last_seen DESC
      `);
      users = result.rows;
    } catch (dbErr) {
      // Tables may not exist - use in-memory presence
      users = Array.from(presenceClients.keys()).map(id => ({
        clerk_user_id: id,
        is_online: true
      }));
    }
    
    const message = JSON.stringify({
      type: 'presence_update',
      users: users
    });
    
    presenceClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  } catch (err) {
    console.error('Broadcast presence error:', err);
  }
}

// Store reference for route handlers
app.presenceClients = presenceClients;
app.broadcastPresence = broadcastPresence;

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'production' 
        ? 'An internal error occurred' 
        : err.message
    }
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║                                                           ║
║   🚢  MarineStream Workspace                              ║
║   ━━━━━━━━━━━━━━━━━━━━━━                                  ║
║                                                           ║
║   Server running on port ${PORT}                            ║
║   http://localhost:${PORT}                                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
  `);

  // Connect to AIS stream
  connectToAISStream();
});

module.exports = { app, server };
