/**
 * Hull Fouling Calculator - MarineStream™
 * Physics-based fouling model for hull performance prediction
 * 
 * Based on University of Melbourne research and IMO guidelines
 */

// Physical constants
const KNOTS_TO_MPS = 0.514444;
const MPS_TO_KNOTS = 1.94384;
const NU_WATER = 1.19e-6;      // Kinematic viscosity of seawater (m²/s)
const RHO_WATER = 1025;        // Density of seawater (kg/m³)
const GRAVITY = 9.81;          // Gravitational acceleration (m/s²)

// Fuel properties (IMO defaults)
const FUEL_CO2_FACTOR = 3.114; // kg CO2 per kg fuel (HFO)
const FUEL_DENSITY = 0.85;     // kg/L
const FUEL_PRICE_PER_LITER = 1.92; // AUD/L (configurable)

// Propulsion efficiency defaults
const DEFAULT_PROP_EFFICIENCY = 0.65;
const DEFAULT_SFOC = 200; // Specific fuel oil consumption (g/kWh)

/**
 * Fouling Rating (FR) descriptions per IMO MEPC.1/Circ.889
 */
const FR_DESCRIPTIONS = {
  0: { name: 'FR0 - Clean', description: 'Clean hull, no fouling', roughness: 0, resistanceIncrease: 0 },
  1: { name: 'FR1 - Light Slime', description: 'Light slime film', roughness: 0.00003, resistanceIncrease: 0.15 },
  2: { name: 'FR2 - Medium Slime', description: 'Medium slime with some growth', roughness: 0.00010, resistanceIncrease: 0.35 },
  3: { name: 'FR3 - Heavy Slime', description: 'Heavy slime, possible soft fouling', roughness: 0.00030, resistanceIncrease: 0.60 },
  4: { name: 'FR4 - Light Hard', description: 'Light calcareous/hard fouling', roughness: 0.00080, resistanceIncrease: 0.95 },
  5: { name: 'FR5 - Heavy Hard', description: 'Heavy calcareous fouling', roughness: 0.00200, resistanceIncrease: 1.93 }
};

/**
 * Fouling growth rate profiles based on environmental conditions
 * Rate is FR units per day under different conditions
 */
const FOULING_GROWTH_PROFILES = {
  tropical: {
    name: 'Tropical Waters',
    description: 'Warm waters (>25°C), high biological activity',
    baseRate: 0.025,        // FR/day when stationary
    operatingRate: 0.008,   // FR/day when operating
    temperatureModifier: 1.2
  },
  temperate: {
    name: 'Temperate Waters',
    description: 'Moderate temperature (15-25°C)',
    baseRate: 0.015,
    operatingRate: 0.005,
    temperatureModifier: 1.0
  },
  cold: {
    name: 'Cold Waters',
    description: 'Cold waters (<15°C), slower growth',
    baseRate: 0.008,
    operatingRate: 0.002,
    temperatureModifier: 0.6
  },
  mixed: {
    name: 'Mixed Operations',
    description: 'Varied operating conditions (default)',
    baseRate: 0.018,
    operatingRate: 0.006,
    temperatureModifier: 1.0
  }
};

/**
 * Default vessel configurations for common vessel types
 */
const VESSEL_CONFIGS = {
  naval_destroyer: {
    name: 'Naval Destroyer',
    length: 147,
    beam: 18,
    draft: 6.8,
    cb: 0.52,
    ecoSpeed: 15,
    fullSpeed: 28,
    category: 'naval'
  },
  naval_frigate: {
    name: 'Naval Frigate',
    length: 118,
    beam: 14.5,
    draft: 5.5,
    cb: 0.50,
    ecoSpeed: 14,
    fullSpeed: 26,
    category: 'naval'
  },
  patrol_vessel: {
    name: 'Patrol Vessel',
    length: 58,
    beam: 10.5,
    draft: 3.2,
    cb: 0.55,
    ecoSpeed: 12,
    fullSpeed: 22,
    category: 'naval'
  },
  tug: {
    name: 'Harbor Tug',
    length: 32,
    beam: 10,
    draft: 4.5,
    cb: 0.65,
    ecoSpeed: 8,
    fullSpeed: 13,
    category: 'workboat'
  },
  cruise_ship: {
    name: 'Cruise Ship',
    length: 93,
    beam: 16,
    draft: 5.2,
    cb: 0.62,
    ecoSpeed: 10,
    fullSpeed: 13.8,
    category: 'cruise'
  },
  cargo: {
    name: 'Cargo Vessel',
    length: 150,
    beam: 25,
    draft: 10,
    cb: 0.80,
    ecoSpeed: 12,
    fullSpeed: 16,
    category: 'cargo'
  }
};

/**
 * Calculate Reynolds number
 */
function calculateReynolds(speedMs, length) {
  return speedMs * length / NU_WATER;
}

