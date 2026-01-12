'use strict';

class BaseReasoner {
  constructor(name = 'base') {
    this.name = name;
  }

  async explain() {
    this._notImplemented('explain');
  }

  async summarize() {
    this._notImplemented('summarize');
  }

  async draft() {
    this._notImplemented('draft');
  }

  async analyzeRisks() {
    this._notImplemented('analyzeRisks');
  }

  _notImplemented(method) {
    throw new Error(`Reasoner "${this.name}" must implement ${method}().`);
  }
}

module.exports = BaseReasoner;
