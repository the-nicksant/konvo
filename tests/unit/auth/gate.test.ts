import { describe, expect, it, vi } from "vitest";
import { runAuthGate } from "../../../src/auth/gate.js";
import { createTestSession } from "../../fixtures/sessions.js";

const NOW = 1736000000000;

describe("runAuthGate — no auth config", () => {
  it("allows with default permissions when config is empty", async () => {
    const result = await runAuthGate(createTestSession(), "5511999887766", {}, NOW);
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      expect(result.identity).toBeNull();
      expect(result.permissions.allowedTools).toBe("*");
      expect(result.permissions.allowedWorkflows).toBe("*");
    }
  });
});

describe("runAuthGate — cache hit", () => {
  it("allows without re-running auth when cache is still valid", async () => {
    const authenticate = vi.fn();
    const session = createTestSession({
      auth: { status: "authenticated", cachedUntil: NOW + 60_000 },
    });
    const result = await runAuthGate(session, "5511", { authenticate }, NOW);
    expect(result.outcome).toBe("allow");
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("returns cached identity and permissions on cache hit", async () => {
    const identity = { id: "u1", name: "Maria", phone: "5511", metadata: {} };
    const permissions = { role: "vip", allowedTools: "*" as const, allowedWorkflows: "*" as const };
    const session = createTestSession({
      customer: identity,
      permissions,
      auth: { status: "authenticated", cachedUntil: NOW + 60_000 },
    });
    const result = await runAuthGate(session, "5511", { authenticate: vi.fn() }, NOW);
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      expect(result.identity).toEqual(identity);
      expect(result.permissions).toEqual(permissions);
    }
  });

  it("re-authenticates when cache has expired", async () => {
    const authenticate = vi.fn().mockResolvedValue({ status: "authenticated" });
    const session = createTestSession({
      auth: { status: "authenticated", cachedUntil: NOW - 1 },
    });
    await runAuthGate(session, "5511", { authenticate }, NOW);
    expect(authenticate).toHaveBeenCalledOnce();
  });

  it("re-authenticates on every call when cacheFor is 0", async () => {
    const authenticate = vi.fn().mockResolvedValue({ status: "authenticated" });
    const session = createTestSession({ auth: { status: "authenticated", cachedUntil: NOW } });
    await runAuthGate(session, "5511", { authenticate, cacheFor: 0 }, NOW);
    expect(authenticate).toHaveBeenCalledOnce();
  });

  it("does not allow a pending status as a cache hit", async () => {
    const authenticate = vi.fn().mockResolvedValue({ status: "authenticated" });
    const session = createTestSession({
      auth: { status: "pending", cachedUntil: NOW + 60_000 },
    });
    await runAuthGate(session, "5511", { authenticate }, NOW);
    expect(authenticate).toHaveBeenCalledOnce();
  });
});

describe("runAuthGate — known user + authenticated", () => {
  it("resolves identity and allows when authenticate returns authenticated", async () => {
    const identity = { id: "u1", name: "Maria", phone: "5511", metadata: {} };
    const resolve = vi.fn().mockResolvedValue(identity);
    const result = await runAuthGate(
      createTestSession(),
      "5511",
      {
        resolve,
        authenticate: async () => ({ status: "authenticated" }),
      },
      NOW,
    );
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      expect(result.identity).toEqual(identity);
    }
    expect(resolve).toHaveBeenCalledWith("5511");
  });

  it("uses per-user permissions returned by authenticate", async () => {
    const adminPerms = {
      role: "admin",
      allowedTools: "*" as const,
      allowedWorkflows: "*" as const,
    };
    const result = await runAuthGate(
      createTestSession(),
      "5511",
      { authenticate: async () => ({ status: "authenticated", permissions: adminPerms }) },
      NOW,
    );
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      expect(result.permissions).toEqual(adminPerms);
    }
  });

  it("resolve returning null (unknown user) is passed to authenticate", async () => {
    const authenticate = vi.fn().mockResolvedValue({ status: "authenticated" });
    await runAuthGate(
      createTestSession(),
      "5511",
      { resolve: async () => null, authenticate },
      NOW,
    );
    expect(authenticate).toHaveBeenCalledWith(null, "5511");
  });

  it("sets cachedUntil based on cacheFor config", async () => {
    const result = await runAuthGate(
      createTestSession(),
      "5511",
      {
        authenticate: async () => ({ status: "authenticated" }),
        cacheFor: 120,
      },
      NOW,
    );
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      expect(result.cachedUntil).toBe(NOW + 120 * 1000);
    }
  });
});

describe("runAuthGate — denied with guest fallback", () => {
  it("allows as guest when denied handler has fallbackPermissions", async () => {
    const guestPerms = {
      role: "guest",
      allowedTools: ["checkWeather"] as string[],
      allowedWorkflows: [] as string[],
    };
    const result = await runAuthGate(
      createTestSession(),
      "5511",
      {
        authenticate: async () => ({ status: "denied", reason: "unregistered" }),
        onUnauthenticated: {
          unregistered: { message: "Register first.", fallbackPermissions: guestPerms },
        },
      },
      NOW,
    );
    expect(result.outcome).toBe("allow");
    if (result.outcome === "allow") {
      expect(result.identity).toBeNull();
      expect(result.permissions).toEqual(guestPerms);
    }
  });
});

describe("runAuthGate — denied with no fallback", () => {
  it("denies with specific handler message", async () => {
    const result = await runAuthGate(
      createTestSession(),
      "5511",
      {
        authenticate: async () => ({ status: "denied", reason: "banned" }),
        onUnauthenticated: { banned: { message: "You are banned." } },
      },
      NOW,
    );
    expect(result.outcome).toBe("deny");
    if (result.outcome === "deny") {
      expect(result.message).toBe("You are banned.");
    }
  });

  it("falls back to default handler when reason has no specific entry", async () => {
    const result = await runAuthGate(
      createTestSession(),
      "5511",
      {
        authenticate: async () => ({ status: "denied", reason: "unrecognized" }),
        onUnauthenticated: { default: { message: "Access denied." } },
      },
      NOW,
    );
    expect(result.outcome).toBe("deny");
    if (result.outcome === "deny") {
      expect(result.message).toBe("Access denied.");
    }
  });

  it("uses generic message when no handler configured at all", async () => {
    const result = await runAuthGate(
      createTestSession(),
      "5511",
      { authenticate: async () => ({ status: "denied", reason: "whatever" }) },
      NOW,
    );
    expect(result.outcome).toBe("deny");
    if (result.outcome === "deny") {
      expect(result.message).toBeTruthy();
    }
  });
});
