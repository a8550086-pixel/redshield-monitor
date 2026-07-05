'use strict';

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const logger = require('./logger');

/**
 * browserSession.js
 * ------------------
 * Manages a persistent Playwright browser session against RedShield
 * (https://app.getredshield.com), including storageState persistence
 * so the bot doesn't need to log in on every run.
 *
 * Environment variables expected (set them in .env / Render dashboard):
 *   REDSHIELD_URL        - base app URL (default: https://app.getredshield.com)
 *   REDSHIELD_LOGIN_URL  - login page URL (default: `${REDSHIELD_URL}/login`)
 *   REDSHIELD_EMAIL      - login email/username
 *   REDSHIELD_PASSWORD   - login password
 *   HEADLESS             - "true"/"false" (default: true)
 *   STORAGE_STATE_PATH   - where to persist session (default: ./data/session.json)
 */

const BASE_URL = process.env.REDSHIELD_URL || 'https://app.getredshield.com';
const LOGIN_URL = process.env.REDSHIELD_LOGIN_URL || `${BASE_URL}/login`;
const EMAIL = process.env.REDSHIELD_EMAIL;
const PASSWORD = process.env.REDSHIELD_PASSWORD;
const HEADLESS = process.env.HEADLESS !== 'false';
const STORAGE_STATE_PATH =
  process.env.STORAGE_STATE_PATH || path.join(process.cwd(), 'data', 'session.json');

// TODO: adjust these selectors to match RedShield's actual login form markup.
const SELECTORS = {
  emailInput: 'input[type="email"], input[name="email"]',
  passwordInput: 'input[type="password"], input[name="password"]',
  submitButton: 'button[type="submit"]',
  // An element that only appears once logged in (used by isLoggedIn()).
  loggedInIndicator: '[data-testid="dashboard"], nav, .app-shell',
};

class BrowserSession {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  /**
   * Ensures the data directory for the storage state file exists.
   */
  _ensureStorageDir() {
    const dir = path.dirname(STORAGE_STATE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      logger.info(`Created storage directory: ${dir}`);
    }
  }

  /**
   * Launches the browser and creates a context, loading a saved
   * storageState if one exists on disk.
   */
  async launch() {
    if (this.browser) {
      logger.debug('Browser already launched, reusing existing instance.');
      return;
    }

    logger.info(`Launching browser (headless=${HEADLESS})...`);
    this.browser = await chromium.launch({ headless: HEADLESS });

    const hasStoredSession = fs.existsSync(STORAGE_STATE_PATH);
    const contextOptions = {};

    if (hasStoredSession) {
      logger.info(`Loading saved session from ${STORAGE_STATE_PATH}`);
      contextOptions.storageState = STORAGE_STATE_PATH;
    } else {
      logger.info('No saved session found, starting with a fresh context.');
    }

    this.context = await this.browser.newContext(contextOptions);
    this.page = await this.context.newPage();
  }

  /**
   * Saves the current context's storageState (cookies, localStorage) to disk.
   */
  async saveSession() {
    if (!this.context) {
      logger.warn('saveSession() called before context was created, skipping.');
      return;
    }
    this._ensureStorageDir();
    await this.context.storageState({ path: STORAGE_STATE_PATH });
    logger.info(`Session saved to ${STORAGE_STATE_PATH}`);
  }

  /**
   * Checks whether the current page/context is authenticated by
   * navigating to the app and looking for a logged-in indicator.
   */
  async isLoggedIn() {
    if (!this.page) {
      throw new Error('isLoggedIn() called before launch(). Call launch() first.');
    }

    try {
      await this.page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });

      // If we got redirected to the login page, we're not logged in.
      if (this.page.url().includes('/login')) {
        logger.debug('isLoggedIn(): redirected to login page -> not logged in.');
        return false;
      }

      const indicator = await this.page
        .locator(SELECTORS.loggedInIndicator)
        .first();
      const visible = await indicator.isVisible().catch(() => false);

      logger.debug(`isLoggedIn(): logged-in indicator visible = ${visible}`);
      return visible;
    } catch (err) {
      logger.warn(`isLoggedIn(): check failed, assuming not logged in. ${err.message}`);
      return false;
    }
  }

  /**
   * Performs a fresh login using credentials from environment variables,
   * then saves the resulting session to disk.
   */
  async login() {
    if (!EMAIL || !PASSWORD) {
      throw new Error(
        'Missing REDSHIELD_EMAIL or REDSHIELD_PASSWORD environment variables.'
      );
    }
    if (!this.page) {
      throw new Error('login() called before launch(). Call launch() first.');
    }

    logger.info(`Navigating to login page: ${LOGIN_URL}`);
    await this.page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });

    logger.info('Filling in credentials...');
    await this.page.fill(SELECTORS.emailInput, EMAIL);
    await this.page.fill(SELECTORS.passwordInput, PASSWORD);

    logger.info('Submitting login form...');
    await Promise.all([
      this.page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
      this.page.click(SELECTORS.submitButton),
    ]);

    const loggedIn = await this.isLoggedIn();
    if (!loggedIn) {
      throw new Error('Login attempt failed: could not verify logged-in state.');
    }

    logger.info('Login successful.');
    await this.saveSession();
  }

  /**
   * Guarantees that, after this resolves, the session is authenticated.
   * Reuses a saved session if valid; otherwise performs a fresh login.
   */
  async ensureLoggedIn() {
    if (!this.browser) {
      await this.launch();
    }

    const alreadyLoggedIn = await this.isLoggedIn();
    if (alreadyLoggedIn) {
      logger.info('Existing session is valid, no login required.');
      return this.page;
    }

    logger.info('Session invalid or missing, logging in...');
    await this.login();
    return this.page;
  }

  /**
   * Returns the active Playwright Page, throwing if not initialized.
   */
  getPage() {
    if (!this.page) {
      throw new Error('No active page. Call launch()/ensureLoggedIn() first.');
    }
    return this.page;
  }

  /**
   * Closes the browser and clears internal references.
   */
  async close() {
    if (this.browser) {
      logger.info('Closing browser...');
      await this.browser.close();
    }
    this.browser = null;
    this.context = null;
    this.page = null;
  }
}

module.exports = BrowserSession;
