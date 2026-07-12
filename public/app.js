// Fanfolio - Frontend Application Logic

// API Configuration (loaded from config.js before this script)

// Application State
let walletAddress = localStorage.getItem('walletAddress') || null;
let isDemoWallet = localStorage.getItem('isDemoWallet') === 'true';
let demoSecretKey = localStorage.getItem('demoSecretKey') ? JSON.parse(localStorage.getItem('demoSecretKey')) : null;

let selectedTeamCode = null;
let activeTradeTab = 'BUY'; // BUY or SELL
let marketTeams = {}; // code -> teamObject
let chartInstance = null;
let socket = null;

// DOM Elements
const walletGate = document.getElementById('wallet-gate');
const btnConnectPhantom = document.getElementById('btn-connect-phantom');
const btnGenerateDemo = document.getElementById('btn-generate-demo');
const walletAddressText = document.getElementById('wallet-address');
const btnDisconnect = document.getElementById('btn-disconnect');
const marketGrid = document.getElementById('market-grid');
const priceTicker = document.getElementById('price-ticker');
const terminalEmpty = document.getElementById('terminal-empty-state');
const terminalActive = document.getElementById('terminal-active-state');
const holdingsBody = document.getElementById('holdings-body');
const portfolioNetWorth = document.getElementById('portfolio-net-worth');
const portfolioCash = document.getElementById('portfolio-cash-balance');
const leaderboardList = document.getElementById('leaderboard-list');
const eventsLog = document.getElementById('events-log');

// Trading Terminal DOM
const terminalFlag = document.getElementById('terminal-flag');
const terminalTeamName = document.getElementById('terminal-team-name');
const terminalTeamCode = document.getElementById('terminal-team-code');
const terminalPrice = document.getElementById('terminal-price');
const terminalChange = document.getElementById('terminal-change');
const volIndicator = document.getElementById('volatility-indicator');
const tabBuy = document.getElementById('tab-buy');
const tabSell = document.getElementById('tab-sell');
const inputShares = document.getElementById('trade-shares');
const lblAvailableCash = document.getElementById('lbl-available-cash');
const lblOwnedShares = document.getElementById('lbl-owned-shares');
const lblOwnedSharesLabel = document.getElementById('lbl-trade-owned-shares-label');
const lblEstimatedCost = document.getElementById('lbl-estimated-cost');
const btnSubmitTrade = document.getElementById('btn-submit-trade');

// On-chain Sync DOM
const btnChainSync = document.getElementById('btn-chain-sync');
const chainSyncBanner = document.getElementById('chain-sync-banner');
const btnCloseSync = document.getElementById('btn-close-sync');
const explorerLink = document.getElementById('explorer-link');

// Toast DOM
const tradeToast = document.getElementById('trade-toast');
const toastTitle = document.getElementById('toast-title');
const toastDesc = document.getElementById('toast-desc');

/* ==========================================
   SOLANA WALLET INTEGRATION
   ========================================== */

// Check if user is already logged in
window.addEventListener('DOMContentLoaded', () => {
  if (walletAddress) {
    initializeDashboard();
  } else {
    walletGate.classList.remove('hidden');
  }
});

// Connect Phantom Wallet
btnConnectPhantom.addEventListener('click', async () => {
  try {
    if (!window.solana || !window.solana.isPhantom) {
      alert('Phantom Wallet not detected! Please install the extension or click "Generate Demo Wallet" to test the app instantly.');
      return;
    }
    
    btnConnectPhantom.disabled = true;
    btnConnectPhantom.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
    
    const response = await window.solana.connect();
    walletAddress = response.publicKey.toString();
    isDemoWallet = false;
    demoSecretKey = null;
    
    localStorage.setItem('walletAddress', walletAddress);
    localStorage.setItem('isDemoWallet', 'false');
    localStorage.removeItem('demoSecretKey');
    
    initializeDashboard();
  } catch (error) {
    console.error('Phantom connection failed:', error);
    btnConnectPhantom.disabled = false;
    btnConnectPhantom.innerHTML = '<img src="https://phantom.app/img/phantom-logo.svg" alt="Phantom Logo" class="phantom-logo"> Connect Phantom Wallet';
  }
});

