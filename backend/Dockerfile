FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:agent
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV API_PREFIX=/api

RUN groupadd --system appgroup && useradd --system --gid appgroup --create-home appuser

COPY --from=build /app /app

USER appuser
EXPOSE 3000

CMD ["node", "src/server.js"]
