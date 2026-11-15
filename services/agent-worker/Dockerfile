# SalonMind agent-worker microservice — consumes the agent event bus (see index.ts).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN --mount=type=secret,id=ca,required=false \
    if [ -f /run/secrets/ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/ca; fi; npm ci --no-audit --no-fund --omit=optional && npm cache clean --force
COPY tsconfig.json ./
COPY src ./src
COPY services/agent-worker ./services/agent-worker
RUN addgroup -S app && adduser -S app -G app
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1
# react-server condition: server-only modules resolve to no-ops outside Next.js
CMD ["node", "--conditions=react-server", "--import", "tsx", "services/agent-worker/index.ts"]