/**
 * Calculate smooth skin friction coefficient (ITTC-1957)
 */
function calculateCfs(ReL) {
  if (ReL <= 0) return 0;
  return 0.075 / Math.pow(Math.log10(ReL) - 2, 2);
}

/**
 * Calculate wetted surface area using Holtrop & Mennen approximation
 */
function calculateWettedSurface(L, B, T, Cb) {
  const S = L * (2 * T + B) * Math.sqrt(Cb) * (0.453 + 0.4425 * Cb - 0.2862 * Cb * Cb + 0.003467 * B / T + 0.3696 * 0.65);
  return S;
}

/**
 * Calculate rough skin friction coefficient
 */
function calculateCfRough(ReL, ks, L) {
  const Cfs = calculateCfs(ReL);
  if (ks <= 0 || !L) return Cfs;
  
  const roughnessRatio = ks / L;
  const roughnessFactor = 1 + 100 * roughnessRatio;
  
  return Math.min(Cfs * roughnessFactor, Cfs * 3);
}

/**
 * Predict fouling rating based on days since last clean
 * 
 * @param {number} daysSinceClean - Days since last cleaning
 * @param {string} profile - Fouling growth profile ('tropical', 'temperate', 'cold', 'mixed')
 * @param {number} operatingRatio - Ratio of time vessel is operating vs idle (0-1)
 * @returns {object} Fouling prediction with FR level and details
 */
function predictFoulingRating(daysSinceClean, profile = 'mixed', operatingRatio = 0.5) {
  if (daysSinceClean === null || daysSinceClean === undefined || daysSinceClean < 0) {
    return {
      frLevel: null,
      frName: 'Unknown',
      confidence: 0,
      daysSinceClean: null,
      predictedFR: null,
      message: 'No cleaning data available'
    };
  }
  
  const growthProfile = FOULING_GROWTH_PROFILES[profile] || FOULING_GROWTH_PROFILES.mixed;
  
  // Calculate effective growth rate based on operating ratio
  const effectiveRate = (operatingRatio * growthProfile.operatingRate) + 
                        ((1 - operatingRatio) * growthProfile.baseRate);
  
  // Predict FR level (non-linear growth - faster initially, slowing over time)
  // Using a logistic growth model capped at FR5
  const maxFR = 5;
  const growthConstant = effectiveRate * 0.15;
  const predictedFR = maxFR / (1 + Math.exp(-growthConstant * (daysSinceClean - 60)));
  
  // Clamp to valid FR range
  const clampedFR = Math.min(maxFR, Math.max(0, predictedFR));
  const frLevel = Math.round(clampedFR);
  
  // Calculate confidence based on data quality and time since clean
  // Confidence decreases with time (more uncertainty)
  const baseConfidence = 0.95;
  const confidenceDecay = Math.max(0.3, 1 - (daysSinceClean / 365) * 0.7);
  const confidence = baseConfidence * confidenceDecay;
  
  return {
    frLevel,
    frName: FR_DESCRIPTIONS[frLevel]?.name || `FR${frLevel}`,
    frDescription: FR_DESCRIPTIONS[frLevel]?.description || '',
    predictedFR: clampedFR,
    daysSinceClean,
    profile: growthProfile.name,
    effectiveGrowthRate: effectiveRate,
    resistanceIncrease: FR_DESCRIPTIONS[frLevel]?.resistanceIncrease || 0,
    confidence: Math.round(confidence * 100),
    daysToNextFR: frLevel < 5 ? Math.round((frLevel + 1 - clampedFR) / effectiveRate) : null,
    message: `Predicted ${FR_DESCRIPTIONS[frLevel]?.name} based on ${daysSinceClean} days since last clean`
  };
}

/**
 * Calculate fuel cost impact for a given fouling level
 * 
 * @param {object} vessel - Vessel configuration
 * @param {number} frLevel - Fouling rating (0-5)
 * @param {number} speed - Speed in knots
 * @param {object} options - Additional options (fuelPrice, currency)
 * @returns {object} Cost analysis with clean vs fouled comparison
 */
