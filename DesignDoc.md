# MarineStream Workspace — Design Document

**Version:** 1.0  
**Date:** January 2026  
**Author:** Franmarine / MarineStream Team

---

## 1. Executive Summary

MarineStream Workspace is a unified portal that presents a suite of maritime biofouling management tools as a cohesive platform. It positions Franmarine's collection of purpose-built web applications under a single brand identity, creating a world-class user experience that rivals enterprise SaaS products.

The platform will serve as the primary entry point for internal operations initially, with a clear path to client-facing deployment.

---

## 2. Project Goals

### Primary Objectives
- Unify disparate tools under the MarineStream brand identity
- Create a launcher/dashboard that feels like integrated enterprise software
- Provide real operational value through live vessel tracking (AIS)
- Establish a professional, Apple/Google-quality user experience
- Design for future client-facing expansion with role-based visibility

### Success Metrics
- Reduced context-switching between tools
- Single entry point for all maritime operations
- Professional presentation for client demonstrations
- Foundation for future feature integration

---

## 3. Technical Architecture

### Stack
| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | Vanilla HTML, CSS, JavaScript | Lightweight, no build step, easy to maintain |
| **Server** | Node.js (Express) | Simple API layer, handles auth callbacks |
| **Database** | PostgreSQL 18 | Render-native, robust, handles future scaling |
| **Authentication** | Clerk | OAuth, social login, enterprise SSO ready |
| **Hosting** | Render | Web service + PostgreSQL on same platform |
| **Maps** | Mapbox GL JS or Leaflet | High-performance vector maps |
| **AIS Data** | AISstream.io WebSocket API | Real-time vessel positions (API key confirmed) |

### Architecture Diagram
```
┌─────────────────────────────────────────────────────────────────────┐
│                           CLIENT BROWSER                            │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                 │
│  │   Clerk     │  │  Dashboard  │  │   AIS Map   │                 │
│  │   Auth UI   │  │     UI      │  │  Component  │                 │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘                 │
│         │                │                │                         │
│         ▼                ▼                ▼                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Frontend (Static Assets)                  │   │
│  │              HTML / CSS / Vanilla JavaScript                 │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                         RENDER PLATFORM                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Node.js / Express Server                  │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐  │   │
│  │  │  Auth     │  │  Vessel   │  │   User    │  │  Proxy   │  │   │
│  │  │  Routes   │  │  API      │  │  Prefs    │  │  Layer   │  │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └──────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                │                                    │
│                                ▼                                    │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                     PostgreSQL 18                            │   │
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌──────────┐  │   │
│  │  │  Users    │  │  Vessels  │  │   Apps    │  │  Audit   │  │   │
│  │  │  & Roles  │  │  & MMSI   │  │  Config   │  │  Logs    │  │   │
│  │  └───────────┘  └───────────┘  └───────────┘  └──────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
            ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
            │ AISstream   │ │   Clerk     │ │ MarineStream│
            │ WebSocket   │ │   Auth      │ │ Core (Rise) │
            │ API         │ │   Service   │ │ *if PAT ok* │
            └─────────────┘ └─────────────┘ └─────────────┘
```

---

## 4. Design System

### 4.1 Design Philosophy

**Aesthetic Direction:** Refined Maritime Minimalism

The interface should feel like the bridge of a modern vessel — purposeful, clean, and confident. Every element exists for a reason. The design borrows from Apple's restraint and Google's material clarity, adapted for maritime professionalism.

**Key Principles:**
1. **Purposeful Simplicity** — Remove until it breaks, then add one thing back
2. **Confident Negative Space** — Let the interface breathe
3. **Subtle Depth** — Layered cards, soft shadows, implied hierarchy
4. **Motion with Meaning** — Animations that inform, not decorate
5. **Data as Hero** — The map and operational data take center stage

### 4.2 Color Palette

Drawing from existing MarineStream branding with refinement:

