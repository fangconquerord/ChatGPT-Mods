(async () => {
  "use strict";

  const BOOT_KEY = "__cgptChatExporterLite__";
  const FEATURE_KEY = "chatExport";
  const BUTTON_ID = "cgpt-chat-export-btn";
  const MENU_ID = "cgpt-chat-export-menu";
  const STYLE_ID = "cgpt-chat-export-lite-style";
  const DOWNLOAD_MESSAGE = "cgpt-download-chat-export";
  const PASSIVE = { passive: true };

  if (window !== window.top) return;
  if (globalThis[BOOT_KEY]) return;
  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) return;

  const state = { menu: null };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{position:fixed;top:10px;right:96px;z-index:2147483000;display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:999px;background:var(--main-surface-primary,#fff);color:var(--text-primary,inherit);font:500 12px/1 system-ui,sans-serif;cursor:pointer}
      #${MENU_ID}{position:fixed;top:50px;right:12px;z-index:2147483001;width:230px;padding:6px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;background:var(--main-surface-primary,#fff);box-shadow:0 12px 30px rgba(0,0,0,.16)}
      #${MENU_ID} button{display:block;width:100%;min-height:40px;padding:8px 10px;border:0;border-radius:8px;background:transparent;color:inherit;text-align:left;cursor:pointer}
      #${MENU_ID} button:hover{background:color-mix(in srgb,currentColor 8%,transparent)}
      html.cgpt-split-active #${BUTTON_ID},html.cgpt-split-active #${MENU_ID}{display:none!important}
    `;
    document.documentElement.appendChild(style);
  }

  function normalizeText(value) {
    return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function messageNodes() {
    return Array.from(document.querySelectorAll("[data-message-author-role]"))
      .filter((node) => {
        const role = node.getAttribute("data-message-author-role");
        return role === "user" || role === "assistant";
      });
  }

  function collectPlainText() {
    const lines = [];
    for (const node of messageNodes()) {
      const role = node.getAttribute("data-message-author-role") === "user" ? "用户" : "ChatGPT";
      const clone = node.cloneNode(true);
      clone.querySelectorAll("button,[role='button'],[data-cgpt-ts],[data-cgpt-ts-row],script,style,noscript").forEach((item) => item.remove());
      const text = normalizeText(clone.textContent);
      if (text) lines.push(`${role}\n${text}`);
    }
    return lines.join("\n\n");
  }

  function chatTitle() {
    return normalizeText(document.querySelector("main h1")?.textContent) ||
      normalizeText(document.title.replace(/\s*[|–—-]\s*ChatGPT\s*$/u, "")) ||
      "ChatGPT 聊天";
  }

  function safeFilename(value) {
    return String(value || "chatgpt-chat")
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100) || "chatgpt-chat";
  }

  function timestamp() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  }

  function toDataUrl(mime, text) {
    return `data:${mime};charset=utf-8,${encodeURIComponent(text)}`;
  }

  function sendDownload(filename, mime, text) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { type: DOWNLOAD_MESSAGE, filename, url: toDataUrl(mime, text) },
        (response) => {
          const error = chrome.runtime.lastError;
          if (error || !response?.ok) reject(new Error(error?.message || response?.error || "下载失败"));
          else resolve(response);
        },
      );
    });
  }

  function escapeRtf(text) {
    return String(text).replace(/\\/g, "\\\\").replace(/[{}]/g, "\\$&").replace(/\n/g, "\\par\n").replace(/[^\x00-\x7F]/g, (char) => {
      const code = char.charCodeAt(0);
      return `\\u${code > 32767 ? code - 65536 : code}?`;
    });
  }

  function buildRtf(text) {
    return `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Segoe UI;}}\\fs22\n${escapeRtf(text)}\n}`;
  }

  function printableHtml() {
    const title = chatTitle();
    const sections = messageNodes().map((node) => {
      const role = node.getAttribute("data-message-author-role") === "user" ? "用户" : "ChatGPT";
      const clone = node.cloneNode(true);
      clone.querySelectorAll("button,[role='button'],[data-cgpt-ts],[data-cgpt-ts-row],script,style,noscript,iframe").forEach((item) => item.remove());
      return `<section><h2>${role}</h2>${clone.innerHTML}</section>`;
    }).join("\n");
    return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>body{font:14px/1.55 system-ui,sans-serif;max-width:900px;margin:32px auto;padding:0 24px;color:#111}section{margin:0 0 28px}h2{font-size:13px;color:#666}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f5f5f5;padding:12px;border-radius:8px}img{max-width:100%;height:auto}</style></head><body><h1>${title}</h1>${sections}</body></html>`;
  }

  function openPrintDialog() {
    const win = window.open("about:blank", "_blank");
    if (!win) throw new Error("浏览器阻止了打印窗口");
    win.document.open();
    win.document.write(printableHtml());
    win.document.close();
    win.addEventListener("load", () => win.print(), { once: true });
    window.setTimeout(() => { try { win.print(); } catch (_error) {} }, 250);
  }

  function closeMenu() {
    state.menu?.remove();
    state.menu = null;
  }

  async function runAction(type) {
    closeMenu();
    const title = safeFilename(`${chatTitle()} ${timestamp()}`);
    if (type === "print" || type === "pdf") {
      openPrintDialog();
      return;
    }
    const text = collectPlainText();
    if (!text) throw new Error("未找到当前聊天消息");
    if (type === "word") {
      await sendDownload(`${title}.rtf`, "application/rtf", buildRtf(text));
      return;
    }
    await sendDownload(`${title}.txt`, "text/plain", `\ufeff${text}\n`);
  }

  function menuButton(label, type) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", () => void runAction(type).catch((error) => window.alert(error.message || "导出失败")));
    return button;
  }

  function openMenu() {
    if (state.menu) return closeMenu();
    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.append(
      menuButton("打印", "print"),
      menuButton("PDF（通过打印窗口另存）", "pdf"),
      menuButton("Word (.rtf)", "word"),
      menuButton("TXT", "txt"),
    );
    document.body.appendChild(menu);
    state.menu = menu;
  }

  function ensureButton() {
    ensureStyle();
    if (document.getElementById(BUTTON_ID) || !document.body) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "保存";
    button.setAttribute("aria-label", "保存当前聊天");
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu();
    });
    document.body.appendChild(button);
  }

  document.addEventListener("pointerdown", (event) => {
    if (!state.menu) return;
    if (state.menu.contains(event.target) || event.target.closest?.(`#${BUTTON_ID}`)) return;
    closeMenu();
  }, true);
  window.addEventListener("pageshow", ensureButton, PASSIVE);
  window.addEventListener("popstate", ensureButton, PASSIVE);
  window.addEventListener("hashchange", ensureButton, PASSIVE);

  globalThis[BOOT_KEY] = { ensureButton };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureButton, { once: true });
  else ensureButton();
})();
