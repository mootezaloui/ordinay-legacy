import { ENABLE_COMPAT_EVENTS } from "../config";

export type StreamEvent =
  | { type: "text_delta"; delta: string }
  | { type: "tool_start"; toolName: string }
  | { type: "tool_result"; toolName: string; ok: boolean }
  | { type: "pending"; actionSummary: string }
  | { type: "confirmed"; actionSummary: string; ok: boolean }
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

    if (ENABLE_COMPAT_EVENTS) {
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
