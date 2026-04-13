import type { UserPermissions } from "../auth/types.js";
import { ConfigValidationError } from "../errors.js";
import type { ToolDefinition } from "./types.js";

/**
 * Stores and manages all tools available to the agent.
 * Built at Konvo construction time from the user's `tools` config array.
 *
 * @internal Framework-internal. Users interact with tools via `defineTool()` and the
 * `KonvoConfig.tools` array — they never instantiate or reference ToolRegistry directly.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  /**
   * Register a tool. Throws if a tool with the same name is already registered.
   */
  add(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new ConfigValidationError(
        `tools[${tool.name}]`,
        "duplicate tool name — each tool must have a unique name",
      );
    }
    this.tools.set(tool.name, tool);
  }

  /**
   * Look up a tool by name. Returns undefined if not found.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Return all registered tools in registration order.
   * Returns a new array on each call — mutations do not affect the registry.
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Return only the tools this user is permitted to call.
   * If `permissions.allowedTools` is `'*'`, all tools are returned.
   */
  filterByPermissions(permissions: UserPermissions): ToolDefinition[] {
    if (permissions.allowedTools === "*") return this.getAll();
    const allowed = new Set(permissions.allowedTools);
    return this.getAll().filter((t) => allowed.has(t.name));
  }
}
