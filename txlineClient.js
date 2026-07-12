const axios = require('axios');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

// We allow toggling mock dynamically if initialization fails
let IS_MOCK = process.env.TXLINE_MOCK !== 'false';
const API_BASE = process.env.TXLINE_API_BASE || 'https://txline-dev.txodds.com';
let apiToken = process.env.TXLINE_API_KEY || '';

// Cached JWT token for live mode
let cachedJwt = null;
let jwtExpiry = null;

// Mock database state for simulation
const MOCK_TEAMS = [
  { code: 'BRA', name: 'Brazil', odds: 5.0, initialOdds: 5.0 },
  { code: 'ARG', name: 'Argentina', odds: 6.0, initialOdds: 6.0 },
  { code: 'FRA', name: 'France', odds: 6.5, initialOdds: 6.5 },
  { code: 'ENG', name: 'England', odds: 8.0, initialOdds: 8.0 },
  { code: 'GER', name: 'Germany', odds: 9.0, initialOdds: 9.0 },
  { code: 'ESP', name: 'Spain', odds: 10.0, initialOdds: 10.0 },
  { code: 'POR', name: 'Portugal', odds: 12.0, initialOdds: 12.0 },
  { code: 'NED', name: 'Netherlands', odds: 14.0, initialOdds: 14.0 },
  { code: 'BEL', name: 'Belgium', odds: 18.0, initialOdds: 18.0 },
  { code: 'CRO', name: 'Croatia', odds: 22.0, initialOdds: 22.0 },
  { code: 'URU', name: 'Uruguay', odds: 28.0, initialOdds: 28.0 },
  { code: 'SEN', name: 'Senegal', odds: 35.0, initialOdds: 35.0 },
  { code: 'USA', name: 'USA', odds: 50.0, initialOdds: 50.0 },
  { code: 'MEX', name: 'Mexico', odds: 65.0, initialOdds: 65.0 },
  { code: 'JPN', name: 'Japan', odds: 80.0, initialOdds: 80.0 },
  { code: 'MAR', name: 'Morocco', odds: 100.0, initialOdds: 100.0 }
];

const MOCK_FIXTURES = [
  { id: 1001, home: 'ARG', away: 'FRA', homeScore: 0, awayScore: 0 },
  { id: 1002, home: 'BRA', away: 'GER', homeScore: 0, awayScore: 0 },
  { id: 1003, home: 'ENG', away: 'ESP', homeScore: 0, awayScore: 0 },
  { id: 1004, home: 'POR', away: 'NED', homeScore: 0, awayScore: 0 },
  { id: 1005, home: 'BEL', away: 'CRO', homeScore: 0, awayScore: 0 },
  { id: 1006, home: 'URU', away: 'SEN', homeScore: 0, awayScore: 0 },
  { id: 1007, home: 'USA', away: 'MEX', homeScore: 0, awayScore: 0 },
  { id: 1008, home: 'JPN', away: 'MAR', homeScore: 0, awayScore: 0 }
];

let eventIdCounter = 1;
const mockEventLog = [];

// Solana On-Chain Configuration
const SOLANA_NETWORK = process.env.SOLANA_NETWORK || 'devnet';
const CONFIG = {
  mainnet: {
    rpcUrl: "https://api.mainnet-beta.solana.com",
    apiOrigin: "https://txline.txodds.com",
    programIdStr: "9ExbZjAapQww1vfcisDmrngPinHTEfpjYRWMunJgcKaA",
    txlTokenMintStr: "Zhw9TVKp68a1QrftncMSd6ELXKDtpVMNuMGr1jNwdeL",
  },
  devnet: {
    rpcUrl: "https://api.devnet.solana.com",
    apiOrigin: "https://txline-dev.txodds.com",
    programIdStr: "6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J",
    txlTokenMintStr: "4Zao8ocPhmMgq7PdsYWyxvqySMGx7xb9cMftPMkEokRG",
  },
};

