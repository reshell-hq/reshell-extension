const STORAGE_KEY = "reshell.config";
const SESSIONS_KEY = "reshell.sessions.v1";
const CONFIG_OVERRIDE_KEY = "reshell.configOverride";
const CONFIG_SOURCE_KEY = "reshell.configSource";
const DEFAULT_URL = "";

type ConfigSource = "none" | "paste" | "upload" | "fetch";

let currentConfigSource: ConfigSource = "none";

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
  const url = result[STORAGE_KEY];
  return typeof url === "string" && url && !isConfigUrl(url) ? url : "";
}

function isConfigUrl(url: string): boolean {
  return /\.json(?:[?#]|$)/.test(url) || /github\.com|raw\.githubusercontent\.com|gist\.githubusercontent\.com/.test(url);
}

function normalizeConfigUrl(url: string): string {
  const blob = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/);
  if (blob) {
    const [, owner, repo, branch, path] = blob;
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  }
  const repoRoot = url.match(/^https:\/\/github\.com\/([^/]+)\/([^/#?]+)\/?$/);
  if (!repoRoot) return url;
  const [, owner, repo] = repoRoot;
  return `https://raw.githubusercontent.com/${owner}/${repo}/main/reshell.config.json`;
}

function isReshellTab(url: string | undefined): boolean {
  return !!url && (url.startsWith("chrome-extension://") || url.startsWith("chrome://newtab"));
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
  const otherTabs = tabs.filter((t) => t.id != null && t.url != null && !isReshellTab(t.url));

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
  const otherTabs = tabs.filter((t) => t.id != null && t.url != null && !isReshellTab(t.url));
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
  const input = document.getElementById("reshell-url") as HTMLInputElement;
  if (url) {
    input.value = url;
    input.placeholder = "Leave empty for bundled Reshell";
  } else {
    input.value = "";
    input.placeholder = "Using bundled Reshell";
  }
}

async function saveSettings() {
  const url = (document.getElementById("reshell-url") as HTMLInputElement).value.trim();
  if (url && isConfigUrl(url)) {
    await chrome.storage.local.set({ [STORAGE_KEY]: "" });
    (document.getElementById("reshell-url") as HTMLInputElement).value = "";
    await saveFetchedConfig(url);
    return;
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: url || "" });
  await flushPendingConfig();
  window.close();
}

async function getConfigSource(): Promise<ConfigSource> {
  const result = await chrome.storage.local.get(CONFIG_SOURCE_KEY);
  return result[CONFIG_SOURCE_KEY] ?? "none";
}

async function getConfigOverride(): Promise<string | null> {
  const result = await chrome.storage.local.get(CONFIG_OVERRIDE_KEY);
  return result[CONFIG_OVERRIDE_KEY] ?? null;
}

async function saveConfigOverride(json: string): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_OVERRIDE_KEY]: json });
}

async function clearConfigOverride(): Promise<void> {
  await chrome.storage.local.remove(CONFIG_OVERRIDE_KEY);
}

async function setConfigSource(source: ConfigSource): Promise<void> {
  await chrome.storage.local.set({ [CONFIG_SOURCE_KEY]: source });
}

function showConfigStatus(message: string, type: "ok" | "error" | "loading") {
  const el = document.getElementById("config-status")!;
  el.textContent = message;
  el.className = `config-status ${type}`;
  el.style.display = "block";
}

function hideConfigStatus() {
  const el = document.getElementById("config-status")!;
  el.style.display = "none";
}

function switchConfigTab(source: ConfigSource) {
  currentConfigSource = source;
  document.querySelectorAll("[data-config-tab]").forEach((b) => {
    b.classList.toggle("active", b.getAttribute("data-config-tab") === source);
  });
  document.getElementById("config-paste")!.style.display = source === "paste" ? "block" : "none";
  document.getElementById("config-upload")!.style.display = source === "upload" ? "block" : "none";
  document.getElementById("config-fetch")!.style.display = source === "fetch" ? "block" : "none";
  hideConfigStatus();
}

async function savePastedConfig() {
  const textarea = document.getElementById("config-textarea") as HTMLTextAreaElement;
  const raw = textarea.value.trim();
  if (!raw) {
    await clearConfigOverride();
    await setConfigSource("none");
    switchConfigTab("none");
    return;
  }
  try {
    JSON.parse(raw);
    await saveConfigOverride(raw);
    await setConfigSource("paste");
    showConfigStatus("Config saved", "ok");
  } catch {
    showConfigStatus("Invalid JSON", "error");
  }
}

let pasteDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function onPasteInput() {
  if (pasteDebounceTimer) clearTimeout(pasteDebounceTimer);
  pasteDebounceTimer = setTimeout(savePastedConfig, 500);
}

/** Save button must not close the popup before a debounced paste save lands. */
async function flushPendingConfig(): Promise<void> {
  if (pasteDebounceTimer) {
    clearTimeout(pasteDebounceTimer);
    pasteDebounceTimer = null;
    if (currentConfigSource === "paste") {
      await savePastedConfig();
    }
  }
}

async function handleFileUpload() {
  const input = document.getElementById("config-file") as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    JSON.parse(text);
    await saveConfigOverride(text);
    await setConfigSource("upload");
    showConfigStatus(`Loaded: ${file.name}`, "ok");
  } catch {
    showConfigStatus("Invalid JSON file", "error");
  }
}

async function handleFetchConfig() {
  const urlInput = document.getElementById("config-url") as HTMLInputElement;
  const url = urlInput.value.trim();
  if (!url) return;

  await saveFetchedConfig(url);
}

async function saveFetchedConfig(url: string) {
  showConfigStatus("Fetching...", "loading");
  try {
    const res = await fetch(normalizeConfigUrl(url));
    if (!res.ok) {
      showConfigStatus(`Fetch failed: ${res.status} ${res.statusText}`, "error");
      return;
    }
    const text = await res.text();
    JSON.parse(text);
    await saveConfigOverride(text);
    await setConfigSource("fetch");
    showConfigStatus("Config fetched & saved", "ok");
  } catch (err) {
    showConfigStatus(`Fetch failed: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
}

async function loadConfigSettings() {
  const source = await getConfigSource();
  switchConfigTab(source);

  if (source === "paste") {
    const json = await getConfigOverride();
    if (json) {
      (document.getElementById("config-textarea") as HTMLTextAreaElement).value = json;
    }
  }
  if (source === "fetch") {
    const json = await getConfigOverride();
    if (json) {
      showConfigStatus("Config loaded", "ok");
    }
  }
  if (source === "upload") {
    const json = await getConfigOverride();
    if (json) {
      showConfigStatus("Config loaded", "ok");
    }
  }
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
  if (tab === "settings") { loadSettings(); loadConfigSettings(); }
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

document.querySelectorAll("[data-config-tab]").forEach((btn) => {
  btn.addEventListener("click", () => switchConfigTab(btn.getAttribute("data-config-tab") as ConfigSource));
});

document.getElementById("config-textarea")!.addEventListener("input", onPasteInput);

document.getElementById("config-file")!.addEventListener("change", handleFileUpload);

document.getElementById("btn-fetch-config")!.addEventListener("click", handleFetchConfig);

// Extension popups can lose focus and close at any time (click outside,
// Escape, etc.) — not just via the Save button. Flush any pending debounced
// paste-save before the JS context dies, or the config is silently lost.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPendingConfig();
});
window.addEventListener("pagehide", () => flushPendingConfig());

switchTab("tabs");
