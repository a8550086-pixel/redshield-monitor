services:
  - type: worker
    name: redshield-monitor
    runtime: docker
    dockerfilePath: ./Dockerfile
    plan: starter
    autoDeploy: true
    envVars:
      - key: REDSHIELD_URL
        value: https://app.getredshield.com
      - key: EVENTS_PATH
        value: /events
      - key: REDSHIELD_EMAIL
        sync: false
      - key: REDSHIELD_PASSWORD
        sync: false
      - key: N8N_WEBHOOK_URL
        sync: false
      - key: POLL_INTERVAL_MS
        value: "5000"
      - key: MAX_SEEN_IDS
        value: "5000"
      - key: SEL_LOGIN_EMAIL
        value: 'input[type="email"], input[name="email"]'
      - key: SEL_LOGIN_PASSWORD
        value: 'input[type="password"], input[name="password"]'
      - key: SEL_LOGIN_SUBMIT
        value: 'button[type="submit"]'
      - key: SEL_LOGGED_IN_MARKER
        value: 'nav, [data-testid="app-shell"], header'
      - key: SEL_EVENT_ITEM
        value: '[data-testid="event-row"], table tbody tr, .event-item, li.event'
      - key: SEL_EVENT_ID_ATTR
        value: data-id
      - key: SEL_EVENT_LINK
        value: a
      - key: SEL_EVENT_DETAIL
        value: 'main, [data-testid="event-detail"], .event-detail, body'
      - key: DATA_DIR
        value: /app/data
      - key: SESSION_FILE
        value: session.json
      - key: SEEN_EVENTS_FILE
        value: seen-events.json
      - key: HEADLESS
        value: "true"
      - key: NAVIGATION_TIMEOUT_MS
        value: "30000"
      - key: PORT
        value: "10000"
      - key: PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD
        value: "1"
    disk:
      name: redshield-data
      mountPath: /app/data
      sizeGB: 1
