"use strict";

const { getScenarioFixture, listScenarioFixtures } = require("./scenario.fixtures");
const { runScenario, runScenarioSuite } = require("./scenario.runner");
const { replayTurnTrace, replayTraceSuite } = require("./replay.runner");
const { withInjectedFailure } = require("./failure.injector");
const { runLoadTest } = require("./load.runner");
const assertions = require("./assertions");
const { createLiveRuntime, createLiveStreamHandler, resolveTransportModule } = require("./runtime.resolver");

module.exports = {
  getScenarioFixture,
  listScenarioFixtures,
  runScenario,
  runScenarioSuite,
  replayTurnTrace,
  replayTraceSuite,
  withInjectedFailure,
  runLoadTest,
  createLiveRuntime,
  createLiveStreamHandler,
  resolveTransportModule,
  ...assertions,
};

