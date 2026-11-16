# Smart Reply API and worker image. Build from the repository root:
#   docker build -f backend/Dockerfile -t smart-reply-api .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace packages/shared --workspace backend --include-workspace-root --ignore-scripts
COPY packages/shared packages/shared
COPY backend backend
RUN npm run build -w @smart-reply/shared && npm run build -w backend
RUN npm prune --omit=dev --workspace packages/shared --workspace backend --include-workspace-root --ignore-scripts

FROM node:22-bookworm-slim
# ffmpeg converts browser voice notes to OGG/Opus for WhatsApp.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates tini && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/backend/package.json backend/package.json
COPY --from=build /app/backend/dist backend/dist
COPY --from=build /app/backend/drizzle backend/drizzle
RUN mkdir -p /app/backend/storage && chown -R node:node /app/backend/storage
USER node
WORKDIR /app/backend
EXPOSE 4000
ENTRYPOINT ["/usr/bin/tini", "--"]
# The same image runs the worker with: node dist/worker.js
CMD ["node", "dist/main.js"]
