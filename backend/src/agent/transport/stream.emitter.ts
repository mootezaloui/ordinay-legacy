import { ENABLE_COMPAT_EVENTS } from "../config";
import type {
  DraftArtifact,
  PlanArtifact,
  PlanExecutedArtifact,
  PlanRejectedArtifact,
  SuggestionArtifact,
} from "../types";

export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_result"; toolName: string; ok: boolean }
  | { type: "draft_artifact"; artifact: DraftArtifact }
  | { type: "suggestion_artifact"; artifact: SuggestionArtifact }
  | { type: "plan_artifact"; artifact: PlanArtifact }
  | { type: "plan_executed"; artifact: PlanExecutedArtifact }
  | { type: "plan_rejected"; artifact: PlanRejectedArtifact }
  | { type: "pending"; actionSummary: string }
  | { type: "confirmed"; actionSummary: string; ok: boolean }
  | { type: "entity_mutation_success"; event: Record<string, unknown> }
  | { type: "disambiguation"; payload: Record<string, unknown> }
  | {
      type: "artifact";
      output: Record<string, unknown>;
      intent: string;
      visibility?: "visible" | "metadata";
      interactionMode?: "conversational" | "operational";
    }
  | { type: "done" }
  | { type: "error"; message: string };

interface SseResponseLike {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?: () => void;
  flush?: () => void;
  socket?: { setNoDelay?: (enable?: boolean) => void };
  headersSent?: boolean;
  writableEnded?: boolean;
}

interface CompatEnvelope {
  type: StreamEvent["type"];
  payload: Record<string, unknown>;
  timestamp: string;
}

export class StreamEmitter {
  private closed = false;

  constructor(private readonly res: SseResponseLike) {
    this.ensureHeaders();
  }

  emit(event: StreamEvent): void {
    if (this.closed || this.res.writableEnded) {
      return;
    }

    this.writeEvent(event.type, event);

    const emitCompat = ENABLE_COMPAT_EVENTS && false;
    if (emitCompat) {
      const compatEnvelope: CompatEnvelope = {
        type: event.type,
        payload: this.toCompatPayload(event),
        timestamp: new Date().toISOString(),
      };
      this.writeEvent("agent_event", compatEnvelope);
    }
  }

  close(): void {
    if (this.closed || this.res.writableEnded) {
      return;
    }
    this.closed = true;
    this.res.end();
  }

  private ensureHeaders(): void {
    if (this.res.headersSent) {
      return;
    }

    this.res.setHeader("Content-Type", "text/event-stream");
    this.res.setHeader("Cache-Control", "no-cache, no-transform");
    this.res.setHeader("Connection", "keep-alive");
    this.res.setHeader("X-Accel-Buffering", "no");
    this.res.setHeader("Content-Encoding", "identity");

    if (typeof this.res.flushHeaders === "function") {
      this.res.flushHeaders();
    }

    if (this.res.socket?.setNoDelay) {
      this.res.socket.setNoDelay(true);
    }
  }

  private writeEvent(eventName: string, payload: unknown): void {
    const serialized = this.safeJson(payload);
    this.res.write(`event: ${eventName}\ndata: ${serialized}\n\n`);
    if (typeof this.res.flush === "function") {
      this.res.flush();
    }
  }

  private toCompatPayload(event: StreamEvent): Record<string, unknown> {
    const base: Record<string, unknown> = { type: event.type };
    if ("delta" in event) {
      base.delta = event.delta;
    }
    if ("toolName" in event) {
      base.toolName = event.toolName;
    }
    if ("ok" in event) {
      base.ok = event.ok;
    }
    if ("actionSummary" in event) {
      base.actionSummary = event.actionSummary;
    }
    if ("message" in event) {
      base.message = event.message;
    }
    if ("artifact" in event) {
      base.artifact = event.artifact;
    }
    if ("payload" in event) {
      base.payload = event.payload;
    }
    if ("output" in event) {
      base.output = event.output;
    }
    if ("intent" in event) {
      base.intent = event.intent;
    }
    if ("visibility" in event) {
      base.visibility = event.visibility;
    }
    if ("interactionMode" in event) {
      base.interactionMode = event.interactionMode;
    }
    return base;
  }

  private safeJson(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify({ type: "error", message: "Failed to serialize event payload" });
    }
  }
}