// Generate Demo Wallet (Instant Play fallback)
btnGenerateDemo.addEventListener('click', () => {
  try {
    btnGenerateDemo.disabled = true;
    btnGenerateDemo.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating keypair...';
    
    // Create new keypair using loaded Solana Web3.js
    const keypair = solanaWeb3.Keypair.generate();
    walletAddress = keypair.publicKey.toBase58();
    isDemoWallet = true;
    // Store secret key as number array to persist
    demoSecretKey = Array.from(keypair.secretKey);
    
    localStorage.setItem('walletAddress', walletAddress);
    localStorage.setItem('isDemoWallet', 'true');
    localStorage.setItem('demoSecretKey', JSON.stringify(demoSecretKey));
    
    initializeDashboard();
  } catch (error) {
    console.error('Demo keypair generation failed:', error);
    btnGenerateDemo.disabled = false;
    btnGenerateDemo.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Generate Demo Wallet (Instant Play)';
  }
});

// Disconnect wallet
btnDisconnect.addEventListener('click', () => {
  localStorage.clear();
  walletAddress = null;
  isDemoWallet = false;
  demoSecretKey = null;
  window.location.reload();
});

// Main dashboard initialization
function initializeDashboard() {
  walletGate.classList.add('hidden');
  walletAddressText.innerText = walletAddress.substring(0, 6) + '...' + walletAddress.substring(walletAddress.length - 4);
  if (isDemoWallet) {
    walletAddressText.innerText += ' (Demo)';
    walletAddressText.title = 'Local Demo Keypair';
  }
  
  // Establish WS and fetch initial data
  connectWebSocket();
  fetchPortfolio();
}

/* ==========================================
   PORTFOLIO & LEADERBOARD DATA
   ========================================== */

let currentPortfolioCash = 10000;
let currentOwnedSharesMap = {};

async function fetchPortfolio() {
  if (!walletAddress) return;
  try {
    const res = await fetch(`${API_URL}/api/portfolio/${walletAddress}`);
    const data = await res.json();
    
    // Update labels
    portfolioNetWorth.innerText = `$${data.netWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    portfolioCash.innerText = `$${data.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    lblAvailableCash.innerText = `$${data.cash.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    currentPortfolioCash = data.cash;
    currentOwnedSharesMap = data.holdings || {};
    
    // Update trading inputs owned label
    if (selectedTeamCode) {
      const owned = currentOwnedSharesMap[selectedTeamCode] || 0;
      lblOwnedShares.innerText = `${owned} share${owned !== 1 ? 's' : ''}`;
    }
    
    // Render holdings table
    renderHoldings(data.holdings);
  } catch (err) {
    console.error('Error fetching portfolio:', err);
  }
}

function renderHoldings(holdings) {
  holdingsBody.innerHTML = '';
  
  if (!holdings || Object.keys(holdings).length === 0) {
    holdingsBody.innerHTML = `
      <tr>
        <td colspan="4" class="empty-table-state">No stocks held. Buy shares to start building your portfolio.</td>
      </tr>
    `;
    return;
  }
  
  Object.entries(holdings).forEach(([code, shares]) => {
    const team = marketTeams[code] || { name: code, price: 0, iso: '' };
    const marketValue = shares * team.price;
    
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <div style="display: flex; align-items: center; gap: 8px; font-weight: 600;">
          <img src="https://flagcdn.com/w40/${team.iso}.png" class="flag-img" style="width: 20px; height: 13px;" alt="Flag">
          <span>${team.name} (${code})</span>
        </div>
      </td>
      <td>${shares}</td>
      <td style="font-weight: 700;">$${marketValue.toFixed(2)}</td>
      <td>
        <button class="btn btn-sell-quick btn-xs" onclick="sellQuick('${code}', ${shares})">SELL ALL</button>
      </td>
    `;
    holdingsBody.appendChild(tr);
  });
}

// Global hook for quick selling
window.sellQuick = function(code, shares) {
  // Trigger sell action in terminal
  selectedTeamCode = code;
  activeTradeTab = 'SELL';
  inputShares.value = shares;
  selectTeam(code);
  updateEstimatedSummary();
  // Submit trade directly
  submitTrade();
};

/* ==========================================
   MARKET GRAPHICS & CHARTING
   ========================================== */

