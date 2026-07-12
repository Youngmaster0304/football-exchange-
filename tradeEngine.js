const supabase = require('./supabaseClient');

let portfolios = {};

// In-memory fallback when Supabase is not configured
let useDatabase = false;

/**
 * Initializes the trade engine - loads data from Supabase or memory
 */
async function initialize() {
  if (!supabase) {
    console.log('[TradeEngine] Running with in-memory storage.');
    return;
  }

  try {
    const { data, error } = await supabase.from('portfolios').select('*');
    if (error) throw error;

    portfolios = {};
    (data || []).forEach(row => {
      portfolios[row.user_id] = {
        userId: row.user_id,
        cash: row.cash,
        holdings: row.holdings || {},
        history: row.history || []
      };
    });

    useDatabase = true;
    console.log(`[TradeEngine] Loaded ${Object.keys(portfolios).length} portfolios from Supabase.`);
  } catch (error) {
    console.error('[TradeEngine] Supabase init failed, falling back to memory:', error.message);
    useDatabase = false;
  }
}

/**
 * Saves a portfolio to Supabase (upsert)
 */
async function savePortfolio(portfolio) {
  if (!useDatabase) return;

  try {
    const { error } = await supabase
      .from('portfolios')
      .upsert({
        user_id: portfolio.userId,
        cash: portfolio.cash,
        holdings: portfolio.holdings,
        history: portfolio.history
      }, { onConflict: 'user_id' });

    if (error) throw error;
  } catch (error) {
    console.error('[TradeEngine] Error saving portfolio:', error.message);
  }
}

/**
 * Gets a user's portfolio or creates a new one with $10,000 cash.
 * @param {string} userId - Solana wallet public key or guest identifier
 * @returns {object} The portfolio object
 */
async function getOrCreatePortfolio(userId) {
  if (!userId) return null;

  if (!portfolios[userId]) {
    portfolios[userId] = {
      userId: userId,
      cash: 10000.0,
      holdings: {},
      history: []
    };
    await savePortfolio(portfolios[userId]);
  }

  return portfolios[userId];
}

/**
 * Executes a trade for a user.
 * @param {string} userId - User identifier
 * @param {string} teamCode - Team code (e.g. 'BRA')
 * @param {string} action - 'BUY' or 'SELL'
 * @param {number} shares - Number of shares (must be positive integer)
 * @param {number} currentPrice - Current market price of the team stock
 * @returns {object} { success: boolean, message: string, portfolio: object }
 */
async function executeTrade(userId, teamCode, action, shares, currentPrice) {
  const portfolio = await getOrCreatePortfolio(userId);
  if (!portfolio) {
    return { success: false, message: 'Invalid User ID' };
  }

  shares = parseInt(shares);
  if (isNaN(shares) || shares <= 0) {
    return { success: false, message: 'Shares must be a positive integer.' };
  }

  const cost = shares * currentPrice;

  if (action === 'BUY') {
    if (portfolio.cash < cost) {
      return {
        success: false,
        message: `Insufficient cash. Required: $${cost.toFixed(2)}, Available: $${portfolio.cash.toFixed(2)}`
      };
    }

    portfolio.cash -= cost;
    portfolio.holdings[teamCode] = (portfolio.holdings[teamCode] || 0) + shares;

    portfolio.history.push({
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      type: 'BUY',
      teamCode,
      shares,
      price: currentPrice,
      total: cost
    });

    await savePortfolio(portfolio);
    return { success: true, message: `Successfully bought ${shares} shares of ${teamCode}`, portfolio };
  }

  if (action === 'SELL') {
    const currentShares = portfolio.holdings[teamCode] || 0;
    if (currentShares < shares) {
      return {
        success: false,
        message: `Insufficient shares. Attempting to sell: ${shares}, Owned: ${currentShares}`
      };
    }

    portfolio.cash += cost;
    portfolio.holdings[teamCode] -= shares;

    if (portfolio.holdings[teamCode] === 0) {
      delete portfolio.holdings[teamCode];
    }

    portfolio.history.push({
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      type: 'SELL',
      teamCode,
      shares,
      price: currentPrice,
      total: cost
    });

    await savePortfolio(portfolio);
    return { success: true, message: `Successfully sold ${shares} shares of ${teamCode}`, portfolio };
  }

  return { success: false, message: 'Invalid action. Must be BUY or SELL.' };
}

/**
 * Calculates net worth for a portfolio given current team prices.
 * @param {object} portfolio - User portfolio
 * @param {object} currentPrices - Map of teamCode -> price
 * @returns {number} Net worth
 */
function calculateNetWorth(portfolio, currentPrices) {
  let holdingsValue = 0;
  for (const [teamCode, shares] of Object.entries(portfolio.holdings)) {
    const price = currentPrices[teamCode] || 0;
    holdingsValue += shares * price;
  }
  return portfolio.cash + holdingsValue;
}

/**
 * Gets the current leaderboard sorted by net worth.
 * @param {object} currentPrices - Map of teamCode -> price
 * @returns {array} Leaderboard array of { userId, netWorth, cash, holdingsCount }
 */
function getLeaderboard(currentPrices) {
  return Object.values(portfolios)
    .map(p => {
      const netWorth = calculateNetWorth(p, currentPrices);
      return {
        userId: p.userId,
        netWorth: Math.round(netWorth * 100) / 100,
        cash: Math.round(p.cash * 100) / 100,
        holdingsCount: Object.keys(p.holdings).length
      };
    })
    .sort((a, b) => b.netWorth - a.netWorth)
    .slice(0, 10);
}

module.exports = {
  initialize,
  getOrCreatePortfolio,
  executeTrade,
  calculateNetWorth,
  getLeaderboard,
  portfolios
};
