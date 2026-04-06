import { Router } from "express";
import type { Request, Response } from "express";
import { selectBackends, type BackendTarget } from "../providers/router";
import { recordTokenUsage } from "../middleware/quota";
import { collectAnalytics } from "../analytics/collector";

const router = Router();

router.post("/v1/chat/completions", async (req: Request, res: Response) => {
  const auth = req.auth!;
  const appVersion = String(req.headers["x-app-version"] ?? "unknown");
  const body = req.body as Record<string, unknown>;
  const backends = selectBackends(body);
  const isStream = body.stream === true;

  const startMs = Date.now();

  for (let i = 0; i < backends.length; i++) {
    const backend = backends[i];
    const isLastBackend = i === backends.length - 1;

    // Override model with this backend's configured model
    const proxiedBody = { ...body, model: backend.model };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${backend.apiKey}`,
    };

    try {
      const upstreamRes = await fetch(`${backend.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(proxiedBody),
        signal: AbortSignal.timeout(120_000),
      });

      // 5xx from upstream — try fallback if available
      if (upstreamRes.status >= 500 && !isLastBackend) {
        const errText = await upstreamRes.text().catch(() => "");
        console.warn(`[ROUTE] Backend "${backend.name}" returned ${upstreamRes.status}, trying fallback`);
        collectAnalytics({
          licenseHash: auth.licenseHash,
          deviceHash: auth.deviceHash,
          tier: auth.tier,
          appVersion,
          requestBody: body,
          responseBody: null,
          backend: backend.name,
          model: backend.model,
          latencyMs: Date.now() - startMs,
          isError: true,
          errorType: `upstream_${upstreamRes.status}_fallback`,
        });
        continue;
      }

      if (!upstreamRes.ok) {
        const errText = await upstreamRes.text().catch(() => "");
        const latencyMs = Date.now() - startMs;
        collectAnalytics({
          licenseHash: auth.licenseHash,
          deviceHash: auth.deviceHash,
          tier: auth.tier,
          appVersion,
          requestBody: body,
          responseBody: null,
          backend: backend.name,
          model: backend.model,
          latencyMs,
          isError: true,
          errorType: `upstream_${upstreamRes.status}`,
        });
        // Forward upstream status but strip any API key leak from body
        const safeErr = errText.replace(new RegExp(backend.apiKey, "g"), "***");
        res.status(upstreamRes.status >= 500 ? 502 : upstreamRes.status).json({
          error: "upstream_error",
          message: `LLM backend returned ${upstreamRes.status}`,
          detail: safeErr.slice(0, 500),
        });
        return;
      }

      if (isStream) {
        await handleStreamResponse(req, res, upstreamRes, auth, appVersion, body, backend, startMs);
      } else {
        await handleJsonResponse(req, res, upstreamRes, auth, appVersion, body, backend, startMs);
      }
      return;
    } catch (err) {
      const errMsg = (err as Error).message || "Unknown proxy error";

      // Fetch error — try fallback if available
      if (!isLastBackend) {
        console.warn(`[ROUTE] Backend "${backend.name}" fetch error: ${errMsg}, trying fallback`);
        collectAnalytics({
          licenseHash: auth.licenseHash,
          deviceHash: auth.deviceHash,
          tier: auth.tier,
          appVersion,
          requestBody: body,
          responseBody: null,
          backend: backend.name,
          model: backend.model,
          latencyMs: Date.now() - startMs,
          isError: true,
          errorType: ((err as Error).name === "TimeoutError" ? "timeout" : "fetch_error") + "_fallback",
        });
        continue;
      }

      // Last backend — return error to client
      const latencyMs = Date.now() - startMs;
      collectAnalytics({
        licenseHash: auth.licenseHash,
        deviceHash: auth.deviceHash,
        tier: auth.tier,
        appVersion,
        requestBody: body,
        responseBody: null,
        backend: backend.name,
        model: backend.model,
        latencyMs,
        isError: true,
        errorType: (err as Error).name === "TimeoutError" ? "timeout" : "fetch_error",
      });
      res.status(502).json({ error: "proxy_error", message: errMsg.slice(0, 300) });
      return;
    }
  }
});

async function handleJsonResponse(
  _req: Request,
  res: Response,
  upstreamRes: globalThis.Response,
  auth: NonNullable<Request["auth"]>,
  appVersion: string,
  requestBody: Record<string, unknown>,
  backend: BackendTarget,
  startMs: number,
): Promise<void> {
  const payload = await upstreamRes.json() as Record<string, unknown>;
  const latencyMs = Date.now() - startMs;

  const usage = payload.usage as Record<string, number> | undefined;
  const totalTokens = (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0);

  // Record quota usage
  await recordTokenUsage(auth.licenseHash, totalTokens);

  collectAnalytics({
    licenseHash: auth.licenseHash,
    deviceHash: auth.deviceHash,
    tier: auth.tier,
    appVersion,
    requestBody,
    responseBody: payload,
    backend: backend.name,
    model: backend.model,
    latencyMs,
    isError: false,
  });

  res.json(payload);
}

async function handleStreamResponse(
  req: Request,
  res: Response,
  upstreamRes: globalThis.Response,
  auth: NonNullable<Request["auth"]>,
  appVersion: string,
  requestBody: Record<string, unknown>,
  backend: BackendTarget,
  startMs: number,
): Promise<void> {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const reader = upstreamRes.body?.getReader();
  if (!reader) {
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  const decoder = new TextDecoder();
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      res.write(chunk);

      // Try to extract usage from stream chunks (some providers include it in the last chunk)
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload);
          if (parsed.usage) {
            totalPromptTokens = parsed.usage.prompt_tokens ?? totalPromptTokens;
            totalCompletionTokens = parsed.usage.completion_tokens ?? totalCompletionTokens;
          }
        } catch { /* ignore parse errors in stream */ }
      }
    }
  } catch (err) {
    console.error("[STREAM] Error reading upstream:", (err as Error).message);
  } finally {
    res.write("data: [DONE]\n\n");
    res.end();
  }

  const latencyMs = Date.now() - startMs;
  const totalTokens = totalPromptTokens + totalCompletionTokens;

  await recordTokenUsage(auth.licenseHash, totalTokens);

  collectAnalytics({
    licenseHash: auth.licenseHash,
    deviceHash: auth.deviceHash,
    tier: auth.tier,
    appVersion,
    requestBody,
    responseBody: null,
    backend: backend.name,
    model: backend.model,
    latencyMs,
    isError: false,
  });
}

export default router;
