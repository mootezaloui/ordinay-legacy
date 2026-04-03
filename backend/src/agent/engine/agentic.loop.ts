import type { ILLMProvider, LLMMessage, LLMToolCall } from "../llm";
import {
  buildContext,
  generateSummary,
  type Session,
  type SessionPersistenceBridge,
} from "../session";
import {
  LoopGuard,
  PermissionGate,
  validateAssistantOutput,
  validateToolExecutionResultShape,
} from "../safety";
import {
  ToolCategory,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolRegistry,
} from "../tools";
import { DomainWorkflowPlanner, LinkResolver } from "../domain";
import { SessionError } from "../errors";
import type {
  AgentTurnInput,
  AgentTurnOutput,
  AuditRecord,
  DraftArtifact,
  DraftLayout,
  DraftSection,
  PlanArtifact,
  PlanExecutedArtifact,
  LinkResolutionDiagnostic,
  PlanOperation,
  PlanPreview,
  PlanRejectedArtifact,
  PendingAction,
  PendingActionPlan,
  SuggestionArtifact,
  ToolCallRecord,
  TurnType,
} from "../types";
import { TurnType as TurnTypeEnum } from "../types";
import { EntityExecutor, type EntityExecutionResult } from "./entity.executor";
import { PendingManager } from "./pending.manager";
import { ToolExecutor } from "./tool.executor";
import { TurnClassifier } from "./turn.classifier";

declare const require: (id: string) => unknown;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _path = require("path") as { resolve: (...args: string[]) => string; join: (...args: string[]) => string };
// Resolve from backend root (works from both src/ and .agent-build/)
const agentDocumentsService = require(_path.resolve(__dirname, "..", "..", "..", "src", "services", "agentDocuments.service")) as {
  buildAgentDocumentContext: (sessionId: string) => {
    totalDocuments: number;
    documents: Array<{
      document_id: number;
      title: string;
      original_filename: string;
      mime_type: string;
      text_status: string;
      has_text: boolean;
      text: string | null;
    }>;
  } | null;
};
const { detectAmbiguity: detectGenericAmbiguity } = require(
  _path.resolve(__dirname, "..", "..", "..", "src", "agent", "engine", "ambiguity.detector"),
) as {
  detectAmbiguity: (params?: {
    input?: { message?: string };
    session?: { activeEntities?: unknown[] };
    retrievalContext?: unknown;
    activeEntities?: unknown[];
  }) => {
    ambiguous?: boolean;
    kind?: string;
    confidence?: string;
    candidates?: Array<{ type?: string; id?: string | number; label?: string; sourceTool?: string }>;
    reason?: string;
  };
};

const READ_POLICY_INSTRUCTIONS = [
  "DATA ACCESS POLICY",
  "",
  "The system manages structured legal practice data stored in the database.",
  "",
  "When a user question references any of the following:",
  "",
  "- client",
  "- dossier",
  "- lawsuit",
  "- task",
  "- document",
  "- financial entry",
  "- notification",
  "- history event",
  "- workload",
  "- cases",
  "- deadlines",
  "- sessions",
  "",
  "the information must be retrieved using READ tools.",
  "",
  "Never infer database state without retrieving it.",
  "",
  "If a question refers to database records, the agent must use READ tools before producing the final answer.",
  "",
  "Questions about general legal knowledge, concepts, or explanations do not require tools.",
  "",
  "This rule guides tool usage but does not enforce it programmatically.",
  "",
  "GRAPH TRAVERSAL GUIDELINES",
  "",
  "Entity relationships in the system:",
  "",
  "Client -> Dossiers -> Lawsuits -> Tasks/Sessions",
  "Dossier -> Tasks / Sessions / Documents",
  "Lawsuit -> Sessions",
  "Document -> History",
  "",
  "Recommended traversal depths:",
  "",
  "- Client workload queries: depth 2-3",
  "- Dossier context queries: depth 1-2",
  "- Document history queries: depth 1",
  "",
  "Avoid shallow traversal when the user asks about workload, cases, or related activity.",
  "",
  "DEEP READING PATTERN",
  "",
  "You have two levels of reading tools:",
  "",
  "1. ENTITY GRAPH (getEntityGraph) gives you a MAP of an entity and all its relationships.",
  "   It returns slim summary nodes (id, title, status, dates, flags) for each related entity.",
  "   Use this FIRST to understand the structure.",
  "",
  "2. SINGLE ENTITY tools (getClient, getDossier, getLawsuit, getTask, getSession, getMission, getDocument)",
  "   give you FULL details of one specific entity including description, notes, assignee, and all fields.",
  "",
  "For comprehensive summaries, case overviews, or any question that requires understanding entity content:",
  "",
  "  Step 1: Call getEntityGraph to see the full structure and relationships.",
  "  Step 2: Call get[Entity] for items that need detailed reading.",
  "  Step 3: Synthesize everything into your response.",
  "",
  "You do NOT need to drill into every entity. Be selective based on what matters:",
  "",
  "  - Read ACTIVE lawsuits in detail (skip closed ones unless asked).",
  "  - Read OVERDUE or URGENT tasks in detail (skip completed ones).",
  "  - Read UPCOMING sessions in detail (skip past ones).",
  "  - Document titles from the graph are usually enough (don't drill into each).",
  "  - Read financial entries if the question involves money, costs, or invoices.",
  "  - Skip missions/bailiff details unless specifically asked.",
  "",
  "EFFICIENCY: When you need multiple entity details after viewing the graph,",
  "call ALL the get[Entity] tools in a SINGLE response rather than one at a time.",
  "The system executes them in parallel, which is much faster.",
  "",
  "Example - User asks 'summarize dossier D-42':",
  "  Iteration 1: call getEntityGraph('dossier', 42, depth: 2)",
  "  Iteration 2: call getLawsuit(101), getLawsuit(102), getTask(201), getSession(301) - ALL AT ONCE",
  "  Iteration 3: generate the summary from all gathered data",
  "",
  "LARGE CASES: If the entity graph shows 50+ total children across all categories,",
  "do not try to read everything. Use depth: 1, focus on active items with filtered",
  "list tools (e.g. listTasks with status filter), and tell the user what you focused on.",
  "",
  "IMPORTANT: The entity graph alone is NOT enough for a summary or case overview.",
  "Graph nodes only contain titles and statuses. To report on actual content like",
  "lawsuit details, task notes, financial amounts, or session outcomes, you MUST",
  "drill into the relevant entities with their individual get tools.",
  "",
  "PRESENTATION QUALITY GUIDELINES",
  "",
  "Use the format (table, bullets, or concise prose) that is most readable for the current answer.",
  "Keep one consistent date/time style in a response and prefer explicit UTC labels for database-derived timestamps.",
  "Do not output raw JSON, tool payload wrappers, or stream-event fragments in user-facing text.",
  "Keep sections compact and non-redundant; avoid repeating the same fact in multiple sections.",
  "If data is partial or uncertain, state that clearly instead of filling gaps with assumptions.",
  "",
  "INTERNAL IDENTIFIER POLICY",
  "",
  "Never include internal database identifiers (numeric IDs such as id, client_id, dossier_id, task_id, entity_id, etc.) in any user-facing output.",
  "These are system-internal values and must never appear in response text, tables, structured data, or field labels.",
  "When referring to entities, use their human-readable attributes: name, title, reference code, date, or description.",
  "This rule applies to all entity types without exception.",
  "",
  "AMBIGUITY RESOLUTION POLICY",
  "",
  "When a user references an entity by name and READ tools return multiple matching records:",
  "",
  "- Present the top candidates (up to 5) with distinguishing attributes such as name, reference code, date, and status.",
  "- Ask the user to specify which one they meant.",
  "- Never silently select one entity when multiple candidates match.",
  "",
  "When a user reference is vague or partial (e.g. a first name, a pronoun like 'it' or 'that'):",
  "",
  "- Always attempt to resolve using READ tools first (search by name, list by associated client).",
  "- Use tool results to identify candidates before asking for clarification.",
  "- If exactly one match is found, proceed with it and state the assumption explicitly.",
  "- If multiple matches are found, list them with distinguishing details for the user to choose.",
  "- If no matches are found, inform the user clearly.",
  "",
  "PLAN-FIRST MUTATION POLICY",
  "",
  "For create/update/delete mutation intent on database entities:",
  "- Use PLAN tools only: proposeCreate, proposeUpdate, proposeDelete.",
  "- Do NOT call WRITE or EXECUTE tools to initiate mutations.",
  "- PLAN tools only prepare proposals; they never write to the database directly.",
  "- Never say a mutation is completed before explicit user confirmation and execution result.",
  "- If the user amends a pending mutation, call a PLAN tool again with revised args to replace the pending proposal.",
  "",
  "SUGGESTION POLICY (when suggestAction tool is available)",
  "",
  "Priority order for suggestion behavior:",
  "1) Safety and constraints first (permission, policy, and non-mutating guarantees).",
  "2) Disambiguation and missing-context clarification second.",
  "3) Suggestion only after safety and disambiguation are satisfied.",
  "",
  "Suggestion rules:",
  "- At most one suggestAction call per turn.",
  "- Suggestions must be specific and grounded in current session context.",
  "- suggestion_artifact is advisory only; it must not create pending actions or execute mutations.",
  "",
  "Anti-noise rule:",
  "- If the user request is explicit and complete (clear direct command + clear target + sufficient details), skip suggestAction and continue with normal flow.",
  "- For explicit draft requests, proceed with draft flow and generateDraft when details/context are sufficient.",
  "- For explicit mutation requests, proceed with PLAN flow (proposeCreate/proposeUpdate/proposeDelete).",
  "- Do not inject proactive suggestions into confirmation/rejection/amendment handling unless explicitly requested.",
  "",
  "DRAFTING",
  "",
  "DRAFTING DOCUMENTS:",
  "",
  "When the user asks you to write, draft, compose, or prepare a document, follow this sequence.",
  "Do NOT skip steps. Do NOT call generateDraft until you have enough information.",
  "",
  "STEP 1 - RESOLVE THE ENTITY",
  "",
  "The user may reference a client, dossier, or lawsuit. Search for it.",
  "",
  "If CLEAR (one match): proceed to Step 2.",
  "If AMBIGUOUS (multiple matches): present options and ask the user to choose.",
  "\"I found 3 dossiers for Leila:",
  "1. D-51 - Mansouri v. SARL Atlas (Commercial) - Active",
  "2. D-52 - Property claim (Civil) - Active",
  "3. D-53 - Employment dispute (Labor) - Closed",
  "Which one is this draft for?\"",
  "If MISSING (user did not specify any entity): ask.",
  "\"I can help you draft something. Which client or dossier is this for?\"",
  "",
  "Wait for the user's response before continuing.",
  "",
  "STEP 2 - DETERMINE THE DOCUMENT TYPE",
  "",
  "Does the user's request clearly specify what type of document they want?",
  "",
  "If CLEAR: the user said \"letter to the judge\" or \"case summary\" or \"email to the client\" - you know the type. Proceed to Step 3.",
  "",
  "If VAGUE: the user said \"draft something\" or \"prepare a document\" or \"write something for this case\" - you do NOT know the type.",
  "",
  "When the type is vague, gather context first (call getEntityGraph or relevant READ tools), then SUGGEST document types based on what you see:",
  "",
  "\"I've reviewed dossier D-51 (Mansouri v. SARL Atlas). Based on the current status, I could draft:",
  "1. A hearing preparation summary (next hearing is March 25)",
  "2. A follow-up letter to the court about the pending motion",
  "3. A status update letter for the client",
  "4. A case summary report",
  "Which would be most helpful? Or describe what you need.\"",
  "",
  "Base your suggestions on ACTUAL case data:",
  "- Upcoming hearing -> suggest hearing prep or court letter",
  "- Overdue tasks -> suggest follow-up letter or reminder",
  "- Recent session -> suggest session notes or post-hearing summary",
  "- Financial issues -> suggest payment reminder or invoice",
  "- New dossier with little activity -> suggest engagement letter or intake summary",
  "",
  "Wait for the user's response before continuing.",
  "",
  "STEP 3 - GATHER CONTEXT FOR THE DRAFT",
  "",
  "Now you know the entity AND the document type. Gather the specific data needed for this draft:",
  "",
  "For a COURT LETTER: get lawsuit details (case number, court, judge), session details (hearing date, purpose), client details.",
  "For a CLIENT LETTER: get client contact info, dossier status, recent activities, financial status if relevant.",
  "For a CASE SUMMARY: get full entity graph, drill into active lawsuits, open tasks, upcoming sessions.",
  "For HEARING PREP: get session details, lawsuit details, recent tasks, related documents.",
  "For an EMAIL: get recipient context, relevant dossier/lawsuit details.",
  "",
  "Use READ tools to gather this data. Batch your tool calls when possible.",
  "",
  "STEP 4 - GENERATE THE DRAFT",
  "",
  "ONLY NOW call generateDraft with structured sections.",
  "You should have: the entity context, the document type, the relevant data points, and enough information to produce a meaningful document.",
  "",
  "If at any point you realize you are missing critical information that you cannot find in the database (for example, the reason for a postponement, specific instructions from the user), ASK before generating:",
  "\"I have the case details ready. Before I draft the postponement letter, could you tell me the reason for the postponement request?",
  "(for example, client unavailability, need more preparation time, etc.)\"",
  "",
  "NEVER generate a draft with placeholder content that you could have asked the user about.",
  "Placeholders like [reason] or [details] should only be used for information that genuinely is not in the system (like the lawyer's personal phone number or specific legal arguments the lawyer wants to make).",
  "",
  "DRAFT OUTPUT FORMAT:",
  "",
  "When calling generateDraft, structure the document as an array of sections.",
  "Each section has a \"role\" and \"text\" (and optional \"label\").",
  "",
  "Available roles:",
  "  Header: date, sender, recipient, reference, subject",
  "  Content: salutation, body, heading, subheading, list_item, quote, note, highlight",
  "  Closing: closing, signature_name, signature_title, signature_detail",
  "  Structure: spacer, separator, page_break",
  "",
  "Also provide layout hints:",
  "  direction: \"ltr\" or \"rtl\" (based on document language)",
  "  language: the document's language code (\"fr\", \"ar\", \"en\")",
  "  formality: \"formal\" for legal/court documents, \"standard\" for business",
  "  documentClass: the type of document (e.g. \"court_letter\", \"court_request\", \"client_letter\", \"email\", \"case_summary\")",
  "",
  "Example for a French court letter:",
  "{",
  "  sections: [",
  "    { role: \"date\", text: \"Tunis, le 18 mars 2026\" },",
  "    { role: \"recipient\", text: \"M. le Président du Tribunal de Première Instance de Tunis\" },",
  "    { role: \"reference\", text: \"Affaire n° 2025/COM/1847\" },",
  "    { role: \"subject\", label: \"Objet :\", text: \"Demande de report d'audience\" },",
  "    { role: \"spacer\" },",
  "    { role: \"salutation\", text: \"Monsieur le Président,\" },",
  "    { role: \"spacer\" },",
  "    { role: \"body\", text: \"Nous avons l'honneur...\" },",
  "    { role: \"body\", text: \"En raison de...\" },",
  "    { role: \"spacer\" },",
  "    { role: \"closing\", text: \"Veuillez agréer...\" },",
  "    { role: \"spacer\" },",
  "    { role: \"signature_name\", text: \"Me. Karim Jebali\" },",
  "    { role: \"signature_title\", text: \"Avocat au Barreau de Tunis\" },",
  "    { role: \"signature_detail\", text: \"Tél : +216 XX XXX XXX\" }",
  "  ],",
  "  layout: { direction: \"ltr\", language: \"fr\", formality: \"formal\", documentClass: \"court_letter\" }",
  "}",
  "",
  "Example for an Arabic court request:",
  "{",
  "  sections: [",
  "    { role: \"heading\", text: \"بسم الله الرحمن الرحيم\" },",
  "    { role: \"recipient\", text: \"السيد رئيس المحكمة الابتدائية بتونس\" },",
  "    { role: \"reference\", label: \"الملف عدد:\", text: \"2025/1847\" },",
  "    { role: \"subject\", label: \"الموضوع:\", text: \"طلب تأجيل الجلسة\" },",
  "    { role: \"spacer\" },",
  "    { role: \"salutation\", text: \"حضرة السيد الرئيس المحترم,\" },",
  "    { role: \"spacer\" },",
  "    { role: \"body\", text: \"يتشرف العارض...\" },",
  "    { role: \"spacer\" },",
  "    { role: \"closing\", text: \"وتفضلوا بقبول فائق الاحترام والتقدير\" },",
  "    { role: \"spacer\" },",
  "    { role: \"signature_name\", text: \"الأستاذ كريم الجبالي\" },",
  "    { role: \"signature_title\", text: \"محامي لدى محكمة التعقيب\" }",
  "  ],",
  "  layout: { direction: \"rtl\", language: \"ar\", formality: \"formal\", documentClass: \"court_request\" }",
  "}",
  "",
  "The renderer handles all visual formatting. You just provide the semantic structure and content.",
  "Different document types use different combinations of roles - the renderer adapts automatically.",
  "Use spacer sections between logical groups (after header, before closing, etc.).",
  "",
  "STRICT SECTION RULES (violations break the document display):",
  "",
  "1. ONE PARAGRAPH PER SECTION. Never put multiple paragraphs in one body section.",
  "2. ONE BULLET PER SECTION. Each bullet point is a separate list_item section. Do NOT write bullet lists inside a body section.",
  "3. HEADINGS ARE SECTIONS. Section titles like 'Current Status' or 'Next Steps' must be their own heading section, not bold text inside a body section.",
  "4. NO MARKDOWN. Never use **, ##, *, •, or numbered list formatting (1. 2. 3.) inside section text. The renderer handles all formatting based on the role.",
  "5. For numbered items, use list_item sections with the number in the label field: { role: \"list_item\", label: \"1.\", text: \"First item\" }",
  "6. The signature block must use signature_name, signature_title, and signature_detail as separate sections.",
  "",
  "WRONG (everything in one body section with markdown):",
  "  { role: \"body\", text: \"**Current Status** • Item 1 • Item 2\\n\\n**Next Steps** 1. Do this 2. Do that\" }",
  "",
  "CORRECT (each element is its own section):",
  "  { role: \"heading\", text: \"Current Status\" },",
  "  { role: \"list_item\", text: \"Item 1\" },",
  "  { role: \"list_item\", text: \"Item 2\" },",
  "  { role: \"spacer\" },",
  "  { role: \"heading\", text: \"Next Steps\" },",
  "  { role: \"list_item\", label: \"1.\", text: \"Do this\" },",
  "  { role: \"list_item\", label: \"2.\", text: \"Do that\" },",
  "",
  "SUMMARY OF THE FLOW:",
  "",
  "User request",
  "|",
  "v",
  "Can I identify the entity? ---- No --> ASK which entity",
  "| Yes                               (search + present options)",
  "v",
  "Do I know the document type? -- No --> READ context, then SUGGEST types",
  "| Yes                               (based on actual case data)",
  "v",
  "Do I have enough context? ----- No --> READ more with specific tools",
  "| Yes                               ASK user if info is not in DB",
  "v",
  "Call generateDraft",
  "",
  "NEVER skip straight to generateDraft. NEVER generate empty or generic drafts.",
  "If you do not have enough information, ASK.",
  "The user expects a thoughtful, context-rich document - not a template with blanks.",
  "",
  "LANGUAGE",
  "",
  "Respond in the same language the user writes in. You support French, Arabic (including Tunisian dialect), and English.",
  "If the user switches languages, follow their lead.",
  "",
  "Entity data from the database may be in any language. Present it as-is, do not translate names, titles, or references.",
  "",
  "For legal documents: use the appropriate legal register and terminology for the jurisdiction and language of the document.",
].join("\n");

const DATABASE_ENTITY_QUERY_PATTERN =
  /\b(client|clients|dossier|dossiers|case|cases|task|tasks|document|documents|workload|lawsuit|lawsuits|session|sessions|financial|history|deadline|deadlines|notification|notifications)\b/i;
const WORKLOAD_OR_CASES_QUERY_PATTERN =
  /\b(work\s*-?\s*load|workload|cases?|matters?)\b/i;
const DRAFT_TOOL_ENFORCEMENT_MIN_TEXT_LENGTH = 500;
const DRAFT_DETAILS_RECOVERY_MAX_ATTEMPTS = 2;
const SUGGESTION_ENFORCEMENT_MAX_ATTEMPTS = 2;
const SUGGESTION_TELEMETRY_METADATA_KEY = "suggestionTelemetry";
const DRAFT_METADATA_SNAPSHOT_KEY = "draftSnapshot";
const DOCUMENT_DRAFT_SOURCE_TOKEN = "__agent_current_draft__";
const DOCUMENT_DRAFT_SNAPSHOT_KEY = "_agentDraftSnapshot";
const DOCUMENT_DRAFT_PROVENANCE_KEY = "_agentDraftProvenance";

const IMPLICIT_INTENT_MARKERS = [
  "i should",
  "we should",
  "should i",
  "i need to",
  "we need to",
  "maybe i should",
  "maybe we should",
  "i think i should",
  "i think we should",
  "it might be better to",
  "it may be better to",
];

const EXPLICIT_DRAFT_COMMAND_PATTERN =
  /^(please\s+|kindly\s+|can you\s+|could you\s+|would you\s+)?(create|draft|write|compose|prepare|generate|regenerate)\b/i;
const EXPLICIT_EXECUTE_COMMAND_PATTERN =
  /^(please\s+|kindly\s+|can you\s+|could you\s+|would you\s+)?(create|update|delete|remove|mark|set|change|close|reopen|archive|activate|deactivate|add)\b/i;
const EXECUTE_INTENT_CUE_PATTERN =
  /\b(update|mark|set|change|delete|remove|create|add|close|reopen|archive|activate|deactivate)\b/i;

interface ReadObservabilityCounters {
  READ_TOOL_CALL_COUNT: number;
  READ_EMPTY_RESULTS: number;
  READ_WARNINGS: number;
  GRAPH_WARNINGS: number;
  STATUS_WARNINGS: number;
}

interface LinkResolutionObservabilityCounters {
  LINK_RESOLUTION_TOTAL: number;
  LINK_RESOLUTION_RESOLVED: number;
  LINK_RESOLUTION_UNCHANGED: number;
  LINK_RESOLUTION_AMBIGUOUS: number;
  LINK_RESOLUTION_UNRESOLVED: number;
  LINK_RESOLUTION_FAILURES: number;
}

interface LoopStats {
  iterations: number;
  toolCalls: number;
}

interface LoopStreamCallbacks {
  onTextDelta?: (delta: string) => void;
  onDraftArtifact?: (artifact: DraftArtifact) => void;
  onPlanArtifact?: (artifact: PlanArtifact) => void;
  onPlanExecuted?: (artifact: PlanExecutedArtifact) => void;
  onPlanRejected?: (artifact: PlanRejectedArtifact) => void;
  onSuggestionArtifact?: (artifact: SuggestionArtifact) => void;
}

interface ImplicitSuggestionPolicy {
  required: boolean;
  domain: SuggestionArtifact["domain"] | null;
  trigger: SuggestionArtifact["trigger"];
}

interface ToolCallProcessingContext {
  input: AgentTurnInput;
  session: Session;
  turnType: TurnType;
  messages: LLMMessage[];
  toolCalls: ToolCallRecord[];
  audit: AuditRecord[];
  warnings: string[];
  stats: LoopStats;
  readCounters: ReadObservabilityCounters;
  linkCounters: LinkResolutionObservabilityCounters;
  implicitSuggestionPolicy?: ImplicitSuggestionPolicy;
  suggestionDeclinedThisTurn?: boolean;
  streamCallbacks?: LoopStreamCallbacks;
}

interface ToolCallProcessingResult {
  stopForConfirmation: boolean;
  confirmationMessage?: string;
  replacedPendingActionId?: string;
  planArtifact?: PlanArtifact;
  suggestionArtifact?: SuggestionArtifact;
}

interface SuggestionPendingTelemetry {
  turnId: string;
  shownAt: string;
  domain: SuggestionArtifact["domain"];
  actionType: SuggestionArtifact["actionType"];
  targetType: string;
  trigger: SuggestionArtifact["trigger"];
}

interface SuggestionTelemetryState {
  counters: {
    shown: number;
    accepted: number;
    dismissed: number;
    fallback: number;
    failures: number;
  };
  pending?: SuggestionPendingTelemetry;
  lastEvent?: {
    kind:
      | "suggestion_shown"
      | "suggestion_accepted"
      | "suggestion_dismissed"
      | "suggestion_fallback"
      | "suggestion_failed";
    at: string;
    turnId?: string;
    requestSource?: string;
    errorCode?: string;
    domain?: SuggestionArtifact["domain"];
    actionType?: SuggestionArtifact["actionType"];
    targetType?: string;
  };
}

export interface AgenticLoopRuntimeOptions {
  suggestions?: {
    enabled?: boolean;
    telemetryEnabled?: boolean;
  };
}

export interface AgentMemoryServices {
  contextAssembler?: {
    build(session: Session, input: AgentTurnInput): LLMMessage[];
  };
  entityTracker?: {
    trackFromToolResult(
      session: Session,
      result: ToolExecutionResult,
      toolName: string,
      turnId: string,
    ): unknown;
    pruneUnusedEntities(session: Session, currentTurnId: string): unknown;
  };
  summarizer?: {
    maybeUpdateSummary(session: Session): Promise<boolean | void>;
  };
  retrieval?: {
    isEnabled?: () => boolean;
    indexSessionArtifacts?: (session: Session) => unknown;
    indexTurnArtifacts?: (session: Session, turn: Session["turns"][number]) => unknown;
  };
}

export class AgenticLoop {
  constructor(
    private readonly llm: ILLMProvider,
    private readonly registry: ToolRegistry,
    private readonly executor: ToolExecutor,
    private readonly classifier: TurnClassifier,
    private readonly pending: PendingManager,
    private readonly permissionGate: PermissionGate,
    private readonly loopGuard: LoopGuard,
    private readonly persistence?: SessionPersistenceBridge,
    private readonly memory?: AgentMemoryServices,
    private readonly entityExecutor: EntityExecutor = new EntityExecutor(),
    private readonly workflowPlanner: DomainWorkflowPlanner = new DomainWorkflowPlanner(),
    private readonly linkResolver: LinkResolver = new LinkResolver(),
    private readonly runtimeOptions: AgenticLoopRuntimeOptions = {},
  ) {}

  async run(
    input: AgentTurnInput,
    session: Session,
    streamCallbacks?: LoopStreamCallbacks,
  ): Promise<AgentTurnOutput> {
    const startedAt = new Date().toISOString();
    const historyStartIndex = session.history.length;
    const turnType = this.classifier.classify(input, session);
    session.state.lastTurnType = turnType;

    const toolCalls: ToolCallRecord[] = [];
    const audit: AuditRecord[] = [];
    const warnings: string[] = [];
    const stats: LoopStats = { iterations: 0, toolCalls: 0 };
    const readCounters = this.createReadObservabilityCounters();
    const linkCounters = this.createLinkResolutionObservabilityCounters();
    this.captureSuggestionFollowUpTelemetry(input, session, audit);

    let output!: AgentTurnOutput;
    try {
      switch (turnType) {
        case TurnTypeEnum.CONFIRMATION:
          output = await this.handleConfirmationTurn(
            input,
            session,
            toolCalls,
            audit,
            warnings,
            stats,
            readCounters,
            streamCallbacks,
          );
          break;
        case TurnTypeEnum.REJECTION:
          output = this.handleRejectionTurn(
            input,
            session,
            toolCalls,
            audit,
            warnings,
            stats,
            streamCallbacks,
          );
          break;
        case TurnTypeEnum.NEW:
        case TurnTypeEnum.AMENDMENT:
        default:
          output = await this.handleReasoningTurn(
            input,
            session,
            turnType,
            toolCalls,
            audit,
            warnings,
            stats,
            readCounters,
            linkCounters,
            streamCallbacks,
          );
          break;
      }
    } finally {
      this.logReadObservabilitySummary(readCounters);
      this.logLinkResolutionObservabilitySummary(linkCounters);
    }

    this.persistTurnArtifacts(input, session, output, startedAt, historyStartIndex);
    return output;
  }

