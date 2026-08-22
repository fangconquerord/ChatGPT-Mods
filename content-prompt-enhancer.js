(async () => {
  "use strict";

  const BOOT_KEY = "__cgptPromptEnhancer__";
  const FEATURE_KEY = "promptEnhancer";
  const STYLE_ID = "cgpt-prompt-enhancer-style";
  const BUTTON_ATTR = "data-cgpt-prompt-enhancer";
  const TOAST_ATTR = "data-cgpt-prompt-enhancer-toast";
  const SHRINK_ATTR = "data-cgpt-prompt-enhancer-shrink";
  const PASSIVE = { passive: true };
  const COMPOSER_SELECTOR = "#prompt-textarea,form,textarea[placeholder],[contenteditable='true'][role='textbox'],[contenteditable='true'][data-lexical-editor='true']";
  const ENHANCED_SECTION_PATTERN = /(^|\n)\s*(Задача|Task|Что важно учесть|What to cover|Ожидаемый результат|Expected result|План ответа|Answer plan)\s*:/iu;

  if (globalThis.CGPT_FEATURE_SETTINGS?.isEnabled && !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))) return;
  if (globalThis[BOOT_KEY]?.scheduleRun) {
    globalThis[BOOT_KEY].scheduleRun();
    return;
  }

  const state = {
    button: null,
    toast: null,
    composer: null,
    observer: null,
    runTimer: 0,
    toastTimer: 0,
    positionScheduled: false,
    busy: false,
    lastEnhancedText: "",
    shrinkTarget: null,
    shrinkSnapshot: null,
  };

  function normalizeText(text) {
    return (text || "").replace(/\u00a0/g, " ").replace(/[\u200B\uFEFF]/g, "").replace(/\s+/g, " ").trim();
  }

  function isEnhancedPrompt(text) {
    return ENHANCED_SECTION_PATTERN.test(text || "");
  }

  function validateDraft(rawText) {
    const text = String(rawText || "");
    if (!text.trim()) return { ok: false, message: "请先输入提示词。" };
    if (text.trim().length < 2) return { ok: false, message: "当前内容似乎无需优化。" };
    if (text.length > 50000) return { ok: false, message: "提示词过长，无法安全处理。" };
    const controlCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
    if (controlCount > Math.max(3, text.length * 0.02)) return { ok: false, message: "提示词包含异常数据。" };
    return { ok: true, message: "" };
  }

  function compileDraft(rawText) {
    const compiler = globalThis.GPTModsPromptCompiler;
    if (!compiler?.enhancePrompt) throw new Error("本地 Prompt Compiler 未加载");
    return compiler.enhancePrompt({ text: rawText, locale: document.documentElement.lang || navigator.language || "zh-CN" });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .cgpt-prompt-enhancer-btn { position:fixed;z-index:2147483646;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:999px;border:1px solid rgba(0,0,0,.10);background:rgba(255,255,255,.92);color:rgba(32,33,35,.86);box-shadow:0 8px 24px rgba(0,0,0,.12);backdrop-filter:blur(10px);cursor:pointer;padding:0;font:18px/1 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;right:auto!important;bottom:auto!important;transform:none!important; }
      .cgpt-prompt-enhancer-btn[hidden],.cgpt-prompt-enhancer-toast[hidden] { display:none!important; }
      .cgpt-prompt-enhancer-btn.is-loading { pointer-events:none;color:rgb(37,99,235); }
      .cgpt-prompt-enhancer-btn.is-loading:before { content:"";position:absolute;inset:-4px;border-radius:inherit;border:2px solid transparent;border-top-color:rgb(37,99,235);animation:cgpt-prompt-enhancer-spin .85s linear infinite; }
      .cgpt-prompt-enhancer-btn svg { width:19px;height:19px;stroke:currentColor; }
      .cgpt-prompt-enhancer-toast { position:fixed;z-index:2147483646;max-width:min(280px,calc(100vw - 24px));padding:8px 10px;border-radius:10px;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.96);color:rgba(32,33,35,.82);box-shadow:0 10px 28px rgba(0,0,0,.14);font:12px/1.35 ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;opacity:0;transform:translateY(4px);pointer-events:none;transition:opacity .14s ease,transform .14s ease; }
      .cgpt-prompt-enhancer-toast.is-on { opacity:1;transform:translateY(0); }
      html.dark .cgpt-prompt-enhancer-btn,html[data-theme="dark"] .cgpt-prompt-enhancer-btn,html[data-ds-dark-theme] .cgpt-prompt-enhancer-btn { border-color:rgba(255,255,255,.12);background:rgba(33,33,35,.88);color:rgba(248,250,255,.88); }
      html.dark .cgpt-prompt-enhancer-toast,html[data-theme="dark"] .cgpt-prompt-enhancer-toast,html[data-ds-dark-theme] .cgpt-prompt-enhancer-toast { border-color:rgba(255,255,255,.10);background:rgba(33,33,35,.94);color:rgba(248,250,255,.82); }
      @keyframes cgpt-prompt-enhancer-spin { to { transform:rotate(360deg); } }
    `;
    document.documentElement.appendChild(style);
  }

  function resolveComposerElement() {
    if (state.composer?.isConnected) return state.composer;
    const direct = document.querySelector("#prompt-textarea");
    let composer = null;
    if (direct) {
      composer = direct.matches("textarea, [contenteditable='true']") ? direct : direct.querySelector("[contenteditable='true'], textarea");
    }
    composer ||= document.querySelector("textarea[placeholder]") ||
      document.querySelector("[contenteditable='true'][role='textbox']") ||
      document.querySelector("[contenteditable='true'][data-lexical-editor='true']") ||
      document.querySelector("div[contenteditable='true']");
    state.composer = composer || null;
    return state.composer;
  }

  function locateComposerSurface(composer) {
    if (!composer) return null;
    const form = composer.closest("form");
    if (form) return form;
    const composerRect = composer.getBoundingClientRect();
    let node = composer;
    let best = composer;
    for (let depth = 0; node && node !== document.body && depth < 8; depth += 1) {
      const rect = node.getBoundingClientRect();
      if (node.querySelector?.("button") && rect.left <= composerRect.left + 2 && rect.right >= composerRect.right - 2 && rect.height <= Math.max(220, composerRect.height + 120)) best = node;
      node = node.parentElement;
    }
    return best;
  }

  function getComposerText(el) {
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) return el.value || "";
    return el?.innerText || el?.textContent || "";
  }

  function getDocumentZoomScale() {
    const scale = Number.parseFloat(document.documentElement.style.zoom || getComputedStyle(document.documentElement).zoom);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function restoreComposerShrink() {
    if (!state.shrinkTarget || !state.shrinkSnapshot) return;
    state.shrinkTarget.style.maxWidth = state.shrinkSnapshot.maxWidth;
    state.shrinkTarget.style.width = state.shrinkSnapshot.width;
    state.shrinkTarget.style.marginInlineEnd = state.shrinkSnapshot.marginInlineEnd;
    state.shrinkTarget.removeAttribute(SHRINK_ATTR);
    state.shrinkTarget = null;
    state.shrinkSnapshot = null;
  }

  function applyComposerShrink(surface, neededSpace, scale) {
    if (neededSpace <= 0) return surface.getBoundingClientRect();
    const target = surface;
    if (!state.shrinkSnapshot) {
      state.shrinkTarget = target;
      state.shrinkSnapshot = { maxWidth: target.style.maxWidth, width: target.style.width, marginInlineEnd: target.style.marginInlineEnd };
    }
    const rect = target.getBoundingClientRect();
    const width = Math.max(260, Math.floor((rect.width - neededSpace) / scale));
    target.style.maxWidth = `${width}px`;
    target.style.width = `min(100%, ${width}px)`;
    target.style.marginInlineEnd = `${Math.ceil(neededSpace / scale)}px`;
    target.setAttribute(SHRINK_ATTR, "1");
    return surface.getBoundingClientRect();
  }

  function dispatchInputLikeEvents(target, text) {
    const host = target.closest?.("#prompt-textarea") || target;
    [target, host].forEach((el) => {
      try { el.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, data: text, inputType: "insertText" })); } catch (_error) {}
      try { el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" })); }
      catch (_error) { el.dispatchEvent(new Event("input", { bubbles: true })); }
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
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(el);
      selection?.removeAllRanges();
      selection?.addRange(range);
      inserted = document.execCommand("insertText", false, text);
    } catch (_error) {}
    if (!inserted) el.textContent = text;
    dispatchInputLikeEvents(el, text);
    return normalizeText(el.innerText || el.textContent || "").includes(normalizeText(text).slice(0, 50));
  }

  function isVisibleElement(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const styles = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight && styles.display !== "none" && styles.visibility !== "hidden";
  }

  function ensureButton() {
    if (state.button?.isConnected) return state.button;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cgpt-prompt-enhancer-btn";
    button.setAttribute(BUTTON_ATTR, "1");
    button.setAttribute("aria-label", "优化提示词");
    button.title = "优化提示词";
    button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M4.2 19.8 5.9 14l10.7-10.7a2.1 2.1 0 0 1 3 3L8.9 17z"></path><path d="M5.9 14 9 17.1"></path></svg>`;
    button.hidden = true;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", (event) => { event.preventDefault(); void enhanceCurrentPrompt(); });
    document.body.appendChild(button);
    state.button = button;
    return button;
  }

  function ensureToast() {
    if (state.toast?.isConnected) return state.toast;
    const toast = document.createElement("div");
    toast.className = "cgpt-prompt-enhancer-toast";
    toast.setAttribute(TOAST_ATTR, "1");
    toast.hidden = true;
    document.body.appendChild(toast);
    state.toast = toast;
    return toast;
  }

  function positionToastNearButton() {
    const { toast, button } = state;
    if (!toast || !button || button.hidden) return;
    const scale = getDocumentZoomScale();
    const buttonRect = button.getBoundingClientRect();
    const toastRect = toast.getBoundingClientRect();
    const width = innerWidth * scale;
    const height = innerHeight * scale;
    let left = buttonRect.right + 10;
    if (left + toastRect.width > width - 10) left = buttonRect.left - toastRect.width - 10;
    const top = Math.max(10, Math.min(buttonRect.top + buttonRect.height / 2 - toastRect.height / 2, height - toastRect.height - 10));
    toast.style.left = `${Math.round(Math.max(10, left) / scale)}px`;
    toast.style.top = `${Math.round(top / scale)}px`;
  }

  function showToast(message) {
    const toast = ensureToast();
    toast.textContent = message;
    toast.hidden = false;
    requestAnimationFrame(() => { positionToastNearButton(); toast.classList.add("is-on"); });
    clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-on");
      state.toastTimer = window.setTimeout(() => { toast.hidden = true; }, 160);
    }, 2600);
  }

  function updateButtonPosition() {
    state.positionScheduled = false;
    ensureStyle();
    const button = ensureButton();
    const composer = resolveComposerElement();
    if (!composer || !isVisibleElement(composer)) {
      button.hidden = true;
      restoreComposerShrink();
      return;
    }
    const surface = locateComposerSurface(composer);
    if (!surface) return;
    restoreComposerShrink();
    const scale = getDocumentZoomScale();
    const size = 36;
    const gap = 10;
    const pad = 8;
    const viewportWidth = innerWidth * scale;
    const viewportHeight = innerHeight * scale;
    let rect = surface.getBoundingClientRect();
    const neededSpace = rect.right + gap + size - (viewportWidth - pad);
    if (neededSpace > 0) rect = applyComposerShrink(surface, neededSpace + gap, scale);
    button.style.left = `${Math.round(Math.max(pad, Math.min(rect.right + gap, viewportWidth - size - pad)) / scale)}px`;
    button.style.top = `${Math.round(Math.max(pad, Math.min(rect.top + rect.height / 2 - size / 2, viewportHeight - size - pad)) / scale)}px`;
    button.hidden = false;
    positionToastNearButton();
  }

  function schedulePosition() {
    if (state.positionScheduled) return;
    state.positionScheduled = true;
    requestAnimationFrame(updateButtonPosition);
  }

  async function enhanceCurrentPrompt() {
    if (state.busy) return;
    const composer = resolveComposerElement();
    if (!composer) return showToast("未找到提示词输入框。");
    const originalText = getComposerText(composer);
    const normalizedOriginal = normalizeText(originalText);
    if (normalizedOriginal && (normalizedOriginal === state.lastEnhancedText || isEnhancedPrompt(originalText))) return showToast("提示词已经优化过了。");
    const validation = validateDraft(originalText);
    if (!validation.ok) return showToast(validation.message);
    state.busy = true;
    state.button?.classList.add("is-loading");
    await Promise.resolve();
    try {
      const result = compileDraft(originalText);
      if (!result.changed || normalizeText(result.improvedText) === normalizedOriginal) return showToast("当前内容似乎无需优化。");
      const ok = setComposerValue(composer, result.improvedText);
      if (ok) state.lastEnhancedText = normalizeText(result.improvedText);
      showToast(ok ? "提示词已优化，可按 Ctrl+Z 撤销。" : "无法替换提示词文本。");
    } catch (error) {
      console.warn("[GPT Mods] Prompt Compiler failed safely:", error);
      showToast("无法优化提示词，原始文本已保留。");
    } finally {
      state.busy = false;
      state.button?.classList.remove("is-loading");
      schedulePosition();
    }
  }

  function run() {
    ensureStyle();
    ensureButton();
    ensureToast();
    state.composer = null;
    resolveComposerElement();
    schedulePosition();
  }

  function scheduleRun() {
    if (state.runTimer) return;
    state.runTimer = window.setTimeout(() => { state.runTimer = 0; run(); }, 100);
  }

  function nodeTouchesComposer(node) {
    if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;
    return Boolean(node.matches?.(COMPOSER_SELECTOR) || node.querySelector?.(COMPOSER_SELECTOR));
  }

  function boot() {
    run();
    state.observer = new MutationObserver((mutations) => {
      if (state.button?.isConnected && state.composer?.isConnected) return;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes || []) {
          if (nodeTouchesComposer(node)) {
            state.composer = null;
            scheduleRun();
            return;
          }
        }
      }
    });
    state.observer.observe(document.documentElement, { childList: true, subtree: true });
    window.addEventListener("resize", schedulePosition, PASSIVE);
    window.addEventListener("scroll", schedulePosition, PASSIVE);
    document.addEventListener("input", (event) => {
      if (event.target === state.composer || state.composer?.contains?.(event.target)) schedulePosition();
    }, PASSIVE);
    document.addEventListener("focusin", (event) => {
      if (event.target === state.composer || state.composer?.contains?.(event.target)) schedulePosition();
    }, PASSIVE);
    window.addEventListener("pageshow", scheduleRun, PASSIVE);
    window.addEventListener("popstate", scheduleRun, PASSIVE);
    window.addEventListener("hashchange", scheduleRun, PASSIVE);
  }

  globalThis[BOOT_KEY] = { scheduleRun };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
