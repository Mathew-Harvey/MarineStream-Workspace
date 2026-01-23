-- MarineStream Workspace - Rise-X Sync Schema
-- Migration for sync functionality with Rise-X API
-- PostgreSQL 16+

-- ============================================
-- User Rise-X Connections
-- Links Clerk users to their Rise-X OAuth tokens
-- ============================================
CREATE TABLE IF NOT EXISTS user_rise_x_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rise_x_user_id VARCHAR(255),
    rise_x_email VARCHAR(255),
    -- Tokens stored encrypted using pgcrypto
    access_token_encrypted BYTEA,
    refresh_token_encrypted BYTEA,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[] DEFAULT '{}',
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    last_sync_at TIMESTAMPTZ,
    last_token_refresh_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- ============================================
-- Rise-X Work Items (Jobs/Inspections)
-- Cached work items from Rise-X Diana API
-- ============================================
CREATE TABLE IF NOT EXISTS rise_x_work_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rise_x_id VARCHAR(255) UNIQUE NOT NULL,
    flow_id VARCHAR(255),
    flow_name VARCHAR(255),
    flow_origin_id VARCHAR(255),
    status VARCHAR(100),
    -- Vessel reference (from work item data)
    vessel_rise_x_id VARCHAR(255),
    vessel_name VARCHAR(255),
    vessel_mmsi VARCHAR(20),
    vessel_imo VARCHAR(20),
    -- Dates from Rise-X
    created_at_rise_x TIMESTAMPTZ,
    updated_at_rise_x TIMESTAMPTZ,
    completed_at_rise_x TIMESTAMPTZ,
    -- Full data payload
    data JSONB DEFAULT '{}',
    -- Sync metadata
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    synced_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Rise-X Assets (Vessels from Registries)
-- Vessels/assets from Rise-X thing registries
-- ============================================
CREATE TABLE IF NOT EXISTS rise_x_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rise_x_id VARCHAR(255) UNIQUE NOT NULL,
    thing_type_id VARCHAR(255),
    thing_type_name VARCHAR(255),
    display_name VARCHAR(255),
    name VARCHAR(255),
    -- Vessel identifiers
    mmsi VARCHAR(20),
    imo VARCHAR(20),
    pennant VARCHAR(50),
    -- Classification
    vessel_class VARCHAR(100),
    vessel_type VARCHAR(100),
    flag VARCHAR(10),
    -- Organization/client
    organization_name VARCHAR(255),
    -- Full data payload
    data JSONB DEFAULT '{}',
    -- Sync metadata
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    synced_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Biofouling Assessments
-- Extracted from Rise-X work items
-- ============================================
CREATE TABLE IF NOT EXISTS biofouling_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_item_id UUID REFERENCES rise_x_work_items(id) ON DELETE CASCADE,
    rise_x_work_id VARCHAR(255),
    -- Vessel reference
    vessel_rise_x_id VARCHAR(255),
    vessel_name VARCHAR(255),
    vessel_mmsi VARCHAR(20),
    -- Assessment details
    inspection_date DATE,
    assessment_type VARCHAR(100), -- 'pre-clean', 'post-clean', 'routine'
    -- Component being assessed
    component_name VARCHAR(255),
    component_category VARCHAR(100), -- 'hull', 'niche', 'propeller', etc.
    -- Fouling data
    fouling_rating VARCHAR(50),
    fouling_rating_numeric INTEGER,
    fouling_coverage DECIMAL(5,2),
    pdr_rating VARCHAR(50),
    -- Comments
    diver_comments TEXT,
    expert_comments TEXT,
    -- Full data for this component
    data JSONB DEFAULT '{}',
    -- Sync metadata
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Sync State
-- Track sync progress per entity type per user
-- ============================================
CREATE TABLE IF NOT EXISTS sync_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    entity_type VARCHAR(100) NOT NULL, -- 'work_items', 'assets', 'biofouling'
    -- Sync tracking
    last_sync_at TIMESTAMPTZ,
    last_sync_cursor TEXT, -- For pagination/incremental sync
    last_sync_count INTEGER DEFAULT 0,
    total_synced INTEGER DEFAULT 0,
    -- Status
    sync_status VARCHAR(50) DEFAULT 'idle', -- 'idle', 'in_progress', 'completed', 'failed'
    error_message TEXT,
    error_count INTEGER DEFAULT 0,
    last_error_at TIMESTAMPTZ,
    -- Sync configuration
    sync_interval_minutes INTEGER DEFAULT 15,
    auto_sync_enabled BOOLEAN DEFAULT TRUE,
    -- Metadata
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, entity_type)
);

-- ============================================
-- Sync Logs
-- Detailed log of sync operations for debugging
-- ============================================
CREATE TABLE IF NOT EXISTS sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    entity_type VARCHAR(100) NOT NULL,
    operation VARCHAR(50) NOT NULL, -- 'full_sync', 'incremental', 'single_item'
    -- Results
    status VARCHAR(50) NOT NULL, -- 'started', 'completed', 'failed'
    items_fetched INTEGER DEFAULT 0,
    items_created INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    items_failed INTEGER DEFAULT 0,
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    -- Error details
    error_message TEXT,
    error_stack TEXT,
    -- Request/response info
    request_metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Rise-X Flows (Workflow Definitions)