  private async handleConfirmationTurn(
    input: AgentTurnInput,
    session: Session,
    toolCalls: ToolCallRecord[],
    audit: AuditRecord[],
    warnings: string[],
    stats: LoopStats,
    readCounters: ReadObservabilityCounters,
    streamCallbacks?: LoopStreamCallbacks,
  ): Promise<AgentTurnOutput> {
    const action = this.pending.getPending(session);
    if (!action) {
      throw new SessionError("No pending action available for confirmation");
    }
    const metadata: Record<string, unknown> = { confirmedAction: action, loopStats: stats };

    this.appendTurn(session, "user", input.message, TurnTypeEnum.CONFIRMATION);

    if (action.plan) {
      const context = this.createExecutionContext(input, session);
      let result: ToolExecutionResult;

      if (action.plan.diagnostics?.requiresUserDecision === true) {
        const message =
          action.plan.diagnostics.decisionPrompt ||
          "This plan requires an explicit domain decision before execution.";
        result = {
          ok: false,
          errorCode: "DOMAIN_DECISION_REQUIRED",
          errorMessage: message,
          data: {
            blockerCounts: action.plan.diagnostics.blockerCounts || {},
            decisionOptions: action.plan.diagnostics.decisionOptions || [],
          },
        };
      } else

      if (this.isWritesExecutionBlockedBySafeMode()) {
        result = {
          ok: false,
          errorCode: "SAFE_MODE_WRITES_DISABLED",
          errorMessage: "Confirmed write execution is disabled by safe mode.",
        };
        const record = this.createToolRecord(
          action.toolName,
          action.args,
          context,
          result,
          {
            blockedBySafeMode: true,
            confirmedActionId: action.id,
            executionPath: "plan_executor",
          },
        );
        toolCalls.push(record);
        stats.toolCalls += 1;
        this.pushAudit(audit, input, "pending_confirmed_plan_blocked_safe_mode", {
          actionId: action.id,
          toolName: action.toolName,
        });
      } else {
        const executionResult = await this.entityExecutor.execute(action.plan, {
          sessionId: session.id,
          sourceTurnId: action.requestedByTurnId || input.turnId,
        });
        result = this.normalizeEntityExecutionResult(executionResult);
        this.collectToolWarnings(result, warnings);

        const record = this.createToolRecord(
          action.toolName,
          action.args,
          context,
          result,
          {
            confirmedActionId: action.id,
            executionPath: "plan_executor",
          },
        );
        toolCalls.push(record);
        stats.toolCalls += 1;

        this.appendTurn(
          session,
          "tool",
          this.serializeToolMessage(action.toolName, result),
          TurnTypeEnum.CONFIRMATION,
          [record],
        );

        if (result.ok) {
          this.trackConfirmedPlanEntity(session, action.plan, executionResult, input.turnId);
        }

        const linkResolutionSourceTrace = this.resolveLinkResolutionSourceTrace(
          action.plan?.diagnostics?.linkResolution,
        );
        this.pushAudit(audit, input, "pending_confirmed_plan_executed", {
          actionId: action.id,
          toolName: action.toolName,
          operation: action.plan.operation.operation,
          entityType: action.plan.operation.entityType,
          ok: result.ok,
          errorCode: result.errorCode,
          ...(linkResolutionSourceTrace ? { linkResolutionSourceTrace } : {}),
          ...(typeof action.plan?.diagnostics?.linkResolution?.status === "string"
            ? {
                linkResolutionStatus: action.plan.diagnostics.linkResolution.status,
              }
            : {}),
        });
      }

      metadata.confirmedExecutionResult = result;
      const planExecutedArtifact = this.buildPlanExecutedArtifact(action.id, result);
      metadata.planExecutedArtifact = planExecutedArtifact;
      streamCallbacks?.onPlanExecuted?.(planExecutedArtifact);

      const responseText = result.ok
        ? "Plan executed successfully."
        : `Plan execution failed: ${result.errorMessage ?? "Unknown error."}`;
      this.appendTurn(session, "assistant", responseText, TurnTypeEnum.CONFIRMATION);
      this.collectAssistantWarnings(responseText, warnings);
      const shouldKeepPending = result.errorCode === "DOMAIN_DECISION_REQUIRED";
      if (!shouldKeepPending) {
        this.pending.clearPending(session);
      }
      this.touchSession(session, TurnTypeEnum.CONFIRMATION);
      return this.buildOutput(
        input,
        session,
        TurnTypeEnum.CONFIRMATION,
        responseText,
        toolCalls,
        audit,
        metadata,
        warnings,
      );
    }

    const tool = this.registry.get(action.toolName);
    if (!tool) {
      const result: ToolExecutionResult = {
        ok: false,
        errorCode: "TOOL_NOT_FOUND",
        errorMessage: `Tool "${action.toolName}" is not registered`,
      };
      metadata.confirmedExecutionResult = result;
      const responseText = result.errorMessage!;
      this.appendTurn(session, "assistant", responseText, TurnTypeEnum.CONFIRMATION);
      this.pushAudit(audit, input, "pending_confirmed_tool_missing", {
        actionId: action.id,
        toolName: action.toolName,
      });
      this.collectAssistantWarnings(responseText, warnings);
      this.pending.clearPending(session);
      this.touchSession(session, TurnTypeEnum.CONFIRMATION);
      return this.buildOutput(
        input,
        session,
        TurnTypeEnum.CONFIRMATION,
        responseText,
        toolCalls,
        audit,
        metadata,
        warnings,
      );
    }

    const authScope = this.resolveAuthScope(input);
    const decision = this.permissionGate.evaluate({ authScope }, tool);
    if (!decision.allowed) {
      const result: ToolExecutionResult = {
        ok: false,
        errorCode: "TOOL_PERMISSION_DENIED",
        errorMessage: decision.reason ?? "Tool is not allowed.",
      };
      metadata.confirmedExecutionResult = result;
      const responseText = `I cannot execute the confirmed action: ${result.errorMessage}.`;
      this.appendTurn(session, "assistant", responseText, TurnTypeEnum.CONFIRMATION);
      this.pushAudit(audit, input, "pending_confirmed_denied", {
        actionId: action.id,
        toolName: action.toolName,
        reason: result.errorMessage,
      });
      this.collectAssistantWarnings(responseText, warnings);
      this.pending.clearPending(session);
      this.touchSession(session, TurnTypeEnum.CONFIRMATION);
      return this.buildOutput(
        input,
        session,
        TurnTypeEnum.CONFIRMATION,
        responseText,
        toolCalls,
        audit,
        metadata,
        warnings,
      );
    }

    if (this.isWritesExecutionBlockedBySafeMode()) {
      const result: ToolExecutionResult = {
        ok: false,
        errorCode: "SAFE_MODE_WRITES_DISABLED",
        errorMessage: "Confirmed write execution is disabled by safe mode.",
      };
      metadata.confirmedExecutionResult = result;
      const context = this.createExecutionContext(input, session);
      const record = this.createToolRecord(
        action.toolName,
        action.args,
        context,
        result,
        { blockedBySafeMode: true, confirmedActionId: action.id },
      );
      toolCalls.push(record);
      stats.toolCalls += 1;

      const responseText = "Confirmed action blocked: write execution is disabled by safe mode.";
      this.appendTurn(session, "assistant", responseText, TurnTypeEnum.CONFIRMATION);
      this.pushAudit(audit, input, "pending_confirmed_blocked_safe_mode", {
        actionId: action.id,
        toolName: action.toolName,
      });
      this.collectAssistantWarnings(responseText, warnings);
      this.pending.clearPending(session);
      this.touchSession(session, TurnTypeEnum.CONFIRMATION);
      return this.buildOutput(
        input,
        session,
        TurnTypeEnum.CONFIRMATION,
        responseText,
        toolCalls,
        audit,
        metadata,
        warnings,
      );
    }

    const context = this.createExecutionContext(input, session);
    const result = await this.executor.execute(tool, context, action.args);
    metadata.confirmedExecutionResult = result;
    this.collectToolWarnings(result, warnings);
    if (tool.category === ToolCategory.READ) {
      this.trackReadToolResult(result, readCounters);
    }

    const record = this.createToolRecord(
      action.toolName,
      action.args,
      context,
      result,
      { confirmedActionId: action.id },
    );
    toolCalls.push(record);
    stats.toolCalls += 1;

    this.appendTurn(
      session,
      "tool",
      this.serializeToolMessage(action.toolName, result),
      TurnTypeEnum.CONFIRMATION,
      [record],
    );

    const responseText = result.ok
      ? "Confirmed action executed successfully."
      : `Confirmed action failed: ${result.errorMessage ?? "Unknown error."}`;
    this.appendTurn(session, "assistant", responseText, TurnTypeEnum.CONFIRMATION);
    this.pushAudit(audit, input, "pending_confirmed_executed", {
      actionId: action.id,
      toolName: action.toolName,
      ok: result.ok,
      errorCode: result.errorCode,
    });
    this.collectAssistantWarnings(responseText, warnings);

    this.pending.clearPending(session);
    this.touchSession(session, TurnTypeEnum.CONFIRMATION);
    return this.buildOutput(
      input,
      session,
      TurnTypeEnum.CONFIRMATION,
      responseText,
      toolCalls,
      audit,
      metadata,
      warnings,
    );
  }

  private handleRejectionTurn(
    input: AgentTurnInput,
    session: Session,
    toolCalls: ToolCallRecord[],
    audit: AuditRecord[],
    warnings: string[],
    stats: LoopStats,
    streamCallbacks?: LoopStreamCallbacks,
  ): AgentTurnOutput {
    const rejectedAction = this.pending.getPending(session);
    if (!rejectedAction) {
      throw new SessionError("No pending action available for rejection");
    }
    const metadata: Record<string, unknown> = {
      rejectedActionId: rejectedAction.id,
      loopStats: stats,
    };

    this.appendTurn(session, "user", input.message, TurnTypeEnum.REJECTION);
    if (rejectedAction.plan) {
      const planRejectedArtifact = this.buildPlanRejectedArtifact(rejectedAction.id);
      metadata.planRejectedArtifact = planRejectedArtifact;
      streamCallbacks?.onPlanRejected?.(planRejectedArtifact);
    }
    this.pending.clearPending(session);
    const responseText = "Understood. I canceled the pending action.";
    this.appendTurn(session, "assistant", responseText, TurnTypeEnum.REJECTION);
    this.pushAudit(audit, input, "pending_rejected", { actionId: rejectedAction.id });
    this.collectAssistantWarnings(responseText, warnings);

    this.touchSession(session, TurnTypeEnum.REJECTION);
    return this.buildOutput(
      input,
      session,
      TurnTypeEnum.REJECTION,
      responseText,
      toolCalls,
      audit,
      metadata,
      warnings,
    );
  }

  private async handleReasoningTurn(
    input: AgentTurnInput,
    session: Session,
    turnType: TurnType,
    toolCalls: ToolCallRecord[],
    audit: AuditRecord[],
    warnings: string[],
    stats: LoopStats,
    readCounters: ReadObservabilityCounters,
    linkCounters: LinkResolutionObservabilityCounters,
    streamCallbacks?: LoopStreamCallbacks,
  ): Promise<AgentTurnOutput> {
    const metadata: Record<string, unknown> = { loopStats: stats };
    const messages = this.buildInitialMessages(input, session, turnType);
    const authScope = this.resolveAuthScope(input);
    const suggestionDeclinedThisTurn = this.isSuggestionDeclineRequest(input);
    const suggestionDeclineDomain = suggestionDeclinedThisTurn
      ? this.resolveSuggestionDeclineDomain(session)
      : null;
    const implicitSuggestionPolicy = this.resolveImplicitSuggestionPolicy({
      input,
      session,
      turnType,
      authScope,
    });

    this.appendTurn(session, "user", input.message, turnType);
    this.pushAudit(audit, input, "user_turn", { turnType, message: input.message });
    if (suggestionDeclinedThisTurn) {
      const responseText = this.buildSuggestionDeclineClarificationQuestion(
        suggestionDeclineDomain,
      );
      this.appendTurn(session, "assistant", responseText, turnType);
      this.collectAssistantWarnings(responseText, warnings);
      this.pushAudit(audit, input, "suggestion_decline_clarification_prompted", {
        domain: suggestionDeclineDomain || undefined,
      });
      this.touchSession(session, turnType);
      return this.buildOutput(
        input,
        session,
        turnType,
        responseText,
        toolCalls,
        audit,
        metadata,
        warnings,
      );
    }

    const llmTools = this.llm.supportsTools()
      ? this.listToolsForScope(authScope)
      : undefined;
    const draftFlowLikely = this.isDraftFlowLikelyForTurn(input, session);

    let responseText = "";
    let iteration = 0;
    let invalidToolCallRecoveryAttempts = 0;
    let emptyFinalizationRecoveryAttempts = 0;
    let coverageRecoveryAttempts = 0;
    let draftToolEnforcementAttempts = 0;
    let draftDetailsRecoveryAttempts = 0;
    let suggestionEnforcementAttempts = 0;
    let savedDraftCandidateText = "";
    let iterationBufferedText = "";

    while (!responseText) {
      iteration += 1;
      stats.iterations = iteration;
      this.loopGuard.assertIteration(iteration);
      iterationBufferedText = "";
      const iterationAbortController = new AbortController();
      const bufferedStreamCallbacks: LoopStreamCallbacks | undefined = streamCallbacks
        ? {
            onTextDelta: (delta: string) => {
              if (typeof delta !== "string" || delta.length === 0) {
                return;
              }
              iterationBufferedText += delta;
            },
            onDraftArtifact: (artifact) => {
              streamCallbacks.onDraftArtifact?.(artifact);
            },
            onPlanArtifact: (artifact) => {
              streamCallbacks.onPlanArtifact?.(artifact);
            },
            onSuggestionArtifact: (artifact) => {
              streamCallbacks.onSuggestionArtifact?.(artifact);
            },
          }
        : undefined;

      const response = await this.loopGuard.wrapTimeout(
        this.generateAssistantResponse(
          {
            messages,
            tools: llmTools,
            metadata: {
              sessionId: input.sessionId,
              turnId: input.turnId,
              iteration,
              modelPreference:
                isRecord(input.metadata) && typeof input.metadata.modelPreference === "string"
                  ? input.metadata.modelPreference
                  : undefined,
            },
            signal: iterationAbortController.signal,
          },
          bufferedStreamCallbacks,
          draftFlowLikely,
        ),
        () => {
          iterationAbortController.abort();
          console.warn("[AGENT_LOOP_TIMEOUT]", {
            sessionId: input.sessionId,
            turnId: input.turnId,
            iteration,
            toolCallsSoFar: toolCalls.length,
            messagePreview: input.message.slice(0, 200),
          });
        },
      );

      if (draftFlowLikely) {
        console.info(
          "[DRAFT_TRACE_LOOP_ITERATION]",
          this.safeJsonStringify({
            sessionId: input.sessionId,
            turnId: input.turnId,
            iteration,
            toolCalls: response.toolCalls.map((tc) => tc.name),
            responseTextLength: String(response.text || "").trim().length,
          }),
        );
      }
      console.info(
        "[AGENT_LOOP_ITERATION_BUFFERED_TEXT]",
        this.safeJsonStringify({
          sessionId: input.sessionId,
          turnId: input.turnId,
          iteration,
          bufferedLength: iterationBufferedText.length,
          responseTextLength: String(response.text || "").trim().length,
          finishReason: response.finishReason,
        }),
      );

      const assistantMsg: LLMMessage = { role: "assistant", content: response.text ?? "" };
      if (response.toolCalls.length > 0) {
        assistantMsg.tool_calls = response.toolCalls.map((tc) => ({
          id: tc.id,
          type: "function" as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        }));
      }
      messages.push(assistantMsg);

      if (response.toolCalls.length === 0) {
        let candidateText = (response.text ?? "").trim();
        const providerFailure = this.isProviderFailureCandidate(candidateText, response.finishReason);
        if (candidateText) {
          if (providerFailure) {
            responseText = candidateText;
            warnings.push("LLM provider returned terminal error fallback.");
            break;
          }
          if (this.isInternalMetaLeakCandidate(candidateText)) {
            console.warn(
              "[AGENT_OUTPUT_META_LEAK_BLOCKED]",
              this.safeJsonStringify({
                sessionId: input.sessionId,
                turnId: input.turnId,
                iteration,
                path: "no_tool_calls",
                preview: this.truncate(candidateText, 220),
              }),
            );
            warnings.push("Model returned internal meta/reasoning scaffolding. Triggering sanitized recovery.");
            messages.push({
              role: "system",
              content: this.buildUserFacingOnlyRecoveryInstruction(input.message),
            });
            this.clearLastAssistantMessageForRecovery(messages);
            this.logBufferedTextDiscard(input, iteration, "internal_meta_leak_recovery", iterationBufferedText);
            const sanitized = this.extractUserFacingTextFromMetaLeak(candidateText);
            if (sanitized) {
              console.info(
                "[AGENT_OUTPUT_META_LEAK_SANITIZED]",
                this.safeJsonStringify({
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  iteration,
                  sanitizedLength: sanitized.length,
                }),
              );
              this.flushAcceptedBufferedText(streamCallbacks, sanitized);
              responseText = sanitized;
              break;
            }
            continue;
          }
          if (
            this.shouldEnforceImplicitSuggestion({
              policy: implicitSuggestionPolicy,
              suggestionCalls: toolCalls,
              candidateText,
            })
          ) {
            if (suggestionEnforcementAttempts >= SUGGESTION_ENFORCEMENT_MAX_ATTEMPTS) {
              this.flushAcceptedBufferedText(streamCallbacks, iterationBufferedText);
              if (implicitSuggestionPolicy.domain) {
                const fallbackSuggestion = this.buildImplicitSuggestionFallbackArtifact(
                  input,
                  implicitSuggestionPolicy.domain,
                );
                metadata.suggestionArtifact = fallbackSuggestion;
                this.recordSuggestionShown(session, input, audit, fallbackSuggestion);
                streamCallbacks?.onSuggestionArtifact?.(fallbackSuggestion);
                this.pushAudit(audit, input, "suggestion_fallback_artifact_emitted", {
                  domain: fallbackSuggestion.domain,
                  actionType: fallbackSuggestion.actionType,
                  targetType: fallbackSuggestion.targetType,
                  stage: "suggestion_tool_enforcement_no_tool_calls",
                });
                responseText = this.buildSuggestionReadyAcknowledgement(
                  input.message,
                  fallbackSuggestion,
                );
              } else {
                responseText = this.buildSuggestionClarificationMessage(
                  implicitSuggestionPolicy.domain,
                );
              }
              break;
            }
            suggestionEnforcementAttempts += 1;
            messages.push({
              role: "system",
              content: this.buildSuggestionToolEnforcementInstruction({
                userMessage: input.message,
                domain: implicitSuggestionPolicy.domain,
                candidateText,
              }),
            });
            this.clearLastAssistantMessageForRecovery(messages);
            this.logBufferedTextDiscard(
              input,
              iteration,
              "suggestion_tool_enforcement_no_tool_calls",
              iterationBufferedText,
            );
            continue;
          }
          if (draftFlowLikely || this.hasSuccessfulGenerateDraftToolCall(toolCalls)) {
            const hasDraftToolCallSoFar = this.hasSuccessfulGenerateDraftToolCall(toolCalls);
            console.warn(
              "[DRAFT_TRACE_FINAL_TEXT_WITHOUT_TOOL_CALL]",
              this.safeJsonStringify({
                sessionId: input.sessionId,
                turnId: input.turnId,
                iteration,
                candidateLength: candidateText.length,
                hasDraftToolCallSoFar,
                preview: this.truncate(candidateText, 240),
              }),
            );
            if (hasDraftToolCallSoFar && this.isPostDraftClarificationCandidate(candidateText)) {
              const normalized = this.coerceDraftReadyAcknowledgement(input.message, candidateText);
              console.warn(
                "[DRAFT_TRACE_CLARIFICATION_AFTER_DRAFT_SUPPRESSED]",
                this.safeJsonStringify({
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  iteration,
                  originalLength: candidateText.length,
                  normalizedLength: normalized.length,
                }),
              );
              candidateText = normalized;
            }
            if (
              this.isGenericDraftPrompt(input.message) &&
              !hasDraftToolCallSoFar &&
              !this.isClarificationRequestText(candidateText)
            ) {
              if (draftDetailsRecoveryAttempts >= DRAFT_DETAILS_RECOVERY_MAX_ATTEMPTS) {
                const fallbackClarification = this.coerceDraftDetailsClarification(
                  input.message,
                  candidateText,
                );
                console.warn(
                  "[DRAFT_TRACE_DETAILS_RECOVERY_CAPPED]",
                  this.safeJsonStringify({
                    sessionId: input.sessionId,
                    turnId: input.turnId,
                    iteration,
                    attempts: draftDetailsRecoveryAttempts,
                    candidateLength: candidateText.length,
                  }),
                );
                this.flushAcceptedBufferedText(streamCallbacks, iterationBufferedText);
                responseText = fallbackClarification;
                break;
              }
              draftDetailsRecoveryAttempts += 1;
              console.warn(
                "[DRAFT_TRACE_ENFORCE_CLARIFICATION_TEXT]",
                this.safeJsonStringify({
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  iteration,
                  attempts: draftDetailsRecoveryAttempts,
                  candidateLength: candidateText.length,
                }),
              );
              messages.push({
                role: "system",
                content: this.buildDraftDetailsRecoveryInstruction(input.message),
              });
              this.clearLastAssistantMessageForRecovery(messages);
              this.logBufferedTextDiscard(
                input,
                iteration,
                "draft_details_recovery",
                iterationBufferedText,
              );
              continue;
            }
          }
          const coverage = this.analyzeEntityCoverageForWorkloadQuery(
            authScope,
            input.message,
            toolCalls,
          );
          if (coverage.hasGap && coverageRecoveryAttempts < 2) {
            coverageRecoveryAttempts += 1;
            readCounters.READ_WARNINGS += 1;
            console.warn(
              "[READ_ENTITY_COVERAGE_GAP]",
              this.safeJsonStringify({
                sessionId: input.sessionId,
                turnId: input.turnId,
                iteration,
                attempts: coverageRecoveryAttempts,
                expectedTools: coverage.expectedTools,
                executedTools: coverage.executedTools,
                missingTools: coverage.missingTools,
              }),
            );
            messages.push({
              role: "system",
              content: this.buildCoverageRecoveryInstruction(input.message, coverage.missingTools),
            });
            this.clearLastAssistantMessageForRecovery(messages);
            this.logBufferedTextDiscard(input, iteration, "coverage_recovery", iterationBufferedText);
            continue;
          }
          if (
            this.isLikelyPlaceholderCompletion(candidateText) &&
            stats.toolCalls > 0 &&
            emptyFinalizationRecoveryAttempts < 2
          ) {
            emptyFinalizationRecoveryAttempts += 1;
            messages.push({
              role: "system",
              content: this.buildFinalizationRecoveryInstruction(input.message),
            });
            this.clearLastAssistantMessageForRecovery(messages);
            this.logBufferedTextDiscard(input, iteration, "finalization_recovery", iterationBufferedText);
            continue;
          }
          if (
            this.shouldEnforceDraftToolCall({
              input,
              candidateText,
              toolCalls,
              attempts: draftToolEnforcementAttempts,
              sessionHasCurrentDraft: Boolean(session.currentDraft),
            })
          ) {
            draftToolEnforcementAttempts += 1;
            savedDraftCandidateText = candidateText;
            console.warn(
              "[DRAFT_TRACE_ENFORCE_TOOLCALL]",
              this.safeJsonStringify({
                sessionId: input.sessionId,
                turnId: input.turnId,
                iteration,
                attempts: draftToolEnforcementAttempts,
                candidateLength: candidateText.length,
              }),
            );
            messages.push({
              role: "system",
              content: this.buildDraftToolEnforcementInstruction(input.message, candidateText),
            });
            this.clearLastAssistantMessageForRecovery(messages);
            this.logBufferedTextDiscard(input, iteration, "draft_tool_enforcement", iterationBufferedText);
            continue;
          }
          this.flushAcceptedBufferedText(streamCallbacks, iterationBufferedText);
          responseText = candidateText;
          break;
        }

        if (stats.toolCalls > 0 && emptyFinalizationRecoveryAttempts < 2) {
          emptyFinalizationRecoveryAttempts += 1;
          messages.push({
            role: "system",
            content: this.buildFinalizationRecoveryInstruction(input.message),
          });
          this.clearLastAssistantMessageForRecovery(messages);
          this.logBufferedTextDiscard(input, iteration, "empty_finalization_recovery", iterationBufferedText);
          continue;
        }

        responseText =
          stats.toolCalls > 0
            ? "I retrieved data but could not generate a final response text. Please retry."
            : "I could not generate a valid response. Please retry.";
        warnings.push("Model returned empty final text.");
        break;
      }

      let validToolCalls = response.toolCalls.filter(
        (toolCall) => typeof toolCall?.name === "string" && this.registry.get(toolCall.name),
      );
      let invalidToolCalls = response.toolCalls.filter(
        (toolCall) => !(typeof toolCall?.name === "string" && this.registry.get(toolCall.name)),
      );

      if (invalidToolCalls.length > 0) {
        const recoveredCalls = this.recoverInvalidToolCalls(invalidToolCalls, input, iteration);
        if (recoveredCalls.length > 0) {
          validToolCalls = validToolCalls.concat(recoveredCalls);
          const recoveredIds = new Set(recoveredCalls.map((call) => call.id));
          invalidToolCalls = invalidToolCalls.filter((call) => !recoveredIds.has(call.id));
        }
      }

      if (invalidToolCalls.length > 0) {
        console.warn(
          "[LLM_TOOL_CALLS_INVALID]",
          this.safeJsonStringify({
            sessionId: input.sessionId,
            turnId: input.turnId,
            iteration,
            invalidCount: invalidToolCalls.length,
            invalidNames: invalidToolCalls.map((toolCall) => toolCall?.name || "unknown"),
          }),
        );
      }

      if (validToolCalls.length === 0) {
        let candidateText = (response.text ?? "").trim();
        const providerFailure = this.isProviderFailureCandidate(candidateText, response.finishReason);
        const rejectCandidateText = this.shouldRejectMalformedCandidateText({
          candidateText,
          userMessage: input.message,
          invalidToolCalls,
          toolCallsSoFar: stats.toolCalls,
        });

        if (candidateText && !rejectCandidateText) {
          if (providerFailure) {
            responseText = candidateText;
            warnings.push("LLM provider returned terminal error fallback.");
            break;
          }
          if (this.isInternalMetaLeakCandidate(candidateText)) {
            console.warn(
              "[AGENT_OUTPUT_META_LEAK_BLOCKED]",
              this.safeJsonStringify({
                sessionId: input.sessionId,
                turnId: input.turnId,
                iteration,
                path: "after_invalid_tool_calls",
                preview: this.truncate(candidateText, 220),
              }),
            );
            warnings.push("Model returned internal meta/reasoning scaffolding after invalid tool call. Triggering sanitized recovery.");
            messages.push({
              role: "system",
              content: this.buildUserFacingOnlyRecoveryInstruction(input.message),
            });
            this.clearLastAssistantMessageForRecovery(messages);
            this.logBufferedTextDiscard(
              input,
              iteration,
              "internal_meta_leak_recovery_after_invalid",
              iterationBufferedText,
            );
            const sanitized = this.extractUserFacingTextFromMetaLeak(candidateText);
            if (sanitized) {
              console.info(
                "[AGENT_OUTPUT_META_LEAK_SANITIZED]",
                this.safeJsonStringify({
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  iteration,
                  sanitizedLength: sanitized.length,
                }),
              );
              this.flushAcceptedBufferedText(streamCallbacks, sanitized);
              responseText = sanitized;
              break;
            }
            continue;
          }
          if (
            this.shouldEnforceImplicitSuggestion({
              policy: implicitSuggestionPolicy,
              suggestionCalls: toolCalls,
              candidateText,
            })
          ) {
            if (suggestionEnforcementAttempts >= SUGGESTION_ENFORCEMENT_MAX_ATTEMPTS) {
              this.flushAcceptedBufferedText(streamCallbacks, iterationBufferedText);
              if (implicitSuggestionPolicy.domain) {
                const fallbackSuggestion = this.buildImplicitSuggestionFallbackArtifact(
                  input,
                  implicitSuggestionPolicy.domain,
                );
                metadata.suggestionArtifact = fallbackSuggestion;
                this.recordSuggestionShown(session, input, audit, fallbackSuggestion);
                streamCallbacks?.onSuggestionArtifact?.(fallbackSuggestion);
                this.pushAudit(audit, input, "suggestion_fallback_artifact_emitted", {
                  domain: fallbackSuggestion.domain,
                  actionType: fallbackSuggestion.actionType,
                  targetType: fallbackSuggestion.targetType,
                  stage: "suggestion_tool_enforcement_after_invalid_calls",
                });
                responseText = this.buildSuggestionReadyAcknowledgement(
                  input.message,
                  fallbackSuggestion,
                );
              } else {
                responseText = this.buildSuggestionClarificationMessage(
                  implicitSuggestionPolicy.domain,
                );
              }
              break;
            }
            suggestionEnforcementAttempts += 1;
            messages.push({
              role: "system",
              content: this.buildSuggestionToolEnforcementInstruction({
                userMessage: input.message,
                domain: implicitSuggestionPolicy.domain,
                candidateText,
              }),
            });
            this.clearLastAssistantMessageForRecovery(messages);
            this.logBufferedTextDiscard(
              input,
              iteration,
              "suggestion_tool_enforcement_after_invalid_calls",
              iterationBufferedText,
            );
            continue;
          }
          if (draftFlowLikely || this.hasSuccessfulGenerateDraftToolCall(toolCalls)) {
            const hasDraftToolCallSoFar = this.hasSuccessfulGenerateDraftToolCall(toolCalls);
            console.warn(
              "[DRAFT_TRACE_FINAL_TEXT_AFTER_INVALID_TOOL_CALLS]",
              this.safeJsonStringify({
                sessionId: input.sessionId,
                turnId: input.turnId,
                iteration,
                invalidToolCalls: invalidToolCalls.map((call) => call?.name || "unknown"),
                candidateLength: candidateText.length,
                hasDraftToolCallSoFar,
                preview: this.truncate(candidateText, 240),
              }),
            );
            if (hasDraftToolCallSoFar && this.isPostDraftClarificationCandidate(candidateText)) {
              const normalized = this.coerceDraftReadyAcknowledgement(input.message, candidateText);
              console.warn(
                "[DRAFT_TRACE_CLARIFICATION_AFTER_DRAFT_SUPPRESSED]",
                this.safeJsonStringify({
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  iteration,
                  path: "after_invalid_tool_calls",
                  originalLength: candidateText.length,
                  normalizedLength: normalized.length,
                }),
              );
              candidateText = normalized;
            }
            if (
              this.isGenericDraftPrompt(input.message) &&
              !hasDraftToolCallSoFar &&
              !this.isClarificationRequestText(candidateText)
            ) {
              if (draftDetailsRecoveryAttempts >= DRAFT_DETAILS_RECOVERY_MAX_ATTEMPTS) {
                const fallbackClarification = this.coerceDraftDetailsClarification(
                  input.message,
                  candidateText,
                );
                console.warn(
                  "[DRAFT_TRACE_DETAILS_RECOVERY_CAPPED]",
                  this.safeJsonStringify({
                    sessionId: input.sessionId,
                    turnId: input.turnId,
                    iteration,
                    path: "after_invalid_tool_calls",
                    attempts: draftDetailsRecoveryAttempts,
                    candidateLength: candidateText.length,
                  }),
                );
                this.flushAcceptedBufferedText(streamCallbacks, iterationBufferedText);
                responseText = fallbackClarification;
                break;
              }
              draftDetailsRecoveryAttempts += 1;
              console.warn(
                "[DRAFT_TRACE_ENFORCE_CLARIFICATION_TEXT]",
                this.safeJsonStringify({
                  sessionId: input.sessionId,
                  turnId: input.turnId,
                  iteration,
                  path: "after_invalid_tool_calls",
                  attempts: draftDetailsRecoveryAttempts,
                  candidateLength: candidateText.length,
                }),
              );
              messages.push({
                role: "system",
                content: this.buildDraftDetailsRecoveryInstruction(input.message),
              });
              this.clearLastAssistantMessageForRecovery(messages);
              this.logBufferedTextDiscard(
                input,
                iteration,
                "draft_details_recovery_after_invalid",
                iterationBufferedText,
              );
              continue;
            }
          }
          const coverage = this.analyzeEntityCoverageForWorkloadQuery(
            authScope,
            input.message,
            toolCalls,
          );
          if (coverage.hasGap && coverageRecoveryAttempts < 2) {
            coverageRecoveryAttempts += 1;
            readCounters.READ_WARNINGS += 1;
            console.warn(
              "[READ_ENTITY_COVERAGE_GAP]",
              this.safeJsonStringify({
                sessionId: input.sessionId,
                turnId: input.turnId,
                iteration,
                attempts: coverageRecoveryAttempts,
                expectedTools: coverage.expectedTools,
                executedTools: coverage.executedTools,
                missingTools: coverage.missingTools,
              }),
            );
            messages.push({
              role: "system",
              content: this.buildCoverageRecoveryInstruction(input.message, coverage.missingTools),
            });
            this.clearLastAssistantMessageForRecovery(messages);
            this.logBufferedTextDiscard(input, iteration, "coverage_recovery_after_invalid", iterationBufferedText);
            continue;
          }
          if (
            this.shouldEnforceDraftToolCall({
              input,
              candidateText,
              toolCalls,
              attempts: draftToolEnforcementAttempts,
              sessionHasCurrentDraft: Boolean(session.currentDraft),
            })
          ) {
            draftToolEnforcementAttempts += 1;
            savedDraftCandidateText = candidateText;
            console.warn(
              "[DRAFT_TRACE_ENFORCE_TOOLCALL]",
              this.safeJsonStringify({
                sessionId: input.sessionId,
                turnId: input.turnId,
                iteration,
                attempts: draftToolEnforcementAttempts,
                candidateLength: candidateText.length,
                path: "after_invalid_tool_calls",
              }),
            );
            messages.push({
              role: "system",
              content: this.buildDraftToolEnforcementInstruction(input.message, candidateText),
            });
            this.clearLastAssistantMessageForRecovery(messages);
            this.logBufferedTextDiscard(input, iteration, "draft_tool_enforcement_after_invalid", iterationBufferedText);
            continue;
          }
          this.flushAcceptedBufferedText(streamCallbacks, iterationBufferedText);
          responseText = candidateText;
          warnings.push("Model returned malformed tool calls before final response.");
          break;
        }

        invalidToolCallRecoveryAttempts += 1;
        messages.push({
          role: "system",
          content: this.buildToolCallRecoveryInstruction(invalidToolCalls, input.message),
        });
        this.clearLastAssistantMessageForRecovery(messages);
        this.logBufferedTextDiscard(input, iteration, "invalid_toolcall_recovery", iterationBufferedText);

        if (invalidToolCallRecoveryAttempts >= 4) {
          responseText =
            "I could not process malformed tool-call output from the model. Please retry.";
          warnings.push("Model repeatedly returned malformed tool calls without valid executable tools.");
          break;
        }
        continue;
      }

      if (validToolCalls.some((toolCall) => toolCall.name === "generateDraft")) {
        savedDraftCandidateText = "";
      }

      if (
        this.shouldEnforceImplicitSuggestion({
          policy: implicitSuggestionPolicy,
          suggestionCalls: toolCalls,
          llmToolCalls: validToolCalls,
        })
      ) {
        if (suggestionEnforcementAttempts >= SUGGESTION_ENFORCEMENT_MAX_ATTEMPTS) {
          if (implicitSuggestionPolicy.domain) {
            const fallbackSuggestion = this.buildImplicitSuggestionFallbackArtifact(
              input,
              implicitSuggestionPolicy.domain,
            );
            metadata.suggestionArtifact = fallbackSuggestion;
            this.recordSuggestionShown(session, input, audit, fallbackSuggestion);
            streamCallbacks?.onSuggestionArtifact?.(fallbackSuggestion);
            this.pushAudit(audit, input, "suggestion_fallback_artifact_emitted", {
              domain: fallbackSuggestion.domain,
              actionType: fallbackSuggestion.actionType,
              targetType: fallbackSuggestion.targetType,
              stage: "suggestion_tool_enforcement_missing_system_call",
            });
            responseText = this.buildSuggestionReadyAcknowledgement(
              input.message,
              fallbackSuggestion,
            );
          } else {
            responseText = this.buildSuggestionClarificationMessage(
              implicitSuggestionPolicy.domain,
            );
          }
          break;
        }
        suggestionEnforcementAttempts += 1;
        messages.push({
          role: "system",
          content: this.buildSuggestionToolEnforcementInstruction({
            userMessage: input.message,
            domain: implicitSuggestionPolicy.domain,
            candidateText: String(response.text || "").trim(),
          }),
        });
        this.clearLastAssistantMessageForRecovery(messages);
        this.logBufferedTextDiscard(
          input,
          iteration,
          "suggestion_tool_enforcement_missing_system_call",
          iterationBufferedText,
        );
        continue;
      }

      const processed = await this.processToolCalls(validToolCalls, {
        input,
        session,
        turnType,
        messages,
        toolCalls,
        audit,
        warnings,
        stats,
        readCounters,
        linkCounters,
        implicitSuggestionPolicy,
        suggestionDeclinedThisTurn,
        streamCallbacks,
      });

      if (processed.stopForConfirmation) {
        responseText = processed.confirmationMessage ?? "I prepared a pending action.";
        if (processed.replacedPendingActionId) {
          metadata.replacedPendingActionId = processed.replacedPendingActionId;
        }
        if (processed.planArtifact) {
          metadata.planArtifact = processed.planArtifact;
        }
      }
      if (processed.suggestionArtifact) {
        metadata.suggestionArtifact = processed.suggestionArtifact;
      }
    }

    responseText = this.maybeSynthesizeDraftArtifactFromInlineText({
      input,
      session,
      turnType,
      responseText,
      savedDraftCandidateText,
      draftToolEnforcementAttempts,
      toolCalls,
      audit,
      stats,
      streamCallbacks,
    });

    if (
      implicitSuggestionPolicy.required &&
      implicitSuggestionPolicy.domain &&
      !suggestionDeclinedThisTurn &&
      !metadata.suggestionArtifact &&
      !this.hasSuccessfulSuggestionToolCall(toolCalls) &&
      !this.isClarificationRequestText(responseText)
    ) {
      const fallbackSuggestion = this.buildImplicitSuggestionFallbackArtifact(
        input,
        implicitSuggestionPolicy.domain,
      );
      metadata.suggestionArtifact = fallbackSuggestion;
      this.recordSuggestionShown(session, input, audit, fallbackSuggestion);
      streamCallbacks?.onSuggestionArtifact?.(fallbackSuggestion);
      this.pushAudit(audit, input, "suggestion_fallback_artifact_emitted", {
        domain: fallbackSuggestion.domain,
        actionType: fallbackSuggestion.actionType,
        targetType: fallbackSuggestion.targetType,
        stage: "post_loop_fallback",
      });
      responseText = this.buildSuggestionReadyAcknowledgement(input.message, fallbackSuggestion);
    }

    if (!metadata.suggestionArtifact) {
      const finalizedSuggestion = this.extractLatestSuggestionArtifactFromToolCalls(toolCalls);
      if (finalizedSuggestion) {
        metadata.suggestionArtifact = finalizedSuggestion;
      }
    }
    const normalizedSuggestion = this.normalizeSuggestionArtifact(
      metadata.suggestionArtifact,
    );
    if (normalizedSuggestion && !suggestionDeclinedThisTurn) {
      metadata.suggestionArtifact = normalizedSuggestion;
      responseText = this.buildSuggestionReadyAcknowledgement(
        input.message,
        normalizedSuggestion,
      );
    }

    this.logNoToolReadWarningIfNeeded(input.message, toolCalls.length, readCounters);

    this.appendTurn(session, "assistant", responseText, turnType);
    this.pushAudit(audit, input, "assistant_response", {
      toolCallsCount: toolCalls.length,
      responseText,
    });
    this.collectAssistantWarnings(responseText, warnings);
    if (this.hasSuccessfulGenerateDraftToolCall(toolCalls)) {
      const finalizedDraft = this.normalizeDraftArtifact(session.currentDraft);
      if (finalizedDraft) {
        metadata.draftArtifact = finalizedDraft;
      }
    }

    this.touchSession(session, turnType);
    return this.buildOutput(
      input,
      session,
      turnType,
      responseText,
      toolCalls,
      audit,
      metadata,
      warnings,
    );
  }

