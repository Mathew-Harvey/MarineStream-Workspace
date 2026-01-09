# MarineStream Workspace

<div align="center">

![MarineStream Logo](public/assets/favicon.svg)

**Unified Maritime Biofouling Management Portal**

A world-class platform that presents Franmarine's suite of maritime biofouling management tools under a single, cohesive brand identity.

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16+-4169E1?style=flat&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Render](https://img.shields.io/badge/Deploy-Render-46E3B7?style=flat&logo=render&logoColor=white)](https://render.com/)

</div>

---

## ✨ Features

- **🗺️ Live Vessel Tracking** — Real-time AIS vessel positions via WebSocket
- **📱 App Launcher** — Quick access to all MarineStream tools in one place
- **🔐 Enterprise Auth** — Clerk-powered authentication with SSO support
- **🎨 Beautiful UI** — Apple/Google-quality refined maritime minimalism
- **📊 Role-Based Access** — Internal tools vs. client-facing visibility
- **📱 Responsive** — Works flawlessly on desktop and mobile

## 🚀 Quick Start

### Prerequisites

- Node.js 18 or higher
- PostgreSQL 16 or higher
- AISstream.io API key
- Clerk account (for authentication)

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

Open [http://localhost:3000](http://localhost:3000) in your browser.

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
AISSTREAM_API_KEY=your_api_key_here

# Mapbox (optional - uses free CARTO tiles by default)
MAPBOX_ACCESS_TOKEN=pk.xxxxx
```

## 📁 Project Structure

```
MarineStream-Workspace/
├── public/                 # Static frontend files
│   ├── index.html          # Main HTML page
│   ├── css/
│   │   └── styles.css      # Design system & styles
│   ├── js/
│   │   ├── app.js          # Main application logic
│   │   ├── auth.js         # Clerk authentication
│   │   ├── map.js          # AIS vessel map
│   │   └── apps.js         # App registry & cards
│   └── assets/
│       └── favicon.svg     # Brand icon
├── server/                 # Node.js backend
│   ├── index.js            # Express server entry
│   ├── db/
│   │   ├── index.js        # Database connection
│   │   ├── schema.sql      # PostgreSQL schema
│   │   └── init.js         # Database initialization
│   ├── routes/
│   │   ├── auth.js         # Clerk webhooks
│   │   ├── apps.js         # Applications API
│   │   ├── vessels.js      # Vessels API
│   │   ├── users.js        # User preferences API
│   │   └── map.js          # Map & AIS API
│   └── middleware/
│       └── auth.js         # Auth middleware
├── package.json
├── render.yaml             # Render deployment config
├── env.template            # Environment template
├── DesignDoc.md            # Full design specification
└── README.md               # This file
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

- `organizations` — Client organizations
- `users` — User accounts (synced from Clerk)
- `vessels` — Tracked vessels with MMSI/IMO
- `applications` — App registry
- `app_access` — Organization-app permissions
- `user_preferences` — User settings & favorites
- `audit_log` — Action logging

Run `npm run db:init` to create tables and seed initial data.

## 🚢 AIS Vessel Tracking

The map displays real-time vessel positions using the AISstream.io WebSocket API:

1. Server connects to AISstream on startup
2. Subscribes to tracked vessels from database
3. Relays position updates to connected browsers
4. Frontend displays vessels with live position updates

Vessel states are color-coded:
- 🟡 **Gold** — Active tracking
- 🟢 **Green** — Underway
- ⚪ **Gray** — Moored/At anchor

## 🚀 Deployment

### Render (Recommended)

The project includes a `render.yaml` blueprint for one-click deployment:

1. Fork this repository
2. Connect to Render
3. Create new Blueprint
4. Select this repository
5. Configure environment variables
6. Deploy!

### Manual Deployment

```bash
# Build for production
npm install --production

# Set NODE_ENV
export NODE_ENV=production

# Start server
npm start
```

## 🎨 Design System

The UI follows "Refined Maritime Minimalism" with:

- **Colors:** Heritage gold (#C9A227) accent, warm neutrals, ocean blue
- **Typography:** DM Sans for UI, JetBrains Mono for data
- **Spacing:** 8px base grid system
- **Motion:** Purposeful animations with cubic-bezier easing

See `DesignDoc.md` for the complete design specification.

## 📡 API Endpoints

```
GET  /api/health           — Health check
GET  /api/apps             — List applications
GET  /api/vessels          — List vessels
GET  /api/map/vessels      — Vessel positions
WS   /api/map/stream       — Real-time AIS stream
GET  /api/users/me         — Current user profile
POST /api/auth/webhook     — Clerk webhook
```

## 🔒 Security

- **Authentication:** Clerk handles all auth (no password storage)
- **Authorization:** Role-based access control
- **Data Protection:** HTTPS, encrypted DB connections
- **AIS Security:** API key stored server-side only

## 🛠️ Development

```bash
# Start with hot reload
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
