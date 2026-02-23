"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  resolveBindHost,
  startBackendServers,
  LOOPBACK_HOST,
} = require("./server.start");

test("resolveBindHost returns loopback by default", () => {
  assert.equal(resolveBindHost({}), LOOPBACK_HOST);
});

test("resolveBindHost rejects non-loopback HOST override", () => {
  assert.throws(
    () => resolveBindHost({ HOST: "0.0.0.0" }),
    /Non-loopback host override is not allowed/i,
  );
});

test("startBackendServers binds standalone HTTP to loopback", () => {
  const calls = [];
  const fakeApp = {
    listen(...args) {
      calls.push(args);
      const cb = args[args.length - 1];
      if (typeof cb === "function") cb();
      return { close() {} };
    },
  };

  startBackendServers(fakeApp, {
    env: {},
    port: 4242,
    logger: { log() {} },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], 4242);
  assert.equal(calls[0][1], "127.0.0.1");
});

test("startBackendServers keeps pipe mode HTTP sidecar on loopback", () => {
  const calls = [];
  const fakeApp = {
    listen(...args) {
      calls.push(args);
      const cb = args[args.length - 1];
      if (typeof cb === "function") cb();
      return { close() {} };
    },
  };

  startBackendServers(fakeApp, {
    env: {},
    pipePath: "\\\\.\\pipe\\ordinay-test",
    port: 4555,
    logger: { log() {} },
  });

  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "\\\\.\\pipe\\ordinay-test");
  assert.equal(calls[1][0], 4555);
  assert.equal(calls[1][1], "127.0.0.1");
});
