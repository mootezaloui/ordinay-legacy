import path from "node:path";
import {
  AgenticLoop,
  PendingManager,
  ToolExecutor,
  TurnClassifier,
  type AgentMemoryServices,
} from "../engine";
import {
  createNativeLLMProvider,
  resolveProvider,
  type ILLMProvider,
} from "../llm";
import { LoopGuard, PermissionGate } from "../safety";
import { InMemorySessionStore, type SessionPersistenceBridge } from "../session";
import { ToolRegistry, adaptLegacyTool, bootstrapTools, type ToolDefinition } from "../tools";

interface ReadToolsModuleLike {
  getReadTools?: () => unknown[];
  tools?: unknown[];
}

interface PersistenceModuleLike {
  createSQLiteClient?: () => unknown;
  createSessionRepository?: (sqliteClient: unknown) => SessionPersistenceBridge;
}

interface RetrievalRuntimeLike {
  isEnabled?: () => boolean;
  getStatus?: () => { enabled: boolean; disabledReason?: string };
  indexSessionArtifacts?: (session: unknown) => unknown;
  indexTurnArtifacts?: (session: unknown, turn: unknown) => unknown;
  buildRetrievalContext?: (params: { session: unknown; input: unknown }) => unknown;
  getIndexStats?: () => Record<string, unknown>;
  getCacheStats?: () => Record<string, unknown>;
}

interface RetrievalModuleLike {
  createRetrievalRuntime?: (params?: {
    policyOverrides?: Record<string, unknown>;
  }) => RetrievalRuntimeLike;
}

interface GroundingRuntimeLike {
  beginTurn?: (turnId: string) => unknown;
  registerRetrievalMatches?: (params: {
    turnId: string;
    matches: unknown[];
  }) => string[];
  registerToolOutputs?: (params: {
    turnId: string;
    toolCalls: unknown[];
  }) => string[];
  registerSummary?: (params: {
    turnId: string;
    sessionId: string;
    summary: string;
  }) => string[];
  wrapContext?: (params: {
    retrievalText?: string;
    retrievalSourceIds?: string[];
    toolDataText?: string;
    toolSourceIds?: string[];
    inferenceText?: string;
  }) => { text?: string; sectionSourceIds?: Record<string, string[]> };
  attachSectionSourceIds?: (turnId: string, sectionSourceIds: Record<string, string[]>) => unknown;
  getTurnSources?: (turnId: string) => Array<Record<string, unknown>>;
  getTurnSectionSourceIds?: (turnId: string) => Record<string, string[]>;
  buildCitations?: (params: {
    sources: Array<Record<string, unknown>>;
    mode: string;
  }) => { mode: string; entries: unknown[]; markers?: Record<string, string>; text: string };
  isResearchMode?: (input: unknown) => boolean;
  resolveCitationMode?: (input: unknown) => string;
  resolveShowCitations?: (input: unknown) => boolean;
  shouldAppendCitations?: (params: { researchMode: boolean; showCitations: boolean }) => boolean;
  computeLowSourceDensity?: (sources: unknown[]) => boolean;
  shouldShowLowSourceDisclaimer?: (params: {
    lowSourceDensity: boolean;
    researchMode: boolean;
    showCitations: boolean;
  }) => boolean;
  getLowSourceDensityDisclaimer?: () => string;
}

interface GroundingModuleLike {
  createGroundingRuntime?: (params?: {
    policyOverrides?: Record<string, unknown>;
  }) => GroundingRuntimeLike;
}

interface MemoryModuleLike {
  createMemoryRuntime?: (params: {
    llmProvider: ILLMProvider;
    policyOverrides?: Record<string, unknown>;
    retrievalRuntime?: RetrievalRuntimeLike;
    groundingRuntime?: GroundingRuntimeLike;
    performanceRuntime?: PerformanceRuntimeLike;
    operationsRuntime?: OperationsRuntimeLike;
  }) => AgentMemoryServices;
}

interface PerformanceRuntimeLike {
  policy?: Record<string, unknown>;
  registerCacheProvider?: (name: string, provider: unknown) => boolean;
  createCache?: (name: string, max?: number) => unknown;
  getCacheStats?: () => Record<string, unknown>;
  getMemoryStats?: () => Record<string, unknown>;
  maybeTrimCaches?: () => Record<string, unknown>;
  recordTurnAndMaybeSnapshot?: (params: {
    metrics?: Record<string, unknown>;
    latency?: unknown;
    activeStats?: Record<string, unknown>;
  }) => Record<string, unknown> | null;
}

