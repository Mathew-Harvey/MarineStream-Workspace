# MarineStream Workspace

<div align="center">

![MarineStream Logo](assets/marinestream_logo_white.png)

**Unified Maritime Biofouling Management Portal**

A world-class platform that presents Franmarine's suite of maritime biofouling management tools under a single, cohesive brand identity — featuring real-time fleet tracking, job management, and operational dashboards.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?style=flat&logo=render&logoColor=white)](https://render.com/)

</div>

---

## ✨ Features

- **🗺️ Fleet Command Dashboard** — Real-time vessel tracking with interactive map, calendar widgets, and operational metrics
- **📡 Live AIS Tracking** — Real-time vessel positions via AISstream.io WebSocket with automatic MMSI registry
- **📱 App Launcher** — Quick access to all MarineStream tools in one place
- **🔐 OAuth Authentication** — MarineStream OAuth integration for seamless single sign-on
- **🚢 Fleet Management** — Organize vessels into fleets with colour-coded tracking
- **📊 Widgets System** — Modular dashboard widgets for jobs, calendar, fleet stats, and more
- **🧩 Chrome Extension** — Browser extension for enhanced workflow integration
- **📱 Responsive** — Works flawlessly on desktop and mobile

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 16 or higher
- AISstream.io API key
- Clerk account (for authentication)
- MarineStream API credentials (for fleet data)

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/MarineStream-Workspace.git
cd MarineStream-Workspace

# Install dependencies
npm install

# Copy environment template
cp env.template .env

# Edit .env with your configuration
# (See Configuration section below)

# Initialize database
npm run db:init

# Start development server
npm run dev
```

### Access the Application

- **Main Portal:** [http://localhost:3000](http://localhost:3000)
- **Fleet Dashboard:** [http://localhost:3000/dashboard.html](http://localhost:3000/dashboard.html)

## ⚙️ Configuration

Create a `.env` file in the project root with the following variables:

```env
# Server
PORT=3000
NODE_ENV=development

# Database (Render PostgreSQL)
DATABASE_URL=postgresql://user:password@host:5432/marinestream_workspace

# Clerk Authentication
CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
CLERK_WEBHOOK_SECRET=whsec_xxxxx

# AISstream.io
AISSTREAM_API_KEY=your_aisstream_api_key_here

# Mapbox (for custom map styling - optional, can use free tiles)
MAPBOX_ACCESS_TOKEN=pk.xxxxx

