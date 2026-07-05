const STORAGE_KEY = "reshell.config";
const SESSIONS_KEY = "reshell.sessions.v1";
const CONFIG_OVERRIDE_KEY = "reshell.configOverride";
const DEFAULT_URL = chrome.runtime.getURL("/reshell/index.html");

interface SessionTab {
  url: string;
  title: string;
  favIconUrl?: string;
}

interface Session {
  id: string;
  name: string;
  tabs: SessionTab[];
  createdAt: number;
}

async function getReshellUrl(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const url = result[STORAGE_KEY];
  return typeof url === "string" && url && !isConfigUrl(url) ? url : DEFAULT_URL;
}

function isConfigUrl(url: string): boolean {
  return /\.json(?:[?#]|$)/.test(url) || /github\.com|raw\.githubusercontent\.com|gist\.githubusercontent\.com/.test(url);
}

function parseConfig(raw: unknown): unknown {
  if (typeof raw !== "string") return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function createBrowserProvider() {
  async function getSessions(): Promise<Session[]> {
    const result = await chrome.storage.local.get(SESSIONS_KEY);
    return result[SESSIONS_KEY] ?? [];
  }

  async function saveSessions(sessions: Session[]): Promise<void> {
    await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
  }

  function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  return {
    async getTabs() {
      const tabs = await chrome.tabs.query({ currentWindow: true });
      return tabs
        .filter((t) => t.id != null && t.url != null)
        .map((t) => ({
          id: t.id!,
          url: t.url!,
          title: t.title ?? t.url!,
          favIconUrl: t.favIconUrl,
        }));
    },

    async getBookmarks() {
      try {
        return await chrome.bookmarks.getTree();
      } catch {
        return [];
      }
    },

    openUrl(url: string) {
      chrome.tabs.create({ url, active: true });
    },

    async collapseTabs(tabIds: number[]) {
      if (tabIds.length === 0) {
        return { id: "", name: "", tabs: [], createdAt: 0 };
      }
      const tabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id)));
      const validTabs = tabs.filter((t) => t.url != null);

      const sessionTabs: SessionTab[] = validTabs.map((t) => ({
        url: t.url!,
        title: t.title ?? t.url!,
        favIconUrl: t.favIconUrl,
      }));

      const name =
        validTabs.length === 1
          ? validTabs[0].title ?? "Untitled"
          : `${validTabs.length} tabs`;

      const sessions = await getSessions();
      const session: Session = {
        id: generateId(),
        name,
        tabs: sessionTabs,
        createdAt: Date.now(),
      };
      sessions.unshift(session);
      await saveSessions(sessions);

      const idsToClose = validTabs
        .map((t) => t.id)
        .filter((id): id is number => id != null);
      if (idsToClose.length > 0) {
        await chrome.tabs.remove(idsToClose);
      }

      return session;
    },

    getSessions,

    async restoreSession(sessionId: string) {
      const sessions = await getSessions();
      const session = sessions.find((s) => s.id === sessionId);
      if (!session) return;
      for (const tab of session.tabs) {
        chrome.tabs.create({ url: tab.url, active: false });
      }
    },

    async deleteSession(sessionId: string) {
      const sessions = await getSessions();
      await saveSessions(sessions.filter((s) => s.id !== sessionId));
    },
  };
}

async function init() {
  const url = await getReshellUrl();

  const storage = await chrome.storage.local.get(CONFIG_OVERRIDE_KEY);
  let configOverride = parseConfig(storage[CONFIG_OVERRIDE_KEY]);

  const frame = document.getElementById("reshell-frame") as HTMLIFrameElement;

  function postConfig() {
    if (frame.contentWindow) {
      frame.contentWindow.postMessage({ type: "RESHELL_CONFIG", config: configOverride }, "*");
    }
  }

  // postMessage works regardless of same/cross-origin and doesn't race the
  // iframe's load — the child asks for config on its own mount, we answer
  // whenever that request arrives (ADR-0011 follow-up).
  window.addEventListener("message", (event) => {
    const data = event.data as { type?: string } | null;
    if (data && data.type === "RESHELL_REQUEST_CONFIG") {
      postConfig();
    }
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[CONFIG_OVERRIDE_KEY]) {
      configOverride = parseConfig(changes[CONFIG_OVERRIDE_KEY].newValue);
      postConfig();
    }
  });

  frame.addEventListener("load", () => {
    try {
      if (frame.contentWindow) {
        (frame.contentWindow as Record<string, unknown>).__RESHELL_BROWSER__ =
          createBrowserProvider();
      }
    } catch {
      /* cross-origin may block */
    }

    const attemptFocus = () => {
      try {
        if (frame.contentWindow) {
          frame.contentWindow.focus();
        }
      } catch {
        /* cross-origin may block */
      }
    };

    attemptFocus();
    setTimeout(attemptFocus, 50);
    setTimeout(attemptFocus, 200);
    setTimeout(attemptFocus, 500);
  });

  frame.src = url;
}

init();

document.addEventListener("DOMContentLoaded", () => {
  document.body.focus();
});

document.body.addEventListener("click", () => {
  const frame = document.getElementById("reshell-frame") as HTMLIFrameElement;
  try {
    if (frame.contentWindow) {
      frame.contentWindow.focus();
    }
  } catch {
    /* ignore */
  }
});

export {};
