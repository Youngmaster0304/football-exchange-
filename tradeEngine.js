const { Connection, PublicKey, Keypair, SystemProgram, Transaction } = require('@solana/web3.js');
const fs = require('fs');
const path = require('path');
const supabase = require('./supabaseClient');

let portfolios = {};

// In-memory fallback when Supabase is not configured
let useDatabase = false;

// Solana Network & Connection setup
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const RPC_URL = SOLANA_NETWORK === 'mainnet' ? 'https://api.mainnet-beta.solana.com' : 'https://api.devnet.solana.com';
const connection = new Connection(RPC_URL, "confirmed");

let serverKeypair = null;

/**
 * Loads the server wallet from disk to enable automated trade payouts
 */
function loadServerWallet() {
  if (serverKeypair) return serverKeypair;
  try {
    const walletPath = path.join(__dirname, 'server_wallet.json');
    if (fs.existsSync(walletPath)) {
      const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
      serverKeypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
      console.log(`[TradeEngine] Loaded server wallet for payouts: ${serverKeypair.publicKey.toBase58()}`);
    } else {
      console.warn(`[TradeEngine] Payout wallet server_wallet.json not found.`);
    }
  } catch (err) {
    console.error(`[TradeEngine] Failed to load server wallet:`, err.message);
  }
  return serverKeypair;
}

/**
 * Initializes the trade engine - loads data from Supabase or memory
 */
