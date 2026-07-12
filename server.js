const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

const priceEngine = require('./priceEngine');
const txlineClient = require('./txlineClient');
const tradeEngine = require('./tradeEngine');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Serve static assets from public folder
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// Mapping of team codes to ISO codes (for FlagCDN flags) and full names
const TEAM_METADATA = {
  BRA: { name: 'Brazil', iso: 'br' },
  ARG: { name: 'Argentina', iso: 'ar' },
  FRA: { name: 'France', iso: 'fr' },
  ENG: { name: 'England', iso: 'gb' },
  GER: { name: 'Germany', iso: 'de' },
  ESP: { name: 'Spain', iso: 'es' },
  POR: { name: 'Portugal', iso: 'pt' },
  NED: { name: 'Netherlands', iso: 'nl' },
  BEL: { name: 'Belgium', iso: 'be' },
  CRO: { name: 'Croatia', iso: 'hr' },
  URU: { name: 'Uruguay', iso: 'uy' },
  SEN: { name: 'Senegal', iso: 'sn' },
  USA: { name: 'USA', iso: 'us' },
  MEX: { name: 'Mexico', iso: 'mx' },
  JPN: { name: 'Japan', iso: 'jp' },
  MAR: { name: 'Morocco', iso: 'ma' }
};

// Global market state
const teamMarketState = {};
let lastProcessedEventId = 0;
const matchFixturesState = [];

// Initialize market state
Object.keys(TEAM_METADATA).forEach(code => {
  const mockTeam = txlineClient.MOCK_TEAMS.find(t => t.code === code);
  const initialOdds = mockTeam ? mockTeam.odds : 10.0;
  const initialPrice = 1000 * (1 / initialOdds);
  
  teamMarketState[code] = {
    code,
    name: TEAM_METADATA[code].name,
    iso: TEAM_METADATA[code].iso,
    currentPrice: initialPrice,
    startPrice: initialPrice,
    odds: initialOdds,
    activeImpulse: 0.0,
    volatility: 0.0,
    priceHistory: [initialPrice]
  };
});

// Load fixtures state initially from mock client
txlineClient.MOCK_FIXTURES.forEach(f => {
  matchFixturesState.push({ ...f });
});

/**
 * Broadcasts a message to all connected WS clients
 * @param {object} data - Payload object
 */
function broadcast(data) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// REST Endpoints
app.get('/api/teams', (req, res) => {
  const teamsArray = Object.values(teamMarketState).map(team => {
    const change = team.currentPrice - team.startPrice;
    const changePercent = (change / team.startPrice) * 100;
    return {
      code: team.code,
      name: team.name,
      iso: team.iso,
      price: Math.round(team.currentPrice * 100) / 100,
      odds: team.odds,
      activeImpulse: Math.round(team.activeImpulse * 100) / 100,
      volatility: team.volatility,
      changePercent: Math.round(changePercent * 100) / 100,
      priceHistory: team.priceHistory
    };
  });
  res.json(teamsArray);
});

app.get('/api/portfolio/:userId', (req, res) => {
  const portfolio = tradeEngine.getOrCreatePortfolio(req.params.userId);
  if (!portfolio) {
    return res.status(400).json({ error: 'Invalid user ID' });
  }
  
  // Calculate current net worth dynamically
  const currentPrices = {};
  Object.keys(teamMarketState).forEach(code => {
    currentPrices[code] = teamMarketState[code].currentPrice;
  });
  
  const netWorth = tradeEngine.calculateNetWorth(portfolio, currentPrices);
  res.json({
    ...portfolio,
    netWorth: Math.round(netWorth * 100) / 100
  });
});

app.get('/api/leaderboard', (req, res) => {
  const currentPrices = {};
  Object.keys(teamMarketState).forEach(code => {
    currentPrices[code] = teamMarketState[code].currentPrice;
  });
  res.json(tradeEngine.getLeaderboard(currentPrices));
});

app.post('/api/trade', (req, res) => {
  const { userId, teamCode, action, shares } = req.body;
  
  if (!userId || !teamCode || !action || !shares) {
    return res.status(400).json({ error: 'Missing required fields: userId, teamCode, action, shares' });
  }
  
  const team = teamMarketState[teamCode];
  if (!team) {
    return res.status(400).json({ error: 'Invalid team code' });
  }
  
  const result = tradeEngine.executeTrade(userId, teamCode, action, shares, team.currentPrice);
  
  if (result.success) {
    // Broadcast trade event to highlight activity
    broadcast({
      type: 'TRADE_ACTIVITY',
      data: {
        userId: userId.substring(0, 6) + '...' + userId.substring(userId.length - 4),
        teamCode,
        action,
        shares,
        price: team.currentPrice,
        timestamp: Date.now()
      }
    });
    
    // Send updated leaderboard to all
    const currentPrices = {};
    Object.keys(teamMarketState).forEach(code => {
      currentPrices[code] = teamMarketState[code].currentPrice;
    });
    broadcast({
      type: 'LEADERBOARD_UPDATE',
      data: tradeEngine.getLeaderboard(currentPrices)
    });
    
    res.json(result);
  } else {
    res.status(400).json({ error: result.message });
  }
});

