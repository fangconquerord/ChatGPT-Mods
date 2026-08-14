(async () => {
  "use strict";

  const BOOT_KEY = "__cgptPromptEnhancer__";
  const FEATURE_KEY = "promptEnhancer";
  const STYLE_ID = "cgpt-prompt-enhancer-style";
  const BUTTON_ATTR = "data-cgpt-prompt-enhancer";
  const TOAST_ATTR = "data-cgpt-prompt-enhancer-toast";
  const SHRINK_ATTR = "data-cgpt-prompt-enhancer-shrink";
  const PASSIVE = { passive: true };
  const ENHANCED_SECTION_PATTERN =
    /(^|\n)\s*(Задача|Task|Что важно учесть|What to cover|Ожидаемый результат|Expected result|План ответа|Answer plan)\s*:/iu;

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

  const state = {
    button: null,
    toast: null,
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
    return (text || "")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isEnhancedPrompt(text) {
    return ENHANCED_SECTION_PATTERN.test(text || "");
  }

  function validateDraft(rawText) {
    const text = String(rawText || "");
    if (!text.trim()) return { ok: false, message: "Сначала напишите запрос." };
    if (text.trim().length < 2) return { ok: false, message: "Похоже, тут нечего улучшать." };
    if (text.length > 50000) return { ok: false, message: "Запрос слишком длинный для безопасной обработки." };
    const controlCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
    if (controlCount > Math.max(3, text.length * 0.02)) {
      return { ok: false, message: "Запрос содержит повреждённые данные." };
    }
    return { ok: true, message: "" };
  }

  function compileDraft(rawText) {
    const compiler = globalThis.GPTModsPromptCompiler;
    if (!compiler?.enhancePrompt) {
      throw new Error("Локальный Prompt Compiler не загружен");
    }
    return compiler.enhancePrompt({
      text: rawText,
      locale: document.documentElement.lang || navigator.language || "ru",
    });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .cgpt-prompt-enhancer-btn {
        position: fixed;
        z-index: 2147483646;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border-radius: 999px;
        border: 1px solid rgba(0,0,0,.10);
        background: rgba(255,255,255,.92);
        color: rgba(32,33,35,.86);
        box-shadow: 0 8px 24px rgba(0,0,0,.12);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        cursor: pointer;
        padding: 0;
        font: 18px/1 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        right: auto !important;
        bottom: auto !important;
        transform: none !important;
        transition: background .16s ease, color .16s ease, border-color .16s ease, box-shadow .16s ease, opacity .16s ease;
      }

      .cgpt-prompt-enhancer-btn[hidden],
      .cgpt-prompt-enhancer-toast[hidden] {
        display: none !important;
      }

      .cgpt-prompt-enhancer-btn:hover {
        background: rgba(247,247,248,.98);
        border-color: rgba(0,0,0,.16);
        box-shadow: 0 10px 28px rgba(0,0,0,.16);
      }

      .cgpt-prompt-enhancer-btn:active {
        background: rgba(242,242,243,.98);
      }

      .cgpt-prompt-enhancer-btn.is-loading {
        pointer-events: none;
        color: rgb(37,99,235);
      }

      .cgpt-prompt-enhancer-btn.is-loading:before {
        content: "";
        position: absolute;
        inset: -4px;
        border-radius: inherit;
        border: 2px solid transparent;
        border-top-color: rgb(37,99,235);
        border-right-color: rgba(37,99,235,.35);
        animation: cgpt-prompt-enhancer-spin .85s linear infinite;
      }

      .cgpt-prompt-enhancer-btn svg {
        display: block;
        width: 19px;
        height: 19px;
        stroke: currentColor;
      }

      .cgpt-prompt-enhancer-toast {
        position: fixed;
        z-index: 2147483646;
        max-width: min(280px, calc(100vw - 24px));
        padding: 8px 10px;
        border-radius: 10px;
        border: 1px solid rgba(0,0,0,.08);
        background: rgba(255,255,255,.96);
        color: rgba(32,33,35,.82);
        box-shadow: 0 10px 28px rgba(0,0,0,.14);
        -webkit-backdrop-filter: blur(10px);
        backdrop-filter: blur(10px);
        font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
        opacity: 0;
        transform: translateY(4px);
        pointer-events: none;
        transition: opacity .14s ease, transform .14s ease;
        white-space: normal;
      }

      .cgpt-prompt-enhancer-toast.is-on {
        opacity: 1;
        transform: translateY(0);
      }

      html.dark .cgpt-prompt-enhancer-btn,
      body.dark .cgpt-prompt-enhancer-btn,
      html[data-theme="dark"] .cgpt-prompt-enhancer-btn,
      body[data-theme="dark"] .cgpt-prompt-enhancer-btn,
      html[data-ds-dark-theme] .cgpt-prompt-enhancer-btn {
        border-color: rgba(255,255,255,.12);
        background: rgba(33,33,35,.88);
        color: rgba(248,250,255,.88);
        box-shadow: 0 10px 28px rgba(0,0,0,.38);
      }

      html.dark .cgpt-prompt-enhancer-btn:hover,
      body.dark .cgpt-prompt-enhancer-btn:hover,
      html[data-theme="dark"] .cgpt-prompt-enhancer-btn:hover,
      body[data-theme="dark"] .cgpt-prompt-enhancer-btn:hover,
      html[data-ds-dark-theme] .cgpt-prompt-enhancer-btn:hover {
        background: rgba(42,42,45,.96);
        border-color: rgba(255,255,255,.18);
      }

      html.dark .cgpt-prompt-enhancer-toast,
      body.dark .cgpt-prompt-enhancer-toast,
      html[data-theme="dark"] .cgpt-prompt-enhancer-toast,
      body[data-theme="dark"] .cgpt-prompt-enhancer-toast,
      html[data-ds-dark-theme] .cgpt-prompt-enhancer-toast {
        border-color: rgba(255,255,255,.10);
        background: rgba(33,33,35,.94);
        color: rgba(248,250,255,.82);
        box-shadow: 0 12px 30px rgba(0,0,0,.42);
      }

      @keyframes cgpt-prompt-enhancer-spin {
        to { transform: rotate(360deg); }
      }
    `;

    document.documentElement.appendChild(style);
  }

  function resolveComposerElement() {
    const direct = document.querySelector("#prompt-textarea");
    if (direct) {
      if (direct.matches("textarea, [contenteditable='true']")) return direct;
      const nested = direct.querySelector("[contenteditable='true'], textarea");
      if (nested) return nested;
    }

    return (
      document.querySelector("textarea[placeholder]") ||
      document.querySelector("[contenteditable='true'][role='textbox']") ||
      document.querySelector("[contenteditable='true'][data-lexical-editor='true']") ||
      document.querySelector("div[contenteditable='true']")
    );
  }

  function locateComposerSurface(composer) {
    if (!composer) return null;
    const form = composer.closest("form");
    if (form) return form;

    const composerRect = composer.getBoundingClientRect();
    let node = composer;
    let best = composer;

    for (let depth = 0; node && node !== document.body && depth < 10; depth += 1) {
      const rect = node.getBoundingClientRect();
      const hasButton = Boolean(node.querySelector?.("button"));
      const wrapsComposer =
        rect.left <= composerRect.left + 2 &&
        rect.right >= composerRect.right - 2 &&
        rect.top <= composerRect.top + 2 &&
        rect.bottom >= composerRect.bottom - 2;
      const reasonableHeight =
        rect.height >= composerRect.height &&
        rect.height <= Math.max(220, composerRect.height + 120);
      const reasonableWidth =
        rect.width >= composerRect.width &&
        rect.width <= Math.min(window.innerWidth - 24, Math.max(940, composerRect.width + 320));

      if (hasButton && wrapsComposer && reasonableHeight && reasonableWidth) {
        best = node;
      }

      node = node.parentElement;
    }

    return best;
  }

  function getComposerText(el) {
    if (!el) return "";
    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      return el.value || "";
    }
    return el.innerText || el.textContent || "";
  }

  function mountButtonFixed(button) {
    if (!button) return;
    if (button.parentElement !== document.body) {
      document.body.appendChild(button);
    }
  }

  function getDocumentZoomScale() {
    const raw =
      document.documentElement.style.zoom ||
      window.getComputedStyle(document.documentElement).zoom;
    const scale = Number.parseFloat(raw);
    return Number.isFinite(scale) && scale > 0 ? scale : 1;
  }

  function getVisualViewportWidth(scale = getDocumentZoomScale()) {
    return window.innerWidth * scale;
  }

  function getVisualViewportHeight(scale = getDocumentZoomScale()) {
    return window.innerHeight * scale;
  }

  function restoreComposerShrink() {
    const target = state.shrinkTarget;
    const snapshot = state.shrinkSnapshot;
    if (!target || !snapshot) return;

    target.style.maxWidth = snapshot.maxWidth;
    target.style.width = snapshot.width;
    target.style.marginInlineEnd = snapshot.marginInlineEnd;
    target.removeAttribute(SHRINK_ATTR);

    state.shrinkTarget = null;
    state.shrinkSnapshot = null;
  }

  function findComposerShrinkTarget(surface) {
    if (!surface) return null;

    let node = surface;
    for (let depth = 0; node && node !== document.body && depth < 4; depth += 1) {
      const rect = node.getBoundingClientRect();
      if (rect.width >= surface.getBoundingClientRect().width - 2) {
        return node;
      }
      node = node.parentElement;
    }

    return surface;
  }

  function applyComposerShrink(surface, neededSpace, scale = getDocumentZoomScale()) {
    if (!surface || neededSpace <= 0) return surface.getBoundingClientRect();

    const target = findComposerShrinkTarget(surface);
    if (!target) return surface.getBoundingClientRect();

    if (state.shrinkTarget && state.shrinkTarget !== target) {
      restoreComposerShrink();
    }

    if (!state.shrinkSnapshot) {
      state.shrinkTarget = target;
      state.shrinkSnapshot = {
        maxWidth: target.style.maxWidth,
        width: target.style.width,
        marginInlineEnd: target.style.marginInlineEnd,
      };
    }

    const rect = target.getBoundingClientRect();
    const nextWidth = Math.max(
      260,
      Math.floor((rect.width - neededSpace) / scale),
    );
    const margin = Math.ceil(neededSpace / scale);
    target.style.maxWidth = `${nextWidth}px`;
    target.style.width = `min(100%, ${nextWidth}px)`;
    target.style.marginInlineEnd = `${margin}px`;
    target.setAttribute(SHRINK_ATTR, "1");

    return surface.getBoundingClientRect();
  }

  function dispatchInputLikeEvents(target, text) {
    const host = target.closest?.("#prompt-textarea") || target;

    [target, host].forEach((el) => {
      try {
        el.dispatchEvent(
          new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            data: text,
            inputType: "insertText",
          }),
        );
      } catch (_error) {}

      try {
        el.dispatchEvent(
          new InputEvent("input", {
            bubbles: true,
            data: text,
            inputType: "insertText",
          }),
        );
      } catch (_error) {
        try {
          el.dispatchEvent(new Event("input", { bubbles: true }));
        } catch (_innerError) {}
      }

      try {
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } catch (_error) {}
    });
  }

  function setComposerValue(el, text) {
    if (!el) return false;
    el.focus();

    if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
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
      try {
        el.textContent = text;
      } catch (_error) {}
    }

    dispatchInputLikeEvents(el, text);
    const finalText = normalizeText(el.innerText || el.textContent || "");
    return finalText.includes(normalizeText(text).slice(0, 50));
  }

  function isVisibleElement(el) {
    if (!el?.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const styles = window.getComputedStyle(el);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.bottom > 0 &&
      rect.top < window.innerHeight &&
      styles.display !== "none" &&
      styles.visibility !== "hidden"
    );
  }

  function ensureButton() {
    if (state.button?.isConnected) return state.button;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "cgpt-prompt-enhancer-btn";
    button.setAttribute(BUTTON_ATTR, "1");
    button.setAttribute("aria-label", "Улучшить запрос");
    button.title = "Улучшить запрос";
    button.innerHTML = `
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4.2 19.8 5.9 14l10.7-10.7a2.1 2.1 0 0 1 3 3L8.9 17z"></path>
        <path d="M5.9 14 9 17.1"></path>
        <path d="M15.3 4.6 18.4 7.7"></path>
        <path d="M4.2 19.8 8.9 17"></path>
      </svg>
    `;
    button.hidden = true;

    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });

    button.addEventListener("click", (event) => {
      event.preventDefault();
      void enhanceCurrentPrompt();
    });

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
    const toast = state.toast;
    const button = state.button;
    if (!toast || !button || button.hidden) return;

    const zoomScale = getDocumentZoomScale();
    toast.style.zoom = "";

    const buttonRect = button.getBoundingClientRect();
    const toastRect = toast.getBoundingClientRect();
    const pad = 10;
    const viewportWidth = getVisualViewportWidth(zoomScale);
    const viewportHeight = getVisualViewportHeight(zoomScale);
    let left = buttonRect.right + 10;
    let top = buttonRect.top + buttonRect.height / 2 - toastRect.height / 2;

    if (left + toastRect.width > viewportWidth - pad) {
      left = buttonRect.left - toastRect.width - 10;
    }
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    if (top + toastRect.height > viewportHeight - pad) {
      top = viewportHeight - toastRect.height - pad;
    }

    toast.style.left = `${Math.round(left / zoomScale)}px`;
    toast.style.top = `${Math.round(top / zoomScale)}px`;
  }

  function showToast(message) {
    const toast = ensureToast();
    toast.textContent = message;
    toast.hidden = false;

    requestAnimationFrame(() => {
      positionToastNearButton();
      toast.classList.add("is-on");
    });

    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-on");
      state.toastTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, 160);
    }, 2600);
  }

  function updateButtonPosition() {
    state.positionScheduled = false;
    ensureStyle();

    const button = ensureButton();
    const composer = resolveComposerElement();

    if (!composer || !isVisibleElement(composer)) {
      button.hidden = true;
      button.style.width = "";
      button.style.height = "";
      restoreComposerShrink();
      return;
    }

    const surface = locateComposerSurface(composer);
    mountButtonFixed(button);
    restoreComposerShrink();

    const zoomScale = getDocumentZoomScale();
    const buttonSize = 36;
    const pad = 8;
    const gap = 10;
    const viewportWidth = getVisualViewportWidth(zoomScale);
    const viewportHeight = getVisualViewportHeight(zoomScale);
    let rect = surface.getBoundingClientRect();
    const neededSpace = rect.right + gap + buttonSize - (viewportWidth - pad);

    if (neededSpace > 0) {
      rect = applyComposerShrink(surface, neededSpace + gap, zoomScale);
    }

    button.style.zoom = "";
    button.style.width = zoomScale < 0.999 ? `${buttonSize / zoomScale}px` : "";
    button.style.height = zoomScale < 0.999 ? `${buttonSize / zoomScale}px` : "";

    let left = rect.right + gap;
    left = Math.max(pad, Math.min(left, viewportWidth - buttonSize - pad));

    const preferredTop = rect.top + rect.height / 2 - buttonSize / 2;
    const top = Math.max(
      pad,
      Math.min(
        preferredTop,
        viewportHeight - buttonSize - pad,
      ),
    );

    button.style.left = `${Math.round(left / zoomScale)}px`;
    button.style.top = `${Math.round(top / zoomScale)}px`;
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
    if (!composer) {
      showToast("Поле запроса не найдено.");
      return;
    }

    const originalText = getComposerText(composer);
    const normalizedOriginal = normalizeText(originalText);
    if (
      normalizedOriginal &&
      (normalizedOriginal === state.lastEnhancedText || isEnhancedPrompt(originalText))
    ) {
      showToast("Запрос уже улучшен.");
      return;
    }

    const validation = validateDraft(originalText);
    if (!validation.ok) {
      showToast(validation.message);
      return;
    }

    state.busy = true;
    state.button?.classList.add("is-loading");
    await Promise.resolve();

    try {
      const result = compileDraft(originalText);
      if (!result.changed || normalizeText(result.improvedText) === normalizedOriginal) {
        showToast("Похоже, тут нечего улучшать.");
        return;
      }

      const ok = setComposerValue(composer, result.improvedText);
      if (ok) state.lastEnhancedText = normalizeText(result.improvedText);
      showToast(ok ? "Запрос улучшен. Отменить можно через Ctrl+Z." : "Не получилось заменить текст запроса.");
    } catch (error) {
      console.warn("[GPT Mods] Prompt Compiler failed safely:", error);
      showToast("Не удалось улучшить запрос. Исходный текст сохранён.");
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
    schedulePosition();
  }

  function scheduleRun() {
    if (state.runTimer) return;
    state.runTimer = window.setTimeout(() => {
      state.runTimer = 0;
      run();
    }, 180);
  }

  function boot() {
    run();

    if (!state.observer) {
      state.observer = new MutationObserver(scheduleRun);
      state.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    window.addEventListener("resize", schedulePosition, PASSIVE);
    window.addEventListener("scroll", schedulePosition, PASSIVE);
    document.addEventListener("input", schedulePosition, PASSIVE);
    document.addEventListener("focusin", schedulePosition, PASSIVE);
    window.addEventListener("pageshow", scheduleRun, PASSIVE);
    window.addEventListener("popstate", scheduleRun, PASSIVE);
    window.addEventListener("hashchange", scheduleRun, PASSIVE);
  }

  globalThis[BOOT_KEY] = {
    scheduleRun,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