interface PerformanceModuleLike {
  createPerformanceRuntime?: (params?: {
    policyOverrides?: Record<string, unknown>;
  }) => PerformanceRuntimeLike;
}

interface ObservabilityRuntimeLike {
  policy?: Record<string, unknown>;
  createLatencyTracker?: () => unknown;
  classifyFailure?: (errorOrResult: unknown, context?: Record<string, unknown>) => unknown;
  recordTool?: (metricData: Record<string, unknown>) => void;
  recordTurn?: (metricData: Record<string, unknown>) => void;
  buildTurnTrace?: (traceInput: Record<string, unknown>) => unknown;
  snapshotMetrics?: () => Record<string, unknown>;
  maybeBuildHealthSnapshot?: () => Record<string, unknown> | null;
}

interface ObservabilityModuleLike {
  createObservabilityRuntime?: (params?: {
    policyOverrides?: Record<string, unknown>;
  }) => ObservabilityRuntimeLike;
}

interface SecurityRuntimeLike {
  sanitizeAgentInput?: (rawInput: unknown) => unknown;
  resolveRateLimitKey?: (context?: Record<string, unknown>) => string;
  checkRateLimit?: (context?: Record<string, unknown>) => Record<string, unknown>;
  evaluateAuthScope?: (params?: Record<string, unknown>) => Record<string, unknown>;
  validatePermissionBoundary?: (params?: Record<string, unknown>) => Record<string, unknown>;
  hashAuditPayload?: (record: Record<string, unknown>) => string;
  buildAuditIntegrityEnvelope?: (record: Record<string, unknown>) => Record<string, unknown>;
}

interface SecurityModuleLike {
  createSecurityRuntime?: (params?: {
    rateLimiterConfig?: {
      limit?: number;
      windowMs?: number;
    };
  }) => SecurityRuntimeLike;
}

interface OperationsSafeModeLike {
  getSafeModeState?: () => Record<string, unknown>;
  setSafeModeState?: (patch?: Record<string, unknown>) => Record<string, unknown>;
  isWritesDisabled?: () => boolean;
  isRetrievalDisabled?: () => boolean;
  isGroundingDisabled?: () => boolean;
  isSummarizationDisabled?: () => boolean;
  isAgentV2ReadOnlyForced?: () => boolean;
  isAgentV2Disabled?: () => boolean;
  getWarnings?: () => string[];
}

interface OperationsDebugFlagsLike {
  getDebugFlags?: () => Record<string, unknown>;
  setDebugFlags?: (patch?: Record<string, unknown>) => Record<string, unknown>;
  shouldLogVerboseTurnTrace?: () => boolean;
  shouldLogToolBoundaryChecks?: () => boolean;
  shouldLogRetrievalDecisions?: () => boolean;
  shouldExposeOperatorWarnings?: () => boolean;
}

interface OperationsAuditExplorerLike {
  getRecentAuditEvents?: (params?: Record<string, unknown>) => Promise<unknown[]>;
  getTurnTraceByTurnId?: (turnId: string) => Promise<unknown | null>;
  getHealthSnapshots?: (params?: Record<string, unknown>) => Promise<unknown[]>;
  getPerformanceSnapshots?: (params?: Record<string, unknown>) => Promise<unknown[]>;
}

interface OperationsRuntimeLike {
  safeMode?: OperationsSafeModeLike;
  debugFlags?: OperationsDebugFlagsLike;
  auditExplorer?: OperationsAuditExplorerLike;
  attachRuntime?: (runtime: AgentV2Runtime) => void;
  getRuntimeStatus?: () => Promise<Record<string, unknown>> | Record<string, unknown>;
  authorizeAdminRequest?: (req: unknown) => Record<string, unknown>;
  createAdminRouter?: () => unknown;
}

interface OperationsModuleLike {
  createOperationsRuntime?: (params?: {
    config?: Record<string, unknown>;
    flags?: Record<string, unknown>;
    repository?: SessionPersistenceBridge;
    runtime?: AgentV2Runtime;
    policyOverrides?: Record<string, unknown>;
  }) => OperationsRuntimeLike;
}