function selectTeam(code) {
  selectedTeamCode = code;
  const team = marketTeams[code];
  if (!team) return;
  
  terminalEmpty.classList.add('hidden');
  terminalActive.classList.remove('hidden');
  
  // Highlighting active card
  document.querySelectorAll('.team-card').forEach(card => {
    if (card.dataset.code === code) card.classList.add('selected');
    else card.classList.remove('selected');
  });

  // Set headers
  terminalFlag.src = `https://flagcdn.com/w40/${team.iso}.png`;
  terminalTeamName.innerText = team.name;
  terminalTeamCode.innerText = team.code;
  terminalPrice.innerText = `$${team.price.toFixed(2)}`;
  
  // Set change
  terminalChange.innerText = `${team.changePercent >= 0 ? '+' : ''}${team.changePercent.toFixed(2)}%`;
  terminalChange.className = 'price-change ' + (team.changePercent >= 0 ? 'positive' : 'negative');
  
  // Volatility warning
  if (team.volatility > 15) {
    volIndicator.classList.remove('hidden');
  } else {
    volIndicator.classList.add('hidden');
  }
  
  // Tabs
  updateTabUI();
  
  // Owned summary
  const owned = currentOwnedSharesMap[code] || 0;
  lblOwnedShares.innerText = `${owned} share${owned !== 1 ? 's' : ''}`;
  
  // Estimated cost
  updateEstimatedSummary();

  // Draw Chart
  renderChart(team.priceHistory || [team.price]);
}

function renderChart(history) {
  const ctx = document.getElementById('priceChart').getContext('2d');
  
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  // Generate labels (Tick #)
  const labels = history.map((_, idx) => `T-${history.length - 1 - idx}`);
  
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Stock Price ($)',
        data: history,
        borderColor: '#00f2fe',
        borderWidth: 2.5,
        backgroundColor: 'rgba(0, 242, 254, 0.05)',
        fill: true,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 5
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: { 
          grid: { display: false },
          ticks: { color: '#64748b', font: { family: 'Outfit', size: 9 } }
        },
        y: { 
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', font: { family: 'Outfit', size: 9 } }
        }
      }
    }
  });
}

function updateTabUI() {
  if (activeTradeTab === 'BUY') {
    tabBuy.classList.add('active');
    tabSell.classList.remove('active');
    tabBuy.classList.remove('sell-active');
    tabSell.classList.remove('sell-active');
    btnSubmitTrade.className = 'btn btn-buy-action';
    btnSubmitTrade.innerText = `BUY ${selectedTeamCode} SHARES`;
    lblOwnedSharesLabel.innerText = 'Owned Shares';
  } else {
    tabBuy.classList.remove('active');
    tabSell.classList.add('active');
    tabBuy.classList.add('sell-active');
    tabSell.classList.add('sell-active');
    btnSubmitTrade.className = 'btn btn-sell-action';
    btnSubmitTrade.innerText = `SELL ${selectedTeamCode} SHARES`;
    lblOwnedSharesLabel.innerText = 'Owned Shares';
  }
}

// Tab triggers
tabBuy.addEventListener('click', () => {
  activeTradeTab = 'BUY';
  updateTabUI();
  updateEstimatedSummary();
});

tabSell.addEventListener('click', () => {
  activeTradeTab = 'SELL';
  updateTabUI();
  updateEstimatedSummary();
});

// Shares typing trigger
inputShares.addEventListener('input', updateEstimatedSummary);

function updateEstimatedSummary() {
  if (!selectedTeamCode) return;
  const team = marketTeams[selectedTeamCode];
  if (!team) return;
  
  const shares = parseInt(inputShares.value) || 0;
  const estCost = shares * team.price;
  lblEstimatedCost.innerText = `$${estCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/* ==========================================
   TRADE EXECUTION
   ========================================== */

btnSubmitTrade.addEventListener('click', submitTrade);

async function submitTrade() {
  if (!walletAddress || !selectedTeamCode) return;
  
  const shares = parseInt(inputShares.value) || 0;
  if (shares <= 0) {
    alert('Please enter a positive number of shares.');
    return;
  }
  
  btnSubmitTrade.disabled = true;
  btnSubmitTrade.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
  
  try {
    const response = await fetch(`${API_URL}/api/trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: walletAddress,
        teamCode: selectedTeamCode,
        action: activeTradeTab,
        shares: shares
      })
    });
    
    const result = await response.json();
    
    if (response.ok) {
      showToast(`Trade Successful`, `${activeTradeTab} ${shares} shares of ${selectedTeamCode} executed successfully.`);
      // Reload portfolio
      await fetchPortfolio();
    } else {
      alert(`Trade Failed: ${result.error}`);
    }
  } catch (err) {
    console.error('Trade request error:', err);
    alert('Failed to connect to the trading backend.');
  } finally {
    btnSubmitTrade.disabled = false;
    updateTabUI();
  }
}

