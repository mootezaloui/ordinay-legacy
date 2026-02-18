"use strict";

const path = require("path");
const { Worker } = require("worker_threads");
const { getDocumentIntelLimits } = require("../limits");

class OcrWorkerManager {
  constructor() {
    this.limits = getDocumentIntelLimits();
    this.workers = [];
    this.queue = [];
    this.pending = new Map();
    this.canceledDocs = new Set();
    this.seq = 0;
    this._boot();
  }

  _boot() {
    const size = Math.max(1, this.limits.maxConcurrentPages);
    for (let i = 0; i < size; i += 1) {
      this.workers.push(this._createSlot());
    }
  }

  _createSlot() {
    const workerPath = path.join(__dirname, "worker.js");
    const thread = new Worker(workerPath);
    const slot = { thread, busy: false };
    thread.on("message", (message) => this._onMessage(slot, message));
    thread.on("error", (error) => this._onError(slot, error));
    thread.on("exit", () => {
      slot.busy = false;
      if (!slot._dead) {
        slot._dead = true;
        const idx = this.workers.indexOf(slot);
        if (idx >= 0) this.workers[idx] = this._createSlot();
      }
    });
    return slot;
  }

  _onMessage(slot, message) {
    const { id, ok, result, error } = message || {};
    if (!id) return;
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    slot.busy = false;
    if (ok) pending.resolve(result);
    else pending.reject(new Error(error || "ocr_worker_failed"));
    this._drain();
  }

  _onError(slot, error) {
    slot.busy = false;
    for (const [id, pending] of this.pending.entries()) {
      if (pending.slot === slot) {
        this.pending.delete(id);
        pending.reject(error);
      }
    }
    this._drain();
  }

  cancelDocument(documentId) {
    const docId = Number(documentId);
    this.canceledDocs.add(docId);
    for (const [id, pending] of this.pending.entries()) {
      if (pending.documentId !== docId) continue;
      this.pending.delete(id);
      pending.reject(new Error("cancelled_by_user"));
      try {
        pending.slot.thread.terminate();
      } catch {}
      pending.slot.busy = false;
    }
    this.queue = this.queue.filter((task) => Number(task.documentId) !== docId);
  }

  clearDocumentCancel(documentId) {
    this.canceledDocs.delete(Number(documentId));
  }

  executeOCR({
    documentId,
    pageIndex,
    imageBuffer,
    lang = "eng",
    timeoutMs,
  }) {
    const docId = Number(documentId);
    if (this.canceledDocs.has(docId)) {
      return Promise.reject(new Error("cancelled_by_user"));
    }
    return new Promise((resolve, reject) => {
      this.queue.push({
        documentId: docId,
        pageIndex,
        imageBuffer,
        lang,
        timeoutMs: Number(timeoutMs) || this.limits.workerTimeoutMs,
        resolve,
        reject,
      });
      this._drain();
    });
  }

  _drain() {
    for (const slot of this.workers) {
      if (slot.busy) continue;
      const task = this.queue.shift();
      if (!task) return;
      if (this.canceledDocs.has(task.documentId)) {
        task.reject(new Error("cancelled_by_user"));
        continue;
      }
      const id = `ocr_${++this.seq}`;
      slot.busy = true;
      const timeoutId = setTimeout(() => {
        const pending = this.pending.get(id);
        if (!pending) return;
        this.pending.delete(id);
        slot.busy = false;
        pending.reject(new Error("ocr_timeout"));
        this._drain();
      }, task.timeoutMs);
      this.pending.set(id, {
        documentId: task.documentId,
        slot,
        resolve: (value) => {
          clearTimeout(timeoutId);
          task.resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeoutId);
          task.reject(error);
        },
      });
      slot.thread.postMessage({
        id,
        type: "ocr",
        payload: {
          pageIndex: task.pageIndex,
          imageBuffer: task.imageBuffer,
          lang: task.lang,
        },
      });
    }
  }
}

let singleton = null;

function getOcrWorkerManager() {
  if (!singleton) singleton = new OcrWorkerManager();
  return singleton;
}

module.exports = {
  OcrWorkerManager,
  getOcrWorkerManager,
};
