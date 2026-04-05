const express = require("express");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, spawn } = require("child_process");
const aiProviderService = require("../services/aiProvider.service");

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
  const isLocalEndpoint = isLocalOllamaHost(baseUrl);
  const installedProbe = probeOllamaInstallation();
  const runningProbe = await probeOllamaRuntime(baseUrl);

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
router.post("/ai-provider/ollama/start", async (_req, res) => {
  try {
    const result = startOllamaRuntime();
    if (!result.ok) {
      if (result.not_installed) {
        return res.status(400).json({
          ok: false,
          error: result.error || "Ollama app was not found on this machine",
        });
      }
      return res.status(400).json({
        ok: false,
        error: result.error || "Unable to launch Ollama",
      });
    }

    return res.json({
      ok: true,
      launched: result.launched,
      message: "Ollama start command launched successfully",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error?.message || String(error || "Unknown start error"),
    });
  }
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

function buildCompletionEndpoint(providerType, baseUrl) {
  const url = String(baseUrl || "").replace(/\/+$/, "");
  if (providerType === "ollama") {
    const normalized = normalizeOllamaBaseUrl(url || "http://localhost:11434");
    return `${normalized}/v1/chat/completions`;
  }
  // openai_compatible and custom: base_url already includes /v1 path typically
  return `${url}/chat/completions`;
}

function resolveOllamaBaseUrl(baseUrlQueryValue) {
  const queryBaseUrl = String(baseUrlQueryValue || "").trim();
  if (queryBaseUrl) {
    return normalizeOllamaBaseUrl(queryBaseUrl);
  }

  try {
    const providerConfig = aiProviderService.getProviderConfig();
    if (providerConfig && providerConfig.provider_type === "ollama") {
      const storedBaseUrl = String(providerConfig.base_url || "").trim();
      if (storedBaseUrl) {
        return normalizeOllamaBaseUrl(storedBaseUrl);
      }
    }
  } catch {
    // no-op
  }

  return normalizeOllamaBaseUrl(process.env.LLM_BASE_URL || "http://127.0.0.1:11434");
}

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeOllamaBaseUrl(value) {
  return normalizeBaseUrl(value).replace(/\/v1$/i, "");
}

function isLocalOllamaHost(baseUrl) {
  const normalized = normalizeOllamaBaseUrl(baseUrl);
  try {
    const parsed = new URL(normalized);
    const host = String(parsed.hostname || "").trim().toLowerCase();
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "[::1]"
    );
  } catch {
    return (
      normalized.includes("localhost") ||
      normalized.includes("127.0.0.1") ||
      normalized.includes("::1")
    );
  }
}

function getOllamaExecutableCandidates() {
  const candidates = [];
  const homeDir = os.homedir();
  const localAppData = process.env.LOCALAPPDATA || "";
  const programFiles = process.env.ProgramFiles || "";

  if (process.platform === "win32") {
    if (localAppData) {
      candidates.push(path.join(localAppData, "Programs", "Ollama", "Ollama.exe"));
    }
    if (homeDir) {
      candidates.push(
        path.join(homeDir, "AppData", "Local", "Programs", "Ollama", "Ollama.exe")
      );
    }
    if (programFiles) {
      candidates.push(path.join(programFiles, "Ollama", "Ollama.exe"));
    }
  } else if (process.platform === "darwin") {
    candidates.push("/Applications/Ollama.app/Contents/MacOS/Ollama");
  } else {
    candidates.push("/usr/bin/ollama", "/usr/local/bin/ollama");
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

function probeOllamaInstallation() {
  try {
    const diskCandidate = getOllamaExecutableCandidates().find((candidate) =>
      fs.existsSync(candidate)
    );

    const probe = spawnSync("ollama", ["--version"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 4000,
    });

    if (probe.error) {
      if (diskCandidate) {
        return { installed: true, executable_path: diskCandidate };
      }
      return {
        installed: false,
        error: probe.error.message || String(probe.error),
      };
    }

    if (probe.status === 0) {
      return { installed: true, executable_path: "ollama" };
    }

    if (diskCandidate) {
      return { installed: true, executable_path: diskCandidate };
    }

    const stderr = String(probe.stderr || probe.stdout || "").trim();
    return {
      installed: false,
      error: stderr || `ollama --version exited with code ${String(probe.status)}`,
    };
  } catch (error) {
    return {
      installed: false,
      error: error?.message || String(error || "Unknown error"),
    };
  }
}

async function probeOllamaRuntime(baseUrl) {
  const endpoint = `${normalizeOllamaBaseUrl(baseUrl)}/api/tags`;
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: AbortSignal.timeout(4000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      if (response.status === 404) {
        const openAiProbe = await probeOpenAiCompatibleEndpoint(baseUrl);
        if (openAiProbe.reachable) {
          return {
            running: false,
            status: "api_mismatch",
            models: [],
            error:
              "Endpoint is reachable but does not expose Ollama API. It looks like a non-Ollama server.",
          };
        }
      }
      return {
        running: false,
        status: "not_running",
        models: [],
        error:
          body && body.length < 250
            ? body
            : `Ollama endpoint returned HTTP ${response.status}`,
      };
    }

    const payload = await response.json().catch(() => ({}));
    const models = Array.isArray(payload?.models) ? payload.models : [];
    const names = models
      .map((entry) => String(entry?.name || entry?.model || "").trim())
      .filter(Boolean);

    return {
      running: true,
      status: names.length > 0 ? "ready" : "running_no_models",
      models: names,
    };
  } catch (error) {
    const cause = error?.cause || error;
    if (
      cause?.code === "ECONNREFUSED" ||
      String(error?.message || "").includes("ECONNREFUSED")
    ) {
      return {
        running: false,
        status: "not_running",
        models: [],
        error: "Connection refused. Ollama is not running.",
      };
    }
    if (
      cause?.code === "ENOTFOUND" ||
      String(error?.message || "").includes("ENOTFOUND")
    ) {
      return {
        running: false,
        status: "not_running",
        models: [],
        error: "Host not found. Check Ollama URL.",
      };
    }
    if (error?.name === "TimeoutError") {
      return {
        running: false,
        status: "not_running",
        models: [],
        error: "Connection timed out while contacting Ollama.",
      };
    }
    return {
      running: false,
      status: "not_running",
      models: [],
      error: error?.message || String(error || "Unknown runtime error"),
    };
  }
}

async function probeOpenAiCompatibleEndpoint(baseUrl) {
  const endpoint = `${normalizeOllamaBaseUrl(baseUrl)}/v1/models`;
  try {
    const response = await fetch(endpoint, {
      method: "GET",
      signal: AbortSignal.timeout(2500),
    });
    if (!response.ok) {
      return { reachable: false };
    }
    return { reachable: true };
  } catch {
    return { reachable: false };
  }
}

function startOllamaRuntime() {
  const installedProbe = probeOllamaInstallation();
  const attempts = [];

  if (installedProbe.executable_path && installedProbe.executable_path !== "ollama") {
    attempts.push(
      { command: installedProbe.executable_path, args: [], launched: "desktop" },
      { command: installedProbe.executable_path, args: ["app"], launched: "app" },
      { command: installedProbe.executable_path, args: ["serve"], launched: "serve" }
    );
  } else {
    attempts.push(
      { command: "ollama", args: ["app"], launched: "app" },
      { command: "ollama", args: ["serve"], launched: "serve" }
    );
  }

  let lastError = null;
  for (const attempt of attempts) {
    try {
      const child = spawn(attempt.command, attempt.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.unref();
      return { ok: true, launched: attempt.launched };
    } catch (error) {
      lastError = error?.message || String(error || "Unknown spawn error");
    }
  }

  if (!installedProbe.installed) {
    return {
      ok: false,
      not_installed: true,
      error:
        installedProbe.error ||
        "Ollama app was not found. Install Ollama first, then try again.",
    };
  }

  return {
    ok: false,
    error: lastError || "Failed to launch ollama command",
  };
}

module.exports = router;
