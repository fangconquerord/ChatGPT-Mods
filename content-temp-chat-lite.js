(async () => {
  "use strict";

  const BOOT_KEY = "__cgptTempChatLite__";
  const FEATURE_KEY = "tempChat";
  const BUTTON_ID = "cgpt-temp-save-btn";
  const STYLE_ID = "cgpt-temp-chat-lite-style";
  const TRANSFER_KEY = "cgpt_nav_transfer_payload";
  const HASH_PREFIX = "#cgpt-transfer=";
  const PASSIVE = { passive: true };

  if (window !== window.top) return;
  if (globalThis[BOOT_KEY]) return;
  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) return;

  let retryTimers = [];

  function storageSet(key, value) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, () => resolve());
    });
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => resolve(result?.[key] || null));
    });
  }

  function storageRemove(key) {
    return new Promise((resolve) => chrome.storage.local.remove([key], () => resolve()));
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{position:fixed;top:10px;right:168px;z-index:2147482990;display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:999px;background:var(--main-surface-primary,#fff);color:var(--text-primary,inherit);font:500 12px/1 system-ui,sans-serif;cursor:pointer}
      html.cgpt-split-active #${BUTTON_ID}{display:none!important}
    `;
    document.documentElement.appendChild(style);
  }

  function normalize(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function isTemporaryChat() {
    const direct = document.querySelector('[data-testid="temporary-chat-badge"]');
    if (direct) return true;
    const roots = [document.querySelector("header"), document.querySelector("main")?.firstElementChild].filter(Boolean);
    for (const root of roots) {
      for (const element of [root, ...root.querySelectorAll("button,[role='button'],span,div")]) {
        const text = normalize(element.textContent);
        const label = normalize(element.getAttribute?.("aria-label"));
        if (text.length <= 24 && /^(temporary(?: chat)?|临时(?:聊天)?|暂时(?:聊天)?|временный(?: чат)?)$/iu.test(text || label)) return true;
      }
    }
    return false;
  }

  function collectTranscript() {
    const chunks = [];
    document.querySelectorAll("[data-message-author-role]").forEach((node) => {
      const role = node.getAttribute("data-message-author-role");
      if (role !== "user" && role !== "assistant") return;
      const clone = node.cloneNode(true);
      clone.querySelectorAll("button,[role='button'],[data-cgpt-ts],[data-cgpt-ts-row],script,style,noscript").forEach((item) => item.remove());
      const text = String(clone.textContent || "").replace(/\u00a0/g, " ").replace(/\n{3,}/g, "\n\n").trim();
      if (text) chunks.push(`${role === "user" ? "用户" : "ChatGPT"}：\n${text}`);
    });
    return chunks.join("\n\n");
  }

  function resolveComposer() {
    const root = document.querySelector("#prompt-textarea");
    if (root) {
      if (root.matches("textarea,[contenteditable='true']")) return root;
      const nested = root.querySelector("textarea,[contenteditable='true']");
      if (nested) return nested;
    }
    return document.querySelector("textarea[placeholder]") || document.querySelector("[contenteditable='true'][role='textbox']");
  }

  function setComposerText(composer, text) {
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const proto = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(composer, text);
      else composer.value = text;
    } else {
      composer.textContent = text;
    }
    try { composer.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" })); }
    catch (_error) { composer.dispatchEvent(new Event("input", { bubbles: true })); }
  }

  function tokenFromHash() {
    return location.hash.startsWith(HASH_PREFIX) ? location.hash.slice(HASH_PREFIX.length) : "";
  }

  async function injectTransfer() {
    const token = tokenFromHash();
    if (!token) return false;
    const payload = await storageGet(`${TRANSFER_KEY}:${token}`);
    if (!payload?.text || Date.now() - Number(payload.createdAt || 0) > 5 * 60 * 1000) return false;
    const composer = resolveComposer();
    if (!composer) return false;
    setComposerText(composer, payload.text);
    await storageRemove(`${TRANSFER_KEY}:${token}`);
    history.replaceState(history.state, "", location.pathname + location.search);
    return true;
  }

  async function saveTempChat() {
    const transcript = collectTranscript();
    if (!transcript) return window.alert("未找到当前临时聊天内容。");
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const prompt = `请继续以下临时聊天。以下内容仅作为此前对话上下文，不需要逐字复述：\n\n${transcript}`;
    await storageSet(`${TRANSFER_KEY}:${token}`, { text: prompt, createdAt: Date.now() });
    const win = window.open(`${location.origin}/${HASH_PREFIX}${encodeURIComponent(token)}`, "_blank");
    if (!win) window.alert("浏览器阻止了新标签页，请允许弹出窗口后重试。");
  }

  function ensureButton() {
    ensureStyle();
    const existing = document.getElementById(BUTTON_ID);
    if (!isTemporaryChat()) {
      existing?.remove();
      return;
    }
    if (existing || !document.body) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "保存临时聊天";
    button.addEventListener("click", () => void saveTempChat());
    document.body.appendChild(button);
  }

  function scheduleFiniteChecks() {
    retryTimers.forEach((timer) => clearTimeout(timer));
    retryTimers = [0, 400, 1200, 2600].map((delay) => window.setTimeout(() => {
      void injectTransfer();
      ensureButton();
    }, delay));
  }

  window.addEventListener("pageshow", scheduleFiniteChecks, PASSIVE);
  window.addEventListener("popstate", scheduleFiniteChecks, PASSIVE);
  window.addEventListener("hashchange", scheduleFiniteChecks, PASSIVE);

  globalThis[BOOT_KEY] = { ensureButton, scheduleFiniteChecks };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleFiniteChecks, { once: true });
  else scheduleFiniteChecks();
})();
