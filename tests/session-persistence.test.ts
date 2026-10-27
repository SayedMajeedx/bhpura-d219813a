import { describe, expect, it, vi } from "vitest";

// "Keep me logged in" (src/lib/session-persistence.ts): the choice decides where the Supabase
// session is kept, the lasting storage or the one the browser empties when it closes, and nothing
// is ever signed out on load. A sign-out ends this device's session only; "sign out of all
// devices" is its own button.

const auth = vi.hoisted(() => ({ signOut: vi.fn(async (_o?: unknown) => ({ error: null })) }));
vi.mock("../src/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
vi.mock("../src/lib/native-push", () => ({ releaseNativePushDevice: async () => undefined }));
vi.mock("@/lib/native-push", () => ({ releaseNativePushDevice: async () => undefined }));

const { applyRememberMe, rememberingStorage, remembersSession } =
  await import("../src/lib/session-persistence");
const { signOut, signOutEverywhere } = await import("../src/lib/auth/session");

class MemoryStore {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  key(i: number) {
    return [...this.items.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.items.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.items.set(k, v);
  }
  removeItem(k: string) {
    this.items.delete(k);
  }
}

const TOKEN = "sb-ref-auth-token";

describe("where a session is kept", () => {
  it("stays signed in by default, as a shopper's sign-in (which offers no box) does", () => {
    const local = new MemoryStore();
    const session = new MemoryStore();
    expect(remembersSession(local)).toBe(true);
    rememberingStorage(local, session).setItem(TOKEN, "t1");
    expect(local.getItem(TOKEN)).toBe("t1");
    expect(session.getItem(TOKEN)).toBeNull();
  });

  it("keeps an unticked person's session only until the browser closes", () => {
    const local = new MemoryStore();
    const session = new MemoryStore();
    applyRememberMe(false, local, session);
    const storage = rememberingStorage(local, session);
    storage.setItem(TOKEN, "t1");
    expect(session.getItem(TOKEN)).toBe("t1");
    expect(local.getItem(TOKEN)).toBeNull();
    expect(storage.getItem(TOKEN)).toBe("t1");
  });

  it("moves the session where it belongs when the choice is made after signing in", () => {
    const local = new MemoryStore();
    const session = new MemoryStore();
    rememberingStorage(local, session).setItem(TOKEN, "t1");
    local.setItem("unrelated", "kept");
    applyRememberMe(false, local, session);
    expect(session.getItem(TOKEN)).toBe("t1");
    expect(local.getItem(TOKEN)).toBeNull();
    expect(local.getItem("unrelated")).toBe("kept");
    applyRememberMe(true, local, session);
    expect(local.getItem(TOKEN)).toBe("t1");
    expect(session.getItem(TOKEN)).toBeNull();
  });

  it("forgets the old markers that signed people out on load", () => {
    const local = new MemoryStore();
    const session = new MemoryStore();
    local.setItem("boutq.auth.rememberMe", "1");
    applyRememberMe(true, local, session);
    expect(local.getItem("boutq.auth.rememberMe")).toBeNull();
  });

  it("removes a session from both stores on sign-out", () => {
    const local = new MemoryStore();
    const session = new MemoryStore();
    local.setItem(TOKEN, "a");
    session.setItem(TOKEN, "b");
    rememberingStorage(local, session).removeItem(TOKEN);
    expect(local.getItem(TOKEN)).toBeNull();
    expect(session.getItem(TOKEN)).toBeNull();
  });
});

describe("signing out", () => {
  it("ends this device's session only; the other devices stay signed in", async () => {
    await signOut();
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: "local" });
  });

  it("ends every device's session when the person asks for it", async () => {
    await signOutEverywhere();
    expect(auth.signOut).toHaveBeenLastCalledWith({ scope: "global" });
  });
});
