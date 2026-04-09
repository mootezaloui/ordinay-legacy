const express = require("express");
const crypto = require("node:crypto");
const aiProviderService = require("../services/aiProvider.service");
const ollamaService = require("../services/ollama.service");
const modelCapabilityService = require("../services/modelCapability.service");

const router = express.Router();
const ollamaPullJobs = new Map();

// GET /api/settings/ai-provider
router.get("/ai-provider", (req, res, next) => {
  try {
    const config = aiProviderService.getProviderConfig();
    res.json(config);
  } catch (error) {
    next(error);
  }
});

// GET /api/settings/ai-provider/ollama-status
router.get("/ai-provider/ollama-status", async (req, res) => {
  const baseUrl = resolveOllamaBaseUrl(req.query?.base_url);
  const isLocalEndpoint = ollamaService.isLocalOllamaHost(baseUrl);

  // Check runtime first (cheap HTTP call) — skip installation probe unless needed
  const runningProbe = await ollamaService.checkIfRunning(baseUrl);

  if (runningProbe.running) {
    return res.json({
      base_url: baseUrl,
      installed: isLocalEndpoint ? true : null,
      installation_relevant: isLocalEndpoint,
      running: true,
      models: runningProbe.models,
      model_count: runningProbe.models.length,
      status: runningProbe.models.length > 0 ? "ready" : "running_no_models",
    });
  }

  // Only check installation when not running (avoids spawnSync on every poll)
  const installedProbe = isLocalEndpoint ? ollamaService.checkIfInstalled() : { installed: null };

  if (runningProbe.status === "api_mismatch") {
    return res.json({
      base_url: baseUrl,
      installed: isLocalEndpoint ? installedProbe.installed : null,
      installation_relevant: isLocalEndpoint,
      running: false,
      models: [],
      model_count: 0,
      status: "api_mismatch",
      error: runningProbe.error,
    });
  }

  if (isLocalEndpoint && !installedProbe.installed) {
    return res.json({
      base_url: baseUrl,
      installed: false,
      installation_relevant: true,
      running: false,
      models: [],
      model_count: 0,
      status: "not_installed",
      error: installedProbe.error || "Ollama app was not detected on this machine",
    });
  }

  return res.json({
    base_url: baseUrl,
    installed: isLocalEndpoint ? true : null,
    installation_relevant: isLocalEndpoint,
    running: false,
    models: [],
    model_count: 0,
    status: "not_running",
    error: runningProbe.error || "Ollama is not responding",
  });
});

// POST /api/settings/ai-provider/ollama/start
router.post("/ai-provider/ollama/start", async (req, res) => {
  try {
    const baseUrl = resolveOllamaBaseUrl(req.body?.base_url || req.query?.base_url);

    // 1. Check if already running
    const runningCheck = await ollamaService.checkIfRunning(baseUrl);
    if (runningCheck.running) {
      return res.json({
        ok: true,
        launched: "already_running",
        ready: true,
        models: runningCheck.models,
        message: "Ollama is already running",
      });
    }

    // 2. Check if installed
    const installCheck = ollamaService.checkIfInstalled();
    if (!installCheck.installed) {
      return res.status(400).json({
        ok: false,
        error: installCheck.error || "Ollama app was not found on this machine",
      });
    }

    // 3. Try to start
    const startResult = ollamaService.tryStartOllama();
    if (!startResult.ok) {
      return res.status(400).json({
        ok: false,
        error: startResult.error || "Unable to launch Ollama",
      });
    }

    // 4. Wait until ready
    const readyResult = await ollamaService.waitUntilReady(baseUrl);
    return res.json({
      ok: true,
      launched: startResult.launched,
      ready: readyResult.ready,
      models: readyResult.models || [],
      elapsed_ms: readyResult.elapsed_ms,
      message: readyResult.ready
        ? `Ollama ready after ${readyResult.elapsed_ms}ms`
        : "Ollama start command launched but not yet responding",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || String(error || "Unknown start error"),
    });
  }
});

// GET /api/settings/ai-provider/ollama/models
router.get("/ai-provider/ollama/models", async (req, res) => {
  const baseUrl = resolveOllamaBaseUrl(req.query?.base_url);
  const result = await ollamaService.getModels(baseUrl);
  return res.json(result);
});

