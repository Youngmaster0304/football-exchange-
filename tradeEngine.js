const fs = require('fs');
const path = require('path');

const PORTFOLIOS_FILE = path.join(__dirname, 'portfolios.json');
let portfolios = {};

// Load existing portfolios from file if it exists
function loadPortfolios() {
  try {
    if (fs.existsSync(PORTFOLIOS_FILE)) {
      const data = fs.readFileSync(PORTFOLIOS_FILE, 'utf8');
      portfolios = JSON.parse(data);
      console.log(`[TradeEngine] Loaded ${Object.keys(portfolios).length} portfolios from disk.`);
    } else {
      portfolios = {};
      console.log('[TradeEngine] No portfolios found on disk. Initializing fresh DB.');
    }
  } catch (error) {
    console.error('[TradeEngine] Error loading portfolios:', error.message);
    portfolios = {};
  }
}

// Save current portfolios to file
function savePortfolios() {
  try {
    fs.writeFileSync(PORTFOLIOS_FILE, JSON.stringify(portfolios, null, 2), 'utf8');
  } catch (error) {
    console.error('[TradeEngine] Error saving portfolios:', error.message);
  }
}

/**
 * Gets a user's portfolio or creates a new one with $10,000 cash.
 * @param {string} userId - Solana wallet public key or guest identifier
 * @returns {object} The portfolio object
 */
function getOrCreatePortfolio(userId) {
  if (!userId) return null;
  
  if (!portfolios[userId]) {
    portfolios[userId] = {
      userId: userId,
      cash: 10000.0, // Start with $10,000 virtual cash
      holdings: {},  // Map of teamCode -> shares count (integer)
      history: []    // Array of trade records
    };
    savePortfolios();
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
function executeTrade(userId, teamCode, action, shares, currentPrice) {
  const portfolio = getOrCreatePortfolio(userId);
  if (!portfolio) {
    return { success: false, message: 'Invalid User ID' };
  }

  // Validate inputs
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
    
    // Deduct cash and add holdings
    portfolio.cash -= cost;
    portfolio.holdings[teamCode] = (portfolio.holdings[teamCode] || 0) + shares;
    
    // Record transaction
    portfolio.history.push({
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      type: 'BUY',
      teamCode,
      shares,
      price: currentPrice,
      total: cost
    });
    
    savePortfolios();
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
    
    // Add cash and subtract holdings
    portfolio.cash += cost;
    portfolio.holdings[teamCode] -= shares;
    
    // Clean up key if 0 shares
    if (portfolio.holdings[teamCode] === 0) {
      delete portfolio.holdings[teamCode];
    }
    
    // Record transaction
    portfolio.history.push({
      id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      timestamp: Date.now(),
      type: 'SELL',
      teamCode,
      shares,
      price: currentPrice,
      total: cost
    });
    
    savePortfolios();
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
    .slice(0, 10); // Return top 10
}

// Initialize
loadPortfolios();

module.exports = {
  getOrCreatePortfolio,
  executeTrade,
  calculateNetWorth,
  getLeaderboard,
  portfolios
};
