/** Base class for all konvo errors. Use instanceof checks to handle specific cases. */
export class KonvoError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "KonvoError";
  }
}

/** Thrown when the KonvoConfig fails validation at construction time */
export class ConfigValidationError extends KonvoError {
  constructor(field: string, message: string) {
    super(`Invalid config field '${field}': ${message}`, "CONFIG_INVALID");
    this.name = "ConfigValidationError";
  }
}

/** Thrown when a tool's execute() function throws or returns a non-OK response */
export class ToolExecutionError extends KonvoError {
  constructor(toolName: string, cause: unknown) {
    super(`Tool '${toolName}' failed: ${cause}`, "TOOL_EXECUTION_FAILED");
    this.name = "ToolExecutionError";
  }
}

/** Thrown when the auth gate blocks processing */
export class AuthDeniedError extends KonvoError {
  constructor(reason: string) {
    super(`Authentication denied: ${reason}`, "AUTH_DENIED");
    this.name = "AuthDeniedError";
  }
}

/** Thrown when a session is expected but not found in the store */
export class SessionNotFoundError extends KonvoError {
  constructor(sessionId: string) {
    super(`Session '${sessionId}' not found`, "SESSION_NOT_FOUND");
    this.name = "SessionNotFoundError";
  }
}

/** Thrown when a workflow step fails */
export class WorkflowError extends KonvoError {
  constructor(workflowName: string, stepName: string, message: string) {
    super(`Workflow '${workflowName}' at step '${stepName}': ${message}`, "WORKFLOW_ERROR");
    this.name = "WorkflowError";
  }
}

/** Thrown when a tool call is blocked because the user has not confirmed the action */
export class ConfirmationRequiredError extends KonvoError {
  constructor(
    public readonly toolName: string,
    public readonly actionLevel: "read" | "write" | "destructive",
  ) {
    super(
      `Tool '${toolName}' requires user confirmation (action level: ${actionLevel})`,
      "CONFIRMATION_REQUIRED",
    );
    this.name = "ConfirmationRequiredError";
  }
}

/** Thrown when a session exceeds its configured tool call rate limit */
export class RateLimitError extends KonvoError {
  constructor(message: string) {
    super(message, "RATE_LIMIT_EXCEEDED");
    this.name = "RateLimitError";
  }
}