```css
:root {
  /* Primary Brand */
  --ms-gold: #C9A227;              /* Primary accent - heritage gold */
  --ms-gold-light: #E5C968;        /* Hover states */
  --ms-gold-dark: #9A7B1E;         /* Active states */
  
  /* Neutrals - Warm undertone */
  --ms-white: #FAFAFA;             /* Primary background */
  --ms-off-white: #F5F5F3;         /* Secondary background */
  --ms-gray-100: #EEEEEC;          /* Card backgrounds */
  --ms-gray-200: #E0E0DC;          /* Borders, dividers */
  --ms-gray-400: #9E9E98;          /* Secondary text */
  --ms-gray-600: #616160;          /* Body text */
  --ms-gray-900: #1A1A19;          /* Primary text */
  
  /* Semantic */
  --ms-ocean: #1E3A5F;             /* Deep blue - maritime authority */
  --ms-ocean-light: #2D5A8A;       /* Interactive ocean elements */
  --ms-success: #2E7D4A;           /* Confirmations, safe status */
  --ms-warning: #C9A227;           /* Caution (uses gold) */
  --ms-error: #B33A3A;             /* Errors, critical alerts */
  
  /* Map Specific */
  --ms-vessel-active: #C9A227;     /* Active vessel markers */
  --ms-vessel-idle: #9E9E98;       /* Idle vessels */
  --ms-route-line: #2D5A8A;        /* Vessel tracks */
}
```

### 4.3 Typography

**Font Selection:**

- **Display/Headings:** `"DM Sans"` — Modern, geometric, distinctive without being flashy. Professional weight options.
- **Body/UI:** `"DM Sans"` — Consistent pairing, excellent legibility at small sizes
- **Monospace (data):** `"JetBrains Mono"` — For coordinates, vessel IDs, technical data

```css
:root {
  /* Type Scale - Major Third (1.25) */
  --text-xs: 0.75rem;      /* 12px - Labels, captions */
  --text-sm: 0.875rem;     /* 14px - Secondary text */
  --text-base: 1rem;       /* 16px - Body */
  --text-lg: 1.125rem;     /* 18px - Large body */
  --text-xl: 1.25rem;      /* 20px - Card titles */
  --text-2xl: 1.5rem;      /* 24px - Section headers */
  --text-3xl: 1.875rem;    /* 30px - Page titles */
  --text-4xl: 2.25rem;     /* 36px - Hero text */
  
  /* Font Weights */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;
  
  /* Line Heights */
  --leading-tight: 1.2;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  
  /* Letter Spacing */
  --tracking-tight: -0.02em;
  --tracking-normal: 0;
  --tracking-wide: 0.02em;
  --tracking-wider: 0.05em;
}
```

### 4.4 Spacing System

8px base grid:

```css
:root {
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-5: 1.25rem;   /* 20px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-10: 2.5rem;   /* 40px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-20: 5rem;     /* 80px */
}
```

### 4.5 Component Library

#### Cards
```css
.card {
  background: var(--ms-white);
  border-radius: 12px;
  border: 1px solid var(--ms-gray-200);
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 4px 12px rgba(0, 0, 0, 0.03);
  transition: all 0.2s ease;
}

.card:hover {
  border-color: var(--ms-gold);
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.04),
    0 8px 24px rgba(0, 0, 0, 0.06);
  transform: translateY(-2px);
}
```

#### Buttons
```css
.btn-primary {
  background: var(--ms-gold);
  color: var(--ms-gray-900);
  font-weight: var(--font-semibold);
  padding: var(--space-3) var(--space-6);
  border-radius: 8px;
  border: none;
  transition: all 0.15s ease;
}

.btn-primary:hover {
  background: var(--ms-gold-light);
  transform: translateY(-1px);
}

.btn-secondary {
  background: transparent;
  color: var(--ms-gray-900);
  border: 1px solid var(--ms-gray-200);
  /* ... same structure */
}
```

