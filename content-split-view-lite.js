(async () => {
  "use strict";

  const BOOT_KEY = "__cgptSplitViewLite__";
  const FEATURE_KEY = "splitView";
  const BUTTON_ID = "cgpt-split-btn";
  const OVERLAY_ID = "cgpt-split-overlay";
  const CLOSE_ID = "cgpt-split-close-btn";
  const STYLE_ID = "cgpt-split-lite-style";
  const PASSIVE = { passive: true };

  if (window !== window.top) return;
  if (globalThis[BOOT_KEY]) return;
  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) return;

  const state = { active: false, cleanupDrag: null };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{position:fixed;top:10px;left:12px;z-index:2147482990;display:inline-flex;align-items:center;justify-content:center;min-height:32px;padding:0 10px;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:999px;background:var(--main-surface-primary,#fff);color:var(--text-primary,inherit);font:500 12px/1 system-ui,sans-serif;cursor:pointer}
      #${OVERLAY_ID}{position:fixed;inset:0;z-index:2147483645;display:flex;background:#111;gap:2px}
      #${CLOSE_ID}{position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:2147483647;padding:6px 11px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(24,24,24,.88);color:#fff;cursor:pointer}
      html.cgpt-split-active{overflow:hidden!important}
      html.cgpt-split-active body{overflow:hidden!important}
      html.cgpt-split-active #${BUTTON_ID}{display:none!important}
    `;
    document.documentElement.appendChild(style);
  }

  function makePane(url, label) {
    const wrap = document.createElement("div");
    wrap.style.cssText = "flex:1;min-width:0;display:flex;flex-direction:column;background:#fff";
    const bar = document.createElement("div");
    bar.style.cssText = "height:26px;display:flex;align-items:center;padding:0 10px;background:#f3f3f3;border-bottom:1px solid #ddd;color:#666;font:11px system-ui,sans-serif;flex:0 0 auto";
    bar.textContent = label;
    const frame = document.createElement("iframe");
    frame.src = url;
    frame.style.cssText = "width:100%;height:100%;border:0;display:block;flex:1 1 auto;background:#fff";
    frame.setAttribute("allow", "clipboard-read; clipboard-write");
    wrap.append(bar, frame);
    return { wrap, frame };
  }

  function closeSplit() {
    if (!state.active) return;
    state.active = false;
    state.cleanupDrag?.();
    state.cleanupDrag = null;
    document.getElementById(OVERLAY_ID)?.remove();
    document.getElementById(CLOSE_ID)?.remove();
    document.documentElement.classList.remove("cgpt-split-active");
    ensureButton();
  }

  function openSplit() {
    if (state.active || !document.body) return;
    state.active = true;
    document.documentElement.classList.add("cgpt-split-active");
    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    const left = makePane(location.href, "聊天 1");
    const right = makePane(new URL("/", location.origin).toString(), "聊天 2");
    const divider = document.createElement("div");
    divider.style.cssText = "width:5px;flex:0 0 5px;cursor:col-resize;background:#777";
    divider.addEventListener("mousedown", (event) => {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = left.wrap.getBoundingClientRect().width;
      left.frame.style.pointerEvents = "none";
      right.frame.style.pointerEvents = "none";
      const move = (moveEvent) => {
        const total = overlay.clientWidth - 5;
        const width = Math.max(260, Math.min(total - 260, startWidth + moveEvent.clientX - startX));
        left.wrap.style.flex = `0 0 ${width}px`;
        right.wrap.style.flex = "1 1 auto";
      };
      const stop = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", stop);
        left.frame.style.pointerEvents = "";
        right.frame.style.pointerEvents = "";
        state.cleanupDrag = null;
      };
      state.cleanupDrag = stop;
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", stop);
    });
    overlay.append(left.wrap, divider, right.wrap);
    const close = document.createElement("button");
    close.id = CLOSE_ID;
    close.type = "button";
    close.textContent = "关闭分屏";
    close.addEventListener("click", closeSplit);
    document.body.append(overlay, close);
  }

  function ensureButton() {
    ensureStyle();
    if (state.active || !document.body || document.getElementById(BUTTON_ID)) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "分屏";
    button.setAttribute("aria-label", "分屏视图 - 并排显示两个聊天");
    button.addEventListener("click", openSplit);
    document.body.appendChild(button);
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.active) closeSplit();
  }, true);
  window.addEventListener("pageshow", ensureButton, PASSIVE);
  window.addEventListener("popstate", ensureButton, PASSIVE);
  window.addEventListener("hashchange", ensureButton, PASSIVE);

  globalThis[BOOT_KEY] = { ensureButton, openSplit, closeSplit };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureButton, { once: true });
  else ensureButton();
})();