const TXORACLE_IDL_BASE = {
  "version": "0.1.0",
  "name": "txoracle",
  "instructions": [
    {
      "name": "subscribe",
      "accounts": [
        { "name": "user", "isMut": true, "isSigner": true },
        { "name": "pricingMatrix", "isMut": false, "isSigner": false },
        { "name": "tokenMint", "isMut": false, "isSigner": false },
        { "name": "userTokenAccount", "isMut": true, "isSigner": false },
        { "name": "tokenTreasuryVault", "isMut": true, "isSigner": false },
        { "name": "tokenTreasuryPda", "isMut": false, "isSigner": false },
        { "name": "tokenProgram", "isMut": false, "isSigner": false },
        { "name": "systemProgram", "isMut": false, "isSigner": false },
        { "name": "associatedTokenProgram", "isMut": false, "isSigner": false }
      ],
      "args": [
        { "name": "service_level_id", "type": "u16" },
        { "name": "weeks", "type": "u8" }
      ]
    }
  ]
};

// Node.js Anchor Wallet Adapter
class NodeWallet {
  constructor(payer) {
    this.payer = payer;
  }
  async signTransaction(tx) {
    tx.partialSign(this.payer);
    return tx;
  }
  async signAllTransactions(txs) {
    return txs.map(t => {
      t.partialSign(this.payer);
      return t;
    });
  }
  get publicKey() {
    return this.payer.publicKey;
  }
}

let initialized = false;

/**
 * Initializes live Solana subscription and API token activation.
 * Automatically fails back to mock mode if network/balance calls fail.
 */