### 4.6 Motion Principles

```css
:root {
  /* Timing */
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
  
  /* Easing */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

**Animation Guidelines:**
- Page load: Staggered fade-up for cards (50ms delay between each)
- Hover states: 150ms transitions, subtle scale/lift
- Map markers: Smooth position interpolation for AIS updates
- Loading states: Pulsing skeleton screens, not spinners

---

## 5. Application Integration

### 5.1 App Registry

| App ID | Name | URL | Category | Visibility | Status Badge |
|--------|------|-----|----------|------------|--------------|
| `core` | Job Delivery | app.marinestream.io | Operations | All | Jobs pending |
| `iwc` | IWC Approval Portal | iwc-approval-portal.onrender.com | Planning | Internal | Approvals pending |
| `idguide` | Biofouling ID Guide | mathew-harvey.github.io/BiofoulingIdGuide | Reference | All | — |
| `hullcalc` | Hull Calculator | marinestream.com.au/.../hullCalc.html | Analysis | All | — |
| `docgen` | Document Generator | mathew-harvey.github.io/Document-Generator | Compliance | Internal* | — |
| `rov` | ROV AutoConnect | marinestream.com.au/.../rov-autoconnect.html | Operations | Internal | — |

*May open to clients for self-service BMP generation

### 5.2 App Card Design

Each application is presented as a card with:

```
┌────────────────────────────────────────┐
│  ┌────┐                                │
│  │icon│   App Name              ● 3    │  ← Badge (optional)
│  └────┘                                │
│                                        │
│  Brief description of what this        │
│  tool does and who it's for.           │
│                                        │
│  ────────────────────────────────────  │
│  Planning & Compliance          →      │  ← Category + launch
└────────────────────────────────────────┘
```

### 5.3 App Categories

**Planning & Compliance**
- IWC Approval Portal
- Document Generator

**Operations**
- Job Delivery (MarineStream Core)
- ROV AutoConnect

**Reference & Analysis**
- Biofouling ID Guide
- Hull Calculator

---

## 6. Map Specification

### 6.1 Purpose & Value

The map isn't decoration — it's the operational heartbeat of the dashboard. It answers: "Where are our vessels right now?"

**Value propositions:**
- Instant situational awareness across fleet
- Identify vessels in port (potential work opportunities)
- Track vessels en route to cleaning operations
- Client portal: "Where's my ship?"

### 6.2 Data Source

**AISstream.io WebSocket API**
- Real-time vessel positions via WebSocket
- Filter by MMSI list (maintained in PostgreSQL)
- ~1 second position updates for subscribed vessels

**Required vessel data (stored in DB):**
```json
{
  "mmsi": "503000001",
  "vessel_name": "HMAS Stalwart",
  "client": "Royal Australian Navy",
  "vessel_type": "auxiliary",
  "flag": "AU",
  "imo": "9876543"
}
```

### 6.3 Map Features

**MVP Features:**
- [ ] Display vessel positions as markers
- [ ] Click marker → vessel info popup (name, type, client, speed, heading)
- [ ] Cluster markers when zoomed out
- [ ] Fit bounds to show all tracked vessels
- [ ] Differentiate vessel states (underway, moored, at anchor)

**Phase 2 Features:**
- [ ] Vessel tracks (last 24hr path)
- [ ] Port boundaries overlay
- [ ] Click vessel → deep link to MarineStream Core job history
- [ ] Filter by client/vessel type

### 6.4 Map Styling

Custom Mapbox style to match MarineStream aesthetic:
- Muted ocean blue (#1E3A5F at low opacity)
- Minimal land features (light gray, no labels except major ports)
- Gold vessel markers matching brand
- Clean, minimal UI controls

---

## 7. Database Schema

### 7.1 Core Tables

```sql
-- Users (synced from Clerk)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user', 'client'
    organization_id UUID REFERENCES organizations(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizations (clients)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE, -- TRUE for Franmarine
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vessels
CREATE TABLE vessels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mmsi VARCHAR(20) UNIQUE,
    imo VARCHAR(20),
    name VARCHAR(255) NOT NULL,
    vessel_type VARCHAR(100),
    flag VARCHAR(10),
    organization_id UUID REFERENCES organizations(id),
    is_tracked BOOLEAN DEFAULT TRUE, -- Show on map
    metadata JSONB, -- Flexible storage for vessel details
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Applications registry
CREATE TABLE applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    url VARCHAR(500) NOT NULL,
    icon VARCHAR(50), -- Icon identifier
    category VARCHAR(100),
    visibility VARCHAR(50) DEFAULT 'internal', -- 'internal', 'client', 'public'
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    opens_in VARCHAR(20) DEFAULT 'new_tab', -- 'new_tab', 'iframe', 'same_window'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App access (which orgs can see which apps)
CREATE TABLE app_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id),
    organization_id UUID REFERENCES organizations(id),
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(application_id, organization_id)
);