// GET /api/settings/ai-provider/ollama/catalog
router.get("/ai-provider/ollama/catalog", async (req, res) => {
  const query = String(req.query?.query || "").trim();
  const limit = Number.parseInt(String(req.query?.limit || "80"), 10);
  const baseUrl = resolveOllamaBaseUrl(req.query?.base_url);
  const installed = await ollamaService.getModels(baseUrl);
  const installedModels = installed?.ok && Array.isArray(installed.models) ? installed.models : [];
  const result = await ollamaService.getCatalogModels({ query, limit, installedModels });
  if (!result?.ok || !Array.isArray(result.models)) {
    return res.json(result);
  }
  const filtered = [];
  for (const row of result.models) {
    const model = String(row?.name || "").trim();
    if (!model) continue;
    const isInstalled = Boolean(row?.installed);
    const libraryCapabilities = Array.isArray(row?.capabilities) ? row.capabilities : [];
    const hasToolsFromLibrary = libraryCapabilities.includes("tools");

    if (isInstalled) {
      // For installed models, verify tool support via /api/show
      const capability = await modelCapabilityService.resolveModelCapability({
        provider_type: "ollama",
        base_url: baseUrl,
        api_key: "",
        model,
      });
      if (!capability.supports_tools) continue;
      filtered.push({
        ...row,
        supports_tools: true,
        capability_source: capability.source_of_truth,
        checked_at: capability.checked_at,
      });
    } else if (hasToolsFromLibrary) {
      // For uninstalled models, trust the library page capability tags
      filtered.push({
        ...row,
        supports_tools: true,
        capability_source: "ollama_library_tags",
        checked_at: new Date().toISOString(),
      });
    }
    // Strict mode: only include models positively verified/tagged with tools.
    // Unknown capability or explicit non-tools entries are excluded.
  }
  return res.json({ ...result, models: filtered });
});

// POST /api/settings/ai-provider/ollama/pull
router.post("/ai-provider/ollama/pull", async (req, res) => {
  const baseUrl = resolveOllamaBaseUrl(req.body?.base_url || req.query?.base_url);
  const model = String(req.body?.model || "").trim();

  if (!model) {
    return res.status(400).json({ ok: false, error: "model is required" });
  }

  const runtime = await ollamaService.checkIfRunning(baseUrl);
  if (!runtime.running) {
    return res.status(400).json({ ok: false, error: runtime.error || "Ollama is not running" });
  }

  const jobId = `pull_${crypto.randomBytes(8).toString("hex")}`;
  const now = Date.now();
  ollamaPullJobs.set(jobId, {
    id: jobId,
    model,
    base_url: baseUrl,
    status: "queued",
    progress: 0,
    total: 0,
    completed: 0,
    digest: "",
    done: false,
    error: null,
    started_at: now,
    updated_at: now,
    ended_at: null,
  });

  void (async () => {
    try {
      const onProgress = (event) => {
        const current = ollamaPullJobs.get(jobId);
        if (!current) return;

        const total = Number(event?.total || 0);
        const completed = Number(event?.completed || 0);
        const progress = total > 0 ? Math.min(Math.max((completed / total) * 100, 0), 100) : current.progress;

        current.status = String(event?.status || current.status || "pulling");
        current.total = Number.isFinite(total) ? total : current.total;
        current.completed = Number.isFinite(completed) ? completed : current.completed;
        current.progress = Number.isFinite(progress) ? progress : current.progress;
        current.digest = String(event?.digest || current.digest || "");
        current.updated_at = Date.now();

        if (event?.error) {
          current.error = String(event.error);
          current.done = true;
          current.ended_at = Date.now();
          current.status = "error";
        }

        if (event?.done) {
          current.done = true;
          current.ended_at = Date.now();
          if (!current.error) {
            current.status = "success";
            current.progress = 100;
          }
        }
      };

      const current = ollamaPullJobs.get(jobId);
      if (current) {
        current.status = "pulling";
        current.updated_at = Date.now();
      }

      const result = await ollamaService.pullModel(baseUrl, model, onProgress);
      const finalJob = ollamaPullJobs.get(jobId);
      if (!finalJob) return;

      finalJob.done = true;
      finalJob.updated_at = Date.now();
      finalJob.ended_at = Date.now();

      if (!result.ok) {
        finalJob.status = "error";
        finalJob.error = result.error || "Ollama pull failed";
        return;
      }

      finalJob.status = "success";
      finalJob.error = null;
      finalJob.progress = 100;
    } catch (error) {
      const finalJob = ollamaPullJobs.get(jobId);
      if (!finalJob) return;
      finalJob.status = "error";
      finalJob.error = error?.message || String(error || "Ollama pull failed");
      finalJob.done = true;
      finalJob.updated_at = Date.now();
      finalJob.ended_at = Date.now();
    }
  })();

  return res.json({ ok: true, job_id: jobId, model });
});

