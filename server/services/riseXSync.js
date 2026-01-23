/**
 * Rise-X Data Sync Service
 * 
 * Handles synchronization of data from Rise-X Diana API to local PostgreSQL database.
 * Pattern: Fetch from Rise-X -> Transform -> Upsert to local DB
 * 
 * Features:
 * - Full sync for initial data load
 * - Incremental sync for updates
 * - Work items (jobs/inspections)
 * - Assets (vessels from registries)
 * - Biofouling assessment extraction
 * - Sync state tracking
 */

const https = require('https');
const db = require('../db');
const tokenManager = require('./tokenManager');

// Diana API configuration
const DIANA_API_BASE = 'api.idiana.io';

// Flow Origin IDs - categorized by type
const FLOW_ORIGINS = {
  ranBiofouling: [
    'c87625d0-74b4-4bef-8ab2-eb2cd65fa833',
    'ce374b64-dd61-4892-ae40-fd24e625be79',
    '7a3ded1b-aa86-476a-95f7-dda9822b9518',
    'f7ee94cf-b2e7-4321-9a21-2a179b3830ee',
    '106b26fc-b1f1-4ea5-9e95-5f7bd81ee181'
  ],
  commercialBiofouling: [
    '3490a6ee-7fa6-4cc9-adee-905559229fb5'
  ]
};

// Asset registries
const ASSET_REGISTRIES = {
  ranVessels: { id: '6ffaffbd-c9ac-42a6-ab19-8fa7a30752ca', name: 'RAN Assets' },
  commercialVessels: { id: 'e7f07ad3-8dda-4f7b-b293-7de922cf3abe', name: 'Commercial Vessels' },
  saamTowage: { id: 'd71c7b39-076d-4ebd-8781-fd592c94499b', name: 'SAAM Towage' },
  royalNavy: { id: 'a33e33f1-0de0-86ea-ef5d-c3ebe74b960e', name: 'Royal Navy' },
  usnAssets: { id: '811c11df-ebce-64c8-cd3b-a1c9c52974ec', name: 'USN Assets' },
  rnznAssets: { id: '97325246-f7f5-4811-b079-5f60d77d8956', name: 'RNZN Assets' }
};

const ALL_WORKFLOW_FLOW_ORIGINS = [
  ...FLOW_ORIGINS.ranBiofouling,
  ...FLOW_ORIGINS.commercialBiofouling
];

/**
 * Make API request to Rise-X Diana API
 */
