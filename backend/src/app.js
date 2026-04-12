const express = require('express');
const routes = require('./routes');
const cors = require('cors');
const crypto = require('crypto');
const { apiPrefix } = require('./config/app.config');
const notFoundMiddleware = require('./middlewares/notFound.middleware');
const errorMiddleware = require('./middlewares/error.middleware');

const app = express();

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseAllowedOrigins() {
  const raw = String(process.env.CORS_ALLOWED_ORIGINS || '').trim();
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function isDevLike() {
  return String(process.env.NODE_ENV || 'development').trim().toLowerCase() !== 'production';
}

function secureEquals(left, right) {
  const leftBuf = Buffer.from(String(left || ''), 'utf8');
  const rightBuf = Buffer.from(String(right || ''), 'utf8');
  if (leftBuf.length !== rightBuf.length) return false;
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

const allowedOrigins = parseAllowedOrigins();
const publicBindEnabled = parseBoolean(process.env.AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND, false);
const backendApiToken = String(process.env.BACKEND_API_TOKEN || '').trim();
const requireBackendAuth = publicBindEnabled || backendApiToken.length > 0;
const sensitiveRateLimitEnabled = parseBoolean(
  process.env.SENSITIVE_RATE_LIMIT_ENABLED,
  true,
);
const sensitiveRateLimitWindowMs = parsePositiveInt(
  process.env.SENSITIVE_RATE_LIMIT_WINDOW_MS,
  60_000,
);
const sensitiveRateLimitRequests = parsePositiveInt(
  process.env.SENSITIVE_RATE_LIMIT_REQUESTS,
  30,
);
const sensitiveRateBuckets = new Map();
const sensitiveRoutePrefixes = [
  `${apiPrefix}/settings`,
  `${apiPrefix}/documents`,
  `${apiPrefix}/email`,
  `${apiPrefix}/imports`,
];

function resolveSensitiveGroup(pathname) {
  const path = String(pathname || '');
  for (const prefix of sensitiveRoutePrefixes) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return prefix;
    }
  }
  return null;
}

function resolveClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }
  return String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
}

app.use(
  cors({
    origin(origin, callback) {
      // Electron IPC / same-process requests usually have no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      if (isDevLike() && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'X-Ordinay-Backend-Token',
    ],
  }),
);

app.use((req, res, next) => {
  if (!sensitiveRateLimitEnabled) {
    next();
    return;
  }

  const group = resolveSensitiveGroup(req.path);
  if (!group) {
    next();
    return;
  }

  const now = Date.now();
  const windowStart = now - sensitiveRateLimitWindowMs;
  const key = `${resolveClientIp(req)}:${group}`;
  const bucket = sensitiveRateBuckets.get(key) || [];
  const recent = bucket.filter((timestamp) => timestamp > windowStart);

  if (recent.length >= sensitiveRateLimitRequests) {
    res.status(429).json({
      error: 'rate_limited',
      message: 'Too many requests on a sensitive endpoint. Please retry shortly.',
      scope: group,
    });
    return;
  }

  recent.push(now);
  sensitiveRateBuckets.set(key, recent);
  next();
});

app.use((req, res, next) => {
  if (!requireBackendAuth) {
    next();
    return;
  }

  if (!backendApiToken) {
    res.status(500).json({
      error: 'backend_auth_not_configured',
      message: 'BACKEND_API_TOKEN is required when backend auth is enabled',
    });
    return;
  }

  const headerToken = String(req.headers['x-ordinay-backend-token'] || '').trim();
  const authHeader = String(req.headers.authorization || '').trim();
  const bearerToken = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const provided = headerToken || bearerToken;

  if (!provided || !secureEquals(provided, backendApiToken)) {
    res.status(401).json({ error: 'unauthorized', message: 'Missing or invalid backend API token' });
    return;
  }

  next();
});

app.use(express.json({ limit: process.env.API_JSON_LIMIT || '50mb' }));

app.use(apiPrefix, routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

module.exports = app;