-- Cache of available workflows
-- ============================================
CREATE TABLE IF NOT EXISTS rise_x_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rise_x_id VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    description TEXT,
    flow_type VARCHAR(100),
    origin_id VARCHAR(255),
    origin_name VARCHAR(255),
    is_active BOOLEAN DEFAULT TRUE,
    -- Full data payload
    data JSONB DEFAULT '{}',
    -- Sync metadata
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Indexes for Performance
-- ============================================

-- User connections
CREATE INDEX IF NOT EXISTS idx_user_rise_x_connections_user ON user_rise_x_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_user_rise_x_connections_active ON user_rise_x_connections(is_active) WHERE is_active = true;

-- Work items
CREATE INDEX IF NOT EXISTS idx_rise_x_work_items_rise_x_id ON rise_x_work_items(rise_x_id);
CREATE INDEX IF NOT EXISTS idx_rise_x_work_items_flow ON rise_x_work_items(flow_id);
CREATE INDEX IF NOT EXISTS idx_rise_x_work_items_vessel ON rise_x_work_items(vessel_rise_x_id);
CREATE INDEX IF NOT EXISTS idx_rise_x_work_items_vessel_mmsi ON rise_x_work_items(vessel_mmsi);
CREATE INDEX IF NOT EXISTS idx_rise_x_work_items_status ON rise_x_work_items(status);
CREATE INDEX IF NOT EXISTS idx_rise_x_work_items_created ON rise_x_work_items(created_at_rise_x DESC);
CREATE INDEX IF NOT EXISTS idx_rise_x_work_items_synced ON rise_x_work_items(synced_at DESC);

-- Assets
CREATE INDEX IF NOT EXISTS idx_rise_x_assets_rise_x_id ON rise_x_assets(rise_x_id);
CREATE INDEX IF NOT EXISTS idx_rise_x_assets_thing_type ON rise_x_assets(thing_type_id);
CREATE INDEX IF NOT EXISTS idx_rise_x_assets_mmsi ON rise_x_assets(mmsi);
CREATE INDEX IF NOT EXISTS idx_rise_x_assets_imo ON rise_x_assets(imo);
CREATE INDEX IF NOT EXISTS idx_rise_x_assets_name ON rise_x_assets(display_name);

-- Biofouling assessments
CREATE INDEX IF NOT EXISTS idx_biofouling_work_item ON biofouling_assessments(work_item_id);
CREATE INDEX IF NOT EXISTS idx_biofouling_vessel ON biofouling_assessments(vessel_rise_x_id);
CREATE INDEX IF NOT EXISTS idx_biofouling_vessel_mmsi ON biofouling_assessments(vessel_mmsi);
CREATE INDEX IF NOT EXISTS idx_biofouling_date ON biofouling_assessments(inspection_date DESC);
CREATE INDEX IF NOT EXISTS idx_biofouling_component ON biofouling_assessments(component_name);

-- Sync state
CREATE INDEX IF NOT EXISTS idx_sync_state_user ON sync_state(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_entity ON sync_state(entity_type);
CREATE INDEX IF NOT EXISTS idx_sync_state_status ON sync_state(sync_status);

-- Sync logs
CREATE INDEX IF NOT EXISTS idx_sync_logs_user ON sync_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_entity ON sync_logs(entity_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_created ON sync_logs(created_at DESC);

-- Flows
CREATE INDEX IF NOT EXISTS idx_rise_x_flows_rise_x_id ON rise_x_flows(rise_x_id);
CREATE INDEX IF NOT EXISTS idx_rise_x_flows_origin ON rise_x_flows(origin_id);

-- ============================================
-- Full-text search for work items and assets
-- ============================================
CREATE INDEX IF NOT EXISTS idx_rise_x_work_items_search ON rise_x_work_items 
    USING GIN (to_tsvector('english', COALESCE(vessel_name, '') || ' ' || COALESCE(flow_name, '')));

CREATE INDEX IF NOT EXISTS idx_rise_x_assets_search ON rise_x_assets 
    USING GIN (to_tsvector('english', COALESCE(display_name, '') || ' ' || COALESCE(name, '')));

-- ============================================
-- Trigger for updated_at timestamps
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all new tables
DROP TRIGGER IF EXISTS update_user_rise_x_connections_updated_at ON user_rise_x_connections;
CREATE TRIGGER update_user_rise_x_connections_updated_at
    BEFORE UPDATE ON user_rise_x_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rise_x_work_items_updated_at ON rise_x_work_items;
CREATE TRIGGER update_rise_x_work_items_updated_at
    BEFORE UPDATE ON rise_x_work_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rise_x_assets_updated_at ON rise_x_assets;
CREATE TRIGGER update_rise_x_assets_updated_at
    BEFORE UPDATE ON rise_x_assets
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_biofouling_assessments_updated_at ON biofouling_assessments;
CREATE TRIGGER update_biofouling_assessments_updated_at
    BEFORE UPDATE ON biofouling_assessments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sync_state_updated_at ON sync_state;
CREATE TRIGGER update_sync_state_updated_at
    BEFORE UPDATE ON sync_state
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_rise_x_flows_updated_at ON rise_x_flows;
CREATE TRIGGER update_rise_x_flows_updated_at
    BEFORE UPDATE ON rise_x_flows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
