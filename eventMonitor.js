const logger = require('./logger');

/**
 * POSTs a JSON payload to the configured n8n webhook URL, retrying on
 * network errors or non-2xx responses with exponential backoff.
 */
async function sendToWebhook(payload, { url, timeoutMs = 10000, maxRetries = 3 }) {
  let attempt = 0;
  let lastError;

  while (attempt <= maxRetries) {
    attempt += 1;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        logger.info(`Webhook delivered (status ${res.status}) for event ${payload.id}`);
        return true;
      }

      const bodyText = await res.text().catch(() => '');
      throw new Error(`Webhook responded with ${res.status}: ${bodyText.slice(0, 300)}`);
    } catch (err) {
      clearTimeout(timer);
      lastError = err;
      logger.warn(`Webhook attempt ${attempt}/${maxRetries + 1} failed for event ${payload.id}:`, err.message);
      if (attempt <= maxRetries) {
        const backoffMs = 500 * 2 ** (attempt - 1);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
  }

  logger.error(`Giving up sending event ${payload.id} to webhook after ${maxRetries + 1} attempts:`, lastError?.message);
  return false;
}

module.exports = { sendToWebhook };