-- User preferences
CREATE TABLE user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id),
    default_map_center POINT,
    default_map_zoom INTEGER,
    favorite_apps UUID[], -- Array of app IDs
    theme VARCHAR(20) DEFAULT 'light',
    preferences JSONB, -- Flexible storage
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit log
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 7.2 Indexes

```sql
CREATE INDEX idx_vessels_org ON vessels(organization_id);
CREATE INDEX idx_vessels_mmsi ON vessels(mmsi);
CREATE INDEX idx_applications_visibility ON applications(visibility);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at DESC);
```

---

## 8. API Design

### 8.1 Endpoints

```
Authentication (handled by Clerk)
POST   /api/auth/webhook          # Clerk webhook for user sync

Users
GET    /api/users/me              # Current user profile
PATCH  /api/users/me/preferences  # Update preferences

Applications
GET    /api/apps                  # List accessible apps
GET    /api/apps/:slug            # Single app details

Vessels
GET    /api/vessels               # List vessels (filtered by org)
GET    /api/vessels/:id           # Single vessel
POST   /api/vessels               # Add vessel (admin)
PATCH  /api/vessels/:id           # Update vessel (admin)

Map
GET    /api/map/vessels           # Vessel positions (from AIS cache)
WS     /api/map/stream            # WebSocket for real-time updates

Organizations (admin only)
GET    /api/organizations
POST   /api/organizations
PATCH  /api/organizations/:id
```

### 8.2 Response Format

```json
{
  "success": true,
  "data": { },
  "meta": {
    "timestamp": "2026-01-09T12:00:00Z",
    "request_id": "req_abc123"
  }
}
```

