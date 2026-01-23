-- MarineStream Workspace Database Schema
-- PostgreSQL 16+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- Organizations (clients)
-- ============================================
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    is_internal BOOLEAN DEFAULT FALSE, -- TRUE for Franmarine
    logo_url VARCHAR(500),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Users (synced from Clerk)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    avatar_url VARCHAR(500),
    role VARCHAR(50) DEFAULT 'user', -- 'admin', 'user', 'client'
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Vessels
-- ============================================
CREATE TABLE IF NOT EXISTS vessels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mmsi VARCHAR(20) UNIQUE,
    imo VARCHAR(20),
    name VARCHAR(255) NOT NULL,
    vessel_type VARCHAR(100),
    flag VARCHAR(10),
    length_meters DECIMAL(8,2),
    beam_meters DECIMAL(8,2),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    is_tracked BOOLEAN DEFAULT TRUE, -- Show on map
    metadata JSONB DEFAULT '{}', -- Flexible storage for vessel details
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Applications registry
-- ============================================
CREATE TABLE IF NOT EXISTS applications (
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

-- ============================================
-- App access (which orgs can see which apps)
-- ============================================
CREATE TABLE IF NOT EXISTS app_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    granted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(application_id, organization_id)
);

-- ============================================
-- User preferences
-- ============================================
CREATE TABLE IF NOT EXISTS user_preferences (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    default_map_center POINT,
    default_map_zoom INTEGER DEFAULT 4,
    favorite_apps UUID[] DEFAULT '{}', -- Array of app IDs
    theme VARCHAR(20) DEFAULT 'light',
    preferences JSONB DEFAULT '{}', -- Flexible storage
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Fleets (grouping of vessels)
-- ============================================
CREATE TABLE IF NOT EXISTS fleets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    color VARCHAR(7) DEFAULT '#3b82f6', -- Hex color for UI display
    icon VARCHAR(50) DEFAULT 'anchor', -- Icon identifier
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}', -- Flexible storage for fleet details
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Fleet Vessels (many-to-many relationship)
-- Note: vessel_id is NOT a foreign key to vessels table
-- because vessels may come from external systems (IWC work data)
-- ============================================
CREATE TABLE IF NOT EXISTS fleet_vessels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fleet_id UUID REFERENCES fleets(id) ON DELETE CASCADE,
    vessel_id UUID NOT NULL, -- External vessel ID (no FK constraint)
    added_at TIMESTAMPTZ DEFAULT NOW(),
    added_by UUID REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE(fleet_id, vessel_id)
);

-- ============================================
-- Audit log
-- ============================================
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Job Drafts (auto-saved job data)
-- ============================================
CREATE TABLE IF NOT EXISTS job_drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id VARCHAR(255) NOT NULL,
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'submitted', 'synced'
    rise_x_job_id VARCHAR(255), -- ID from Rise-X after sync
    data JSONB NOT NULL DEFAULT '{}', -- Full job form data
    metadata JSONB DEFAULT '{}', -- User metadata, timestamps, etc.
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Jobs (submitted/completed jobs)
-- ============================================
CREATE TABLE IF NOT EXISTS jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID REFERENCES job_drafts(id) ON DELETE SET NULL,
    clerk_user_id VARCHAR(255) NOT NULL,
    job_number VARCHAR(100),
    job_type VARCHAR(100),
    vessel_id VARCHAR(255),
    vessel_name VARCHAR(255),
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_progress', 'completed', 'synced'
    rise_x_job_id VARCHAR(255), -- ID from Rise-X after sync
    rise_x_synced_at TIMESTAMPTZ,
    data JSONB NOT NULL DEFAULT '{}', -- Full job data
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- User Presence (online status tracking)
-- ============================================
CREATE TABLE IF NOT EXISTS user_presence (
    clerk_user_id VARCHAR(255) PRIMARY KEY,
    user_email VARCHAR(255),
    user_name VARCHAR(255),
    is_online BOOLEAN DEFAULT FALSE,
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    socket_id VARCHAR(255),
    current_page VARCHAR(255), -- Track which page user is on
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Call History
-- ============================================
CREATE TABLE IF NOT EXISTS call_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_name VARCHAR(255) NOT NULL UNIQUE,
    initiated_by VARCHAR(255) NOT NULL, -- Clerk user ID
    initiator_name VARCHAR(255),
    participants JSONB DEFAULT '[]', -- Array of {userId, userName, joinedAt, leftAt}
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'ended', 'missed'
    call_type VARCHAR(50) DEFAULT 'video', -- 'video', 'audio', 'screen_share'
    metadata JSONB DEFAULT '{}'
);

-- ============================================
-- Call Invitations
-- ============================================
CREATE TABLE IF NOT EXISTS call_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_name VARCHAR(255) NOT NULL,
    from_user_id VARCHAR(255) NOT NULL,
    from_user_name VARCHAR(255),
    to_user_id VARCHAR(255), -- NULL if email invite
    to_email VARCHAR(255), -- For external invites
    invite_token VARCHAR(255), -- Unique token for email invites
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'expired'
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '24 hours'),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    responded_at TIMESTAMPTZ
);

