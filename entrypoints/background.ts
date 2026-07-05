import { defineBackground } from "wxt/utils/define-background";

const STORAGE_KEY = "reshell.config";
const DEFAULT_URL = chrome.runtime.getURL("/reshell/index.html");

function isConfigUrl(url: string): boolean {
  return /\.json(?:[?#]|$)/.test(url) || /github\.com|raw\.githubusercontent\.com|gist\.githubusercontent\.com/.test(url);
}

export default defineBackground(() => {
  async function getReshellUrl(): Promise<string> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const url = result[STORAGE_KEY];
    return typeof url === "string" && url && !isConfigUrl(url) ? url : DEFAULT_URL;
  }

  chrome.commands.onCommand.addListener((command) => {
    if (command === "open-reshell") {
      openOrFocusReshell();
    }
  });

  chrome.runtime.onStartup.addListener(() => {
    openOrFocusReshell();
  });

  async function openOrFocusReshell() {
    const url = await getReshellUrl();
    const pattern = url.replace(/\/index\.html$/, "/*");
    const [existing] = await chrome.tabs.query({ url: pattern });
    if (existing?.id != null) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url, active: true });
    }
  }
});