Error format:
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "You do not have access to this resource"
  }
}
```

---

## 9. User Interface Wireframes

### 9.1 Dashboard Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│   ┌─ HEADER ───────────────────────────────────────────────────────┐    │
│   │                                                                 │    │
│   │   ≡  MarineStream                    🔍 Search    [User Menu]   │    │
│   │      ───────────                                                │    │
│   │                                                                 │    │
│   └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│   ┌─ MAP SECTION ───────────────────────────────────────────────────┐   │
│   │                                                                  │   │
│   │                                                                  │   │
│   │                    LIVE VESSEL MAP                               │   │
│   │                                                                  │   │
│   │    ● HMAS Stalwart                              [+ / -] [⛶]     │   │
│   │         ● HMAS Sydney                                            │   │
│   │                           ● SV Sheila                            │   │
│   │                                                                  │   │
│   │   ┌─────────────────────┐                                       │   │
│   │   │ 12 Vessels Tracked  │                                       │   │
│   │   │ 4 In Port           │                                       │   │
│   │   └─────────────────────┘                                       │   │
│   │                                                                  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ┌─ QUICK ACCESS (optional - recent vessels/jobs) ─────────────────┐   │
│   │                                                                  │   │
│   │  HMAS Stalwart          HMAS Sydney           HMAS Toowoomba    │   │
│   │  Last inspected 7 Jan   Cleaning scheduled    Pre-clean due     │   │
│   │                                                                  │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│   ─── Applications ─────────────────────────────────────────────────────│
│                                                                          │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│   │                  │  │                  │  │                  │      │
│   │   Job Delivery   │  │   IWC Approval   │  │   Biofouling     │      │
│   │                  │  │      Portal      │  │    ID Guide      │      │
│   │  Multi-party     │  │                  │  │                  │      │
│   │  workflow for    │  │  Plan and get    │  │  Visual guide    │      │
│   │  delivering      │  │  approval for    │  │  for diver IMS   │      │
│   │  inspection &    │  │  in-water work   │  │  identification  │      │
│   │  cleaning jobs   │  │                  │  │                  │      │
│   │                  │  │  ● 3 pending     │  │                  │      │
│   │  ─────────────   │  │  ─────────────   │  │  ─────────────   │      │
│   │  Operations  →   │  │  Planning    →   │  │  Reference   →   │      │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘      │
│                                                                          │
│   ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐      │
│   │                  │  │                  │  │                  │      │
│   │      Hull        │  │    Document      │  │       ROV        │      │
│   │   Calculator     │  │    Generator     │  │   AutoConnect    │      │
│   │                  │  │                  │  │                  │      │
│   │  Calculate       │  │  Generate        │  │  Connect to      │      │
│   │  fouling impact  │  │  biofouling      │  │  Deep Trekker    │      │
│   │  on fuel costs   │  │  management      │  │  ROV systems     │      │
│   │                  │  │  plans           │  │                  │      │
│   │  ─────────────   │  │  ─────────────   │  │  ─────────────   │      │
│   │  Analysis    →   │  │  Compliance  →   │  │  Operations  →   │      │
│   └──────────────────┘  └──────────────────┘  └──────────────────┘      │
│                                                                          │
│   ┌─ FOOTER ────────────────────────────────────────────────────────┐   │
│   │  © 2026 Franmarine · MarineStream          Help · Privacy       │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.2 Header Component

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ☰   ▓▓▓▓  MarineStream                                               │
│       ▓▓▓▓  ═══════════                     🔍        ⚙️    [MH]       │
│       ▓▓▓▓                                                              │
│                                              Search   Settings  User    │
└─────────────────────────────────────────────────────────────────────────┘

Mobile collapsed:
┌─────────────────────────────────────────────────────────────────────────┐
│   ☰     MarineStream                                            [MH]   │
└─────────────────────────────────────────────────────────────────────────┘
```

### 9.3 App Card States

```
DEFAULT                          HOVER                           LOADING
┌──────────────────┐            ┌──────────────────┐            ┌──────────────────┐
│  ┌────┐          │            │  ┌────┐          │ ↑          │  ┌────┐          │
│  │ 📋 │  Name    │            │  │ 📋 │  Name    │ 2px        │  │ ░░ │  ░░░░    │
│  └────┘          │            │  └────┘          │            │  └────┘          │
│                  │    →       │                  │    →       │  ░░░░░░░░░░░░░░  │
│  Description     │            │  Description     │            │  ░░░░░░░░░░░░░░  │
│  text here       │            │  text here       │            │  ░░░░░░░░░░░░░░  │
│                  │            │                  │            │                  │
│  ──────────────  │            │  ══════════════  │ gold       │  ──────────────  │
│  Category    →   │            │  Category    →   │ border     │  ░░░░░░░░░░ →   │
└──────────────────┘            └──────────────────┘            └──────────────────┘
```

---

## 10. User Flows

### 10.1 First-Time User

