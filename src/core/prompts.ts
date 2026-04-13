/**
 * Build the system prompt sent to the LLM on every turn.
 *
 * Prepends the current date so the LLM can reason about time-sensitive information
 * (appointment availability, deadlines, etc.) without guessing.
 *
 * @param instructions  The developer's agent instructions from KonvoConfig.agent.instructions
 * @param now           Current date (injectable for testing)
 */
export function buildSystemPrompt(instructions: string, now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `Today's date is ${date}.\n\n${instructions}`;
}
