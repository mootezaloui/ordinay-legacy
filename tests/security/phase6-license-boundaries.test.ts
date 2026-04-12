import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const LAWYER_APP_ROOT = path.resolve(__dirname, "..", "..");
const FRONTEND_ROOT = path.join(LAWYER_APP_ROOT, "frontend");

function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(LAWYER_APP_ROOT, relativePath), "utf-8");
}

describe("Phase 6 License and Client Boundary Hardening", () => {
  it("renderer no longer persists Ordinay agent token in localStorage", () => {
    const source = readFile("frontend/src/services/licenseService.ts");

    expect(source).not.toContain("ordinay_agent_token");
    expect(source).not.toContain("ordinay_agent_token_expires_at");
    expect(source).not.toMatch(
      /localStorage\.(getItem|setItem|removeItem)\([^)]*agent[^)]*token/i,
    );
  });

  it("secure token cache is exposed only through Electron IPC bridge", () => {
    const preloadSource = readFile("frontend/electron/preload.cjs");
    const typesSource = readFile("frontend/src/types/electron.d.ts");
    const mainSource = readFile("frontend/electron/main.cjs");

    expect(preloadSource).toContain("readAgentTokenCache");
    expect(preloadSource).toContain("writeAgentTokenCache");
    expect(preloadSource).toContain("clearAgentTokenCache");

    expect(typesSource).toContain("readAgentTokenCache");
    expect(typesSource).toContain("writeAgentTokenCache");
    expect(typesSource).toContain("clearAgentTokenCache");

    expect(mainSource).toContain("AGENT_TOKEN_CACHE_PATH");
    expect(mainSource).toContain("ordinay_agent_token.json");
    expect(mainSource).toContain('ipcMain.handle("read-agent-token-cache"');
    expect(mainSource).toContain('ipcMain.handle("write-agent-token-cache"');
    expect(mainSource).toContain('ipcMain.handle("clear-agent-token-cache"');
  });

  it("license state transitions remain stable after token storage hardening", async () => {
    const servicePath = path.join(FRONTEND_ROOT, "src", "services", "licenseService.ts");
    const mod = await import(pathToFileURL(servicePath).href);

    const getLicenseStateFromData = mod.getLicenseStateFromData as (
      data: {
        license_id: string;
        device_id: string;
        license_type: "monthly" | "yearly" | "perpetual";
        expires_at: string | null;
        issued_at: string;
      } | null,
    ) => string;

    const base = {
      license_id: "LIC-ORG-2026-ABCD",
      device_id: "phase6-device",
      issued_at: "2026-01-01T00:00:00.000Z",
    } as const;

    expect(getLicenseStateFromData(null)).toBe("FREE");
    expect(
      getLicenseStateFromData({
        ...base,
        license_type: "perpetual",
        expires_at: null,
      }),
    ).toBe("ACTIVE");
    expect(
      getLicenseStateFromData({
        ...base,
        license_type: "monthly",
        expires_at: "2099-12-31",
      }),
    ).toBe("ACTIVE");
    expect(
      getLicenseStateFromData({
        ...base,
        license_type: "yearly",
        expires_at: "2000-01-01",
      }),
    ).toBe("EXPIRED");
    expect(
      getLicenseStateFromData({
        ...base,
        license_type: "perpetual",
        expires_at: "2099-01-01",
      }),
    ).toBe("ERROR");
  });
});