# Application URLs (for CORS)
FRONTEND_URL=http://localhost:3000
```

## 📁 Project Structure

```
MarineStream-Workspace/
├── public/                     # Static frontend files
│   ├── index.html              # Main app launcher page
│   ├── dashboard.html          # Fleet Command dashboard
│   ├── setup.html              # Initial setup wizard
│   ├── auth/
│   │   └── callback.html       # OAuth callback handler
│   ├── css/
│   │   ├── styles.css          # Main design system
│   │   ├── dashboard.css       # Dashboard styles (legacy)
│   │   ├── dashboard-v2.css    # Fleet Command styles
│   │   └── widgets.css         # Widget component styles
│   ├── js/
│   │   ├── app.js              # Main application logic
│   │   ├── auth.js             # Clerk authentication
│   │   ├── auth-oauth.js       # OAuth flow handler
│   │   ├── config.js           # Client configuration
│   │   ├── map.js              # AIS vessel map
│   │   ├── map-utils.js        # Map helper utilities
│   │   ├── apps.js             # App registry & cards
│   │   ├── dashboard.js        # Dashboard logic (legacy)
│   │   ├── dashboard-v2.js     # Fleet Command logic
│   │   ├── fouling-calculator.js
│   │   └── widgets/            # Modular widget components
│   └── assets/
│       └── favicon.svg
├── assets/                     # Root-level assets
│   ├── favicon.ico
│   └── marinestream_logo_white.png
├── server/                     # Node.js backend
│   ├── index.js                # Express server entry point
│   ├── db/
│   │   ├── index.js            # Database connection pool
│   │   ├── schema.sql          # PostgreSQL schema
│   │   └── init.js             # Database initialization
│   ├── data/
│   │   ├── vesselMmsiRegistry.js   # Authoritative MMSI lookup
│   │   └── vesselStaticPositions.js
│   ├── lib/
│   │   └── fouling-calculator.js   # Hull fouling calculations
│   ├── routes/
│   │   ├── apps.js             # Applications API
│   │   ├── auth.js             # Clerk webhooks
│   │   ├── config.js           # Client configuration API
│   │   ├── fleets.js           # Fleet management API
│   │   ├── map.js              # Map & AIS position API
│   │   ├── marinestream.js     # MarineStream API proxy
│   │   ├── oauth.js            # OAuth flow endpoints
│   │   ├── users.js            # User preferences API
│   │   └── vessels.js          # Vessels API
│   ├── middleware/
│   │   └── auth.js             # Auth middleware
│   └── services/               # Business logic services
├── marinestream-extension/     # Chrome browser extension
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   └── dashboard-inject.js
├── scripts/                    # Utility scripts
│   ├── run-schema.js
│   ├── create-positions-table.js
│   └── explore-api*.js         # API exploration utilities
├── package.json
├── render.yaml                 # Render deployment blueprint
├── env.template
├── DesignDoc.md                # Full design specification
├── styleGuide.html             # Visual style guide
└── README.md
```

## 🔌 Integrated Applications

| App | Description | Category |
|-----|-------------|----------|
| **Job Delivery** | Multi-party workflow for inspection & cleaning jobs | Operations |
| **IWC Approval Portal** | In-water cleaning approval planning | Planning & Compliance |
| **Biofouling ID Guide** | Visual guide for diver IMS identification | Reference & Analysis |
| **Hull Calculator** | Calculate fouling impact on fuel costs | Reference & Analysis |
| **Document Generator** | Generate biofouling management plans | Planning & Compliance |
| **ROV AutoConnect** | Connect to Deep Trekker ROV systems | Operations |

## 🗄️ Database Schema

The application uses PostgreSQL with the following main tables:

| Table | Purpose |
|-------|---------|
| `organizations` | Client organizations |
| `users` | User accounts (synced from Clerk) |
| `vessels` | Tracked vessels with MMSI/IMO |
| `fleets` | Fleet groupings with colour coding |
| `fleet_vessels` | Many-to-many fleet membership |
| `applications` | App registry |
| `app_access` | Organization-app permissions |
| `user_preferences` | User settings & favorites |
| `vessel_positions` | Cached last-known positions |
| `audit_log` | Action logging |

Run `npm run db:init` to create tables and seed initial data.

## 🚢 AIS Vessel Tracking

The map displays real-time vessel positions using the AISstream.io WebSocket API:

1. Server loads authoritative MMSI registry on startup
2. Connects to AISstream with worldwide bounding box
3. Subscribes to tracked vessels from registry + fleet API
4. Caches positions in-memory and database
5. Relays position updates to connected browsers via WebSocket

The system supports:
- **Automatic MMSI Discovery** — Learns fleet vessel MMSIs from MarineStream API
- **Persistent Tracking** — MMSI registry persists across server restarts
- **Position Caching** — Last-known positions stored in database for offline viewing

## 🚀 Deployment

### Render (Recommended)

The project includes a `render.yaml` blueprint for deployment:

1. Fork this repository
2. Connect to Render
3. Create new Blueprint
4. Select this repository
5. Configure environment variables
6. Deploy!

**Blueprint Configuration:**
- Web service: `marinestream-workspace` (Node.js, Singapore region)
- Database: `marinestream-db` (PostgreSQL 16)

### Manual Deployment

```bash
# Install production dependencies
npm install --production

# Set environment variables
export NODE_ENV=production
export DATABASE_URL=your_database_url
# ... set other required env vars

# Start server
npm start
```

## 📡 API Endpoints

### Core APIs
```
GET  /api/health              — Health check
GET  /api/config              — Client configuration
```

### Applications
```
GET  /api/apps                — List all applications
GET  /api/apps/:slug          — Get single application
```

### Vessels & Fleets
```
GET  /api/vessels             — List vessels
GET  /api/fleets              — List fleets
GET  /api/map/vessels         — Vessel positions (cached)
WS   /api/map/stream          — Real-time AIS WebSocket stream
```

### Authentication
```
POST /api/auth/webhook        — Clerk webhook handler
GET  /api/oauth/login         — Initiate OAuth flow
GET  /api/oauth/callback      — OAuth callback
```

### MarineStream Integration
```
GET  /api/marinestream/*      — Proxy to MarineStream API
```

### Users
```
GET  /api/users/me            — Current user profile
```

## 🧩 Chrome Extension

The workspace includes a Chrome extension for enhanced workflow:

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `marinestream-extension` folder

**Features:**
- Quick dashboard access
- Job notifications
- Context menu integration

## 🎨 Design System

The UI follows "Refined Maritime Minimalism" — see `DesignDoc.md` for full specification.

**Key Design Tokens:**
- **Primary Accent:** MarineStream Orange (#FF6600)
- **Heritage Gold:** #C9A227 (Franmarine brand)
- **Typography:** Inter (brand font), JetBrains Mono (data)
- **Spacing:** 8px base grid system
- **Motion:** Purposeful animations with cubic-bezier easing

## 🔒 Security

- **Authentication:** Clerk + MarineStream OAuth
- **Authorization:** Role-based access control
- **Data Protection:** HTTPS, encrypted DB connections
- **API Security:** Keys stored server-side only
- **CORS:** Strict origin allowlist

## 🛠️ Development

```bash
# Start with hot reload (Node.js --watch)
npm run dev

# Initialize/reset database
npm run db:init
```

## 📄 License

Proprietary — © 2026 Franmarine. All rights reserved.

---

<div align="center">

Built with ❤️ by the MarineStream Team

**[Franmarine](https://franmarine.com.au)** · **[MarineStream](https://marinestream.io)**

</div>
