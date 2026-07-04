const STORAGE_KEY = "reshell.config";
const DEFAULT_URL = "http://localhost:3000";

async function getReshellUrl(): Promise<string> {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  return result[STORAGE_KEY] ?? DEFAULT_URL;
}

getReshellUrl().then((url) => {
  const frame = document.getElementById("reshell-frame") as HTMLIFrameElement;
  frame.src = url;

  frame.addEventListener("load", () => {
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
});

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