-- ============================================
-- Vessel Position Cache (Last Known Positions)
-- ============================================
CREATE TABLE IF NOT EXISTS vessel_positions (
    mmsi VARCHAR(20) PRIMARY KEY,
    lat DECIMAL(10, 6) NOT NULL,
    lng DECIMAL(11, 6) NOT NULL,
    speed DECIMAL(5, 1),
    course DECIMAL(5, 1),
    heading INTEGER,
    ship_name VARCHAR(255),
    destination VARCHAR(255),
    source VARCHAR(50) DEFAULT 'ais', -- 'ais', 'manual'
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes
-- ============================================
CREATE INDEX IF NOT EXISTS idx_vessel_positions_updated ON vessel_positions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_clerk ON users(clerk_id);
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_vessels_org ON vessels(organization_id);
CREATE INDEX IF NOT EXISTS idx_vessels_mmsi ON vessels(mmsi);
CREATE INDEX IF NOT EXISTS idx_vessels_tracked ON vessels(is_tracked) WHERE is_tracked = true;
CREATE INDEX IF NOT EXISTS idx_applications_visibility ON applications(visibility);
CREATE INDEX IF NOT EXISTS idx_applications_active ON applications(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fleets_org ON fleets(organization_id);
CREATE INDEX IF NOT EXISTS idx_fleets_active ON fleets(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_fleet_vessels_fleet ON fleet_vessels(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_vessels_vessel ON fleet_vessels(vessel_id);
CREATE INDEX IF NOT EXISTS idx_job_drafts_user ON job_drafts(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_job_drafts_status ON job_drafts(status);
CREATE INDEX IF NOT EXISTS idx_job_drafts_updated ON job_drafts(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON jobs(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_vessel ON jobs(vessel_id);
CREATE INDEX IF NOT EXISTS idx_jobs_created ON jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_presence_online ON user_presence(is_online) WHERE is_online = true;
CREATE INDEX IF NOT EXISTS idx_user_presence_last_seen ON user_presence(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_channel ON call_history(channel_name);
CREATE INDEX IF NOT EXISTS idx_call_history_initiator ON call_history(initiated_by);
CREATE INDEX IF NOT EXISTS idx_call_history_status ON call_history(status);
CREATE INDEX IF NOT EXISTS idx_call_history_started ON call_history(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_invitations_channel ON call_invitations(channel_name);
CREATE INDEX IF NOT EXISTS idx_call_invitations_to_user ON call_invitations(to_user_id);
CREATE INDEX IF NOT EXISTS idx_call_invitations_token ON call_invitations(invite_token);
CREATE INDEX IF NOT EXISTS idx_call_invitations_status ON call_invitations(status);

-- ============================================
-- Seed Data: Franmarine Organization
-- ============================================
INSERT INTO organizations (name, slug, is_internal) 
VALUES ('Franmarine', 'franmarine', TRUE)
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- Seed Data: Applications
-- ============================================
INSERT INTO applications (slug, name, description, url, icon, category, visibility, sort_order) VALUES
('core', 'Job Delivery', 'Multi-party workflow for delivering inspection & cleaning jobs (MarineStream Core)', 'https://app.marinestream.io', 'briefcase', 'Operations', 'public', 1),
('iwc', 'IWC Approval Portal', 'Planning and getting approval for in-water cleaning work', 'https://iwc-approval-portal.onrender.com', 'clipboard-check', 'Planning & Compliance', 'public', 2),
('idguide', 'Biofouling ID Guide', 'Visual guide for diver IMS identification', 'https://mathew-harvey.github.io/BiofoulingIdGuide', 'search', 'Reference & Analysis', 'public', 3),
('hullcalc', 'Hull Calculator', 'Calculate fouling impact on fuel costs', 'https://www.marinestream.com.au/interactive-tools/hullCalc.html', 'calculator', 'Reference & Analysis', 'public', 4),
('docgen', 'Document Generator', 'Generate biofouling management plans', 'https://mathew-harvey.github.io/Document-Generator', 'file-text', 'Planning & Compliance', 'public', 5),
('rov', 'ROV AutoConnect', 'Connect to Deep Trekker ROV systems', 'https://www.marinestream.com.au/core-pages/rov-autoconnect.html', 'video', 'Operations', 'public', 6)
ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    url = EXCLUDED.url,
    icon = EXCLUDED.icon,
    category = EXCLUDED.category,
    visibility = EXCLUDED.visibility,
    sort_order = EXCLUDED.sort_order;

-- ============================================
-- Seed Data: Demo Vessels
-- ============================================
INSERT INTO vessels (mmsi, name, vessel_type, flag, organization_id, is_tracked) 
SELECT 
    v.mmsi, 
    v.name, 
    v.vessel_type, 
    v.flag,
    (SELECT id FROM organizations WHERE slug = 'franmarine'),
    TRUE
FROM (VALUES
    ('503000001', 'HMAS Stalwart', 'Auxiliary', 'AU'),
    ('503000002', 'HMAS Sydney', 'Destroyer', 'AU'),
    ('503000003', 'HMAS Toowoomba', 'Frigate', 'AU'),
    ('503000004', 'SV Investigator', 'Research', 'AU')
) AS v(mmsi, name, vessel_type, flag)
ON CONFLICT (mmsi) DO NOTHING;
