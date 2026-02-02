'use strict';

class AgentLedgerService {
  constructor() {
    this._entries = [];
  }

  record(entry) {
    const record = Object.freeze({
      id: this._entries.length + 1,
      recordedAt: new Date().toISOString(),
      ...entry,
    });
    this._entries.push(record);
    return record;
  }

  list() {
    return [...this._entries];
  }
}

module.exports = AgentLedgerService;
