"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentV2Runtime = createAgentV2Runtime;
const node_path_1 = __importDefault(require("node:path"));
const engine_1 = require("../engine");
const llm_1 = require("../llm");
const safety_1 = require("../safety");
const session_1 = require("../session");
const tools_1 = require("../tools");
function createAgentV2Runtime() {
    const deploymentSettings = loadDeploymentSettings();
    const llmProvider = (0, llm_1.createNativeLLMProvider)();
    const repository = loadPersistenceRepository();
    const performance = loadPerformanceRuntime(deploymentSettings?.performancePolicy);
    const retrievalRuntime = loadRetrievalRuntime(deploymentSettings?.retrievalPolicy);
    const grounding = loadGroundingRuntime();
    const ux = loadUxRuntime();
    const observability = loadObservabilityRuntime(deploymentSettings?.observabilityPolicy);
    const security = loadSecurityRuntime(deploymentSettings?.securityRateLimiterConfig);
    const operations = loadOperationsRuntime({
        config: deploymentSettings?.deploymentConfig,
        flags: deploymentSettings?.deploymentFlags,
        repository,
        runtime: undefined,
        policyOverrides: deploymentSettings?.operationsPolicy,
    });
    const memory = loadMemoryRuntime(llmProvider, retrievalRuntime, grounding, performance, operations, deploymentSettings?.memoryPolicy);
    const sessionStore = new session_1.InMemorySessionStore(repository, {
        maxSessions: asPositiveInt(performance?.policy?.SESSION_CACHE_MAX, 200),
        evictAfterTouches: asPositiveInt(performance?.policy?.CACHE_EVICT_AFTER_TURNS, 120),
    });
    const permissionGate = new safety_1.PermissionGate();
    const loopGuard = new safety_1.LoopGuard({
        timeoutMs: asPositiveInt(process.env.AGENT_LOOP_GUARD_TIMEOUT_MS, 90_000),
    });
    const executor = new engine_1.ToolExecutor(permissionGate);
    const classifier = new engine_1.TurnClassifier();
    const pending = new engine_1.PendingManager();
    const registry = new tools_1.ToolRegistry();
    (0, tools_1.bootstrapTools)(registry, loadWave1ReadTools());
    const loop = new engine_1.AgenticLoop(llmProvider, registry, executor, classifier, pending, permissionGate, loopGuard, repository, memory);
    const runtime = {
        sessionStore,
        loop,
        grounding,
        retrieval: retrievalRuntime,
        ux,
        performance,
        observability,
        repository,
        security,
        operations: undefined,
    };
    if (operations) {
        runtime.operations = operations;
        if (typeof operations.attachRuntime === "function") {
            operations.attachRuntime(runtime);
        }
    }
    const loopWithHooks = loop;
    if (observability && typeof observability === "object") {
        loopWithHooks.__observability = observability;
    }
    if (security && typeof security === "object") {
        loopWithHooks.__security = security;
    }
    if (operations && typeof operations === "object") {
        loopWithHooks.__operations = operations;
    }
    registerPerformanceProviders({
        performance,
        sessionStore,
        retrievalRuntime,
        memory,
    });
    return runtime;
}
function loadWave1ReadTools() {
    const readToolsModule = loadOptionalAgentModule("tools", "tools/read");
    if (!readToolsModule) {
        throw new Error("Agent v2 read tool module not found.");
    }
    const listedRaw = typeof readToolsModule.getReadTools === "function"
        ? readToolsModule.getReadTools()
        : Array.isArray(readToolsModule.tools)
            ? readToolsModule.tools
            : [];
    if (!Array.isArray(listedRaw) || listedRaw.length === 0) {
        throw new Error("Agent v2 read tool module did not provide tools.");
    }
    return listedRaw
        .filter((tool) => isV2SafeTool(tool))
        .map((tool) => (0, tools_1.adaptLegacyTool)(tool));
}
function loadPersistenceRepository() {
    const persistence = loadOptionalAgentModule("persistence", "persistence");
    if (!persistence) {
        return undefined;
    }
    if (typeof persistence.createSQLiteClient !== "function" ||
        typeof persistence.createSessionRepository !== "function") {
        console.warn("[agent.persistence] Persistence module loaded without required factories.");
        return undefined;
    }
    try {
        const client = persistence.createSQLiteClient();
        return persistence.createSessionRepository(client);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.persistence] Persistence unavailable in runtime: ${message}`);
        return undefined;
    }
}
function loadRetrievalRuntime(policyOverrides) {
    const retrievalModule = loadOptionalAgentModule("retrieval", "retrieval");
    if (!retrievalModule || typeof retrievalModule.createRetrievalRuntime !== "function") {
        return undefined;
    }
    try {
        return retrievalModule.createRetrievalRuntime({ policyOverrides });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.retrieval] Retrieval runtime unavailable: ${message}`);
        return undefined;
    }
}
function loadGroundingRuntime() {
    const groundingModule = loadOptionalAgentModule("grounding", "grounding");
    if (!groundingModule || typeof groundingModule.createGroundingRuntime !== "function") {
        return undefined;
    }
    try {
        return groundingModule.createGroundingRuntime();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.grounding] Grounding runtime unavailable: ${message}`);
        return undefined;
    }
}
function loadUxRuntime() {
    const uxModule = loadOptionalAgentModule("ux", "ux");
    if (!uxModule || typeof uxModule.createUxRuntime !== "function") {
        return undefined;
    }
    try {
        return uxModule.createUxRuntime();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.ux] UX runtime unavailable: ${message}`);
        return undefined;
    }
}
function loadMemoryRuntime(llmProvider, retrievalRuntime, groundingRuntime, performanceRuntime, operationsRuntime, policyOverrides) {
    const memoryModule = loadOptionalAgentModule("memory", "memory");
    if (!memoryModule || typeof memoryModule.createMemoryRuntime !== "function") {
        return undefined;
    }
    try {
        return memoryModule.createMemoryRuntime({
            llmProvider,
            policyOverrides,
            retrievalRuntime,
            groundingRuntime,
            performanceRuntime,
            operationsRuntime,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.memory] Memory runtime unavailable: ${message}`);
        return undefined;
    }
}
function loadPerformanceRuntime(policyOverrides) {
    const performanceModule = loadOptionalAgentModule("performance", "performance");
    if (!performanceModule || typeof performanceModule.createPerformanceRuntime !== "function") {
        return undefined;
    }
    try {
        return performanceModule.createPerformanceRuntime({ policyOverrides });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.performance] Performance runtime unavailable: ${message}`);
        return undefined;
    }
}
function loadObservabilityRuntime(policyOverrides) {
    const observabilityModule = loadOptionalAgentModule("observability", "observability");
    if (!observabilityModule || typeof observabilityModule.createObservabilityRuntime !== "function") {
        return undefined;
    }
    try {
        return observabilityModule.createObservabilityRuntime({ policyOverrides });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.observability] Observability runtime unavailable: ${message}`);
        return undefined;
    }
}
function loadSecurityRuntime(rateLimiterConfig) {
    const securityModule = loadOptionalAgentModule("security", "security");
    if (!securityModule || typeof securityModule.createSecurityRuntime !== "function") {
        return undefined;
    }
    try {
        return securityModule.createSecurityRuntime({ rateLimiterConfig });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.security] Security runtime unavailable: ${message}`);
        return undefined;
    }
}
function loadOperationsRuntime({ config, flags, repository, runtime, policyOverrides, }) {
    const operationsModule = loadOptionalAgentModule("operations", "operations");
    if (!operationsModule || typeof operationsModule.createOperationsRuntime !== "function") {
        return undefined;
    }
    try {
        return operationsModule.createOperationsRuntime({
            config,
            flags,
            repository,
            runtime,
            policyOverrides,
        });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.operations] Operations runtime unavailable: ${message}`);
        return undefined;
    }
}
function registerPerformanceProviders({ performance, sessionStore, retrievalRuntime, memory, }) {
    if (!performance || typeof performance.registerCacheProvider !== "function") {
        return;
    }
    safeRegister(performance, "sessionCache", () => sessionStore.getCacheStats());
    safeRegister(performance, "retrievalIndex", () => (retrievalRuntime && typeof retrievalRuntime.getCacheStats === "function"
        ? retrievalRuntime.getCacheStats()
        : typeof retrievalRuntime?.getIndexStats === "function"
            ? retrievalRuntime.getIndexStats()
            : {}));
    safeRegister(performance, "memoryContext", () => getOptionalCacheStats(memory?.contextAssembler));
    safeRegister(performance, "memorySummary", () => getOptionalCacheStats(memory?.summarizer));
}
function safeRegister(performance, name, statsProvider) {
    if (typeof performance.registerCacheProvider !== "function") {
        return;
    }
    try {
        performance.registerCacheProvider(name, statsProvider);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.performance] Failed to register cache provider "${name}": ${message}`);
    }
}
function loadOptionalAgentModule(logLabel, moduleName) {
    const resolvedPath = resolveAgentModulePath(moduleName);
    if (!resolvedPath) {
        if (logLabel === "retrieval") {
            console.warn("[agent.retrieval] Retrieval module not found. Continuing with retrieval disabled.");
        }
        else {
            console.warn(`[agent.${logLabel}] Module not found in runtime candidates.`);
        }
        return undefined;
    }
    try {
        return require(resolvedPath);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.${logLabel}] Failed to load module from "${resolvedPath}": ${message}`);
        return undefined;
    }
}
function resolveAgentModulePath(moduleName) {
    const candidates = buildAgentModuleCandidates(moduleName);
    for (const candidate of candidates) {
        try {
            return require.resolve(candidate);
        }
        catch {
            continue;
        }
    }
    return null;
}
function loadDeploymentSettings() {
    const deploymentModule = loadOptionalAgentModule("deployment", "deployment");
    if (!deploymentModule) {
        return undefined;
    }
    try {
        const state = deploymentModule.getDeploymentState?.() ?? null;
        const config = toRecord(state?.config) ??
            toRecord(deploymentModule.getAgentConfig?.(process.env, {
                cwd: node_path_1.default.resolve(__dirname, "../../.."),
            }));
        if (!config) {
            return undefined;
        }
        const flags = toRecord(state?.flags) ??
            toRecord(deploymentModule.getFeatureFlags?.(process.env)) ??
            {};
        return mapDeploymentSettings(config, flags);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.deployment] Runtime deployment settings unavailable: ${message}`);
        return undefined;
    }
}
function mapDeploymentSettings(config, flags = {}) {
    const policy = toRecord(config.policy) ?? {};
    const memory = toRecord(policy.memory) ?? {};
    const retrieval = toRecord(policy.retrieval) ?? {};
    const security = toRecord(policy.security) ?? {};
    const observability = toRecord(policy.observability) ?? {};
    const operations = toRecord(policy.operations) ?? {};
    return {
        deploymentConfig: config,
        deploymentFlags: flags,
        retrievalPolicy: {
            RETRIEVAL_ENABLED: Boolean(retrieval.enabled),
            RETRIEVAL_TOP_K: asPositiveInt(retrieval.topK, 6),
            RETRIEVAL_MAX_CHARS: asPositiveInt(retrieval.maxChars, 1400),
            RETRIEVAL_MIN_SCORE: normalizeFloat(retrieval.minScore, 0.1),
            RETRIEVAL_MAX_CHUNKS_PER_DOC: asPositiveInt(retrieval.maxChunksPerDoc, 2),
            RETRIEVAL_CHUNK_SIZE: asPositiveInt(retrieval.chunkSize, 700),
            RETRIEVAL_CHUNK_OVERLAP: asPositiveInt(retrieval.chunkOverlap, 140),
            RETRIEVAL_CACHE_MAX_SESSIONS: asPositiveInt(retrieval.cacheMaxSessions, 120),
            RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: asPositiveInt(retrieval.cacheMaxDocsPerSession, 80),
        },
        memoryPolicy: {
            SUMMARY_TRIGGER_TURNS: asPositiveInt(memory.summaryTriggerTurns, 24),
            SUMMARY_MAX_TOKENS: asPositiveInt(memory.summaryMaxTokens, 3500),
            SUMMARY_CACHE_MAX: asPositiveInt(memory.summaryCacheMax, 256),
            CACHE_EVICT_AFTER_TURNS: asPositiveInt(memory.cacheEvictAfterTurns, 120),
            MEMORY_WARNING_HEAP_MB: asPositiveInt(memory.memoryWarningHeapMb, 768),
        },
        performancePolicy: {
            SESSION_CACHE_MAX: asPositiveInt(memory.sessionCacheMax, 200),
            SUMMARY_CACHE_MAX: asPositiveInt(memory.summaryCacheMax, 256),
            CACHE_EVICT_AFTER_TURNS: asPositiveInt(memory.cacheEvictAfterTurns, 120),
            MEMORY_WARNING_HEAP_MB: asPositiveInt(memory.memoryWarningHeapMb, 768),
            RETRIEVAL_CACHE_MAX_SESSIONS: asPositiveInt(retrieval.cacheMaxSessions, 120),
            RETRIEVAL_CACHE_MAX_DOCS_PER_SESSION: asPositiveInt(retrieval.cacheMaxDocsPerSession, 80),
            PERFORMANCE_SNAPSHOT_EVERY_N_TURNS: asPositiveInt(observability.performanceSnapshotEveryNTurns, 100),
        },
        observabilityPolicy: {
            HEALTH_SNAPSHOT_EVERY_N_TURNS: asPositiveInt(observability.healthSnapshotEveryNTurns, 25),
        },
        operationsPolicy: {
            safeMode: toRecord(operations.safeMode) ?? {},
            debugFlags: toRecord(operations.debugFlags) ?? {},
            auditMaxLimit: asPositiveInt(operations.auditMaxLimit, 100),
        },
        securityRateLimiterConfig: {
            limit: asPositiveInt(security.rateLimitRequests, 30),
            windowMs: asPositiveInt(security.rateLimitWindowMs, 60000),
        },
    };
}
function buildAgentModuleCandidates(moduleName) {
    const normalized = moduleName.replace(/[\\/]+/g, "/").replace(/^\/+|\/+$/g, "");
    const candidates = [
        node_path_1.default.resolve(__dirname, `../${normalized}`),
        node_path_1.default.resolve(__dirname, `../../../src/agent/${normalized}`),
        node_path_1.default.resolve(process.cwd(), `.agent-build/agent/${normalized}`),
        node_path_1.default.resolve(process.cwd(), `src/agent/${normalized}`),
        node_path_1.default.resolve(process.cwd(), `backend/.agent-build/agent/${normalized}`),
        node_path_1.default.resolve(process.cwd(), `backend/src/agent/${normalized}`),
    ];
    return [...new Set(candidates)];
}
function isV2SafeTool(tool) {
    const row = toRecord(tool);
    if (!row || !asNonEmptyString(row.name)) {
        return false;
    }
    if (!Array.isArray(row.allowedAgentVersions)) {
        return true;
    }
    const allowed = row.allowedAgentVersions
        .map((value) => String(value).trim().toLowerCase())
        .filter(Boolean);
    return allowed.includes("v2");
}
function asString(value) {
    return typeof value === "string" ? value : null;
}
function asNonEmptyString(value) {
    const text = asString(value)?.trim();
    return text || null;
}
function toRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
    }
    return value;
}
function asPositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function normalizeFloat(value, fallback) {
    const parsed = Number.parseFloat(String(value ?? fallback));
    return Number.isFinite(parsed) ? parsed : fallback;
}
function getOptionalCacheStats(value) {
    if (typeof value !== "object" || value === null) {
        return {};
    }
    const row = value;
    if (typeof row.getCacheStats !== "function") {
        return {};
    }
    try {
        return row.getCacheStats();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error || "unknown error");
        console.warn(`[agent.performance] Failed reading cache stats: ${message}`);
        return {};
    }
}
