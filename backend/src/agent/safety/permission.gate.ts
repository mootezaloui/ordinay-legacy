import { ToolCategory, type ToolDefinition } from "../tools";

export interface PermissionDecision {
  allowed: boolean;
  reason?: string;
  requiresConfirmation: boolean;
}

interface PermissionContext {
  authScope?: string;
  // Legacy compatibility only; ignored when authScope is present.
  mode?: string;
}

type AuthScope = "unknown" | "read" | "draft" | "execute" | "admin";
type RuntimeMode = "READ_ONLY" | "DRAFT" | "EXECUTE" | "AUTONOMOUS";

const LEGACY_MODE_SCOPE: Record<RuntimeMode, AuthScope> = {
  READ_ONLY: "read",
  DRAFT: "draft",
  EXECUTE: "execute",
  AUTONOMOUS: "execute",
};

const SCOPE_ALLOWED_CATEGORIES: Record<AuthScope, Set<ToolCategory>> = {
  unknown: new Set([
    ToolCategory.READ,
    ToolCategory.EXTERNAL,
    ToolCategory.DRAFT,
    ToolCategory.PLAN,
    ToolCategory.SYSTEM,
  ]),
  read: new Set([ToolCategory.READ, ToolCategory.EXTERNAL]),
  draft: new Set([
    ToolCategory.READ,
    ToolCategory.EXTERNAL,
    ToolCategory.DRAFT,
    ToolCategory.SYSTEM,
  ]),
  execute: new Set([
    ToolCategory.READ,
    ToolCategory.EXTERNAL,
    ToolCategory.DRAFT,
    ToolCategory.PLAN,
    ToolCategory.WRITE,
    ToolCategory.EXECUTE,
    ToolCategory.SYSTEM,
  ]),
  admin: new Set([
    ToolCategory.READ,
    ToolCategory.EXTERNAL,
    ToolCategory.DRAFT,
    ToolCategory.PLAN,
    ToolCategory.WRITE,
    ToolCategory.EXECUTE,
    ToolCategory.SYSTEM,
  ]),
};

export class PermissionGate {
  evaluate(
    scopeOrContext: string | PermissionContext | undefined,
    tool: ToolDefinition,
  ): PermissionDecision {
    const scope = this.resolveScope(scopeOrContext);
    if (!scope) {
      return this.deny("unknown", tool, "Unknown auth scope");
    }

    const allowedCategories = SCOPE_ALLOWED_CATEGORIES[scope];
    if (!allowedCategories) {
      return this.deny(scope, tool, "Unknown auth scope");
    }

    if (!allowedCategories.has(tool.category)) {
      return this.deny(
        scope,
        tool,
        `Tool category "${tool.category}" is blocked for scope "${scope}"`,
      );
    }

    const requiresConfirmation =
      tool.category === ToolCategory.WRITE || tool.category === ToolCategory.EXECUTE;
    return {
      allowed: true,
      requiresConfirmation,
    };
  }

  private resolveScope(value: string | PermissionContext | undefined): AuthScope | null {
    if (typeof value === "string") {
      return this.normalizeScope(value) ?? this.mapLegacyModeToScope(value);
    }
    const row = isRecord(value) ? value : null;
    if (!row) {
      return "unknown";
    }

    const fromScope = this.normalizeScope(row.authScope);
    if (fromScope) {
      return fromScope;
    }
    const fromMode = this.mapLegacyModeToScope(row.mode);
    if (fromMode) {
      return fromMode;
    }
    return "unknown";
  }

  private mapLegacyModeToScope(mode: unknown): AuthScope | null {
    const normalized = String(mode || "").trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(LEGACY_MODE_SCOPE, normalized)) {
      return LEGACY_MODE_SCOPE[normalized as RuntimeMode];
    }
    return null;
  }

  private normalizeScope(scope: unknown): AuthScope | null {
    const normalized = String(scope || "").trim().toLowerCase();
    if (
      normalized === "unknown" ||
      normalized === "read" ||
      normalized === "draft" ||
      normalized === "execute" ||
      normalized === "admin"
    ) {
      return normalized;
    }

    switch (normalized) {
      case "reader":
      case "readonly":
      case "read_only":
        return "read";
      case "writer":
      case "editor":
      case "guided":
        return "draft";
      case "operator":
        return "execute";
      default:
        return null;
    }
  }

  private deny(scope: string, tool: ToolDefinition, reason: string): PermissionDecision {
    return {
      allowed: false,
      requiresConfirmation: false,
      reason: `${reason}. Tool "${tool.name}" (${tool.category}) is blocked for scope "${scope}".`,
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
