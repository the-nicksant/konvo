import { beforeEach, describe, expect, it } from "vitest";
import type { UserPermissions } from "../../../src/auth/types.js";
import { ConfigValidationError } from "../../../src/errors.js";
import { ToolRegistry } from "../../../src/tools/registry.js";
import { createOrder, deleteOrder, getOrderStatus } from "../../fixtures/tools.js";

let registry: ToolRegistry;

beforeEach(() => {
  registry = new ToolRegistry();
});

describe("add", () => {
  it("registers a tool successfully", () => {
    registry.add(getOrderStatus);
    expect(registry.get("getOrderStatus")).toBe(getOrderStatus);
  });

  it("throws ConfigValidationError for a duplicate tool name", () => {
    registry.add(getOrderStatus);
    expect(() => registry.add(getOrderStatus)).toThrow(ConfigValidationError);
  });

  it("throws with an actionable message referencing the tool name", () => {
    registry.add(getOrderStatus);
    expect(() => registry.add(getOrderStatus)).toThrow("getOrderStatus");
  });
});

describe("get", () => {
  it("returns the tool by name", () => {
    registry.add(createOrder);
    expect(registry.get("createOrder")).toBe(createOrder);
  });

  it("returns undefined for an unknown tool name", () => {
    expect(registry.get("unknown")).toBeUndefined();
  });
});

describe("getAll", () => {
  it("returns an empty array when no tools are registered", () => {
    expect(registry.getAll()).toEqual([]);
  });

  it("returns all registered tools", () => {
    registry.add(getOrderStatus);
    registry.add(createOrder);
    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((t) => t.name)).toContain("getOrderStatus");
    expect(all.map((t) => t.name)).toContain("createOrder");
  });

  it("returns a new array on each call (copy semantics)", () => {
    registry.add(getOrderStatus);
    expect(registry.getAll()).not.toBe(registry.getAll());
  });
});

describe("filterByPermissions", () => {
  beforeEach(() => {
    registry.add(getOrderStatus);
    registry.add(createOrder);
    registry.add(deleteOrder);
  });

  it("returns all tools when allowedTools is '*'", () => {
    const perms: UserPermissions = { role: "admin", allowedTools: "*", allowedWorkflows: "*" };
    expect(registry.filterByPermissions(perms)).toHaveLength(3);
  });

  it("returns only the listed tools", () => {
    const perms: UserPermissions = {
      role: "user",
      allowedTools: ["getOrderStatus", "createOrder"],
      allowedWorkflows: "*",
    };
    const filtered = registry.filterByPermissions(perms);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((t) => t.name)).not.toContain("deleteOrder");
  });

  it("returns an empty array when allowedTools is an empty list", () => {
    const perms: UserPermissions = { role: "guest", allowedTools: [], allowedWorkflows: [] };
    expect(registry.filterByPermissions(perms)).toHaveLength(0);
  });

  it("ignores tool names in allowedTools that are not registered", () => {
    const perms: UserPermissions = {
      role: "user",
      allowedTools: ["getOrderStatus", "nonExistentTool"],
      allowedWorkflows: "*",
    };
    const filtered = registry.filterByPermissions(perms);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.name).toBe("getOrderStatus");
  });
});