function showToast(title, msg) {
  toastTitle.innerText = title;
  toastDesc.innerText = msg;
  tradeToast.classList.remove('hidden');
  
  setTimeout(() => {
    tradeToast.classList.add('hidden');
  }, 4000);
}

/* ==========================================
   WEBSOCKET LIVE TICKER & EVENT HANDLERS
   ========================================== */

function connectWebSocket() {
  socket = new WebSocket(WS_URL);
  
  socket.onopen = () => {
    console.log('[WS] Connected to live engine');
    document.getElementById('market-status-text').innerText = 'TxLINE Engine Connected';
  };
  
  socket.onclose = () => {
    console.log('[WS] Disconnected from live engine, reconnecting in 5s...');
    document.getElementById('market-status-text').innerText = 'Reconnecting to TxLINE...';
    setTimeout(connectWebSocket, 5000);
  };
  
  socket.onerror = (err) => {
    console.error('[WS] Error:', err);
  };
  
  socket.onmessage = (event) => {
    const payload = JSON.parse(event.data);
    const { type, data } = payload;
    
    switch (type) {
      case 'INIT':
        handleInitMarket(data);
        break;
      case 'MARKET_TICK':
        handleMarketTick(data);
        break;
      case 'MATCH_EVENT':
        handleMatchEvent(data);
        break;
      case 'TRADE_ACTIVITY':
        handleTradeActivity(data);
        break;
      case 'LEADERBOARD_UPDATE':
        renderLeaderboard(data);
        break;
    }
  };
}

function handleInitMarket(data) {
  // Populate market teams cache
  data.teams.forEach(t => {
    marketTeams[t.code] = t;
  });
  
  // Render markets
  renderMarketGrid();
  renderPriceTicker();
  renderLeaderboard(data.leaderboard);
  
  // Render match fixture header summaries (optional console logs for debug)
  console.log('Active Fixtures loaded:', data.fixtures);
}

function handleMarketTick(data) {
  // Update market teams cache and detect price changes for animations
  data.teams.forEach(updatedTeam => {
    const previousTeam = marketTeams[updatedTeam.code];
    const cardEl = document.querySelector(`.team-card[data-code="${updatedTeam.code}"]`);
    
    if (previousTeam && cardEl) {
      // Check price change direction for visual flash triggers
      if (updatedTeam.price > previousTeam.price) {
        cardEl.classList.add('flash-up');
        setTimeout(() => cardEl.classList.remove('flash-up'), 800);
      } else if (updatedTeam.price < previousTeam.price) {
        cardEl.classList.add('flash-down');
        setTimeout(() => cardEl.classList.remove('flash-down'), 800);
      }
    }
    
    // Save updated info
    marketTeams[updatedTeam.code] = updatedTeam;
  });
  
  // Redraw active lists
  updateMarketGridUI();
  renderPriceTicker();
  renderLeaderboard(data.leaderboard);
  
  // If a team is selected in terminal, update its live details and chart
  if (selectedTeamCode) {
    const team = marketTeams[selectedTeamCode];
    if (team) {
      terminalPrice.innerText = `$${team.price.toFixed(2)}`;
      terminalChange.innerText = `${team.changePercent >= 0 ? '+' : ''}${team.changePercent.toFixed(2)}%`;
      terminalChange.className = 'price-change ' + (team.changePercent >= 0 ? 'positive' : 'negative');
      
      // Update chart history
      if (chartInstance) {
        const labels = team.priceHistory.map((_, idx) => `T-${team.priceHistory.length - 1 - idx}`);
        chartInstance.data.labels = labels;
        chartInstance.data.datasets[0].data = team.priceHistory;
        chartInstance.update('none'); // Update without animation for performance
      }
      
      // Update volatility warning
      if (team.volatility > 15) {
        volIndicator.classList.remove('hidden');
      } else {
        volIndicator.classList.add('hidden');
      }
      
      updateEstimatedSummary();
    }
  }
}

