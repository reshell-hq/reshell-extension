import { defineBackground } from "wxt/utils/define-background";

const RESHELL_URL = chrome.runtime.getURL("/reshell.html");

export default defineBackground(() => {
  chrome.commands.onCommand.addListener((command) => {
    if (command === "open-reshell") {
      openOrFocusReshell();
    }
  });

  async function openOrFocusReshell() {
    const [existing] = await chrome.tabs.query({ url: RESHELL_URL });
    if (existing?.id != null) {
      await chrome.tabs.update(existing.id, { active: true });
      await chrome.windows.update(existing.windowId, { focused: true });
    } else {
      await chrome.tabs.create({ url: RESHELL_URL, active: true });
    }
  }
});
