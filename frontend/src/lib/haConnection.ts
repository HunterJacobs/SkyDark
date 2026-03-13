/**
 * Home Assistant WebSocket connection for the SkyDark panel.
 * When running inside HA's iframe (same origin), tries to reuse stored auth.
 */

import {
  createConnection,
  getAuth,
  type Connection,
  ERR_HASS_HOST_REQUIRED,
  ERR_INVALID_AUTH,
} from "home-assistant-js-websocket";

const HASS_URL_KEY = "hassUrl";
const HASS_TOKENS_KEY = "hassTokens";

function getHassUrl(): string {
  return window.location.origin;
}

/** AuthData shape expected by home-assistant-js-websocket */
interface AuthDataLike {
  hassUrl: string;
  clientId: string | null;
  expires: number;
  refresh_token: string;
  access_token: string;
  expires_in: number;
}

/**
 * Try to load auth from localStorage (HA frontend may store tokens when same-origin).
 */
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

let connectionPromise: Promise<Connection> | null = null;

/**
 * Get or create the single HA WebSocket connection for the app lifecycle.
 * Uses stored tokens when in HA iframe; otherwise prompts for auth.
 */
export async function getHAConnection(): Promise<Connection> {
  if (connectionPromise) return connectionPromise;

  connectionPromise = (async () => {
    const hassUrl = getHassUrl();

    const auth = await getAuth({
      hassUrl,
      loadTokens: loadStoredTokens,
      saveTokens,
    }).catch((err) => {
      if (err === ERR_HASS_HOST_REQUIRED) {
        return getAuth({ hassUrl });
      }
      if (err === ERR_INVALID_AUTH) {
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
  })();

  return connectionPromise;
}

/**
 * Reset the cached connection (e.g. after auth failure or logout).
 */
export function clearHAConnection(): void {
  connectionPromise = null;
}
