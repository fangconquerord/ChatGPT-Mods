(async () => {
  "use strict";

  const BOOT_KEY = "__cgptQuickNavigationMessageMeta__";
  const FEATURE_KEY = "fileInfo";
  const STYLE_ID = "cgpt-message-meta-style";
  const TIME_CLASS = "cgpt-inline-time";
  const TIME_ROW_CLASS = "cgpt-inline-time-row";
  const COMPOSER_FILES_CLASS = "cgpt-composer-files";
  const COMPOSER_FILES_GRID_CLASS = "cgpt-composer-files-grid";
  const COMPOSER_MARK_ATTR = "data-cgpt-composer-files";
  const NATIVE_ATTACHMENT_TRAY_ATTR = "data-cgpt-native-attachment-tray";
  const ATTACHMENT_LIMIT = 10;
  const TIMESTAMP_ATTR = "data-cgpt-ts-injected";
  const PASSIVE = { passive: true };

  if (window !== window.top) return;

  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) {
    return;
  }

  if (globalThis[BOOT_KEY]?.scheduleRun) {
    globalThis[BOOT_KEY].scheduleRun();
    return;
  }

  const timeCache = new WeakMap();
  const nativeRemoveControlCache = new WeakMap();
  let timer = 0;
  let conversationTimestampCache = {
    conversationId: null,
    stamps: null,
    promise: null,
  };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .${TIME_CLASS} {
        display: block;
        margin-top: 4px;
        font-size: 11px;
        line-height: 1.2;
        color: color-mix(in srgb, currentColor 45%, transparent);
        white-space: nowrap;
        pointer-events: none;
        padding: 0 2px 2px;
      }

      .${TIME_CLASS}[data-cgpt-ts-inline="1"] {
        display: inline-flex;
        align-items: center;
        margin-top: 0;
        margin-left: 8px;
        padding: 0;
        line-height: 1;
      }

      .${TIME_ROW_CLASS} {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 14px;
        margin-top: 6px;
        padding: 0 2px 2px;
        pointer-events: none;
      }

      .${TIME_ROW_CLASS}[data-cgpt-ts-align="user"] {
        justify-content: flex-end;
      }

      .${TIME_ROW_CLASS}[data-cgpt-ts-align="assistant"] {
        justify-content: flex-start;
      }

      .${COMPOSER_FILES_CLASS} {
        box-sizing: border-box;
        width: 100%;
        max-width: 100%;
        margin: 0 0 8px;
        color: inherit;
        font-family: inherit;
      }

      .${COMPOSER_FILES_CLASS},
      .${COMPOSER_FILES_CLASS} * {
        box-sizing: border-box;
      }

      .cgpt-composer-files__header {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        min-width: 0;
        margin: 0 2px 6px;
      }

      .cgpt-composer-files__count {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        min-height: 22px;
        padding: 3px 7px;
        border: 1px solid color-mix(in srgb, currentColor 16%, transparent);
        border-radius: 999px;
        background: color-mix(in srgb, currentColor 6%, transparent);
        font-size: 11px;
        font-weight: 650;
        font-variant-numeric: tabular-nums;
        line-height: 1;
        letter-spacing: .01em;
        white-space: nowrap;
      }

      .cgpt-composer-files__count.is-over-limit {
        border-color: color-mix(in srgb, #ef4444 52%, transparent);
        background: color-mix(in srgb, #ef4444 12%, transparent);
        color: #dc2626;
      }

      .cgpt-composer-files__overflow {
        display: flex;
        flex: 1 1 auto;
        flex-wrap: wrap;
        align-items: center;
        gap: 4px;
        min-width: 0;
        max-height: 48px;
        overflow: auto;
        padding: 1px 0;
        scrollbar-width: thin;
      }

      .cgpt-composer-files__overflow-label {
        flex: 0 0 auto;
        color: color-mix(in srgb, #dc2626 78%, currentColor);
        font-size: 11px;
        font-weight: 600;
        line-height: 20px;
        white-space: nowrap;
      }

      .cgpt-composer-files__overflow-file {
        display: inline-flex;
        align-items: center;
        min-width: 0;
        max-width: min(220px, 100%);
        border: 1px solid color-mix(in srgb, #ef4444 32%, transparent);
        border-radius: 7px;
        background: color-mix(in srgb, #ef4444 7%, transparent);
        color: color-mix(in srgb, #dc2626 78%, currentColor);
        font-size: 11px;
        line-height: 20px;
      }

      .cgpt-composer-files__overflow-name {
        min-width: 0;
        overflow: hidden;
        padding: 0 3px 0 6px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .${COMPOSER_FILES_GRID_CLASS} {
        display: grid;
        grid-template-columns: repeat(var(--cgpt-file-columns, ${ATTACHMENT_LIMIT}), minmax(0, 1fr));
        gap: 6px;
        width: 100%;
        max-width: 100%;
      }

      .cgpt-composer-file {
        display: flex;
        align-items: center;
        gap: 7px;
        min-width: 0;
        height: 54px;
        padding: 7px;
        border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
        border-radius: 12px;
        background: color-mix(in srgb, currentColor 4%, transparent);
        box-shadow: 0 1px 0 color-mix(in srgb, currentColor 4%, transparent);
        transition: border-color .16s ease, background .16s ease;
      }

      .cgpt-composer-file:hover,
      .cgpt-composer-file:focus-within {
        border-color: color-mix(in srgb, currentColor 28%, transparent);
        background: color-mix(in srgb, currentColor 7%, transparent);
      }

      .cgpt-composer-file__icon {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        width: 25px;
        height: 30px;
        border: 1px solid currentColor;
        border-radius: 7px 7px 9px 9px;
        color: color-mix(in srgb, currentColor 72%, #2563eb);
        font-size: 8px;
        font-weight: 750;
        letter-spacing: .02em;
        line-height: 1;
      }

      .cgpt-composer-file__icon.is-pdf { color: #dc2626; }
      .cgpt-composer-file__icon.is-image { color: #a855f7; }
      .cgpt-composer-file__icon.is-spreadsheet { color: #16a34a; }
      .cgpt-composer-file__icon.is-code { color: #0891b2; }
      .cgpt-composer-file__icon.is-archive { color: #d97706; }
      .cgpt-composer-file__icon.is-media { color: #db2777; }
      .cgpt-composer-file__icon.is-model { color: #ea580c; }

      .cgpt-composer-file__body {
        display: grid;
        min-width: 0;
        flex: 1 1 auto;
        gap: 3px;
      }

      .cgpt-composer-file__name-viewport {
        min-width: 0;
        overflow: hidden;
        white-space: nowrap;
      }

      .cgpt-composer-file__name-track {
        display: inline-flex;
        min-width: 100%;
        vertical-align: top;
      }

      .cgpt-composer-file__name-copy {
        flex: 0 0 auto;
        overflow: hidden;
        font-size: 11px;
        font-weight: 620;
        line-height: 14px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .cgpt-composer-file__name-track.is-overflowing {
        min-width: max-content;
        animation: cgpt-composer-file-marquee var(--cgpt-marquee-duration, 8s) linear infinite;
      }

      .cgpt-composer-file__name-track.is-overflowing .cgpt-composer-file__name-copy {
        overflow: visible;
        text-overflow: clip;
      }

      .cgpt-composer-file__type {
        overflow: hidden;
        color: color-mix(in srgb, currentColor 58%, transparent);
        font-size: 9px;
        font-weight: 650;
        letter-spacing: .045em;
        line-height: 12px;
        text-overflow: ellipsis;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .cgpt-composer-file__remove {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        width: 18px;
        height: 18px;
        margin: -2px -2px auto 0;
        padding: 0;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: color-mix(in srgb, currentColor 62%, transparent);
        cursor: pointer;
        font: inherit;
        font-size: 15px;
        line-height: 1;
        opacity: .72;
        transition: background .16s ease, color .16s ease, opacity .16s ease;
      }

      .cgpt-composer-file:hover .cgpt-composer-file__remove,
      .cgpt-composer-file:focus-within .cgpt-composer-file__remove,
      .cgpt-composer-files__overflow-file:hover .cgpt-composer-file__remove,
      .cgpt-composer-file__remove:focus-visible {
        opacity: 1;
      }

      .cgpt-composer-file__remove:hover,
      .cgpt-composer-file__remove:focus-visible {
        background: color-mix(in srgb, #ef4444 14%, transparent);
        color: #dc2626;
        outline: none;
      }

      .cgpt-composer-files__overflow-file .cgpt-composer-file__remove {
        width: 18px;
        height: 20px;
        margin: 0 1px 0 0;
        border-radius: 5px;
        font-size: 14px;
      }

      [${NATIVE_ATTACHMENT_TRAY_ATTR}="1"] {
        display: none !important;
      }

      @keyframes cgpt-composer-file-marquee {
        0%, 8% { transform: translateX(0); }
        40%, 55% { transform: translateX(var(--cgpt-marquee-offset, -50%)); }
        90%, 100% { transform: translateX(0); }
      }

      @media (max-width: 700px) {
        .${COMPOSER_FILES_GRID_CLASS} {
          grid-template-columns: repeat(var(--cgpt-mobile-file-columns, 5), minmax(0, 1fr));
        }

        .cgpt-composer-file {
          height: 46px;
          gap: 4px;
          padding: 5px;
          border-radius: 10px;
        }

        .cgpt-composer-file__icon {
          width: 20px;
          height: 24px;
          border-radius: 6px 6px 7px 7px;
          font-size: 7px;
        }

        .cgpt-composer-file__name-copy { font-size: 10px; }
        .cgpt-composer-file__type { font-size: 8px; }
      }

      @media (prefers-reduced-motion: reduce) {
        .cgpt-composer-file__name-track.is-overflowing {
          animation: none;
        }
      }
    `;

    document.documentElement.appendChild(style);
  }

  function normalizeText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  }

  function getReactProps(el) {
    if (!el || typeof el !== "object") return null;

    for (const key in el) {
      if (key.startsWith("__reactProps$") || key.startsWith("__reactFiber$")) {
        try {
          const value = el[key];
          if (key.startsWith("__reactFiber$") && value?.memoizedProps) {
            return value.memoizedProps;
          }
          if (value) return value;
        } catch (_error) {}
      }
    }

    return null;
  }

  function getConversationIdFromLocation() {
    const parts = location.pathname.split("/").filter(Boolean);
    const cIndex = parts.lastIndexOf("c");
    if (cIndex >= 0 && parts[cIndex + 1]) return parts[cIndex + 1];
    if (parts[0] === "c" && parts[1]) return parts[1];
    return null;
  }

  function maybeDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

    if (typeof value === "number" && Number.isFinite(value)) {
      if (value > 1e12) return new Date(value);
      if (value > 1e9) return new Date(value * 1000);
    }

    if (typeof value === "string") {
      const text = value.trim();
      if (!text) return null;
      if (/^\d{10}(\.\d+)?$/.test(text)) return new Date(Number(text) * 1000);
      if (/^\d{13}$/.test(text)) return new Date(Number(text));
      if (
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(text) ||
        /^\d{4}-\d{2}-\d{2} /.test(text)
      ) {
        const date = new Date(text);
        if (!Number.isNaN(date.getTime())) return date;
      }
    }

    return null;
  }

  function findTimestampInObject(obj, depth = 0, seen = new WeakSet()) {
    if (!obj || depth > 5 || typeof obj !== "object" || seen.has(obj)) {
      return null;
    }

    seen.add(obj);

    for (const key of [
      "create_time",
      "createTime",
      "timestamp",
      "time",
      "updated_at",
      "update_time",
    ]) {
      if (!(key in obj)) continue;
      const date = maybeDate(obj[key]);
      if (date && !Number.isNaN(date.getTime()) && date.getFullYear() >= 2020) {
        return date;
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "function") continue;

      if (typeof value === "string" || typeof value === "number") {
        if (/time|date|created|updated/i.test(key)) {
          const date = maybeDate(value);
          if (date && !Number.isNaN(date.getTime()) && date.getFullYear() >= 2020) {
            return date;
          }
        }
        continue;
      }

      const nestedDate = maybeDate(value);
      if (
        nestedDate &&
        !Number.isNaN(nestedDate.getTime()) &&
        nestedDate.getFullYear() >= 2020
      ) {
        return nestedDate;
      }

      if (value && typeof value === "object") {
        const nested = findTimestampInObject(value, depth + 1, seen);
        if (nested) return nested;
      }
    }

    return null;
  }

  function formatTimestamp(date) {
    if (!date || Number.isNaN(date.getTime())) return "";

    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const time = new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);

    if (sameDay) return `сегодня, ${time}`;
    if (isYesterday) return `вчера, ${time}`;

    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  async function fetchConversationTimestamps() {
    const conversationId = getConversationIdFromLocation();
    if (!conversationId) return null;

    if (
      conversationTimestampCache.conversationId === conversationId &&
      Array.isArray(conversationTimestampCache.stamps)
    ) {
      return conversationTimestampCache.stamps;
    }

    if (
      conversationTimestampCache.conversationId === conversationId &&
      conversationTimestampCache.promise
    ) {
      return conversationTimestampCache.promise;
    }

    const promise = fetch(`/backend-api/conversation/${conversationId}`, {
      credentials: "include",
      headers: { accept: "application/json" },
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const mapping = data?.mapping || {};
        const stamps = Object.values(mapping)
          .map((node) => {
            const message = node?.message;
            const role = message?.author?.role || node?.author?.role || null;
            const date = maybeDate(
              message?.create_time || node?.create_time || message?.update_time,
            );

            return role && date ? { role, date } : null;
          })
          .filter(Boolean)
          .sort((a, b) => a.date - b.date)
          .map((entry) => ({
            role: entry.role,
            text: formatTimestamp(entry.date),
          }));

        conversationTimestampCache = {
          conversationId,
          stamps,
          promise: null,
        };

        return stamps;
      })
      .catch(() => {
        conversationTimestampCache = {
          conversationId,
          stamps: null,
          promise: null,
        };
        return null;
      });

    conversationTimestampCache = {
      conversationId,
      stamps: null,
      promise,
    };

    return promise;
  }

  function extractTimestampForMessage(messageEl) {
    if (!messageEl) return "";

    const cached = timeCache.get(messageEl);
    if (cached) return cached;

    let found = null;
    const candidates = [
      messageEl,
      messageEl.parentElement,
      messageEl.closest("[data-testid], article, section, li, div"),
      ...Array.from(messageEl.querySelectorAll("*")).slice(0, 120),
    ].filter(Boolean);

    for (const node of candidates) {
      const props = getReactProps(node);
      if (!props) continue;

      const date = findTimestampInObject(props);
      if (date) {
        found = date;
        break;
      }
    }

    if (!found) {
      const timeEl =
        messageEl.querySelector("time[datetime], [datetime]") ||
        messageEl.parentElement?.querySelector?.("time[datetime], [datetime]");
      const raw = timeEl?.getAttribute("datetime") || timeEl?.textContent || "";
      found = maybeDate(raw);
    }

    const formatted = found ? formatTimestamp(found) : "";
    if (formatted) timeCache.set(messageEl, formatted);
    return formatted;
  }

  function getMessageScope(messageEl) {
    return (
      messageEl.closest('[data-testid*="conversation-turn" i]') ||
      messageEl.closest('[data-testid*="turn" i]') ||
      messageEl.closest("article") ||
      messageEl.closest("section") ||
      messageEl.closest("li") ||
      messageEl.parentElement ||
      messageEl
    );
  }

  function isMenuLikeButton(button) {
    if (!button || !isVisibleElement(button)) return false;

    const label = normalizeText(
      button.getAttribute("aria-label") ||
        button.getAttribute("title") ||
        button.innerText ||
        button.textContent ||
        "",
    );

    if (button.getAttribute("aria-haspopup") === "menu") return true;
    if (/more|menu|options|actions|details|ещ[её]|меню|действ/iu.test(label)) {
      return true;
    }

    return false;
  }

  function getActionSearchRoots(messageEl) {
    const scope = getMessageScope(messageEl);
    return Array.from(
      new Set(
        [
          messageEl,
          messageEl.parentElement,
          scope,
          scope?.parentElement,
          scope?.nextElementSibling,
        ].filter(Boolean),
      ),
    );
  }

  function findButtonRow(button, boundary) {
    let row = button?.parentElement || null;

    while (row) {
      const styles = window.getComputedStyle(row);
      const buttonCount = row.querySelectorAll("button").length;
      if (
        styles.display === "flex" ||
        styles.display === "inline-flex" ||
        styles.display === "grid" ||
        buttonCount > 1
      ) {
        return row;
      }

      if (row === boundary) break;
      row = row.parentElement;
    }

    return button?.parentElement || null;
  }

  function findActionPlacement(messageEl) {
    const scope = getMessageScope(messageEl);
    const scopeRect = scope.getBoundingClientRect();
    const buttons = [];

    getActionSearchRoots(messageEl).forEach((root) => {
      root.querySelectorAll("button").forEach((button) => {
        if (!isVisibleElement(button) || buttons.includes(button)) return;

        const rect = button.getBoundingClientRect();
        const verticallyNear =
          rect.bottom >= scopeRect.top - 16 && rect.top <= scopeRect.bottom + 56;
        const horizontallyNear =
          rect.left <= scopeRect.right + 56 && rect.right >= scopeRect.left - 56;

        if (verticallyNear && horizontallyNear) {
          buttons.push(button);
        }
      });
    });

    if (!buttons.length) return { row: null, anchor: null };

    buttons.sort((a, b) => {
      const aRect = a.getBoundingClientRect();
      const bRect = b.getBoundingClientRect();
      return aRect.top - bRect.top || aRect.left - bRect.left;
    });

    const menuButton = buttons.find(isMenuLikeButton) || buttons[buttons.length - 1];
    return { row: findButtonRow(menuButton, scope), anchor: menuButton };
  }

  function canUseInlinePlacement(row, anchor) {
    if (!row || !anchor || anchor.parentNode !== row) return false;

    let current = row;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const styles = window.getComputedStyle(current);
      if (styles.display === "none" || styles.visibility === "hidden") {
        return false;
      }

      const opacity = Number.parseFloat(styles.opacity || "1");
      if (Number.isFinite(opacity) && opacity < 0.35) {
        return false;
      }

      current = current.parentElement;
    }

    return true;
  }

  function upsertFooterTimestamp(scope, role, timeEl) {
    let footer = scope.querySelector(`[data-cgpt-ts-row="1"]`);
    if (!footer) {
      footer = document.createElement("div");
      footer.className = TIME_ROW_CLASS;
      footer.setAttribute("data-cgpt-ts-row", "1");
      scope.appendChild(footer);
    }

    footer.setAttribute(
      "data-cgpt-ts-align",
      role === "user" ? "user" : "assistant",
    );
    footer.replaceChildren(timeEl);
  }

  function upsertTimestamp(messageEl, role, text) {
    const scope = getMessageScope(messageEl);
    let timeEl =
      scope.querySelector(`[data-cgpt-ts="1"]`) ||
      messageEl.querySelector(`[data-cgpt-ts="1"]`);

    if (!timeEl) {
      timeEl = document.createElement("div");
      timeEl.className = TIME_CLASS;
      timeEl.setAttribute("data-cgpt-ts", "1");
    }

    timeEl.textContent = text;

    const { row, anchor } = findActionPlacement(messageEl);
    if (canUseInlinePlacement(row, anchor)) {
      scope.querySelector(`[data-cgpt-ts-row="1"]`)?.remove();
      timeEl.setAttribute("data-cgpt-ts-inline", "1");
      timeEl.style.textAlign = "";
      anchor.insertAdjacentElement("afterend", timeEl);
    } else {
      timeEl.removeAttribute("data-cgpt-ts-inline");
      timeEl.style.textAlign = role === "user" ? "right" : "left";
      upsertFooterTimestamp(scope, role, timeEl);
    }

    messageEl.setAttribute(TIMESTAMP_ATTR, "1");
    scope.setAttribute(TIMESTAMP_ATTR, "1");
    timeCache.set(messageEl, text);
  }

  async function injectTimestamps() {
    const messageEls = Array.from(
      document.querySelectorAll("[data-message-author-role]"),
    );
    if (!messageEls.length) return;

    const missing = [];

    messageEls.forEach((messageEl) => {
      const existingText = normalizeText(
        messageEl.querySelector("[data-cgpt-ts='1']")?.textContent || "",
      );
      const text = existingText || extractTimestampForMessage(messageEl);
      if (!text) {
        missing.push(messageEl);
        return;
      }

      upsertTimestamp(
        messageEl,
        messageEl.getAttribute("data-message-author-role") || "assistant",
        text,
      );
    });

    if (!missing.length) return;

    const fallbackStamps = await fetchConversationTimestamps();
    if (!Array.isArray(fallbackStamps) || !fallbackStamps.length) return;

    const orderedStamps = fallbackStamps.filter(
      (entry) => entry.role === "user" || entry.role === "assistant",
    );

    let stampIndex = 0;
    missing.forEach((messageEl) => {
      const role = messageEl.getAttribute("data-message-author-role") || "assistant";

      while (
        stampIndex < orderedStamps.length &&
        orderedStamps[stampIndex].role !== role
      ) {
        stampIndex += 1;
      }

      const match = orderedStamps[stampIndex];
      if (!match?.text) return;

      upsertTimestamp(messageEl, role, match.text);
      stampIndex += 1;
    });
  }

  function isVisibleElement(el) {
    if (!el?.isConnected) return false;
    const isManagedNativeAttachment = Boolean(
      el.closest?.(`[${NATIVE_ATTACHMENT_TRAY_ATTR}="1"]`),
    );
    const styles = window.getComputedStyle(el);
    if (styles.display === "none" || styles.visibility === "hidden") {
      return isManagedNativeAttachment;
    }
    const rect = el.getBoundingClientRect();
    return (rect.width > 0 && rect.height > 0) || isManagedNativeAttachment;
  }

  function isDeleteLikeText(text) {
    return /\b(delete|remove|\u0443\u0434\u0430\u043b\u0438\u0442\u044c)\b/iu.test(normalizeText(text));
  }

  function extractFileNameFromText(text) {
    const normalized = normalizeText(text);
    if (!normalized) return null;

    const variants = [];

    if (normalized.includes(":")) {
      variants.push(normalized.slice(normalized.lastIndexOf(":") + 1).trim());
    }

    if (normalized.includes(" - ")) {
      variants.push(normalized.slice(normalized.lastIndexOf(" - ") + 3).trim());
    }

    variants.push(normalized);

    for (const variant of variants) {
      if (!variant) continue;

      const directMatch = variant.match(/^[^\\/:*?"<>|\n]+?\.[a-zA-Z0-9]{1,6}$/);
      if (directMatch) return directMatch[0].trim();

      const fileMatches = Array.from(
        variant.matchAll(/[^\\/:*?"<>|\n]+?\.[a-zA-Z0-9]{1,6}(?=$|\s|,|\))/g),
      );

      if (fileMatches.length) {
        return fileMatches[fileMatches.length - 1][0].trim();
      }
    }

    return null;
  }

  function resolveComposerElement() {
    const root = document.querySelector("#prompt-textarea");
    if (root) {
      if (root.matches("textarea, [contenteditable='true']")) return root;
      const nested = root.querySelector("[contenteditable='true'], textarea");
      if (nested) return nested;
    }

    return (
      document.querySelector("textarea[placeholder]") ||
      document.querySelector("[contenteditable='true'][role='textbox']") ||
      document.querySelector("[contenteditable='true'][data-lexical-editor='true']") ||
      document.querySelector("div[contenteditable='true']")
    );
  }

  function locateComposerForm() {
    const composer = resolveComposerElement();
    return composer?.closest("form") || null;
  }

  function extractSingleAttachmentName(el) {
    const ariaLabel = (el.getAttribute?.("aria-label") || "").trim();
    const title = (el.getAttribute?.("title") || "").trim();

    let directText = "";
    for (const child of el.childNodes || []) {
      if (child.nodeType === Node.TEXT_NODE) {
        directText = normalizeText(child.textContent);
        if (directText) break;
      }
    }

    for (const source of [directText, title, ariaLabel, normalizeText(el.textContent || "")]) {
      if (!source) continue;
      const name = extractFileNameFromText(source);
      if (name) return name;
    }

    return null;
  }

  function getInteractiveControls(scope) {
    return [
      ...(scope.matches?.("button, [role='button']") ? [scope] : []),
      ...Array.from(scope.querySelectorAll?.("button, [role='button']") || []),
    ];
  }

  function isNativeRemoveControl(control) {
    const label = [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.getAttribute("data-testid"),
      control.textContent,
    ].join(" ");
    const hasExplicitRemoveIntent =
      isDeleteLikeText(label) ||
      /\b(close|clear)\b|\u0437\u0430\u043a\u0440\u044b\u0442\u044c|\u043e\u0447\u0438\u0441\u0442\u0438\u0442\u044c/iu.test(label) ||
      control.matches?.("[data-testid*='remove' i], [data-testid*='delete' i], [data-testid*='close' i]");
    if (hasExplicitRemoveIntent) return true;

    if (
      control.closest("a, [download]") ||
      control.matches?.("[download], [data-testid*='download' i]")
    ) {
      return false;
    }

    const controlText = normalizeText(control.textContent || "");
    const rect = control.getBoundingClientRect?.();
    const compactIcon =
      rect &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.width <= 44 &&
      rect.height <= 44 &&
      controlText.length <= 2 &&
      (Boolean(control.querySelector("svg")) || /^(?:×|✕|✖|x)$/iu.test(controlText));
    return compactIcon;
  }

  function findNativeRemoveControl(source, form) {
    const cachedControl = nativeRemoveControlCache.get(source);
    if (cachedControl?.isConnected) return cachedControl;

    let scope = source;

    for (let depth = 0; scope && scope !== form && depth < 7; depth += 1) {
      const controls = getInteractiveControls(scope);
      const removeControls = controls.filter(isNativeRemoveControl);
      if (removeControls.length === 1) {
        nativeRemoveControlCache.set(source, removeControls[0]);
        return removeControls[0];
      }
      scope = scope.parentElement;
    }

    return null;
  }

  function findCommonAncestor(elements, boundary) {
    if (!elements.length) return null;
    let current = elements[0];

    while (current && current !== boundary) {
      if (elements.every((element) => current.contains(element))) return current;
      current = current.parentElement;
    }

    return null;
  }

  function findNativeAttachmentTray(form, sources) {
    const composer = resolveComposerElement();
    const tray = findCommonAncestor(sources, form);
    return tray && tray !== sources[0] && !tray.contains(composer) ? tray : null;
  }

  function findNativeAttachmentCard(form, item) {
    const composer = resolveComposerElement();
    let card = findCommonAncestor([item.source, item.removeControl], form);

    while (card && card !== form) {
      const removeControls = getInteractiveControls(card).filter(isNativeRemoveControl);
      if (removeControls.length === 1 && !card.contains(composer)) {
        return card;
      }
      card = card.parentElement;
    }

    return null;
  }

  function collectComposerAttachmentData() {
    const form = locateComposerForm();
    if (!form) return { form: null, items: [] };

    const itemsByName = new Map();
    const fileExtPattern = /\.[a-zA-Z0-9]{1,6}(\s|$)/;
    const candidates = new Set();

    form.querySelectorAll("[aria-label], [title]").forEach((el) => {
      const value = el.getAttribute("aria-label") || el.getAttribute("title") || "";
      if (!isVisibleElement(el)) return;
      if (isDeleteLikeText(value)) return;
      if (fileExtPattern.test(value)) candidates.add(el);
    });

    form
      .querySelectorAll('[data-testid*="attach" i], [class*="attach" i], [class*="file" i]')
      .forEach((container) => {
        container.querySelectorAll("span, p, div").forEach((el) => {
          if (!isVisibleElement(el)) return;
          const text = normalizeText(el.textContent || "");
          if (isDeleteLikeText(text)) return;
          if (fileExtPattern.test(text) && !text.includes("\n") && text.length < 200) {
            candidates.add(el);
          }
        });
      });

    candidates.forEach((el) => {
      const name = extractSingleAttachmentName(el);
      if (!name) return;
      const sourceText = normalizeText([
        el.getAttribute?.("aria-label"),
        el.getAttribute?.("title"),
        el.textContent,
      ].filter(Boolean).join(" "));
      const candidate = {
        name,
        source: el,
        removeControl: findNativeRemoveControl(el, form),
        sourceTextLength: sourceText.length,
      };
      const current = itemsByName.get(name);
      if (!current || candidate.sourceTextLength < current.sourceTextLength) {
        itemsByName.set(name, candidate);
      }
    });

    return {
      form,
      items: Array.from(itemsByName.values()).map(({ sourceTextLength, ...item }) => item),
    };
  }

  function describeFile(name) {
    const extension = (name.match(/\.([^.]+)$/u)?.[1] || "file").toLowerCase();
    const kinds = {
      pdf: ["pdf"],
      image: ["jpg", "jpeg", "png", "gif", "webp", "svg", "heic", "avif", "bmp"],
      spreadsheet: ["xls", "xlsx", "csv", "tsv", "ods"],
      code: ["js", "mjs", "cjs", "ts", "tsx", "jsx", "py", "java", "c", "cpp", "cs", "go", "rs", "php", "rb", "html", "css", "json", "xml", "yaml", "yml", "sql", "sh"],
      archive: ["zip", "rar", "7z", "tar", "gz"],
      media: ["mp3", "wav", "m4a", "ogg", "mp4", "mov", "avi", "mkv", "webm"],
      model: ["fbx", "obj", "blend", "stl", "glb", "gltf"],
    };
    const kind = Object.entries(kinds).find(([, extensions]) => extensions.includes(extension))?.[0] || "document";
    const badge = extension.length <= 4 ? extension.toUpperCase() : kind === "spreadsheet" ? "XLS" : "FILE";
    return { badge, kind, type: extension.toUpperCase() };
  }

  function removeAttachment(item) {
    const form = locateComposerForm();
    const currentItem = form
      ? collectComposerAttachmentData().items.find(({ name }) => name === item.name)
      : null;
    const source = currentItem?.source || item.source;
    const removeControl =
      (form && source?.isConnected && findNativeRemoveControl(source, form)) ||
      (item.removeControl?.isConnected && isNativeRemoveControl(item.removeControl)
        ? item.removeControl
        : null);

    if (!removeControl) return;
    removeControl.click();
    window.setTimeout(scheduleRun, 0);
  }

  function createRemoveButton(item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cgpt-composer-file__remove";
    button.textContent = "×";
    button.title = `Удалить ${item.name}`;
    button.setAttribute("aria-label", `Удалить ${item.name}`);
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      removeAttachment(item);
    });
    return button;
  }

  function createFileCard(item) {
    const descriptor = describeFile(item.name);
    const card = document.createElement("div");
    card.className = "cgpt-composer-file";
    card.setAttribute("role", "listitem");
    card.title = `${item.name} · ${descriptor.type}`;

    const icon = document.createElement("span");
    icon.className = `cgpt-composer-file__icon is-${descriptor.kind}`;
    icon.textContent = descriptor.badge;
    icon.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "cgpt-composer-file__body";

    const viewport = document.createElement("div");
    viewport.className = "cgpt-composer-file__name-viewport";
    const track = document.createElement("span");
    track.className = "cgpt-composer-file__name-track";
    const firstName = document.createElement("span");
    firstName.className = "cgpt-composer-file__name-copy";
    firstName.textContent = item.name;
    track.appendChild(firstName);
    viewport.appendChild(track);

    const type = document.createElement("span");
    type.className = "cgpt-composer-file__type";
    type.textContent = descriptor.type;
    body.append(viewport, type);
    card.append(icon, body);

    const removeButton = createRemoveButton(item);
    if (removeButton) card.appendChild(removeButton);
    return card;
  }

  function createOverflowFile(item) {
    const row = document.createElement("div");
    row.className = "cgpt-composer-files__overflow-file";
    row.title = item.name;
    const name = document.createElement("span");
    name.className = "cgpt-composer-files__overflow-name";
    name.textContent = item.name;
    row.appendChild(name);
    const removeButton = createRemoveButton(item);
    if (removeButton) row.appendChild(removeButton);
    return row;
  }

  function enableOverflowMarquees(host) {
    window.requestAnimationFrame(() => {
      if (!host.isConnected) return;
      host.querySelectorAll(".cgpt-composer-file__name-track").forEach((track) => {
        const viewport = track.parentElement;
        const name = track.firstElementChild;
        if (!viewport || !name) return;
        const nameWidth = Math.ceil(name.scrollWidth);
        const travelDistance = Math.ceil(nameWidth - viewport.clientWidth);
        const isOverflowing = travelDistance > 2;
        if (!isOverflowing) {
          track.classList.remove("is-overflowing");
          track.style.removeProperty("--cgpt-marquee-offset");
          track.style.removeProperty("--cgpt-marquee-duration");
          return;
        }

        track.style.setProperty("--cgpt-marquee-offset", `-${travelDistance}px`);
        track.style.setProperty(
          "--cgpt-marquee-duration",
          `${Math.max(8, travelDistance / 8).toFixed(2)}s`,
        );
        track.classList.add("is-overflowing");
      });
    });
  }

  function restoreNativeAttachmentTrays(form) {
    form.querySelectorAll(`[${NATIVE_ATTACHMENT_TRAY_ATTR}="1"]`).forEach((tray) => {
      tray.removeAttribute(NATIVE_ATTACHMENT_TRAY_ATTR);
    });
  }

  function hideNativeAttachmentTray(form, items) {
    if (!items.length || items.some((item) => !item.removeControl)) {
      restoreNativeAttachmentTrays(form);
      return;
    }

    const tray = findNativeAttachmentTray(form, items.map((item) => item.source));
    if (tray) {
      if (tray.getAttribute(NATIVE_ATTACHMENT_TRAY_ATTR) !== "1") {
        tray.setAttribute(NATIVE_ATTACHMENT_TRAY_ATTR, "1");
      }
      return;
    }

    const cards = items.map((item) => findNativeAttachmentCard(form, item));
    if (cards.some((card) => !card)) return;
    cards.forEach((card) => {
      if (card.getAttribute(NATIVE_ATTACHMENT_TRAY_ATTR) !== "1") {
        card.setAttribute(NATIVE_ATTACHMENT_TRAY_ATTR, "1");
      }
    });
  }

  function getComposerFilesHost(form) {
    let host = document.querySelector(`[${COMPOSER_MARK_ATTR}="1"]`);
    if (!host) {
      host = document.createElement("section");
      host.setAttribute(COMPOSER_MARK_ATTR, "1");
      host.setAttribute("aria-label", "Прикреплённые файлы");
    }
    if (host.nextElementSibling !== form) form.before(host);
    host.className = COMPOSER_FILES_CLASS;
    return host;
  }

  function hasSameAttachmentItems(previousItems, nextItems) {
    return Boolean(
      previousItems &&
      previousItems.length === nextItems.length &&
      previousItems.every(
        (item, index) => item.name === nextItems[index].name,
      ),
    );
  }

  function updateComposerAttachmentInfo() {
    const { form, items } = collectComposerAttachmentData();
    if (!form) return;

    if (!items.length) {
      restoreNativeAttachmentTrays(form);
      document.querySelector(`[${COMPOSER_MARK_ATTR}="1"]`)?.remove();
      return;
    }

    const host = getComposerFilesHost(form);
    if (hasSameAttachmentItems(host._cgptAttachmentItems, items)) {
      host._cgptAttachmentItems = items;
      hideNativeAttachmentTray(form, items);
      enableOverflowMarquees(host);
      return;
    }

    const visibleItems = items.slice(0, ATTACHMENT_LIMIT);
    const overLimitItems = items.slice(ATTACHMENT_LIMIT);
    const header = document.createElement("div");
    header.className = "cgpt-composer-files__header";
    const count = document.createElement("span");
    count.className = "cgpt-composer-files__count";
    count.textContent = `${items.length}/${ATTACHMENT_LIMIT}`;
    count.setAttribute("aria-live", "polite");
    if (overLimitItems.length) count.classList.add("is-over-limit");
    header.appendChild(count);

    if (overLimitItems.length) {
      const overflow = document.createElement("div");
      overflow.className = "cgpt-composer-files__overflow";
      overflow.setAttribute("aria-label", "Файлы сверх лимита");
      const label = document.createElement("span");
      label.className = "cgpt-composer-files__overflow-label";
      label.textContent = "Сверх лимита:";
      overflow.appendChild(label);
      overLimitItems.forEach((item) => overflow.appendChild(createOverflowFile(item)));
      header.appendChild(overflow);
    }

    const grid = document.createElement("div");
    grid.className = COMPOSER_FILES_GRID_CLASS;
    grid.setAttribute("role", "list");
    grid.style.setProperty(
      "--cgpt-file-columns",
      String(Math.max(1, Math.min(5, visibleItems.length))),
    );
    grid.style.setProperty(
      "--cgpt-mobile-file-columns",
      String(Math.max(1, Math.min(5, visibleItems.length))),
    );
    visibleItems.forEach((item) => grid.appendChild(createFileCard(item)));
    host.replaceChildren(header, ...(visibleItems.length ? [grid] : []));
    host._cgptAttachmentItems = items;
    hideNativeAttachmentTray(form, items);
    enableOverflowMarquees(host);
  }

  function run() {
    ensureStyle();
    void injectTimestamps();
    updateComposerAttachmentInfo();
  }

  function scheduleRun() {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      run();
    }, 250);
  }

  const observer = new MutationObserver(scheduleRun);
  const start = () => {
    run();
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  };

  globalThis[BOOT_KEY] = {
    scheduleRun,
  };

  window.addEventListener("pageshow", scheduleRun, PASSIVE);
  window.addEventListener("popstate", scheduleRun, PASSIVE);
  window.addEventListener("resize", scheduleRun, PASSIVE);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