interface DeploymentStateLike {
  config?: Record<string, unknown>;
  flags?: Record<string, unknown>;
}

interface DeploymentModuleLike {
  getDeploymentState?: () => DeploymentStateLike | null;
  getAgentConfig?: (env?: NodeJS.ProcessEnv, options?: { cwd?: string }) => Record<string, unknown>;
  getFeatureFlags?: (env?: NodeJS.ProcessEnv) => Record<string, unknown>;
}

interface DeploymentRuntimeSettings {
  retrievalPolicy?: Record<string, unknown>;
  memoryPolicy?: Record<string, unknown>;
  performancePolicy?: Record<string, unknown>;
  observabilityPolicy?: Record<string, unknown>;
  operationsPolicy?: Record<string, unknown>;
  deploymentConfig?: Record<string, unknown>;
  deploymentFlags?: Record<string, unknown>;
  suggestionRuntime?: {
    enabled: boolean;
    telemetryEnabled: boolean;
  };
  securityRateLimiterConfig?: {
    limit?: number;
    windowMs?: number;
  };
}

export interface AgentV2Runtime {
  readonly sessionStore: InMemorySessionStore;
  readonly loop: AgenticLoop;
  readonly grounding?: GroundingRuntimeLike;
  readonly retrieval?: RetrievalRuntimeLike;
  readonly performance?: PerformanceRuntimeLike;
  readonly observability?: ObservabilityRuntimeLike;
  readonly repository?: SessionPersistenceBridge;
  readonly security?: SecurityRuntimeLike;
  operations?: OperationsRuntimeLike;
}

export function createAgentV2Runtime(): AgentV2Runtime {
  const deploymentSettings = loadDeploymentSettings();
  const llmProvider = resolveProvider();
  const repository = loadPersistenceRepository();
  const performance = loadPerformanceRuntime(deploymentSettings?.performancePolicy);
  const retrievalRuntime = loadRetrievalRuntime(deploymentSettings?.retrievalPolicy);
  const grounding = loadGroundingRuntime();
  const observability = loadObservabilityRuntime(deploymentSettings?.observabilityPolicy);
  const security = loadSecurityRuntime(deploymentSettings?.securityRateLimiterConfig);
  const operations = loadOperationsRuntime({
    config: deploymentSettings?.deploymentConfig,
    flags: deploymentSettings?.deploymentFlags,
    repository,
    runtime: undefined,
    policyOverrides: deploymentSettings?.operationsPolicy,
  });
  const memory = loadMemoryRuntime(
    llmProvider,
    retrievalRuntime,
    grounding,
    performance,
    operations,
    deploymentSettings?.memoryPolicy,
  );
  const sessionStore = new InMemorySessionStore(repository, {
    maxSessions: asPositiveInt(performance?.policy?.SESSION_CACHE_MAX, 200),
    evictAfterTouches: asPositiveInt(performance?.policy?.CACHE_EVICT_AFTER_TURNS, 120),
  });
  const permissionGate = new PermissionGate();
  const loopGuard = new LoopGuard({
    timeoutMs: asPositiveInt(process.env.AGENT_LOOP_GUARD_TIMEOUT_MS, 90_000),
  });
  const executor = new ToolExecutor(permissionGate);
  const classifier = new TurnClassifier();
  const pending = new PendingManager();
  const registry = new ToolRegistry();
  bootstrapTools(registry, [
    ...loadWave1ReadTools(),
    ...loadDraftTools(),
    ...loadPlanTools(),
    ...loadSystemTools(),
  ]);

  const loop = new AgenticLoop(
    llmProvider,
    registry,
    executor,
    classifier,
    pending,
    permissionGate,
    loopGuard,
    repository,
    memory,
    undefined,
    undefined,
    undefined,
    {
      suggestions: {
        enabled: deploymentSettings?.suggestionRuntime?.enabled !== false,
        telemetryEnabled: deploymentSettings?.suggestionRuntime?.telemetryEnabled !== false,
      },
    },
  );

  const runtime: AgentV2Runtime = {
    sessionStore,
    loop,
    grounding,
    retrieval: retrievalRuntime,
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

  const loopWithHooks = loop as AgenticLoop & {
    __observability?: ObservabilityRuntimeLike;
    __security?: SecurityRuntimeLike;
    __operations?: OperationsRuntimeLike;
  };
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

function loadWave1ReadTools(): ToolDefinition[] {
  const readToolsModule = loadOptionalAgentModule<ReadToolsModuleLike>(
    "tools",
    "tools/read",
  );
  if (!readToolsModule) {
    throw new Error("Agent v2 read tool module not found.");
  }

  const listedRaw =
    typeof readToolsModule.getReadTools === "function"
      ? readToolsModule.getReadTools()
      : Array.isArray(readToolsModule.tools)
      ? readToolsModule.tools
      : [];
  if (!Array.isArray(listedRaw) || listedRaw.length === 0) {
    throw new Error("Agent v2 read tool module did not provide tools.");
  }

  return listedRaw
    .filter((tool) => isV2SafeTool(tool))
    .map((tool) => adaptLegacyTool(tool));
}

function loadDraftTools(): ToolDefinition[] {
  try {
    const draftModule = require("../tools/draft") as {
      getDraftTools?: () => ToolDefinition[];
    };
    if (typeof draftModule.getDraftTools === "function") {
      return draftModule.getDraftTools();
    }
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.tools.draft] Draft tools unavailable: ${message}`);
    return [];
  }
}

function loadPlanTools(): ToolDefinition[] {
  try {
    const planModule = require("../tools/plan") as {
      getPlanTools?: () => ToolDefinition[];
    };
    if (typeof planModule.getPlanTools === "function") {
      return planModule.getPlanTools();
    }
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.tools.plan] Plan tools unavailable: ${message}`);
    return [];
  }
}

