require('dotenv').config();

function req(name, fallback = undefined) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v;
}

function reqInt(name, fallback) {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = parseInt(v, 10);
  return Number.isNaN(n) ? fallback : n;
}

const config = {
  // --- RedShield site ---
  redshieldUrl: req('REDSHIELD_URL', 'https://app.getredshield.com'),
  eventsPath: req('EVENTS_PATH', '/events'), // path appended to redshieldUrl to reach the events/alerts list
  loginEmail: req('REDSHIELD_EMAIL'),
  loginPassword: req('REDSHIELD_PASSWORD'),

  // --- Login form selectors (adjust to match the real DOM, see README) ---
  selLoginEmail: req('SEL_LOGIN_EMAIL', 'input[type="email"], input[name="email"]'),
  selLoginPassword: req('SEL_LOGIN_PASSWORD', 'input[type="password"], input[name="password"]'),
  selLoginSubmit: req('SEL_LOGIN_SUBMIT', 'button[type="submit"]'),
  // Any selector that is ONLY present once logged in (nav bar, user menu, etc.)
  selLoggedInMarker: req('SEL_LOGGED_IN_MARKER', 'nav, [data-testid="app-shell"], header'),

  // --- Events list selectors ---
  // CSS selector matching each individual event/alert row or card in the list.
  selEventItem: req('SEL_EVENT_ITEM', '[data-testid="event-row"], table tbody tr, .event-item, li.event'),
  // Attribute on the event item element that holds a stable unique id (optional).
  selEventIdAttr: req('SEL_EVENT_ID_ATTR', 'data-id'),
  // Selector (relative to the event item) for the clickable link/element that opens it.
  selEventLink: req('SEL_EVENT_LINK', 'a'),
  // Selector for the container that holds the FULL text once the event detail is open.
  selEventDetail: req('SEL_EVENT_DETAIL', 'main, [data-testid="event-detail"], .event-detail, body'),

  // --- Polling / dedupe ---
  pollIntervalMs: reqInt('POLL_INTERVAL_MS', 5000),
  maxSeenIds: reqInt('MAX_SEEN_IDS', 5000),

  // --- Storage (use a Render persistent disk mounted here in production) ---
  dataDir: req('DATA_DIR', require('path').join(__dirname, '..', 'data')),
  sessionFile: req('SESSION_FILE', 'session.json'),
  seenEventsFile: req('SEEN_EVENTS_FILE', 'seen-events.json'),

  // --- Webhook ---
  n8nWebhookUrl: req('N8N_WEBHOOK_URL'),
  webhookTimeoutMs: reqInt('WEBHOOK_TIMEOUT_MS', 10000),
  webhookMaxRetries: reqInt('WEBHOOK_MAX_RETRIES', 3),

  // --- Browser ---
  headless: req('HEADLESS', 'true') !== 'false',
  navigationTimeoutMs: reqInt('NAVIGATION_TIMEOUT_MS', 30000),

  // --- Health server (so Render "web service" type / uptime checks have something to hit) ---
  port: reqInt('PORT', 10000),
};

function validate() {
  const missing = [];
  if (!config.loginEmail) missing.push('REDSHIELD_EMAIL');
  if (!config.loginPassword) missing.push('REDSHIELD_PASSWORD');
  if (!config.n8nWebhookUrl) missing.push('N8N_WEBHOOK_URL');
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = { config, validate };
