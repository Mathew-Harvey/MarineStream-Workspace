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
const marinesiaRoutes = require('./routes/marinesia');

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

// WebSocket server for AIS relay
const wss = new WebSocketServer({ server, path: '/api/map/stream' });

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
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
app.use('/api/apps', appsRoutes);
app.use('/api/vessels', vesselsRoutes);
app.use('/api/fleets', fleetsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/marinestream', marinestreamRoutes);
app.use('/api/marinesia', marinesiaRoutes);

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
      
      // Relay to all connected clients
      connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data.toString());
        }
      });
    } catch (err) {
      // If parse fails, still relay the raw message
      connectedClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(data.toString());
        }
      });
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

// Handle client WebSocket connections
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