// WebSocket Server Handler
wss.on('connection', ws => {
  console.log('[WS] Client connected');
  
  // Send initial data to client on connect
  const currentPrices = {};
  Object.keys(teamMarketState).forEach(code => {
    currentPrices[code] = teamMarketState[code].currentPrice;
  });
  
  const teamsArray = Object.values(teamMarketState).map(t => {
    const change = t.currentPrice - t.startPrice;
    const changePercent = (change / t.startPrice) * 100;
    return {
      code: t.code,
      name: t.name,
      iso: t.iso,
      price: Math.round(t.currentPrice * 100) / 100,
      odds: t.odds,
      activeImpulse: t.activeImpulse,
      volatility: t.volatility,
      changePercent: Math.round(changePercent * 100) / 100,
      priceHistory: t.priceHistory
    };
  });
  
  ws.send(JSON.stringify({
    type: 'INIT',
    data: {
      teams: teamsArray,
      fixtures: matchFixturesState,
      leaderboard: tradeEngine.getLeaderboard(currentPrices)
    }
  }));
  
  ws.on('close', () => console.log('[WS] Client disconnected'));
});

// Main Update Loop (Every 5 seconds)
async function mainMarketTick() {
  try {
    // 1. Fetch live odds from client (mocked or real)
    const oddsUpdates = await txlineClient.fetchLiveOdds();
    
    // Apply odds to state
    oddsUpdates.forEach(update => {
      const team = teamMarketState[update.teamCode];
      if (team) {
        team.odds = update.decimalOdds;
      }
    });

    // 2. Fetch new match events
    const newEvents = await txlineClient.fetchNewEvents(lastProcessedEventId);
    
    // Process new events and compute impulses
    newEvents.forEach(event => {
      console.log(`[Event] ${event.message}`);
      
      const scoringTeam = teamMarketState[event.teamCode];
      const defendingTeam = teamMarketState[event.opponentCode];
      
      // Determine impulses
      if (event.type === 'GOAL') {
        if (scoringTeam) scoringTeam.activeImpulse += priceEngine.EVENT_IMPULSES.GOAL_FOR;
        if (defendingTeam) defendingTeam.activeImpulse += priceEngine.EVENT_IMPULSES.GOAL_AGAINST;
      } else if (event.type === 'PENALTY') {
        if (scoringTeam) scoringTeam.activeImpulse += priceEngine.EVENT_IMPULSES.PENALTY_FOR;
        if (defendingTeam) defendingTeam.activeImpulse += priceEngine.EVENT_IMPULSES.PENALTY_AGAINST;
      } else if (event.type === 'RED_CARD') {
        // Red card is bad for the defending team (which got it)
        // Wait, event.teamCode is the one who got the advantage or triggered it?
        // In our client, scoringTeam is the one who benefits, defendingTeam is the one who gets carded
        if (defendingTeam) defendingTeam.activeImpulse += priceEngine.EVENT_IMPULSES.RED_CARD_FOR;
        if (scoringTeam) scoringTeam.activeImpulse += priceEngine.EVENT_IMPULSES.RED_CARD_AGAINST;
      } else if (event.type === 'VAR_OVERTURN') {
        if (defendingTeam) defendingTeam.activeImpulse += priceEngine.EVENT_IMPULSES.VAR_OVERTURN_AGAINST;
        if (scoringTeam) scoringTeam.activeImpulse += priceEngine.EVENT_IMPULSES.VAR_OVERTURN_FOR;
      }
      
      // Update max processed event ID
      if (event.id > lastProcessedEventId) {
        lastProcessedEventId = event.id;
      }
      
      // Update fixture score state for mock data
      const fixture = matchFixturesState.find(f => f.home === event.teamCode && f.away === event.opponentCode || f.home === event.opponentCode && f.away === event.teamCode);
      if (fixture && event.type === 'GOAL') {
        // Find who scored based on message or event code
        if (event.teamCode === fixture.home) {
          fixture.homeScore = (fixture.homeScore || 0) + 1;
        } else {
          fixture.awayScore = (fixture.awayScore || 0) + 1;
        }
      }
      
      // Broadcast match event to clients
      broadcast({
        type: 'MATCH_EVENT',
        data: event
      });
    });

    // 3. Decay impulses and update team prices
    const currentPrices = {};
    const updatedTeams = Object.keys(teamMarketState).map(code => {
      const team = teamMarketState[code];
      
      // Apply decay to active impulses
      team.activeImpulse = priceEngine.decayImpulse(team.activeImpulse);
      
      // Calculate new price and volatility
      const result = priceEngine.calculateTeamPrice(
        team.odds,
        team.activeImpulse,
        team.priceHistory
      );
      
      team.currentPrice = result.price;
      team.volatility = result.volatility;
      team.priceHistory = result.priceHistory;
      
      currentPrices[code] = team.currentPrice;
      
      const change = team.currentPrice - team.startPrice;
      const changePercent = (change / team.startPrice) * 100;
      
      return {
        code: team.code,
        name: team.name,
        iso: team.iso,
        price: team.currentPrice,
        odds: team.odds,
        activeImpulse: Math.round(team.activeImpulse * 100) / 100,
        volatility: team.volatility,
        changePercent: Math.round(changePercent * 100) / 100,
        priceHistory: team.priceHistory
      };
    });

    // 4. Broadcast updated market state
    broadcast({
      type: 'MARKET_TICK',
      data: {
        teams: updatedTeams,
        fixtures: matchFixturesState,
        leaderboard: tradeEngine.getLeaderboard(currentPrices)
      }
    });

  } catch (error) {
    console.error('[Tick Error]', error);
  }
}

// Start polling loop
mainMarketTick();
setInterval(mainMarketTick, 5000);

server.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(` ⚽ FOOTBALL STOCK EXCHANGE BACKEND RUNNING      `);
  console.log(` Port: ${PORT}                                   `);
  console.log(` Mode: ${process.env.TXLINE_MOCK !== 'false' ? 'MOCK' : 'LIVE'} `);
  console.log(`==================================================`);
});
