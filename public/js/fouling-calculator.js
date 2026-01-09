/**
 * Hull Fouling Calculator - MarineStream™ Frontend Module
 * Physics-based fouling visualization and cost calculation
 * 
 * @module FoulingCalculator
 */

// Fouling Rating descriptions and colors
export const FR_LEVELS = {
  0: { name: 'FR0', label: 'Clean', color: '#22c55e', description: 'Clean hull, no fouling' },
  1: { name: 'FR1', label: 'Light Slime', color: '#84cc16', description: 'Light slime film' },
  2: { name: 'FR2', label: 'Medium Slime', color: '#eab308', description: 'Medium slime with some growth' },
  3: { name: 'FR3', label: 'Heavy Slime', color: '#f97316', description: 'Heavy slime, possible soft fouling' },
  4: { name: 'FR4', label: 'Light Hard', color: '#ef4444', description: 'Light calcareous/hard fouling' },
  5: { name: 'FR5', label: 'Heavy Hard', color: '#dc2626', description: 'Heavy calcareous fouling' }
};

// Resistance increase percentages by FR level
export const FR_RESISTANCE_INCREASE = {
  0: 0,
  1: 15,
  2: 35,
  3: 60,
  4: 95,
  5: 193
};

/**
 * Get color for a fouling rating level
 * @param {number} frLevel - Fouling rating (0-5)
 * @returns {string} Hex color code
 */
export function getFRColor(frLevel) {
  const level = Math.min(5, Math.max(0, Math.round(frLevel || 0)));
  return FR_LEVELS[level]?.color || '#6b7280';
}

/**
 * Get label for a fouling rating level
 * @param {number} frLevel - Fouling rating (0-5)
 * @returns {string} Human-readable label
 */
export function getFRLabel(frLevel) {
  if (frLevel === null || frLevel === undefined) return 'No data';
  const level = Math.min(5, Math.max(0, Math.round(frLevel)));
  return FR_LEVELS[level]?.name || `FR${level}`;
}

/**
 * Get full description for a fouling rating level
 * @param {number} frLevel - Fouling rating (0-5)
 * @returns {object} FR level details
 */
export function getFRDetails(frLevel) {
  if (frLevel === null || frLevel === undefined) {
    return {
      name: 'Unknown',
      label: 'No data available',
      color: '#6b7280',
      description: 'No fouling data available from MarineStream API',
      resistanceIncrease: null
    };
  }
  const level = Math.min(5, Math.max(0, Math.round(frLevel)));
  return {
    ...FR_LEVELS[level],
    resistanceIncrease: FR_RESISTANCE_INCREASE[level]
  };
}

/**
 * Calculate fleet health metrics from vessel array
 * @param {Array} vessels - Array of vessel objects with foulingPrediction
 * @returns {object} Fleet health summary
 */
export function calculateFleetHealthMetrics(vessels) {
  if (!vessels || vessels.length === 0) {
    return {
      totalVessels: 0,
      vesselsWithData: 0,
      avgFoulingRating: null,
      avgDaysSinceClean: null,
      health: 'unknown',
      healthLabel: 'No Data',
      healthColor: '#6b7280',
      atRisk: 0,
      needsCleaning: 0,
      distribution: { fr0: 0, fr1: 0, fr2: 0, fr3: 0, fr4: 0, fr5: 0 }
    };
  }
  
  // Filter vessels with valid fouling data
  const vesselsWithData = vessels.filter(v => 
    v.foulingPrediction?.frLevel !== null && 
    v.foulingPrediction?.frLevel !== undefined
  );
  
  if (vesselsWithData.length === 0) {
    return {
      totalVessels: vessels.length,
      vesselsWithData: 0,
      avgFoulingRating: null,
      avgDaysSinceClean: null,
      health: 'no_data',
      healthLabel: 'No Data',
      healthColor: '#6b7280',
      atRisk: 0,
      needsCleaning: 0,
      distribution: { fr0: 0, fr1: 0, fr2: 0, fr3: 0, fr4: 0, fr5: 0 }
    };
  }
  
  // Calculate averages
  const totalFR = vesselsWithData.reduce((sum, v) => sum + (v.foulingPrediction?.frLevel || 0), 0);
  const totalDays = vesselsWithData.reduce((sum, v) => sum + (v.daysSinceLastClean || 0), 0);
  
  const avgFoulingRating = totalFR / vesselsWithData.length;
  const avgDaysSinceClean = totalDays / vesselsWithData.length;
  
  // Count vessels by risk level
  const atRisk = vesselsWithData.filter(v => v.foulingPrediction?.frLevel >= 3).length;
  const needsCleaning = vesselsWithData.filter(v => v.foulingPrediction?.frLevel >= 4).length;
  
  // Distribution by FR level
  const distribution = {
    fr0: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 0).length,
    fr1: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 1).length,
    fr2: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 2).length,
    fr3: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 3).length,
    fr4: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 4).length,
    fr5: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 5).length
  };
  
  // Determine health status
  let health, healthLabel, healthColor;
  if (avgFoulingRating >= 4) {
    health = 'critical';
    healthLabel = 'Critical';
    healthColor = '#dc2626';
  } else if (avgFoulingRating >= 3) {
    health = 'warning';
    healthLabel = 'At Risk';
    healthColor = '#f97316';
  } else if (avgFoulingRating >= 2) {
    health = 'fair';
    healthLabel = 'Fair';
    healthColor = '#eab308';
  } else if (avgFoulingRating >= 1) {
    health = 'good';
    healthLabel = 'Good';
    healthColor = '#84cc16';
  } else {
    health = 'excellent';
    healthLabel = 'Excellent';
    healthColor = '#22c55e';
  }
  
  return {
    totalVessels: vessels.length,
    vesselsWithData: vesselsWithData.length,
    avgFoulingRating: Math.round(avgFoulingRating * 10) / 10,
    avgDaysSinceClean: Math.round(avgDaysSinceClean),
    health,
    healthLabel,
    healthColor,
    atRisk,
    needsCleaning,
    distribution
  };
}