function calculateFuelImpact(vessel, frLevel, speed, options = {}) {
  const {
    fuelPrice = FUEL_PRICE_PER_LITER,
    propEfficiency = DEFAULT_PROP_EFFICIENCY,
    sfoc = DEFAULT_SFOC
  } = options;
  
  const fuelCostPerKg = fuelPrice / FUEL_DENSITY;
  
  // Get vessel parameters
  const L = vessel.length || 50;
  const B = vessel.beam || L / 5;
  const T = vessel.draft || B / 2.5;
  const Cb = vessel.cb || 0.65;
  
  const speedMs = speed * KNOTS_TO_MPS;
  const wettedSurface = calculateWettedSurface(L, B, T, Cb);
  const Re = calculateReynolds(speedMs, L);
  
  // Clean hull friction
  const cfClean = calculateCfs(Re);
  const frictionResistanceClean = 0.5 * RHO_WATER * wettedSurface * cfClean * speedMs * speedMs;
  
  // Fouled hull friction
  const roughness = FR_DESCRIPTIONS[frLevel]?.roughness || 0;
  const cfFouled = calculateCfRough(Re, roughness, L);
  const frictionResistanceFouled = 0.5 * RHO_WATER * wettedSurface * cfFouled * speedMs * speedMs;
  
  // Power calculations
  const powerClean = frictionResistanceClean * speedMs / 1000 / propEfficiency; // kW
  const powerFouled = frictionResistanceFouled * speedMs / 1000 / propEfficiency;
  
  // Fuel consumption
  const fuelClean = powerClean * sfoc / 1000; // kg/hr
  const fuelFouled = powerFouled * sfoc / 1000;
  
  // Cost calculations
  const costClean = fuelClean * fuelCostPerKg;
  const costFouled = fuelFouled * fuelCostPerKg;
  
  // CO2 emissions
  const co2Clean = fuelClean * FUEL_CO2_FACTOR;
  const co2Fouled = fuelFouled * FUEL_CO2_FACTOR;
  
  // Percentage increases
  const resistanceIncrease = ((frictionResistanceFouled - frictionResistanceClean) / frictionResistanceClean) * 100;
  const fuelIncrease = ((fuelFouled - fuelClean) / fuelClean) * 100;
  const costIncrease = ((costFouled - costClean) / costClean) * 100;
  
  return {
    speed,
    frLevel,
    frName: FR_DESCRIPTIONS[frLevel]?.name || `FR${frLevel}`,
    
    // Clean hull metrics
    clean: {
      power: powerClean,
      fuelPerHour: fuelClean,
      costPerHour: costClean,
      co2PerHour: co2Clean
    },
    
    // Fouled hull metrics
    fouled: {
      power: powerFouled,
      fuelPerHour: fuelFouled,
      costPerHour: costFouled,
      co2PerHour: co2Fouled
    },
    
    // Impact metrics
    impact: {
      extraFuelPerHour: fuelFouled - fuelClean,
      extraCostPerHour: costFouled - costClean,
      extraCo2PerHour: co2Fouled - co2Clean,
      resistanceIncreasePercent: resistanceIncrease,
      fuelIncreasePercent: fuelIncrease,
      costIncreasePercent: costIncrease
    }
  };
}

/**
 * Calculate annual impact of fouling
 * 
 * @param {object} vessel - Vessel configuration
 * @param {number} frLevel - Fouling rating (0-5)
 * @param {object} options - Operating profile options
 * @returns {object} Annual impact analysis
 */
function calculateAnnualImpact(vessel, frLevel, options = {}) {
  const {
    hoursPerDay = 12,
    daysPerYear = 200,
    ecoSpeedRatio = 0.7, // 70% at eco speed, 30% at full speed
    fuelPrice = FUEL_PRICE_PER_LITER
  } = options;
  
  const annualHours = hoursPerDay * daysPerYear;
  const ecoHours = annualHours * ecoSpeedRatio;
  const fullHours = annualHours * (1 - ecoSpeedRatio);
  
  const ecoSpeed = vessel.ecoSpeed || 12;
  const fullSpeed = vessel.fullSpeed || 18;
  
  // Calculate impacts at both speeds
  const ecoImpact = calculateFuelImpact(vessel, frLevel, ecoSpeed, { fuelPrice });
  const fullImpact = calculateFuelImpact(vessel, frLevel, fullSpeed, { fuelPrice });
  
  // Weighted annual totals
  const annualExtraFuel = (ecoImpact.impact.extraFuelPerHour * ecoHours) + 
                          (fullImpact.impact.extraFuelPerHour * fullHours);
  const annualExtraCost = (ecoImpact.impact.extraCostPerHour * ecoHours) + 
                          (fullImpact.impact.extraCostPerHour * fullHours);
  const annualExtraCo2 = (ecoImpact.impact.extraCo2PerHour * ecoHours) + 
                         (fullImpact.impact.extraCo2PerHour * fullHours);
  
  return {
    vessel: vessel.name || 'Vessel',
    frLevel,
    frName: FR_DESCRIPTIONS[frLevel]?.name || `FR${frLevel}`,
    
    operatingProfile: {
      hoursPerDay,
      daysPerYear,
      annualHours,
      ecoSpeedRatio: ecoSpeedRatio * 100,
      ecoSpeed,
      fullSpeed
    },
    
    ecoSpeedImpact: ecoImpact,
    fullSpeedImpact: fullImpact,
    
    annualImpact: {
      extraFuelKg: annualExtraFuel,
      extraFuelTonnes: annualExtraFuel / 1000,
      extraCost: annualExtraCost,
      extraCo2Kg: annualExtraCo2,
      extraCo2Tonnes: annualExtraCo2 / 1000
    }
  };
}

