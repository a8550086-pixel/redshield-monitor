const crypto = require('crypto');
const logger = require('./logger');
const { sendToWebhook } = require('./webhookClient');

function hash(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Reads the current list of events/alerts from the page and returns a
 * normalized array of { id, href, summaryText }.
 *
 * NOTE: This function is intentionally generic. `config.selEventItem` /
 * `selEventIdAttr` / `selEventLink` must be tuned to the real RedShield DOM
 * (see README "Finding selectors").
 */
async function listEvents(page, config) {
  const items = page.locator(config.selEventItem);
  const count = await items.count();
  const results = [];

  for (let i = 0; i < count; i += 1) {
    const item = items.nth(i);

    let href = null;
    try {
      const link = item.locator(config.selEventLink).first();
      href = await link.getAttribute('href').catch(() => null);
    } catch (_) {
      /* no link found in this item, fall back to id/text below */
    }

    let idAttr = null;
    try {
      idAttr = await item.getAttribute(config.selEventIdAttr).catch(() => null);
    } catch (_) {}

    const summaryText = ((await item.innerText().catch(() => '')) || '').trim();

    // Prefer an explicit stable ID, then the href, then a hash of the row's
    // visible text (best-effort fallback if neither is available).
    const id = idAttr || href || `hash:${hash(summaryText)}`;

    if (!summaryText && !href && !idAttr) continue; // skip totally empty rows

    results.push({ id, href, summaryText, index: i });
  }

  return results;
}

/**
 * Opens a single event (by clicking its row, or navigating to its href if
 * absolute/relative URL is available) and extracts the full visible text of
 * the detail view.
 */
async function openEventAndExtractText(page, config, event) {
  const startUrl = page.url();

  try {
    if (event.href && /^https?:\/\//i.test(event.href)) {
      await page.goto(event.href, { waitUntil: 'domcontentloaded' });
    } else if (event.href) {
      const base = new URL(config.redshieldUrl);
      const target = new URL(event.href, base);
      await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
    } else {
      // No href available: click the nth item directly.
      const items = page.locator(config.selEventItem);
      await items.nth(event.index).locator(config.selEventLink).first().click({ timeout: 5000 }).catch(async () => {
        await items.nth(event.index).click();
      });
      await page.waitForLoadState('domcontentloaded').catch(() => {});
    }

    await page.waitForTimeout(500); // let dynamic content render

    const detail = page.locator(config.selEventDetail).first();
    const fullText = ((await detail.innerText().catch(() => '')) || '').trim();
    const finalUrl = page.url();

    return { fullText, url: finalUrl };
  } finally {
    // Return to the events list for the next iteration, regardless of outcome.
    if (page.url() !== startUrl) {
      await page.goto(startUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});
    }
  }
}

/**
 * Runs a single poll cycle: navigate to the events page, find new events,
 * open + extract each one, send to webhook, mark as seen.
 */
async function pollOnce({ page, config, dedupeStore }) {
  const eventsUrl = new URL(config.eventsPath, config.redshieldUrl).toString();
  await page.goto(eventsUrl, { waitUntil: 'domcontentloaded' });

  const events = await listEvents(page, config);
  const newEvents = events.filter((e) => !dedupeStore.has(e.id));

  if (newEvents.length === 0) {
    logger.debug(`No new events (checked ${events.length}, all already seen).`);
    return { checked: events.length, sent: 0 };
  }

  logger.info(`Found ${newEvents.length} new event(s) out of ${events.length} total.`);

  let sent = 0;
  for (const event of newEvents) {
    try {
      const { fullText, url } = await openEventAndExtractText(page, config, event);

      const payload = {
        id: event.id,
        source: 'redshield',
        url: url || event.href || config.redshieldUrl,
        summary: event.summaryText,
        fullText,
        detectedAt: new Date().toISOString(),
      };

      const ok = await sendToWebhook(payload, {
        url: config.n8nWebhookUrl,
        timeoutMs: config.webhookTimeoutMs,
        maxRetries: config.webhookMaxRetries,
      });

      // Mark as seen even if the webhook ultimately failed after retries,
      // to avoid hammering a broken webhook forever on the same event.
      // (Flip this if you'd rather retry indefinitely until success.)
      dedupeStore.add(event.id);
      if (ok) sent += 1;
    } catch (err) {
      logger.error(`Failed to process event ${event.id}:`, err.message);
    }
  }

  return { checked: events.length, sent };
}

module.exports = { pollOnce, listEvents, openEventAndExtractText };
