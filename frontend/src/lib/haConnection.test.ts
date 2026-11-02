import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ createConnection: vi.fn(), getAuth: vi.fn() }));
vi.mock("home-assistant-js-websocket", () => ({ ...mocks, ERR_HASS_HOST_REQUIRED: 1, ERR_INVALID_AUTH: 2 }));
import { clearHAConnection, getHAConnection } from "./haConnection";
beforeEach(() => { clearHAConnection(); vi.clearAllMocks(); mocks.getAuth.mockResolvedValue({}); });
describe("connection recovery", () => {
  it("retries a failed connection instead of keeping the rejected promise", async () => {
    const connection = { addEventListener: vi.fn() };
    mocks.createConnection.mockRejectedValueOnce(new Error("Offline")).mockResolvedValueOnce(connection);
    await expect(getHAConnection()).rejects.toThrow("Offline");
    await expect(getHAConnection()).resolves.toBe(connection);
    expect(mocks.createConnection).toHaveBeenCalledTimes(2);
  });
});