function handleMatchEvent(event) {
  // Append match event card to the log feed
  const card = document.createElement('div');
  const typeClass = event.type.toLowerCase();
  card.className = `event-msg-card ${typeClass}`;
  
  const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  card.innerHTML = `
    <strong>[${event.type}]</strong> ${event.message}
    <span class="event-time">${time}</span>
  `;
  
  // Prepend event card
  if (eventsLog.querySelector('.empty-state')) {
    eventsLog.innerHTML = '';
  }
  
  eventsLog.insertBefore(card, eventsLog.firstChild);
}

function handleTradeActivity(trade) {
  // Broadcast a quick system notification toast about other active players
  if (trade.userId !== walletAddress.substring(0, 6) + '...' + walletAddress.substring(walletAddress.length - 4)) {
    showToast('Market Alert', `${trade.userId} ${trade.action.toLowerCase()}d ${trade.shares} shares of ${trade.teamCode}`);
  }
}

/* ==========================================
   GRID & TICKER RENDERING
   ========================================== */

function renderMarketGrid() {
  marketGrid.innerHTML = '';
  
  Object.values(marketTeams).forEach(team => {
    const card = document.createElement('div');
    card.className = 'team-card';
    card.dataset.code = team.code;
    
    // High volatility triggers a golden pulsing border
    if (team.volatility > 15) {
      card.classList.add('high-volatility');
    }
    
    card.innerHTML = `
      <div class="card-top">
        <div class="card-flag-group">
          <img src="https://flagcdn.com/w40/${team.iso}.png" alt="${team.name}" class="flag-img">
          <div>
            <div class="team-code-lbl">${team.code}</div>
            <div class="team-name-lbl">${team.name}</div>
          </div>
        </div>
        ${team.volatility > 15 ? '<span class="vol-badge">HOT</span>' : ''}
      </div>
      <div class="card-middle">
        <div class="price-lbl" id="card-price-${team.code}">$${team.price.toFixed(2)}</div>
        <div class="change-lbl ${team.changePercent >= 0 ? 'up' : 'down'}" id="card-change-${team.code}">
          ${team.changePercent >= 0 ? '+' : ''}${team.changePercent.toFixed(2)}%
        </div>
      </div>
      <div class="card-bottom">
        <span>Odds: ${team.odds.toFixed(2)}</span>
        <span>Vol: ${team.volatility}%</span>
      </div>
    `;
    
    card.addEventListener('click', () => selectTeam(team.code));
    marketGrid.appendChild(card);
  });
}

function updateMarketGridUI() {
  Object.values(marketTeams).forEach(team => {
    const priceEl = document.getElementById(`card-price-${team.code}`);
    const changeEl = document.getElementById(`card-change-${team.code}`);
    const cardEl = document.querySelector(`.team-card[data-code="${team.code}"]`);
    
    if (priceEl && changeEl && cardEl) {
      priceEl.innerText = `$${team.price.toFixed(2)}`;
      changeEl.innerText = `${team.changePercent >= 0 ? '+' : ''}${team.changePercent.toFixed(2)}%`;
      changeEl.className = 'change-lbl ' + (team.changePercent >= 0 ? 'up' : 'down');
      
      // Update high volatility indicator
      if (team.volatility > 15) {
        cardEl.classList.add('high-volatility');
        if (!cardEl.querySelector('.vol-badge')) {
          const top = cardEl.querySelector('.card-top');
          const badge = document.createElement('span');
          badge.className = 'vol-badge';
          badge.innerText = 'HOT';
          top.appendChild(badge);
        }
      } else {
        cardEl.classList.remove('high-volatility');
        const badge = cardEl.querySelector('.vol-badge');
        if (badge) badge.remove();
      }
    }
  });
}

function renderPriceTicker() {
  priceTicker.innerHTML = '';
  
  // Build scrolling ticker items
  Object.values(marketTeams).forEach(team => {
    const div = document.createElement('div');
    div.className = 'ticker-item';
    div.innerHTML = `
      <img src="https://flagcdn.com/w40/${team.iso}.png" alt="Flag">
      <span>${team.code}</span>
      <span class="price">$${team.price.toFixed(2)}</span>
      <span class="change ${team.changePercent >= 0 ? 'up' : 'down'}">
        (${team.changePercent >= 0 ? '▲' : '▼'} ${Math.abs(team.changePercent).toFixed(1)}%)
      </span>
    `;
    priceTicker.appendChild(div);
  });
  
  // Clone content for seamless loops
  const tickerLen = priceTicker.children.length;
  for (let i = 0; i < tickerLen; i++) {
    const clone = priceTicker.children[i].cloneNode(true);
    priceTicker.appendChild(clone);
  }
}

