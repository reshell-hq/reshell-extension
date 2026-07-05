import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Reshell",
    description: "Your productivity shell — bookmarks, workspaces, and command bar on every new tab.",
    version: "0.1.0",
    permissions: ["tabs", "bookmarks", "storage"],
    host_permissions: ["*://raw.githubusercontent.com/*", "*://gist.githubusercontent.com/*"],
    chrome_url_overrides: {
      newtab: "newtab.html",
    },
    commands: {
      "open-reshell": {
        suggested_key: {
          default: "Ctrl+Shift+K",
          mac: "Command+Shift+K",
        },
        description: "Open or focus Reshell",
      },
    },
    action: {
      default_popup: "popup.html",
      default_title: "Reshell",
    },
  },
});