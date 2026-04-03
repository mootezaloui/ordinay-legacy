"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StreamEmitter = void 0;
const config_1 = require("../config");
class StreamEmitter {
    res;
    closed = false;
    constructor(res) {
        this.res = res;
        this.ensureHeaders();
    }
    emit(event) {
        if (this.closed || this.res.writableEnded) {
            return;
        }
        this.writeEvent(event.type, event);
        const emitCompat = config_1.ENABLE_COMPAT_EVENTS && false;
        if (emitCompat) {
            const compatEnvelope = {
                type: event.type,
                payload: this.toCompatPayload(event),
                timestamp: new Date().toISOString(),
            };
            this.writeEvent("agent_event", compatEnvelope);
        }
    }
    close() {
        if (this.closed || this.res.writableEnded) {
            return;
        }
        this.closed = true;
        this.res.end();
    }
    ensureHeaders() {
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
    writeEvent(eventName, payload) {
        const serialized = this.safeJson(payload);
        this.res.write(`event: ${eventName}\ndata: ${serialized}\n\n`);
        if (typeof this.res.flush === "function") {
            this.res.flush();
        }
    }
    toCompatPayload(event) {
        const base = { type: event.type };
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
    safeJson(value) {
        try {
            return JSON.stringify(value);
        }
        catch {
            return JSON.stringify({ type: "error", message: "Failed to serialize event payload" });
        }
    }
}
exports.StreamEmitter = StreamEmitter;
