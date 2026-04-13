// src/errors.ts
var KonvoError = class extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
    this.name = "KonvoError";
  }
  code;
};
var ConfigValidationError = class extends KonvoError {
  constructor(field, message) {
    super(`Invalid config field '${field}': ${message}`, "CONFIG_INVALID");
    this.name = "ConfigValidationError";
  }
};
var ToolExecutionError = class extends KonvoError {
  constructor(toolName, cause) {
    super(`Tool '${toolName}' failed: ${cause}`, "TOOL_EXECUTION_FAILED");
    this.name = "ToolExecutionError";
  }
};
var AuthDeniedError = class extends KonvoError {
  constructor(reason) {
    super(`Authentication denied: ${reason}`, "AUTH_DENIED");
    this.name = "AuthDeniedError";
  }
};
var SessionNotFoundError = class extends KonvoError {
  constructor(sessionId) {
    super(`Session '${sessionId}' not found`, "SESSION_NOT_FOUND");
    this.name = "SessionNotFoundError";
  }
};
var WorkflowError = class extends KonvoError {
  constructor(workflowName, stepName, message) {
    super(`Workflow '${workflowName}' at step '${stepName}': ${message}`, "WORKFLOW_ERROR");
    this.name = "WorkflowError";
  }
};

// src/core/agent.ts
var Konvo = class {
  config;
  constructor(config) {
    validateConfig(config);
    this.config = config;
  }
  /** Start the HTTP server on the given port */
  async listen(_port) {
    throw new Error("Not yet implemented");
  }
  /** Gracefully stop the server */
  async stop() {
  }
};
function validateConfig(config) {
  if (!config.agent) {
    throw new ConfigValidationError("agent", "required");
  }
  if (!config.agent.model) {
    throw new ConfigValidationError(
      "agent.model",
      'required \u2014 pass an AI SDK model, e.g. openai("gpt-4o-mini")'
    );
  }
  if (!config.agent.instructions) {
    throw new ConfigValidationError("agent.instructions", "required \u2014 provide a system prompt");
  }
  if (!config.channel) {
    throw new ConfigValidationError("channel", "required \u2014 provide a channel adapter");
  }
  if (!config.tools || config.tools.length === 0) {
    throw new ConfigValidationError("tools", "at least one tool is required");
  }
}

// src/tools/define-tool.ts
function defineTool(config) {
  return {
    name: config.name,
    description: config.description,
    parameters: config.parameters,
    execute: config.execute,
    actionLevel: config.actionLevel ?? "read",
    ...config.formatResponse !== void 0 && { formatResponse: config.formatResponse }
  };
}

// src/types/workflow.ts
function defineWorkflow(config) {
  return config;
}
function step(name, config) {
  return { name, ...config };
}

export { AuthDeniedError, ConfigValidationError, Konvo, KonvoError, SessionNotFoundError, ToolExecutionError, WorkflowError, defineTool, defineWorkflow, step };
