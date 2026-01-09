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
const usersRoutes = require('./routes/users');
const mapRoutes = require('./routes/map');
const configRoutes = require('./routes/config');
const marinestreamRoutes = require('./routes/marinestream');
const oauthRoutes = require('./routes/oauth');

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
app.use('/api/users', usersRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/marinestream', marinestreamRoutes);

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

function connectToAISStream() {
  if (!process.env.AISSTREAM_API_KEY) {
    console.warn('⚠️  AISSTREAM_API_KEY not configured - vessel tracking disabled');
    return;
  }

  aisConnection = new WebSocket('wss://stream.aisstream.io/v0/stream');

  aisConnection.on('open', async () => {
    console.log('✅ Connected to AISstream.io');
    
    // Get tracked vessels from database
    try {
      const result = await db.query(
        'SELECT mmsi FROM vessels WHERE is_tracked = true AND mmsi IS NOT NULL'
      );
      const mmsiList = result.rows.map(r => r.mmsi);
      
      if (mmsiList.length === 0) {
        console.log('ℹ️  No vessels to track - using demo bounding box');
        // Demo: Track vessels around Australian waters
        aisConnection.send(JSON.stringify({
          APIKey: process.env.AISSTREAM_API_KEY,
          BoundingBoxes: [[[-45, 110], [-10, 155]]] // Australia region
        }));
      } else {
        console.log(`📡 Tracking ${mmsiList.length} vessels`);
        aisConnection.send(JSON.stringify({
          APIKey: process.env.AISSTREAM_API_KEY,
          FiltersShipMMSI: mmsiList
        }));
      }
    } catch (err) {
      console.error('Database error getting vessels:', err.message);
      // Fallback to bounding box
      aisConnection.send(JSON.stringify({
        APIKey: process.env.AISSTREAM_API_KEY,
        BoundingBoxes: [[[-45, 110], [-10, 155]]]
      }));
    }
  });

  aisConnection.on('message', (data) => {
    // Relay to all connected clients
    const message = data.toString();
    connectedClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
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
