# Una sola imagen para la web, el worker y las migraciones.
FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
RUN npm ci

COPY . .
RUN npm run db:generate && npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "run", "start", "-w", "@fertelligence/web"]
