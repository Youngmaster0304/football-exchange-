// Backend API Configuration
// Replace RENDER_BACKEND_URL with your Render deployment URL after deploying
const RENDER_BACKEND_URL = 'https://football-exchange.onrender.com';

const API_URL = RENDER_BACKEND_URL || window.location.origin;
const WS_URL = RENDER_BACKEND_URL
  ? RENDER_BACKEND_URL.replace(/^http/, 'ws')
  : window.location.origin.replace(/^http/, 'ws');