function loadSystemTools(): ToolDefinition[] {
  try {
    const systemModule = require("../tools/system") as {
      getSystemTools?: () => ToolDefinition[];
    };
    if (typeof systemModule.getSystemTools === "function") {
      return systemModule.getSystemTools();
    }
    return [];
  } catch (error) {
    if (isModuleNotFoundError(error)) {
      return [];
    }
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.tools.system] System tools unavailable: ${message}`);
    return [];
  }
}

function loadPersistenceRepository(): SessionPersistenceBridge | undefined {
  const persistence = loadOptionalAgentModule<PersistenceModuleLike>("persistence", "persistence");
  if (!persistence) {
    return undefined;
  }

  if (
    typeof persistence.createSQLiteClient !== "function" ||
    typeof persistence.createSessionRepository !== "function"
  ) {
    console.warn("[agent.persistence] Persistence module loaded without required factories.");
    return undefined;
  }

  try {
    const client = persistence.createSQLiteClient();
    return persistence.createSessionRepository(client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.persistence] Persistence unavailable in runtime: ${message}`);
    return undefined;
  }
}

function loadRetrievalRuntime(policyOverrides?: Record<string, unknown>): RetrievalRuntimeLike | undefined {
  const retrievalModule = loadOptionalAgentModule<RetrievalModuleLike>("retrieval", "retrieval");
  if (!retrievalModule || typeof retrievalModule.createRetrievalRuntime !== "function") {
    return undefined;
  }

  try {
    return retrievalModule.createRetrievalRuntime({ policyOverrides });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.retrieval] Retrieval runtime unavailable: ${message}`);
    return undefined;
  }
}

function loadGroundingRuntime(): GroundingRuntimeLike | undefined {
  const groundingModule = loadOptionalAgentModule<GroundingModuleLike>("grounding", "grounding");
  if (!groundingModule || typeof groundingModule.createGroundingRuntime !== "function") {
    return undefined;
  }

  try {
    return groundingModule.createGroundingRuntime();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.grounding] Grounding runtime unavailable: ${message}`);
    return undefined;
  }
}

function loadMemoryRuntime(
  llmProvider: ILLMProvider,
  retrievalRuntime?: RetrievalRuntimeLike,
  groundingRuntime?: GroundingRuntimeLike,
  performanceRuntime?: PerformanceRuntimeLike,
  operationsRuntime?: OperationsRuntimeLike,
  policyOverrides?: Record<string, unknown>,
): AgentMemoryServices | undefined {
  const memoryModule = loadOptionalAgentModule<MemoryModuleLike>("memory", "memory");
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.memory] Memory runtime unavailable: ${message}`);
    return undefined;
  }
}

function loadPerformanceRuntime(policyOverrides?: Record<string, unknown>): PerformanceRuntimeLike | undefined {
  const performanceModule = loadOptionalAgentModule<PerformanceModuleLike>("performance", "performance");
  if (!performanceModule || typeof performanceModule.createPerformanceRuntime !== "function") {
    return undefined;
  }

  try {
    return performanceModule.createPerformanceRuntime({ policyOverrides });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.performance] Performance runtime unavailable: ${message}`);
    return undefined;
  }
}

