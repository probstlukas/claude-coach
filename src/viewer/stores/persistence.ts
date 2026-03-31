/**
 * Persistence layer that uses the serve API when available,
 * falling back to localStorage for static HTML files.
 */

interface BackupState {
  completed: Record<string, boolean>;
  changes: {
    moved: Record<string, string>;
    edited: Record<string, unknown>;
    deleted: string[];
    added: Record<string, unknown>;
  };
  settings: Record<string, unknown>;
  savedAt: string;
}

let serverAvailable: boolean | null = null;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const API_BASE = `${window.location.origin}/api`;

async function checkServer(): Promise<boolean> {
  if (serverAvailable !== null) return serverAvailable;

  try {
    const res = await fetch(`${API_BASE}/state`, { method: "GET" });
    serverAvailable = res.status === 200 || res.status === 204;
  } catch {
    serverAvailable = false;
  }
  return serverAvailable;
}

export function isServerMode(): boolean {
  return serverAvailable === true;
}

/**
 * Load state from server backup (if available).
 * Returns null if no backup exists or server is not available.
 */
export async function loadServerState(): Promise<BackupState | null> {
  const available = await checkServer();
  if (!available) return null;

  try {
    const res = await fetch(`${API_BASE}/state`);
    if (res.status === 204) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Save state to server (debounced to avoid excessive writes).
 * Also saves to localStorage as a fallback.
 */
export function saveToServer(state: BackupState): void {
  if (!serverAvailable) return;

  if (debounceTimer) clearTimeout(debounceTimer);

  debounceTimer = setTimeout(async () => {
    try {
      await fetch(`${API_BASE}/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
    } catch {
      // Silently fail — localStorage is the fallback
    }
  }, 500);
}

/**
 * Initialize persistence: check for server, load backup if available.
 */
export async function initPersistence(): Promise<BackupState | null> {
  return loadServerState();
}