async function initialize() {
  // Load wallet for payout support
  loadServerWallet();

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
 * Gets a user's portfolio or creates a new one.
 * If Real Money Mode, dynamically queries and updates cash based on on-chain SOL balance.
 * @param {string} userId - Solana wallet public key or guest identifier
 * @returns {object} The portfolio object
 */
async function getOrCreatePortfolio(userId) {
  if (!userId) return null;

  const isReal = userId.endsWith('_real');
  const cleanAddress = userId.replace('_real', '');

  // Default values
  if (!portfolios[userId]) {
    portfolios[userId] = {
      userId: userId,
      cash: isReal ? 0.0 : 10000.0,
      holdings: {},
      history: []
    };
    await savePortfolio(portfolios[userId]);
  }

  // If Real Money Mode and not an EVM key, dynamically sync cash to on-chain SOL balance
  if (isReal && !cleanAddress.startsWith('0x')) {
    try {
      const pubKey = new PublicKey(cleanAddress);
      const lamports = await connection.getBalance(pubKey);
      const sol = lamports / 1000000000;
      
      // 1 SOL = $100.00 virtual USD in our market exchange rate
      portfolios[userId].cash = sol * 100;
    } catch (err) {
      console.warn(`[TradeEngine] Dynamic SOL balance sync failed for ${cleanAddress}: ${err.message}`);
    }
  }

  return portfolios[userId];
}

/**
 * Executes a trade for a user.
 * @param {string} userId - User identifier (ends in _real for Real Mode)
 * @param {string} teamCode - Team code (e.g. 'BRA')
 * @param {string} action - 'BUY' or 'SELL'
 * @param {number} shares - Number of shares
 * @param {number} currentPrice - Current market price of the team stock
 * @param {string} txid - Optional client-supplied on-chain SOL transfer signature for BUYs
 * @returns {object} { success: boolean, message: string, portfolio: object, txid: string }
 */
async function executeTrade(userId, teamCode, action, shares, currentPrice, txid) {
  const portfolio = await getOrCreatePortfolio(userId);
  if (!portfolio) {
    return { success: false, message: 'Invalid User ID' };
  }

  shares = parseInt(shares);
  if (isNaN(shares) || shares <= 0) {
    return { success: false, message: 'Shares must be a positive integer.' };
  }

  const cost = shares * currentPrice;
  const isReal = userId.endsWith('_real');
  const cleanAddress = userId.replace('_real', '');

  if (action === 'BUY') {
    if (isReal) {
      // --- REAL MONEY MODE BUY FLOW ---
      if (!txid) {
        return { success: false, message: 'Transaction signature (txid) is required to execute a Real Mode BUY.' };
      }

      try {
        console.log(`[TradeEngine] Verifying Real Mode BUY on-chain: ${txid}`);
        // Fetch transaction from Solana
        const tx = await connection.getTransaction(txid, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
        if (!tx) {
          return { success: false, message: 'On-chain transaction not found yet. Please wait for confirmation and retry.' };
        }
        if (tx.meta && tx.meta.err) {
          return { success: false, message: 'SOL transfer transaction failed on-chain.' };
        }

        // Verify receiver is server's wallet
        const serverKey = loadServerWallet();
        if (!serverKey) {
          return { success: false, message: 'Server treasury wallet not configured.' };
        }

        const accountKeys = tx.transaction.message.getAccountKeys ? tx.transaction.message.getAccountKeys() : tx.transaction.message.accountKeys;
        const serverIndex = accountKeys.findIndex(pk => pk.toBase58() === serverKey.publicKey.toBase58());
        if (serverIndex === -1) {
          return { success: false, message: 'SOL was not transferred to the server treasury address.' };
        }

        // Verify sender is user
        const senderIndex = accountKeys.findIndex(pk => pk.toBase58() === cleanAddress);
        if (senderIndex === -1) {
          return { success: false, message: 'Transaction signer does not match your connected wallet.' };
        }

        // Calculate amount of SOL received (post - pre balances)
        const preBalance = tx.meta.preBalances[serverIndex];
        const postBalance = tx.meta.postBalances[serverIndex];
        const receivedLamports = postBalance - preBalance;

        // Exchange rate: 1 SOL = $100 USD. So 1 USD = 0.01 SOL = 10,000,000 lamports
        const expectedLamports = cost * 10000000;

        // Allow 3% buffer for price fluctuations or fees
        if (receivedLamports < expectedLamports * 0.97) {
          return {
            success: false,
            message: `Insufficient SOL received. Expected: ${(expectedLamports / 1e9).toFixed(4)} SOL, Received: ${(receivedLamports / 1e9).toFixed(4)} SOL`
          };
        }

        // Check for transaction signature replay attack
        const signatureUsed = (portfolio.history || []).some(item => item.txid === txid);
        if (signatureUsed) {
          return { success: false, message: 'This transaction signature has already been used.' };
        }

      } catch (err) {
        console.error(`[TradeEngine] On-chain BUY validation error:`, err);
        return { success: false, message: `On-chain validation failed: ${err.message}` };
      }

      // Add shares (in Real Mode, cash balance matches wallet SOL, so we don't subtract it locally)
      portfolio.holdings[teamCode] = (portfolio.holdings[teamCode] || 0) + shares;
      portfolio.history.push({
        id: `${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timestamp: Date.now(),
        type: 'BUY',
        teamCode,
        shares,
        price: currentPrice,
        total: cost,
        txid: txid
      });

      await savePortfolio(portfolio);
      return { success: true, message: `Successfully bought ${shares} shares of ${teamCode} on-chain!`, portfolio, txid };

    } else {
      // --- DEMO MODE BUY FLOW ---
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
  }

  if (action === 'SELL') {
    const currentShares = portfolio.holdings[teamCode] || 0;
    if (currentShares < shares) {
      return {
        success: false,
        message: `Insufficient shares. Attempting to sell: ${shares}, Owned: ${currentShares}`
      };
    }

    if (isReal) {
      // --- REAL MONEY MODE SELL FLOW (Payout SOL back to user) ---
      let payoutTxid = "";
      try {
        const serverKey = loadServerWallet();
        if (!serverKey) {
          return { success: false, message: 'Server wallet for payouts is not loaded.' };
        }

        // Calculate payout lamports (cost in dollars * 10,000,000)
        const payoutLamports = Math.floor(cost * 10000000);

        console.log(`[TradeEngine] Sending real SELL payout of ${(payoutLamports / 1e9).toFixed(4)} SOL to ${cleanAddress}...`);
        
        const payoutTx = new Transaction().add(
          SystemProgram.transfer({
            fromPubkey: serverKey.publicKey,
            toPubkey: new PublicKey(cleanAddress),
            lamports: payoutLamports
          })
        );

        payoutTxid = await connection.sendTransaction(payoutTx, [serverKey]);
        await connection.confirmTransaction(payoutTxid, "confirmed");
        console.log(`[TradeEngine] Payout confirmed on-chain: ${payoutTxid}`);

      } catch (err) {
        console.error(`[TradeEngine] On-chain SELL payout error:`, err);
        return { success: false, message: `On-chain payout transaction failed: ${err.message}` };
      }

      // Deduct shares and record payout
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
        total: cost,
        txid: payoutTxid
      });

      await savePortfolio(portfolio);
      return {
        success: true,
        message: `Successfully sold ${shares} shares of ${teamCode}. Payout of ${(cost * 10000000 / 1e9).toFixed(4)} SOL sent!`,
        portfolio,
        txid: payoutTxid
      };

    } else {
      // --- DEMO MODE SELL FLOW ---
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
