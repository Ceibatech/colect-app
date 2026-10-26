# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS base

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM base AS builder
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
# Runtime secrets must never be supplied as Docker build arguments or copied in.
# prisma generate does not connect to the database.
RUN npm run build

FROM base AS runner
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      mariadb-client \
      poppler-utils \
      tesseract-ocr \
      tesseract-ocr-eng \
      tesseract-ocr-fra \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    DOCUMENTS_STORAGE_PATH=/var/data/documents
ENV OCR_LANGUAGE=fra+eng \
    AUTO_INDEX_MAX_PAGES=20

# Keep Prisma CLI and its engines available for the explicit migration step.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/next.config.ts /app/tsconfig.json ./
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/deploy/healthcheck.mjs /app/deploy/validate-env.mjs /app/deploy/backup-database.mjs /app/deploy/email-report-scheduler.mjs /app/deploy/reset-transfers.mjs /app/deploy/export-carton-labels.mjs /app/deploy/regroup-cartons.mjs /app/deploy/align-dossier-salle.mjs ./deploy/

RUN mkdir -p /var/data/documents && chown node:node /var/data/documents
USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD ["node", "deploy/healthcheck.mjs"]

# Do not use npm start: its existing script runs database migrations on restart.
CMD ["node", "node_modules/next/dist/bin/next", "start", "--hostname", "0.0.0.0"]
