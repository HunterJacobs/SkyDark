/**
 * Home Assistant WebSocket connection for the SkyDark panel.
 *
 * Strategy (in order):
 *  1. Reuse the live connection of the Home Assistant window the panel is
 *     embedded in (same-origin iframe). This needs no login and works whether
 *     or not the user ticked "Keep me logged in".
 *  2. Use tokens Home Assistant saved in localStorage.
 *  3. Only when opened directly (not inside Home Assistant): the normal login
 *     redirect. Inside the iframe that redirect fails with "invalid redirect
 *     URI", so it is never attempted there.
 * When VITE_STANDALONE is set, uses the local standalone API (no HA).
 */

import type { Connection } from "home-assistant-js-websocket";

const STANDALONE = import.meta.env.VITE_STANDALONE === "true";

/** Fake connection for standalone mode: POST /api/ws and resolve with result. */
function createStandaloneConnection(): Connection {
  let messageId = 1;
  return {
    sendMessagePromise<T>(msg: Record<string, unknown>): Promise<T> {
      const id = msg.id ?? messageId++;
      const body = { ...msg, id };
      return fetch("/api/ws", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((r) => r.json())
        .then((res) => {
          if (res.success !== false && res.result !== undefined) return res.result as T;
          throw new Error((res.error && res.error.message) || "Request failed");
        });
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  } as unknown as Connection;
}

let connectionPromise: Promise<Connection> | null = null;

/** The parent Home Assistant window's live connection, if the panel is embedded in it. */
export function getParentConnection(): Connection | null {
  try {
    if (window.parent === window) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ha = (window.parent as any)?.document?.querySelector("home-assistant");
    const conn: Connection | undefined = ha?.hass?.connection;
    return conn && typeof conn.sendMessagePromise === "function" ? conn : null;
  } catch {
    // Cross-origin parent or sandboxed frame.
    return null;
  }
}

function isEmbedded(): boolean {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

/** Raised when the panel can't reuse or find a Home Assistant login. */
export class NeedsLoginError extends Error {
  constructor() {
    super("Couldn't connect to Home Assistant. Reload the page, or sign in to Home Assistant again.");
    this.name = "NeedsLoginError";
  }
}

if (STANDALONE) {
  connectionPromise = Promise.resolve(createStandaloneConnection());
}

/**
 * Get or create the single HA WebSocket connection (or standalone API connection).
 */
export async function getHAConnection(): Promise<Connection> {
  if (connectionPromise) return connectionPromise;

  const parent = getParentConnection();
  if (parent) {
    connectionPromise = Promise.resolve(parent);
    return connectionPromise;
  }

  const {
    createConnection,
    getAuth,
    ERR_HASS_HOST_REQUIRED,
    ERR_INVALID_AUTH,
  } = await import("home-assistant-js-websocket");

  const HASS_URL_KEY = "hassUrl";
  const HASS_TOKENS_KEY = "hassTokens";

  function getHassUrl(): string {
    return window.location.origin;
  }

  interface AuthDataLike {
    hassUrl: string;
    clientId: string | null;
    expires: number;
    refresh_token: string;
    access_token: string;
    expires_in: number;
  }

  async function loadStoredTokens(): Promise<AuthDataLike | null | undefined> {
    try {
      const url = localStorage.getItem(HASS_URL_KEY);
      const tokens = localStorage.getItem(HASS_TOKENS_KEY);
      if (url && tokens) {
        const parsed = JSON.parse(tokens) as Record<string, unknown>;
        if (parsed && typeof parsed.access_token === "string") {
          return {
            hassUrl: url,
            clientId: (parsed.clientId as string | null | undefined) ?? null,
            expires: typeof parsed.expires === "number" ? parsed.expires : 0,
            refresh_token: (parsed.refresh_token as string | undefined) ?? "",
            access_token: parsed.access_token,
            expires_in: typeof parsed.expires_in === "number" ? parsed.expires_in : 0,
          };
        }
      }
    } catch {
      // ignore
    }
    return undefined;
  }

  function saveTokens(data: AuthDataLike | null): void {
    try {
      if (data) {
        localStorage.setItem(HASS_URL_KEY, data.hassUrl);
        localStorage.setItem(HASS_TOKENS_KEY, JSON.stringify(data));
      } else {
        localStorage.removeItem(HASS_URL_KEY);
        localStorage.removeItem(HASS_TOKENS_KEY);
      }
    } catch {
      // ignore
    }
  }

  connectionPromise = (async () => {
    const hassUrl = getHassUrl();
    const embedded = isEmbedded();
    // With no saved tokens, getAuth goes straight to the login redirect, which
    // Home Assistant rejects inside its own frame.
    if (embedded && !(await loadStoredTokens())) throw new NeedsLoginError();
    const auth = await getAuth({
      hassUrl,
      loadTokens: loadStoredTokens,
      saveTokens,
    }).catch((err) => {
      if (err === ERR_HASS_HOST_REQUIRED || err === ERR_INVALID_AUTH) {
        // Starting a login inside Home Assistant's frame is rejected by HA.
        if (embedded) throw new NeedsLoginError();
        return getAuth({ hassUrl });
      }
      throw err;
    });
    const conn = await createConnection({ auth });
    conn.addEventListener("ready", () => {
      console.debug("[SkyDark] HA WebSocket connected");
    });
    conn.addEventListener("disconnected", () => {
      console.debug("[SkyDark] HA WebSocket disconnected");
    });
    return conn;
  })().catch((error) => {
    connectionPromise = null;
    throw error;
  });

  return connectionPromise;
}

/**
 * Reset the cached connection (e.g. after auth failure or logout).
 */
export function clearHAConnection(): void {
  connectionPromise = null;
}
