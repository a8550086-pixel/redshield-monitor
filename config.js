const http = require('http');
const path = require('path');
const { config, validate } = require('./config');
const logger = require('./logger');
const BrowserSession = require('./browserSession');
const DedupeStore = require('./dedupeStore');
const { pollOnce } = require('./eventMonitor');

let stopping = false;
let lastPollAt = null;
let lastPollOk = true;

function startHealthServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(lastPollOk ? 200 : 503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: lastPollOk, lastPollAt }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('redshield-monitor is running');
  });
  server.listen(config.port, () => logger.info(`Health server listening on port ${config.port}`));
  return server;
}

async function main() {
  validate();

  const dedupeStore = new DedupeStore({
    filePath: path.join(config.dataDir, config.seenEventsFile),
    maxSize: config.maxSeenIds,
  });

  const session = new BrowserSession(config);
  await session.start();

  const healthServer = startHealthServer();

  logger.info(`Starting poll loop every ${config.pollIntervalMs}ms against ${config.redshieldUrl}${config.eventsPath}`);

  const loop = async () => {
    if (stopping) return;

    try {
      const { checked, sent } = await pollOnce({ page: session.page, config, dedupeStore });
      lastPollOk = true;
      lastPollAt = new Date().toISOString();
      if (sent > 0) logger.info(`Poll complete: checked ${checked}, sent ${sent} new event(s) to webhook.`);
    } catch (err) {
      lastPollOk = false;
      lastPollAt = new Date().toISOString();
      logger.error('Poll cycle failed:', err.message);

      // If the page looks logged out (e.g. session expired), try to recover.
      try {
        const stillLoggedIn = await session.isLoggedIn();
        if (!stillLoggedIn) {
          logger.warn('Session appears to have expired, attempting re-login...');
          await session.login();
        }
      } catch (reloginErr) {
        logger.error('Re-login attempt failed:', reloginErr.message);
      }
    } finally {
      if (!stopping) setTimeout(loop, config.pollIntervalMs);
    }
  };

  loop();

  const shutdown = async (signal) => {
    if (stopping) return;
    stopping = true;
    logger.info(`Received ${signal}, shutting down gracefully...`);
    healthServer.close();
    await session.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error('Fatal startup error:', err);
  process.exit(1);
});