function loadObservabilityRuntime(
  policyOverrides?: Record<string, unknown>,
): ObservabilityRuntimeLike | undefined {
  const observabilityModule = loadOptionalAgentModule<ObservabilityModuleLike>(
    "observability",
    "observability",
  );
  if (!observabilityModule || typeof observabilityModule.createObservabilityRuntime !== "function") {
    return undefined;
  }

  try {
    return observabilityModule.createObservabilityRuntime({ policyOverrides });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.observability] Observability runtime unavailable: ${message}`);
    return undefined;
  }
}

function loadSecurityRuntime(
  rateLimiterConfig?: { limit?: number; windowMs?: number },
): SecurityRuntimeLike | undefined {
  const securityModule = loadOptionalAgentModule<SecurityModuleLike>("security", "security");
  if (!securityModule || typeof securityModule.createSecurityRuntime !== "function") {
    return undefined;
  }

  try {
    return securityModule.createSecurityRuntime({ rateLimiterConfig });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.security] Security runtime unavailable: ${message}`);
    return undefined;
  }
}

function loadOperationsRuntime({
  config,
  flags,
  repository,
  runtime,
  policyOverrides,
}: {
  config?: Record<string, unknown>;
  flags?: Record<string, unknown>;
  repository?: SessionPersistenceBridge;
  runtime?: AgentV2Runtime;
  policyOverrides?: Record<string, unknown>;
}): OperationsRuntimeLike | undefined {
  const operationsModule = loadOptionalAgentModule<OperationsModuleLike>("operations", "operations");
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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.operations] Operations runtime unavailable: ${message}`);
    return undefined;
  }
}

function registerPerformanceProviders({
  performance,
  sessionStore,
  retrievalRuntime,
  memory,
}: {
  performance?: PerformanceRuntimeLike;
  sessionStore: InMemorySessionStore;
  retrievalRuntime?: RetrievalRuntimeLike;
  memory?: AgentMemoryServices;
}): void {
  if (!performance || typeof performance.registerCacheProvider !== "function") {
    return;
  }

  safeRegister(performance, "sessionCache", () => sessionStore.getCacheStats());
  safeRegister(performance, "retrievalIndex", () =>
    (retrievalRuntime && typeof retrievalRuntime.getCacheStats === "function"
      ? retrievalRuntime.getCacheStats()
      : typeof retrievalRuntime?.getIndexStats === "function"
      ? retrievalRuntime.getIndexStats()
      : {}) as Record<string, unknown>,
  );
  safeRegister(performance, "memoryContext", () => getOptionalCacheStats(memory?.contextAssembler));
  safeRegister(performance, "ragStats", () =>
    (memory?.contextAssembler && typeof (memory.contextAssembler as any).getRagStats === "function"
      ? (memory.contextAssembler as any).getRagStats()
      : {}) as Record<string, unknown>,
  );
  safeRegister(performance, "memorySummary", () => getOptionalCacheStats(memory?.summarizer));
}

function safeRegister(
  performance: PerformanceRuntimeLike,
  name: string,
  statsProvider: () => Record<string, unknown>,
): void {
  if (typeof performance.registerCacheProvider !== "function") {
    return;
  }
  try {
    performance.registerCacheProvider(name, statsProvider);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.performance] Failed to register cache provider "${name}": ${message}`);
  }
}

