// Fanfolio - Frontend Application Logic

// API Configuration (loaded from config.js before this script)

// Application State
let walletAddress = localStorage.getItem('walletAddress') || null;
let isDemoWallet = localStorage.getItem('isDemoWallet') === 'true';
let demoSecretKey = localStorage.getItem('demoSecretKey') ? JSON.parse(localStorage.getItem('demoSecretKey')) : null;
let isMetaMask = localStorage.getItem('isMetaMask') === 'true';

let selectedTeamCode = null;
let activeTradeTab = 'BUY'; // BUY or SELL
let marketTeams = {}; // code -> teamObject
let chartInstance = null;
let socket = null;

// New feature state
let pieChartInstance = null;
let tradeHistoryChartInstance = null;
let compareChartInstance = null;
let compareSelected = []; // max 2 team codes
let netWorthHistory = []; // array of { time, value }

// DOM Elements
const walletGate = document.getElementById('wallet-gate');
const btnConnectPhantom = document.getElementById('btn-connect-phantom');
const btnConnectMetaMask = document.getElementById('btn-connect-metamask');
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

// Compare Modal DOM
const btnCompare = document.getElementById('btn-compare');
const compareModal = document.getElementById('compare-modal');
const btnCloseCompare = document.getElementById('btn-close-compare');
const compareLeft = document.getElementById('compare-left');
const compareRight = document.getElementById('compare-right');

// Portfolio Chart DOM
const portfolioPieCanvas = document.getElementById('portfolioPieChart');
const tradeHistoryCanvas = document.getElementById('tradeHistoryChart');

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
    // Support both old (window.solana) and new (window.phantom.solana) Phantom API
    const phantom = window.phantom?.solana || window.solana;
    
    if (!phantom || !phantom.isPhantom) {
      alert('Phantom Wallet not detected! Please install the extension or click "Generate Demo Wallet" to test the app instantly.');
      return;
    }
    
    btnConnectPhantom.disabled = true;
    btnConnectPhantom.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
    
    const response = await phantom.connect();
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
    btnConnectPhantom.innerHTML = '<svg class="phantom-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#4E44E7"/><path d="M50,22 C34,22 25,32 25,48 C25,60 25,78 30,78 C33,78 36,73 40,73 C44,73 47,78 50,78 C53,78 56,73 60,73 C64,73 67,78 70,78 C75,78 75,60 75,48 C75,32 66,22 50,22 Z" fill="#FFFFFF"/><circle cx="42" cy="45" r="5" fill="#4E44E7"/><circle cx="58" cy="45" r="5" fill="#4E44E7"/></svg> Connect Phantom Wallet';
  }
});

