/**
 * MarineStream Workspace - Configuration Module
 * Loads configuration from server
 */

let config = null;

/**
 * Load configuration from server
 */
export async function loadConfig() {
  if (config) return config;
  
  try {
    const response = await fetch('/api/config');
    const data = await response.json();
    
    if (data.success) {
      config = data.data;
      console.log('⚙️ Config loaded:', {
        environment: config.environment,
        hasClerkKey: !!config.clerk?.publishableKey,
        hasMapboxToken: !!config.mapbox?.accessToken
      });
      return config;
    }
  } catch (error) {
    console.error('Failed to load config:', error);
  }
  
  // Return defaults if fetch fails
  return {
    clerk: { publishableKey: '' },
    mapbox: { accessToken: '' },
    environment: 'development'
  };
}

/**
 * Get config value
 */
export function getConfig() {
  return config;
}

/**
 * Get Clerk publishable key
 */
export function getClerkKey() {
  return config?.clerk?.publishableKey || '';
}

/**
 * Get Mapbox access token
 */
export function getMapboxToken() {
  return config?.mapbox?.accessToken || '';
}
