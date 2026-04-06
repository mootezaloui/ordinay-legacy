import { Router } from "express";
import { getAllBackends } from "../providers/router";

const router = Router();

router.get("/health", async (_req, res) => {
  const backends = getAllBackends();

  const statuses = await Promise.all(
    backends.map(async (b) => {
      try {
        const probe = await fetch(`${b.baseUrl}/models`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        return {
          name: b.name,
          model: b.model,
          status: probe.ok ? "reachable" as const : "unreachable" as const,
          error: probe.ok ? null : `HTTP ${probe.status}`,
        };
      } catch (err) {
        return {
          name: b.name,
          model: b.model,
          status: "unreachable" as const,
          error: (err as Error).message?.slice(0, 200) ?? "unreachable",
        };
      }
    })
  );

  const allReachable = statuses.every((s) => s.status === "reachable");
  const anyReachable = statuses.some((s) => s.status === "reachable");

  res.json({
    status: allReachable ? "ok" : anyReachable ? "degraded" : "down",
    proxy: "running",
    backends: statuses,
    timestamp: new Date().toISOString(),
  });
});

export default router;
