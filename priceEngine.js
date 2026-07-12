/**
 * Football Stock Exchange - Price Engine
 * 
 * Formulas:
 * 1. Implied-probability price: price = 1000 * (1 / decimalOdds)
 * 2. Event impulse: jumps on goals (+100), penalties (+50), red cards (-80), VAR (-40 or +40)
 *    Impulses decay by 15% per tick (multiply by 0.85).
 * 3. Volatility: standard deviation of the team's last 20 price ticks.
 */

// Event Impulse configurations
const EVENT_IMPULSES = {
  GOAL_FOR: 100,
  GOAL_AGAINST: -100,
  PENALTY_FOR: 50,
  PENALTY_AGAINST: -50,
  RED_CARD_FOR: -80,
  RED_CARD_AGAINST: 80,
  VAR_OVERTURN_FOR: 40,
  VAR_OVERTURN_AGAINST: -40
};

// Decay coefficient (15% decay per tick means 85% remains)
const DECAY_RATE = 0.85;

/**
 * Calculates the standard deviation of a series of numbers
 * @param {number[]} values - Array of numbers (last 20 ticks)
 * @returns {number} Standard deviation
 */
function calculateStdDev(values) {
  if (values.length <= 1) return 0;
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(val => Math.pow(val - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / values.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * Recalculate price and volatility for a team
 * @param {number} decimalOdds - Live win outright decimal odds (e.g. 2.50)
 * @param {number} currentImpulse - Current accumulated impulse value for the team
 * @param {number[]} priceHistory - Array of previous price ticks (up to 20)
 * @returns {object} { price, volatility, updatedImpulse }
 */
function calculateTeamPrice(decimalOdds, currentImpulse, priceHistory) {
  // 1. Calculate implied odds price
  // Safe check for invalid decimal odds (e.g. <= 1)
  const safeOdds = Math.max(decimalOdds, 1.01);
  const impliedPrice = 1000 * (1 / safeOdds);

  // 2. Total price is fundamental value + active impulse
  const rawPrice = impliedPrice + currentImpulse;
  
  // Floor the price at $1 to prevent negative or zero value stocks
  const price = Math.max(rawPrice, 1.0);

  // 3. Keep history capped at 20 ticks
  const newHistory = [...priceHistory, price].slice(-20);

  // 4. Calculate volatility
  const volatility = calculateStdDev(newHistory);

  return {
    price: Math.round(price * 100) / 100, // Round to 2 decimal places
    volatility: Math.round(volatility * 100) / 100,
    priceHistory: newHistory
  };
}

/**
 * Applies a 15% decay to an impulse value
 * @param {number} impulse - Current impulse
 * @returns {number} Decayed impulse
 */
function decayImpulse(impulse) {
  const decayed = impulse * DECAY_RATE;
  // If the impulse becomes negligible (e.g., < 0.1), reset it to 0 to avoid tail calculations
  if (Math.abs(decayed) < 0.1) return 0;
  return decayed;
}

module.exports = {
  EVENT_IMPULSES,
  calculateTeamPrice,
  decayImpulse,
  calculateStdDev
};
