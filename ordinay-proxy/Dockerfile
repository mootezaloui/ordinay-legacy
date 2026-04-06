FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN groupadd --system appgroup && useradd --system --gid appgroup --create-home appuser
RUN mkdir -p /data && chown appuser:appgroup /data

COPY --from=build /app/dist /app/dist
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/package.json /app/package.json

USER appuser
EXPOSE 3000

CMD ["node", "dist/server.js"]
