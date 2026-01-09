/**
 * MarineStream Workspace - Marinesia API Service
 * Provides vessel profiles, images, locations, and port data
 * Complements AISstream real-time data with rich static info
 */

const MARINESIA_BASE_URL = 'https://api.marinesia.com/api/v1';

// In-memory cache with TTL
const cache = {
  profiles: new Map(),       // MMSI -> profile data
  images: new Map(),         // MMSI -> image URL
  locations: new Map(),      // MMSI -> latest location
  ports: new Map(),          // port_id -> port data
  nearbyVessels: new Map(),  // boundingBox key -> vessels
  nearbyPorts: new Map(),    // boundingBox key -> ports
};

// Cache TTL configuration (milliseconds)
const CACHE_TTL = {
  profile: 24 * 60 * 60 * 1000,      // 24 hours - static data rarely changes
  image: 7 * 24 * 60 * 60 * 1000,    // 7 days - images very rarely change
  location: 2 * 60 * 1000,            // 2 minutes - position data is semi-fresh
  port: 24 * 60 * 60 * 1000,         // 24 hours - port data is static
  nearby: 5 * 60 * 1000,             // 5 minutes - nearby queries
};

// Rate limiting state
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 100; // 100ms between requests

/**
 * Get API key from environment
 */
function getApiKey() {
  return process.env.MARINESIA_API_KEY;
}

/**
 * Check if Marinesia is configured
 */
function isConfigured() {
  return !!getApiKey();
}

/**
 * Make a rate-limited API request
 */
async function apiRequest(endpoint, params = {}) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error('MARINESIA_API_KEY not configured');
  }

  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }
  lastRequestTime = Date.now();

  // Build URL with params
  const url = new URL(`${MARINESIA_BASE_URL}${endpoint}`);
  url.searchParams.set('key', apiKey);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });

  try {
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (response.status === 429) {
      console.warn('⚠️ Marinesia API rate limit hit');
      throw new Error('RATE_LIMITED');
    }

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    if (error.message === 'RATE_LIMITED') {
      throw error;
    }
    console.error(`Marinesia API error [${endpoint}]:`, error.message);
    throw error;
  }
}

/**
 * Check if cached data is still valid
 */
function isCacheValid(cacheEntry, ttl) {
  if (!cacheEntry) return false;
  return (Date.now() - cacheEntry.timestamp) < ttl;
}

/**
 * Generate cache key for bounding box queries
 */
function getBoundsKey(latMin, latMax, longMin, longMax) {
  return `${latMin.toFixed(2)},${latMax.toFixed(2)},${longMin.toFixed(2)},${longMax.toFixed(2)}`;
}

// ============================================================================
// VESSEL PROFILE API
// ============================================================================

/**
 * Get vessel profile by MMSI
 * Returns: ship type, dimensions, country, callsign, IMO, image
 */
async function getVesselProfile(mmsi) {
  const mmsiStr = String(mmsi);
  
  // Check cache
  const cached = cache.profiles.get(mmsiStr);
  if (isCacheValid(cached, CACHE_TTL.profile)) {
    return cached.data;
  }

  try {
    const response = await apiRequest(`/vessel/${mmsiStr}/profile`);
    
    if (!response.error && response.data) {
      cache.profiles.set(mmsiStr, {
        data: response.data,
        timestamp: Date.now(),
      });
      return response.data;
    }
    
    return null;
  } catch (error) {
    // Return cached data if available (even if stale)
    if (cached) {
      console.log(`📦 Using stale cache for vessel ${mmsiStr}`);
      return cached.data;
    }
    throw error;
  }
}

/**
 * Get vessel image by MMSI
 */
async function getVesselImage(mmsi) {
  const mmsiStr = String(mmsi);
  
  // Check cache
  const cached = cache.images.get(mmsiStr);
  if (isCacheValid(cached, CACHE_TTL.image)) {
    return cached.data;
  }

  try {
    const response = await apiRequest(`/vessel/${mmsiStr}/image`);
    
    if (!response.error && response.data) {
      cache.images.set(mmsiStr, {
        data: response.data,
        timestamp: Date.now(),
      });
      return response.data;
    }
    
    return null;
  } catch (error) {
    if (cached) return cached.data;
    return null;
  }
}

// ============================================================================
// VESSEL LOCATION API
// ============================================================================

/**
 * Get latest vessel location by MMSI
 * Alternative/fallback to AISstream real-time data
 */