// Connect MetaMask Wallet
btnConnectMetaMask.addEventListener('click', async () => {
  try {
    if (!window.ethereum) {
      alert('MetaMask not detected! Please install the MetaMask extension or click "Generate Demo Wallet" to test the app instantly.');
      return;
    }
    btnConnectMetaMask.disabled = true;
    btnConnectMetaMask.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Connecting...';
    
    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
    walletAddress = accounts[0];
    isDemoWallet = false;
    demoSecretKey = null;
    isMetaMask = true;
    
    localStorage.setItem('walletAddress', walletAddress);
    localStorage.setItem('isDemoWallet', 'false');
    localStorage.setItem('isMetaMask', 'true');
    localStorage.removeItem('demoSecretKey');
    
    initializeDashboard();
  } catch (error) {
    console.error('MetaMask connection failed:', error);
    btnConnectMetaMask.disabled = false;
    btnConnectMetaMask.innerHTML = '<svg class="metamask-logo" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100" rx="28" fill="#E2761B"/><polygon points="25,25 35,45 20,40" fill="#FFFFFF" opacity="0.9"/><polygon points="75,25 65,45 80,40" fill="#FFFFFF" opacity="0.9"/><polygon points="50,75 25,45 75,45" fill="#F6851B"/><polygon points="50,75 35,45 50,45" fill="#D76600"/><polygon points="50,75 65,45 50,45" fill="#D76600"/><polygon points="35,45 42,48 38,53" fill="#161616"/><polygon points="65,45 58,48 62,53" fill="#161616"/><polygon points="50,75 47,70 53,70" fill="#161616"/></svg> Connect MetaMask Wallet';
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
  
  const walletLabel = document.getElementById('wallet-label');
  if (isMetaMask) {
    walletLabel.innerText = 'MetaMask Account';
  } else if (isDemoWallet) {
    walletLabel.innerText = 'Demo Account';
  } else {
    walletLabel.innerText = 'Solana Account';
  }

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
    
    // Render portfolio pie chart
    renderPortfolioPieChart(data.holdings);
    
    // Record net worth for history chart
    recordNetWorth(data.netWorth);
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
  
  // Update portfolio pie chart and record net worth
  fetchPortfolio().then(() => {
    const currentPrices = {};
    Object.keys(marketTeams).forEach(code => { currentPrices[code] = marketTeams[code].price; });
  });
  
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
    
    card.addEventListener('click', (e) => {
      if (e.shiftKey) {
        toggleCompare(team.code);
      } else {
        selectTeam(team.code);
      }
    });
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
    if (isMetaMask) {
      // EVM Sync Flow (MetaMask)
      // 1. Fetch current net worth of the user portfolio
      const res = await fetch(`${API_URL}/api/portfolio/${walletAddress}`);
      const data = await res.json();
      const netWorth = data.netWorth;
      
      // 2. Build EVM Transaction (Zero value self-transfer with portfolio memo in hex data)
      const memoText = `Fanfolio Portfolio Sync. User: ${walletAddress.substring(0, 8)}..., Net Worth: $${netWorth.toFixed(2)}`;
      const hexData = '0x' + Array.from(new TextEncoder().encode(memoText)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      const transactionParameters = {
        to: walletAddress, // Self-transfer
        from: walletAddress,
        value: '0x0',
        data: hexData
      };
      
      // 3. Prompt MetaMask to sign and broadcast
      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [transactionParameters],
      });
      
      console.log(`[EVM] Submitted transaction hash: ${txHash}`);
      
      // 4. Update sync confirmation banner and Explorer link
      const bannerText = chainSyncBanner.querySelector('p');
      if (bannerText) bannerText.innerText = "Saved on Sepolia Testnet!";
      explorerLink.href = `https://sepolia.etherscan.io/tx/${txHash}`;
      chainSyncBanner.classList.remove('hidden');
    } else {
      // Solana Sync Flow
      // 1. Establish connection to Solana Devnet
      const connection = new solanaWeb3.Connection("https://api.devnet.solana.com", "confirmed");
      const pubKey = new solanaWeb3.PublicKey(walletAddress);
      
      // 2. Fetch current net worth of the user portfolio
      const res = await fetch(`${API_URL}/api/portfolio/${walletAddress}`);
      const data = await res.json();
      const netWorth = data.netWorth;
      
      // 3. Build a Solana Memo Transaction
      const memoProgramId = new solanaWeb3.PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
      const memoText = `Fanfolio Portfolio Sync. User: ${walletAddress.substring(0, 8)}..., Net Worth: $${netWorth.toFixed(2)}`;
      
      const transaction = new solanaWeb3.Transaction().add(
        new solanaWeb3.TransactionInstruction({
          keys: [{ pubkey: pubKey, isSigner: true, isWritable: true }],
          programId: memoProgramId,
          data: Array.from(new TextEncoder().encode(memoText))
        })
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = pubKey;
      
      let signature = "";
      
      if (isDemoWallet) {
        if (!demoSecretKey) throw new Error("Demo secret key missing");
        const keypair = solanaWeb3.Keypair.fromSecretKey(new Uint8Array(demoSecretKey));
        transaction.sign(keypair);
        signature = await connection.sendRawTransaction(transaction.serialize());
      } else {
        const phantomSigner = window.phantom?.solana || window.solana;
        if (!phantomSigner) throw new Error("Wallet not connected");
        const signedTransaction = await phantomSigner.signTransaction(transaction);
        signature = await connection.sendRawTransaction(signedTransaction.serialize());
      }
      
      console.log(`[Solana] Submitted Tx: ${signature}. Waiting for confirmation...`);
      await connection.confirmTransaction(signature, "confirmed");
      console.log('[Solana] Tx confirmed successfully!');
      
      const bannerText = chainSyncBanner.querySelector('p');
      if (bannerText) bannerText.innerText = "Saved on Solana Devnet!";
      explorerLink.href = `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
      chainSyncBanner.classList.remove('hidden');
    }
  } catch (error) {
    console.error('On-chain sync error:', error);
    alert(`Sync Failed: ${error.message || error}`);
  } finally {
    btnChainSync.disabled = false;
    btnChainSync.innerHTML = '<i class="fa-solid fa-rotate"></i> Sync On-Chain';
  }
}

/* ==========================================
   PORTFOLIO PIE CHART
   ========================================== */

function renderPortfolioPieChart(holdings) {
  const ctx = portfolioPieCanvas.getContext('2d');
  if (pieChartInstance) pieChartInstance.destroy();

  const labels = [];
  const data = [];
  const colors = ['#00f2fe', '#4facfe', '#10b981', '#fbbf24', '#f43f5e', '#ff0844', '#a855f7', '#fb923c'];

  if (holdings && Object.keys(holdings).length > 0) {
    Object.entries(holdings).forEach(([code, shares]) => {
      const team = marketTeams[code];
      if (team) {
        labels.push(code);
        data.push(shares * team.price);
      }
    });
  }

  // Add cash
  labels.push('Cash');
  data.push(currentPortfolioCash);
  colors.push('#334155');

  if (data.length <= 1 && data[0] === 10000) {
    // No holdings, just show cash
    pieChartInstance = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Cash'],
        datasets: [{ data: [10000], backgroundColor: ['#334155'], borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: { legend: { display: false } }
      }
    });
    return;
  }

  pieChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors.slice(0, data.length), borderWidth: 0, hoverOffset: 6 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 }, padding: 8, usePointStyle: true, pointStyleWidth: 8 }
        }
      }
    }
  });
}

/* ==========================================
   NET WORTH HISTORY CHART
   ========================================== */

function recordNetWorth(netWorth) {
  netWorthHistory.push({ time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), value: netWorth });
  if (netWorthHistory.length > 30) netWorthHistory.shift();
  renderTradeHistoryChart();
}

function renderTradeHistoryChart() {
  const ctx = tradeHistoryCanvas.getContext('2d');
  if (tradeHistoryChartInstance) tradeHistoryChartInstance.destroy();

  if (netWorthHistory.length < 2) return;

  tradeHistoryChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: netWorthHistory.map(p => p.time),
      datasets: [{
        label: 'Net Worth',
        data: netWorthHistory.map(p => p.value),
        borderColor: '#a855f7',
        borderWidth: 2,
        backgroundColor: 'rgba(168, 85, 247, 0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Outfit', size: 9 }, maxTicksLimit: 6 } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { family: 'Outfit', size: 9 } } }
      }
    }
  });
}

/* ==========================================
   TEAM COMPARISON
   ========================================== */

btnCompare.addEventListener('click', () => {
  if (compareSelected.length < 2) return;
  compareModal.classList.remove('hidden');
  renderCompareModal();
});

btnCloseCompare.addEventListener('click', () => {
  compareModal.classList.add('hidden');
});

compareModal.addEventListener('click', (e) => {
  if (e.target === compareModal) compareModal.classList.add('hidden');
});

function toggleCompare(code) {
  const idx = compareSelected.indexOf(code);
  if (idx >= 0) {
    compareSelected.splice(idx, 1);
  } else if (compareSelected.length < 2) {
    compareSelected.push(code);
  } else {
    compareSelected.shift();
    compareSelected.push(code);
  }

  // Update card highlights
  document.querySelectorAll('.team-card').forEach(card => {
    if (compareSelected.includes(card.dataset.code)) {
      card.classList.add('compare-selected');
    } else {
      card.classList.remove('compare-selected');
    }
  });

  btnCompare.disabled = compareSelected.length < 2;
  btnCompare.textContent = compareSelected.length < 2 ? `Compare (${compareSelected.length}/2)` : 'Compare';
}

function renderCompareModal() {
  const left = marketTeams[compareSelected[0]];
  const right = marketTeams[compareSelected[1]];
  if (!left || !right) return;

  function buildSide(team) {
    return `
      <img src="https://flagcdn.com/w80/${team.iso}.png" class="terminal-flag-img" style="margin-bottom: 10px;">
      <div class="compare-team-name">${team.name}</div>
      <div class="compare-team-code">${team.code}</div>
      <div class="compare-stat"><span class="label">Price</span><span class="value">$${team.price.toFixed(2)}</span></div>
      <div class="compare-stat"><span class="label">Odds</span><span class="value">${team.odds.toFixed(2)}</span></div>
      <div class="compare-stat"><span class="label">Change</span><span class="value" style="color: ${team.changePercent >= 0 ? 'var(--success)' : 'var(--danger)'}">${team.changePercent >= 0 ? '+' : ''}${team.changePercent.toFixed(2)}%</span></div>
      <div class="compare-stat"><span class="label">Volatility</span><span class="value">${team.volatility.toFixed(2)}</span></div>
      <div class="compare-stat"><span class="label">Impulse</span><span class="value">${team.activeImpulse.toFixed(2)}</span></div>
    `;
  }

  compareLeft.innerHTML = buildSide(left);
  compareLeft.classList.add('filled');
  compareRight.innerHTML = buildSide(right);
  compareRight.classList.add('filled');

  // Render comparison chart
  const ctx = document.getElementById('compareChart').getContext('2d');
  if (compareChartInstance) compareChartInstance.destroy();

  const maxLen = Math.max(left.priceHistory.length, right.priceHistory.length);
  const leftHist = left.priceHistory;
  const rightHist = right.priceHistory;

  compareChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array.from({ length: maxLen }, (_, i) => `T-${maxLen - 1 - i}`),
      datasets: [
        {
          label: left.code,
          data: leftHist,
          borderColor: '#00f2fe',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 1,
          fill: false
        },
        {
          label: right.code,
          data: rightHist,
          borderColor: '#fbbf24',
          borderWidth: 2,
          tension: 0.3,
          pointRadius: 1,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Outfit', size: 11 }, usePointStyle: true } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#64748b', font: { family: 'Outfit', size: 9 } } },
        y: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#64748b', font: { family: 'Outfit', size: 9 } } }
      }
    }
  });
}
