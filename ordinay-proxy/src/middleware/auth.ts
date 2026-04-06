import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET, hashId } from "../config";
import type { JwtPayload } from "../types";

declare global {
  namespace Express {
    interface Request {
      auth?: {
        licenseHash: string;
        deviceHash: string;
        tier: JwtPayload["tier"];
      };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "missing_token", message: "Authorization header required" });
    return;
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    if (!decoded.lid || !decoded.did || !decoded.tier) {
      res.status(401).json({ error: "invalid_token", message: "Token payload incomplete" });
      return;
    }

    const validTiers = ["monthly", "yearly", "perpetual"];
    if (!validTiers.includes(decoded.tier)) {
      res.status(403).json({ error: "invalid_tier", message: "License tier not eligible for Ordinay AI" });
      return;
    }

    req.auth = {
      licenseHash: hashId(decoded.lid),
      deviceHash: hashId(decoded.did),
      tier: decoded.tier,
    };

    next();
  } catch (err) {
    const name = (err as Error).name;
    if (name === "TokenExpiredError") {
      res.status(401).json({ error: "token_expired", message: "Agent token expired — re-authenticate" });
      return;
    }
    res.status(401).json({ error: "invalid_token", message: "Invalid agent token" });
  }
}
