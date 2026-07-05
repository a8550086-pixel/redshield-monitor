# Official Playwright image already contains Chromium + all required OS
# dependencies, so npm install doesn't need root/apt access at runtime.
FROM mcr.microsoft.com/playwright:v1.47.2-jammy

WORKDIR /app

# Skip re-downloading browsers during npm ci, they're already in this image.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY . .

# Data directory for session + dedupe files (mount a Render persistent disk here).
RUN mkdir -p /app/data

EXPOSE 10000

CMD ["npm", "start"]