// GET /api/settings/ai-provider/ollama/pull/:jobId
router.get("/ai-provider/ollama/pull/:jobId", (req, res) => {
  const jobId = String(req.params?.jobId || "").trim();
  const job = ollamaPullJobs.get(jobId);
  if (!job) {
    return res.status(404).json({ ok: false, error: "Pull job not found" });
  }
  return res.json({ ok: true, job });
});

// POST /api/settings/ai-provider/models
router.post("/ai-provider/models", async (req, res) => {
  try {
    const body = req.body || {};
    let config;
    if (body.provider_type) {
      config = {
        provider_type: String(body.provider_type || "").trim(),
        base_url: String(body.base_url || "").trim(),
        api_key: String(body.api_key || "").trim(),
      };
      if (config.api_key === "****") {
        const saved = aiProviderService.getRawProviderConfig();
        config.api_key = String(saved?.api_key || "").trim();
      }
    } else {
      const saved = aiProviderService.getRawProviderConfig();
      if (!saved) {
        return res.status(400).json({ ok: false, error: "No AI provider configured." });
      }
      config = saved;
    }

    if (!config.provider_type) {
      return res.status(400).json({ ok: false, error: "provider_type is required" });
    }

    if (
      config.provider_type !== "ollama" &&
      config.provider_type !== "ordinay" &&
      !String(config.api_key || "").trim()
    ) {
      return res.status(400).json({
        ok: false,
        models: [],
        error: "API key is required to list cloud models for this provider.",
      });
    }

    const normalizedConfig = {
      ...config,
      base_url:
        config.provider_type === "ollama"
          ? resolveOllamaBaseUrl(config.base_url)
          : String(config.base_url || "").trim(),
    };
    const result = await modelCapabilityService.listToolCapableModels(normalizedConfig);
    return res.json(result);
  } catch (error) {
    return res.json({
      ok: false,
      models: [],
      error: error?.message || String(error || "Failed to list provider models"),
    });
  }
});

// PUT /api/settings/ai-provider
router.put("/ai-provider", async (req, res, next) => {
  try {
    const { provider_type, base_url, api_key, model } = req.body || {};
    let resolvedApiKey = String(api_key || "");
    if (resolvedApiKey === "****") {
      const saved = aiProviderService.getRawProviderConfig();
      resolvedApiKey = String(saved?.api_key || "");
    }
    const configToValidate = {
      provider_type,
      base_url:
        provider_type === "ollama"
          ? resolveOllamaBaseUrl(base_url)
          : String(base_url || "").trim(),
      api_key: resolvedApiKey,
      model,
    };

    if (provider_type !== "ordinay") {
      const supportResult = await modelCapabilityService.ensureModelSupportsTools(configToValidate);
      if (!supportResult.ok) {
        return res.status(400).json({
          ok: false,
          error: supportResult.error || "Selected model does not support tool calling.",
        });
      }
    }

    aiProviderService.saveProviderConfig({
      provider_type,
      base_url: configToValidate.base_url,
      api_key,
      model,
    });
    res.json({ ok: true });
  } catch (error) {
    if (error.message && error.message.includes("Invalid provider_type")) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    if (error.message && error.message.includes("model is required")) {
      return res.status(400).json({ ok: false, error: error.message });
    }
    next(error);
  }
});

