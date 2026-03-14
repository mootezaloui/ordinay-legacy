const LOOPBACK_HOST = "127.0.0.1";
const LOOPBACK_ALIASES = new Set(["127.0.0.1", "localhost"]);
const HOST_OVERRIDE_KEYS = ["HOST", "BIND_HOST", "BACKEND_HOST"];
const PUBLIC_BIND_OVERRIDE_FLAG = "AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND";

function allowPublicBind(env = process.env) {
  const raw = env?.[PUBLIC_BIND_OVERRIDE_FLAG];
  if (raw === undefined || raw === null) {
    return false;
  }
  const normalized = String(raw).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

function resolveBindHost(env = process.env) {
  const publicBindAllowed = allowPublicBind(env);

  for (const key of HOST_OVERRIDE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(env, key)) continue;
    const raw = env[key];
    if (raw === undefined || raw === null || String(raw).trim() === "") continue;
    const normalized = String(raw).trim().toLowerCase();
    if (!LOOPBACK_ALIASES.has(normalized) && !publicBindAllowed) {
      throw new Error(
        `Non-loopback host override is not allowed (${key}=${raw}). Set ${PUBLIC_BIND_OVERRIDE_FLAG}=true to opt in.`,
      );
    }
    if (!LOOPBACK_ALIASES.has(normalized) && publicBindAllowed) {
      return String(raw).trim();
    }
  }
  return LOOPBACK_HOST;
}

function startBackendServers(app, options = {}) {
  const env = options.env || process.env;
  const logger = options.logger || console;
  const pipePath =
    options.pipePath !== undefined ? options.pipePath : env.ORDINAY_PIPE;
  const port =
    options.port !== undefined
      ? Number(options.port)
      : Number.parseInt(env.PORT || "3000", 10);
  const bindHost = resolveBindHost(env);

  if (pipePath) {
    const pipeServer = app.listen(pipePath, () => {
      logger.log(`Ordinay backend listening on pipe ${pipePath}`);
    });

    const httpServer = app.listen(port, bindHost, () => {
      logger.log(
        `Ordinay backend also listening on HTTP port ${port} (${bindHost}) (for streaming)`,
      );
    });

    return { pipeServer, httpServer, bindHost, port, pipePath };
  }

  const httpServer = app.listen(port, bindHost, () => {
    logger.log(`Ordinay backend listening on ${bindHost}:${port}`);
  });

  return { httpServer, bindHost, port, pipePath: null };
}

module.exports = {
  LOOPBACK_HOST,
  HOST_OVERRIDE_KEYS,
  PUBLIC_BIND_OVERRIDE_FLAG,
  resolveBindHost,
  startBackendServers,
};