/**
 * Calculate fleet health summary
 * 
 * @param {Array} vessels - Array of vessel objects with fouling data
 * @returns {object} Fleet health summary with averages and recommendations
 */
function calculateFleetHealth(vessels) {
  if (!vessels || vessels.length === 0) {
    return {
      totalVessels: 0,
      avgFoulingRating: null,
      avgDaysSinceClean: null,
      health: 'unknown',
      atRisk: 0,
      needsCleaning: 0,
      recommendations: []
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
      atRisk: 0,
      needsCleaning: 0,
      recommendations: ['Enable fouling tracking for fleet vessels']
    };
  }
  
  // Calculate averages
  const totalFR = vesselsWithData.reduce((sum, v) => sum + (v.foulingPrediction?.frLevel || 0), 0);
  const totalDays = vesselsWithData.reduce((sum, v) => sum + (v.foulingPrediction?.daysSinceClean || 0), 0);
  
  const avgFoulingRating = totalFR / vesselsWithData.length;
  const avgDaysSinceClean = totalDays / vesselsWithData.length;
  
  // Count vessels at risk (FR >= 3) and needing cleaning (FR >= 4)
  const atRisk = vesselsWithData.filter(v => v.foulingPrediction?.frLevel >= 3).length;
  const needsCleaning = vesselsWithData.filter(v => v.foulingPrediction?.frLevel >= 4).length;
  
  // Determine overall health
  let health = 'excellent';
  if (avgFoulingRating >= 4) health = 'critical';
  else if (avgFoulingRating >= 3) health = 'warning';
  else if (avgFoulingRating >= 2) health = 'fair';
  else if (avgFoulingRating >= 1) health = 'good';
  
  // Generate recommendations
  const recommendations = [];
  if (needsCleaning > 0) {
    recommendations.push(`${needsCleaning} vessel(s) require immediate cleaning (FR4+)`);
  }
  if (atRisk > 0) {
    recommendations.push(`${atRisk} vessel(s) at elevated fouling risk (FR3+)`);
  }
  if (avgDaysSinceClean > 60) {
    recommendations.push(`Average ${Math.round(avgDaysSinceClean)} days since last clean - consider scheduled maintenance`);
  }
  
  return {
    totalVessels: vessels.length,
    vesselsWithData: vesselsWithData.length,
    avgFoulingRating: Math.round(avgFoulingRating * 10) / 10,
    avgDaysSinceClean: Math.round(avgDaysSinceClean),
    health,
    atRisk,
    needsCleaning,
    recommendations,
    byFRLevel: {
      fr0: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 0).length,
      fr1: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 1).length,
      fr2: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 2).length,
      fr3: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 3).length,
      fr4: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 4).length,
      fr5: vesselsWithData.filter(v => v.foulingPrediction?.frLevel === 5).length
    }
  };
}

/**
 * Generate cost-speed curve data for charting
 * 
 * @param {object} vessel - Vessel configuration
 * @param {number} frLevel - Fouling rating (0-5)
 * @param {object} options - Chart options
 * @returns {object} Chart data with speed points and costs
 */
function generateCostSpeedCurve(vessel, frLevel, options = {}) {
  const { 
    minSpeed = 4, 
    maxSpeed = vessel.fullSpeed + 2,
    stepSize = 0.5
  } = options;
  
  const speeds = [];
  const cleanCosts = [];
  const fouledCosts = [];
  const extraCo2 = [];
  
  for (let speed = minSpeed; speed <= maxSpeed; speed += stepSize) {
    const impact = calculateFuelImpact(vessel, frLevel, speed);
    
    speeds.push(speed.toFixed(1));
    cleanCosts.push(impact.clean.costPerHour);
    fouledCosts.push(impact.fouled.costPerHour);
    extraCo2.push(impact.impact.extraCo2PerHour);
  }
  
  return {
    vessel: vessel.name || 'Vessel',
    frLevel,
    frName: FR_DESCRIPTIONS[frLevel]?.name || `FR${frLevel}`,
    chartData: {
      labels: speeds,
      datasets: {
        clean: cleanCosts,
        fouled: fouledCosts,
        extraCo2
      }
    }
  };
}

module.exports = {
  // Constants
  FR_DESCRIPTIONS,
  FOULING_GROWTH_PROFILES,
  VESSEL_CONFIGS,
  
  // Core functions
  predictFoulingRating,
  calculateFuelImpact,
  calculateAnnualImpact,
  calculateFleetHealth,
  generateCostSpeedCurve,
  
  // Utility functions
  calculateReynolds,
  calculateCfs,
  calculateWettedSurface,
  calculateCfRough
};