// POST /api/settings/ai-provider/agent-token
// Frontend pushes a JWT obtained from the license server; backend caches it encrypted.
router.post("/ai-provider/agent-token", (req, res, next) => {
  try {
    const { token, expires_in } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ ok: false, error: "token is required" });
    }
    aiProviderService.cacheAgentToken(token, expires_in);
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// GET /api/settings/ai-provider/agent-token/status
// Returns whether a cached token exists and its expiry status (never returns the token itself).
router.get("/ai-provider/agent-token/status", (req, res, next) => {
  try {
    const cached = aiProviderService.getCachedAgentToken();
    if (!cached) {
      return res.json({ has_token: false });
    }
    return res.json({
      has_token: true,
      expired: cached.expired,
      expires_in_ms: cached.expires_in_ms,
    });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/settings/ai-provider/agent-token
router.delete("/ai-provider/agent-token", (req, res, next) => {
  try {
    aiProviderService.clearAgentToken();
    return res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

// POST /api/settings/ai-provider/test
router.post("/ai-provider/test", async (req, res) => {
  try {
    // Use request body if provided (pre-save test), otherwise load from DB
    const body = req.body || {};
    let config;
    if (body.provider_type && body.model) {
      config = {
        provider_type: body.provider_type,
        base_url:
          body.provider_type === "ollama"
            ? resolveOllamaBaseUrl(body.base_url)
            : body.base_url || "",
        api_key: body.api_key || "",
        model: body.model,
      };
      // If api_key is masked, read the real key from DB
      if (config.api_key === "****") {
        const saved = aiProviderService.getRawProviderConfig();
        config.api_key = saved ? saved.api_key : "";
      }
    } else {
      config = aiProviderService.getRawProviderConfig();
      if (config?.provider_type === "ollama") {
        config.base_url = resolveOllamaBaseUrl(config.base_url);
      }
    }

    if (!config) {
      return res.json({
        ok: false,
        error: "No AI provider configured. Save a configuration first.",
      });
    }

    if (
      (config.provider_type === "openai_compatible" || config.provider_type === "custom") &&
      !String(config.api_key || "").trim()
    ) {
      return res.json({
        ok: false,
        error: "API key is required for this provider.",
      });
    }

    if (config.provider_type !== "ordinay") {
      const supportResult = await modelCapabilityService.ensureModelSupportsTools(config);
      if (!supportResult.ok) {
        return res.json({
          ok: false,
          error: supportResult.error || "Selected model does not support tool calling.",
        });
      }
    }

    // Native SDK providers use their own test path
    if (config.provider_type === "anthropic") {
      return await testAnthropicProvider(config, res);
    }
    if (config.provider_type === "gemini") {
      return await testGeminiProvider(config, res);
    }
    if (config.provider_type === "ordinay") {
      return await testOrdinayProvider(res);
    }

    const endpoint = buildCompletionEndpoint(
      config.provider_type,
      config.base_url
    );

    const headers = { "Content-Type": "application/json" };
    if (config.api_key) {
      headers["Authorization"] = `Bearer ${config.api_key}`;
    }

    const startMs = Date.now();
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: "user", content: "respond with the word ok" }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(15000),
    });

    const latencyMs = Date.now() - startMs;

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      let errorMsg = `Provider returned HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(text);
        if (parsed.error?.message) {
          errorMsg = parsed.error.message;
        } else if (parsed.error && typeof parsed.error === "string") {
          errorMsg = parsed.error;
        }
      } catch {
        if (text.length > 0) {
          errorMsg = text.slice(0, 500);
        }
      }
      return res.json({ ok: false, error: errorMsg, latency_ms: latencyMs });
    }

    return res.json({ ok: true, latency_ms: latencyMs });
  } catch (error) {
    const cause = error.cause || error;
    let message;
    if (error.name === "TimeoutError") {
      message = "Connection timed out after 15 seconds";
    } else if (
      cause.code === "ECONNREFUSED" ||
      (error.message && error.message.includes("ECONNREFUSED"))
    ) {
      message = "Connection refused — is the server running?";
    } else if (
      cause.code === "ENOTFOUND" ||
      (error.message && error.message.includes("ENOTFOUND"))
    ) {
      message = "Host not found — check the URL";
    } else if (cause.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE") {
      message = "SSL certificate error — check the URL";
    } else if (cause?.name === "AggregateError" || error?.name === "AggregateError") {
      message =
        "Cannot connect to the provider endpoint. For Ollama, ensure it is running and use http://127.0.0.1:11434.";
    } else {
      message = cause.message || error.message || "Unknown error";
    }
    return res.json({ ok: false, error: message });
  }
});

async function testAnthropicProvider(config, res) {
  const startMs = Date.now();
  try {
    const AnthropicModule = require("@anthropic-ai/sdk");
    const AnthropicClass = AnthropicModule.default || AnthropicModule;
    const client = new AnthropicClass({ apiKey: config.api_key });
    await client.messages.create({
      model: config.model,
      max_tokens: 10,
      messages: [{ role: "user", content: "respond with the word ok" }],
    });
    return res.json({ ok: true, latency_ms: Date.now() - startMs });
  } catch (error) {
    const latencyMs = Date.now() - startMs;
    const msg =
      error.status === 401
        ? "Invalid API key"
        : error.status === 404
          ? "Model not found — check the model name"
          : error.message || "Anthropic API error";
    return res.json({ ok: false, error: msg, latency_ms: latencyMs });
  }
}

async function testGeminiProvider(config, res) {
  const startMs = Date.now();
  try {
    const { GoogleGenerativeAI } = require("@google/generative-ai");
    const genAI = new GoogleGenerativeAI(config.api_key);
    const model = genAI.getGenerativeModel({ model: config.model });
    await model.generateContent({
      contents: [{ role: "user", parts: [{ text: "respond with the word ok" }] }],
      generationConfig: { maxOutputTokens: 10 },
    });
    return res.json({ ok: true, latency_ms: Date.now() - startMs });
  } catch (error) {
    const latencyMs = Date.now() - startMs;
    const msg = error.message || "Gemini API error";
    return res.json({ ok: false, error: msg, latency_ms: latencyMs });
  }
}

async function testOrdinayProvider(res) {
  const startMs = Date.now();
  try {
    const cached = aiProviderService.getCachedAgentToken();
    if (!cached || !cached.token) {
      return res.json({ ok: false, error: "No agent token cached. Authenticate with your license first." });
    }
    if (cached.expired) {
      return res.json({ ok: false, error: "Agent token expired. Re-authenticate from Settings." });
    }
    const proxyBase = process.env.ORDINAY_PROXY_URL || "https://api.ordinay.app";
    const response = await fetch(`${proxyBase}/health`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${cached.token}` },
      signal: AbortSignal.timeout(10000),
    });
    const latencyMs = Date.now() - startMs;
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return res.json({ ok: false, error: `Proxy returned HTTP ${response.status}: ${text.slice(0, 200)}`, latency_ms: latencyMs });
    }
    return res.json({ ok: true, latency_ms: latencyMs });
  } catch (error) {
    const latencyMs = Date.now() - startMs;
    const cause = error.cause || error;
    let message;
    if (error.name === "TimeoutError") {
      message = "Connection to Ordinay proxy timed out";
    } else if (cause.code === "ECONNREFUSED" || String(error.message || "").includes("ECONNREFUSED")) {
      message = "Cannot reach Ordinay proxy — connection refused";
    } else if (cause.code === "ENOTFOUND" || String(error.message || "").includes("ENOTFOUND")) {
      message = "Ordinay proxy host not found — check network connection";
    } else {
      message = cause.message || error.message || "Unknown error";
    }
    return res.json({ ok: false, error: message, latency_ms: latencyMs });
  }
}