/**
 * Create an SVG arc for the fouling gauge
 * @param {number} value - Value (0-5)
 * @param {number} max - Maximum value
 * @returns {string} SVG path d attribute
 */
export function createGaugeArc(value, max = 5) {
  if (value === null || value === undefined) return '';
  
  const percentage = Math.min(1, Math.max(0, value / max));
  const angle = percentage * 180;
  const radians = (angle - 90) * Math.PI / 180;
  
  const x = 50 + 40 * Math.cos(radians);
  const y = 50 + 40 * Math.sin(radians);
  
  const largeArc = angle > 180 ? 1 : 0;
  
  return `M 10 50 A 40 40 0 ${largeArc} 1 ${x} ${y}`;
}

/**
 * Format resistance increase as percentage string
 * @param {number} frLevel - Fouling rating level
 * @returns {string} Formatted percentage
 */
export function formatResistanceIncrease(frLevel) {
  if (frLevel === null || frLevel === undefined) return 'N/A';
  const increase = FR_RESISTANCE_INCREASE[Math.round(frLevel)] || 0;
  return `+${increase}%`;
}

/**
 * Estimate fuel cost impact based on fouling level
 * Simple estimation for display purposes
 * @param {number} frLevel - Fouling rating (0-5)
 * @param {number} baseCostPerHour - Base fuel cost per hour (AUD)
 * @returns {object} Cost impact analysis
 */
export function estimateFuelImpact(frLevel, baseCostPerHour = 1000) {
  if (frLevel === null || frLevel === undefined) {
    return {
      clean: baseCostPerHour,
      fouled: null,
      extra: null,
      increasePercent: null
    };
  }
  
  const increase = FR_RESISTANCE_INCREASE[Math.round(frLevel)] || 0;
  const fouledCost = baseCostPerHour * (1 + increase / 100);
  
  return {
    clean: baseCostPerHour,
    fouled: Math.round(fouledCost),
    extra: Math.round(fouledCost - baseCostPerHour),
    increasePercent: increase
  };
}

/**
 * Generate chart data for FR distribution
 * @param {object} distribution - Distribution object from calculateFleetHealthMetrics
 * @returns {object} Chart.js compatible data object
 */
export function generateDistributionChartData(distribution) {
  return {
    labels: ['FR0', 'FR1', 'FR2', 'FR3', 'FR4', 'FR5'],
    datasets: [{
      data: [
        distribution.fr0,
        distribution.fr1,
        distribution.fr2,
        distribution.fr3,
        distribution.fr4,
        distribution.fr5
      ],
      backgroundColor: [
        FR_LEVELS[0].color,
        FR_LEVELS[1].color,
        FR_LEVELS[2].color,
        FR_LEVELS[3].color,
        FR_LEVELS[4].color,
        FR_LEVELS[5].color
      ],
      borderWidth: 0
    }]
  };
}

/**
 * Create HTML for vessel fouling status badge
 * @param {object} vessel - Vessel object with foulingPrediction
 * @returns {string} HTML string
 */