function makeApiRequest(path, token, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: DIANA_API_BASE,
      port: 443,
      path: path,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * Rise-X Sync Service class
 */
class RiseXSyncService {
  constructor() {
    this.activeSyncs = new Map(); // Track active syncs per user to prevent duplicates
  }

  /**
   * Start a sync log entry
   */
  async startSyncLog(userId, entityType, operation) {
    try {
      const result = await db.query(`
        INSERT INTO sync_logs (user_id, entity_type, operation, status, started_at)
        VALUES ($1, $2, $3, 'started', NOW())
        RETURNING id
      `, [userId, entityType, operation]);
      return result.rows[0].id;
    } catch (err) {
      console.error('Failed to start sync log:', err);
      return null;
    }
  }

  /**
   * Complete a sync log entry
   */
  async completeSyncLog(logId, stats, error = null) {
    if (!logId) return;
    
    try {
      await db.query(`
        UPDATE sync_logs SET
          status = $2,
          items_fetched = $3,
          items_created = $4,
          items_updated = $5,
          items_failed = $6,
          completed_at = NOW(),
          duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
          error_message = $7
        WHERE id = $1
      `, [
        logId,
        error ? 'failed' : 'completed',
        stats.fetched || 0,
        stats.created || 0,
        stats.updated || 0,
        stats.failed || 0,
        error
      ]);
    } catch (err) {
      console.error('Failed to complete sync log:', err);
    }
  }

  /**
   * Update sync state for an entity type
   */
  async updateSyncState(userId, entityType, status, cursor = null, count = 0, error = null) {
    try {
      await db.query(`
        INSERT INTO sync_state (user_id, entity_type, last_sync_at, last_sync_cursor, last_sync_count, sync_status, error_message, total_synced)
        VALUES ($1, $2, NOW(), $3, $4, $5, $6, $4)
        ON CONFLICT (user_id, entity_type) DO UPDATE SET
          last_sync_at = NOW(),
          last_sync_cursor = COALESCE(EXCLUDED.last_sync_cursor, sync_state.last_sync_cursor),
          last_sync_count = EXCLUDED.last_sync_count,
          sync_status = EXCLUDED.sync_status,
          error_message = EXCLUDED.error_message,
          total_synced = sync_state.total_synced + EXCLUDED.last_sync_count,
          error_count = CASE WHEN $6 IS NOT NULL THEN sync_state.error_count + 1 ELSE sync_state.error_count END,
          last_error_at = CASE WHEN $6 IS NOT NULL THEN NOW() ELSE sync_state.last_error_at END,
          updated_at = NOW()
      `, [userId, entityType, cursor, count, status, error]);
    } catch (err) {
      console.error('Failed to update sync state:', err);
    }
  }

  /**
   * Get sync state for an entity type
   */
  async getSyncState(userId, entityType) {
    try {
      const result = await db.query(`
        SELECT * FROM sync_state
        WHERE user_id = $1 AND entity_type = $2
      `, [userId, entityType]);
      return result.rows[0] || null;
    } catch (err) {
      console.error('Failed to get sync state:', err);
      return null;
    }
  }

  /**
   * Sync work items from Rise-X
   */
  async syncWorkItems(userId, options = {}) {
    const { forceFullSync = false, flowOrigins = ALL_WORKFLOW_FLOW_ORIGINS } = options;
    
    // Prevent duplicate syncs
    const syncKey = `work_items:${userId}`;
    if (this.activeSyncs.has(syncKey)) {
      console.log(`Sync already in progress for user ${userId}`);
      return { skipped: true, reason: 'sync_in_progress' };
    }
    
    this.activeSyncs.set(syncKey, true);
    const logId = await this.startSyncLog(userId, 'work_items', forceFullSync ? 'full_sync' : 'incremental');
    const stats = { fetched: 0, created: 0, updated: 0, failed: 0 };
    
    try {
      // Get valid token
      const token = await tokenManager.getValidToken(userId);
      if (!token) {
        throw new Error('No valid Rise-X token available');
      }

      await this.updateSyncState(userId, 'work_items', 'in_progress');
      
      console.log(`📡 Syncing work items for user ${userId}...`);
      const allWorkItems = [];
      
      // Fetch from each flow origin
      for (const flowOriginId of flowOrigins) {
        try {
          const workRes = await makeApiRequest(
            `/api/v3/work/user/open?flowOriginId=${flowOriginId}`,
            token
          );
          
          if (workRes.statusCode === 200) {
            const works = JSON.parse(workRes.body);
            allWorkItems.push(...works);
            console.log(`  ✓ Flow ${flowOriginId.substring(0, 8)}...: ${works.length} items`);
          }
        } catch (err) {
          console.log(`  ⚠ Flow ${flowOriginId.substring(0, 8)}...: ${err.message}`);
        }
      }
      
      // Also fetch from base /work endpoint
      try {
        const baseWorkRes = await makeApiRequest('/api/v3/work', token);
        if (baseWorkRes.statusCode === 200) {
          const baseWorks = JSON.parse(baseWorkRes.body);
          allWorkItems.push(...baseWorks);
        }
      } catch (err) {
        console.log(`  ⚠ Base /work: ${err.message}`);
      }
      
      // Deduplicate by work ID
      const workMap = new Map();
      for (const work of allWorkItems) {
        if (work.id && !workMap.has(work.id)) {
          // Skip deleted items
          const isDeleted = work.isDeleted || 
            work.workState === 'Deleted' ||
            work.workStateName === 'Deleted' ||
            work.status === 'Deleted';
          
          if (!isDeleted) {
            workMap.set(work.id, work);
          }
        }
      }
      
      stats.fetched = workMap.size;
      console.log(`📊 Processing ${stats.fetched} unique work items...`);
      
      // Upsert each work item
      for (const [riseXId, work] of workMap) {
        try {
          const vessel = this.extractVesselFromWork(work);
          
          const result = await db.query(`
            INSERT INTO rise_x_work_items (
              rise_x_id, flow_id, flow_name, flow_origin_id, status,
              vessel_rise_x_id, vessel_name, vessel_mmsi, vessel_imo,
              created_at_rise_x, updated_at_rise_x, data, synced_by_user_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
            ON CONFLICT (rise_x_id) DO UPDATE SET
              flow_id = EXCLUDED.flow_id,
              flow_name = EXCLUDED.flow_name,
              status = EXCLUDED.status,
              vessel_rise_x_id = EXCLUDED.vessel_rise_x_id,
              vessel_name = EXCLUDED.vessel_name,
              vessel_mmsi = COALESCE(EXCLUDED.vessel_mmsi, rise_x_work_items.vessel_mmsi),
              vessel_imo = COALESCE(EXCLUDED.vessel_imo, rise_x_work_items.vessel_imo),
              updated_at_rise_x = EXCLUDED.updated_at_rise_x,
              data = EXCLUDED.data,
              synced_at = NOW(),
              updated_at = NOW()
            RETURNING id, (xmax = 0) AS is_insert
          `, [
            riseXId,
            work.flowId || work.flow?.id || null,
            work.flowType?.split('/').pop() || work.flow?.displayName || null,
            work.flowOriginId || null,
            work.currentState || work.status || work.workStateName || 'Unknown',
            vessel?.id || null,
            vessel?.name || null,
            vessel?.mmsi || null,
            vessel?.imo || null,
            work.createdAt || work.created || null,
            work.modifiedAt || work.lastModified || work.modified || null,
            JSON.stringify(work),
            userId
          ]);
          
          if (result.rows[0]?.is_insert) {
            stats.created++;
          } else {
            stats.updated++;
          }
          
          // Extract biofouling assessments if present
          if (vessel?.generalArrangement?.length > 0) {
            await this.extractBiofoulingAssessments(
              result.rows[0].id,
              riseXId,
              vessel
            );
          }
        } catch (err) {
          console.error(`Failed to upsert work item ${riseXId}:`, err.message);
          stats.failed++;
        }
      }
      
      await this.updateSyncState(userId, 'work_items', 'completed', null, stats.fetched);
      await this.completeSyncLog(logId, stats);
      await tokenManager.updateLastSync(userId);
      
      console.log(`✅ Work items sync complete: ${stats.created} created, ${stats.updated} updated, ${stats.failed} failed`);
      return stats;
      
    } catch (err) {
      console.error('Work items sync failed:', err);
      await this.updateSyncState(userId, 'work_items', 'failed', null, 0, err.message);
      await this.completeSyncLog(logId, stats, err.message);
      throw err;
    } finally {
      this.activeSyncs.delete(syncKey);
    }
  }

  /**
   * Extract vessel information from a work item
   */
  extractVesselFromWork(work) {
    const vessel = work.data?.ranVessel || work.data?.vessel;
    if (!vessel) return null;
    
    return {
      id: vessel.id,
      name: vessel.displayName || vessel.name || vessel.data?.name,
      mmsi: vessel.data?.mmsi || vessel.data?.MMSI,
      imo: vessel.data?.imo || vessel.data?.IMO,
      type: vessel.data?.class || vessel.data?.vesselType,
      pennant: vessel.data?.pennant,
      generalArrangement: vessel.data?.generalArrangement || []
    };
  }

  /**
   * Extract biofouling assessments from a vessel's general arrangement data
   */
  async extractBiofoulingAssessments(workItemId, riseXWorkId, vessel) {
    if (!vessel.generalArrangement || vessel.generalArrangement.length === 0) {
      return;
    }
    
    try {
      for (const component of vessel.generalArrangement) {
        const ratings = component.frRatingData || component.items || [];
        
        for (const rating of ratings) {
          await db.query(`
            INSERT INTO biofouling_assessments (
              work_item_id, rise_x_work_id, vessel_rise_x_id, vessel_name, vessel_mmsi,
              component_name, component_category, fouling_rating, fouling_rating_numeric,
              fouling_coverage, pdr_rating, diver_comments, expert_comments, data
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            ON CONFLICT DO NOTHING
          `, [
            workItemId,
            riseXWorkId,
            vessel.id,
            vessel.name,
            vessel.mmsi,
            component.name,
            this.categorizeComponent(component.name),
            rating.foulingRatingType || null,
            this.parseFoulingRating(rating.foulingRatingType),
            rating.foulingCoverage || null,
            rating.pdrRating || null,
            component.diverSupervisorComments || null,
            component.expertInspectorComments || null,
            JSON.stringify(rating)
          ]);
        }
      }
    } catch (err) {
      console.error('Failed to extract biofouling assessments:', err.message);
    }
  }

  /**
   * Categorize a component name
   */
  categorizeComponent(name) {
    if (!name) return 'other';
    const lower = name.toLowerCase();
    
    if (lower.includes('hull') || lower.includes('boot')) return 'hull';
    if (lower.includes('propeller') || lower.includes('prop')) return 'propeller';
    if (lower.includes('rudder')) return 'rudder';
    if (lower.includes('sea chest') || lower.includes('grating')) return 'niche';
    if (lower.includes('keel') || lower.includes('bilge')) return 'niche';
    if (lower.includes('anode') || lower.includes('iccp')) return 'niche';
    if (lower.includes('intake') || lower.includes('discharge')) return 'niche';
    
    return 'other';
  }

  /**
   * Parse fouling rating to numeric value
   */
  parseFoulingRating(rating) {
    if (!rating) return null;
    const match = rating.match(/FR(\d+)/i);
    return match ? parseInt(match[1], 10) : null;
  }

  /**
   * Sync assets from Rise-X registries
   */
  async syncAssets(userId, options = {}) {
    const { registries = Object.values(ASSET_REGISTRIES) } = options;
    
    const syncKey = `assets:${userId}`;
    if (this.activeSyncs.has(syncKey)) {
      return { skipped: true, reason: 'sync_in_progress' };
    }
    
    this.activeSyncs.set(syncKey, true);
    const logId = await this.startSyncLog(userId, 'assets', 'full_sync');
    const stats = { fetched: 0, created: 0, updated: 0, failed: 0 };
    
    try {
      const token = await tokenManager.getValidToken(userId);
      if (!token) {
        throw new Error('No valid Rise-X token available');
      }

      await this.updateSyncState(userId, 'assets', 'in_progress');
      
      console.log(`📡 Syncing assets for user ${userId}...`);
      
      for (const registry of registries) {
        try {
          const assetRes = await makeApiRequest(
            `/api/v3/thing?thingTypeId=${registry.id}`,
            token
          );
          
          if (assetRes.statusCode === 200) {
            const assets = JSON.parse(assetRes.body);
            console.log(`  ✓ ${registry.name}: ${assets.length} assets`);
            
            for (const asset of assets) {
              try {
                const result = await db.query(`
                  INSERT INTO rise_x_assets (
                    rise_x_id, thing_type_id, thing_type_name, display_name, name,
                    mmsi, imo, pennant, vessel_class, vessel_type, flag,
                    organization_name, data, synced_by_user_id
                  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                  ON CONFLICT (rise_x_id) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    name = EXCLUDED.name,
                    mmsi = COALESCE(EXCLUDED.mmsi, rise_x_assets.mmsi),
                    imo = COALESCE(EXCLUDED.imo, rise_x_assets.imo),
                    pennant = COALESCE(EXCLUDED.pennant, rise_x_assets.pennant),
                    vessel_class = EXCLUDED.vessel_class,
                    vessel_type = EXCLUDED.vessel_type,
                    flag = EXCLUDED.flag,
                    data = EXCLUDED.data,
                    synced_at = NOW(),
                    updated_at = NOW()
                  RETURNING id, (xmax = 0) AS is_insert
                `, [
                  asset.id,
                  registry.id,
                  registry.name,
                  asset.displayName || asset.name,
                  asset.data?.name || asset.name,
                  asset.data?.mmsi || asset.data?.MMSI || null,
                  asset.data?.imo || asset.data?.IMO || null,
                  asset.data?.pennant || null,
                  asset.data?.class || asset.data?.vesselClass || null,
                  asset.data?.vesselType || asset.thingType?.name || null,
                  asset.data?.flag || null,
                  asset.data?.organization || asset.data?.owner || null,
                  JSON.stringify(asset),
                  userId
                ]);
                
                stats.fetched++;
                if (result.rows[0]?.is_insert) {
                  stats.created++;
                } else {
                  stats.updated++;
                }
              } catch (err) {
                console.error(`Failed to upsert asset ${asset.id}:`, err.message);
                stats.failed++;
              }
            }
          }
        } catch (err) {
          console.log(`  ⚠ ${registry.name}: ${err.message}`);
        }
      }
      
      await this.updateSyncState(userId, 'assets', 'completed', null, stats.fetched);
      await this.completeSyncLog(logId, stats);
      
      console.log(`✅ Assets sync complete: ${stats.created} created, ${stats.updated} updated`);
      return stats;
      
    } catch (err) {
      console.error('Assets sync failed:', err);
      await this.updateSyncState(userId, 'assets', 'failed', null, 0, err.message);
      await this.completeSyncLog(logId, stats, err.message);
      throw err;
    } finally {
      this.activeSyncs.delete(syncKey);
    }
  }

  /**
   * Sync flows from Rise-X
   */
  async syncFlows(userId) {
    const syncKey = `flows:${userId}`;
    if (this.activeSyncs.has(syncKey)) {
      return { skipped: true, reason: 'sync_in_progress' };
    }
    
    this.activeSyncs.set(syncKey, true);
    const stats = { fetched: 0, created: 0, updated: 0, failed: 0 };
    
    try {
      const token = await tokenManager.getValidToken(userId);
      if (!token) {
        throw new Error('No valid Rise-X token available');
      }

      console.log(`📡 Syncing flows for user ${userId}...`);
      
      for (const flowId of ALL_WORKFLOW_FLOW_ORIGINS) {
        try {
          const result = await makeApiRequest(`/api/v3/flow/${flowId}`, token);
          
          if (result.statusCode === 200) {
            const flow = JSON.parse(result.body);
            
            await db.query(`
              INSERT INTO rise_x_flows (
                rise_x_id, name, description, flow_type, origin_id, origin_name, is_active, data
              ) VALUES ($1, $2, $3, $4, $5, $6, true, $7)
              ON CONFLICT (rise_x_id) DO UPDATE SET
                name = EXCLUDED.name,
                description = EXCLUDED.description,
                flow_type = EXCLUDED.flow_type,
                data = EXCLUDED.data,
                synced_at = NOW(),
                updated_at = NOW()
            `, [
              flowId,
              flow.displayName || flow.name,
              flow.description,
              flow.flowType,
              flow.originId,
              flow.originName,
              JSON.stringify(flow)
            ]);
            
            stats.fetched++;
            stats.created++;
          }
        } catch (err) {
          stats.failed++;
        }
      }
      
      console.log(`✅ Flows sync complete: ${stats.fetched} flows`);
      return stats;
      
    } finally {
      this.activeSyncs.delete(syncKey);
    }
  }

  /**
   * Full sync - syncs all entity types
   */
  async fullSync(userId) {
    console.log(`🔄 Starting full sync for user ${userId}...`);
    
    const results = {
      workItems: null,
      assets: null,
      flows: null,
      errors: []
    };
    
    try {
      results.workItems = await this.syncWorkItems(userId, { forceFullSync: true });
    } catch (err) {
      results.errors.push({ entity: 'work_items', error: err.message });
    }
    
    try {
      results.assets = await this.syncAssets(userId);
    } catch (err) {
      results.errors.push({ entity: 'assets', error: err.message });
    }
    
    try {
      results.flows = await this.syncFlows(userId);
    } catch (err) {
      results.errors.push({ entity: 'flows', error: err.message });
    }
    
    console.log(`✅ Full sync complete for user ${userId}`);
    return results;
  }

  /**
   * Incremental sync - only syncs work items (most frequently updated)
   */
  async incrementalSync(userId) {
    console.log(`🔄 Starting incremental sync for user ${userId}...`);
    
    try {
      return await this.syncWorkItems(userId, { forceFullSync: false });
    } catch (err) {
      console.error('Incremental sync failed:', err);
      throw err;
    }
  }

  /**
   * Get all synced work items from local database
   */
  async getWorkItems(userId, options = {}) {
    const { limit = 100, offset = 0, status = null, vesselId = null, search = null } = options;
    
    let query = `
      SELECT * FROM rise_x_work_items
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;
    
    if (status) {
      params.push(status);
      query += ` AND status = $${++paramCount}`;
    }
    
    if (vesselId) {
      params.push(vesselId);
      query += ` AND vessel_rise_x_id = $${++paramCount}`;
    }
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (vessel_name ILIKE $${++paramCount} OR flow_name ILIKE $${paramCount})`;
    }
    
    query += ` ORDER BY updated_at_rise_x DESC NULLS LAST`;
    
    params.push(limit, offset);
    query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    
    try {
      const result = await db.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('Failed to get work items:', err);
      throw err;
    }
  }

  /**
   * Get all synced assets from local database
   */
  async getAssets(userId, options = {}) {
    const { limit = 100, offset = 0, registryId = null, search = null } = options;
    
    let query = `SELECT * FROM rise_x_assets WHERE 1=1`;
    const params = [];
    let paramCount = 0;
    
    if (registryId) {
      params.push(registryId);
      query += ` AND thing_type_id = $${++paramCount}`;
    }
    
    if (search) {
      params.push(`%${search}%`);
      query += ` AND (display_name ILIKE $${++paramCount} OR name ILIKE $${paramCount} OR mmsi ILIKE $${paramCount})`;
    }
    
    query += ` ORDER BY display_name ASC`;
    
    params.push(limit, offset);
    query += ` LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    
    try {
      const result = await db.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('Failed to get assets:', err);
      throw err;
    }
  }

  /**
   * Get sync status for all entity types
   */
  async getSyncStatus(userId) {
    try {
      const result = await db.query(`
        SELECT 
          entity_type,
          last_sync_at,
          sync_status,
          total_synced,
          error_message,
          error_count
        FROM sync_state
        WHERE user_id = $1
        ORDER BY entity_type
      `, [userId]);
      
      const status = {};
      for (const row of result.rows) {
        status[row.entity_type] = row;
      }
      
      return status;
    } catch (err) {
      console.error('Failed to get sync status:', err);
      return {};
    }
  }

  /**
   * Get biofouling assessments for a vessel
   */
  async getBiofoulingAssessments(vesselId, options = {}) {
    const { limit = 50, component = null } = options;
    
    let query = `
      SELECT * FROM biofouling_assessments
      WHERE vessel_rise_x_id = $1
    `;
    const params = [vesselId];
    
    if (component) {
      params.push(component);
      query += ` AND component_name = $2`;
    }
    
    query += ` ORDER BY inspection_date DESC NULLS LAST, created_at DESC`;
    
    params.push(limit);
    query += ` LIMIT $${params.length}`;
    
    try {
      const result = await db.query(query, params);
      return result.rows;
    } catch (err) {
      console.error('Failed to get biofouling assessments:', err);
      throw err;
    }
  }
}

// Export singleton instance
module.exports = new RiseXSyncService();
