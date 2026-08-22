(async () => {
  "use strict";

  const BOOT_KEY = "__cgptQuickNavigationTempChat__";
  const FEATURE_KEY = "tempChat";
  const TEMP_BTN_ID = "cgpt-temp-save-btn";
  const SAVE_WRAP_ID = "cgpt-save-dropdown-wrap";
  const TRANSFER_KEY = "cgpt_nav_transfer_payload";
  const TRANSFER_HASH_PREFIX = "#cgpt-transfer=";
  const TRANSFER_TTL_MS = 2 * 60 * 1000;
  const HIDE_TOOLTIP_CLASS = "cgpt-hide-temp-save-tooltip";
  const HIDDEN_TOOLTIP_ATTR = "data-cgpt-temp-tooltip-hidden";
  const PASSIVE = { passive: true };
  const TOP_RELEVANT_SELECTOR = [
    "header",
    '[data-testid="temporary-chat-badge"]',
    "#prompt-textarea",
    "form",
    '[role="tooltip"]',
    '[role="status"]',
    '[data-radix-popper-content-wrapper]'
  ].join(",");

  if (window !== window.top) return;
  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) return;
  if (globalThis[BOOT_KEY]?.scheduleCheck) {
    globalThis[BOOT_KEY].scheduleCheck();
    return;
  }

  const state = {
    checkTimer: 0,
    pushedTransferPayload: null,
    activeTransferToken: null,
    injectedTransferTokens: new Set(),
    lastHref: location.href,
    anchorEl: null,
    anchorMenuEl: null,
    tooltipSuppressed: false,
    tooltipObserver: null,
  };

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function storageSet(key, value) {
    return new Promise((resolve) => {
      try {
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.set({ [key]: value }, () => resolve());
          return;
        }
      } catch (_error) {}
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_error) {}
      resolve();
    });
  }

  function storageGet(key) {
    return new Promise((resolve) => {
      try {
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.get([key], (result) => resolve(result?.[key] ?? null));
          return;
        }
      } catch (_error) {}
      try {
        const raw = localStorage.getItem(key);
        resolve(raw ? JSON.parse(raw) : null);
      } catch (_error) {
        resolve(null);
      }
    });
  }

  function storageRemove(key) {
    return new Promise((resolve) => {
      try {
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.remove([key], () => resolve());
          return;
        }
      } catch (_error) {}
      try { localStorage.removeItem(key); } catch (_error) {}
      resolve();
    });
  }

  function isVisibleElement(el) {
    if (!el?.isConnected) return false;
    const styles = window.getComputedStyle(el);
    if (styles.display === "none" || styles.visibility === "hidden") return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isNearTop(el, limit = 220) {
    if (!isVisibleElement(el)) return false;
    const rect = el.getBoundingClientRect();
    return rect.bottom >= 0 && rect.top <= limit;
  }

  function isTempChatText(text) {
    return /^(?:temporary(?:\s+chat)?|临时(?:聊天)?|暂时(?:聊天)?|временный(?:\s+чат)?)$/iu.test(normalizeText(text));
  }

  function isIgnoredTempContext(el) {
    return Boolean(el?.closest([
      '[role="menu"]', '[role="dialog"]', '[aria-modal="true"]',
      '[data-radix-popper-content-wrapper]', '[data-headlessui-portal]',
      "[hidden]", '[aria-hidden="true"]', "aside"
    ].join(", ")));
  }

  function isLikelyActiveTempBadge(el) {
    if (!el || !isNearTop(el) || isIgnoredTempContext(el)) return false;
    const text = normalizeText(el.innerText || el.textContent || "");
    const ariaLabel = normalizeText(el.getAttribute?.("aria-label") || "");
    const ownLabel = text || ariaLabel;
    return ownLabel.length <= 24 && (isTempChatText(ownLabel) || isTempChatText(text) || isTempChatText(ariaLabel));
  }

  function headerSearchRoots() {
    const roots = [];
    const header = document.querySelector("header");
    if (header) roots.push(header);
    const main = document.querySelector("main");
    if (main?.firstElementChild) roots.push(main.firstElementChild);
    return roots;
  }

  function findExactTempTextElement() {
    const direct = document.querySelector('[data-testid="temporary-chat-badge"]');
    if (isLikelyActiveTempBadge(direct)) return direct;

    for (const root of headerSearchRoots()) {
      const elements = [root, ...root.querySelectorAll("button, [role='button'], span, div")];
      for (const element of elements) {
        if (!isLikelyActiveTempBadge(element)) continue;
        const ownText = normalizeText(Array.from(element.childNodes || [])
          .filter((node) => node.nodeType === Node.TEXT_NODE)
          .map((node) => node.textContent || "")
          .join(" "));
        if (isTempChatText(ownText) || isTempChatText(element.getAttribute?.("aria-label") || "")) return element;
      }
    }
    return null;
  }

  function findTempCandidates() {
    const candidate = findExactTempTextElement();
    return candidate ? [candidate] : [];
  }

  function findTempChatAnchor() {
    return findTempCandidates()[0] || null;
  }

  function isTempChat() {
    return Boolean(findTempChatAnchor());
  }

  function mergeRects(...rects) {
    const valid = rects.filter(Boolean);
    if (!valid.length) return null;
    const left = Math.min(...valid.map((rect) => rect.left));
    const top = Math.min(...valid.map((rect) => rect.top));
    const right = Math.max(...valid.map((rect) => rect.right));
    const bottom = Math.max(...valid.map((rect) => rect.bottom));
    return { left, top, right, bottom, width: right - left, height: bottom - top };
  }

  function isSameHeaderLine(rectA, rectB, tolerance = 18) {
    if (!rectA || !rectB) return false;
    return Math.abs(rectA.top + rectA.height / 2 - (rectB.top + rectB.height / 2)) <= tolerance;
  }

  function getTempBadgeRect(anchor, triggerEl) {
    if (!anchor || !isVisibleElement(anchor)) return null;
    const labelRect = anchor.getBoundingClientRect();
    const directBadge = document.querySelector('[data-testid="temporary-chat-badge"]');
    const directRect = isLikelyActiveTempBadge(directBadge) && isSameHeaderLine(labelRect, directBadge.getBoundingClientRect())
      ? directBadge.getBoundingClientRect()
      : null;
    const triggerRect = triggerEl && isVisibleElement(triggerEl) ? triggerEl.getBoundingClientRect() : null;
    return mergeRects(labelRect, directRect, triggerRect) || labelRect;
  }

  function sortNodesByDomOrder(nodes) {
    return nodes.sort((a, b) => {
      if (a.el === b.el) return 0;
      const position = a.el.compareDocumentPosition(b.el);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }

  function isDeleteLikeText(text) {
    return /\b(?:delete|remove)\b|删除|移除|удалить/iu.test(normalizeText(text));
  }

  function extractFileNameFromText(text) {
    const normalized = normalizeText(text);
    if (!normalized || isDeleteLikeText(normalized)) return null;
    const variants = [];
    if (normalized.includes(":")) variants.push(normalized.slice(normalized.lastIndexOf(":") + 1).trim());
    if (normalized.includes(" - ")) variants.push(normalized.slice(normalized.lastIndexOf(" - ") + 3).trim());
    variants.push(normalized);
    for (const variant of variants) {
      if (!variant) continue;
      const directMatch = variant.match(/^[^\\/:*?"<>|\n]+?\.[a-zA-Z0-9]{1,6}$/);
      if (directMatch) return directMatch[0].trim();
      const fileMatches = Array.from(variant.matchAll(/[^\\/:*?"<>|\n]+?\.[a-zA-Z0-9]{1,6}(?=$|\s|,|\))/g));
      if (fileMatches.length) return fileMatches[fileMatches.length - 1][0].trim();
    }
    return null;
  }

  function extractMessageText(messageEl) {
    const clone = messageEl.cloneNode(true);
    clone.querySelectorAll([
      "[data-cgpt-ts]", `#${TEMP_BTN_ID}`, `#${SAVE_WRAP_ID}`, "button", '[role="button"]',
      "input", "textarea", "script", "style", "noscript", "canvas", "svg", "img"
    ].join(", ")).forEach((node) => node.remove());
    return normalizeText(clone.innerText || clone.textContent || "");
  }

  function extractMessageAttachments(messageEl) {
    const fileExtPattern = /\.[a-zA-Z0-9]{1,6}(\s|$)/;
    const seen = new Set();
    const names = [];
    messageEl.querySelectorAll("[aria-label], [title], a, span, p, div").forEach((el) => {
      const values = [el.getAttribute?.("aria-label") || "", el.getAttribute?.("title") || "", normalizeText(el.textContent || "")];
      for (const value of values) {
        if (!value || !fileExtPattern.test(value) || isDeleteLikeText(value)) continue;
        const name = extractFileNameFromText(value);
        if (!name || seen.has(name)) continue;
        seen.add(name);
        names.push(name);
      }
    });
    return names;
  }

  function extractMessageImages(messageEl) {
    const seen = new Set();
    const images = [];
    messageEl.querySelectorAll("img").forEach((img, index) => {
      const width = img.naturalWidth || img.width || 0;
      const height = img.naturalHeight || img.height || 0;
      if (width < 64 && height < 64) return;
      const alt = normalizeText(img.alt || img.getAttribute("aria-label") || "");
      if (/avatar|logo|icon/i.test(alt)) return;
      const src = (img.currentSrc || img.src || "").trim();
      let descriptor = "";
      if (/^https?:\/\//i.test(src)) descriptor = alt ? `${alt}: ${src}` : src;
      else if (src.startsWith("blob:") || src.startsWith("data:")) descriptor = alt || `原聊天中包含图片 ${index + 1}`;
      else if (alt) descriptor = alt;
      descriptor = normalizeText(descriptor);
      if (!descriptor || seen.has(descriptor)) return;
      seen.add(descriptor);
      images.push(descriptor);
    });
    return images;
  }

  function extractChatHistory() {
    const roleNodes = Array.from(document.querySelectorAll('[data-message-author-role]'))
      .map((el) => ({ el, role: (el.getAttribute("data-message-author-role") || "").toLowerCase() }))
      .filter((entry) => entry.role === "user" || entry.role === "assistant");
    const source = roleNodes.length
      ? sortNodesByDomOrder(roleNodes)
      : Array.from(document.querySelectorAll("article")).map((el, index) => ({ el, role: index % 2 === 0 ? "user" : "assistant" }));
    return source.map(({ el, role }) => ({
      role,
      text: extractMessageText(el),
      attachments: extractMessageAttachments(el),
      images: extractMessageImages(el),
    })).filter((entry) => entry.text || entry.attachments.length || entry.images.length);
  }

  function buildTransferText(messages) {
    if (!messages.length) return null;
    const lines = [
      "继续这个聊天。下面按消息顺序提供临时聊天的完整历史。",
      "请保留双方角色，并结合对话中的文本、文件和图片继续回答。",
      "", "---"
    ];
    messages.forEach(({ role, text, attachments, images }, index) => {
      lines.push("", `[${index + 1}] ${role === "user" ? "用户" : "ChatGPT"}`);
      if (text) lines.push("文本：", text);
      if (attachments.length) {
        lines.push("文件：");
        attachments.forEach((name) => lines.push(`- ${name}`));
      }
      if (images.length) {
        lines.push("图片：");
        images.forEach((image) => lines.push(`- ${image}`));
      }
    });
    lines.push("", "---", "", "继续后续对话，并考虑上面的全部上下文。");
    return lines.join("\n");
  }

  async function setPendingTransfer(token, text) {
    await storageSet(`${TRANSFER_KEY}:${token}`, { token, text, createdAt: Date.now(), sourceHref: location.href, sourcePath: location.pathname });
  }

  function getTransferTokenFromLocation() {
    const hash = location.hash || "";
    if (!hash.startsWith(TRANSFER_HASH_PREFIX)) return null;
    return hash.slice(TRANSFER_HASH_PREFIX.length).trim() || null;
  }

  function stripTransferHash() {
    try {
      const url = new URL(location.href);
      if (!url.hash.startsWith(TRANSFER_HASH_PREFIX)) return;
      url.hash = "";
      history.replaceState(history.state, "", url.toString());
    } catch (_error) {}
  }

  async function getPendingTransfer() {
    const token = getTransferTokenFromLocation();
    if (!token) return null;
    if (state.pushedTransferPayload?.token === token) return state.pushedTransferPayload;
    try {
      const payload = await storageGet(`${TRANSFER_KEY}:${token}`);
      if (!payload || payload.token !== token || typeof payload.text !== "string" || !payload.text.trim() || !payload.createdAt || Date.now() - payload.createdAt > TRANSFER_TTL_MS) {
        await storageRemove(`${TRANSFER_KEY}:${token}`);
        stripTransferHash();
        return null;
      }
      return payload;
    } catch (_error) {
      await storageRemove(`${TRANSFER_KEY}:${token}`);
      stripTransferHash();
      return null;
    }
  }

  async function clearPendingTransfer(token) {
    state.pushedTransferPayload = null;
    state.activeTransferToken = null;
    if (token) await storageRemove(`${TRANSFER_KEY}:${token}`);
    stripTransferHash();
  }

  function isFreshRootChat() {
    const path = location.pathname || "/";
    return path === "/" || /^\/c\/[a-z0-9-]+\/new$/i.test(path);
  }

  async function openNewChatWithText(text) {
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    const url = new URL("/", location.origin);
    url.hash = `${TRANSFER_HASH_PREFIX.slice(1)}${encodeURIComponent(token)}`;

    // Open synchronously while the click still has user activation. Waiting for
    // storage first can cause Chromium to classify window.open as a popup.
    const win = window.open("about:blank", "_blank");
    if (!win) return false;
    try { win.opener = null; } catch (_error) {}

    await setPendingTransfer(token, text);
    try { win.location.replace(url.toString()); } catch (_error) { win.location.href = url.toString(); }

    let attempts = 0;
    const relay = window.setInterval(() => {
      attempts += 1;
      if (attempts > 30 || win.closed) {
        clearInterval(relay);
        return;
      }
      try { win.postMessage({ type: "cgpt-temp-transfer", token, text }, location.origin); } catch (_error) {}
    }, 500);
    return true;
  }

  function resolveComposerElement() {
    const direct = document.querySelector("#prompt-textarea");
    if (direct) {
      if (direct.matches("textarea, [contenteditable='true']")) return direct;
      const nested = direct.querySelector("[contenteditable='true'], textarea");
      if (nested) return nested;
    }
    return document.querySelector("textarea[placeholder]") ||
      document.querySelector("[contenteditable='true'][role='textbox']") ||
      document.querySelector("[contenteditable='true'][data-lexical-editor='true']") ||
      document.querySelector("div[contenteditable='true']");
  }

  function dispatchInputLikeEvents(target, text) {
    const host = target.closest?.("#prompt-textarea") || target;
    [target, host].forEach((el) => {
      try { el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: text, inputType: "insertText" })); } catch (_error) {}
      try { el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" })); }
      catch (_error) { try { el.dispatchEvent(new Event("input", { bubbles: true })); } catch (_innerError) {} }
      try { el.dispatchEvent(new Event("change", { bubbles: true })); } catch (_error) {}
    });
  }

  function setComposerValue(el, text) {
    if (!el) return false;
    el.focus();
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(el, text);
      else el.value = text;
      dispatchInputLikeEvents(el, text);
      return normalizeText(el.value) === normalizeText(text);
    }
    let inserted = false;
    try {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      inserted = document.execCommand("insertText", false, text);
    } catch (_error) {}
    if (!inserted) {
      try { el.textContent = text; } catch (_error) {}
    }
    dispatchInputLikeEvents(el, text);
    return normalizeText(el.innerText || el.textContent || "").includes(normalizeText(text).slice(0, 50));
  }

  function clickSendIfReady() {
    const selectors = [
      'button[data-testid*="send" i]:not([disabled])',
      'button[aria-label*="Send message" i]:not([disabled])',
      'button[aria-label*="发送" i]:not([disabled])',
      'button[aria-label*="Send prompt" i]:not([disabled])'
    ];
    const tryClick = (attempt = 0) => {
      const button = document.querySelector(selectors.join(","));
      if (button) return button.click();
      if (attempt < 15) window.setTimeout(() => tryClick(attempt + 1), 250);
    };
    window.setTimeout(() => tryClick(), 250);
  }

  function scheduleAfterHydration(fn) {
    const start = () => window.setTimeout(fn, 1000);
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }

  async function injectTransferText() {
    const payload = await getPendingTransfer();
    if (!payload || !isFreshRootChat() || isTempChat()) return;
    if (state.activeTransferToken === payload.token || state.injectedTransferTokens.has(payload.token)) return;
    state.activeTransferToken = payload.token;
    const tryInject = async (attempt = 0) => {
      if (state.activeTransferToken !== payload.token) return;
      const composer = resolveComposerElement();
      if (!composer || !setComposerValue(composer, payload.text)) {
        if (attempt < 60) window.setTimeout(() => void tryInject(attempt + 1), 350);
        else state.activeTransferToken = null;
        return;
      }
      state.injectedTransferTokens.add(payload.token);
      await clearPendingTransfer(payload.token);
      clickSendIfReady();
    };
    scheduleAfterHydration(() => void tryInject());
  }

  async function saveChat() {
    const messages = extractChatHistory();
    if (!messages.length) {
      alert("无法找到聊天消息。");
      return;
    }
    const text = buildTransferText(messages);
    if (text) await openNewChatWithText(text);
  }

  function injectDropdownStyles() {
    const styleId = "cgpt-save-dropdown-style";
    if (document.getElementById(styleId)) return;
    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      html.${HIDE_TOOLTIP_CLASS} [role="tooltip"],html.${HIDE_TOOLTIP_CLASS} [role="status"] { opacity:0!important;visibility:hidden!important;pointer-events:none!important; }
      #${SAVE_WRAP_ID} { position:fixed;display:flex;align-items:center;justify-content:center;z-index:2147483640;width:max-content;height:max-content;pointer-events:none; }
      #${TEMP_BTN_ID} { display:inline-flex;align-items:center;justify-content:center;padding:3px 10px;border-radius:6px;border:1px solid rgba(128,128,128,.3);background:transparent;cursor:pointer;font-size:12px;font-family:inherit;color:inherit;opacity:.7;line-height:1;user-select:none;pointer-events:auto; }
      #${TEMP_BTN_ID}:hover { opacity:1;background:rgba(128,128,128,.10);border-color:rgba(128,128,128,.45); }
    `;
    document.documentElement.appendChild(style);
  }

  function matchesTempTooltipText(text) {
    const normalized = normalizeText(text).toLowerCase();
    return Boolean(normalized && (
      normalized.includes("不会显示") || normalized.includes("聊天记录") ||
      normalized.includes("won't appear") || normalized.includes("chat history") ||
      normalized.includes("не будет отображаться") || normalized.includes("журнале чатов")
    ));
  }

  function restoreHiddenTempTooltips() {
    document.querySelectorAll(`[${HIDDEN_TOOLTIP_ATTR}="1"]`).forEach((node) => {
      node.style.opacity = node.dataset.cgptTempTooltipOpacity || "";
      node.style.visibility = node.dataset.cgptTempTooltipVisibility || "";
      node.style.pointerEvents = node.dataset.cgptTempTooltipPointerEvents || "";
      delete node.dataset.cgptTempTooltipOpacity;
      delete node.dataset.cgptTempTooltipVisibility;
      delete node.dataset.cgptTempTooltipPointerEvents;
      node.removeAttribute(HIDDEN_TOOLTIP_ATTR);
    });
  }

  function maybeHideTempTooltipNode(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return;
    const candidates = [];
    if (node.matches?.("[role='tooltip'], [role='status'], [data-radix-popper-content-wrapper]")) candidates.push(node);
    node.querySelectorAll?.("[role='tooltip'], [role='status'], [data-radix-popper-content-wrapper]").forEach((item) => candidates.push(item));
    candidates.forEach((candidate) => {
      if (candidate.getAttribute(HIDDEN_TOOLTIP_ATTR) === "1") return;
      const text = normalizeText(candidate.innerText || candidate.textContent || "");
      if (!matchesTempTooltipText(text)) return;
      candidate.setAttribute(HIDDEN_TOOLTIP_ATTR, "1");
      candidate.dataset.cgptTempTooltipOpacity = candidate.style.opacity || "";
      candidate.dataset.cgptTempTooltipVisibility = candidate.style.visibility || "";
      candidate.dataset.cgptTempTooltipPointerEvents = candidate.style.pointerEvents || "";
      candidate.style.opacity = "0";
      candidate.style.visibility = "hidden";
      candidate.style.pointerEvents = "none";
    });
  }

  function setTooltipSuppression(enabled) {
    if (enabled) {
      state.tooltipSuppressed = true;
      document.documentElement.classList.add(HIDE_TOOLTIP_CLASS);
      document.querySelectorAll("[role='tooltip'], [role='status'], [data-radix-popper-content-wrapper]").forEach(maybeHideTempTooltipNode);
      if (!state.tooltipObserver && document.body) {
        state.tooltipObserver = new MutationObserver((mutations) => {
          if (!state.tooltipSuppressed) return;
          for (const mutation of mutations) {
            for (const node of mutation.addedNodes || []) maybeHideTempTooltipNode(node);
          }
        });
        state.tooltipObserver.observe(document.body, { childList: true, subtree: true });
      }
      return;
    }
    state.tooltipSuppressed = false;
    document.documentElement.classList.remove(HIDE_TOOLTIP_CLASS);
    state.tooltipObserver?.disconnect();
    state.tooltipObserver = null;
    restoreHiddenTempTooltips();
  }

  function findFlexRow(anchor, maxDepth = 6) {
    let current = anchor;
    for (let index = 0; index < maxDepth; index += 1) {
      if (!current?.parentElement) break;
      const parent = current.parentElement;
      const styles = window.getComputedStyle(parent);
      if (styles.display === "flex" || styles.display === "inline-flex") return parent;
      current = parent;
    }
    return anchor?.parentNode || null;
  }

  function findMenuLikeButton(container) {
    if (!container) return null;
    const buttons = Array.from(container.querySelectorAll("button")).filter((button) => button.id !== TEMP_BTN_ID && isVisibleElement(button));
    if (!buttons.length) return null;
    return buttons.find((button) => {
      const label = normalizeText(button.getAttribute("aria-label") || button.getAttribute("title") || button.innerText || button.textContent || "");
      return button.getAttribute("aria-haspopup") === "menu" || /more|menu|options|actions|更多|菜单|选项|操作|ещ[её]|меню|действ/iu.test(label);
    }) || buttons[buttons.length - 1];
  }

  function positionSaveButton(anchor) {
    const wrap = document.getElementById(SAVE_WRAP_ID);
    const targetAnchor = anchor || state.anchorEl;
    if (!wrap || !targetAnchor || !isVisibleElement(targetAnchor)) return;
    const triggerEl = targetAnchor.closest("button, [role='button'], a") || targetAnchor;
    const row = findFlexRow(triggerEl) || findFlexRow(targetAnchor);
    state.anchorEl = targetAnchor;
    state.anchorMenuEl = findMenuLikeButton(row);
    wrap.style.visibility = "hidden";
    requestAnimationFrame(() => {
      if (!wrap.isConnected || !state.anchorEl || !isVisibleElement(state.anchorEl)) return;
      const badgeRect = getTempBadgeRect(state.anchorEl, triggerEl) || state.anchorEl.getBoundingClientRect();
      const rowRect = row && isVisibleElement(row) ? row.getBoundingClientRect() : badgeRect;
      const wrapRect = wrap.getBoundingClientRect();
      wrap.style.left = `${Math.max(12, Math.round(badgeRect.left - wrapRect.width - 10))}px`;
      wrap.style.top = `${Math.max(12, Math.min(Math.round(rowRect.top + rowRect.height / 2 - wrapRect.height / 2), window.innerHeight - wrapRect.height - 12))}px`;
      wrap.style.visibility = "visible";
    });
  }

  function createSaveButton(anchor) {
    if (!anchor || document.getElementById(TEMP_BTN_ID)) return;
    injectDropdownStyles();
    state.anchorEl = anchor;
    const wrap = document.createElement("span");
    wrap.id = SAVE_WRAP_ID;
    wrap.style.visibility = "hidden";
    const button = document.createElement("button");
    button.id = TEMP_BTN_ID;
    button.type = "button";
    button.setAttribute("aria-label", "保存聊天");
    button.textContent = "保存";
    button.addEventListener("mousedown", (event) => event.stopPropagation());
    button.addEventListener("mouseenter", () => setTooltipSuppression(true));
    button.addEventListener("mouseleave", () => setTooltipSuppression(false));
    button.addEventListener("focus", () => setTooltipSuppression(true));
    button.addEventListener("blur", () => setTooltipSuppression(false));
    button.addEventListener("click", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (button.disabled) return;
      const previousText = button.textContent;
      button.disabled = true;
      button.style.opacity = "0.6";
      button.textContent = "正在保存...";
      try { await saveChat(); }
      finally {
        window.setTimeout(() => {
          setTooltipSuppression(false);
          button.disabled = false;
          button.style.opacity = "";
          button.textContent = previousText;
        }, 1200);
      }
    });
    wrap.appendChild(button);
    document.body.appendChild(wrap);
    positionSaveButton(anchor);
  }

  function removeSaveButton() {
    document.getElementById(SAVE_WRAP_ID)?.remove();
    setTooltipSuppression(false);
    state.anchorEl = null;
    state.anchorMenuEl = null;
  }

  function handlePossibleRouteChange() {
    if (location.href === state.lastHref) return false;
    state.lastHref = location.href;
    state.activeTransferToken = null;
    return true;
  }

  function checkAndInject() {
    handlePossibleRouteChange();
    void injectTransferText();
    const anchor = findTempChatAnchor();
    if (anchor) {
      if (!document.getElementById(TEMP_BTN_ID)) createSaveButton(anchor);
      else positionSaveButton(anchor);
    } else {
      removeSaveButton();
    }
  }

  function scheduleCheck() {
    if (state.checkTimer) return;
    state.checkTimer = window.setTimeout(() => {
      state.checkTimer = 0;
      checkAndInject();
    }, 180);
  }

  function nodeTouchesTempUi(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    if (node.matches?.(TOP_RELEVANT_SELECTOR)) return true;
    return Boolean(node.querySelector?.(TOP_RELEVANT_SELECTOR));
  }

  window.addEventListener("message", (event) => {
    if (event.origin !== location.origin) return;
    const payload = event.data;
    const token = getTransferTokenFromLocation();
    if (!token || !payload || payload.type !== "cgpt-temp-transfer" || payload.token !== token || typeof payload.text !== "string") return;
    state.pushedTransferPayload = { token, text: payload.text, createdAt: Date.now() };
    void storageSet(`${TRANSFER_KEY}:${token}`, state.pushedTransferPayload);
    scheduleCheck();
  }, PASSIVE);

  const observer = new MutationObserver((mutations) => {
    if (handlePossibleRouteChange()) {
      scheduleCheck();
      return;
    }
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes || []) {
        if (nodeTouchesTempUi(node)) {
          scheduleCheck();
          return;
        }
      }
    }
  });

  const start = () => {
    checkAndInject();
    observer.observe(document.documentElement, { childList: true, subtree: true });
  };

  globalThis[BOOT_KEY] = { scheduleCheck };
  window.addEventListener("pageshow", scheduleCheck, PASSIVE);
  window.addEventListener("popstate", scheduleCheck, PASSIVE);
  window.addEventListener("hashchange", scheduleCheck, PASSIVE);
  window.addEventListener("resize", () => {
    if (state.anchorEl) positionSaveButton(state.anchorEl);
  }, PASSIVE);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
