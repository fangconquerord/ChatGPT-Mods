(async () => {
  "use strict";

  const BOOT_KEY = "__cgptQuickNavigationMessageMetaLite__";
  const FEATURE_KEY = "fileInfo";
  const STYLE_ID = "cgpt-message-meta-lite-style";
  const MESSAGE_SELECTOR = "[data-message-author-role]";
  const TIMESTAMP_ATTR = "data-cgpt-ts-injected";
  const PASSIVE = { passive: true };

  if (window !== window.top) return;

  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) {
    return;
  }

  if (globalThis[BOOT_KEY]?.scheduleRefresh) {
    globalThis[BOOT_KEY].scheduleRefresh();
    return;
  }

  let idleHandle = 0;
  let timeoutHandle = 0;
  let lastHref = location.href;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .cgpt-inline-time-row {
        display: flex;
        align-items: center;
        width: 100%;
        min-height: 14px;
        margin-top: 6px;
        padding: 0 2px 2px;
        pointer-events: none;
      }
      .cgpt-inline-time-row[data-cgpt-ts-align="user"] { justify-content: flex-end; }
      .cgpt-inline-time-row[data-cgpt-ts-align="assistant"] { justify-content: flex-start; }
      .cgpt-inline-time {
        display: block;
        font-size: 11px;
        line-height: 1.2;
        color: color-mix(in srgb, currentColor 45%, transparent);
        white-space: nowrap;
        pointer-events: none;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function getConversationId() {
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
      if (/^\d{10}(\.\d+)?$/u.test(text)) return new Date(Number(text) * 1000);
      if (/^\d{13}$/u.test(text)) return new Date(Number(text));
      const date = new Date(text);
      if (!Number.isNaN(date.getTime())) return date;
    }
    return null;
  }

  function formatTimestamp(date) {
    if (!date || Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const time = new Intl.DateTimeFormat("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
    if (date.toDateString() === now.toDateString()) return `今天 ${time}`;
    if (date.toDateString() === yesterday.toDateString()) return `昨天 ${time}`;
    return new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
  }

  function currentConversationPath(data) {
    const mapping = data?.mapping || {};
    const path = [];
    let nodeId = data?.current_node;
    while (nodeId && mapping[nodeId]) {
      path.push(mapping[nodeId]);
      nodeId = mapping[nodeId]?.parent;
    }
    const nodes = path.length
      ? path.reverse()
      : Object.values(mapping).sort(
          (a, b) => (a?.message?.create_time || 0) - (b?.message?.create_time || 0),
        );
    return nodes
      .map((node) => {
        const message = node?.message;
        const role = String(message?.author?.role || "").toLowerCase();
        const date = maybeDate(message?.create_time || message?.update_time);
        return role && date ? { role, text: formatTimestamp(date) } : null;
      })
      .filter(
        (entry) =>
          entry &&
          (entry.role === "user" || entry.role === "assistant") &&
          entry.text,
      );
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

  function upsertFooterTimestamp(messageEl, role, text) {
    if (!messageEl?.isConnected || !text) return;
    const scope = getMessageScope(messageEl);
    let footer = scope.querySelector('[data-cgpt-ts-row="1"]');
    if (!footer) {
      footer = document.createElement("div");
      footer.className = "cgpt-inline-time-row";
      footer.setAttribute("data-cgpt-ts-row", "1");
      scope.appendChild(footer);
    }
    footer.setAttribute(
      "data-cgpt-ts-align",
      role === "user" ? "user" : "assistant",
    );
    let timeEl = footer.querySelector('[data-cgpt-ts="1"]');
    if (!timeEl) {
      timeEl = document.createElement("div");
      timeEl.className = "cgpt-inline-time";
      timeEl.setAttribute("data-cgpt-ts", "1");
      footer.appendChild(timeEl);
    }
    timeEl.textContent = text;
    messageEl.setAttribute(TIMESTAMP_ATTR, "1");
  }

  async function refreshTimestamps() {
    ensureStyle();
    const conversationId = getConversationId();
    if (!conversationId) return;

    let response;
    try {
      response = await fetch(
        `/backend-api/conversation/${encodeURIComponent(conversationId)}`,
        {
          credentials: "include",
          headers: { accept: "application/json" },
        },
      );
    } catch (_error) {
      return;
    }
    if (!response.ok) return;

    let data;
    try {
      data = await response.json();
    } catch (_error) {
      return;
    }

    const stamps = currentConversationPath(data);
    if (!stamps.length) return;
    const messages = Array.from(document.querySelectorAll(MESSAGE_SELECTOR));
    let stampIndex = 0;

    for (const messageEl of messages) {
      const role = String(
        messageEl.getAttribute("data-message-author-role") || "",
      ).toLowerCase();
      if (role !== "user" && role !== "assistant") continue;
      while (stampIndex < stamps.length && stamps[stampIndex].role !== role) {
        stampIndex += 1;
      }
      const stamp = stamps[stampIndex];
      if (!stamp) continue;
      if (messageEl.getAttribute(TIMESTAMP_ATTR) !== "1") {
        upsertFooterTimestamp(messageEl, role, stamp.text);
      }
      stampIndex += 1;
    }
  }

  function cancelScheduledRefresh() {
    if (idleHandle && typeof cancelIdleCallback === "function") {
      cancelIdleCallback(idleHandle);
    }
    if (timeoutHandle) window.clearTimeout(timeoutHandle);
    idleHandle = 0;
    timeoutHandle = 0;
  }

  function scheduleRefresh() {
    cancelScheduledRefresh();
    const run = () => {
      idleHandle = 0;
      timeoutHandle = 0;
      void refreshTimestamps();
    };
    if (typeof requestIdleCallback === "function") {
      idleHandle = requestIdleCallback(run, { timeout: 5000 });
    } else {
      timeoutHandle = window.setTimeout(run, 1500);
    }
  }

  function handleRouteChange() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    scheduleRefresh();
  }

  globalThis[BOOT_KEY] = { scheduleRefresh };

  ensureStyle();
  scheduleRefresh();
  window.addEventListener("pageshow", scheduleRefresh, PASSIVE);
  window.addEventListener("popstate", handleRouteChange, PASSIVE);
  window.addEventListener("hashchange", handleRouteChange, PASSIVE);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) handleRouteChange();
  }, PASSIVE);
})();