function buildCompletionEndpoint(providerType, baseUrl) {
  const url = String(baseUrl || "").replace(/\/+$/, "");
  if (providerType === "ollama") {
    const normalized = ollamaService.normalizeOllamaBaseUrl(url || "http://localhost:11434");
    return `${normalized}/v1/chat/completions`;
  }
  // openai_compatible and custom: base_url already includes /v1 path typically
  return `${url}/chat/completions`;
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function buildModelListEndpoints(providerType, baseUrl) {
  const normalized = normalizeBaseUrl(baseUrl);
  if (!normalized) return [];
  if (providerType !== "openai_compatible" && providerType !== "custom") {
    return [];
  }
  if (normalized.endsWith("/v1")) {
    return [`${normalized}/models`];
  }
  return [`${normalized}/v1/models`, `${normalized}/models`];
}

function resolveOllamaBaseUrl(baseUrlQueryValue) {
  const queryBaseUrl = String(baseUrlQueryValue || "").trim();
  if (queryBaseUrl) {
    return ollamaService.normalizeOllamaBaseUrl(queryBaseUrl);
  }

  try {
    const providerConfig = aiProviderService.getProviderConfig();
    if (providerConfig && providerConfig.provider_type === "ollama") {
      const storedBaseUrl = String(providerConfig.base_url || "").trim();
      if (storedBaseUrl) {
        return ollamaService.normalizeOllamaBaseUrl(storedBaseUrl);
      }
    }
  } catch {
    // no-op
  }

  return ollamaService.normalizeOllamaBaseUrl(process.env.LLM_BASE_URL || "http://127.0.0.1:11434");
}

module.exports = router;
