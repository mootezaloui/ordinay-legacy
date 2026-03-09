"use strict";

const { summarizeToolResult } = require("../tools/tool.summarizer");

async function runChatToolLoop({
  helperService,
  messages,
  exposedTools,
  policy,
  executionContext,
  signal,
} = {}) {
  const toolExecutions = [];
  const stepCommentaries = [];
  let rounds = 0;
  let finalMessage = "";
  const activeExposedTools = Array.isArray(exposedTools) ? [...exposedTools] : [];

  while (rounds < helperService.maxToolRounds) {
    rounds += 1;
    const assistant = await helperService.llmClient({
      messages,
      tools: activeExposedTools.map((tool) => tool.definition),
      signal,
      maxTokens: helperService.maxCompletionTokens,
    });

    const toolCalls = Array.isArray(assistant?.tool_calls) ? assistant.tool_calls : [];
    if (!toolCalls.length) {
      finalMessage = String(assistant?.content || "").trim();
      break;
    }

    messages.push({
      role: "assistant",
      content: String(assistant?.content || ""),
      tool_calls: toolCalls,
    });

    for (let index = 0; index < toolCalls.length; index += 1) {
      const call = toolCalls[index];
      const toolName = String(call?.function?.name || "tool").trim() || "tool";
      const execution = await helperService._executeToolCall({
        call,
        policy,
        executionContext,
        exposedTools: activeExposedTools,
        stepIndex: toolExecutions.length + index,
      });
      toolExecutions.push(execution);
      const modelSummary = execution?.ok
        ? summarizeToolResult(toolName, execution.result)
        : `${toolName} failed: ${String(execution?.error?.message || "Tool execution failed.")}`;
      messages.push({
        role: "tool",
        tool_call_id: call?.id || `tool_${rounds}_${index}`,
        content: modelSummary,
      });
    }
  }

  if (!finalMessage) {
    finalMessage = "I completed the available tool calls but could not produce a final response.";
  }

  return {
    finalMessage,
    rounds,
    toolExecutions,
    stepCommentaries,
    messages,
  };
}

module.exports = {
  runChatToolLoop,
};