```
1. User navigates to marinestream.io/workspace (or similar)
2. Clerk login screen appears
3. User authenticates (email, Google, Microsoft)
4. Clerk webhook fires → user created in PostgreSQL
5. Dashboard loads with:
   - Welcome message (first time only)
   - Map centered on default location
   - All apps visible based on role
6. User clicks an app card → opens in new tab
```

### 10.2 Returning User

```
1. User navigates to workspace
2. Clerk validates session (automatic)
3. Dashboard loads instantly with:
   - Map with saved viewport
   - Favorited apps highlighted
   - Any pending notifications/badges
```

### 10.3 Client User (Future)

```
1. Client invited via email
2. Creates account through Clerk
3. Assigned to their organization
4. Dashboard shows:
   - Map filtered to their vessels only
   - Apps they have access to (subset)
   - Their job/inspection history
```

---

## 11. Security Considerations

### 11.1 Authentication
- All auth handled by Clerk (no custom password storage)
- JWT tokens for API authentication
- Session tokens httpOnly, secure, sameSite

### 11.2 Authorization
- Role-based access control (admin, user, client)
- Organization-scoped data access
- App visibility controlled per-organization

### 11.3 Data Protection
- All traffic over HTTPS
- Database connections encrypted
- Sensitive config in environment variables
- Audit logging for admin actions

### 11.4 AIS Data
- AISstream API key stored server-side only
- Vessel MMSI list restricted to tracked vessels
- No caching of competitor vessel data

---

## 12. Performance Targets

| Metric | Target |
|--------|--------|
| Time to Interactive | < 2 seconds |
| Largest Contentful Paint | < 1.5 seconds |
| Map load time | < 1 second |
| AIS position update latency | < 2 seconds |
| API response time (p95) | < 200ms |

### Optimization Strategies
- Static assets on CDN
- Lazy load app cards below fold
- WebSocket for map updates (no polling)
- Database connection pooling
- Efficient vessel position caching

---

## 13. Development Phases

### Phase 1: Foundation
- [ ] Project setup (Node.js, Express, PostgreSQL on Render)
- [ ] Clerk integration (auth flow working)
- [ ] Basic dashboard layout (no map)
- [ ] App cards with external links
- [ ] Responsive design

### Phase 2: Map Integration
- [ ] AISstream WebSocket connection
- [ ] Vessel database seeding
- [ ] Map component with vessel markers
- [ ] Vessel click → info popup

### Phase 3: Polish & Features
- [ ] Loading states and animations
- [ ] Search functionality
- [ ] User preferences (favorites)
- [ ] Badge system (pending counts - if API available)
- [ ] Mobile optimization

### Phase 4: Client Expansion
- [ ] Organization management
- [ ] Client invitation flow
- [ ] Filtered app visibility
- [ ] Client-specific vessel views
- [ ] Custom branding per org

---

## 14. Open Questions

1. ~~**AISstream API key**~~ — ✅ Confirmed, will be added to env file
2. **MarineStream Core PAT** — Can we reliably call endpoints? Which ones?
3. **Domain/URL** — To be confirmed
4. **Notification system** — Email? In-app? Future phase?
5. **Offline capability** — PWA considerations?

---

## 15. Success Criteria

**MVP Launch:**
- Users can log in and see the dashboard
- Map displays tracked vessels in real-time
- All 6 apps accessible via cards
- Mobile responsive
- Load time under 2 seconds

**Post-MVP Goals:**
- At least 2 apps restyled to match design system
- Quick access panel with vessel shortcuts
- Client pilot with one external organization
- Positive feedback from RAN stakeholders

---

## Appendix A: Reference Screenshots

*Attached: Current MarineStream UI screenshots showing design language to match*

## Appendix B: Competitive Reference

**Products to draw inspiration from:**
- Linear.app — Clean, fast, keyboard-first
- Vercel Dashboard — Developer-focused clarity
- Apple Maps — Cartographic elegance
- Notion — Workspace metaphor done well

---

*End of Design Document*