function loadOptionalAgentModule<T>(logLabel: string, moduleName: string): T | undefined {
  const resolvedPath = resolveAgentModulePath(moduleName);
  if (!resolvedPath) {
    if (logLabel === "retrieval") {
      console.warn("[agent.retrieval] Retrieval module not found. Continuing with retrieval disabled.");
    } else {
      console.warn(`[agent.${logLabel}] Module not found in runtime candidates.`);
    }
    return undefined;
  }

  try {
    return require(resolvedPath) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.${logLabel}] Failed to load module from "${resolvedPath}": ${message}`);
    return undefined;
  }
}

function resolveAgentModulePath(moduleName: string): string | null {
  const candidates = buildAgentModuleCandidates(moduleName);
  for (const candidate of candidates) {
    try {
      return require.resolve(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

function loadDeploymentSettings(): DeploymentRuntimeSettings | undefined {
  const deploymentModule = loadOptionalAgentModule<DeploymentModuleLike>("deployment", "deployment");
  if (!deploymentModule) {
    return undefined;
  }

  try {
    const state = deploymentModule.getDeploymentState?.() ?? null;
    const config =
      toRecord(state?.config) ??
      toRecord(
        deploymentModule.getAgentConfig?.(process.env, {
          cwd: path.resolve(__dirname, "../../.."),
        }),
      );
    if (!config) {
      return undefined;
    }
    const flags =
      toRecord(state?.flags) ??
      toRecord(deploymentModule.getFeatureFlags?.(process.env)) ??
      {};
    return mapDeploymentSettings(config, flags);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.deployment] Runtime deployment settings unavailable: ${message}`);
    return undefined;
  }
}

function mapDeploymentSettings(
  config: Record<string, unknown>,
  flags: Record<string, unknown> = {},
): DeploymentRuntimeSettings {
  const policy = toRecord(config.policy) ?? {};
  const memory = toRecord(policy.memory) ?? {};
  const retrieval = toRecord(policy.retrieval) ?? {};
  const security = toRecord(policy.security) ?? {};
  const observability = toRecord(policy.observability) ?? {};
  const operations = toRecord(policy.operations) ?? {};

  return {
    deploymentConfig: config,
    deploymentFlags: flags,
    suggestionRuntime: {
      enabled: resolveDeploymentFeatureFlag(flags, "FEATURE_AGENT_V2_SUGGESTIONS", true),
      telemetryEnabled: resolveDeploymentFeatureFlag(flags, "FEATURE_AGENT_V2_SUGGESTIONS", true),
    },
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
      PERFORMANCE_SNAPSHOT_EVERY_N_TURNS: asPositiveInt(
        observability.performanceSnapshotEveryNTurns,
        100,
      ),
    },
    observabilityPolicy: {
      HEALTH_SNAPSHOT_EVERY_N_TURNS: asPositiveInt(
        observability.healthSnapshotEveryNTurns,
        25,
      ),
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

function resolveDeploymentFeatureFlag(
  flags: Record<string, unknown>,
  key: string,
  fallback: boolean,
): boolean {
  const values = toRecord(flags.values);
  const candidate =
    (values && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : undefined) ??
    (Object.prototype.hasOwnProperty.call(flags, key) ? flags[key] : undefined);
  if (typeof candidate === "boolean") {
    return candidate;
  }
  if (typeof candidate === "string") {
    const normalized = candidate.trim().toLowerCase();
    if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
      return true;
    }
    if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
      return false;
    }
  }
  return fallback;
}

function buildAgentModuleCandidates(moduleName: string): string[] {
  const normalized = moduleName.replace(/[\\/]+/g, "/").replace(/^\/+|\/+$/g, "");
  const candidates = [
    path.resolve(__dirname, `../${normalized}`),
    path.resolve(__dirname, `../../../src/agent/${normalized}`),
    path.resolve(process.cwd(), `.agent-build/agent/${normalized}`),
    path.resolve(process.cwd(), `src/agent/${normalized}`),
    path.resolve(process.cwd(), `backend/.agent-build/agent/${normalized}`),
    path.resolve(process.cwd(), `backend/src/agent/${normalized}`),
  ];

  return [...new Set(candidates)];
}

function isV2SafeTool(tool: unknown): boolean {
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

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  const text = asString(value)?.trim();
  return text || null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asPositiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeFloat(value: unknown, fallback: number): number {
  const parsed = Number.parseFloat(String(value ?? fallback));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getOptionalCacheStats(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const row = value as { getCacheStats?: () => Record<string, unknown> };
  if (typeof row.getCacheStats !== "function") {
    return {};
  }
  try {
    return row.getCacheStats();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error || "unknown error");
    console.warn(`[agent.performance] Failed reading cache stats: ${message}`);
    return {};
  }
}

function isModuleNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  return (
    (error as { code?: string }).code === "MODULE_NOT_FOUND" ||
    String((error as { message?: string }).message || "").includes("Cannot find module")
  );
}
