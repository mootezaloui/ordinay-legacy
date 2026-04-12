import { Router } from "express";
import type { Request, Response } from "express";
import { querySummary, purgeOldRecords } from "../analytics/store";
import crypto from "crypto";

const ADMIN_KEY = process.env.ADMIN_API_KEY || "";

const router = Router();

function secureEquals(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left, "utf8");
  const rightBuf = Buffer.from(right, "utf8");
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuf, rightBuf);
}

function requireAdminKey(req: Request, res: Response): boolean {
  if (!ADMIN_KEY) {
    res.status(503).json({ error: "admin_not_configured", message: "ADMIN_API_KEY not set" });
    return false;
  }
  const providedHeader = req.headers["x-admin-key"];
  const provided = Array.isArray(providedHeader) ? providedHeader[0] : providedHeader;
  if (!provided || !secureEquals(String(provided), ADMIN_KEY)) {
    res.status(403).json({ error: "forbidden", message: "Invalid admin key" });
    return false;
  }
  return true;
}

// GET /admin/analytics/summary?days=30
router.get("/admin/analytics/summary", (req: Request, res: Response) => {
  if (!requireAdminKey(req, res)) return;
  const days = Math.min(Math.max(parseInt(String(req.query.days ?? "30"), 10) || 30, 1), 365);
  const summary = querySummary(days);
  res.json(summary);
});

// POST /admin/analytics/purge?retention_days=90
router.post("/admin/analytics/purge", (req: Request, res: Response) => {
  if (!requireAdminKey(req, res)) return;
  const retentionDays = Math.max(parseInt(String(req.query.retention_days ?? "90"), 10) || 90, 7);
  const deleted = purgeOldRecords(retentionDays);
  res.json({ ok: true, deleted, retention_days: retentionDays });
});

export default router;
