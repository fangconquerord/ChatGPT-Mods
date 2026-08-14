"use strict";

const EXPORT_DOWNLOAD_MESSAGE = "cgpt-download-chat-export";

function isAllowedExportUrl(value) {
  return (
    typeof value === "string" &&
    /^data:(?:text\/plain|application\/(?:rtf|pdf));/iu.test(value)
  );
}

function safeFilename(value) {
  const fallback = "chatgpt-chat";
  const name = String(value || fallback)
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);

  return name || fallback;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (
    message?.type !== EXPORT_DOWNLOAD_MESSAGE ||
    sender.id !== chrome.runtime.id ||
    !isAllowedExportUrl(message.url)
  ) {
    return undefined;
  }

  chrome.downloads.download(
    {
      url: message.url,
      filename: safeFilename(message.filename),
      saveAs: true,
      conflictAction: "uniquify",
    },
    (downloadId) => {
      const error = chrome.runtime.lastError;
      if (error) {
        sendResponse({ ok: false, error: error.message });
        return;
      }

      sendResponse({ ok: true, downloadId });
    },
  );

  return true;
});
