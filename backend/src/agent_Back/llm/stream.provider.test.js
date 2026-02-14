"use strict";

const assert = require("assert");
const { streamLLM } = require("./stream.provider");

function createChunkedStream(chunks) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      if (index >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(new TextEncoder().encode(chunks[index++]));
    },
  });
}

async function collectParts(iterable) {
  const parts = [];
  for await (const part of iterable) {
    parts.push(part);
  }
  return parts;
}

async function run() {
  const originalFetch = global.fetch;

  try {
    process.env.LLM_PROVIDER = "ollama";

    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "application/json"]]),
      json: async () => ({ response: '{"goal":"X","needs":["Y"],"nextAction":"Z","confidence":0.8}' }),
    });

    const jsonParts = await collectParts(
      streamLLM({
        provider: "ollama",
        model: "x",
        prompt: "test",
      }),
    );
    assert(jsonParts.some((p) => p.kind === "delta"), "JSON mode should emit delta");
    assert(jsonParts.some((p) => p.kind === "final_text"), "JSON mode should emit final_text");

    global.fetch = async () => ({
      ok: true,
      status: 200,
      headers: new Map([["content-type", "application/x-ndjson"]]),
      body: createChunkedStream([
        '{"response":"{\\"goal\\":\\"A\\"","done":false}\n',
        '{"response":",\\"needs\\":[\\"B\\"],\\"nextAction\\":\\"C\\",\\"confidence\\":0.9}","done":true}\n',
      ]),
    });

    const streamParts = await collectParts(
      streamLLM({
        provider: "ollama",
        model: "x",
        prompt: "test",
      }),
    );
    const deltas = streamParts.filter((p) => p.kind === "delta");
    assert(deltas.length >= 2, "Streaming mode should emit incremental deltas");
  } finally {
    global.fetch = originalFetch;
  }

  console.log("stream.provider.test passed");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