export function createFoulingBadge(vessel) {
  const prediction = vessel.foulingPrediction;
  
  if (!prediction || prediction.frLevel === null) {
    return `<span class="fouling-badge no-data">No data</span>`;
  }
  
  const details = getFRDetails(prediction.frLevel);
  const daysText = vessel.daysSinceLastClean !== null 
    ? `${vessel.daysSinceLastClean}d since clean` 
    : '';
  
  return `
    <span class="fouling-badge" style="background: ${details.color}20; color: ${details.color}; border: 1px solid ${details.color}40;">
      <span class="fouling-badge-level">${details.name}</span>
      ${daysText ? `<span class="fouling-badge-days">${daysText}</span>` : ''}
    </span>
  `;
}

/**
 * Render fleet health widget HTML
 * @param {Array} vessels - Array of vessel objects
 * @param {object} options - Rendering options
 * @returns {string} HTML string
 */
export function renderFleetHealthWidget(vessels, options = {}) {
  const metrics = calculateFleetHealthMetrics(vessels);
  
  if (metrics.vesselsWithData === 0) {
    return `
      <div class="fleet-health-widget no-data">
        <div class="fleet-health-header">
          <h4>Fleet Fouling Health</h4>
        </div>
        <div class="fleet-health-empty">
          <p>No fouling data available</p>
          <p class="muted">Fouling data is retrieved from MarineStream API vessel records</p>
        </div>
      </div>
    `;
  }
  
  // Build distribution bar
  const distributionBar = Object.entries(metrics.distribution)
    .map(([key, count]) => {
      if (count === 0) return '';
      const level = parseInt(key.replace('fr', ''));
      const percentage = (count / metrics.vesselsWithData) * 100;
      return `<div class="dist-segment" style="width: ${percentage}%; background: ${FR_LEVELS[level].color};" title="${FR_LEVELS[level].name}: ${count} vessels"></div>`;
    })
    .join('');
  
  return `
    <div class="fleet-health-widget">
      <div class="fleet-health-header">
        <h4>Fleet Fouling Health</h4>
        <span class="health-status" style="color: ${metrics.healthColor};">${metrics.healthLabel}</span>
      </div>
      
      <div class="fleet-health-gauge">
        <div class="gauge-display">
          <svg viewBox="0 0 100 60" class="gauge-svg">
            <path class="gauge-bg" d="M 10 50 A 40 40 0 0 1 90 50" />
            <path class="gauge-fill" d="${createGaugeArc(metrics.avgFoulingRating)}" style="stroke: ${metrics.healthColor};" />
          </svg>
          <div class="gauge-center">
            <span class="gauge-value">${metrics.avgFoulingRating !== null ? metrics.avgFoulingRating.toFixed(1) : '--'}</span>
            <span class="gauge-label">Avg FR</span>
          </div>
        </div>
      </div>
      
      <div class="fleet-health-stats">
        <div class="health-stat">
          <span class="stat-value">${metrics.avgDaysSinceClean || '--'}</span>
          <span class="stat-label">Avg Days Since Clean</span>
        </div>
        <div class="health-stat ${metrics.needsCleaning > 0 ? 'critical' : ''}">
          <span class="stat-value">${metrics.needsCleaning}</span>
          <span class="stat-label">Need Cleaning</span>
        </div>
        <div class="health-stat ${metrics.atRisk > 0 ? 'warning' : ''}">
          <span class="stat-value">${metrics.atRisk}</span>
          <span class="stat-label">At Risk</span>
        </div>
      </div>
      
      <div class="fleet-health-distribution">
        <div class="dist-bar">${distributionBar}</div>
        <div class="dist-legend">
          ${Object.entries(FR_LEVELS).map(([level, info]) => `
            <span class="legend-item" style="color: ${info.color};">
              <span class="legend-dot" style="background: ${info.color};"></span>
              ${info.name}
            </span>
          `).join('')}
        </div>
      </div>
      
      <div class="fleet-health-info">
        <p class="info-text">
          ${metrics.vesselsWithData}/${metrics.totalVessels} vessels with fouling data
        </p>
      </div>
    </div>
  `;
}

// Export all functions for module use
export default {
  FR_LEVELS,
  FR_RESISTANCE_INCREASE,
  getFRColor,
  getFRLabel,
  getFRDetails,
  calculateFleetHealthMetrics,
  createGaugeArc,
  formatResistanceIncrease,
  estimateFuelImpact,
  generateDistributionChartData,
  createFoulingBadge,
  renderFleetHealthWidget
};