  private canParallelizeReadToolCalls(llmToolCalls: LLMToolCall[]): boolean {
    if (llmToolCalls.length <= 1) return false;
    return llmToolCalls.every((tc) => {
      const tool = this.registry.get(tc.name);
      return tool && tool.category === ToolCategory.READ;
    });
  }

  private async processReadToolCallsInParallel(
    llmToolCalls: LLMToolCall[],
    context: ToolCallProcessingContext,
  ): Promise<ToolCallProcessingResult> {
    console.info(
      "[PARALLEL_READ_BATCH]",
      this.safeJsonStringify({
        sessionId: context.input.sessionId,
        turnId: context.input.turnId,
        count: llmToolCalls.length,
        tools: llmToolCalls.map((tc) => tc.name),
      }),
    );

    // Pre-validate all tools and collect valid ones
    const validCalls: Array<{
      llmToolCall: LLMToolCall;
      tool: NonNullable<ReturnType<ToolRegistry["get"]>>;
      args: Record<string, unknown>;
      callId: string;
    }> = [];

    for (const llmToolCall of llmToolCalls) {
      context.stats.toolCalls += 1;
      const toolName = llmToolCall.name;
      console.info(
        "[LLM_TOOL_CALL_RAW]",
        this.safeJsonStringify({
          sessionId: context.input.sessionId,
          turnId: context.input.turnId,
          toolCallId: llmToolCall.id || null,
          toolName,
          rawArguments: llmToolCall.arguments,
        }),
      );
      const args = this.normalizeArgs(llmToolCall.arguments);
      const callId = llmToolCall.id || this.createId("tool_call");

      const tool = this.registry.get(toolName);
      if (!tool) {
        const result: ToolExecutionResult = {
          ok: false,
          errorCode: "TOOL_NOT_FOUND",
          errorMessage: `Tool "${toolName}" is not registered`,
        };
        const record = this.createToolRecord(toolName, args, this.createExecutionContext(context.input, context.session), result);
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, result),
        });
        this.pushAudit(context.audit, context.input, "tool_call_failed", {
          toolName,
          errorCode: result.errorCode,
        });
        continue;
      }

      this.collectPreExecutionReadDiagnostics(tool.name, args, context.readCounters);

      const authScope = this.resolveAuthScope(context.input);
      const decision = this.permissionGate.evaluate({ authScope }, tool);
      const boundaryFailure = this.validatePermissionBoundary(
        context.input,
        context.session,
        tool.category,
        decision,
        toolName,
      );
      if (boundaryFailure) {
        const record = this.createToolRecord(
          toolName,
          args,
          this.createExecutionContext(context.input, context.session),
          boundaryFailure,
        );
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, boundaryFailure),
        });
        this.pushAudit(context.audit, context.input, "tool_call_security_blocked", {
          toolName,
          errorCode: boundaryFailure.errorCode,
          reason: boundaryFailure.errorMessage,
        });
        continue;
      }
      if (!decision.allowed) {
        const result: ToolExecutionResult = {
          ok: false,
          errorCode: "TOOL_PERMISSION_DENIED",
          errorMessage: decision.reason ?? "Tool is not allowed.",
        };
        const record = this.createToolRecord(toolName, args, this.createExecutionContext(context.input, context.session), result);
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, result),
        });
        this.pushAudit(context.audit, context.input, "tool_call_denied", {
          toolName,
          reason: result.errorMessage,
        });
        continue;
      }

      validCalls.push({ llmToolCall, tool, args, callId });
    }

    // Execute all valid READ tools in parallel
    const startTime = Date.now();
    const executionResults = await Promise.all(
      validCalls.map(async ({ tool, args, callId }) => {
        const executionContext = this.createExecutionContext(context.input, context.session);
        try {
          const result = await this.executor.execute(tool, executionContext, args);
          return { tool, args, callId, executionContext, result };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error || "unknown error");
          const result: ToolExecutionResult = {
            ok: false,
            errorCode: "TOOL_EXECUTION_ERROR",
            errorMessage,
          };
          return { tool, args, callId, executionContext, result };
        }
      }),
    );
    const parallelDuration = Date.now() - startTime;
    console.info(
      "[PARALLEL_READ_COMPLETE]",
      this.safeJsonStringify({
        sessionId: context.input.sessionId,
        turnId: context.input.turnId,
        count: executionResults.length,
        durationMs: parallelDuration,
      }),
    );

    // Process results sequentially (message ordering matters)
    for (const { tool, args, callId, executionContext, result } of executionResults) {
      this.collectToolWarnings(result, context.warnings);
      this.trackReadToolResult(result, context.readCounters);
      if (result.ok) {
        this.trackToolEntities(context.session, result, tool.name, context.input.turnId);
      }

      const record = this.createToolRecord(tool.name, args, executionContext, result);
      record.id = callId;
      context.toolCalls.push(record);

      const toolMessageContent = this.serializeToolMessage(tool.name, result);
      context.messages.push({
        role: "tool",
        name: tool.name,
        toolCallId: callId,
        content: toolMessageContent,
      });

      this.appendTurn(
        context.session,
        "tool",
        this.summarizeToolMessageForHistory(tool.name, toolMessageContent),
        context.turnType,
        [record],
      );

      this.pushAudit(context.audit, context.input, "tool_call_processed", {
        toolName: tool.name,
        ok: result.ok,
        errorCode: result.errorCode,
      });
    }

    return { stopForConfirmation: false };
  }

  private async processToolCalls(
    llmToolCalls: LLMToolCall[],
    context: ToolCallProcessingContext,
  ): Promise<ToolCallProcessingResult> {
    // Fast path: if all calls are READ tools, execute in parallel
    if (this.canParallelizeReadToolCalls(llmToolCalls)) {
      return this.processReadToolCallsInParallel(llmToolCalls, context);
    }

    for (const llmToolCall of llmToolCalls) {
      context.stats.toolCalls += 1;
      const toolName = llmToolCall.name;
      console.info(
        "[LLM_TOOL_CALL_RAW]",
        this.safeJsonStringify({
          sessionId: context.input.sessionId,
          turnId: context.input.turnId,
          toolCallId: llmToolCall.id || null,
          toolName,
          rawArguments: llmToolCall.arguments,
        }),
      );
      const args = this.normalizeArgs(llmToolCall.arguments);
      if (isRecord(args) && "tool" in args && "result" in args) {
        console.warn(
          "[LLM_TOOL_ARGS_WRAPPED_RESULT]",
          this.safeJsonStringify({
            sessionId: context.input.sessionId,
            turnId: context.input.turnId,
            toolName,
            argKeys: Object.keys(args),
          }),
        );
      }
      const callId = llmToolCall.id || this.createId("tool_call");

      const tool = this.registry.get(toolName);
      if (!tool) {
        const result: ToolExecutionResult = {
          ok: false,
          errorCode: "TOOL_NOT_FOUND",
          errorMessage: `Tool "${toolName}" is not registered`,
        };
        const record = this.createToolRecord(toolName, args, this.createExecutionContext(context.input, context.session), result);
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, result),
        });
        this.pushAudit(context.audit, context.input, "tool_call_failed", {
          toolName,
          errorCode: result.errorCode,
        });
        continue;
      }

      this.collectPreExecutionReadDiagnostics(tool.name, args, context.readCounters);

      const authScope = this.resolveAuthScope(context.input);
      const decision = this.permissionGate.evaluate({ authScope }, tool);
      const boundaryFailure = this.validatePermissionBoundary(
        context.input,
        context.session,
        tool.category,
        decision,
        toolName,
      );
      if (boundaryFailure) {
        console.warn(
          "[DRAFT_TRACE_TOOL_DENIED]",
          this.safeJsonStringify({
            sessionId: context.input.sessionId,
            turnId: context.input.turnId,
            toolName,
            category: tool.category,
            stage: "security_boundary",
            errorCode: boundaryFailure.errorCode,
            reason: boundaryFailure.errorMessage,
          }),
        );
        const record = this.createToolRecord(
          toolName,
          args,
          this.createExecutionContext(context.input, context.session),
          boundaryFailure,
        );
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, boundaryFailure),
        });
        this.pushAudit(context.audit, context.input, "tool_call_security_blocked", {
          toolName,
          errorCode: boundaryFailure.errorCode,
          reason: boundaryFailure.errorMessage,
        });
        continue;
      }
      if (!decision.allowed) {
        const result: ToolExecutionResult = {
          ok: false,
          errorCode: "TOOL_PERMISSION_DENIED",
          errorMessage: decision.reason ?? "Tool is not allowed.",
        };
        console.warn(
          "[DRAFT_TRACE_TOOL_DENIED]",
          this.safeJsonStringify({
            sessionId: context.input.sessionId,
            turnId: context.input.turnId,
            toolName,
            category: tool.category,
            stage: "permission_gate",
            errorCode: result.errorCode,
            reason: result.errorMessage,
          }),
        );
        const record = this.createToolRecord(toolName, args, this.createExecutionContext(context.input, context.session), result);
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, result),
        });
        this.pushAudit(context.audit, context.input, "tool_call_denied", {
          toolName,
          reason: result.errorMessage,
        });
        continue;
      }

      if (tool.category === ToolCategory.PLAN) {
        const executionContext = this.createExecutionContext(context.input, context.session);
        const preflight = this.resolvePlanLinkingPreflight(
          toolName,
          args,
          context.session,
          context.input,
        );
        this.trackLinkResolutionObservability(preflight.linkResolution, context.linkCounters);
        let executionArgs = preflight.args;
        let linkResolutionDiagnostic = preflight.linkResolution;
        let result = preflight.result
          ? preflight.result
          : await this.executor.execute(tool, executionContext, executionArgs);
        this.collectToolWarnings(result, context.warnings);

        const proposal = result.ok ? this.extractPlanProposal(result) : null;
        let operationForPlanning: PlanOperation | null = proposal?.operation || null;
        if (result.ok && !proposal) {
          result = {
            ok: false,
            errorCode: "INVALID_PLAN_PROPOSAL",
            errorMessage:
              `Tool "${toolName}" must return data.proposal with ` +
              "operation/entityType/summary for PLAN interception.",
          };
        }

        if (
          result.ok &&
          proposal &&
          operationForPlanning &&
          toolName === "proposeCreate" &&
          isRecord(executionArgs?.payload)
        ) {
          operationForPlanning = {
            ...operationForPlanning,
            payload: { ...executionArgs.payload },
          };
        }

        if (result.ok && proposal && operationForPlanning) {
          const previousPending = context.session.state.pendingAction;
          const replacedPendingActionId =
            context.turnType === TurnTypeEnum.AMENDMENT && previousPending
              ? previousPending.id
              : undefined;
          const expanded = await this.workflowPlanner.expand({
            operation: operationForPlanning,
            summary: proposal.summary,
            preview: proposal.preview,
            userMessage: context.input.message,
            linkResolution: linkResolutionDiagnostic,
          });
          const planLinkResolution =
            expanded.plan?.diagnostics?.linkResolution || linkResolutionDiagnostic;
          const linkResolutionSourceTrace =
            this.resolveLinkResolutionSourceTrace(planLinkResolution);
          const pendingAction = this.createPendingPlanAction({
            toolName,
            args: executionArgs,
            input: context.input,
            summary: expanded.summary,
            plan: expanded.plan,
          });
          this.pending.setPending(context.session, pendingAction);

          const planArtifact = this.buildPlanArtifact(pendingAction);
          context.streamCallbacks?.onPlanArtifact?.(planArtifact);

          const interceptedResult: ToolExecutionResult = {
            ok: true,
            data: {
              status: "pending_confirmation",
              pendingActionId: pendingAction.id,
              tool: toolName,
              proposal,
            },
            metadata: {
              intercepted: true,
              planArtifact,
              ...(replacedPendingActionId ? { replacedPendingActionId } : {}),
            },
          };

          const record = this.createToolRecord(
            toolName,
            executionArgs,
            executionContext,
            interceptedResult,
            {
              intercepted: true,
              planArtifact,
              ...(replacedPendingActionId ? { replacedPendingActionId } : {}),
            },
          );
          record.id = callId;
          context.toolCalls.push(record);

          context.messages.push({
            role: "tool",
            name: toolName,
            toolCallId: callId,
            content: this.serializeToolMessage(toolName, interceptedResult),
          });

          this.pushAudit(context.audit, context.input, "pending_action_created", {
            pendingActionId: pendingAction.id,
            toolName,
            replacedPendingActionId,
            category: "PLAN",
            ...(linkResolutionSourceTrace
              ? { linkResolutionSourceTrace }
              : {}),
            ...(typeof planLinkResolution?.status === "string"
              ? { linkResolutionStatus: planLinkResolution.status }
              : {}),
          });

          return {
            stopForConfirmation: true,
            confirmationMessage: this.buildConfirmationMessage(pendingAction),
            replacedPendingActionId,
            planArtifact,
          };
        }

        const record = this.createToolRecord(toolName, args, executionContext, result);
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, result),
        });
        this.appendTurn(
          context.session,
          "tool",
          this.summarizeToolMessageForHistory(
            toolName,
            this.serializeToolMessage(toolName, result),
          ),
          context.turnType,
          [record],
        );
        this.pushAudit(context.audit, context.input, "tool_call_processed", {
          toolName,
          ok: result.ok,
          errorCode: result.errorCode,
        });
        const linkResolutionClarification = this.tryBuildPlanLinkResolutionClarification(
          result,
          executionArgs,
        );
        if (linkResolutionClarification) {
          return {
            stopForConfirmation: true,
            confirmationMessage: linkResolutionClarification,
          };
        }
        continue;
      }

      if (tool.category === ToolCategory.WRITE || tool.category === ToolCategory.EXECUTE) {
        const previousPending = context.session.state.pendingAction;
        const replacedPendingActionId =
          context.turnType === TurnTypeEnum.AMENDMENT && previousPending
            ? previousPending.id
            : undefined;

        const pendingAction = this.createPendingAction(toolName, args, context.input, tool.category);
        this.pending.setPending(context.session, pendingAction);

        const interceptedResult: ToolExecutionResult = {
          ok: true,
          data: {
            status: "pending_confirmation",
            pendingActionId: pendingAction.id,
            tool: toolName,
          },
          metadata: {
            intercepted: true,
            ...(replacedPendingActionId ? { replacedPendingActionId } : {}),
          },
        };

        const record = this.createToolRecord(
          toolName,
          args,
          this.createExecutionContext(context.input, context.session),
          interceptedResult,
          {
            intercepted: true,
            ...(replacedPendingActionId ? { replacedPendingActionId } : {}),
          },
        );
        record.id = callId;
        context.toolCalls.push(record);

        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, interceptedResult),
        });

        this.pushAudit(context.audit, context.input, "pending_action_created", {
          pendingActionId: pendingAction.id,
          toolName,
          replacedPendingActionId,
        });

        return {
          stopForConfirmation: true,
          confirmationMessage: this.buildConfirmationMessage(pendingAction),
          replacedPendingActionId,
        };
      }

      if (tool.category === ToolCategory.SYSTEM) {
        const executionContext = this.createExecutionContext(context.input, context.session);
        if (toolName === "suggestAction" && !this.isSuggestionFeatureEnabled()) {
          const deniedResult: ToolExecutionResult = {
            ok: false,
            errorCode: "SUGGESTIONS_DISABLED",
            errorMessage:
              "Suggestion rollout is currently disabled by feature flag.",
            metadata: {
              category: "SYSTEM",
              stage: "suggestion_feature_flag_guard",
            },
          };
          const record = this.createToolRecord(toolName, args, executionContext, deniedResult);
          record.id = callId;
          context.toolCalls.push(record);
          context.messages.push({
            role: "tool",
            name: toolName,
            toolCallId: callId,
            content: this.serializeToolMessage(toolName, deniedResult),
          });
          this.pushAudit(context.audit, context.input, "tool_call_denied", {
            toolName,
            reason: deniedResult.errorMessage || "suggestion feature disabled",
            errorCode: deniedResult.errorCode,
          });
          if (context.implicitSuggestionPolicy?.required) {
            this.recordSuggestionFallback(
              context.session,
              context.input,
              context.audit,
              context.implicitSuggestionPolicy.domain,
              deniedResult.errorCode,
            );
            return {
              stopForConfirmation: true,
              confirmationMessage: this.buildSuggestionFailureFallbackMessage(
                context.implicitSuggestionPolicy.domain,
              ),
            };
          }
          continue;
        }
        if (
          toolName === "suggestAction" &&
          this.countSuccessfulSuggestionToolCalls(context.toolCalls) >= 1
        ) {
          const deniedResult: ToolExecutionResult = {
            ok: false,
            errorCode: "SUGGESTION_LIMIT_REACHED",
            errorMessage:
              "At most one suggestion can be emitted per turn. Do not call suggestAction again in this turn.",
            metadata: {
              category: "SYSTEM",
              stage: "suggestion_limit_guard",
            },
          };
          const record = this.createToolRecord(toolName, args, executionContext, deniedResult);
          record.id = callId;
          context.toolCalls.push(record);
          context.messages.push({
            role: "tool",
            name: toolName,
            toolCallId: callId,
            content: this.serializeToolMessage(toolName, deniedResult),
          });
          this.pushAudit(context.audit, context.input, "tool_call_denied", {
            toolName,
            reason: deniedResult.errorMessage || "suggestion limit reached",
            errorCode: deniedResult.errorCode,
          });
          continue;
        }

        let result = await this.executor.execute(tool, executionContext, args);
        this.collectToolWarnings(result, context.warnings);
        let suggestionArtifact: SuggestionArtifact | null = null;
        if (toolName === "suggestAction" && result.ok) {
          suggestionArtifact = this.extractSuggestionArtifactFromToolResult(result);
          if (!suggestionArtifact) {
            result = {
              ok: false,
              errorCode: "INVALID_SUGGESTION_ARTIFACT",
              errorMessage:
                "suggestAction must return data.artifact with required suggestion fields.",
              metadata: {
                category: "SYSTEM",
                stage: "suggestion_validation_guard",
              },
            };
          } else {
            const resultData = isRecord(result.data) ? result.data : {};
            const resultMetadata = isRecord(result.metadata) ? result.metadata : {};
            result = {
              ...result,
              data: {
                ...resultData,
                artifact: suggestionArtifact,
              },
              metadata: {
                ...resultMetadata,
                category: "SYSTEM",
                suggestionArtifact,
              },
            };
            this.recordSuggestionShown(
              context.session,
              context.input,
              context.audit,
              suggestionArtifact,
            );
            context.streamCallbacks?.onSuggestionArtifact?.(suggestionArtifact);
          }
        }

        if (toolName === "suggestAction" && !result.ok) {
          this.recordSuggestionFailure(
            context.session,
            context.input,
            context.audit,
            result.errorCode,
            context.implicitSuggestionPolicy?.domain ?? null,
          );
          if (context.implicitSuggestionPolicy?.required) {
            this.recordSuggestionFallback(
              context.session,
              context.input,
              context.audit,
              context.implicitSuggestionPolicy.domain,
              result.errorCode,
            );
            return {
              stopForConfirmation: true,
              confirmationMessage: this.buildSuggestionFailureFallbackMessage(
                context.implicitSuggestionPolicy.domain,
              ),
            };
          }
        }

        const record = this.createToolRecord(toolName, args, executionContext, result);
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, result),
        });

        this.appendTurn(
          context.session,
          "tool",
          this.summarizeToolMessageForHistory(
            toolName,
            this.serializeToolMessage(toolName, result),
          ),
          context.turnType,
          [record],
        );

        this.pushAudit(context.audit, context.input, "tool_call_processed", {
          toolName,
          ok: result.ok,
          errorCode: result.errorCode,
          category: "SYSTEM",
          suggestionArtifact: Boolean(suggestionArtifact),
        });

        if (suggestionArtifact && context.implicitSuggestionPolicy?.required) {
          return {
            stopForConfirmation: true,
            confirmationMessage: this.buildSuggestionReadyAcknowledgement(
              context.input.message,
              suggestionArtifact,
            ),
            suggestionArtifact,
          };
        }
        continue;
      }

      const executionContext = this.createExecutionContext(context.input, context.session);
      if (tool.category === ToolCategory.DRAFT && toolName === "generateDraft") {
        let currentTurnReadTools = this.listReadToolNamesInCurrentTurn(context.toolCalls);
        const clarificationMessage = this.extractClarificationMessageFromDraftArgs(args);
        if (clarificationMessage) {
          const result: ToolExecutionResult = {
            ok: false,
            errorCode: "DRAFT_CLARIFICATION_REQUIRED",
            errorMessage:
              "Clarification prompts must be returned as assistant text, not as draft artifacts.",
            metadata: {
              category: "DRAFT",
              stage: "draft_clarification_guard",
            },
          };
          console.warn(
            "[DRAFT_TRACE_TOOL_DENIED]",
            this.safeJsonStringify({
              sessionId: context.input.sessionId,
              turnId: context.input.turnId,
              toolName,
              category: tool.category,
              stage: "draft_clarification_guard",
              errorCode: result.errorCode,
              reason: result.errorMessage,
              clarificationLength: clarificationMessage.length,
            }),
          );
          const record = this.createToolRecord(toolName, args, executionContext, result);
          record.id = callId;
          context.toolCalls.push(record);
          context.messages.push({
            role: "tool",
            name: toolName,
            toolCallId: callId,
            content: this.serializeToolMessage(toolName, result),
          });
          context.messages.push({
            role: "system",
            content: this.buildDraftClarificationGuardInstruction(
              context.input.message,
              clarificationMessage,
            ),
          });
          this.pushAudit(context.audit, context.input, "tool_call_denied", {
            toolName,
            reason: result.errorMessage,
            errorCode: result.errorCode,
            stage: "draft_clarification_guard",
          });
          return {
            stopForConfirmation: true,
            confirmationMessage: clarificationMessage,
          };
        }

        const genericDraftPrompt = this.isGenericDraftPrompt(context.input.message);
        console.info(
          "[DRAFT_TRACE_DETAILS_GUARD_EVAL]",
          this.safeJsonStringify({
            sessionId: context.input.sessionId,
            turnId: context.input.turnId,
            genericDraftPrompt,
            hasCurrentDraftInSession: Boolean(context.session.currentDraft),
            currentTurnReadTools,
          }),
        );
        if (genericDraftPrompt) {
          const result: ToolExecutionResult = {
            ok: false,
            errorCode: "DRAFT_DETAILS_REQUIRED",
            errorMessage:
              "Draft request is underspecified. Clarify document type and purpose before generating a draft.",
            metadata: {
              category: "DRAFT",
              stage: "draft_details_guard",
            },
          };
          console.warn(
            "[DRAFT_TRACE_TOOL_DENIED]",
            this.safeJsonStringify({
              sessionId: context.input.sessionId,
              turnId: context.input.turnId,
              toolName,
              category: tool.category,
              stage: "draft_details_guard",
              errorCode: result.errorCode,
              reason: result.errorMessage,
            }),
          );
          const record = this.createToolRecord(toolName, args, executionContext, result);
          record.id = callId;
          context.toolCalls.push(record);
          context.messages.push({
            role: "tool",
            name: toolName,
            toolCallId: callId,
            content: this.serializeToolMessage(toolName, result),
          });
          context.messages.push({
            role: "system",
            content: this.buildDraftDetailsRecoveryInstruction(context.input.message),
          });
          this.pushAudit(context.audit, context.input, "tool_call_denied", {
            toolName,
            reason: result.errorMessage,
            errorCode: result.errorCode,
            stage: "draft_details_guard",
          });
          continue;
        }

        const genericCandidates = this.extractLatestListCandidates(context.messages);
        const aggregateDraftIntent = this.isAggregateDraftIntent(context.input.message, args);
        const draftAmbiguity = this.detectDraftEntityAmbiguity({
          userMessage: context.input.message,
          args,
          candidates: genericCandidates,
          aggregateIntent: aggregateDraftIntent,
        });
        console.info(
          "[DRAFT_TRACE_GUARD_INPUTS]",
          this.safeJsonStringify({
            sessionId: context.input.sessionId,
            turnId: context.input.turnId,
            messagePreview: this.truncate(String(context.input.message || ""), 180),
            draftType: String(args.draftType || "").trim() || "unknown",
            linkedEntityType: String(args.linkedEntityType || "").trim() || null,
            hasLinkedEntityId:
              typeof args.linkedEntityId === "number" ||
              (typeof args.linkedEntityId === "string" && args.linkedEntityId.trim().length > 0),
            isDraftingIntent: this.isDraftingIntent(context.input.message),
            aggregateDraftIntent,
            candidateCount: genericCandidates.length,
            candidateTypes: Array.from(new Set(genericCandidates.map((row) => row.entityType))).slice(0, 8),
            ambiguityRequired: Boolean(draftAmbiguity.required),
            ambiguityReason: draftAmbiguity.reason,
            currentTurnReadTools,
          }),
        );
        console.info(
          "[DRAFT_TRACE_AMBIGUITY_DECISION]",
          this.safeJsonStringify({
            sessionId: context.input.sessionId,
            turnId: context.input.turnId,
            required: Boolean(draftAmbiguity?.required),
            reason: draftAmbiguity.reason,
            candidateCount: draftAmbiguity?.candidates.length ?? 0,
            selectionMode: draftAmbiguity.selectionMode,
          }),
        );
        if (draftAmbiguity?.required) {
          const result: ToolExecutionResult = {
            ok: false,
            errorCode: "DRAFT_AMBIGUOUS_TARGET",
            errorMessage: "Multiple entity matches found. Ask the user to select the intended target before drafting.",
            metadata: {
              category: "DRAFT",
              stage: "draft_ambiguity_guard",
              candidateCount: draftAmbiguity.candidates.length,
              candidates: draftAmbiguity.candidates,
              selectionMode: draftAmbiguity.selectionMode,
            },
          };
          console.warn(
            "[DRAFT_TRACE_TOOL_DENIED]",
            this.safeJsonStringify({
              sessionId: context.input.sessionId,
              turnId: context.input.turnId,
              toolName,
              category: tool.category,
              stage: "draft_ambiguity_guard",
              errorCode: result.errorCode,
              reason: result.errorMessage,
              candidateCount: draftAmbiguity.candidates.length,
            }),
          );
          const record = this.createToolRecord(toolName, args, executionContext, result);
          record.id = callId;
          context.toolCalls.push(record);
          context.messages.push({
            role: "tool",
            name: toolName,
            toolCallId: callId,
            content: this.serializeToolMessage(toolName, result),
          });
          const disambiguationPrompt = this.buildDraftEntityDisambiguationMessage(
            draftAmbiguity.candidates,
            draftAmbiguity.selectionMode,
          );
          context.messages.push({
            role: "system",
            content: this.buildDraftAmbiguityRecoveryInstruction(
              context.input.message,
              disambiguationPrompt,
            ),
          });
          this.pushAudit(context.audit, context.input, "tool_call_denied", {
            toolName,
            reason: result.errorMessage,
            errorCode: result.errorCode,
            candidateCount: draftAmbiguity.candidates.length,
          });
          continue;
        }
        const readGroundingDiagnostics = this.getDraftReadGroundingDiagnostics(
          context.input,
          args,
        );
        const requiresReadGrounding = readGroundingDiagnostics.requiresReadGrounding;
        let hasReadGrounding = this.hasReadGroundingInCurrentTurn(context.toolCalls);
        console.info(
          "[DRAFT_TRACE_CONTEXT_GUARD_EVAL]",
          this.safeJsonStringify({
            sessionId: context.input.sessionId,
            turnId: context.input.turnId,
            hasReadGrounding,
            ...readGroundingDiagnostics,
            currentTurnReadTools: this.listReadToolNamesInCurrentTurn(context.toolCalls),
          }),
        );
        if (requiresReadGrounding && !hasReadGrounding) {
          const probeOutcome = await this.runAdaptiveDraftReadProbes({
            userMessage: context.input.message,
            args,
            context,
            executionContext,
            stage: "draft_context_autoprobe",
            currentTurnReadTools,
          });
          currentTurnReadTools = this.listReadToolNamesInCurrentTurn(context.toolCalls);
          hasReadGrounding = this.hasReadGroundingInCurrentTurn(context.toolCalls);
          console.info(
            "[DRAFT_TRACE_AUTOPROBE_RESULT]",
            this.safeJsonStringify({
              sessionId: context.input.sessionId,
              turnId: context.input.turnId,
              stage: "draft_context_autoprobe",
              executedTools: probeOutcome.executedTools,
              hasReadGroundingAfterProbe: hasReadGrounding,
              currentTurnReadTools,
            }),
          );
        }
        if (requiresReadGrounding && !hasReadGrounding) {
          const result: ToolExecutionResult = {
            ok: false,
            errorCode: "DRAFT_CONTEXT_REQUIRED",
            errorMessage:
              "This draft requires factual case context from READ tools. " +
              "Call READ tools first (for example listDossiers/getDossier/getClient), then call generateDraft.",
            metadata: {
              category: "DRAFT",
              stage: "draft_context_guard",
            },
          };
          console.warn(
            "[DRAFT_TRACE_TOOL_DENIED]",
            this.safeJsonStringify({
              sessionId: context.input.sessionId,
              turnId: context.input.turnId,
              toolName,
              category: tool.category,
              stage: "draft_context_guard",
              errorCode: result.errorCode,
              reason: result.errorMessage,
            }),
          );
          const record = this.createToolRecord(toolName, args, executionContext, result);
          record.id = callId;
          context.toolCalls.push(record);
          context.messages.push({
            role: "tool",
            name: toolName,
            toolCallId: callId,
            content: this.serializeToolMessage(toolName, result),
          });
          context.messages.push({
            role: "system",
            content: this.buildDraftContextRecoveryInstruction(context.input.message),
          });
          this.pushAudit(context.audit, context.input, "tool_call_denied", {
            toolName,
            reason: result.errorMessage,
            errorCode: result.errorCode,
          });
          continue;
        }

        const caseSpecificDraft = this.draftAppearsCaseSpecific(args);
        const regenerateDraftRequested =
          isRecord(context.input.metadata) && context.input.metadata?.regenerateDraft === true;
        const draftContextForTurn = this.resolveDraftForTurn(
          context.input,
          this.normalizeDraftArtifact(context.session.currentDraft) ?? undefined,
        );
        const hasCaseGroundingFromCurrentDraft =
          regenerateDraftRequested &&
          this.hasCaseGroundingFromDraftArtifact(draftContextForTurn);
        let hasCaseGrounding =
          this.hasCaseGroundingReadTool(currentTurnReadTools) || hasCaseGroundingFromCurrentDraft;
        console.info(
          "[DRAFT_TRACE_CASE_GROUNDING_GUARD_EVAL]",
          this.safeJsonStringify({
            sessionId: context.input.sessionId,
            turnId: context.input.turnId,
            caseSpecificDraft,
            hasCaseGrounding,
            hasCaseGroundingFromCurrentDraft,
            regenerateDraftRequested,
            currentTurnReadTools,
          }),
        );
        if (caseSpecificDraft && !hasCaseGrounding) {
          const probeOutcome = await this.runAdaptiveDraftReadProbes({
            userMessage: context.input.message,
            args,
            context,
            executionContext,
            stage: "draft_case_grounding_autoprobe",
            currentTurnReadTools,
          });
          currentTurnReadTools = this.listReadToolNamesInCurrentTurn(context.toolCalls);
          hasCaseGrounding =
            this.hasCaseGroundingReadTool(currentTurnReadTools) || hasCaseGroundingFromCurrentDraft;
          console.info(
            "[DRAFT_TRACE_AUTOPROBE_RESULT]",
            this.safeJsonStringify({
              sessionId: context.input.sessionId,
              turnId: context.input.turnId,
              stage: "draft_case_grounding_autoprobe",
              executedTools: probeOutcome.executedTools,
              hasCaseGroundingAfterProbe: hasCaseGrounding,
              currentTurnReadTools,
            }),
          );
        }
        if (caseSpecificDraft && !hasCaseGrounding) {
          const caseCandidates = this.extractCaseDisambiguationCandidates(context.messages);
          if (caseCandidates.length > 1 && !aggregateDraftIntent) {
            const result: ToolExecutionResult = {
              ok: false,
              errorCode: "DRAFT_AMBIGUOUS_TARGET",
              errorMessage:
                "Multiple case candidates match the draft context. Ask the user to choose one before drafting.",
              metadata: {
                category: "DRAFT",
                stage: "draft_case_disambiguation_guard",
                candidateCount: caseCandidates.length,
                candidates: caseCandidates,
                selectionMode: "single",
              },
            };
            const record = this.createToolRecord(toolName, args, executionContext, result);
            record.id = callId;
            context.toolCalls.push(record);
            context.messages.push({
              role: "tool",
              name: toolName,
              toolCallId: callId,
              content: this.serializeToolMessage(toolName, result),
            });
            const disambiguationPrompt = this.buildDraftEntityDisambiguationMessage(
              caseCandidates,
              "single",
            );
            context.messages.push({
              role: "system",
              content: this.buildDraftAmbiguityRecoveryInstruction(
                context.input.message,
                disambiguationPrompt,
              ),
            });
            this.pushAudit(context.audit, context.input, "tool_call_denied", {
              toolName,
              reason: result.errorMessage,
              errorCode: result.errorCode,
              stage: "draft_case_disambiguation_guard",
              candidateCount: caseCandidates.length,
            });
            continue;
          }
          const result: ToolExecutionResult = {
            ok: false,
            errorCode: "DRAFT_CASE_CONTEXT_REQUIRED",
            errorMessage:
              "Draft includes case-specific claims without dossier/lawsuit/session context from READ tools.",
            metadata: {
              category: "DRAFT",
              stage: "draft_case_grounding_guard",
            },
          };
          console.warn(
            "[DRAFT_TRACE_TOOL_DENIED]",
            this.safeJsonStringify({
              sessionId: context.input.sessionId,
              turnId: context.input.turnId,
              toolName,
              category: tool.category,
              stage: "draft_case_grounding_guard",
              errorCode: result.errorCode,
              reason: result.errorMessage,
            }),
          );
          const record = this.createToolRecord(toolName, args, executionContext, result);
          record.id = callId;
          context.toolCalls.push(record);
          context.messages.push({
            role: "tool",
            name: toolName,
            toolCallId: callId,
            content: this.serializeToolMessage(toolName, result),
          });
          context.messages.push({
            role: "system",
            content: this.buildDraftCaseGroundingRecoveryInstruction(context.input.message),
          });
          this.pushAudit(context.audit, context.input, "tool_call_denied", {
            toolName,
            reason: result.errorMessage,
            errorCode: result.errorCode,
            stage: "draft_case_grounding_guard",
          });
          continue;
        }
        this.publishDraftPlaceholderFromArgs(args, context);
      }
      const result = await this.executor.execute(tool, executionContext, args);
      this.collectToolWarnings(result, context.warnings);
      if (tool.category === ToolCategory.READ) {
        this.trackReadToolResult(result, context.readCounters);
      }
      if (tool.category === ToolCategory.DRAFT && result.ok) {
        await this.progressivelyRevealDraft(result, context);
      }
      if (result.ok) {
        this.trackToolEntities(context.session, result, toolName, context.input.turnId);
      }

      const record = this.createToolRecord(toolName, args, executionContext, result);
      record.id = callId;
      context.toolCalls.push(record);

      // For DRAFT tools, return a minimal confirmation to the LLM instead of the
      // full artifact content (which causes the LLM to loop and regenerate).
      const toolMessageContent = (tool.category === ToolCategory.DRAFT && result.ok)
        ? JSON.stringify({
            tool: toolName,
            result: {
              ok: true,
              status: "draft_delivered",
              message: "Draft artifact has been delivered to the user. Do NOT call generateDraft again. Respond with a brief message about the draft.",
            },
          })
        : this.serializeToolMessage(toolName, result);

      context.messages.push({
        role: "tool",
        name: toolName,
        toolCallId: callId,
        content: toolMessageContent,
      });

      this.appendTurn(
        context.session,
        "tool",
        this.summarizeToolMessageForHistory(toolName, toolMessageContent),
        context.turnType,
        [record],
      );

      this.pushAudit(context.audit, context.input, "tool_call_processed", {
        toolName,
        ok: result.ok,
        errorCode: result.errorCode,
      });
    }

    return { stopForConfirmation: false };
  }

  private clearLastAssistantMessageForRecovery(messages: LLMMessage[]): void {
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") {
      return;
    }
    const hasToolCalls = Array.isArray(last.tool_calls) && last.tool_calls.length > 0;
    if (hasToolCalls) {
      return;
    }
    last.content = "";
  }

  private flushAcceptedBufferedText(
    streamCallbacks: LoopStreamCallbacks | undefined,
    bufferedText: string,
  ): void {
    const text = String(bufferedText || "");
    if (!text) {
      return;
    }
    streamCallbacks?.onTextDelta?.(text);
  }

  private logBufferedTextDiscard(
    input: AgentTurnInput,
    iteration: number,
    reason: string,
    bufferedText: string,
  ): void {
    const discardedLength = String(bufferedText || "").length;
    if (discardedLength <= 0) {
      return;
    }
    console.info(
      "[AGENT_LOOP_BUFFERED_TEXT_DISCARDED]",
      this.safeJsonStringify({
        sessionId: input.sessionId,
        turnId: input.turnId,
        iteration,
        reason,
        discardedLength,
      }),
    );
  }

  private isProviderFailureCandidate(
    text: string,
    finishReason: string,
  ): boolean {
    if (String(finishReason || "").trim().toLowerCase() === "error") {
      return true;
    }
    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    return (
      normalized.includes("cannot access the language model right now") ||
      normalized.includes("please try again") ||
      normalized.includes("could not generate a valid response")
    );
  }

  private async progressivelyRevealDraft(
    result: ToolExecutionResult,
    context: ToolCallProcessingContext,
  ): Promise<void> {
    const data = result.data as Record<string, unknown> | undefined;
    const artifact = data?.artifact as DraftArtifact | undefined;
    const normalized = this.normalizeDraftArtifact(artifact);
    if (!normalized) {
      return;
    }

    const allSections = normalized.sections;
    const REVEAL_DELAY_MS = 120;

    // Reveal sections one by one so the user sees content filling in.
    for (let i = 0; i < allSections.length; i++) {
      const partial: DraftArtifact = {
        ...normalized,
        sections: allSections.slice(0, i + 1),
        content: allSections
          .slice(0, i + 1)
          .map((s) => String(s.text || "").trim())
          .filter(Boolean)
          .join("\n\n"),
      };
      this.publishDraftArtifact(partial, {
        input: context.input,
        session: context.session,
        streamCallbacks: context.streamCallbacks,
        transient: true,
      });
      if (i < allSections.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, REVEAL_DELAY_MS));
      }
    }

    // Final non-transient publish to persist the complete draft.
    this.publishDraftArtifact(normalized, {
      input: context.input,
      session: context.session,
      streamCallbacks: context.streamCallbacks,
    });
  }

  private shouldEnforceDraftToolCall(params: {
    input: AgentTurnInput;
    candidateText: string;
    toolCalls: ToolCallRecord[];
    attempts: number;
    sessionHasCurrentDraft: boolean;
  }): boolean {
    if (params.attempts >= 1) {
      return false;
    }
    if (!this.isDraftTurnLikely(params.input.message, params.sessionHasCurrentDraft)) {
      return false;
    }
    if (this.isGenericDraftPrompt(params.input.message)) {
      return false;
    }
    if (this.isClarificationRequestText(params.candidateText)) {
      return false;
    }
    if (this.hasDraftGuardDenial(params.toolCalls)) {
      return false;
    }
    if (this.hasSuccessfulGenerateDraftToolCall(params.toolCalls)) {
      return false;
    }
    if (!this.isDraftArtifactSizedResponse(params.candidateText)) {
      return false;
    }
    return true;
  }

  private hasDraftGuardDenial(toolCalls: ToolCallRecord[]): boolean {
    const draftGuardErrorCodes = new Set([
      "DRAFT_DETAILS_REQUIRED",
      "DRAFT_AMBIGUOUS_TARGET",
      "DRAFT_CONTEXT_REQUIRED",
      "DRAFT_CASE_CONTEXT_REQUIRED",
      "DRAFT_CLARIFICATION_REQUIRED",
    ]);
    return toolCalls.some((call) => {
      if (String(call?.toolName || "").trim() !== "generateDraft") {
        return false;
      }
      const code = String(call?.errorCode || "").trim();
      return code.length > 0 && draftGuardErrorCodes.has(code);
    });
  }

  private hasSuccessfulGenerateDraftToolCall(toolCalls: ToolCallRecord[]): boolean {
    return toolCalls.some(
      (call) =>
        String(call?.toolName || "").trim() === "generateDraft" && Boolean(call?.ok),
    );
  }

  private countSuccessfulSuggestionToolCalls(toolCalls: ToolCallRecord[]): number {
    return toolCalls.filter(
      (call) =>
        String(call?.toolName || "").trim() === "suggestAction" &&
        Boolean(call?.ok) &&
        Boolean(this.extractSuggestionArtifactFromToolCallRecord(call)),
    ).length;
  }

  private hasSuccessfulSuggestionToolCall(toolCalls: ToolCallRecord[]): boolean {
    return this.countSuccessfulSuggestionToolCalls(toolCalls) > 0;
  }

  private isSuggestionFeatureEnabled(): boolean {
    const suggestions = isRecord(this.runtimeOptions?.suggestions)
      ? this.runtimeOptions.suggestions
      : undefined;
    if (!suggestions) {
      return true;
    }
    return suggestions.enabled !== false;
  }

  private isSuggestionTelemetryEnabled(): boolean {
    const suggestions = isRecord(this.runtimeOptions?.suggestions)
      ? this.runtimeOptions.suggestions
      : undefined;
    if (!suggestions) {
      return true;
    }
    return suggestions.telemetryEnabled !== false;
  }

  private resolveImplicitSuggestionPolicy(params: {
    input: AgentTurnInput;
    session: Session;
    turnType: TurnType;
    authScope: string;
  }): ImplicitSuggestionPolicy {
    if (this.isSuggestionDeclineRequest(params.input)) {
      return { required: false, domain: null, trigger: "implicit_intent" };
    }
    if (!this.isSuggestionFeatureEnabled()) {
      return { required: false, domain: null, trigger: "implicit_intent" };
    }
    if (!this.isSuggestActionAvailableForScope(params.authScope)) {
      return { required: false, domain: null, trigger: "implicit_intent" };
    }
    if (
      params.turnType === TurnTypeEnum.AMENDMENT &&
      Boolean(params.session?.state?.pendingAction)
    ) {
      return { required: false, domain: null, trigger: "implicit_intent" };
    }

    const message = String(params.input.message || "");
    if (this.isImplicitDraftSuggestionIntent(message)) {
      return { required: true, domain: "draft", trigger: "implicit_intent" };
    }
    if (this.isImplicitExecuteSuggestionIntent(message)) {
      return { required: true, domain: "execute", trigger: "implicit_intent" };
    }
    return { required: false, domain: null, trigger: "implicit_intent" };
  }

  private shouldEnforceImplicitSuggestion(params: {
    policy: ImplicitSuggestionPolicy;
    suggestionCalls: ToolCallRecord[];
    llmToolCalls?: LLMToolCall[];
    candidateText?: string;
  }): boolean {
    if (!params.policy.required || !params.policy.domain) {
      return false;
    }
    if (this.hasSuccessfulSuggestionToolCall(params.suggestionCalls)) {
      return false;
    }
    if (Array.isArray(params.llmToolCalls) && params.llmToolCalls.length > 0) {
      return !params.llmToolCalls.some(
        (toolCall) => String(toolCall?.name || "").trim() === "suggestAction",
      );
    }
    const candidate = String(params.candidateText || "").trim();
    if (!candidate) {
      return false;
    }
    if (this.isClarificationRequestText(candidate)) {
      return false;
    }
    return true;
  }

  private isSuggestActionAvailableForScope(authScope: string): boolean {
    if (!this.isSuggestionFeatureEnabled()) {
      return false;
    }
    const tool = this.registry.get("suggestAction");
    if (!tool) {
      return false;
    }
    return this.permissionGate.evaluate({ authScope }, tool).allowed;
  }

  private isImplicitDraftSuggestionIntent(message: string): boolean {
    const raw = String(message || "").trim();
    if (!raw) {
      return false;
    }
    if (!this.isDraftingIntent(raw)) {
      return false;
    }
    if (EXPLICIT_DRAFT_COMMAND_PATTERN.test(raw)) {
      return false;
    }
    return this.hasImplicitIntentMarker(raw);
  }

  private isImplicitExecuteSuggestionIntent(message: string): boolean {
    const raw = String(message || "").trim();
    if (!raw) {
      return false;
    }
    if (this.isDraftingIntent(raw)) {
      return false;
    }
    if (!EXECUTE_INTENT_CUE_PATTERN.test(raw)) {
      return false;
    }
    if (EXPLICIT_EXECUTE_COMMAND_PATTERN.test(raw)) {
      return false;
    }
    return this.hasImplicitIntentMarker(raw);
  }

  private hasImplicitIntentMarker(message: string): boolean {
    const normalized = this.normalizeIntentText(message);
    return IMPLICIT_INTENT_MARKERS.some((marker) => normalized.includes(marker));
  }

  private buildSuggestionToolEnforcementInstruction(params: {
    userMessage: string;
    domain: SuggestionArtifact["domain"] | null;
    candidateText?: string;
  }): string {
    const domain = params.domain === "execute" ? "execute" : "draft";
    const targetHint = domain === "draft" ? "client_letter" : "task";
    const actionHint = domain === "draft" ? "draft" : "update";
    const prefillHint =
      domain === "draft"
        ? '{"draftType":"client_letter","purpose":"welcome","tone":"friendly","language":"en"}'
        : '{"operation":"update","entityType":"task","changes":{"status":{"from":"pending","to":"in_progress"}}}';

    return [
      "IMPLICIT INTENT SUGGESTION FLOW",
      "The user's message implies intent but does not explicitly request immediate execution.",
      "Before any draft generation or plan proposal, call suggestAction exactly once.",
      `Use domain="${domain}", trigger="implicit_intent", actionType="${actionHint}", targetType="${targetHint}".`,
      "Include a specific title and reason grounded in the current user request.",
      `Include actionable prefillData. Example shape: ${prefillHint}`,
      "After suggestAction, ask a direct binary question (Yes/No) to continue.",
      `Original user request: ${params.userMessage}`,
      params.candidateText
        ? `Do not finalize this direct answer yet: ${this.truncate(params.candidateText, 280)}`
        : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
  }

  private buildSuggestionClarificationMessage(
    domain: SuggestionArtifact["domain"] | null,
  ): string {
    if (domain === "execute") {
      return "I can suggest the safest next update before applying any change.";
    }
    return "I can suggest the best draft option first based on your context.";
  }

  private buildSuggestionFailureFallbackMessage(
    domain: SuggestionArtifact["domain"] | null,
  ): string {
    if (domain === "execute") {
      return "I couldn't prepare a proactive suggestion right now. I can continue with a normal plan once you confirm the exact update.";
    }
    return "I couldn't prepare a proactive suggestion right now. I can continue with a normal draft flow if you want me to draft it directly.";
  }

  private buildSuggestionReadyAcknowledgement(
    userMessage: string,
    artifact: SuggestionArtifact,
  ): string {
    const language = this.detectLanguageHint(userMessage) || "en";
    if (language === "fr") {
      if (artifact.domain === "execute") {
        return "Je peux préparer un plan de mise à jour ciblé. Voulez-vous continuer ?";
      }
      return "Je peux vous aider à créer ce brouillon. Voulez-vous continuer ?";
    }
    if (language === "ar") {
      if (artifact.domain === "execute") {
        return "يمكنني إعداد خطة تحديث مناسبة. هل تريد المتابعة؟";
      }
      return "يمكنني مساعدتك في إنشاء هذه المسودة. هل تريد المتابعة؟";
    }
    if (artifact.domain === "execute") {
      return "I can prepare a targeted plan for this update. Continue?";
    }
    return "I can help you create this draft. Continue?";
  }

  private buildSuggestionDeclineClarificationQuestion(
    domain: SuggestionArtifact["domain"] | null,
  ): string {
    if (domain === "execute") {
      return "Understood. What exact change should I include in the plan?";
    }
    return "Understood. What should I include in the draft?";
  }

  private buildImplicitSuggestionFallbackArtifact(
    input: AgentTurnInput,
    domain: SuggestionArtifact["domain"],
  ): SuggestionArtifact {
    const message = String(input.message || "").trim();
    const language = this.detectLanguageHint(message) || "en";

    if (domain === "draft") {
      return {
        version: "v1",
        domain: "draft",
        trigger: "implicit_intent",
        actionType: "draft",
        targetType: "client_letter",
        title: "Suggested Draft Next Step",
        reason:
          "You implied a drafting request. I prepared a suggested draft path before proceeding directly.",
        prefillData: {
          draftType: "client_letter",
          purpose: "follow_up_on_user_request",
          tone: "professional",
          language,
        },
      };
    }

    const lower = message.toLowerCase();
    const executeAction: SuggestionArtifact["actionType"] = /\b(delete|remove|archive)\b/i.test(lower)
      ? "delete"
      : /\b(create|add|open|new)\b/i.test(lower)
      ? "create"
      : "update";
    const targetType = /\b(task|todo|to-do)\b/i.test(lower)
      ? "task"
      : /\b(client|customer)\b/i.test(lower)
      ? "client"
      : /\b(dossier|case|lawsuit)\b/i.test(lower)
      ? "dossier"
      : "task";
    const operation = executeAction;

    return {
      version: "v1",
      domain: "execute",
      trigger: "implicit_intent",
      actionType: executeAction,
      targetType,
      title: "Suggested Plan Next Step",
      reason:
        "You implied an execution update. I prepared a suggested plan path before applying any changes.",
      prefillData: {
        operation,
        entityType: targetType,
        changes: {
          request: {
            to: message || "Proceed with the suggested plan update.",
          },
        },
      },
    };
  }

  private extractSuggestionArtifactFromToolResult(
    result: ToolExecutionResult,
  ): SuggestionArtifact | null {
    const data = isRecord(result.data) ? result.data : null;
    if (!data) {
      return null;
    }
    return this.normalizeSuggestionArtifact(data.artifact);
  }

  private extractSuggestionArtifactFromToolCallRecord(
    call: ToolCallRecord,
  ): SuggestionArtifact | null {
    const metadata = isRecord(call?.metadata) ? call.metadata : null;
    if (!metadata) {
      return null;
    }
    return this.normalizeSuggestionArtifact(metadata.suggestionArtifact);
  }

  private extractLatestSuggestionArtifactFromToolCalls(
    toolCalls: ToolCallRecord[],
  ): SuggestionArtifact | null {
    for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
      const call = toolCalls[index];
      if (!call || String(call.toolName || "").trim() !== "suggestAction" || !call.ok) {
        continue;
      }
      const artifact = this.extractSuggestionArtifactFromToolCallRecord(call);
      if (artifact) {
        return artifact;
      }
    }
    return null;
  }

  private normalizeSuggestionArtifact(value: unknown): SuggestionArtifact | null {
    const row = isRecord(value) ? value : null;
    if (!row) {
      return null;
    }

    const actionType = String(row.actionType || "").trim().toLowerCase();
    if (
      actionType !== "draft" &&
      actionType !== "create" &&
      actionType !== "update" &&
      actionType !== "delete"
    ) {
      return null;
    }

    const targetType = String(row.targetType || "").trim();
    const title = String(row.title || "").trim();
    const reason = String(row.reason || "").trim();
    if (!targetType || !title || !reason) {
      return null;
    }

    const triggerRaw = String(row.trigger || "").trim().toLowerCase();
    const trigger: SuggestionArtifact["trigger"] =
      triggerRaw === "implicit_intent" ? "implicit_intent" : "proactive_context";

    const domainRaw = String(row.domain || "").trim().toLowerCase();
    const inferredDomain: SuggestionArtifact["domain"] =
      actionType === "draft" ? "draft" : "execute";
    const domain: SuggestionArtifact["domain"] =
      domainRaw === "draft" || domainRaw === "execute"
        ? (domainRaw as SuggestionArtifact["domain"])
        : inferredDomain;
    const normalizedDomain =
      actionType === "draft" ? "draft" : "execute";

    const prefillData = isRecord(row.prefillData) ? row.prefillData : {};
    const linkedEntityType = String(row.linkedEntityType || "").trim() || undefined;
    const linkedEntityId = this.coerceSuggestionEntityId(row.linkedEntityId);

    return {
      version: "v1",
      domain: domain === normalizedDomain ? domain : normalizedDomain,
      trigger,
      actionType: actionType as SuggestionArtifact["actionType"],
      targetType,
      title,
      reason,
      ...(linkedEntityType ? { linkedEntityType } : {}),
      ...(typeof linkedEntityId !== "undefined" ? { linkedEntityId } : {}),
      prefillData,
    };
  }

  private coerceSuggestionEntityId(value: unknown): number | string | undefined {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === "string") {
      const normalized = value.trim();
      return normalized.length > 0 ? normalized : undefined;
    }
    return undefined;
  }

  private captureSuggestionFollowUpTelemetry(
    input: AgentTurnInput,
    session: Session,
    audit: AuditRecord[],
  ): void {
    if (!this.isSuggestionTelemetryEnabled()) {
      return;
    }
    const state = this.getSuggestionTelemetryState(session);
    const pending = state.pending;
    if (!pending) {
      this.persistSuggestionTelemetryState(session, state);
      return;
    }
    if (pending.turnId === input.turnId) {
      return;
    }

    const requestSource = this.resolveRequestSource(input);
    const now = new Date().toISOString();
    const accepted = requestSource === "assist_suggestion_cta";
    if (accepted) {
      state.counters.accepted += 1;
      state.lastEvent = {
        kind: "suggestion_accepted",
        at: now,
        turnId: input.turnId,
        requestSource,
        domain: pending.domain,
        actionType: pending.actionType,
        targetType: pending.targetType,
      };
      this.pushAudit(audit, input, "suggestion_accepted", {
        shownByTurnId: pending.turnId,
        shownAt: pending.shownAt,
        requestSource,
        domain: pending.domain,
        actionType: pending.actionType,
        targetType: pending.targetType,
      });
    } else {
      state.counters.dismissed += 1;
      state.lastEvent = {
        kind: "suggestion_dismissed",
        at: now,
        turnId: input.turnId,
        requestSource: requestSource || "unknown",
        domain: pending.domain,
        actionType: pending.actionType,
        targetType: pending.targetType,
      };
      this.pushAudit(audit, input, "suggestion_dismissed", {
        shownByTurnId: pending.turnId,
        shownAt: pending.shownAt,
        requestSource: requestSource || "unknown",
        domain: pending.domain,
        actionType: pending.actionType,
        targetType: pending.targetType,
      });
    }

    delete state.pending;
    this.persistSuggestionTelemetryState(session, state);
  }

  private recordSuggestionShown(
    session: Session,
    input: AgentTurnInput,
    audit: AuditRecord[],
    artifact: SuggestionArtifact,
  ): void {
    if (!this.isSuggestionTelemetryEnabled()) {
      return;
    }
    const state = this.getSuggestionTelemetryState(session);
    const now = new Date().toISOString();
    state.counters.shown += 1;
    state.pending = {
      turnId: input.turnId,
      shownAt: now,
      domain: artifact.domain,
      actionType: artifact.actionType,
      targetType: artifact.targetType,
      trigger: artifact.trigger,
    };
    state.lastEvent = {
      kind: "suggestion_shown",
      at: now,
      turnId: input.turnId,
      domain: artifact.domain,
      actionType: artifact.actionType,
      targetType: artifact.targetType,
    };
    this.persistSuggestionTelemetryState(session, state);
    this.pushAudit(audit, input, "suggestion_shown", {
      domain: artifact.domain,
      actionType: artifact.actionType,
      targetType: artifact.targetType,
      trigger: artifact.trigger,
    });
  }

  private recordSuggestionFailure(
    session: Session,
    input: AgentTurnInput,
    audit: AuditRecord[],
    errorCode?: string,
    domain: SuggestionArtifact["domain"] | null = null,
  ): void {
    if (!this.isSuggestionTelemetryEnabled()) {
      return;
    }
    const state = this.getSuggestionTelemetryState(session);
    const now = new Date().toISOString();
    state.counters.failures += 1;
    state.lastEvent = {
      kind: "suggestion_failed",
      at: now,
      turnId: input.turnId,
      errorCode: String(errorCode || "").trim() || undefined,
      domain: domain || undefined,
      requestSource: this.resolveRequestSource(input) || undefined,
    };
    this.persistSuggestionTelemetryState(session, state);
    this.pushAudit(audit, input, "suggestion_failed", {
      errorCode: String(errorCode || "").trim() || "unknown",
      domain: domain || undefined,
    });
  }

  private recordSuggestionFallback(
    session: Session,
    input: AgentTurnInput,
    audit: AuditRecord[],
    domain: SuggestionArtifact["domain"] | null,
    errorCode?: string,
  ): void {
    if (!this.isSuggestionTelemetryEnabled()) {
      return;
    }
    const state = this.getSuggestionTelemetryState(session);
    const now = new Date().toISOString();
    state.counters.fallback += 1;
    state.lastEvent = {
      kind: "suggestion_fallback",
      at: now,
      turnId: input.turnId,
      domain: domain || undefined,
      errorCode: String(errorCode || "").trim() || undefined,
    };
    this.persistSuggestionTelemetryState(session, state);
    this.pushAudit(audit, input, "suggestion_fallback", {
      domain: domain || undefined,
      errorCode: String(errorCode || "").trim() || "unknown",
    });
  }

  private snapshotSuggestionTelemetryState(
    session: Session,
  ): SuggestionTelemetryState | null {
    if (!this.isSuggestionTelemetryEnabled()) {
      return null;
    }
    const state = this.getSuggestionTelemetryState(session);
    return {
      counters: { ...state.counters },
      ...(state.pending ? { pending: { ...state.pending } } : {}),
      ...(state.lastEvent ? { lastEvent: { ...state.lastEvent } } : {}),
    };
  }

  private getSuggestionTelemetryState(session: Session): SuggestionTelemetryState {
    const metadata = isRecord(session.metadata) ? session.metadata : {};
    const row = isRecord(metadata[SUGGESTION_TELEMETRY_METADATA_KEY])
      ? (metadata[SUGGESTION_TELEMETRY_METADATA_KEY] as Record<string, unknown>)
      : {};
    const counters = isRecord(row.counters) ? row.counters : {};
    const pendingRow = isRecord(row.pending) ? row.pending : null;
    const lastEvent = isRecord(row.lastEvent) ? row.lastEvent : null;

    const shown = Number(counters.shown);
    const accepted = Number(counters.accepted);
    const dismissed = Number(counters.dismissed);
    const fallback = Number(counters.fallback);
    const failures = Number(counters.failures);

    const state: SuggestionTelemetryState = {
      counters: {
        shown: Number.isFinite(shown) && shown > 0 ? shown : 0,
        accepted: Number.isFinite(accepted) && accepted > 0 ? accepted : 0,
        dismissed: Number.isFinite(dismissed) && dismissed > 0 ? dismissed : 0,
        fallback: Number.isFinite(fallback) && fallback > 0 ? fallback : 0,
        failures: Number.isFinite(failures) && failures > 0 ? failures : 0,
      },
    };

    const pendingTurnId = String(pendingRow?.turnId || "").trim();
    const pendingShownAt = String(pendingRow?.shownAt || "").trim();
    const pendingTargetType = String(pendingRow?.targetType || "").trim();
    const pendingActionType = String(pendingRow?.actionType || "").trim().toLowerCase();
    const pendingDomain = String(pendingRow?.domain || "").trim().toLowerCase();
    const pendingTrigger = String(pendingRow?.trigger || "").trim().toLowerCase();
    if (
      pendingTurnId &&
      pendingShownAt &&
      pendingTargetType &&
      (pendingActionType === "draft" ||
        pendingActionType === "create" ||
        pendingActionType === "update" ||
        pendingActionType === "delete") &&
      (pendingDomain === "draft" || pendingDomain === "execute") &&
      (pendingTrigger === "implicit_intent" || pendingTrigger === "proactive_context")
    ) {
      state.pending = {
        turnId: pendingTurnId,
        shownAt: pendingShownAt,
        domain: pendingDomain as SuggestionArtifact["domain"],
        actionType: pendingActionType as SuggestionArtifact["actionType"],
        targetType: pendingTargetType,
        trigger: pendingTrigger as SuggestionArtifact["trigger"],
      };
    }

    if (lastEvent) {
      const kind = String(lastEvent.kind || "").trim();
      const at = String(lastEvent.at || "").trim();
      if (kind && at) {
        state.lastEvent = {
          kind:
            kind === "suggestion_shown" ||
            kind === "suggestion_accepted" ||
            kind === "suggestion_dismissed" ||
            kind === "suggestion_fallback" ||
            kind === "suggestion_failed"
              ? (kind as
                  | "suggestion_shown"
                  | "suggestion_accepted"
                  | "suggestion_dismissed"
                  | "suggestion_fallback"
                  | "suggestion_failed")
              : "suggestion_failed",
          at,
          turnId: String(lastEvent.turnId || "").trim() || undefined,
          requestSource: String(lastEvent.requestSource || "").trim() || undefined,
          errorCode: String(lastEvent.errorCode || "").trim() || undefined,
          domain:
            String(lastEvent.domain || "").trim() === "draft" ||
            String(lastEvent.domain || "").trim() === "execute"
              ? (String(lastEvent.domain || "").trim() as SuggestionArtifact["domain"])
              : undefined,
          actionType:
            String(lastEvent.actionType || "").trim() === "draft" ||
            String(lastEvent.actionType || "").trim() === "create" ||
            String(lastEvent.actionType || "").trim() === "update" ||
            String(lastEvent.actionType || "").trim() === "delete"
              ? (String(lastEvent.actionType || "").trim() as SuggestionArtifact["actionType"])
              : undefined,
          targetType: String(lastEvent.targetType || "").trim() || undefined,
        };
      }
    }

    return state;
  }

  private persistSuggestionTelemetryState(
    session: Session,
    state: SuggestionTelemetryState,
  ): void {
    if (!isRecord(session.metadata)) {
      session.metadata = {};
    }
    session.metadata[SUGGESTION_TELEMETRY_METADATA_KEY] = {
      counters: { ...state.counters },
      ...(state.pending ? { pending: { ...state.pending } } : {}),
      ...(state.lastEvent ? { lastEvent: { ...state.lastEvent } } : {}),
    };
  }

  private resolveRequestSource(input: AgentTurnInput): string {
    const metadata = isRecord(input.metadata) ? input.metadata : {};
    return String(metadata.requestSource || "").trim();
  }

  private isSuggestionDeclineRequest(input: AgentTurnInput): boolean {
    return this.resolveRequestSource(input) === "assist_suggestion_decline";
  }

  private resolveSuggestionDeclineDomain(
    session: Session,
  ): SuggestionArtifact["domain"] | null {
    const telemetry = this.snapshotSuggestionTelemetryState(session);
    const domain = String(telemetry?.lastEvent?.domain || "").trim().toLowerCase();
    if (domain === "draft" || domain === "execute") {
      return domain as SuggestionArtifact["domain"];
    }
    return null;
  }

  private hasReadGroundingInCurrentTurn(toolCalls: ToolCallRecord[]): boolean {
    return toolCalls.some((call) => {
      if (!call?.ok) {
        return false;
      }
      const toolDef = this.registry.get(String(call.toolName || "").trim());
      return toolDef?.category === ToolCategory.READ;
    });
  }

  private draftRequiresReadGrounding(
    input: AgentTurnInput,
    args: Record<string, unknown>,
  ): boolean {
    return this.getDraftReadGroundingDiagnostics(input, args).requiresReadGrounding;
  }

  private getDraftReadGroundingDiagnostics(
    input: AgentTurnInput,
    args: Record<string, unknown>,
  ): {
    requiresReadGrounding: boolean;
    userMessageHasDatabaseEntitySignal: boolean;
    linkedEntityType: string;
    hasLinkedEntityId: boolean;
    looksCaseBound: boolean;
  } {
    const userMessage = String(input.message || "");
    const linkedEntityType = String(args.linkedEntityType || "").trim().toLowerCase();
    const hasLinkedEntityId =
      typeof args.linkedEntityId === "number" ||
      (typeof args.linkedEntityId === "string" && args.linkedEntityId.trim().length > 0);
    const userMessageHasDatabaseEntitySignal = DATABASE_ENTITY_QUERY_PATTERN.test(userMessage);

    const looksCaseBound =
      userMessageHasDatabaseEntitySignal ||
      linkedEntityType.length > 0 ||
      hasLinkedEntityId;

    return {
      requiresReadGrounding: looksCaseBound,
      userMessageHasDatabaseEntitySignal,
      linkedEntityType,
      hasLinkedEntityId,
      looksCaseBound,
    };
  }

  private isDraftingIntent(message: string): boolean {
    const value = String(message || "");
    return /\b(write|draft|compose|prepare|letter|email|summary|redige|rédige|prépare|اكتب|صغ)\b/i.test(
      value,
    );
  }

  private isDraftTurnLikely(message: string, sessionHasCurrentDraft: boolean): boolean {
    return sessionHasCurrentDraft || this.isDraftingIntent(message);
  }

  private isDraftFlowLikelyForTurn(input: AgentTurnInput, session: Session): boolean {
    const currentDraft = this.resolveDraftForTurn(input, session.currentDraft);
    return this.isDraftTurnLikely(input.message, Boolean(currentDraft));
  }

  private isDraftArtifactSizedResponse(text: string): boolean {
    const value = String(text || "").trim();
    return value.length >= DRAFT_TOOL_ENFORCEMENT_MIN_TEXT_LENGTH;
  }

  private buildDraftToolEnforcementInstruction(userMessage: string, candidateText: string): string {
    return [
      "DRAFT TOOL ENFORCEMENT",
      "You wrote draft content directly in assistant text, which is not allowed.",
      "You MUST call generateDraft now.",
      "Place the draft in generateDraft.sections and generateDraft.layout.",
      "Use one body section if you only have plain text.",
      "After the tool call, write only a short conversational message.",
      "Use this exact draft text as the body section text:",
      "---BEGIN_DRAFT_TEXT---",
      candidateText,
      "---END_DRAFT_TEXT---",
      `Original user request: ${userMessage}`,
    ].join("\n");
  }

  private buildDraftClarificationGuardInstruction(
    userMessage: string,
    clarificationMessage: string,
  ): string {
    return [
      "DRAFT CLARIFICATION GUARD",
      "The previous generateDraft call contained a clarification request, not a draft artifact.",
      "Do not call generateDraft for clarification prompts.",
      "Return the clarification to the user as assistant text.",
      "Only call generateDraft once sufficient details/context are available.",
      `Original user request: ${userMessage}`,
      "Clarification message to return:",
      clarificationMessage,
    ].join("\n");
  }

  private buildDraftDetailsRecoveryInstruction(userMessage: string): string {
    return [
      "DRAFT DETAILS REQUIRED",
      "The user's request is underspecified for generating a draft.",
      "Do not call generateDraft in this turn.",
      "Ask a concise clarification question in the user's language.",
      "Request these details: document type, purpose/main message, preferred tone, and key facts/dates/reference.",
      "Keep the response user-facing only; no internal analysis labels or role tags.",
      `Original user request: ${userMessage}`,
    ].join("\n");
  }

  private buildDraftCaseGroundingRecoveryInstruction(userMessage: string): string {
    return [
      "DRAFT CASE GROUNDING REQUIRED",
      "The attempted draft contains case-specific claims but the turn does not have dossier/lawsuit/session grounding yet.",
      "Do not call generateDraft in this turn.",
      "Ask the user for the exact dossier/case reference, or ask permission to fetch and resolve it first.",
      "Respond in user-facing language only.",
      `Original user request: ${userMessage}`,
    ].join("\n");
  }

  private maybeSynthesizeDraftArtifactFromInlineText(params: {
    input: AgentTurnInput;
    session: Session;
    turnType: TurnType;
    responseText: string;
    savedDraftCandidateText: string;
    draftToolEnforcementAttempts: number;
    toolCalls: ToolCallRecord[];
    audit: AuditRecord[];
    stats: LoopStats;
    streamCallbacks?: LoopStreamCallbacks;
  }): string {
    const fallbackContent = this.selectFallbackDraftContent(params);
    if (!fallbackContent) {
      return params.responseText;
    }

    const artifact = this.buildFallbackDraftArtifact(params.input.message, fallbackContent);
    this.publishDraftArtifact(artifact, {
      input: params.input,
      session: params.session,
      streamCallbacks: params.streamCallbacks,
    });

    const result: ToolExecutionResult = {
      ok: true,
      data: { artifact },
      metadata: {
        category: "DRAFT",
        draftType: artifact.draftType,
        fallbackInlineSynthesis: true,
      },
    };
    const args: Record<string, unknown> = {
      draftType: artifact.draftType,
      title: artifact.title,
      subtitle: artifact.subtitle,
      metadata: artifact.metadata,
      sections: artifact.sections,
      layout: artifact.layout,
      content: artifact.content,
      linkedEntityType: artifact.linkedEntityType,
      linkedEntityId: artifact.linkedEntityId,
    };

    const record = this.createToolRecord(
      "generateDraft",
      args,
      this.createExecutionContext(params.input, params.session),
      result,
      { synthetic: true, fallbackInlineSynthesis: true },
    );
    params.toolCalls.push(record);
    params.stats.toolCalls += 1;

    const toolMessageContent = JSON.stringify({
      tool: "generateDraft",
      result: {
        ok: true,
        status: "draft_delivered",
        message:
          "Draft artifact was synthesized from inline assistant text after missing generateDraft tool call.",
      },
    });
    this.appendTurn(params.session, "tool", toolMessageContent, params.turnType, [record]);

    console.warn(
      "[DRAFT_TRACE_FALLBACK_ARTIFACT_SYNTHESIZED]",
      this.safeJsonStringify({
        sessionId: params.input.sessionId,
        turnId: params.input.turnId,
        sectionCount: Array.isArray(artifact.sections) ? artifact.sections.length : 0,
        contentLength: fallbackContent.length,
        enforcementAttempts: params.draftToolEnforcementAttempts,
      }),
    );
    this.pushAudit(params.audit, params.input, "draft_fallback_artifact_synthesized", {
      sectionCount: Array.isArray(artifact.sections) ? artifact.sections.length : 0,
      contentLength: fallbackContent.length,
      enforcementAttempts: params.draftToolEnforcementAttempts,
    });

    return "I've prepared a draft for you. Review it below and tell me what to change.";
  }

  private selectFallbackDraftContent(params: {
    input: AgentTurnInput;
    session: Session;
    responseText: string;
    savedDraftCandidateText: string;
    draftToolEnforcementAttempts: number;
    toolCalls: ToolCallRecord[];
  }): string | null {
    if (this.hasSuccessfulGenerateDraftToolCall(params.toolCalls)) {
      return null;
    }
    if (params.draftToolEnforcementAttempts < 1) {
      return null;
    }
    if (!this.isDraftTurnLikely(params.input.message, Boolean(params.session.currentDraft))) {
      return null;
    }

    const responseText = String(params.responseText || "").trim();
    if (this.isClarificationRequestText(responseText)) {
      return null;
    }
    if (this.isDraftArtifactSizedResponse(responseText)) {
      return responseText;
    }

    const savedCandidate = String(params.savedDraftCandidateText || "").trim();
    if (this.isClarificationRequestText(savedCandidate)) {
      return null;
    }
    if (this.isDraftArtifactSizedResponse(savedCandidate)) {
      return savedCandidate;
    }

    return null;
  }

  private buildFallbackDraftArtifact(
    userMessage: string,
    content: string,
  ): DraftArtifact {
    const draftType = this.inferFallbackDraftType(userMessage);
    const metadata: Record<string, string> = {
      source: "inline_fallback",
    };
    const language = this.detectLanguageHint(`${userMessage}\n${content}`);
    if (language) {
      metadata.language = language;
    }

    const sections: DraftSection[] = this.parseFallbackTextToSections(content);
    const layout: DraftLayout = {
      direction: language === "ar" ? "rtl" : "ltr",
      language: language || "en",
      formality: "formal",
      documentClass: draftType,
    };

    return {
      draftType,
      title: this.inferFallbackDraftTitle(userMessage, draftType),
      subtitle: undefined,
      metadata,
      sections,
      layout,
      content: this.renderDraftContentFromSections(sections),
      linkedEntityType: undefined,
      linkedEntityId: undefined,
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  private parseFallbackTextToSections(content: string): DraftSection[] {
    const lines = content.split(/\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      return [{ id: "sec_1", role: "body", text: content }];
    }

    const sections: DraftSection[] = [];
    let secIndex = 0;
    const push = (role: string, text: string, label?: string) => {
      secIndex++;
      const s: DraftSection = { id: `sec_${secIndex}`, role, text };
      if (label) s.label = label;
      sections.push(s);
    };
    const pushSpacer = () => {
      secIndex++;
      sections.push({ id: `sec_${secIndex}`, role: "spacer", text: "" });
    };

    // Pattern matchers
    const datePattern = /^(tunis|le\s+\d|date\s*:|التاريخ|\d{1,2}[\s/.-]\w+[\s/.-]\d{2,4})/i;
    const subjectPattern = /^(objet\s*:|sujet\s*:|subject\s*:|re\s*:|الموضوع\s*:)/i;
    const referencePattern = /^(r[eé]f[eé]rence\s*:|ref\s*:|n°\s*|affaire\s*n|dossier\s*n|الملف\s*(عدد|رقم)\s*:)/i;
    const greetingPattern = /^(monsieur|madame|cher|chère|dear|bonjour|حضرة|السيد|السيدة|إلى)/i;
    const closingPattern = /^(veuillez\s+agr[eé]er|cordialement|sincèrement|respectueusement|regards|sincerely|best\s+regards|وتفضلوا|مع فائق)/i;
    const signaturePattern = /^(me\.|maître|avocat|الأستاذ|محامي)/i;

    let bodyBuffer: string[] = [];
    const flushBody = () => {
      if (bodyBuffer.length > 0) {
        push("body", bodyBuffer.join("\n"));
        bodyBuffer = [];
      }
    };

    for (const line of lines) {
      if (datePattern.test(line) && sections.length < 3) {
        flushBody();
        push("date", line);
      } else if (referencePattern.test(line)) {
        flushBody();
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          push("reference", line.substring(colonIdx + 1).trim(), line.substring(0, colonIdx + 1).trim());
        } else {
          push("reference", line);
        }
      } else if (subjectPattern.test(line)) {
        flushBody();
        const colonIdx = line.indexOf(":");
        if (colonIdx > 0) {
          push("subject", line.substring(colonIdx + 1).trim(), line.substring(0, colonIdx + 1).trim());
        } else {
          push("subject", line);
        }
        pushSpacer();
      } else if (greetingPattern.test(line) && sections.length < 6 && bodyBuffer.length === 0) {
        flushBody();
        push("salutation", line);
        pushSpacer();
      } else if (closingPattern.test(line)) {
        flushBody();
        pushSpacer();
        push("closing", line);
        pushSpacer();
      } else if (signaturePattern.test(line) && sections.length > 3) {
        flushBody();
        push("signature_name", line);
      } else {
        bodyBuffer.push(line);
      }
    }
    flushBody();

    if (sections.length <= 1) {
      return [{ id: "sec_1", role: "body", text: content }];
    }
    return sections;
  }

  private inferFallbackDraftType(message: string): string {
    const value = String(message || "");
    if (/\b(email|mail)\b/i.test(value)) {
      return "email";
    }
    if (/\b(summary|summarize|synth[eè]se|résumé)\b/i.test(value)) {
      return "summary";
    }
    if (/\b(letter|judge|court|tribunal|hearing)\b/i.test(value)) {
      return "court_letter";
    }
    return "other";
  }

  private inferFallbackDraftTitle(message: string, draftType: string): string {
    const normalized = String(message || "").replace(/\s+/g, " ").trim();
    if (normalized.length >= 12) {
      return this.truncate(normalized, 80);
    }
    if (draftType === "court_letter") {
      return "Court Letter Draft";
    }
    if (draftType === "email") {
      return "Email Draft";
    }
    if (draftType === "summary") {
      return "Summary Draft";
    }
    return "Generated Draft";
  }

  private detectLanguageHint(value: string): string | null {
    const text = String(value || "");
    if (/[\u0600-\u06FF]/.test(text)) {
      return "ar";
    }
    if (/[àâçéèêëîïôûùüÿœ]/i.test(text) || /\b(le|la|de|des|pour|avec|tribunal)\b/i.test(text)) {
      return "fr";
    }
    return "en";
  }

  private publishDraftArtifact(
    artifact: DraftArtifact,
    params: {
      input: AgentTurnInput;
      session: Session;
      streamCallbacks?: LoopStreamCallbacks;
      transient?: boolean;
    },
  ): void {
    const normalized = this.normalizeDraftArtifact(artifact);
    if (!normalized) {
      return;
    }

    const existing = params.session.currentDraft;
    const isTransient = params.transient === true;
    const nextVersion = isTransient
      ? existing?.version ?? normalized.version ?? 1
      : existing
        ? (existing.version ?? 0) + 1
        : 1;
    normalized.version = nextVersion;
    if (!normalized.generatedAt) {
      normalized.generatedAt = new Date().toISOString();
    }
    if (!isTransient) {
      params.session.currentDraft = normalized;
    }

    console.info(
      "[DRAFT_TRACE_ARTIFACT_READY]",
      this.safeJsonStringify({
        sessionId: params.input.sessionId,
        turnId: params.input.turnId,
        draftType: normalized.draftType,
        title: normalized.title,
        version: normalized.version,
        sectionCount: Array.isArray(normalized.sections) ? normalized.sections.length : 0,
        callbackPresent: typeof params.streamCallbacks?.onDraftArtifact === "function",
        transient: isTransient,
      }),
    );

    params.streamCallbacks?.onDraftArtifact?.(normalized);
  }

  private publishDraftPlaceholderFromArgs(
    args: Record<string, unknown>,
    context: ToolCallProcessingContext,
  ): void {
    const draftType = String(args.draftType ?? "").trim();
    const title = String(args.title ?? "").trim();
    if (!draftType || !title) {
      return;
    }

    const metadata = isRecord(args.metadata)
      ? Object.fromEntries(
          Object.entries(args.metadata)
            .filter(([, value]) => typeof value === "string")
            .map(([key, value]) => [key, String(value)]),
        )
      : undefined;
    const sections = this.extractDraftSectionsFromArgs(args);
    const layout = this.extractDraftLayoutFromArgs(args, sections, draftType, metadata);

    const placeholder: DraftArtifact = {
      draftType,
      title,
      subtitle: args.subtitle != null ? String(args.subtitle) : undefined,
      metadata,
      sections,
      layout,
      content: this.renderDraftContentFromSections(sections),
      linkedEntityType:
        args.linkedEntityType != null ? String(args.linkedEntityType) : undefined,
      linkedEntityId:
        typeof args.linkedEntityId === "number"
          ? args.linkedEntityId
          : Number.isFinite(Number(args.linkedEntityId))
            ? Number(args.linkedEntityId)
            : undefined,
      generatedAt: new Date().toISOString(),
      version: context.session.currentDraft?.version ?? 1,
    };

    this.publishDraftArtifact(placeholder, {
      input: context.input,
      session: context.session,
      streamCallbacks: context.streamCallbacks,
      transient: true,
    });
  }

  private buildProgressiveDraftPlaceholder(
    args: Record<string, unknown>,
  ): DraftArtifact | null {
    const draftType = String(args.draftType ?? "").trim() || "document";
    const title = String(args.title ?? "").trim() || "Generating draft…";
    const sections = this.extractDraftSectionsFromArgs(args);
    const metadata = isRecord(args.metadata)
      ? Object.fromEntries(
          Object.entries(args.metadata)
            .filter(([, value]) => typeof value === "string")
            .map(([key, value]) => [key, String(value)]),
        )
      : undefined;
    const layout = this.extractDraftLayoutFromArgs(args, sections, draftType, metadata);

    return {
      draftType,
      title,
      subtitle: args.subtitle != null ? String(args.subtitle) : undefined,
      metadata,
      sections,
      layout,
      content: this.renderDraftContentFromSections(sections),
      generatedAt: new Date().toISOString(),
      version: 1,
    };
  }

  private resolveDraftForTurn(
    input: AgentTurnInput,
    sessionDraft?: DraftArtifact,
  ): DraftArtifact | null {
    const metadata = isRecord(input.metadata) ? input.metadata : null;
    const snapshotRaw = metadata?.[DRAFT_METADATA_SNAPSHOT_KEY];
    const snapshot = this.normalizeDraftArtifact(
      isRecord(snapshotRaw) ? (snapshotRaw as unknown as DraftArtifact) : undefined,
    );
    if (snapshot) {
      return snapshot;
    }
    return this.normalizeDraftArtifact(sessionDraft);
  }

  private normalizeDraftArtifact(artifact?: DraftArtifact): DraftArtifact | null {
    if (!artifact || !isRecord(artifact)) {
      return null;
    }

    const draftType = String(artifact.draftType || "").trim();
    const title = String(artifact.title || "").trim();
    if (!draftType || !title) {
      return null;
    }

    const sections = this.normalizeDraftSections(
      (artifact as { sections?: unknown }).sections,
      String((artifact as { content?: unknown }).content || ""),
    );
    const metadata = isRecord(artifact.metadata)
      ? Object.fromEntries(
          Object.entries(artifact.metadata)
            .filter(([, value]) => typeof value === "string")
            .map(([key, value]) => [key, String(value)]),
        )
      : undefined;
    const layout = this.normalizeDraftLayout(
      (artifact as { layout?: unknown }).layout,
      sections,
      draftType,
      metadata,
    );
    const content =
      String((artifact as { content?: unknown }).content || "").trim() ||
      this.renderDraftContentFromSections(sections);

    return {
      draftType,
      title,
      subtitle:
        (artifact as { subtitle?: unknown }).subtitle != null
          ? String((artifact as { subtitle?: unknown }).subtitle)
          : undefined,
      metadata,
      sections,
      layout,
      content,
      linkedEntityType:
        (artifact as { linkedEntityType?: unknown }).linkedEntityType != null
          ? String((artifact as { linkedEntityType?: unknown }).linkedEntityType)
          : undefined,
      linkedEntityId:
        (artifact as { linkedEntityId?: unknown }).linkedEntityId != null
          ? Number((artifact as { linkedEntityId?: unknown }).linkedEntityId)
          : undefined,
      generatedAt:
        (artifact as { generatedAt?: unknown }).generatedAt != null &&
        String((artifact as { generatedAt?: unknown }).generatedAt).trim().length > 0
          ? String((artifact as { generatedAt?: unknown }).generatedAt)
          : new Date().toISOString(),
      version:
        (artifact as { version?: unknown }).version != null
          ? Number((artifact as { version?: unknown }).version)
          : 1,
    };
  }

  private extractDraftSectionsFromArgs(args: Record<string, unknown>): DraftSection[] {
    return this.normalizeDraftSections(args.sections, String(args.content || ""));
  }

  private normalizeDraftSections(
    rawSections: unknown,
    legacyContent: string,
  ): DraftSection[] {
    if (Array.isArray(rawSections) && rawSections.length > 0) {
      const sections: DraftSection[] = [];
      for (let i = 0; i < rawSections.length; i += 1) {
        const row = rawSections[i];
        if (!isRecord(row)) {
          continue;
        }
        const role = String(row.role || "").trim() || "body";
        const id = String(row.id || "").trim() || `sec_${i + 1}`;
        const section: DraftSection = {
          id,
          role,
        };
        if (row.label != null) {
          section.label = String(row.label);
        }
        if (row.text != null) {
          section.text = String(row.text);
        }
        sections.push(section);
      }
      if (sections.length > 0) {
        return sections;
      }
    }

    const fallback = String(legacyContent || "").trim();
    if (!fallback) {
      return [];
    }
    return [
      {
        id: "sec_1",
        role: "body",
        text: fallback,
      },
    ];
  }

  private extractDraftLayoutFromArgs(
    args: Record<string, unknown>,
    sections: DraftSection[],
    draftType: string,
    metadata?: Record<string, string>,
  ): DraftLayout {
    return this.normalizeDraftLayout(args.layout, sections, draftType, metadata);
  }

  private normalizeDraftLayout(
    rawLayout: unknown,
    sections: DraftSection[],
    draftType: string,
    metadata?: Record<string, string>,
  ): DraftLayout {
    const layout = isRecord(rawLayout) ? rawLayout : null;
    const content = this.renderDraftContentFromSections(sections);
    const language = this.detectDraftLanguage(
      layout?.language,
      metadata?.language,
      content,
    );
    const direction = this.detectDraftDirection(layout?.direction, language, content);
    const formality = this.detectDraftFormality(layout?.formality);
    const documentClass =
      (layout?.documentClass != null && String(layout.documentClass).trim()) ||
      draftType ||
      "other";

    return {
      direction,
      language,
      formality,
      documentClass: String(documentClass),
    };
  }

  private detectDraftLanguage(
    primary: unknown,
    secondary: unknown,
    content: string,
  ): string {
    const first = String(primary || "").trim().toLowerCase();
    if (first) return first;
    const second = String(secondary || "").trim().toLowerCase();
    if (second) return second;
    const inferred = this.detectLanguageHint(content);
    return inferred || "en";
  }

  private detectDraftDirection(
    value: unknown,
    language: string,
    content: string,
  ): "ltr" | "rtl" {
    const normalized = String(value || "").trim().toLowerCase();
    if (normalized === "rtl") return "rtl";
    if (normalized === "ltr") return "ltr";
    if (language === "ar" || /[\u0600-\u06FF]/.test(content)) {
      return "rtl";
    }
    return "ltr";
  }

  private detectDraftFormality(
    value: unknown,
  ): DraftLayout["formality"] {
    const normalized = String(value || "").trim().toLowerCase();
    if (
      normalized === "formal" ||
      normalized === "standard" ||
      normalized === "casual"
    ) {
      return normalized;
    }
    return "formal";
  }

  private renderDraftContentFromSections(sections: DraftSection[]): string {
    return sections
      .map((section) => {
        const label = String(section.label || "").trim();
        const text = String(section.text || "").trim();
        if (!label && !text) return "";
        if (!label) return text;
        if (!text) return label;
        return `${label} ${text}`.trim();
      })
      .filter(Boolean)
      .join("\n\n");
  }

  private buildDraftSummaryForPrompt(artifact: DraftArtifact): {
    sections: Array<{ id: string; role: string; label?: string; text?: string }>;
  } {
    return {
      sections: artifact.sections.slice(0, 40).map((section) => ({
        id: section.id,
        role: section.role,
        ...(section.label ? { label: section.label } : {}),
        ...(section.text ? { text: this.truncate(String(section.text), 400) } : {}),
      })),
    };
  }

  private async generateAssistantResponse(
    params: {
      messages: LLMMessage[];
      tools?: Array<Record<string, unknown>>;
      metadata?: Record<string, unknown>;
      signal?: AbortSignal;
    },
    streamCallbacks?: LoopStreamCallbacks,
    suppressTextDelta = false,
  ): Promise<{ text: string; toolCalls: LLMToolCall[]; finishReason: string }> {
    const textParts: string[] = [];
    const toolCallsById = new Map<string, LLMToolCall>();
    let chunkIndex = 0;
    let finishReason = "stop";
    let streamed = false;

    try {
      for await (const chunk of this.llm.stream(params)) {
        streamed = true;
        if (typeof chunk.deltaText === "string" && chunk.deltaText.length > 0) {
          textParts.push(chunk.deltaText);
          if (!suppressTextDelta) {
            streamCallbacks?.onTextDelta?.(chunk.deltaText);
          }
        }

        if (chunk.toolCall) {
          const raw = chunk.toolCall;
          const id =
            typeof raw.id === "string" && raw.id.trim().length > 0
              ? raw.id.trim()
              : `tool_stream_${chunkIndex++}`;
          const existing = toolCallsById.get(id) ?? { id, name: "", arguments: {} };
          if (typeof raw.name === "string" && raw.name.trim().length > 0) {
            existing.name = raw.name.trim();
          }
          const normalizedArgs = this.normalizeArgs(raw.arguments);
          if (isRecord(normalizedArgs)) {
            existing.arguments = { ...(existing.arguments || {}), ...normalizedArgs };
          }
          toolCallsById.set(id, existing);
        }

        if (typeof chunk.finishReason === "string" && chunk.finishReason.trim().length > 0) {
          finishReason = chunk.finishReason;
        }
        if (chunk.done === true) {
          break;
        }
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      streamed = false;
    }

    if (!streamed) {
      return this.llm.generate(params);
    }

    const toolCalls = Array.from(toolCallsById.values()).filter(
      (call) => typeof call.name === "string" && call.name.trim().length > 0,
    );
    return {
      text: textParts.join(""),
      toolCalls,
      finishReason,
    };
  }

  private buildInitialMessages(
    input: AgentTurnInput,
    session: Session,
    turnType: TurnType,
  ): LLMMessage[] {
    if (this.memory?.contextAssembler?.build) {
      try {
        const built = this.memory.contextAssembler.build(session, input);
        const normalized = this.normalizeMemoryMessages(built, input.message);
        if (normalized.length > 0) {
          return normalized;
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown context assembler error");
        console.warn(`[agent.memory] context assembly fallback: ${message}`);
      }
    }

    const context = buildContext(session);
    const messages: LLMMessage[] = [];
    messages.push({
      role: "system",
      content: READ_POLICY_INSTRUCTIONS,
    });

    if (context.summary) {
      messages.push({
        role: "system",
        content: `Conversation summary:\n${context.summary}`,
      });
    }

    for (const turn of context.lastTurns) {
      messages.push({
        role: turn.role,
        content: turn.message,
      });
    }

    if (turnType === TurnTypeEnum.AMENDMENT && context.pendingAction) {
      messages.push({
        role: "system",
        content: [
          "There is a pending action awaiting confirmation.",
          JSON.stringify(context.pendingAction, null, 2),
          "User requested an amendment. Update the same tool proposal with revised args.",
        ].join("\n"),
      });
    }

    const currentDraftForTurn = this.resolveDraftForTurn(input, session.currentDraft);
    if (currentDraftForTurn) {
      const summary = this.buildDraftSummaryForPrompt(currentDraftForTurn);
      messages.push({
        role: "system",
        content: [
          "CURRENT DRAFT IN SESSION (version " + currentDraftForTurn.version + "):",
          "Type: " + currentDraftForTurn.draftType,
          "Title: " + currentDraftForTurn.title,
          "Layout: " + JSON.stringify(currentDraftForTurn.layout),
          "Sections JSON:",
          JSON.stringify(summary, null, 2),
          "",
          "If the user asks to regenerate or modify this draft, call generateDraft with updated sections and layout.",
        ].join("\n"),
      });
    }

    const regenerateRequested =
      isRecord(input.metadata) && input.metadata?.regenerateDraft === true;
    if (regenerateRequested && currentDraftForTurn) {
      messages.push({
        role: "system",
        content: [
          "DRAFT REGENERATION MODE",
          "The user asked to regenerate/modify the current draft.",
          "Use the CURRENT DRAFT IN SESSION as the baseline and apply only the user's new instructions.",
          "Do not ask to re-select client/dossier/case unless the user explicitly requests changing target context.",
          "Call generateDraft exactly once with updated sections and layout, then return a short confirmation.",
        ].join("\n"),
      });
    }

    // Inject attached session document content — budget gate for RAG
    const RAG_FULL_TEXT_BUDGET_FALLBACK = 8000;
    const RAG_CURRENT_DOC_BUDGET_FALLBACK = 5000;
    try {
      const docContext = agentDocumentsService.buildAgentDocumentContext(input.sessionId);
      if (docContext && docContext.documents && docContext.documents.length > 0) {
        const turnDocIds = new Set(
          Array.isArray(input.metadata?.documentIds) ? (input.metadata.documentIds as number[]).map(Number) : []
        );
        const currentDocs: any[] = [];
        const backgroundDocs: any[] = [];
        for (const doc of docContext.documents) {
          if (turnDocIds.size > 0 && turnDocIds.has(doc.document_id)) {
            currentDocs.push(doc);
          } else {
            backgroundDocs.push(doc);
          }
        }
        let totalChars = 0;
        for (const doc of docContext.documents) {
          if (doc.has_text && doc.text) {
            totalChars += doc.text.length;
          }
        }
        const useFullText = totalChars <= RAG_FULL_TEXT_BUDGET_FALLBACK;
        if (useFullText) {
          const currentParts: string[] = [];
          const backgroundParts: string[] = [];
          for (const doc of docContext.documents) {
            const label = doc.original_filename || doc.title;
            const line = doc.has_text && doc.text
              ? `--- Document: ${label} (${doc.mime_type}) ---\n${doc.text}`
              : `--- Document: ${label} (${doc.mime_type}) --- [text not available: ${doc.text_status}]`;
            if (turnDocIds.size > 0 && turnDocIds.has(doc.document_id)) {
              currentParts.push(line);
            } else {
              backgroundParts.push(line);
            }
          }
          if (turnDocIds.size > 0 && currentParts.length > 0) {
            messages.push({
              role: "system",
              content: `Documents attached to the current message (focus your answer on these):\n\n${currentParts.join("\n\n")}`,
            });
            if (backgroundParts.length > 0) {
              messages.push({
                role: "system",
                content: `Other session documents (for reference only, the user is NOT asking about these right now):\n\n${backgroundParts.join("\n\n")}`,
              });
            }
          } else {
            const allParts = [...currentParts, ...backgroundParts];
            if (allParts.length > 0) {
              messages.push({
                role: "system",
                content: `Session documents available for reference:\n\n${allParts.join("\n\n")}`,
              });
            }
          }
        } else {
          console.info(`[RAG] session=${input.sessionId} mode=rag total_chars=${totalChars} budget=${RAG_FULL_TEXT_BUDGET_FALLBACK} docs=${docContext.documents.length}`);
          if (currentDocs.length > 0) {
            let currentChars = 0;
            for (const doc of currentDocs) {
              if (doc.has_text && doc.text) {
                currentChars += doc.text.length;
              }
            }
            if (currentChars <= RAG_CURRENT_DOC_BUDGET_FALLBACK) {
              const parts: string[] = [];
              for (const doc of currentDocs) {
                const label = doc.original_filename || doc.title;
                parts.push(doc.has_text && doc.text
                  ? `--- Document: ${label} (${doc.mime_type}) ---\n${doc.text}`
                  : `--- Document: ${label} (${doc.mime_type}) --- [text not available: ${doc.text_status}]`);
              }
              messages.push({
                role: "system",
                content: `Documents attached to the current message (focus your answer on these):\n\n${parts.join("\n\n")}`,
              });
            } else {
              const parts: string[] = [];
              let usedChars = 0;
              for (const doc of currentDocs) {
                const label = doc.original_filename || doc.title;
                if (!doc.has_text || !doc.text) {
                  parts.push(`--- Document: ${label} (${doc.mime_type}) --- [text not available: ${doc.text_status}]`);
                  continue;
                }
                const remaining = RAG_CURRENT_DOC_BUDGET_FALLBACK - usedChars;
                if (remaining <= 0) {
                  parts.push(`--- Document: ${label} (${doc.mime_type}) --- [text truncated, use searchDocuments tool for full content]`);
                  continue;
                }
                if (doc.text.length <= remaining) {
                  parts.push(`--- Document: ${label} (${doc.mime_type}) ---\n${doc.text}`);
                  usedChars += doc.text.length;
                } else {
                  parts.push(`--- Document: ${label} (${doc.mime_type}) [truncated] ---\n${doc.text.slice(0, remaining)}...\n[Document truncated. Use searchDocuments tool to search for specific content.]`);
                  usedChars += remaining;
                }
              }
              messages.push({
                role: "system",
                content: `Documents attached to the current message (focus your answer on these):\n\n${parts.join("\n\n")}`,
              });
            }
          }
          if (backgroundDocs.length > 0) {
            const manifestLines: string[] = [];
            for (const doc of backgroundDocs) {
              const label = doc.original_filename || doc.title;
              const status = doc.has_text ? "readable" : (doc.text_status || "unknown");
              const size = doc.text ? `${Math.round(doc.text.length / 1000)}k chars` : "no text";
              manifestLines.push(`- ${label} (${doc.mime_type}, ${status}, ${size})`);
            }
            messages.push({
              role: "system",
              content: `Other session documents (available for reference — use searchDocuments tool to search their content):\n\n${manifestLines.join("\n")}`,
            });
          }
        }
      }
    } catch (docErr) {
      // Non-critical: if document loading fails, continue without document context
    }

    const followUpResolutionInstruction = this.buildFollowUpResolutionSystemInstruction(input.metadata);
    if (followUpResolutionInstruction) {
      messages.push({
        role: "system",
        content: followUpResolutionInstruction,
      });
    }

    messages.push({ role: "user", content: input.message });
    return messages;
  }

  private buildFollowUpResolutionSystemInstruction(
    metadata: AgentTurnInput["metadata"],
  ): string | null {
    const root = isRecord(metadata) ? metadata : null;
    const followUpIntent = isRecord(root?.followUpIntent) ? root.followUpIntent : null;
    const resolution = isRecord(followUpIntent?.resolution) ? followUpIntent.resolution : null;
    const decision = String(resolution?.decision || "").trim().toLowerCase();
    const selected = Array.isArray(resolution?.selected) ? resolution.selected : [];
    if (!decision) {
      return null;
    }
    const lines = [
      "FOLLOW-UP CONTEXT RESOLUTION",
      `Decision: ${decision}`,
    ];
    if (selected.length > 0) {
      lines.push("Selected entities:");
      for (const row of selected.slice(0, 10)) {
        if (!isRecord(row)) {
          continue;
        }
        const entityType = String(row.entityType || "entity").trim() || "entity";
        const entityId = row.entityId != null ? String(row.entityId) : "unknown";
        const label = String(row.label || "").trim();
        lines.push(`- ${entityType}:${entityId}${label ? ` (${label})` : ""}`);
      }
    }
    if (decision === "all") {
      lines.push("Interpret this as an aggregate request over all listed matches.");
    } else if (decision === "none") {
      lines.push("Do not assume any listed candidate; ask the user for a new identifier/filter.");
    } else if (decision === "multi") {
      lines.push("Interpret this as a multi-entity request scoped to the selected matches.");
    } else {
      lines.push("Interpret this as a single-entity selection.");
    }
    lines.push("Honor this resolution before asking for additional context.");
    return lines.join("\n");
  }

  private createPendingAction(
    toolName: string,
    args: Record<string, unknown>,
    input: AgentTurnInput,
    category: ToolCategory,
  ): PendingAction {
    return {
      id: this.createId("pending"),
      toolName,
      summary: `${toolName}(${this.safeJsonStringify(args)})`,
      args,
      createdAt: new Date().toISOString(),
      requestedByTurnId: input.turnId,
      risk: this.mapRisk(category),
    };
  }

  private createPendingPlanAction(params: {
    toolName: string;
    args: Record<string, unknown>;
    input: AgentTurnInput;
    summary: string;
    plan: PendingActionPlan;
  }): PendingAction {
    const summary = String(params.summary || "").trim();
    const normalizedSummary =
      summary || this.describePlanOperation(params.plan.operation);
    return {
      id: this.createId("pending"),
      toolName: params.toolName,
      summary: normalizedSummary,
      args: params.args,
      plan: params.plan,
      createdAt: new Date().toISOString(),
      requestedByTurnId: params.input.turnId,
      risk:
        Array.isArray(params.plan.workflowSteps) && params.plan.workflowSteps.length > 1
          ? "high"
          : this.mapRisk(ToolCategory.PLAN),
    };
  }

  private buildPlanArtifact(action: PendingAction): PlanArtifact {
    const plan = action.plan as PendingActionPlan;
    const artifact: PlanArtifact = {
      pendingActionId: action.id,
      operation: plan.operation,
      summary: action.summary,
      ...(plan.uiPreview ? { preview: plan.uiPreview } : plan.preview ? { preview: plan.preview } : {}),
    };
    if (Array.isArray(plan.workflowSteps) && plan.workflowSteps.length > 0) {
      artifact.workflow = {
        totalSteps: plan.workflowSteps.length,
        steps: plan.workflowSteps,
        requiresUserDecision: plan.diagnostics?.requiresUserDecision === true,
      };
    }
    return artifact;
  }

  private buildPlanExecutedArtifact(
    pendingActionId: string,
    result: ToolExecutionResult,
  ): PlanExecutedArtifact {
    const artifact: PlanExecutedArtifact = {
      pendingActionId,
      ok: result.ok === true,
    };
    if (isRecord(result.data)) {
      if (Array.isArray(result.data.stepResults)) {
        artifact.stepResults = result.data.stepResults;
      }
      if (typeof result.data.failedStepId === "string" && result.data.failedStepId.trim().length > 0) {
        artifact.failedStepId = result.data.failedStepId.trim();
      }
      if (isRecord(result.data.errorDetails)) {
        artifact.errorDetails = result.data.errorDetails;
      }
    }
    if (result.ok && isRecord(result.data)) {
      artifact.result = result.data;
    }
    if (!result.ok) {
      if (typeof result.errorCode === "string" && result.errorCode.trim().length > 0) {
        artifact.errorCode = result.errorCode.trim();
      }
      if (typeof result.errorMessage === "string" && result.errorMessage.trim().length > 0) {
        artifact.errorMessage = result.errorMessage.trim();
      }
    }
    return artifact;
  }

  private buildPlanRejectedArtifact(pendingActionId: string): PlanRejectedArtifact {
    return { pendingActionId };
  }

  private normalizeEntityExecutionResult(result: EntityExecutionResult): ToolExecutionResult {
    if (!result.ok) {
      return {
        ok: false,
        errorCode: result.errorCode || "ENTITY_EXECUTION_ERROR",
        errorMessage: result.errorMessage || "Entity execution failed.",
        data: {
          ...(Array.isArray(result.stepResults) ? { stepResults: result.stepResults } : {}),
          ...(result.failedStepId ? { failedStepId: result.failedStepId } : {}),
          ...(isRecord(result.errorDetails) ? { errorDetails: result.errorDetails } : {}),
        },
      };
    }
    const payload: Record<string, unknown> = isRecord(result.result) ? { ...result.result } : {};
    if (Array.isArray(result.stepResults)) {
      payload.stepResults = result.stepResults;
    }
    if (result.failedStepId) {
      payload.failedStepId = result.failedStepId;
    }
    return {
      ok: true,
      data: payload,
    };
  }

  private trackConfirmedPlanEntity(
    session: Session,
    plan: PendingActionPlan,
    executionResult: EntityExecutionResult,
    turnId: string,
  ): void {
    const rootOperation = plan?.rootOperation || plan?.operation;
    const entityType = String(rootOperation?.entityType || "").trim().toLowerCase();
    if (!entityType) {
      return;
    }
    const entityId = this.resolvePlanEntityId(plan, executionResult);
    if (entityId == null) {
      return;
    }

    if (!Array.isArray(session.activeEntities)) {
      session.activeEntities = [];
    }

    const entityKey = `${entityType}:${String(entityId)}`;
    if (rootOperation?.operation === "delete") {
      session.activeEntities = session.activeEntities.filter((row) => {
        const rowType = String((row as { type?: unknown })?.type || "")
          .trim()
          .toLowerCase();
        const rowId = (row as { id?: unknown })?.id;
        return `${rowType}:${String(rowId)}` !== entityKey;
      });
      return;
    }

    const now = new Date().toISOString();
    const existingIndex = session.activeEntities.findIndex((row) => {
      const rowType = String((row as { type?: unknown })?.type || "")
        .trim()
        .toLowerCase();
      const rowId = (row as { id?: unknown })?.id;
      return `${rowType}:${String(rowId)}` === entityKey;
    });
    const next = {
      type: entityType,
      id: entityId,
      sourceTool: "plan_executor",
      lastMentionedAt: now,
      lastReferencedTurnId: turnId,
    };
    if (existingIndex === -1) {
      session.activeEntities.push(next);
      return;
    }
    session.activeEntities[existingIndex] = {
      ...session.activeEntities[existingIndex],
      ...next,
    };
  }

  private resolvePlanEntityId(
    plan: PendingActionPlan,
    executionResult: EntityExecutionResult,
  ): number | string | null {
    const result = isRecord(executionResult?.result) ? executionResult.result : null;
    const fromResultId = this.normalizePlanEntityId(result?.entityId);
    if (fromResultId != null) {
      return fromResultId;
    }
    const entityRecord = isRecord(result?.entity) ? result.entity : null;
    const fromEntityRecord = this.normalizePlanEntityId(entityRecord?.id);
    if (fromEntityRecord != null) {
      return fromEntityRecord;
    }
    const rootOperation = plan?.rootOperation || plan?.operation;
    return this.normalizePlanEntityId(rootOperation?.entityId);
  }

  private normalizePlanEntityId(value: unknown): number | string | null {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      if (/^\d+$/.test(trimmed)) {
        const parsed = Number.parseInt(trimmed, 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
      return trimmed;
    }
    return null;
  }

  private mapRisk(category: ToolCategory): "low" | "medium" | "high" {
    switch (category) {
      case ToolCategory.READ:
        return "low";
      case ToolCategory.WRITE:
      case ToolCategory.EXECUTE:
        return "high";
      case ToolCategory.PLAN:
      case ToolCategory.EXTERNAL:
      default:
        return "medium";
    }
  }

  private buildConfirmationMessage(action: PendingAction): string {
    if (action.plan) {
      const stepCount = Array.isArray(action.plan.workflowSteps)
        ? action.plan.workflowSteps.length
        : 1;
      const requiresDecision = action.plan.diagnostics?.requiresUserDecision === true;
      return [
        "I prepared a plan and did not execute it.",
        `Proposed operation: ${action.summary}`,
        `Planned steps: ${stepCount}.`,
        ...(requiresDecision
          ? [
              "This plan needs an explicit decision before execution.",
              action.plan.diagnostics?.decisionPrompt || "Please amend the request with your decision and confirm again.",
            ]
          : []),
        "Please confirm to execute or reject to cancel.",
      ].join("\n");
    }
    return [
      "I prepared a pending action and did not execute it.",
      `Proposed operation: ${action.summary}`,
      "Please confirm to execute or reject to cancel.",
    ].join("\n");
  }

  private extractPlanProposal(result: ToolExecutionResult): {
    operation: PlanOperation;
    summary: string;
    preview?: PlanPreview;
  } | null {
    if (!result.ok || !isRecord(result.data)) {
      return null;
    }
    const proposal = isRecord(result.data.proposal) ? result.data.proposal : null;
    if (!proposal) {
      return null;
    }

    const operation = this.normalizePlanOperation(proposal.operation);
    if (!operation) {
      return null;
    }

    const summaryRaw = String(proposal.summary || "").trim();
    const preview = this.normalizePlanPreview(proposal.preview);
    return {
      operation,
      summary: summaryRaw || this.describePlanOperation(operation),
      ...(preview ? { preview } : {}),
    };
  }

  private normalizePlanOperation(value: unknown): PlanOperation | null {
    if (!isRecord(value)) {
      return null;
    }
    const operationRaw = String(value.operation || "").trim().toLowerCase();
    if (
      operationRaw !== "create" &&
      operationRaw !== "update" &&
      operationRaw !== "delete"
    ) {
      return null;
    }
    const entityType = String(value.entityType || "").trim();
    if (!entityType) {
      return null;
    }

    const operation: PlanOperation = {
      operation: operationRaw,
      entityType,
    };

    if (typeof value.entityId === "number" && Number.isFinite(value.entityId)) {
      operation.entityId = value.entityId;
    } else if (typeof value.entityId === "string") {
      const idText = value.entityId.trim();
      if (idText) {
        operation.entityId = idText;
      }
    }
    if (isRecord(value.payload)) {
      operation.payload = { ...value.payload };
    }
    if (isRecord(value.changes)) {
      operation.changes = { ...value.changes };
    }
    if (typeof value.reason === "string") {
      const reason = value.reason.trim();
      if (reason) {
        operation.reason = reason;
      }
    }

    return operation;
  }

  private normalizePlanPreview(value: unknown): PlanPreview | undefined {
    if (!isRecord(value)) {
      return undefined;
    }

    const preview: PlanPreview = {};
    if (typeof value.title === "string" && value.title.trim().length > 0) {
      preview.title = value.title.trim();
    }
    if (typeof value.subtitle === "string" && value.subtitle.trim().length > 0) {
      preview.subtitle = value.subtitle.trim();
    }
    if (Array.isArray(value.fields)) {
      const fields = value.fields
        .filter((row) => isRecord(row) && typeof row.key === "string" && row.key.trim().length > 0)
        .slice(0, 30)
        .map((row) => {
          const parsed = row as Record<string, unknown>;
          const field: { key: string; from?: unknown; to?: unknown } = {
            key: String(parsed.key).trim(),
          };
          if (Object.prototype.hasOwnProperty.call(parsed, "from")) {
            field.from = parsed.from;
          }
          if (Object.prototype.hasOwnProperty.call(parsed, "to")) {
            field.to = parsed.to;
          }
          return field;
        });
      if (fields.length > 0) {
        preview.fields = fields;
      }
    }
    if (Array.isArray(value.warnings)) {
      const warnings = value.warnings
        .map((entry) => String(entry || "").trim())
        .filter(Boolean)
        .slice(0, 30);
      if (warnings.length > 0) {
        preview.warnings = warnings;
      }
    }

    return Object.keys(preview).length > 0 ? preview : undefined;
  }

  private resolvePlanLinkingPreflight(
    toolName: string,
    args: Record<string, unknown>,
    session: Session,
    input: AgentTurnInput,
  ): {
    args: Record<string, unknown>;
    linkResolution?: LinkResolutionDiagnostic;
    result?: ToolExecutionResult;
  } {
    if (toolName !== "proposeCreate") {
      return { args };
    }

    const operation = this.normalizePlanOperation({
      operation: "create",
      entityType: args?.entityType,
      payload: isRecord(args?.payload) ? args.payload : undefined,
      reason: args?.reason,
    });
    if (!operation) {
      return { args };
    }

    const linkResolution = this.linkResolver.resolve(operation, {
      activeEntities: Array.isArray(session.activeEntities) ? session.activeEntities : [],
      currentDraft: session.currentDraft || null,
    });
    const status = linkResolution.status;
    if (status === "ambiguous" || status === "unresolved") {
      return {
        args,
        linkResolution: this.shouldAttachLinkResolution(linkResolution.diagnostic)
          ? linkResolution.diagnostic
          : undefined,
        result: {
          ok: false,
          errorCode:
            status === "ambiguous"
              ? "PLAN_LINK_RESOLUTION_AMBIGUOUS"
              : "PLAN_LINK_RESOLUTION_UNRESOLVED",
          errorMessage:
            linkResolution.message ||
            (status === "ambiguous"
              ? "Could not determine a single parent link for this create operation."
              : "Could not resolve required parent link for this create operation."),
          data: {
            linkResolution: linkResolution.diagnostic,
          },
        },
      };
    }

    const nextArgs = { ...args };
    nextArgs.entityType = linkResolution.operation.entityType;
    if (isRecord(linkResolution.operation.payload)) {
      nextArgs.payload = { ...linkResolution.operation.payload };
    }

    if (linkResolution.operation.entityType === "document") {
      const bridged = this.maybeAttachDraftDocumentStorageSource(nextArgs, session, input);
      if (bridged.result) {
        return {
          args: bridged.args,
          linkResolution: this.shouldAttachLinkResolution(linkResolution.diagnostic)
            ? linkResolution.diagnostic
            : undefined,
          result: bridged.result,
        };
      }
      nextArgs.payload = bridged.args.payload;
    }

    return {
      args: nextArgs,
      linkResolution: this.shouldAttachLinkResolution(linkResolution.diagnostic)
        ? linkResolution.diagnostic
        : undefined,
    };
  }

  private maybeAttachDraftDocumentStorageSource(
    args: Record<string, unknown>,
    session: Session,
    input: AgentTurnInput,
  ): {
    args: Record<string, unknown> & { payload: Record<string, unknown> };
    result?: ToolExecutionResult;
  } {
    const payload = isRecord(args.payload) ? { ...args.payload } : {};
    const nextArgs = {
      ...args,
      payload,
    };

    const hasFilePath =
      this.hasNonEmptyText(payload.file_path) || this.hasNonEmptyText(payload.filePath);
    const generationToken = this.resolveDocumentGenerationToken(payload);
    if (hasFilePath || generationToken) {
      return { args: nextArgs };
    }

    const draft = this.resolveDraftForTurn(input, session.currentDraft);
    if (!draft) {
      return {
        args: nextArgs,
        result: {
          ok: false,
          errorCode: "PLAN_DRAFT_SOURCE_UNAVAILABLE",
          errorMessage:
            "No current draft is available to save as a document. Generate or select a draft first.",
        },
      };
    }

    payload.generation_uid = DOCUMENT_DRAFT_SOURCE_TOKEN;
    payload[DOCUMENT_DRAFT_SNAPSHOT_KEY] = {
      draftType: draft.draftType,
      title: draft.title,
      subtitle: draft.subtitle,
      metadata: draft.metadata,
      sections: draft.sections,
      layout: draft.layout,
      content: draft.content,
      linkedEntityType: draft.linkedEntityType,
      linkedEntityId: draft.linkedEntityId,
      generatedAt: draft.generatedAt,
      version: draft.version,
    };
    payload[DOCUMENT_DRAFT_PROVENANCE_KEY] = {
      sessionId: session.id,
      sourceTurnId: input.turnId,
      draftVersion: draft.version,
    };

    console.info(
      "[DRAFT_STORAGE_BRIDGE_ATTACHED]",
      this.safeJsonStringify({
        sessionId: session.id,
        turnId: input.turnId,
        draftType: draft.draftType,
        draftVersion: draft.version,
        linkedEntityType: draft.linkedEntityType || null,
        linkedEntityId:
          typeof draft.linkedEntityId === "number" && Number.isFinite(draft.linkedEntityId)
            ? draft.linkedEntityId
            : null,
        payloadKeys: Object.keys(payload),
      }),
    );

    return { args: nextArgs };
  }

  private resolveDocumentGenerationToken(payload: Record<string, unknown>): string | null {
    const keys = [
      "generation_uid",
      "generationUid",
      "generation_id",
      "generationId",
      "source_generation_uid",
      "sourceGenerationUid",
      "document_generation_uid",
      "documentGenerationUid",
      "preview_uid",
      "previewUid",
      "document_preview_uid",
      "documentPreviewUid",
    ];
    for (const key of keys) {
      const value = payload[key];
      if (typeof value !== "string") {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        return trimmed;
      }
    }
    return null;
  }

  private hasNonEmptyText(value: unknown): boolean {
    return typeof value === "string" && value.trim().length > 0;
  }

  private shouldAttachLinkResolution(
    diagnostic?: LinkResolutionDiagnostic,
  ): boolean {
    if (!diagnostic) return false;
    if (
      diagnostic.status === "resolved" ||
      diagnostic.status === "ambiguous" ||
      diagnostic.status === "unresolved"
    ) {
      return true;
    }
    return diagnostic.status === "unchanged" && diagnostic.source === "payload";
  }

  private tryBuildPlanLinkResolutionClarification(
    result: ToolExecutionResult,
    args: Record<string, unknown>,
  ): string | null {
    if (!result || result.ok !== false) return null;
    const code = String(result.errorCode || "").trim().toUpperCase();
    if (
      code !== "PLAN_LINK_RESOLUTION_AMBIGUOUS" &&
      code !== "PLAN_LINK_RESOLUTION_UNRESOLVED"
    ) {
      return null;
    }

    const data = isRecord(result.data) ? result.data : null;
    const rawDiagnostic = isRecord(data?.linkResolution) ? data.linkResolution : null;
    const diagnostic =
      rawDiagnostic && typeof rawDiagnostic.status === "string"
        ? (rawDiagnostic as unknown as LinkResolutionDiagnostic)
        : undefined;
    const entityType = String(
      args?.entityType ||
        (typeof diagnostic?.entityType === "string" ? diagnostic.entityType : "") ||
        "record",
    )
      .trim()
      .toLowerCase();
    const entityLabel = entityType ? entityType.replace(/_/g, " ") : "record";

    if (code === "PLAN_LINK_RESOLUTION_UNRESOLVED") {
      const requirement = this.describeCreateLinkRequirement(entityType);
      return [
        `I need a parent link before I can prepare this create action for ${entityLabel}.`,
        requirement,
      ].join("\n");
    }

    const candidates = Array.isArray(diagnostic?.candidates)
      ? diagnostic.candidates
          .filter(
            (row) =>
              row &&
              typeof row.entityType === "string" &&
              row.entityType.trim().length > 0 &&
              (typeof row.entityId === "number" || typeof row.entityId === "string"),
          )
          .slice(0, 6)
      : [];
    if (candidates.length === 0) {
      return [
        `I found multiple possible parent links for this ${entityLabel}.`,
        this.describeCreateLinkRequirement(entityType),
      ].join("\n");
    }

    const options = candidates.map((candidate, index) => {
      const type = String(candidate.entityType || "").trim().toLowerCase().replace(/_/g, " ");
      const typeTitle = type.length > 0 ? type.charAt(0).toUpperCase() + type.slice(1) : "Record";
      const label =
        typeof candidate.label === "string" && candidate.label.trim().length > 0
          ? candidate.label.trim()
          : `${typeTitle} #${String(candidate.entityId)}`;
      return `${index + 1}. ${typeTitle}: ${label}`;
    });

    return [
      `I found multiple parent targets for this ${entityLabel}. Please choose one before I prepare the proposal.`,
      ...options,
      "Reply with the number or the exact reference you want.",
    ].join("\n");
  }

  private describeCreateLinkRequirement(entityType: string): string {
    if (entityType === "task" || entityType === "session" || entityType === "mission") {
      return "Please specify the parent dossier or lawsuit.";
    }
    if (entityType === "document") {
      return (
        "Please specify exactly one parent to store this document under: " +
        "client, dossier, lawsuit, mission, task, session, personal task, financial entry, or officer."
      );
    }
    return "Please specify exactly one parent record and try again.";
  }

  private describePlanOperation(operation: PlanOperation): string {
    const base = `${operation.operation} ${operation.entityType}`;
    if (operation.entityId == null) {
      return base;
    }
    return `${base} ${String(operation.entityId)}`;
  }

  private createExecutionContext(
    input: AgentTurnInput,
    session: Session,
  ): ToolExecutionContext {
    return {
      sessionId: session.id,
      turnId: input.turnId,
      userId: input.userId ?? session.userId,
      metadata: input.metadata,
    };
  }

  private validatePermissionBoundary(
    input: AgentTurnInput,
    session: Session,
    toolCategory: ToolCategory,
    permissionDecision: { allowed: boolean; requiresConfirmation: boolean },
    toolName: string,
  ): ToolExecutionResult | null {
    const runtime = this as AgenticLoop & {
      __security?: {
        validatePermissionBoundary?: (params: Record<string, unknown>) => unknown;
      };
    };
    const security = runtime.__security;
    if (!security || typeof security.validatePermissionBoundary !== "function") {
      return null;
    }

    const securityMetadata = isRecord(input.metadata?.security)
      ? input.metadata.security
      : undefined;
    const authScope =
      securityMetadata && typeof securityMetadata.authScope === "string"
        ? securityMetadata.authScope
        : "unknown";
    this.maybeLogBoundaryCheck({
      authScope,
      toolCategory,
      allowed: permissionDecision.allowed,
      requiresConfirmation: permissionDecision.requiresConfirmation,
      stage: "evaluate",
    });

    let validation: unknown;
    try {
      validation = security.validatePermissionBoundary({
        authScope,
        toolCategory,
        permissionDecision,
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Permission boundary validation failed.";
      this.maybeLogBoundaryCheck({
        authScope,
        toolCategory,
        allowed: permissionDecision.allowed,
        requiresConfirmation: permissionDecision.requiresConfirmation,
        stage: "error",
        reason,
      });
      return {
        ok: false,
        errorCode: "SECURITY_PERMISSION_BOUNDARY_VIOLATION",
        errorMessage: reason,
      };
    }

    const row = isRecord(validation) ? validation : null;
    if (row?.valid === true) {
      return null;
    }

    const reason =
      typeof row?.reason === "string" && row.reason.trim().length > 0
        ? row.reason
        : `Permission boundary validation failed for tool "${toolName}".`;
    this.maybeLogBoundaryCheck({
      authScope,
      toolCategory,
      allowed: permissionDecision.allowed,
      requiresConfirmation: permissionDecision.requiresConfirmation,
      stage: "denied",
      reason,
    });

    return {
      ok: false,
      errorCode: "SECURITY_PERMISSION_BOUNDARY_VIOLATION",
      errorMessage: reason,
    };
  }

  private isWritesExecutionBlockedBySafeMode(): boolean {
    const operations = this.getOperationsRuntime();
    return Boolean(
      operations &&
      operations.safeMode &&
      typeof operations.safeMode.isWritesDisabled === "function" &&
      operations.safeMode.isWritesDisabled() === true,
    );
  }

  private isSummarizationDisabledBySafeMode(): boolean {
    const operations = this.getOperationsRuntime();
    return Boolean(
      operations &&
      operations.safeMode &&
      typeof operations.safeMode.isSummarizationDisabled === "function" &&
      operations.safeMode.isSummarizationDisabled() === true,
    );
  }

  private maybeLogBoundaryCheck(payload: Record<string, unknown>): void {
    const operations = this.getOperationsRuntime();
    const shouldLog =
      operations &&
      operations.debugFlags &&
      typeof operations.debugFlags.shouldLogToolBoundaryChecks === "function" &&
      operations.debugFlags.shouldLogToolBoundaryChecks() === true;
    if (shouldLog) {
      console.info("[agent.operations] tool boundary check", payload);
    }
  }

  private getOperationsRuntime(): {
    safeMode?: {
      isWritesDisabled?: () => boolean;
      isRetrievalDisabled?: () => boolean;
      isSummarizationDisabled?: () => boolean;
    };
    debugFlags?: {
      shouldLogToolBoundaryChecks?: () => boolean;
      shouldLogVerboseTurnTrace?: () => boolean;
    };
  } | null {
    const runtime = this as AgenticLoop & { __operations?: unknown };
    if (!runtime.__operations || typeof runtime.__operations !== "object") {
      return null;
    }
    return runtime.__operations as {
      safeMode?: {
        isWritesDisabled?: () => boolean;
        isRetrievalDisabled?: () => boolean;
        isSummarizationDisabled?: () => boolean;
      };
      debugFlags?: {
        shouldLogToolBoundaryChecks?: () => boolean;
        shouldLogVerboseTurnTrace?: () => boolean;
      };
    };
  }

  private createReadObservabilityCounters(): ReadObservabilityCounters {
    return {
      READ_TOOL_CALL_COUNT: 0,
      READ_EMPTY_RESULTS: 0,
      READ_WARNINGS: 0,
      GRAPH_WARNINGS: 0,
      STATUS_WARNINGS: 0,
    };
  }

  private createLinkResolutionObservabilityCounters(): LinkResolutionObservabilityCounters {
    return {
      LINK_RESOLUTION_TOTAL: 0,
      LINK_RESOLUTION_RESOLVED: 0,
      LINK_RESOLUTION_UNCHANGED: 0,
      LINK_RESOLUTION_AMBIGUOUS: 0,
      LINK_RESOLUTION_UNRESOLVED: 0,
      LINK_RESOLUTION_FAILURES: 0,
    };
  }

  private logReadObservabilitySummary(counters: ReadObservabilityCounters): void {
    console.info("[READ_OBSERVABILITY_SUMMARY]", {
      READ_TOOL_CALL_COUNT: counters.READ_TOOL_CALL_COUNT,
      READ_EMPTY_RESULTS: counters.READ_EMPTY_RESULTS,
      READ_WARNINGS: counters.READ_WARNINGS,
      GRAPH_WARNINGS: counters.GRAPH_WARNINGS,
      STATUS_WARNINGS: counters.STATUS_WARNINGS,
    });
  }

  private logLinkResolutionObservabilitySummary(
    counters: LinkResolutionObservabilityCounters,
  ): void {
    console.info("[LINK_RESOLUTION_OBSERVABILITY_SUMMARY]", {
      LINK_RESOLUTION_TOTAL: counters.LINK_RESOLUTION_TOTAL,
      LINK_RESOLUTION_RESOLVED: counters.LINK_RESOLUTION_RESOLVED,
      LINK_RESOLUTION_UNCHANGED: counters.LINK_RESOLUTION_UNCHANGED,
      LINK_RESOLUTION_AMBIGUOUS: counters.LINK_RESOLUTION_AMBIGUOUS,
      LINK_RESOLUTION_UNRESOLVED: counters.LINK_RESOLUTION_UNRESOLVED,
      LINK_RESOLUTION_FAILURES: counters.LINK_RESOLUTION_FAILURES,
    });
  }

  private trackLinkResolutionObservability(
    diagnostic: LinkResolutionDiagnostic | undefined,
    counters: LinkResolutionObservabilityCounters,
  ): void {
    if (!diagnostic || typeof diagnostic.status !== "string") {
      return;
    }

    counters.LINK_RESOLUTION_TOTAL += 1;
    const status = diagnostic.status;
    if (status === "resolved") {
      counters.LINK_RESOLUTION_RESOLVED += 1;
      return;
    }
    if (status === "unchanged") {
      counters.LINK_RESOLUTION_UNCHANGED += 1;
      return;
    }
    if (status === "ambiguous") {
      counters.LINK_RESOLUTION_AMBIGUOUS += 1;
      counters.LINK_RESOLUTION_FAILURES += 1;
      return;
    }
    if (status === "unresolved") {
      counters.LINK_RESOLUTION_UNRESOLVED += 1;
      counters.LINK_RESOLUTION_FAILURES += 1;
    }
  }

  private resolveLinkResolutionSourceTrace(
    diagnostic: LinkResolutionDiagnostic | undefined,
  ): "explicit" | "resolved" | "fallback" | undefined {
    if (!diagnostic || typeof diagnostic.status !== "string") {
      return undefined;
    }
    const source = typeof diagnostic.source === "string" ? diagnostic.source : undefined;
    if (source === "payload") {
      return "explicit";
    }
    if (source === "active_entities") {
      return "fallback";
    }
    if (source === "draft_context") {
      return "resolved";
    }
    if (diagnostic.status === "resolved") {
      return "resolved";
    }
    return undefined;
  }

  private collectPreExecutionReadDiagnostics(
    toolName: string,
    args: Record<string, unknown>,
    counters: ReadObservabilityCounters,
  ): void {
    if (this.hasInvalidStatusForTool(toolName, args.status)) {
      counters.STATUS_WARNINGS += 1;
    }

    if (toolName === "getEntityGraph" && this.isShallowGraphDepthRequest(args.depth)) {
      counters.GRAPH_WARNINGS += 1;
    }
  }

  private hasInvalidStatusForTool(toolName: string, status: unknown): boolean {
    if (typeof status !== "string" || status.trim().length === 0) {
      return false;
    }

    const normalized = status.trim().toLowerCase();
    const allowedStatusesByTool: Record<string, Set<string>> = {
      listDossiers: new Set(["open", "closed", "active", "archived", "pending"]),
      listTasks: new Set([
        "todo",
        "in_progress",
        "blocked",
        "done",
        "cancelled",
        "open",
        "closed",
        "active",
        "archived",
        "pending",
      ]),
      listSessions: new Set([
        "scheduled",
        "completed",
        "cancelled",
        "rescheduled",
        "no_show",
        "open",
        "closed",
        "active",
        "archived",
        "pending",
      ]),
      listNotifications: new Set([
        "unread",
        "read",
        "archived",
        "pending",
        "open",
        "closed",
        "active",
      ]),
    };

    const allowed = allowedStatusesByTool[toolName];
    if (!allowed) {
      return false;
    }

    return !allowed.has(normalized);
  }

  private isShallowGraphDepthRequest(depth: unknown): boolean {
    return Number(depth ?? 1) <= 1;
  }

  private trackReadToolResult(
    result: ToolExecutionResult,
    counters: ReadObservabilityCounters,
  ): void {
    counters.READ_TOOL_CALL_COUNT += 1;
    const resultCount = this.estimateResultCount(result);
    if (resultCount === 0) {
      counters.READ_EMPTY_RESULTS += 1;
    }
  }

  private estimateResultCount(result: ToolExecutionResult): number {
    if (!result.ok) {
      return 0;
    }

    const data = result.data;
    if (Array.isArray(data)) {
      return data.length;
    }

    if (isRecord(data)) {
      if (typeof data.count === "number" && Number.isFinite(data.count) && data.count >= 0) {
        return Math.floor(data.count);
      }

      const values = Object.values(data);
      const arrayCounts = values
        .filter((value) => Array.isArray(value))
        .map((value) => (value as unknown[]).length);
      if (arrayCounts.length > 0) {
        return arrayCounts.reduce((sum, value) => sum + value, 0);
      }

      const objectValues = values.filter((value) => isRecord(value));
      if (objectValues.length > 0) {
        return objectValues.length;
      }

      return Object.keys(data).length > 0 ? 1 : 0;
    }

    return data === null || data === undefined ? 0 : 1;
  }

  private logNoToolReadWarningIfNeeded(
    userMessage: string,
    toolCallsCount: number,
    counters: ReadObservabilityCounters,
  ): void {
    if (toolCallsCount > 0) {
      return;
    }

    if (!DATABASE_ENTITY_QUERY_PATTERN.test(String(userMessage || ""))) {
      return;
    }

    counters.READ_WARNINGS += 1;
    const normalized = String(userMessage || "").replace(/\s+/g, " ").trim();
    console.warn(
      `[READ_WARNING] No tools were called for a database-related question.\nuser_message: "${normalized}"`,
    );
  }

  private createToolRecord(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    result: ToolExecutionResult,
    metadata?: Record<string, unknown>,
  ): ToolCallRecord {
    return {
      id: this.createId("tool_record"),
      toolName,
      args,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      ok: result.ok,
      errorCode: result.errorCode,
      metadata: metadata ?? result.metadata ?? { turnId: context.turnId },
    };
  }

  private appendTurn(
    session: Session,
    role: "system" | "user" | "assistant" | "tool",
    message: string,
    turnType: TurnType,
    toolCalls?: ToolCallRecord[],
  ): void {
    const createdAt = new Date().toISOString();
    const turnId = this.createId("turn");
    session.turns.push({
      id: turnId,
      role,
      turnType,
      message,
      createdAt,
      toolCalls: toolCalls && toolCalls.length > 0 ? [...toolCalls] : undefined,
    });
    session.history.push({
      turnId,
      role,
      summary: this.truncate(message, 240),
      createdAt,
    });
  }

  private collectAssistantWarnings(text: string, warnings: string[]): void {
    warnings.push(...validateAssistantOutput(text).warnings);
  }

  private collectToolWarnings(result: ToolExecutionResult, warnings: string[]): void {
    warnings.push(...validateToolExecutionResultShape(result).warnings);
  }

  private pushAudit(
    audit: AuditRecord[],
    input: AgentTurnInput,
    eventType: string,
    data: Record<string, unknown>,
  ): void {
    audit.push({
      id: this.createId("audit"),
      sessionId: input.sessionId,
      turnId: input.turnId,
      eventType,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  private buildOutput(
    input: AgentTurnInput,
    session: Session,
    turnType: TurnType,
    responseText: string,
    toolCalls: ToolCallRecord[],
    audit: AuditRecord[],
    metadata: Record<string, unknown>,
    warnings: string[],
  ): AgentTurnOutput {
    const suggestionTelemetry = this.snapshotSuggestionTelemetryState(session);
    return {
      sessionId: session.id,
      turnId: input.turnId,
      turnType,
      responseText,
      pendingAction: session.state.pendingAction,
      toolCalls,
      audit,
      metadata: {
        ...metadata,
        ...(suggestionTelemetry ? { suggestionTelemetry } : {}),
        ...(warnings.length > 0 ? { outputWarnings: [...new Set(warnings)] } : {}),
      },
    };
  }

  private touchSession(session: Session, turnType: TurnType): void {
    if (!this.memory && typeof session.summary === "string") {
      session.summary = generateSummary(session);
    }
    session.state.lastTurnType = turnType;
    session.updatedAt = new Date().toISOString();
  }

  private toLLMToolSchema(tool: {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema ?? { type: "object", properties: {} },
      },
    };
  }

  private listToolsForScope(authScope: string): Array<Record<string, unknown>> {
    return this.registry
      .list()
      .filter((tool) => {
        if (!this.permissionGate.evaluate({ authScope }, tool).allowed) {
          return false;
        }
        if (tool.name === "suggestAction" && !this.isSuggestionFeatureEnabled()) {
          return false;
        }
        return true;
      })
      .map((tool) => this.toLLMToolSchema(tool));
  }

  private resolveAuthScope(input: AgentTurnInput): string {
    const security = isRecord(input.metadata?.security) ? input.metadata.security : undefined;
    if (security && typeof security.authScope === "string") {
      return String(security.authScope).trim() || "unknown";
    }
    return "unknown";
  }

  private normalizeArgs(args: unknown): Record<string, unknown> {
    if (isRecord(args)) {
      return args;
    }
    return {};
  }

  private normalizeMemoryMessages(
    messages: unknown,
    fallbackUserMessage: string,
  ): LLMMessage[] {
    if (!Array.isArray(messages)) {
      return [{ role: "user", content: fallbackUserMessage }];
    }

    const normalized: LLMMessage[] = [];
    for (const row of messages) {
      if (!isRecord(row)) {
        continue;
      }
      const role = this.asLLMRole(row.role);
      if (!role) {
        continue;
      }
      const content = String(row.content || "").trim();
      if (!content) {
        continue;
      }
      normalized.push({ role, content });
    }

    const hasUserTail = normalized.length > 0 && normalized[normalized.length - 1]?.role === "user";
    if (!hasUserTail) {
      normalized.push({ role: "user", content: fallbackUserMessage });
    }
    return normalized;
  }

  private asLLMRole(value: unknown): LLMMessage["role"] | null {
    const normalized = String(value || "").trim().toLowerCase();
    if (
      normalized === "system" ||
      normalized === "user" ||
      normalized === "assistant" ||
      normalized === "tool"
    ) {
      return normalized;
    }
    return null;
  }

  private trackToolEntities(
    session: Session,
    result: ToolExecutionResult,
    toolName: string,
    turnId: string,
  ): void {
    if (!this.memory?.entityTracker?.trackFromToolResult) {
      return;
    }

    try {
      this.memory.entityTracker.trackFromToolResult(session, result, toolName, turnId);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error || "unknown entity tracking error");
      console.warn(`[agent.memory] entity tracking skipped: ${message}`);
    }
  }

  private serializeToolMessage(toolName: string, result: ToolExecutionResult): string {
    return this.safeJsonStringify({ tool: toolName, result });
  }

  private summarizeToolMessageForHistory(toolName: string, serialized: string): string {
    if (serialized.length < 2000) return serialized;

    let parsed: { tool?: string; result?: ToolExecutionResult } | null = null;
    try {
      parsed = JSON.parse(serialized);
    } catch {
      return serialized;
    }
    if (!parsed || !parsed.result || !parsed.result.ok) return serialized;

    const data = parsed.result.data;
    if (!data || typeof data !== "object") return serialized;

    // Entity graph results: keep root, parents, metrics; summarize children
    if (toolName === "getEntityGraph") {
      const graph = data as Record<string, unknown>;
      const summarizedChildren: Record<string, string> = {};
      const children = graph.children;
      if (children && typeof children === "object") {
        for (const [key, items] of Object.entries(children as Record<string, unknown[]>)) {
          if (Array.isArray(items)) {
            const ids = items.slice(0, 5).map((item: unknown) => {
              if (item && typeof item === "object" && "id" in item) return (item as { id: unknown }).id;
              return "?";
            });
            summarizedChildren[key] = `${items.length} items (IDs: ${ids.join(", ")}${items.length > 5 ? "..." : ""})`;
          }
        }
      }
      return this.safeJsonStringify({
        tool: toolName,
        result: {
          ok: true,
          data: {
            root: graph.root,
            parents: graph.parents,
            metrics: graph.metrics,
            meta: graph.meta,
            children_summary: summarizedChildren,
            generatedAt: graph.generatedAt,
          },
          _summarized: true,
        },
      });
    }

    // List tool results: if data contains an array with 10+ items, summarize
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(value) && value.length > 10) {
        const summarizedData = { ...(data as Record<string, unknown>) };
        summarizedData[key] = value.slice(0, 5);
        (summarizedData as Record<string, unknown>)[`${key}_count`] = value.length;
        return this.safeJsonStringify({
          tool: toolName,
          result: {
            ok: true,
            data: summarizedData,
            _summarized: true,
            _note: `Showing 5 of ${value.length} ${key}`,
          },
        });
      }
    }

    return serialized;
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return value.slice(0, maxLength - 3).trimEnd() + "...";
  }

  private createId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private safeJsonStringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify({ error: "Unable to serialize payload" });
    }
  }

  private persistTurnArtifacts(
    input: AgentTurnInput,
    session: Session,
    output: AgentTurnOutput,
    startedAt: string,
    historyStartIndex: number,
  ): void {
    const persistence = this.persistence;

    Promise.resolve()
      .then(async () => {
        const newHistory = session.history.slice(historyStartIndex);

        if (persistence && typeof persistence.saveTurnSnapshot === "function") {
          await persistence.saveTurnSnapshot(
            session.id,
            input.turnId,
            input as unknown as Record<string, unknown>,
            output as unknown as Record<string, unknown>,
            startedAt,
            new Date().toISOString(),
          );
        }

        if (persistence && typeof persistence.appendHistory === "function") {
          for (const entry of newHistory) {
            const toolName = this.inferToolNameForHistory(session, entry.turnId);
            await persistence.appendHistory(session.id, {
              turnId: entry.turnId,
              role: entry.role,
              summary: entry.summary,
              createdAt: entry.createdAt,
            }, toolName);
          }
        }

        if (persistence && typeof persistence.appendAudit === "function") {
          for (const record of output.audit ?? []) {
            await persistence.appendAudit(record);
          }
        }

        await this.runMemoryMaintenance(
          session,
          input.turnId,
          newHistory.map((entry) => entry.turnId),
        );

        if (!persistence) {
          return;
        }

        if (output.pendingAction) {
          await persistence.setPendingAction(session.id, output.pendingAction);
        } else {
          await persistence.clearPendingAction(session.id);
        }

        await persistence.saveSession(session);
      })
      .catch((error) => {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown persistence error");
        console.warn(`[agent.persistence] post-turn persistence failed: ${message}`);
      });
  }

  private async runMemoryMaintenance(
    session: Session,
    turnId: string,
    newTurnIds: string[] = [],
  ): Promise<void> {
    if (!this.memory) {
      return;
    }

    if (this.isSummarizationDisabledBySafeMode()) {
      const operations = this.getOperationsRuntime();
      const shouldLog =
        operations?.debugFlags &&
        typeof operations.debugFlags.shouldLogVerboseTurnTrace === "function" &&
        operations.debugFlags.shouldLogVerboseTurnTrace() === true;
      if (shouldLog) {
        console.info("[agent.operations] summary update skipped by safe mode");
      }
    } else if (this.memory.summarizer?.maybeUpdateSummary) {
      try {
        await this.memory.summarizer.maybeUpdateSummary(session);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown summarizer error");
        console.warn(`[agent.memory] summary update skipped: ${message}`);
      }
    }

    if (this.memory.entityTracker?.pruneUnusedEntities) {
      try {
        this.memory.entityTracker.pruneUnusedEntities(session, turnId);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown entity prune error");
        console.warn(`[agent.memory] entity prune skipped: ${message}`);
      }
    }

    const retrieval = this.memory.retrieval;
    if (!retrieval || retrieval.isEnabled?.() === false) {
      return;
    }
    const operations = this.getOperationsRuntime();
    const retrievalDisabledBySafeMode =
      operations?.safeMode &&
      typeof operations.safeMode.isRetrievalDisabled === "function" &&
      operations.safeMode.isRetrievalDisabled() === true;
    if (retrievalDisabledBySafeMode) {
      return;
    }

    if (typeof retrieval.indexSessionArtifacts === "function") {
      try {
        retrieval.indexSessionArtifacts(session);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown retrieval indexing error");
        console.warn(`[agent.retrieval] session indexing skipped: ${message}`);
      }
    }

    if (typeof retrieval.indexTurnArtifacts === "function") {
      const targets = newTurnIds.length > 0 ? newTurnIds : [turnId];
      for (const targetTurnId of targets) {
        const turn = session.turns.find((row) => row.id === targetTurnId);
        if (!turn) {
          continue;
        }
        try {
          retrieval.indexTurnArtifacts(session, turn);
        } catch (error) {
          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : String(error || "unknown retrieval turn indexing error");
          console.warn(`[agent.retrieval] turn indexing skipped: ${message}`);
        }
      }
    }
  }

  private inferToolNameForHistory(
    session: Session,
    turnId: string,
  ): string | undefined {
    const turn = session.turns.find((row) => row.id === turnId);
    if (!turn || turn.role !== "tool") {
      return undefined;
    }

    if (Array.isArray(turn.toolCalls) && turn.toolCalls.length > 0) {
      const toolName = turn.toolCalls[0]?.toolName;
      if (typeof toolName === "string" && toolName.trim().length > 0) {
        return toolName;
      }
    }

    try {
      const parsed = JSON.parse(turn.message);
      if (isRecord(parsed) && typeof parsed.tool === "string" && parsed.tool.trim().length > 0) {
        return parsed.tool;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private buildToolCallRecoveryInstruction(
    invalidToolCalls: Array<{ name: string; id: string; arguments: Record<string, unknown> }>,
    userMessage: string,
  ): string {
    const invalidNames = invalidToolCalls
      .map((toolCall) => String(toolCall?.name || "").trim())
      .filter((name) => name.length > 0);
    const allowedToolNames = this.registry
      .list()
      .map((tool) => tool.name)
      .slice(0, 60);
    const workloadQuestion =
      /\b(workload|cases|case|matters|dossiers|lawsuits|deadlines|sessions|tasks)\b/i.test(
        userMessage,
      );

    return [
      "TOOL-CALL FORMAT CORRECTION",
      "Your previous tool call(s) used invalid tool names.",
      invalidNames.length > 0 ? `Invalid names: ${invalidNames.join(", ")}` : "Invalid names: unknown",
      "If more data is needed, call only registered tools by exact name.",
      "If no additional data is needed, provide the final assistant answer now.",
      workloadQuestion
        ? "For workload/cases requests, prefer valid READ tools such as listDossiers, listLawsuits, listTasks, listSessions, listMissions, listDocuments, or getEntityGraph."
        : "Prefer direct READ tools with valid arguments when more DB data is needed.",
      `Registered tools: ${allowedToolNames.join(", ")}`,
    ].join("\n");
  }

  private buildUserFacingOnlyRecoveryInstruction(userMessage: string): string {
    return [
      "USER-FACING RESPONSE ONLY",
      "Do not output chain-of-thought, analysis labels, role tags, tool wrappers, or internal traces.",
      "Never output prefixes like analysis, assistantcommentary, assistantfinal, or to=functions.*",
      "Provide only the final assistant response in plain natural language for the user.",
      `Original user request: ${userMessage}`,
    ].join("\n");
  }

  private buildDraftContextRecoveryInstruction(userMessage: string): string {
    return [
      "DRAFT CONTEXT REQUIRED",
      "A generateDraft call was denied because READ grounding is missing.",
      "Before calling generateDraft, gather factual context using READ tools.",
      "If the user reference is ambiguous (for example only a first name), resolve with listClients/listDossiers and ask clarification if multiple matches exist.",
      "If no case context is available yet, ask one concise clarification question in user-facing language.",
      "Do not output internal analysis labels or role tags.",
      `Original user request: ${userMessage}`,
    ].join("\n");
  }

  private buildDraftAmbiguityRecoveryInstruction(
    userMessage: string,
    disambiguationPrompt: string,
  ): string {
    return [
      "DRAFT AMBIGUITY RESOLUTION REQUIRED",
      "Multiple entities match the user's reference. Do not draft yet.",
      "Do not call generateDraft until the user explicitly resolves the target context.",
      "Ask a concise clarification question and present candidate options.",
      "Do not output internal analysis labels or role tags.",
      disambiguationPrompt,
      `Original user request: ${userMessage}`,
    ].join("\n");
  }

  private buildFinalizationRecoveryInstruction(userMessage: string): string {
    return [
      "FINAL RESPONSE REQUIRED",
      "You have already retrieved data using tools.",
      "Do not call additional tools unless strictly necessary.",
      "Now provide a complete user-facing answer based on the retrieved tool results in context.",
      "Do not output raw JSON or tool payload wrappers.",
      `Original user request: ${userMessage}`,
    ].join("\n");
  }

  private shouldRejectMalformedCandidateText(params: {
    candidateText: string;
    userMessage: string;
    invalidToolCalls: Array<{ name: string; id: string; arguments: Record<string, unknown> }>;
    toolCallsSoFar: number;
  }): boolean {
    const candidate = params.candidateText.trim();
    if (!candidate) {
      return true;
    }

    if (this.isLikelyPlaceholderCompletion(candidate)) {
      return true;
    }
    if (this.isInternalMetaLeakCandidate(candidate)) {
      return true;
    }

    const hasInvalidToolCalls = Array.isArray(params.invalidToolCalls) && params.invalidToolCalls.length > 0;
    if (!hasInvalidToolCalls) {
      return false;
    }

    const isDbQuery = DATABASE_ENTITY_QUERY_PATTERN.test(params.userMessage);
    if (!isDbQuery) {
      return false;
    }

    // Require stronger final text when malformed tool calls occurred on DB-driven turns.
    if (params.toolCallsSoFar <= 1 && candidate.length < 140) {
      return true;
    }

    return false;
  }

  private isLikelyPlaceholderCompletion(text: string): boolean {
    const normalized = text.trim().toLowerCase();
    return (
      normalized === "i completed your request." ||
      normalized === "i completed your request" ||
      normalized === "done." ||
      normalized === "done" ||
      normalized.includes("malformed tool-call output")
    );
  }

  private isInternalMetaLeakCandidate(text: string): boolean {
    const normalized = String(text || "").trim().toLowerCase();
    if (!normalized) {
      return false;
    }
    const prefixedMetaLeak =
      normalized.startsWith("analysis") ||
      normalized.startsWith("assistantcommentary") ||
      normalized.startsWith("assistantfinal");
    const hasMetaMarkers =
      /\bassistantcommentary\b/i.test(normalized) ||
      /\bassistantfinal\b/i.test(normalized) ||
      /\bto=functions\./i.test(normalized) ||
      /\bassistant(?:commentary|final)\s+to=/i.test(normalized);
    return prefixedMetaLeak || hasMetaMarkers;
  }

  private isClarificationRequestText(text: string): boolean {
    const raw = String(text || "").trim();
    if (!raw) {
      return false;
    }
    const compact = this.normalizeIntentText(raw);

    const englishClarificationSignals = [
      "could you let me know",
      "i need more information",
      "i'll need",
      "please provide",
      "what kind of",
      "what type of",
      "once i have",
      "to proceed, i need",
      "i still need",
    ];
    const frenchClarificationSignals = [
      "pourriez-vous",
      "pouvez-vous",
      "merci de preciser",
      "precisez",
      "quel type de document",
      "quelles informations",
      "j'ai besoin de",
      "pour rediger",
      "pour preparer le brouillon",
    ];
    const arabicClarificationSignals = [
      "يرجى",
      "من فضلك",
      "هل يمكنك",
      "ما نوع",
      "ما الغرض",
      "ما الهدف",
      "أحتاج",
      "احتاج",
      "لصياغة",
      "لإعداد",
      "لاعداد",
      "المسودة",
    ];

    const hasSignal =
      englishClarificationSignals.some((signal) => compact.includes(signal)) ||
      frenchClarificationSignals.some((signal) => compact.includes(signal)) ||
      arabicClarificationSignals.some((signal) => compact.includes(signal)) ||
      /\b(could|can)\s+you\s+(let\s+me\s+know|clarify|specify)\b/i.test(compact) ||
      /\bwhat\s+(kind|type)\s+of\b/i.test(compact) ||
      /\b(pourriez|pouvez)\s*-\s*vous\b/i.test(compact) ||
      /\bquel\s+type\s+de\s+document\b/i.test(compact) ||
      /(ما\s+نوع|هل\s+يمكنك|يرجى)/i.test(compact);
    if (!hasSignal) {
      return false;
    }

    const hasQuestion = /[?؟]/.test(raw);
    const numberedPrompt = /\b1\.\s+\*\*/.test(compact) || /\b1\.\s+/.test(compact);
    const bulletPrompt = /\n\s*[-*]\s+/.test(raw);
    if (hasQuestion || numberedPrompt || bulletPrompt) {
      return true;
    }

    return (
      compact.includes("could you") ||
      compact.includes("can you") ||
      compact.includes("pourriez-vous") ||
      compact.includes("pouvez-vous") ||
      compact.includes("what type of") ||
      compact.includes("quel type de document") ||
      compact.includes("هل يمكنك") ||
      compact.includes("ما نوع")
    );
  }

  private isPostDraftClarificationCandidate(text: string): boolean {
    if (this.isClarificationRequestText(text)) {
      return true;
    }
    const compact = this.normalizeIntentText(String(text || ""));
    if (!compact) {
      return false;
    }
    const followUpSignals = [
      "once you confirm",
      "confirm the exact",
      "case reference",
      "dossier reference",
      "dossier/case reference",
      "allow me to fetch",
      "before i finalize",
      "before i can finalize",
      "which dossier",
      "which lawsuit",
      "please confirm the case",
      "to make sure this is tied to",
    ];
    return followUpSignals.some((signal) => compact.includes(signal));
  }

  private normalizeIntentText(value: string): string {
    return String(value || "")
      .replace(/\u2019/g, "'")
      .replace(/[\u2010-\u2015\u2212]/g, "-")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  private coerceDraftDetailsClarification(
    userMessage: string,
    candidateText: string,
  ): string {
    const cleaned = String(candidateText || "").trim();
    if (this.isClarificationRequestText(cleaned) && cleaned.length > 0) {
      return cleaned;
    }
    const language = this.detectLanguageHint(`${userMessage}\n${cleaned}`) || "en";
    if (language === "fr") {
      return "Pour préparer le brouillon, précisez le type de document, l'objectif principal, le ton souhaité et les faits clés (dates/références) à inclure.";
    }
    if (language === "ar") {
      return "لتحضير المسودة، يرجى تحديد نوع المستند، الهدف الأساسي، النبرة المطلوبة، والوقائع الأساسية (التواريخ/المراجع) التي تريد تضمينها.";
    }
    return "To prepare the draft, please specify the document type, main purpose, preferred tone, and key facts to include (dates/references).";
  }

  private coerceDraftReadyAcknowledgement(
    userMessage: string,
    candidateText: string,
  ): string {
    const cleaned = String(candidateText || "").trim();
    if (!cleaned) {
      return "I've prepared the draft. Review it below and tell me what to adjust.";
    }
    const language = this.detectLanguageHint(`${userMessage}\n${cleaned}`) || "en";
    if (language === "fr") {
      return "Le brouillon est prêt. Consultez-le ci-dessous et dites-moi ce que vous souhaitez ajuster.";
    }
    if (language === "ar") {
      return "تم إعداد المسودة. راجعها بالأسفل وأخبرني بالتعديلات التي تريدها.";
    }
    return "I've prepared the draft. Review it below and tell me what to adjust.";
  }

  private isGenericDraftPrompt(message: string): boolean {
    const normalized = String(message || "").trim().toLowerCase();
    if (!normalized || !this.isDraftingIntent(message)) {
      return false;
    }

    const genericMarkers = [
      "draft something",
      "write something",
      "compose something",
      "prepare something",
      "something for",
      "anything for",
      "quelque chose",
      "شيء",
      "شيئا",
      "حاجة",
    ];
    const hasGenericMarker = genericMarkers.some((marker) => normalized.includes(marker));
    if (!hasGenericMarker) {
      return false;
    }

    const explicitTypeHints = [
      "letter",
      "email",
      "notice",
      "memo",
      "contract",
      "petition",
      "request",
      "report",
      "brief",
      "summary",
      "رسالة",
      "طلب",
      "lettre",
      "courriel",
      "contrat",
    ];
    const hasTypeHint = explicitTypeHints.some((hint) => normalized.includes(hint));
    return !hasTypeHint;
  }

  private extractUserFacingTextFromMetaLeak(text: string): string | null {
    const value = String(text || "").trim();
    if (!value) {
      return null;
    }

    const finalMatch = /assistantfinal([\s\S]*)$/i.exec(value);
    if (finalMatch) {
      const cleaned = String(finalMatch[1] || "").trim();
      return cleaned.length > 0 ? cleaned : null;
    }

    const commentaryMatch = /assistantcommentary([\s\S]*)$/i.exec(value);
    if (commentaryMatch) {
      const cleaned = String(commentaryMatch[1] || "").trim();
      return cleaned.length > 0 ? cleaned : null;
    }

    return null;
  }

  private extractClarificationMessageFromDraftArgs(args: Record<string, unknown>): string | null {
    const sections = this.normalizeDraftSections(args.sections, String(args.content || ""));
    const text = this.renderDraftContentFromSections(sections).trim();
    if (!text) {
      return null;
    }
    if (!this.isClarificationRequestText(text)) {
      return null;
    }
    return this.truncate(text, 2000);
  }

  private draftAppearsCaseSpecific(args: Record<string, unknown>): boolean {
    const sections = this.normalizeDraftSections(args.sections, String(args.content || ""));
    const content = this.renderDraftContentFromSections(sections).toLowerCase();
    if (!content) {
      return false;
    }
    const financialSignals = [
      "invoice",
      "invoices",
      "payment",
      "unpaid",
      "overdue",
      "amount due",
      "facture",
      "factures",
      "paiement",
      "impaye",
      "impayé",
      "فاتورة",
      "فواتير",
      "دفعة",
      "مدفوع",
    ];
    const explicitCaseBindingSignals = [
      "dossier",
      "lawsuit",
      "court",
      "tribunal",
      "case number",
      "session number",
      "hearing date",
      "affaire",
      "قضية",
      "محكمة",
      "جلسة",
      "ملف",
    ];
    const financialDensity = financialSignals.filter((signal) => content.includes(signal)).length;
    const hasExplicitCaseBinding = explicitCaseBindingSignals.some((signal) => content.includes(signal));
    if (financialDensity >= 2 && !hasExplicitCaseBinding) {
      return false;
    }
    const caseSignals = [
      "case progress",
      "hearing",
      "court",
      "filing",
      "dossier",
      "lawsuit",
      "tribunal",
      "audience",
      "جلسة",
      "محكمة",
      "قضية",
      "ملف",
    ];
    return caseSignals.some((signal) => content.includes(signal));
  }

  private hasCaseGroundingReadTool(readToolNames: string[]): boolean {
    const names = new Set((readToolNames || []).map((name) => String(name || "").trim()));
    const caseGroundingTools = [
      "listDossiers",
      "getDossier",
      "listLawsuits",
      "getLawsuit",
      "listSessions",
      "listFinancialEntries",
      "getFinancialEntry",
      "getEntityGraph",
      "getTimeline",
    ];
    return caseGroundingTools.some((tool) => names.has(tool));
  }

  private hasCaseGroundingFromDraftArtifact(artifact: DraftArtifact | null): boolean {
    if (!artifact) {
      return false;
    }
    const linkedEntityType = String(artifact.linkedEntityType || "").trim().toLowerCase();
    const hasLinkedEntityId =
      typeof artifact.linkedEntityId === "number" && Number.isFinite(artifact.linkedEntityId);
    if (!hasLinkedEntityId) {
      return false;
    }
    return linkedEntityType === "dossier" || linkedEntityType === "lawsuit" || linkedEntityType === "session";
  }

  private isAggregateDraftIntent(userMessage: string, args: Record<string, unknown>): boolean {
    const signal = `${String(userMessage || "")}\n${String(args.title || "")}\n${String(args.content || "")}`.toLowerCase();
    return (
      /\b(all|every|latest|recent|multiple|several|many)\b/.test(signal) ||
      /\b(unpaid|overdue)\b/.test(signal) ||
      /\b(all invoices?|latest invoices?)\b/.test(signal) ||
      /\b(tous|toutes|tout)\b/.test(signal) ||
      /(جميع|كل)/.test(signal)
    );
  }

  private detectDraftEntityAmbiguity(params: {
    userMessage: string;
    args: Record<string, unknown>;
    candidates: Array<{
      entityType: string;
      entityId: string | number;
      label: string;
      subtitle?: string | null;
      metadata?: Record<string, unknown>;
      scope?: Record<string, unknown>;
    }>;
    aggregateIntent: boolean;
  }): {
    required: boolean;
    reason: string;
    selectionMode: "single" | "multi";
    candidates: Array<{
      entityType: string;
      entityId: string | number;
      label: string;
      subtitle?: string | null;
      metadata?: Record<string, unknown>;
      scope?: Record<string, unknown>;
    }>;
  } {
    const normalizedCandidates = (params.candidates || [])
      .filter((row) => row && row.entityType && row.entityId != null && row.label);
    if (!this.isDraftingIntent(params.userMessage) || normalizedCandidates.length < 2) {
      return {
        required: false,
        reason: "not_ambiguous_or_insufficient_candidates",
        selectionMode: params.aggregateIntent ? "multi" : "single",
        candidates: [],
      };
    }

    const ambiguity = detectGenericAmbiguity({
      input: {
        message: params.userMessage,
      },
      activeEntities: normalizedCandidates.map((candidate) => ({
        type: candidate.entityType,
        id: candidate.entityId,
        label: candidate.label,
        sourceTool: String(candidate.metadata?.source || ""),
      })),
    });
    const ambiguityCandidates = Array.isArray(ambiguity?.candidates) ? ambiguity.candidates : [];
    if (ambiguity?.ambiguous !== true || ambiguityCandidates.length < 2) {
      return {
        required: false,
        reason: String(ambiguity?.reason || "no_high_confidence_ambiguity"),
        selectionMode: params.aggregateIntent ? "multi" : "single",
        candidates: [],
      };
    }

    const byType = new Map<string, Array<(typeof normalizedCandidates)[number]>>();
    for (const candidate of normalizedCandidates) {
      const list = byType.get(candidate.entityType) || [];
      list.push(candidate);
      byType.set(candidate.entityType, list);
    }
    let dominantType = "";
    let dominantCandidates: Array<(typeof normalizedCandidates)[number]> = [];
    for (const [entityType, list] of byType.entries()) {
      if (list.length > dominantCandidates.length) {
        dominantType = entityType;
        dominantCandidates = list;
      }
    }
    const promptCandidates = (dominantCandidates.length > 1 ? dominantCandidates : normalizedCandidates).slice(0, 5);
    const shouldRequire = !params.aggregateIntent;
    return {
      required: shouldRequire,
      reason: shouldRequire
        ? `multiple_${dominantType || "entity"}_candidates_requires_selection`
        : "aggregate_request_allows_multi_selection",
      selectionMode: params.aggregateIntent ? "multi" : "single",
      candidates: promptCandidates,
    };
  }

  private buildDraftEntityDisambiguationMessage(
    candidates: Array<{
      entityType: string;
      entityId: string | number;
      label: string;
      subtitle?: string | null;
      metadata?: Record<string, unknown>;
      scope?: Record<string, unknown>;
    }>,
    selectionMode: "single" | "multi",
  ): string {
    const lines = candidates.slice(0, 5).map((candidate, index) => {
      const subtitle = String(candidate.subtitle || "").trim();
      const details = subtitle ? ` - ${subtitle}` : "";
      return `${index + 1}. ${candidate.label}${details}`;
    });
    const modeHint =
      selectionMode === "multi"
        ? "You can choose one, multiple, all, or none of these options."
        : "Reply with the number or full name/reference of the intended option.";
    return [
      "I found multiple matching records for this draft context. Which target should I use?",
      ...lines,
      modeHint,
    ].join("\n");
  }

  private extractCaseDisambiguationCandidates(messages: LLMMessage[]): Array<{
    entityType: string;
    entityId: string | number;
    label: string;
    subtitle?: string | null;
    metadata?: Record<string, unknown>;
    scope?: Record<string, unknown>;
  }> {
    const all = this.extractLatestListCandidates(messages);
    const caseTypes = new Set(["dossier", "lawsuit", "session"]);
    const deduped = new Map<string, (typeof all)[number]>();
    for (const candidate of all) {
      if (!caseTypes.has(candidate.entityType)) {
        continue;
      }
      const key = `${candidate.entityType}:${String(candidate.entityId)}`;
      if (!deduped.has(key)) {
        deduped.set(key, candidate);
      }
    }
    return Array.from(deduped.values()).slice(0, 5);
  }

  private extractLatestListCandidates(messages: LLMMessage[]): Array<{
    entityType: string;
    entityId: string | number;
    label: string;
    subtitle?: string | null;
    metadata?: Record<string, unknown>;
    scope?: Record<string, unknown>;
  }> {
    const toolConfig: Record<
      string,
      { entityType: string; dataKey: string; labelKeys: string[]; subtitleKeys?: string[] }
    > = {
      listClients: { entityType: "client", dataKey: "clients", labelKeys: ["name", "label", "title"] },
      listDossiers: { entityType: "dossier", dataKey: "dossiers", labelKeys: ["reference", "title", "label"] },
      listLawsuits: { entityType: "lawsuit", dataKey: "lawsuits", labelKeys: ["reference", "title", "label"] },
      listSessions: { entityType: "session", dataKey: "sessions", labelKeys: ["title", "type", "label"] },
      listTasks: { entityType: "task", dataKey: "tasks", labelKeys: ["title", "label"] },
      listMissions: { entityType: "mission", dataKey: "missions", labelKeys: ["reference", "title", "label"] },
      listPersonalTasks: { entityType: "personal_task", dataKey: "personalTasks", labelKeys: ["title", "label"] },
      listFinancialEntries: {
        entityType: "financial_entry",
        dataKey: "financialEntries",
        labelKeys: ["reference", "title", "description", "label"],
      },
      listDocuments: { entityType: "document", dataKey: "documents", labelKeys: ["title", "original_filename", "label"] },
      listNotifications: { entityType: "notification", dataKey: "notifications", labelKeys: ["title", "subject", "label"] },
      listOfficers: { entityType: "officer", dataKey: "officers", labelKeys: ["name", "agency_name", "label"] },
    };
    const seenTools = new Set<string>();
    const candidates: Array<{
      entityType: string;
      entityId: string | number;
      label: string;
      subtitle?: string | null;
      metadata?: Record<string, unknown>;
      scope?: Record<string, unknown>;
    }> = [];
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role !== "tool") {
        continue;
      }
      const toolName = String(message.name || "").trim();
      const config = toolConfig[toolName];
      if (!config || seenTools.has(toolName)) {
        continue;
      }
      seenTools.add(toolName);
      const parsed = this.parseToolMessageContent(message.content);
      const result = isRecord(parsed?.result) ? parsed.result : null;
      if (!result || result.ok !== true) {
        continue;
      }
      const data = isRecord(result.data) ? result.data : null;
      if (!data) {
        continue;
      }
      const rows = Array.isArray(data[config.dataKey]) ? (data[config.dataKey] as unknown[]) : [];
      for (const row of rows) {
        if (!isRecord(row)) {
          continue;
        }
        const entityId = this.extractEntityIdFromRecord(row, config.entityType);
        if (entityId == null) {
          continue;
        }
        const label = this.pickLabelFromRecord(row, config.labelKeys) || `${config.entityType} ${String(entityId)}`;
        const subtitle = this.pickLabelFromRecord(row, ["reference", "case_number", "email", "due_date"]);
        const scope: Record<string, unknown> = {};
        const numericId = Number(entityId);
        if (Number.isFinite(numericId) && numericId > 0) {
          if (config.entityType === "client") scope.clientId = numericId;
          if (config.entityType === "dossier") scope.dossierId = numericId;
          if (config.entityType === "lawsuit") scope.lawsuitId = numericId;
          if (config.entityType === "session") scope.sessionId = numericId;
          if (config.entityType === "task") scope.taskId = numericId;
          if (config.entityType === "mission") scope.missionId = numericId;
          if (config.entityType === "personal_task") scope.personalTaskId = numericId;
          if (config.entityType === "financial_entry") scope.financialEntryId = numericId;
        }
        if (row.client_id != null || row.clientId != null) {
          const clientId = Number(row.client_id ?? row.clientId);
          if (Number.isFinite(clientId) && clientId > 0) {
            scope.clientId = clientId;
          }
        }
        candidates.push({
          entityType: config.entityType,
          entityId,
          label,
          subtitle: subtitle || null,
          metadata: {
            source: toolName,
            ...(row.status ? { status: String(row.status) } : {}),
            ...(row.reference ? { reference: String(row.reference) } : {}),
          },
          scope,
        });
      }
    }
    return candidates;
  }

  private extractEntityIdFromRecord(
    row: Record<string, unknown>,
    entityType: string,
  ): string | number | null {
    const candidateKeys = [
      "id",
      `${entityType}_id`,
      "client_id",
      "dossier_id",
      "lawsuit_id",
      "session_id",
      "task_id",
      "mission_id",
      "personal_task_id",
      "financial_entry_id",
      "document_id",
      "notification_id",
      "officer_id",
    ];
    for (const key of candidateKeys) {
      const value = row[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string" && value.trim().length > 0) {
        const numeric = Number(value);
        if (Number.isFinite(numeric) && numeric > 0) {
          return numeric;
        }
        return value.trim();
      }
    }
    return null;
  }

  private pickLabelFromRecord(row: Record<string, unknown>, keys: string[]): string {
    for (const key of keys) {
      const value = row[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return "";
  }

  private async runAdaptiveDraftReadProbes(params: {
    userMessage: string;
    args: Record<string, unknown>;
    context: ToolCallProcessingContext;
    executionContext: ToolExecutionContext;
    stage: string;
    currentTurnReadTools: string[];
  }): Promise<{ executedTools: string[] }> {
    const plan = this.buildAdaptiveDraftProbePlan(params.userMessage, params.args, params.currentTurnReadTools);
    const executedTools: string[] = [];
    for (const step of plan.slice(0, 2)) {
      const tool = this.registry.get(step.toolName);
      if (!tool || tool.category !== ToolCategory.READ) {
        continue;
      }
      const result = await this.executor.execute(tool, params.executionContext, step.args);
      this.collectToolWarnings(result, params.context.warnings);
      this.trackReadToolResult(result, params.context.readCounters);
      if (result.ok) {
        this.trackToolEntities(params.context.session, result, step.toolName, params.context.input.turnId);
      }
      const callId = this.createId("autoprobe");
      const record = this.createToolRecord(step.toolName, step.args, params.executionContext, result, {
        autoprobe: true,
        stage: params.stage,
      });
      record.id = callId;
      params.context.toolCalls.push(record);
      params.context.messages.push({
        role: "tool",
        name: step.toolName,
        toolCallId: callId,
        content: this.serializeToolMessage(step.toolName, result),
      });
      this.pushAudit(params.context.audit, params.context.input, "draft_autoprobe_tool_call", {
        toolName: step.toolName,
        stage: params.stage,
        ok: result.ok,
        errorCode: result.errorCode,
      });
      executedTools.push(step.toolName);
    }
    return { executedTools };
  }

  private buildAdaptiveDraftProbePlan(
    userMessage: string,
    args: Record<string, unknown>,
    currentTurnReadTools: string[],
  ): Array<{ toolName: string; args: Record<string, unknown> }> {
    const normalized = String(userMessage || "").toLowerCase();
    const linkedEntityType = String(args.linkedEntityType || "").trim().toLowerCase();
    const linkedEntityId =
      typeof args.linkedEntityId === "number"
        ? args.linkedEntityId
        : Number.isFinite(Number(args.linkedEntityId))
          ? Number(args.linkedEntityId)
          : null;
    const dossierId = linkedEntityType === "dossier" && linkedEntityId ? linkedEntityId : null;
    const lawsuitId = linkedEntityType === "lawsuit" && linkedEntityId ? linkedEntityId : null;
    const clientId = linkedEntityType === "client" && linkedEntityId ? linkedEntityId : null;
    const plan: Array<{ toolName: string; args: Record<string, unknown> }> = [];
    const add = (toolName: string, toolArgs: Record<string, unknown>) => {
      if ((currentTurnReadTools || []).includes(toolName)) {
        return;
      }
      if (plan.some((step) => step.toolName === toolName)) {
        return;
      }
      plan.push({ toolName, args: toolArgs });
    };
    const financialIntent =
      /\b(invoice|invoices|payment|payments|unpaid|overdue|billing|facture|paiement)\b/.test(normalized) ||
      /(فاتورة|فواتير|دفع|مدفوع)/.test(normalized);
    const dossierIntent = /\b(dossier|file|matter|case)\b/.test(normalized) || /(ملف|قضية)/.test(normalized);
    const lawsuitIntent = /\b(lawsuit|court|hearing|session|tribunal|audience)\b/.test(normalized) || /(محكمة|جلسة)/.test(normalized);
    const taskIntent = /\b(task|tasks|deadline|todo)\b/.test(normalized) || /(مهمة|مهام)/.test(normalized);
    const missionIntent = /\b(mission|bailiff|officer|huissier)\b/.test(normalized) || /(مأمورية|عون)/.test(normalized);
    const documentIntent = /\b(document|documents|attachment|attachments)\b/.test(normalized) || /(وثيقة|مرفق)/.test(normalized);
    const clientIntent = /\b(client|person|customer)\b/.test(normalized) || /(عميل)/.test(normalized);

    if (financialIntent) {
      add("listFinancialEntries", {
        direction: "receivable",
        paymentStatus: "unpaid",
        ...(clientId ? { clientId } : {}),
        ...(dossierId ? { dossierId } : {}),
        ...(lawsuitId ? { lawsuitId } : {}),
        limit: 10,
      });
    }
    if (dossierIntent || lawsuitIntent) {
      add("listDossiers", {
        ...(clientId ? { clientId } : {}),
        limit: 10,
      });
      add("listLawsuits", {
        ...(dossierId ? { dossierId } : {}),
        limit: 10,
      });
      add("listSessions", {
        ...(lawsuitId ? { lawsuitId } : {}),
        ...(dossierId ? { dossierId } : {}),
        limit: 10,
      });
    }
    if (taskIntent) {
      add("listTasks", {
        ...(dossierId ? { dossierId } : {}),
        ...(lawsuitId ? { lawsuitId } : {}),
        limit: 10,
      });
      add("listPersonalTasks", { limit: 10 });
    }
    if (missionIntent) {
      add("listMissions", {
        ...(dossierId ? { dossierId } : {}),
        ...(lawsuitId ? { lawsuitId } : {}),
        limit: 10,
      });
      add("listOfficers", { limit: 10 });
    }
    if (documentIntent) {
      add("listDocuments", {
        ...(clientId ? { clientId } : {}),
        ...(dossierId ? { dossierId } : {}),
        ...(lawsuitId ? { lawsuitId } : {}),
        limit: 10,
      });
    }
    if (clientIntent && !clientId) {
      add("listClients", {
        query: this.extractEntityQueryFromMessage(userMessage),
        limit: 5,
      });
    }
    if (plan.length === 0) {
      add("listDossiers", {
        ...(clientId ? { clientId } : {}),
        limit: 10,
      });
      add("listLawsuits", {
        ...(dossierId ? { dossierId } : {}),
        limit: 10,
      });
    }
    return plan.slice(0, 2);
  }

  private extractEntityQueryFromMessage(userMessage: string): string | null {
    const raw = String(userMessage || "").trim().replace(/\s+/g, " ");
    if (!raw) {
      return null;
    }
    const m = raw.match(/\bfor\s+([A-Za-z\u00C0-\u024F\u0600-\u06FF'\- ]{2,80})/i);
    if (m && m[1]) {
      return m[1].trim();
    }
    const firstWords = raw.split(" ").slice(0, 5).join(" ").trim();
    return firstWords || null;
  }

  private detectDraftClientAmbiguity(params: {
    userMessage: string;
    args: Record<string, unknown>;
    messages: LLMMessage[];
  }): { required: boolean; candidates: Array<{ id?: number; name: string; email?: string }> } | null {
    if (!this.isDraftingIntent(params.userMessage)) {
      return null;
    }

    const mentionsClient = this.isClientMentionedInDraftRequest(
      params.userMessage,
      params.args,
    );
    if (!mentionsClient) {
      return null;
    }

    const snapshot = this.extractLatestListClientsSnapshot(params.messages);
    if (!snapshot || snapshot.count <= 1 || snapshot.candidates.length <= 1) {
      return null;
    }

    const userExplicitSelection = this.hasExplicitClientSelectionInMessage(
      params.userMessage,
      snapshot.candidates,
    );
    if (userExplicitSelection) {
      return null;
    }

    return {
      required: true,
      candidates: snapshot.candidates.slice(0, 5),
    };
  }

  private extractLatestListClientsSnapshot(messages: LLMMessage[]): {
    count: number;
    candidates: Array<{ id?: number; name: string; email?: string }>;
  } | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role !== "tool" || String(message.name || "").trim() !== "listClients") {
        continue;
      }

      const parsed = this.parseToolMessageContent(message.content);
      const result = isRecord(parsed?.result) ? parsed.result : null;
      if (!result || result.ok !== true) {
        continue;
      }

      const data = isRecord(result.data) ? result.data : null;
      if (!data) {
        continue;
      }

      const clientsRaw = Array.isArray(data.clients) ? data.clients : [];
      const candidates = clientsRaw
        .map((row) => this.toClientCandidate(row))
        .filter((row): row is { id?: number; name: string; email?: string } => Boolean(row));
      const count =
        typeof data.count === "number" && Number.isFinite(data.count)
          ? Math.max(0, Math.floor(data.count))
          : candidates.length;

      return { count, candidates };
    }
    return null;
  }

  private parseToolMessageContent(content: string): Record<string, unknown> | null {
    const raw = String(content || "").trim();
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  private toClientCandidate(value: unknown): { id?: number; name: string; email?: string } | null {
    if (!isRecord(value)) {
      return null;
    }
    const name = String(value.name || "").trim();
    if (!name) {
      return null;
    }
    const id =
      typeof value.id === "number"
        ? value.id
        : Number.isFinite(Number(value.id))
          ? Number(value.id)
          : undefined;
    const email = String(value.email || "").trim() || undefined;
    return { id, name, email };
  }

  private hasExplicitClientSelectionInMessage(
    userMessage: string,
    candidates: Array<{ id?: number; name: string; email?: string }>,
  ): boolean {
    const normalizedMessage = this.normalizeForComparison(userMessage);
    if (!normalizedMessage) {
      return false;
    }

    let matches = 0;
    for (const candidate of candidates) {
      const normalizedName = this.normalizeForComparison(candidate.name);
      if (!normalizedName || normalizedName.split(" ").length < 2) {
        continue;
      }
      if (normalizedMessage.includes(normalizedName)) {
        matches += 1;
      }
      if (matches > 1) {
        return false;
      }
    }
    return matches === 1;
  }

  private normalizeForComparison(value: string): string {
    return String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u00C0-\u024F\u0600-\u06FF\s]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  private buildDraftClientDisambiguationMessage(
    candidates: Array<{ id?: number; name: string; email?: string }>,
  ): string {
    const lines = candidates.slice(0, 5).map((candidate, index) => {
      const emailPart = candidate.email ? ` - ${candidate.email}` : "";
      return `${index + 1}. ${candidate.name}${emailPart}`;
    });
    return [
      "I found multiple matching clients. Which one should I draft for?",
      ...lines,
      "Reply with the number or full client name, then I will generate the draft.",
    ].join("\n");
  }

  private isClientMentionedInDraftRequest(
    userMessage: string,
    args: Record<string, unknown>,
  ): boolean {
    const linkedEntityType = String(args.linkedEntityType || "").trim().toLowerCase();
    return (
      linkedEntityType === "client" ||
      /\b(for|to)\s+[a-z\u00C0-\u024F][a-z\u00C0-\u024F'\-]{1,}\b/i.test(
        String(userMessage || ""),
      )
    );
  }

  private explainDraftAmbiguityDecision(params: {
    userMessage: string;
    args: Record<string, unknown>;
    latestClientSnapshot: { count: number; candidates: Array<{ id?: number; name: string; email?: string }> } | null;
    explicitClientSelectionInMessage: boolean;
  }): string {
    if (!this.isDraftingIntent(params.userMessage)) {
      return "not_drafting_intent";
    }
    if (!this.isClientMentionedInDraftRequest(params.userMessage, params.args)) {
      return "no_client_reference_detected";
    }
    if (!params.latestClientSnapshot) {
      return "no_listClients_result_in_context";
    }
    if (params.latestClientSnapshot.count <= 1 || params.latestClientSnapshot.candidates.length <= 1) {
      return "single_or_no_client_match";
    }
    if (params.explicitClientSelectionInMessage) {
      return "explicit_client_selection_present";
    }
    return "multiple_client_candidates_requires_selection";
  }

  private extractLatestListDossiersSnapshot(messages: LLMMessage[]): {
    count: number;
    dossiers: Array<{ id?: number; reference?: string; title?: string }>;
  } | null {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      if (message.role !== "tool" || String(message.name || "").trim() !== "listDossiers") {
        continue;
      }

      const parsed = this.parseToolMessageContent(message.content);
      const result = isRecord(parsed?.result) ? parsed.result : null;
      if (!result || result.ok !== true) {
        continue;
      }

      const data = isRecord(result.data) ? result.data : null;
      if (!data) {
        continue;
      }

      const dossiersRaw = Array.isArray(data.dossiers) ? data.dossiers : [];
      const dossiers = dossiersRaw
        .map((row) => this.toDossierCandidate(row))
        .filter((row): row is { id?: number; reference?: string; title?: string } => Boolean(row));
      const count =
        typeof data.count === "number" && Number.isFinite(data.count)
          ? Math.max(0, Math.floor(data.count))
          : dossiers.length;

      return { count, dossiers };
    }
    return null;
  }

  private toDossierCandidate(value: unknown): { id?: number; reference?: string; title?: string } | null {
    if (!isRecord(value)) {
      return null;
    }
    const id =
      typeof value.id === "number"
        ? value.id
        : Number.isFinite(Number(value.id))
          ? Number(value.id)
          : undefined;
    const reference = String(value.reference || "").trim() || undefined;
    const title = String(value.title || "").trim() || undefined;
    if (id == null && !reference && !title) {
      return null;
    }
    return { id, reference, title };
  }

  private listReadToolNamesInCurrentTurn(toolCalls: ToolCallRecord[]): string[] {
    return (toolCalls || [])
      .filter((call) => Boolean(call?.ok))
      .map((call) => String(call?.toolName || "").trim())
      .filter((name) => {
        if (!name) {
          return false;
        }
        const toolDef = this.registry.get(name);
        return toolDef?.category === ToolCategory.READ;
      });
  }

  private analyzeEntityCoverageForWorkloadQuery(
    authScope: string,
    userMessage: string,
    toolCalls: ToolCallRecord[],
  ): {
    hasGap: boolean;
    expectedTools: string[];
    executedTools: string[];
    missingTools: string[];
  } {
    const normalizedMessage = String(userMessage || "");
    if (!this.isReadScope(authScope) || !WORKLOAD_OR_CASES_QUERY_PATTERN.test(normalizedMessage)) {
      return {
        hasGap: false,
        expectedTools: [],
        executedTools: [],
        missingTools: [],
      };
    }

    const executed = new Set(
      (toolCalls || [])
        .map((call) => String(call?.toolName || "").trim())
        .filter((name) => name.length > 0),
    );

    // A successful graph query can satisfy relational workload coverage in one call.
    if (executed.has("getEntityGraph")) {
      return {
        hasGap: false,
        expectedTools: ["getEntityGraph"],
        executedTools: Array.from(executed),
        missingTools: [],
      };
    }

    const expected = new Set<string>(["listDossiers", "listLawsuits", "listTasks"]);
    if (/\b(session|sessions|hearing|hearings|meeting|meetings)\b/i.test(normalizedMessage)) {
      expected.add("listSessions");
    }
    if (/\bmission|missions\b/i.test(normalizedMessage)) {
      expected.add("listMissions");
    }
    if (/\bdocument|documents\b/i.test(normalizedMessage)) {
      expected.add("listDocuments");
    }
    if (/\b(invoice|invoices|financial|finance|billing)\b/i.test(normalizedMessage)) {
      expected.add("listFinancialEntries");
    }

    const expectedTools = Array.from(expected);
    const missingTools = expectedTools.filter((name) => !executed.has(name));

    return {
      hasGap: missingTools.length > 0,
      expectedTools,
      executedTools: Array.from(executed),
      missingTools,
    };
  }

  private isReadScope(authScope: string): boolean {
    const normalized = String(authScope || "").trim().toLowerCase();
    return normalized === "read" || normalized === "reader";
  }

  private buildCoverageRecoveryInstruction(
    userMessage: string,
    missingTools: string[],
  ): string {
    const missing = (missingTools || []).filter((name) => typeof name === "string" && name.trim().length > 0);
    return [
      "ENTITY COVERAGE CHECK",
      "The previous draft appears to have partial workload/case coverage.",
      missing.length > 0
        ? `Before finalizing, retrieve missing entities using valid tools: ${missing.join(", ")}`
        : "Before finalizing, ensure workload/case entities are fully covered with valid READ tools.",
      "Use only registered tool names and valid argument objects.",
      `Original user request: ${userMessage}`,
    ].join("\n");
  }

  private recoverInvalidToolCalls(
    invalidToolCalls: LLMToolCall[],
    input: AgentTurnInput,
    iteration: number,
  ): LLMToolCall[] {
    const recovered: LLMToolCall[] = [];

    for (const toolCall of invalidToolCalls) {
      const args = this.normalizeArgs(toolCall.arguments);
      const argKeys = Object.keys(args);
      if (argKeys.length === 0) {
        continue;
      }

      const candidates = this.rankToolCandidatesByArgKeys(argKeys);
      if (candidates.length === 0) {
        continue;
      }

      const top = candidates[0];
      const runnerUp = candidates[1];
      const highConfidence =
        top.overlap >= 2 &&
        top.score >= 2 &&
        (!runnerUp || top.score - runnerUp.score >= 1);

      if (!highConfidence) {
        continue;
      }

      const recoveredCall: LLMToolCall = {
        id: toolCall.id,
        name: top.name,
        arguments: args,
      };
      recovered.push(recoveredCall);

      console.warn(
        "[LLM_TOOL_CALL_RECOVERED_BY_SCHEMA]",
        this.safeJsonStringify({
          sessionId: input.sessionId,
          turnId: input.turnId,
          iteration,
          originalName: toolCall.name,
          recoveredName: top.name,
          argKeys,
          confidenceScore: top.score,
        }),
      );
    }

    return recovered;
  }

  private rankToolCandidatesByArgKeys(
    argKeys: string[],
  ): Array<{ name: string; overlap: number; extra: number; score: number }> {
    if (!Array.isArray(argKeys) || argKeys.length === 0) {
      return [];
    }

    const normalizedArgKeys = argKeys
      .map((key) => String(key || "").trim())
      .filter((key) => key.length > 0);
    if (normalizedArgKeys.length === 0) {
      return [];
    }

    const candidates: Array<{ name: string; overlap: number; extra: number; score: number }> = [];

    for (const tool of this.registry.list()) {
      const schema = isRecord(tool.inputSchema) ? tool.inputSchema : null;
      const properties = schema && isRecord(schema.properties) ? schema.properties : null;
      if (!properties) {
        continue;
      }

      const propertyKeys = new Set(Object.keys(properties));
      if (propertyKeys.size === 0) {
        continue;
      }

      let overlap = 0;
      for (const key of normalizedArgKeys) {
        if (propertyKeys.has(key)) {
          overlap += 1;
        }
      }
      if (overlap === 0) {
        continue;
      }

      const extra = normalizedArgKeys.length - overlap;
      const score = overlap - extra * 0.35;
      candidates.push({
        name: tool.name,
        overlap,
        extra,
        score,
      });
    }

    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.overlap !== a.overlap) return b.overlap - a.overlap;
      return a.extra - b.extra;
    });

    return candidates;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  return String(error || "").toLowerCase().includes("aborted");
}