async function getVesselLatestLocation(mmsi) {
  const mmsiStr = String(mmsi);
  
  // Check cache (short TTL for location data)
  const cached = cache.locations.get(mmsiStr);
  if (isCacheValid(cached, CACHE_TTL.location)) {
    return cached.data;
  }

  try {
    const response = await apiRequest(`/vessel/${mmsiStr}/location/latest`);
    
    if (!response.error && response.data) {
      cache.locations.set(mmsiStr, {
        data: response.data,
        timestamp: Date.now(),
      });
      return response.data;
    }
    
    return null;
  } catch (error) {
    if (cached) return cached.data;
    return null;
  }
}

/**
 * Get historical vessel locations by MMSI
 */
async function getVesselHistory(mmsi) {
  const mmsiStr = String(mmsi);

  try {
    const response = await apiRequest(`/vessel/${mmsiStr}/location`);
    
    if (!response.error && response.data) {
      return response.data;
    }
    
    return [];
  } catch (error) {
    console.error(`Failed to get history for ${mmsiStr}:`, error.message);
    return [];
  }
}

// ============================================================================
// NEARBY VESSELS API
// ============================================================================

/**
 * Get vessels within a bounding box
 * Great for discovering vessels in a port area or region
 */
async function getNearbyVessels(latMin, latMax, longMin, longMax) {
  const boundsKey = getBoundsKey(latMin, latMax, longMin, longMax);
  
  // Check cache
  const cached = cache.nearbyVessels.get(boundsKey);
  if (isCacheValid(cached, CACHE_TTL.nearby)) {
    return cached.data;
  }

  try {
    const response = await apiRequest('/vessel/nearby', {
      lat_min: latMin,
      lat_max: latMax,
      long_min: longMin,
      long_max: longMax,
    });
    
    if (!response.error && response.data) {
      cache.nearbyVessels.set(boundsKey, {
        data: response.data,
        timestamp: Date.now(),
      });
      return response.data;
    }
    
    return [];
  } catch (error) {
    if (cached) return cached.data;
    return [];
  }
}

// ============================================================================
// VESSEL SEARCH API
// ============================================================================

/**
 * Search vessel profiles with pagination and filters
 * @param {object} options - { page, limit, sort, order, filters }
 * filters: "country:AUS,ship_type:Tanker"
 */
async function searchVesselProfiles(options = {}) {
  const { page = 1, limit = 10, sort = 'name', order = 'asc', filters } = options;

  try {
    const response = await apiRequest('/vessel/profile', {
      page,
      limit,
      sort,
      order,
      filters,
    });
    
    if (!response.error) {
      return {
        vessels: response.data || [],
        meta: response.meta || {},
      };
    }
    
    return { vessels: [], meta: {} };
  } catch (error) {
    return { vessels: [], meta: {} };
  }
}

/**
 * Search vessels by name
 */
async function searchVesselsByName(name, options = {}) {
  return searchVesselProfiles({
    ...options,
    filters: `name:${name}`,
  });
}

// ============================================================================
// PORT API
// ============================================================================

/**
 * Get port profile by ID
 */
async function getPortProfile(portId) {
  // Check cache
  const cached = cache.ports.get(portId);
  if (isCacheValid(cached, CACHE_TTL.port)) {
    return cached.data;
  }

  try {
    const response = await apiRequest(`/port/${portId}/profile`);
    
    if (!response.error && response.data) {
      cache.ports.set(portId, {
        data: response.data,
        timestamp: Date.now(),
      });
      return response.data;
    }
    
    return null;
  } catch (error) {
    if (cached) return cached.data;
    return null;
  }
}

/**
 * Get ports within a bounding box
 */
async function getNearbyPorts(latMin, latMax, longMin, longMax) {
  const boundsKey = getBoundsKey(latMin, latMax, longMin, longMax);
  
  // Check cache
  const cached = cache.nearbyPorts.get(boundsKey);
  if (isCacheValid(cached, CACHE_TTL.nearby)) {
    return cached.data;
  }

  try {
    const response = await apiRequest('/port/nearby', {
      lat_min: latMin,
      lat_max: latMax,
      long_min: longMin,
      long_max: longMax,
    });
    
    if (!response.error && response.data) {
      cache.nearbyPorts.set(boundsKey, {
        data: response.data,
        timestamp: Date.now(),
      });
      return response.data;
    }
    
    return [];
  } catch (error) {
    if (cached) return cached.data;
    return [];
  }
}

/**
 * Search ports with pagination and filters
 * @param {object} options - { page, limit, sort, order, filters }
 * filters: "country:AUS,name:Sydney"
 */
