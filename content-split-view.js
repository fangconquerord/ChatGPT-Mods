(async () => {
  "use strict";

  const BOOT_KEY = "__cgptQuickNavigationSplitView__";
  const FEATURE_KEY = "splitView";
  const SPLIT_BTN_ID = "cgpt-split-btn";
  const SPLIT_TOOLTIP_ID = "cgpt-split-tooltip";
  const SPLIT_OVERLAY_ID = "cgpt-split-overlay";
  const SPLIT_CLOSE_ID = "cgpt-split-close-btn";
  const SPLIT_ACTIVE_CLASS = "cgpt-split-active";
  const SPLIT_STYLE_ID = "cgpt-split-style";
  const NATIVE_NAV_STYLE_ID = "cgpt-split-native-nav-style";
  const NATIVE_NAV_MIN_LAYOUT_WIDTH = 1120;
  const PASSIVE = { passive: true };

  if (window !== window.top) return;

  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) {
    return;
  }

  if (globalThis[BOOT_KEY]?.ensureSplitButton) {
    globalThis[BOOT_KEY].ensureSplitButton();
    return;
  }

  const state = {
    splitActive: false,
    overlay: null,
    closeBtn: null,
    tooltip: null,
    cleanupDragListeners: null,
    escapeHandler: null,
    previousHtmlOverflow: "",
    previousBodyOverflow: "",
    ensureTimer: 0,
    positionTimer: 0,
    lastHref: location.href,
    frameResizeObservers: [],
    framePatchCleanups: [],
  };

  function ensureStyle() {
    if (document.getElementById(SPLIT_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = SPLIT_STYLE_ID;
    style.textContent = `
      html.${SPLIT_ACTIVE_CLASS} #cgpt-save-dropdown-wrap,
      html.${SPLIT_ACTIVE_CLASS} .cgpt-attach-tooltip,
      html.${SPLIT_ACTIVE_CLASS} .cgpt-prompt-enhancer-btn,
      html.${SPLIT_ACTIVE_CLASS} .cgpt-prompt-enhancer-toast,
      html.${SPLIT_ACTIVE_CLASS} #cgpt-chat-export-btn,
      html.${SPLIT_ACTIVE_CLASS} #cgpt-chat-export-menu,
      html.${SPLIT_ACTIVE_CLASS} .cgpt-chat-export-snippet,
      html.${SPLIT_ACTIVE_CLASS} #cgpt-chat-export-toast {
        display: none !important;
      }

      #${SPLIT_TOOLTIP_ID} {
        position: fixed;
        z-index: 2147483640;
        max-width: min(230px, calc(100vw - 24px));
        padding: 7px 9px;
        border: 1px solid color-mix(in srgb, currentColor 15%, transparent);
        border-radius: 8px;
        background: var(--main-surface-primary, #212121);
        box-shadow: 0 8px 22px rgba(0, 0, 0, .2);
        color: var(--text-primary, #f7f7f8);
        font: 12px/1.3 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }
    `;

    document.documentElement.appendChild(style);
  }

  function getFrameDocument(iframe) {
    try {
      return iframe?.contentDocument || null;
    } catch (_error) {
      return null;
    }
  }

  function injectNativeNavStyle(iframe) {
    const doc = getFrameDocument(iframe);
    const root = doc?.documentElement;
    if (!doc || !root) return;

    root.setAttribute("data-cgpt-split-frame", "1");

    if (doc.getElementById(NATIVE_NAV_STYLE_ID)) return;

    const style = doc.createElement("style");
    style.id = NATIVE_NAV_STYLE_ID;
    style.textContent = `
      html[data-cgpt-split-frame="1"] #thread [class*="convSearchResultHighlightRoot"] {
        display: block !important;
        visibility: visible !important;
      }

      html[data-cgpt-split-frame="1"] #thread [class*="convSearchResultHighlightRoot"] > [class~="fixed"][class~="top-1/2"] {
        display: flex !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        inset-inline-end: 12px !important;
        z-index: 2147483000 !important;
      }

      html[data-cgpt-split-frame="1"] body {
        overflow-x: hidden !important;
      }
    `;

    (doc.head || root).appendChild(style);
  }

  function forceNativeNavVisible(doc) {
    const roots = doc.querySelectorAll('[class*="convSearchResultHighlightRoot"]');

    roots.forEach((root) => {
      root.style.setProperty("display", "block", "important");
      root.style.setProperty("visibility", "visible", "important");

      root
        .querySelectorAll('[class*="top-1/2"], [class*="-translate-y-1/2"]')
        .forEach((node) => {
          node.style.setProperty("display", "flex", "important");
          node.style.setProperty("visibility", "visible", "important");
          node.style.setProperty("opacity", "1", "important");
          node.style.setProperty("pointer-events", "auto", "important");
        });
    });
  }

  function nudgeFrameLayout(frame) {
    try {
      frame.contentWindow?.dispatchEvent(new Event("resize"));
    } catch (_error) {}
  }

  function applyFrameDocumentZoom(frame, scale) {
    const doc = getFrameDocument(frame);
    const root = doc?.documentElement;
    if (!root) return;

    const zoom = scale < 0.999 ? String(scale) : "";
    root.style.zoom = zoom;
    doc.body?.style.removeProperty("zoom");
  }

  function applySplitFramePatches(frame) {
    const doc = getFrameDocument(frame);
    if (!doc) return;

    applyFrameDocumentZoom(frame, frame.__cgptSplitScale || 1);
    forceNativeNavVisible(doc);
    nudgeFrameLayout(frame);
  }

  function installSplitFramePatches(frame) {
    const doc = getFrameDocument(frame);
    const root = doc?.documentElement;
    if (!doc || !root) return;

    if (frame.__cgptSplitFrameCleanup && frame.__cgptSplitFrameDoc !== doc) {
      frame.__cgptSplitFrameCleanup();
    }

    if (frame.__cgptSplitFrameDoc === doc) {
      applySplitFramePatches(frame);
      return;
    }

    let scheduled = false;
    let retries = 0;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(() => {
        scheduled = false;
        applySplitFramePatches(frame);
      });
    };

    const observer = new MutationObserver(schedule);
    observer.observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-hidden"],
    });

    const retryTimer = window.setInterval(() => {
      retries += 1;
      schedule();
      if (retries >= 24) window.clearInterval(retryTimer);
    }, 500);

    const cleanup = () => {
      observer.disconnect();
      window.clearInterval(retryTimer);
      frame.__cgptSplitFrameCleanup = null;
      frame.__cgptSplitFrameDoc = null;
    };

    frame.__cgptSplitFrameCleanup = cleanup;
    frame.__cgptSplitFrameDoc = doc;
    state.framePatchCleanups.push(cleanup);
    schedule();
  }

  function syncFrameViewport(frame, viewport) {
    if (!frame || !viewport) return;

    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    // ChatGPT hides the native thread navigator below desktop breakpoints.
    const layoutWidth = Math.max(
      Math.ceil(rect.width),
      NATIVE_NAV_MIN_LAYOUT_WIDTH,
    );
    const scale = Math.min(1, rect.width / layoutWidth);
    frame.__cgptSplitScale = scale;

    frame.style.width = `${layoutWidth}px`;
    frame.style.height = `${Math.ceil(rect.height / scale)}px`;
    frame.style.transform = "";
    applyFrameDocumentZoom(frame, scale);
  }

  function watchFrameViewport(frame, viewport) {
    const sync = () => syncFrameViewport(frame, viewport);
    sync();
    window.requestAnimationFrame(sync);

    if (!("ResizeObserver" in window)) {
      window.addEventListener("resize", sync, PASSIVE);
      state.frameResizeObservers.push({
        disconnect: () => window.removeEventListener("resize", sync, PASSIVE),
      });
      return;
    }

    const observer = new ResizeObserver(sync);
    observer.observe(viewport);
    state.frameResizeObservers.push(observer);
  }

  function prepareSplitFrame(frame, viewport) {
    syncFrameViewport(frame, viewport);
    injectNativeNavStyle(frame);
    installSplitFramePatches(frame);
  }

  function teardownDragListeners() {
    if (state.cleanupDragListeners) {
      state.cleanupDragListeners();
      state.cleanupDragListeners = null;
    }
  }

  function createPane(url, label) {
    const wrap = document.createElement("div");
    wrap.style.cssText = `
      flex: 1;
      min-width: 0;
      position: relative;
      display: flex;
      flex-direction: column;
      background: #fff;
    `;

    const viewport = document.createElement("div");
    viewport.style.cssText = `
      flex: 1;
      min-height: 0;
      position: relative;
      overflow: hidden;
      background: #fff;
    `;

    const bar = document.createElement("div");
    bar.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      background: rgba(0,0,0,0.06);
      border-bottom: 1px solid rgba(0,0,0,0.08);
      font-size: 11px;
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: rgba(0,0,0,0.45);
      min-height: 26px;
      user-select: none;
      flex-shrink: 0;
    `;
    bar.innerHTML = `
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="1" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.2"/>
      </svg>
      <span>${label}</span>
    `;

    const frame = document.createElement("iframe");
    frame.src = url;
    frame.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${NATIVE_NAV_MIN_LAYOUT_WIDTH}px;
      height: 100%;
      border: none;
      display: block;
      background: #fff;
    `;
    frame.setAttribute("allow", "clipboard-read; clipboard-write");
    frame.setAttribute("data-cgpt-split-frame", "1");

    frame.addEventListener("load", () => {
      prepareSplitFrame(frame, viewport);
      window.setTimeout(() => prepareSplitFrame(frame, viewport), 400);
      window.setTimeout(() => prepareSplitFrame(frame, viewport), 1200);
    });

    watchFrameViewport(frame, viewport);
    viewport.appendChild(frame);
    wrap.appendChild(bar);
    wrap.appendChild(viewport);

    return { wrap, frame };
  }

  function createSplitOverlay() {
    if (document.getElementById(SPLIT_OVERLAY_ID)) return;

    const overlay = document.createElement("div");
    overlay.id = SPLIT_OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 2147483645;
      display: flex;
      background: #000;
      gap: 2px;
    `;

    const currentUrl = location.href;
    const newChatUrl = new URL("/", location.origin).toString();
    const { wrap: leftWrap, frame: leftFrame } = createPane(currentUrl, "Чат 1");
    const { wrap: rightWrap, frame: rightFrame } = createPane(newChatUrl, "Чат 2");

    const divider = document.createElement("div");
    divider.style.cssText = `
      width: 4px;
      cursor: col-resize;
      background: rgba(128,128,128,0.25);
      flex-shrink: 0;
      position: relative;
      transition: background 0.15s;
    `;

    divider.addEventListener("mouseenter", () => {
      divider.style.background = "rgba(37,99,235,0.45)";
    });

    divider.addEventListener("mouseleave", () => {
      if (!state.cleanupDragListeners) {
        divider.style.background = "rgba(128,128,128,0.25)";
      }
    });

    divider.addEventListener("mousedown", (event) => {
      event.preventDefault();

      const startX = event.clientX;
      const startLeftWidth = leftWrap.getBoundingClientRect().width;
      divider.style.background = "rgba(37,99,235,0.7)";
      document.body.style.userSelect = "none";
      document.body.style.cursor = "col-resize";
      leftFrame.style.pointerEvents = "none";
      rightFrame.style.pointerEvents = "none";

      const onMouseMove = (moveEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const totalWidth = overlay.clientWidth - 4;
        const nextLeftWidth = Math.max(
          240,
          Math.min(totalWidth - 240, startLeftWidth + deltaX),
        );

        leftWrap.style.flex = "none";
        leftWrap.style.width = `${nextLeftWidth}px`;
        rightWrap.style.flex = "1";
        rightWrap.style.width = "";
      };

      const onMouseUp = () => {
        divider.style.background = "rgba(128,128,128,0.25)";
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        leftFrame.style.pointerEvents = "";
        rightFrame.style.pointerEvents = "";
        teardownDragListeners();
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);

      state.cleanupDragListeners = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        divider.style.background = "rgba(128,128,128,0.25)";
        document.body.style.userSelect = "";
        document.body.style.cursor = "";
        leftFrame.style.pointerEvents = "";
        rightFrame.style.pointerEvents = "";
      };
    });

    const closeBtn = document.createElement("button");
    closeBtn.id = SPLIT_CLOSE_ID;
    closeBtn.type = "button";
    closeBtn.title = "Закрыть split view";
    closeBtn.style.cssText = `
      position: fixed;
      top: 8px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483646;
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px 4px 8px;
      border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(30,30,30,0.82);
      backdrop-filter: blur(6px);
      cursor: pointer;
      font-size: 12px;
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: rgba(255,255,255,0.85);
      transition: background 0.15s;
    `;
    closeBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
      </svg>
      Закрыть split
    `;

    closeBtn.addEventListener("mouseenter", () => {
      closeBtn.style.background = "rgba(60,60,60,0.9)";
    });

    closeBtn.addEventListener("mouseleave", () => {
      closeBtn.style.background = "rgba(30,30,30,0.82)";
    });

    closeBtn.addEventListener("click", () => {
      closeSplitView();
    });

    overlay.appendChild(leftWrap);
    overlay.appendChild(divider);
    overlay.appendChild(rightWrap);
    document.body.appendChild(overlay);
    document.body.appendChild(closeBtn);

    state.overlay = overlay;
    state.closeBtn = closeBtn;
  }

  function openSplitView() {
    if (state.splitActive) return;

    ensureStyle();
    state.splitActive = true;
    state.previousHtmlOverflow = document.documentElement.style.overflow;
    state.previousBodyOverflow = document.body.style.overflow;

    document.documentElement.classList.add(SPLIT_ACTIVE_CLASS);
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    removeSplitButton();
    createSplitOverlay();

    state.escapeHandler = (event) => {
      if (event.key === "Escape") closeSplitView();
    };

    document.addEventListener("keydown", state.escapeHandler, true);
  }

  function closeSplitView() {
    if (!state.splitActive) return;

    state.splitActive = false;
    teardownDragListeners();
    state.frameResizeObservers.forEach((observer) => observer.disconnect());
    state.frameResizeObservers = [];
    state.framePatchCleanups.forEach((cleanup) => cleanup());
    state.framePatchCleanups = [];

    if (state.overlay) {
      state.overlay.remove();
      state.overlay = null;
    }

    if (state.closeBtn) {
      state.closeBtn.remove();
      state.closeBtn = null;
    }

    if (state.escapeHandler) {
      document.removeEventListener("keydown", state.escapeHandler, true);
      state.escapeHandler = null;
    }

    document.documentElement.classList.remove(SPLIT_ACTIVE_CLASS);
    document.documentElement.style.overflow = state.previousHtmlOverflow;
    document.body.style.overflow = state.previousBodyOverflow;

    ensureSplitButton();
  }

  function removeSplitButton() {
    hideSplitTooltip();
    const button = document.getElementById(SPLIT_BTN_ID);
    if (button) button.remove();
  }

  function hideSplitTooltip() {
    if (!state.tooltip) return;
    state.tooltip.hidden = true;
  }

  function showSplitTooltip(button) {
    if (!button?.isConnected || state.splitActive) return;

    let tooltip = state.tooltip;
    if (!tooltip?.isConnected) {
      tooltip = document.createElement("div");
      tooltip.id = SPLIT_TOOLTIP_ID;
      tooltip.setAttribute("role", "tooltip");
      tooltip.textContent = "Открыть два чата рядом";
      tooltip.hidden = true;
      document.body.appendChild(tooltip);
      state.tooltip = tooltip;
    }

    tooltip.hidden = false;
    const rect = button.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const pad = 12;
    const left = Math.max(
      pad,
      Math.min(rect.left, window.innerWidth - tooltipRect.width - pad),
    );
    const top = Math.min(rect.bottom + 8, window.innerHeight - tooltipRect.height - pad);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(Math.max(pad, top))}px`;
  }

  function isVisibleHeaderControl(element) {
    if (!element?.isConnected || element.id === SPLIT_BTN_ID) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top < 92 &&
      rect.bottom > -4
    );
  }

  function controlLabel(element) {
    return [
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("title"),
      element.getAttribute?.("data-testid"),
      element.textContent,
    ]
      .filter(Boolean)
      .join(" ");
  }

  function findSidebarControl() {
    const selectors = [
      'button[aria-label*="sidebar" i]',
      'button[aria-label*="side bar" i]',
      'button[aria-label*="боков" i]',
      'button[aria-label*="панел" i]',
      '[data-testid*="sidebar" i] button',
      'button[data-testid*="sidebar" i]',
    ];
    const controls = Array.from(document.querySelectorAll(selectors.join(", ")))
      .filter(isVisibleHeaderControl)
      .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    return controls[0] || null;
  }

  function findLeftHeaderBoundary() {
    const viewportLimit = Math.min(520, window.innerWidth * 0.52);
    const selectors = "header button, header a, header [role='button'], button, a[role='button'], [role='button']";
    const controls = Array.from(document.querySelectorAll(selectors)).filter((element) => {
      if (!isVisibleHeaderControl(element)) return false;
      const rect = element.getBoundingClientRect();
      return rect.left < viewportLimit && !/share|подел/iu.test(controlLabel(element));
    });

    return controls.reduce((boundary, element) => {
      const rect = element.getBoundingClientRect();
      return Math.max(boundary, rect.right);
    }, 4);
  }

  function positionSplitButton() {
    const button = document.getElementById(SPLIT_BTN_ID);
    if (!button || state.splitActive) return;

    const buttonRect = button.getBoundingClientRect();
    const sidebarControl = findSidebarControl();
    const anchorRect = sidebarControl?.getBoundingClientRect();
    const boundary = anchorRect?.right || findLeftHeaderBoundary();
    const pad = 10;
    const left = Math.max(pad, Math.min(boundary + 8, window.innerWidth - buttonRect.width - pad));
    const top = anchorRect
      ? Math.max(pad, anchorRect.top + (anchorRect.height - buttonRect.height) / 2)
      : 10;

    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
    button.style.visibility = "visible";
    if (!state.tooltip?.hidden) showSplitTooltip(button);
  }

  function schedulePositionSplitButton() {
    if (state.positionTimer) return;
    state.positionTimer = window.setTimeout(() => {
      state.positionTimer = 0;
      positionSplitButton();
    }, 16);
  }

  function createSplitButton() {
    if (document.getElementById(SPLIT_BTN_ID) || state.splitActive) return;

    const button = document.createElement("button");
    button.id = SPLIT_BTN_ID;
    button.type = "button";
    button.setAttribute("aria-label", "Split view - два чата рядом");
    button.setAttribute("aria-describedby", SPLIT_TOOLTIP_ID);
    button.style.cssText = `
      position: fixed;
      top: 10px;
      left: 12px;
      z-index: 2147482990;
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 32px;
      padding: 0 10px 0 8px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, currentColor 14%, transparent);
      background: var(--main-surface-primary, rgba(255,255,255,.92));
      box-shadow: 0 1px 2px rgba(0,0,0,.05);
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      font-family: ui-sans-serif, system-ui, sans-serif;
      color: var(--text-primary, inherit);
      opacity: 1;
      transition: background 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.15s;
      pointer-events: auto;
      visibility: hidden;
    `;
    button.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="1" y="2" width="5" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
        <rect x="8" y="2" width="5" height="10" rx="1.5" stroke="currentColor" stroke-width="1.3"/>
      </svg>
      <span>Split</span>
    `;

    button.addEventListener("mouseenter", () => {
      button.style.background = "color-mix(in srgb, var(--main-surface-primary, #fff) 90%, currentColor)";
      button.style.borderColor = "color-mix(in srgb, currentColor 24%, transparent)";
      button.style.boxShadow = "0 3px 10px rgba(0,0,0,.10)";
      showSplitTooltip(button);
    });

    button.addEventListener("mouseleave", () => {
      button.style.background = "var(--main-surface-primary, rgba(255,255,255,.92))";
      button.style.borderColor = "color-mix(in srgb, currentColor 14%, transparent)";
      button.style.boxShadow = "0 1px 2px rgba(0,0,0,.05)";
      hideSplitTooltip();
    });

    button.addEventListener("focus", () => showSplitTooltip(button));
    button.addEventListener("blur", hideSplitTooltip);

    button.addEventListener("click", () => {
      hideSplitTooltip();
      openSplitView();
    });
    document.body.appendChild(button);
    schedulePositionSplitButton();
  }

  function ensureSplitButton() {
    if (!document.body || state.splitActive) return;
    createSplitButton();
    schedulePositionSplitButton();
  }

  function scheduleEnsureSplitButton() {
    if (state.ensureTimer) return;
    state.ensureTimer = window.setTimeout(() => {
      state.ensureTimer = 0;
      ensureSplitButton();
    }, 0);
  }

  function handlePossibleRouteChange() {
    if (location.href === state.lastHref) return;
    state.lastHref = location.href;
    scheduleEnsureSplitButton();
  }

  function boot() {
    ensureStyle();

    const observer = new MutationObserver(() => {
      handlePossibleRouteChange();
      if (!state.splitActive && !document.getElementById(SPLIT_BTN_ID)) {
        scheduleEnsureSplitButton();
      }
      if (!state.splitActive) schedulePositionSplitButton();
    });

    const start = () => {
      ensureSplitButton();
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    };

    window.addEventListener("pageshow", ensureSplitButton, PASSIVE);
    window.addEventListener("popstate", ensureSplitButton, PASSIVE);
    window.addEventListener("hashchange", ensureSplitButton, PASSIVE);
    window.addEventListener("resize", schedulePositionSplitButton, PASSIVE);

    start();
  }

  globalThis[BOOT_KEY] = {
    ensureSplitButton,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
