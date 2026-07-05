const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const logger = require('./logger');

/**
 * Wraps a single long-lived Chromium browser + context + page, with helpers
 * to (re)login and persist/restore the session (cookies + localStorage) via
 * Playwright's storageState, so we don't have to log in on every restart.
 */
class BrowserSession {
  constructor(config) {
    this.config = config;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async start() {
    this.browser = await chromium.launch({ headless: this.config.headless });

    const storageStatePath = path.join(this.config.dataDir, this.config.sessionFile);
    const hasSavedSession = fs.existsSync(storageStatePath);

    this.context = await this.browser.newContext(
      hasSavedSession ? { storageState: storageStatePath } : {}
    );
    this.context.setDefaultNavigationTimeout(this.config.navigationTimeoutMs);
    this.context.setDefaultTimeout(this.config.navigationTimeoutMs);

    this.page = await this.context.newPage();

    if (hasSavedSession) {
      logger.info(`Restored saved session from ${storageStatePath}`);
    } else {
      logger.info('No saved session found, will perform a fresh login.');
    }

    await this.ensureLoggedIn();
    return this;
  }

  async isLoggedIn() {
    try {
      await this.page.goto(this.config.redshieldUrl, { waitUntil: 'domcontentloaded' });
      const marker = await this.page
        .locator(this.config.selLoggedInMarker)
        .first()
        .isVisible({ timeout: 5000 })
        .catch(() => false);
      return marker;
    } catch (err) {
      logger.warn('isLoggedIn() check failed:', err.message);
      return false;
    }
  }

  async ensureLoggedIn() {
    if (await this.isLoggedIn()) {
      logger.info('Session is already authenticated.');
      await this._saveSession();
      return;
    }

    logger.info('Not authenticated, logging in with REDSHIELD_EMAIL / REDSHIELD_PASSWORD...');
    await this.login();
  }

  async login() {
    const { page, config } = this;

    await page.goto(config.redshieldUrl, { waitUntil: 'domcontentloaded' });

    await page.locator(config.selLoginEmail).first().fill(config.loginEmail);
    await page.locator(config.selLoginPassword).first().fill(config.loginPassword);
    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => {}),
      page.locator(config.selLoginSubmit).first().click(),
    ]);

    // Give the SPA a moment to redirect / render the dashboard.
    await page.waitForTimeout(2000);

    const loggedIn = await page
      .locator(config.selLoggedInMarker)
      .first()
      .isVisible({ timeout: 15000 })
      .catch(() => false);

    if (!loggedIn) {
      throw new Error(
        'Login appears to have failed: logged-in marker element was not found. ' +
          'Double check SEL_LOGIN_EMAIL / SEL_LOGIN_PASSWORD / SEL_LOGIN_SUBMIT / SEL_LOGGED_IN_MARKER selectors ' +
          'against the real login page (see README "Finding selectors").'
      );
    }

    logger.info('Login successful.');
    await this._saveSession();
  }

  async _saveSession() {
    const storageStatePath = path.join(this.config.dataDir, this.config.sessionFile);
    fs.mkdirSync(path.dirname(storageStatePath), { recursive: true });
    await this.context.storageState({ path: storageStatePath });
    logger.debug(`Session saved to ${storageStatePath}`);
  }

  async close() {
    try {
      await this.context?.close();
    } catch (_) {}
    try {
      await this.browser?.close();
    } catch (_) {}
  }
}

module.exports = BrowserSession;