async function searchPorts(options = {}) {
  const { page = 1, limit = 10, sort = 'name', order = 'asc', filters } = options;

  try {
    const response = await apiRequest('/port/profile', {
      page,
      limit,
      sort,
      order,
      filters,
    });
    
    if (!response.error) {
      return {
        ports: response.data || [],
        meta: response.meta || {},
      };
    }
    
    return { ports: [], meta: {} };
  } catch (error) {
    return { ports: [], meta: {} };
  }
}

// ============================================================================
// ENRICHMENT HELPERS
// ============================================================================

/**
 * Enrich a vessel object with Marinesia profile data
 * Smart: Only fetches if data is missing
 */
async function enrichVessel(vessel) {
  if (!vessel.mmsi) return vessel;

  try {
    const profile = await getVesselProfile(vessel.mmsi);
    
    if (profile) {
      return {
        ...vessel,
        marinesia: {
          imo: profile.imo,
          callsign: profile.callsign,
          shipType: profile.ship_type,
          country: profile.country,
          length: profile.length,
          width: profile.width,
          dimensions: {
            a: profile.dimension_a,
            b: profile.dimension_b,
            c: profile.dimension_c,
            d: profile.dimension_d,
          },
          image: profile.image || null,
        },
      };
    }
  } catch (error) {
    // Continue without enrichment
  }

  return vessel;
}

/**
 * Enrich multiple vessels in parallel (with rate limiting)
 */
async function enrichVessels(vessels, maxConcurrent = 3) {
  if (!isConfigured()) return vessels;

  const enriched = [];
  
  // Process in batches to respect rate limits
  for (let i = 0; i < vessels.length; i += maxConcurrent) {
    const batch = vessels.slice(i, i + maxConcurrent);
    const results = await Promise.allSettled(batch.map(v => enrichVessel(v)));
    
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        enriched.push(result.value);
      } else {
        enriched.push(batch[idx]); // Use original if enrichment failed
      }
    });
  }

  return enriched;
}

/**
 * Get position from Marinesia as fallback when AISstream has no data
 */
async function getFallbackPosition(mmsi) {
  try {
    const location = await getVesselLatestLocation(mmsi);
    
    if (location) {
      return {
        lat: location.lat,
        lng: location.lng,
        speed: location.sog,
        course: location.cog,
        heading: location.hdt,
        status: location.status,
        timestamp: location.ts,
        source: 'marinesia',
      };
    }
  } catch (error) {
    // Silent fail - AISstream is primary
  }
  
  return null;
}

// ============================================================================
// CACHE MANAGEMENT
// ============================================================================

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    profiles: cache.profiles.size,
    images: cache.images.size,
    locations: cache.locations.size,
    ports: cache.ports.size,
    nearbyVessels: cache.nearbyVessels.size,
    nearbyPorts: cache.nearbyPorts.size,
  };
}

/**
 * Clear all caches
 */
function clearCache() {
  Object.values(cache).forEach(c => c.clear());
  console.log('🧹 Marinesia cache cleared');
}

/**
 * Clear stale cache entries
 */
function cleanStaleCache() {
  const now = Date.now();
  let cleaned = 0;

  // Clean each cache type based on its TTL
  const cleanMap = (cacheMap, ttl) => {
    cacheMap.forEach((entry, key) => {
      if ((now - entry.timestamp) > ttl * 2) { // Keep for 2x TTL before cleanup
        cacheMap.delete(key);
        cleaned++;
      }
    });
  };

  cleanMap(cache.profiles, CACHE_TTL.profile);
  cleanMap(cache.images, CACHE_TTL.image);
  cleanMap(cache.locations, CACHE_TTL.location);
  cleanMap(cache.ports, CACHE_TTL.port);
  cleanMap(cache.nearbyVessels, CACHE_TTL.nearby);
  cleanMap(cache.nearbyPorts, CACHE_TTL.nearby);

  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} stale Marinesia cache entries`);
  }
}

// Clean cache every 30 minutes
setInterval(cleanStaleCache, 30 * 60 * 1000);

module.exports = {
  // Configuration
  isConfigured,
  
  // Vessel APIs
  getVesselProfile,
  getVesselImage,
  getVesselLatestLocation,
  getVesselHistory,
  getNearbyVessels,
  searchVesselProfiles,
  searchVesselsByName,
  
  // Port APIs
  getPortProfile,
  getNearbyPorts,
  searchPorts,
  
  // Enrichment helpers
  enrichVessel,
  enrichVessels,
  getFallbackPosition,
  
  // Cache management
  getCacheStats,
  clearCache,
};
