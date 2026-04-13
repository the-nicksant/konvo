import { MockLanguageModelV3 } from "ai/test";

const MOCK_USAGE = {
  inputTokens: { total: 10, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: undefined, reasoning: undefined },
};

/**
 * Create a mock language model that returns a fixed sequence of text responses.
 * Uses MockLanguageModelV3 from ai/test — never mocks generateText itself.
 *
 * @example
 * const model = createMockModel(['Hello!', 'Goodbye!'])
 * // First generateText call → 'Hello!', second → 'Goodbye!'
 */
export function createMockModel(responses: string[]): MockLanguageModelV3 {
  const results = responses.map((text) => ({
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: MOCK_USAGE,
  }));

  // Use a single result object (not an array) for single-response models to avoid
  // the MockLanguageModelV3 off-by-one when indexing arrays.
  if (results.length === 1) {
    return new MockLanguageModelV3({ doGenerate: results[0] });
  }

  // For multi-response models, use a closure to sequence results correctly.
  let callIndex = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => results[callIndex++] ?? results.at(-1),
  });
}

/**
 * Create a mock model that first emits a tool call, then a text response.
 * Useful for testing multi-step tool-calling flows.
 */
export function createMockModelWithToolCall(
  toolName: string,
  toolArgs: Record<string, unknown>,
  finalText: string,
): MockLanguageModelV3 {
  const toolCallResult = {
    content: [
      {
        type: "tool-call" as const,
        toolCallId: "call-001",
        toolName,
        args: toolArgs,
        providerMetadata: undefined,
      },
    ],
    finishReason: { unified: "tool-calls" as const, raw: undefined },
    usage: MOCK_USAGE,
  };

  const textResult = {
    content: [{ type: "text" as const, text: finalText }],
    finishReason: { unified: "stop" as const, raw: undefined },
    usage: MOCK_USAGE,
  };

  // Use a closure to properly sequence results (avoids MockLanguageModelV3's off-by-one with arrays).
  const results = [toolCallResult, textResult];
  let callIndex = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => results[callIndex++] ?? results.at(-1),
  });
}
