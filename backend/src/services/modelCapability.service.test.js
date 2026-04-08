const test = require('node:test');
const assert = require('node:assert/strict');

const service = require('./modelCapability.service');

test('hasToolParamsFromMetadata requires tools and tool_choice', () => {
  assert.equal(service.hasToolParamsFromMetadata(['tools', 'tool_choice', 'max_tokens']), true);
  assert.equal(service.hasToolParamsFromMetadata(['tools']), false);
  assert.equal(service.hasToolParamsFromMetadata([]), false);
  assert.equal(service.hasToolParamsFromMetadata(null), false);
});

test('resolveModelCapability uses metadata for openai-compatible models', async () => {
  const result = await service.resolveModelCapability(
    {
      provider_type: 'openai_compatible',
      base_url: 'https://openrouter.ai/api/v1',
      api_key: 'dummy',
      model: 'google/gemma-4-26b-a4b-it:free',
    },
    { supported_parameters: ['tools', 'tool_choice', 'temperature'] },
  );

  assert.equal(result.supports_tools, true);
  assert.equal(result.source_of_truth, 'provider_supported_parameters');
  assert.ok(result.checked_at);
});

test('unknown provider resolves to supports_tools=false (strict)', async () => {
  const result = await service.resolveModelCapability({
    provider_type: 'unknown_provider',
    base_url: '',
    api_key: '',
    model: 'x',
  });

  assert.equal(result.supports_tools, false);
  assert.equal(result.source_of_truth, 'unsupported_provider');
});

test('ensureModelSupportsTools blocks unsupported model', async () => {
  const result = await service.ensureModelSupportsTools({
    provider_type: 'unknown_provider',
    base_url: '',
    api_key: '',
    model: 'x',
  });

  assert.equal(result.ok, false);
  assert.match(String(result.error || ''), /does not support tool calling|Unsupported provider/i);
});
