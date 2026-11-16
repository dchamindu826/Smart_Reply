# Smart Reply web app. Build from the repository root:
#   docker build -f frontend/Dockerfile -t smart-reply-web .
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace packages/shared --workspace frontend --include-workspace-root --ignore-scripts
COPY packages/shared packages/shared
COPY frontend frontend
# Same origin in production: the browser reaches the API and socket through the proxy.
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_PUBLIC_SOCKET_URL=
RUN npm run build -w @smart-reply/shared && npm run build -w frontend

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/frontend/.next/standalone ./
COPY --from=build /app/frontend/.next/static ./frontend/.next/static
COPY --from=build /app/frontend/public ./frontend/public
USER node
EXPOSE 3000
CMD ["node", "frontend/server.js"]