function renderLeaderboard(list) {
  leaderboardList.innerHTML = '';
  
  if (!list || list.length === 0) {
    leaderboardList.innerHTML = '<div class="empty-state">No rankings yet.</div>';
    return;
  }
  
  list.forEach((user, index) => {
    const formattedId = user.userId.substring(0, 6) + '...' + user.userId.substring(user.userId.length - 4);
    const div = document.createElement('div');
    div.className = 'leader-item';
    
    // Check if item is current user
    if (user.userId === walletAddress) {
      div.style.borderColor = 'var(--accent-cyan)';
      div.style.background = 'rgba(0, 242, 254, 0.05)';
    }
    
    div.innerHTML = `
      <div class="leader-rank-box">
        <span class="rank-badge">${index + 1}</span>
        <span class="leader-name">${formattedId} ${user.userId === walletAddress ? '(You)' : ''}</span>
      </div>
      <span class="leader-net">$${user.netWorth.toLocaleString()}</span>
    `;
    leaderboardList.appendChild(div);
  });
}

/* ==========================================
   SOLANA DEVNET ON-CHAIN SNAPSHOT SYNC
   ========================================== */

btnChainSync.addEventListener('click', syncPortfolioOnChain);
btnCloseSync.addEventListener('click', () => chainSyncBanner.classList.add('hidden'));

async function syncPortfolioOnChain() {
  if (!walletAddress) return;
  
  btnChainSync.disabled = true;
  btnChainSync.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Syncing...';
  
  try {
    // 1. Establish connection to Solana Devnet
    const connection = new solanaWeb3.Connection("https://api.devnet.solana.com", "confirmed");
    const pubKey = new solanaWeb3.PublicKey(walletAddress);
    
    // 2. Fetch current net worth of the user portfolio
    const res = await fetch(`${API_URL}/api/portfolio/${walletAddress}`);
    const data = await res.json();
    const netWorth = data.netWorth;
    
    // 3. Build a Solana Memo Transaction
    // Standard Solana Memo Program V2 Address
    const memoProgramId = new solanaWeb3.PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
    const memoText = `Fanfolio Portfolio Sync. User: ${walletAddress.substring(0, 8)}..., Net Worth: $${netWorth.toFixed(2)}`;
    
    const transaction = new solanaWeb3.Transaction().add(
      new solanaWeb3.TransactionInstruction({
        keys: [{ pubkey: pubKey, isSigner: true, isWritable: true }],
        programId: memoProgramId,
        data: Array.from(new TextEncoder().encode(memoText))
      })
    );
    
    // Set recent blockhash and fee payer
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = pubKey;
    
    let signature = "";
    
    // 4. Sign and Send Transaction
    if (isDemoWallet) {
      // Local demo keypair signing
      if (!demoSecretKey) throw new Error("Demo secret key missing");
      const keypair = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(demoSecretKey));
      
      transaction.sign(keypair);
      
      // Send raw transaction
      signature = await connection.sendRawTransaction(transaction.serialize());
    } else {
      // Phantom Wallet extension signing
      if (!window.solana) throw new Error("Wallet not connected");
      
      const signedTransaction = await window.solana.signTransaction(transaction);
      signature = await connection.sendRawTransaction(signedTransaction.serialize());
    }
    
    // 5. Wait for confirmation
    console.log(`[Solana] Submitted Tx: ${signature}. Waiting for confirmation...`);
    await connection.confirmTransaction(signature, "confirmed");
    console.log('[Solana] Tx confirmed successfully!');
    
    // 6. Show Explorer link
    explorerLink.href = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
    chainSyncBanner.classList.remove('hidden');
    
  } catch (error) {
    console.error('On-chain sync error:', error);
    alert(`Solana Sync Failed: ${error.message || error}`);
  } finally {
    btnChainSync.disabled = false;
    btnChainSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Sync On-Chain';
  }
}
