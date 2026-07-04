const STORAGE_KEY = "reshell.config";
const SESSIONS_KEY = "reshell.sessions.v1";
const DEFAULT_URL = "http://localhost:3000";

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

let currentTab = "tabs";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function getReshellUrl(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? DEFAULT_URL;
}

async function getSessions(): Promise<Session[]> {
  const result = await chrome.storage.local.get(SESSIONS_KEY);
  return result[SESSIONS_KEY] ?? [];
}

async function saveSessions(sessions: Session[]): Promise<void> {
  await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
}

async function loadTabs() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const reshellUrl = await getReshellUrl();
  const otherTabs = tabs.filter((t) => t.id != null && t.url != null && !t.url.startsWith(reshellUrl));

  const list = document.getElementById("tabs-list")!;
  if (otherTabs.length === 0) {
    list.innerHTML = '<div class="empty">No other tabs open</div>';
    return;
  }

  list.innerHTML = otherTabs
    .map(
      (t) => `
    <div class="tab-row">
      <input type="checkbox" value="${t.id}" data-tab-check />
      ${t.favIconUrl ? `<img src="${t.favIconUrl}" alt="" onerror="this.style.display='none'" />` : ""}
      <span class="title" title="${escapeHtml(t.title ?? t.url!)}">${escapeHtml(t.title ?? t.url!)}</span>
    </div>`,
    )
    .join("");

  updateCollapseButton();
}

async function loadSessions() {
  const sessions = await getSessions();
  const list = document.getElementById("sessions-list")!;

  if (sessions.length === 0) {
    list.innerHTML = '<div class="empty">No saved sessions</div>';
    return;
  }

  list.innerHTML = sessions
    .map(
      (s) => `
    <div class="session-row">
      <div class="session-info">
        <div class="session-name">${escapeHtml(s.name)}</div>
        <div class="session-meta">${s.tabs.length} tab${s.tabs.length !== 1 ? "s" : ""} · ${formatDate(s.createdAt)}</div>
      </div>
      <div class="session-actions">
        <button data-restore="${s.id}" title="Restore tabs">Open</button>
        <button data-delete="${s.id}" title="Delete session" style="color:var(--danger)">Del</button>
      </div>
    </div>`,
    )
    .join("");
}

function updateCollapseButton() {
  const checked = document.querySelectorAll<HTMLInputElement>("[data-tab-check]:checked");
  const btn = document.getElementById("btn-collapse") as HTMLButtonElement;
  btn.disabled = checked.length === 0;
  btn.textContent = checked.length === 0 ? "Collapse Selected" : `Collapse ${checked.length} Selected`;
}

async function collapseSelected() {
  const checked = document.querySelectorAll<HTMLInputElement>("[data-tab-check]:checked");
  const tabIds = Array.from(checked).map((c) => parseInt(c.value));
  if (tabIds.length === 0) return;

  const tabs = await Promise.all(tabIds.map((id) => chrome.tabs.get(id)));
  const validTabs = tabs.filter((t) => t.url != null);

  const sessionTabs: SessionTab[] = validTabs.map((t) => ({
    url: t.url!,
    title: t.title ?? t.url!,
    favIconUrl: t.favIconUrl,
  }));

  const name = validTabs.length === 1 ? (validTabs[0].title ?? "Untitled") : `${validTabs.length} tabs`;

  const sessions = await getSessions();
  sessions.unshift({ id: generateId(), name, tabs: sessionTabs, createdAt: Date.now() });
  await saveSessions(sessions);

  const idsToClose = validTabs.map((t) => t.id).filter((id): id is number => id != null);
  if (idsToClose.length > 0) {
    await chrome.tabs.remove(idsToClose);
  }

  await loadTabs();
  switchTab("sessions");
}

async function collapseAll() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const reshellUrl = await getReshellUrl();
  const otherTabs = tabs.filter((t) => t.id != null && t.url != null && !t.url.startsWith(reshellUrl));
  if (otherTabs.length === 0) return;

  const sessionTabs: SessionTab[] = otherTabs.map((t) => ({
    url: t.url!,
    title: t.title ?? t.url!,
    favIconUrl: t.favIconUrl,
  }));

  const sessions = await getSessions();
  sessions.unshift({ id: generateId(), name: `${otherTabs.length} tabs`, tabs: sessionTabs, createdAt: Date.now() });
  await saveSessions(sessions);

  const idsToClose = otherTabs.map((t) => t.id).filter((id): id is number => id != null);
  if (idsToClose.length > 0) {
    await chrome.tabs.remove(idsToClose);
  }

  await loadTabs();
  switchTab("sessions");
}

async function restoreSession(sessionId: string) {
  const sessions = await getSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return;
  for (const tab of session.tabs) {
    chrome.tabs.create({ url: tab.url, active: false });
  }
  window.close();
}

async function deleteSession(sessionId: string) {
  const sessions = await getSessions();
  await saveSessions(sessions.filter((s) => s.id !== sessionId));
  await loadSessions();
}

async function loadSettings() {
  const url = await getReshellUrl();
  (document.getElementById("reshell-url") as HTMLInputElement).value = url;
}

async function saveSettings() {
  const url = (document.getElementById("reshell-url") as HTMLInputElement).value.trim();
  if (!url) return;
  await chrome.storage.local.set({ [STORAGE_KEY]: url });
  window.close();
}

function switchTab(tab: string) {
  currentTab = tab;
  document.querySelectorAll("nav button").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-tab") === tab);
  });
  document.querySelectorAll("section").forEach((s) => {
    s.classList.toggle("active", s.id === tab);
  });
  if (tab === "tabs") loadTabs();
  if (tab === "sessions") loadSessions();
  if (tab === "settings") loadSettings();
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

document.querySelectorAll("nav button").forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.getAttribute("data-tab")!));
});

document.getElementById("tabs-list")!.addEventListener("change", (e) => {
  if ((e.target as HTMLElement).hasAttribute("data-tab-check")) {
    updateCollapseButton();
  }
});

document.getElementById("btn-collapse")!.addEventListener("click", collapseSelected);
document.getElementById("btn-collapse-all")!.addEventListener("click", collapseAll);

document.getElementById("sessions-list")!.addEventListener("click", (e) => {
  const btn = e.target as HTMLElement;
  const restoreId = btn.getAttribute("data-restore");
  const deleteId = btn.getAttribute("data-delete");
  if (restoreId) restoreSession(restoreId);
  if (deleteId) deleteSession(deleteId);
});

document.getElementById("btn-save-url")!.addEventListener("click", saveSettings);

switchTab("tabs");