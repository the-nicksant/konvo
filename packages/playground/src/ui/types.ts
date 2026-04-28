export type OutboundMessage =
  | { type: 'text'; text: string }
  | { type: 'options'; text: string; options: Array<{ id: string; label: string }> }
  | { type: 'confirmation'; text: string; confirmLabel?: string; cancelLabel?: string }

export type ChatMessage =
  | { role: 'user'; text: string; id: string }
  | { role: 'bot'; content: OutboundMessage; id: string }

export type DebugEvent =
  | { type: 'tool_call'; toolName: string; args: unknown; timestamp: string }
  | { type: 'tool_result'; toolName: string; result: unknown }
  | { type: 'message_out'; content: OutboundMessage }