async function initClient() {
  if (initialized) return;
  if (IS_MOCK) {
    initialized = true;
    return;
  }

  try {
    // If a pre-activated key is already supplied in env, use it directly
    if (apiToken) {
      console.log(`[TxLINE] Using pre-configured API Token from environment.`);
      initialized = true;
      return;
    }

    console.log(`[Solana] Initializing on-chain subscription on network: ${SOLANA_NETWORK}`);
    
    // Import Solana libraries dynamically to ensure they are fully installed
    const anchor = require('@coral-xyz/anchor');
    const { Connection, PublicKey, Keypair, SystemProgram } = require('@solana/web3.js');
    const { getAssociatedTokenAddressSync, TOKEN_2022_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } = require('@solana/spl-token');
    const nacl = require('tweetnacl');

    const networkConfig = CONFIG[SOLANA_NETWORK] || CONFIG.devnet;
    const connection = new Connection(networkConfig.rpcUrl, "confirmed");

    // 1. Load or generate server wallet keypair
    const walletPath = path.join(__dirname, 'server_wallet.json');
    let payerKeypair;

    if (fs.existsSync(walletPath)) {
      const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'));
      payerKeypair = Keypair.fromSecretKey(new Uint8Array(secretKey));
      console.log(`[Solana] Loaded server wallet: ${payerKeypair.publicKey.toBase58()}`);
    } else {
      payerKeypair = Keypair.generate();
      fs.writeFileSync(walletPath, JSON.stringify(Array.from(payerKeypair.secretKey)), 'utf8');
      console.log(`[Solana] Created new server wallet: ${payerKeypair.publicKey.toBase58()}`);
    }

    // 2. Check and request balance on devnet
    let balance = await connection.getBalance(payerKeypair.publicKey);
    console.log(`[Solana] Wallet balance: ${(balance / 1000000000).toFixed(4)} SOL`);

    if (SOLANA_NETWORK === 'devnet' && balance < 0.05 * 1000000000) {
      console.log(`[Solana] Requesting devnet SOL airdrop...`);
      try {
        const airdropSig = await connection.requestAirdrop(payerKeypair.publicKey, 1000000000);
        await connection.confirmTransaction(airdropSig, "confirmed");
        balance = await connection.getBalance(payerKeypair.publicKey);
        console.log(`[Solana] Airdrop complete. Wallet balance: ${(balance / 1000000000).toFixed(4)} SOL`);
      } catch (err) {
        console.warn(`[Solana] Devnet airdrop failed: ${err.message}.`);
      }
    }

    if (balance === 0) {
      throw new Error(`Wallet balance is 0 SOL. Please fund the server wallet address: ${payerKeypair.publicKey.toBase58()} with devnet SOL to activate live TxLINE.`);
    }

    // 3. Set up Anchor Program (passing IDL, programId, and Provider - v0.29 style)
    const provider = new anchor.AnchorProvider(connection, new NodeWallet(payerKeypair), { commitment: "confirmed" });
    anchor.setProvider(provider);

    const programId = new PublicKey(networkConfig.programIdStr);
    const txlTokenMint = new PublicKey(networkConfig.txlTokenMintStr);
    const program = new anchor.Program(TXORACLE_IDL_BASE, programId, provider);

    // 4. Derive PDAs and token accounts
    const [tokenTreasuryPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("token_treasury_v2")],
      program.programId
    );

    const tokenTreasuryVault = getAssociatedTokenAddressSync(
      txlTokenMint,
      tokenTreasuryPda,
      true,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const [pricingMatrixPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("pricing_matrix")],
      program.programId
    );

    const userTokenAccount = getAssociatedTokenAddressSync(
      txlTokenMint,
      payerKeypair.publicKey,
      false,
      TOKEN_2022_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    // Create Associated Token Account if it does not exist
    const tokenAccountInfo = await connection.getAccountInfo(userTokenAccount);
    if (!tokenAccountInfo) {
      console.log(`[Solana] Creating associated token account for user...`);
      const createTx = new anchor.web3.Transaction().add(
        require('@solana/spl-token').createAssociatedTokenAccountInstruction(
          payerKeypair.publicKey,
          userTokenAccount,
          payerKeypair.publicKey,
          txlTokenMint,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        )
      );
      await anchor.web3.sendAndConfirmTransaction(connection, createTx, [payerKeypair]);
    }

    // 5. Submit Subscribe Instruction on-chain
    const SERVICE_LEVEL_ID = SOLANA_NETWORK === 'mainnet' ? 12 : 1;
    const DURATION_WEEKS = 4;
    const SELECTED_LEAGUES = [];

    console.log(`[Solana] Sending subscribe transaction (ServiceLevel=${SERVICE_LEVEL_ID}, Weeks=${DURATION_WEEKS})...`);
    const txSig = await program.methods
      .subscribe(SERVICE_LEVEL_ID, DURATION_WEEKS)
      .accounts({
        user: payerKeypair.publicKey,
        pricingMatrix: pricingMatrixPda,
        tokenMint: txlTokenMint,
        userTokenAccount,
        tokenTreasuryVault,
        tokenTreasuryPda,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    console.log(`[Solana] On-chain subscription registered! Signature: ${txSig}`);

    // 6. Activate API Credentials
    const authResponse = await axios.post(`${networkConfig.apiOrigin}/auth/guest/start`);
    const jwt = authResponse.data.token;

    const messageString = `${txSig}:${SELECTED_LEAGUES.join(",")}:${jwt}`;
    const message = new TextEncoder().encode(messageString);
    const signatureBytes = nacl.sign.detached(message, payerKeypair.secretKey);
    const walletSignature = Buffer.from(signatureBytes).toString("base64");

    console.log(`[TxLINE] Activating API Access with signature...`);
    const activationResponse = await axios.post(
      `${networkConfig.apiOrigin}/api/token/activate`,
      {
        txSig,
        walletSignature,
        leagues: SELECTED_LEAGUES,
      },
      {
        headers: { Authorization: `Bearer ${jwt}` }
      }
    );

    apiToken = activationResponse.data.token || activationResponse.data;
    console.log(`[TxLINE] API Access Token activated successfully!`);
    
    initialized = true;
  } catch (err) {
    console.error(`[TxLINE] On-chain activation failed:`, err.message || err);
    console.warn(`[TxLINE] Falling back to MOCK mode for safety.`);
    IS_MOCK = true;
    initialized = true;
  }
}

/**
 * Fetches the guest JWT for live TxLINE mode
 */
async function fetchGuestJwt() {
  await initClient();
  if (cachedJwt && jwtExpiry && Date.now() < jwtExpiry) {
    return cachedJwt;
  }
  
  try {
    const networkConfig = CONFIG[SOLANA_NETWORK] || CONFIG.devnet;
    const response = await axios.post(`${networkConfig.apiOrigin}/auth/guest/start`);
    cachedJwt = response.data.token;
    jwtExpiry = Date.now() + 50 * 60 * 1000;
    return cachedJwt;
  } catch (error) {
    console.error('[TxLINE] Failed to retrieve guest JWT:', error.message);
    throw new Error('TxLINE Authentication Failed');
  }
}

/**
 * Returns request headers for live mode API calls
 */
async function getApiHeaders() {
  const jwt = await fetchGuestJwt();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${jwt}`,
    'X-Api-Token': apiToken
  };
}

/**
 * Fetch live decimal odds for all teams.
 * Returns an array of: { teamCode, decimalOdds }
 */
async function fetchLiveOdds() {
  await initClient();
  if (IS_MOCK) {
    MOCK_TEAMS.forEach(team => {
      const drift = (Math.random() - 0.5) * 0.1;
      team.odds = Math.max(team.odds + drift, 1.10);
      team.odds = Math.round(team.odds * 100) / 100;
    });

    return MOCK_TEAMS.map(team => ({
      teamCode: team.code,
      decimalOdds: team.odds
    }));
  }

  // Live TxLINE integration
  try {
    const headers = await getApiHeaders();
    const networkConfig = CONFIG[SOLANA_NETWORK] || CONFIG.devnet;
    const response = await axios.get(`${networkConfig.apiOrigin}/api/fixtures/snapshot`, { headers });
    const fixtures = response.data || [];

    const liveOddsList = [];
    for (const fixture of fixtures.slice(0, 10)) {
      try {
        const oddsResponse = await axios.get(`${networkConfig.apiOrigin}/api/odds/snapshot/${fixture.FixtureId}`, { headers });
        const oddsData = oddsResponse.data || [];
        
        const matchWinnerMarket = oddsData.find(m => 
          m.name && (m.name.toLowerCase().includes('match winner') || m.name.toLowerCase().includes('1x2'))
        ) || oddsData[0];

        if (matchWinnerMarket && matchWinnerMarket.outcomes) {
          const outcomes = matchWinnerMarket.outcomes;
          const homeTeam = fixture.Participant1IsHome ? fixture.Participant1 : fixture.Participant2;
          const awayTeam = fixture.Participant1IsHome ? fixture.Participant2 : fixture.Participant1;
          
          const homeOutcome = outcomes.find(o => o.name && o.name.toLowerCase().includes('1') || o.name.toLowerCase().includes('home') || o.name === homeTeam);
          const awayOutcome = outcomes.find(o => o.name && o.name.toLowerCase().includes('2') || o.name.toLowerCase().includes('away') || o.name === awayTeam);

          if (homeOutcome && homeOutcome.price) {
            liveOddsList.push({ teamCode: homeTeam.substring(0, 3).toUpperCase(), decimalOdds: parseFloat(homeOutcome.price) });
          }
          if (awayOutcome && awayOutcome.price) {
            liveOddsList.push({ teamCode: awayTeam.substring(0, 3).toUpperCase(), decimalOdds: parseFloat(awayOutcome.price) });
          }
        }
      } catch (err) {
        // Skip individual errors
      }
    }

    if (liveOddsList.length === 0) {
      return MOCK_TEAMS.map(team => ({ teamCode: team.code, decimalOdds: team.odds }));
    }

    return liveOddsList;
  } catch (error) {
    console.error('[TxLINE] Error fetching live odds, falling back to mock:', error.message);
    return MOCK_TEAMS.map(team => ({ teamCode: team.code, decimalOdds: team.odds }));
  }
}

/**
 * Fetch new discrete match events since a particular event ID.
 * Returns an array of: { id, teamCode, opponentCode, type }
 */
async function fetchNewEvents(lastEventId) {
  await initClient();
  if (IS_MOCK) {
    const tickChance = Math.random();
    if (tickChance < 0.12) {
      const fixtureIdx = Math.floor(Math.random() * MOCK_FIXTURES.length);
      const fixture = MOCK_FIXTURES[fixtureIdx];
      const scoringTeam = Math.random() < 0.5 ? fixture.home : fixture.away;
      const defendingTeam = scoringTeam === fixture.home ? fixture.away : fixture.home;
      
      const eventTypeChance = Math.random();
      let type = 'GOAL';
      let msg = '';
      
      if (eventTypeChance < 0.60) {
        type = 'GOAL';
        const newHomeScore = fixture.homeScore + (scoringTeam === fixture.home ? 1 : 0);
        const newAwayScore = fixture.awayScore + (scoringTeam === fixture.away ? 1 : 0);
        msg = `Goal! ${scoringTeam} scores against ${defendingTeam}! [${newHomeScore}-${newAwayScore}]`;
        
        const scoringTeamObj = MOCK_TEAMS.find(t => t.code === scoringTeam);
        const defendingTeamObj = MOCK_TEAMS.find(t => t.code === defendingTeam);
        if (scoringTeamObj) scoringTeamObj.odds = Math.max(scoringTeamObj.odds - 0.8, 1.10);
        if (defendingTeamObj) defendingTeamObj.odds = defendingTeamObj.odds + 0.8;
      } else if (eventTypeChance < 0.75) {
        type = 'PENALTY';
        msg = `Penalty awarded to ${scoringTeam}!`;
      } else if (eventTypeChance < 0.90) {
        type = 'RED_CARD';
        msg = `Red Card! Sent off player from ${defendingTeam}!`;
        const defendingTeamObj = MOCK_TEAMS.find(t => t.code === defendingTeam);
        if (defendingTeamObj) defendingTeamObj.odds = defendingTeamObj.odds + 1.2;
      } else {
        type = 'VAR_OVERTURN';
        msg = `VAR Overturn! Disallowed goal for ${defendingTeam}!`;
        const defendingTeamObj = MOCK_TEAMS.find(t => t.code === defendingTeam);
        if (defendingTeamObj) defendingTeamObj.odds = defendingTeamObj.odds + 0.5;
      }
      
      const newEvent = {
        id: eventIdCounter++,
        teamCode: scoringTeam,
        opponentCode: defendingTeam,
        type,
        message: msg,
        timestamp: Date.now()
      };
      
      mockEventLog.push(newEvent);
    }
    
    return mockEventLog.filter(e => e.id > lastEventId);
  }

  // Live TxLINE integration
  try {
    const headers = await getApiHeaders();
    const networkConfig = CONFIG[SOLANA_NETWORK] || CONFIG.devnet;
    const response = await axios.get(`${networkConfig.apiOrigin}/api/fixtures/snapshot`, { headers });
    const fixtures = response.data || [];

    const newEvents = [];
    for (const fixture of fixtures.slice(0, 5)) {
      try {
        const scoresResponse = await axios.get(`${networkConfig.apiOrigin}/api/scores/updates/${fixture.FixtureId}`, { headers });
        const updates = scoresResponse.data || [];
        
        updates.forEach(update => {
          if (update.seq && update.seq > lastEventId) {
            let type = 'GOAL';
            let teamCode = update.teamCode || update.participant || 'UNK';
            let opponentCode = 'OPP';
            let message = update.message || `${type} event detected`;
            
            if (update.action === 'goal') {
              type = 'GOAL';
            } else if (update.action === 'red_card') {
              type = 'RED_CARD';
            } else if (update.action === 'penalty') {
              type = 'PENALTY';
            } else if (update.action === 'var') {
              type = 'VAR_OVERTURN';
            } else {
              return;
            }
            
            newEvents.push({
              id: update.seq,
              teamCode: teamCode.substring(0, 3).toUpperCase(),
              opponentCode: opponentCode,
              type,
              message,
              timestamp: update.ts || Date.now()
            });
          }
        });
      } catch (err) {
        // Skip individual errors
      }
    }
    
    return newEvents.sort((a, b) => a.id - b.id);
  } catch (error) {
    console.error('[TxLINE] Error fetching live events, falling back to mock:', error.message);
    return mockEventLog.filter(e => e.id > lastEventId);
  }
}

module.exports = {
  fetchLiveOdds,
  fetchNewEvents,
  MOCK_TEAMS,
  MOCK_FIXTURES,
  initClient
};
