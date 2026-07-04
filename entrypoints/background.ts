import { defineBackground } from "wxt/utils/define-background";

const STORAGE_KEY = "reshell.config";
const DEFAULT_URL = "http://localhost:3000";

export default defineBackground(() => {
  async function getReshellUrl(): Promise<string> {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] ?? DEFAULT_URL;
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
    const [existing] = await chrome.tabs.query({ url: `${url}*` });
    if (existing?.id != null) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url, active: true });
    }
  }
});