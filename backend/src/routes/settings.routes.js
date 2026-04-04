const express = require("express");
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
    return `${url || "http://localhost:11434"}/v1/chat/completions`;
  }
  // openai_compatible and custom: base_url already includes /v1 path typically
  return `${url}/chat/completions`;
}

module.exports = router;
