import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createConnection: vi.fn(), getAuth: vi.fn() }));
vi.mock("home-assistant-js-websocket", () => ({ ...mocks, ERR_HASS_HOST_REQUIRED: 1, ERR_INVALID_AUTH: 2 }));
import { clearHAConnection, getHAConnection, NeedsLoginError } from "./haConnection";

const realParent = Object.getOwnPropertyDescriptor(window, "parent");

function embedIn(parentConnection: unknown) {
  const fakeParent = {
    document: { querySelector: (sel: string) => (sel === "home-assistant" ? { hass: { connection: parentConnection } } : null) },
  };
  Object.defineProperty(window, "parent", { configurable: true, get: () => fakeParent });
}

beforeEach(() => {
  clearHAConnection();
  vi.clearAllMocks();
  localStorage.clear();
  mocks.getAuth.mockResolvedValue({});
});
afterEach(() => {
  if (realParent) Object.defineProperty(window, "parent", realParent);
});

describe("connection recovery", () => {
  it("retries a failed connection instead of keeping the rejected promise", async () => {
    const connection = { addEventListener: vi.fn() };
    mocks.createConnection.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(connection);
    await expect(getHAConnection()).rejects.toThrow("Offline");
    await expect(getHAConnection()).resolves.toBe(connection);
    expect(mocks.createConnection).toHaveBeenCalledTimes(2);
  });
});

describe("inside the Home Assistant panel", () => {
  it("reuses Home Assistant's own connection without logging in", async () => {
    const parentConn = { sendMessagePromise: vi.fn() };
    embedIn(parentConn);
    await expect(getHAConnection()).resolves.toBe(parentConn);
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });

  it("never starts a login redirect inside the frame when nothing is saved", async () => {
    embedIn(undefined);
    await expect(getHAConnection()).rejects.toBeInstanceOf(NeedsLoginError);
    expect(mocks.getAuth).not.toHaveBeenCalled();
  });

  it("uses saved tokens when the parent connection isn't reachable", async () => {
    embedIn(undefined);
    localStorage.setItem("hassUrl", window.location.origin);
    localStorage.setItem("hassTokens", JSON.stringify({ access_token: "abc", refresh_token: "r" }));
    const connection = { addEventListener: vi.fn() };
    mocks.createConnection.mockResolvedValueOnce(connection);
    await expect(getHAConnection()).resolves.toBe(connection);
    expect(mocks.getAuth).toHaveBeenCalledTimes(1);
  });
});
