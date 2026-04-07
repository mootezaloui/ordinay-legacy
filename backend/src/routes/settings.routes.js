const express = require("express");
const aiProviderService = require("../services/aiProvider.service");
const ollamaService = require("../services/ollama.service");

const router = express.Router();

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

// PUT /api/settings/ai-provider
router.put("/ai-provider", (req, res, next) => {
  try {
    const { provider_type, base_url, api_key, model } = req.body || {};
    aiProviderService.saveProviderConfig({
      provider_type,
      base_url,
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
        base_url: body.base_url || "",
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
    }

    if (!config) {
      return res.json({
        ok: false,
        error: "No AI provider configured. Save a configuration first.",
      });
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
        if (text.length > 0 && text.length < 200) {
          errorMsg = text;
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
