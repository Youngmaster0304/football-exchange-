# Football Stock Exchange

**Trade World Cup teams like stocks in real-time.** Prices move live based on match events (goals, penalties, red cards, VAR decisions) and TxLINE odds data. Built on Solana for on-chain portfolio snapshots.

> Consumer & Fan Experiences Track — World Cup Hackathon

---

## How It Works

- **16 national teams** are tokenized as tradeable stocks with live prices
- Prices derive from **implied probability**: `price = 1000 × (1 / decimalOdds)`
- Match events inject **impulses** into the price engine:
  - Goal → +100 (scorer) / -100 (conceder)
  - Penalty → +50 / -50
  - Red Card → -80 / +80
  - VAR Overturn → +40 / -40
- Impulses **decay 15% per tick** (0.85× multiplier every 5 seconds)
- **Volatility** is calculated as standard deviation of the last 20 price ticks
- Users start with **$10,000 virtual cash** to buy and sell shares

---

## Features

- Live price charts with Chart.js
- Real-time WebSocket market updates (5s tick interval)
- Buy/sell trading terminal with portfolio tracking
- Global leaderboard ranked by net worth
- Live match event feed (goals, cards, VAR)
- On-chain Solana devnet snapshot sync
- Phantom wallet + demo wallet support
- Responsive dark UI with glassmorphism design

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js, Express, WebSocket (ws) |
| Frontend | Vanilla JS, Chart.js, CSS3 |
| Blockchain | Solana devnet, Anchor, SPL Token |
| Data | TxLINE odds API (mock fallback) |
| Wallet | Phantom, Solana Web3.js |

---

## Local Setup

```bash
# Clone
git clone https://github.com/Youngmaster0304/football-exchange-.git
cd football-exchange-

# Install
npm install

# Run (mock mode)
npm start
```

Open **http://localhost:3070** in your browser.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3070` | Server port |
| `TXLINE_MOCK` | `true` | Use mock data (`true`) or live TxLINE API (`false`) |
| `SOLANA_NETWORK` | `devnet` | Solana network (`devnet` or `mainnet`) |
| `TXLINE_API_KEY` | — | Pre-activated TxLINE API token (optional) |

---

## Deployment

### Backend — Railway

1. Push repo to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Set env var `TXLINE_MOCK=true`
4. Copy the Railway URL (e.g. `https://your-app.up.railway.app`)

### Frontend — Vercel

1. Update `public/config.js`:
   ```js
   const RENDER_BACKEND_URL = 'https://your-app.up.railway.app';
   ```
2. Deploy the `public/` folder on [vercel.com](https://vercel.com)

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/teams` | All team market data |
| GET | `/api/portfolio/:userId` | User portfolio + net worth |
| GET | `/api/leaderboard` | Top 10 users by net worth |
| POST | `/api/trade` | Execute buy/sell order |

### Trade Request Body

```json
{
  "userId": "wallet-address",
  "teamCode": "BRA",
  "action": "BUY",
  "shares": 10
}
```

---

## WebSocket Messages

| Type | Direction | Description |
|------|-----------|-------------|
| `INIT` | Server → Client | Initial teams, fixtures, leaderboard |
| `MARKET_TICK` | Server → Client | Updated prices every 5s |
| `MATCH_EVENT` | Server → Client | Live goal, card, VAR events |
| `TRADE_ACTIVITY` | Server → Client | Broadcast of executed trades |
| `LEADERBOARD_UPDATE` | Server → Client | Updated rankings after trades |

---

## Project Structure

```
├── server.js          Express + WebSocket server, main loop
├── priceEngine.js     Price calculation, impulse decay, volatility
├── tradeEngine.js     Portfolio management, trade execution
├── txlineClient.js    TxLINE API client, Solana integration, mock data
├── public/
│   ├── index.html     Main UI
│   ├── app.js         Frontend logic, wallet, charts
│   ├── config.js      Backend URL config
│   └── style.css      Dark theme, glassmorphism
├── .env               Environment config
├── Dockerfile         Container config
└── fly.toml           Fly.io config
```

---

## License

MIT
