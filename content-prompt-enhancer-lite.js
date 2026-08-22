(async () => {
  "use strict";

  const BOOT_KEY = "__cgptPromptEnhancerLite__";
  const FEATURE_KEY = "promptEnhancer";
  const BUTTON_ID = "cgpt-prompt-enhancer-btn";
  const STYLE_ID = "cgpt-prompt-enhancer-lite-style";
  const PASSIVE = { passive: true };

  if (window !== window.top) return;
  if (globalThis[BOOT_KEY]) return;
  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) return;

  let busy = false;

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #${BUTTON_ID}{position:fixed;right:18px;bottom:86px;z-index:2147482990;display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;padding:0;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:999px;background:var(--main-surface-primary,#fff);color:var(--text-primary,inherit);box-shadow:0 6px 18px rgba(0,0,0,.12);font:18px/1 system-ui,sans-serif;cursor:pointer}
      #${BUTTON_ID}[disabled]{opacity:.5;cursor:wait}
      html.cgpt-split-active #${BUTTON_ID}{display:none!important}
    `;
    document.documentElement.appendChild(style);
  }

  function resolveComposer() {
    const root = document.querySelector("#prompt-textarea");
    if (root) {
      if (root.matches("textarea,[contenteditable='true']")) return root;
      const nested = root.querySelector("textarea,[contenteditable='true']");
      if (nested) return nested;
    }
    return document.querySelector("textarea[placeholder]") ||
      document.querySelector("[contenteditable='true'][role='textbox']") ||
      document.querySelector("[contenteditable='true'][data-lexical-editor='true']");
  }

  function composerText(composer) {
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) return composer.value || "";
    return composer?.textContent || "";
  }

  function setComposerText(composer, text) {
    composer.focus();
    if (composer instanceof HTMLTextAreaElement || composer instanceof HTMLInputElement) {
      const proto = composer instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) setter.call(composer, text);
      else composer.value = text;
    } else {
      const selection = getSelection();
      const range = document.createRange();
      range.selectNodeContents(composer);
      selection?.removeAllRanges();
      selection?.addRange(range);
      let inserted = false;
      try { inserted = document.execCommand("insertText", false, text); } catch (_error) {}
      if (!inserted) composer.textContent = text;
    }
    try {
      composer.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
    } catch (_error) {
      composer.dispatchEvent(new Event("input", { bubbles: true }));
    }
    composer.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function enhance() {
    if (busy) return;
    const composer = resolveComposer();
    if (!composer) return window.alert("未找到提示词输入框。");
    const text = composerText(composer);
    if (!text.trim()) return window.alert("请先输入提示词。");
    if (text.length > 50000) return window.alert("提示词过长，无法安全处理。");
    const compiler = globalThis.GPTModsPromptCompiler;
    if (!compiler?.enhancePrompt) return window.alert("本地 Prompt Compiler 未加载。");
    busy = true;
    const button = document.getElementById(BUTTON_ID);
    if (button) button.disabled = true;
    try {
      const result = compiler.enhancePrompt({ text, locale: document.documentElement.lang || navigator.language || "zh-CN" });
      if (!result.changed || result.improvedText === text) {
        window.alert("当前内容似乎无需优化。");
        return;
      }
      setComposerText(composer, result.improvedText);
    } catch (error) {
      console.warn("[GPT Mods] Prompt Compiler failed safely:", error);
      window.alert("无法优化提示词，原始文本已保留。");
    } finally {
      busy = false;
      if (button) button.disabled = false;
    }
  }

  function ensureButton() {
    ensureStyle();
    if (!document.body || document.getElementById(BUTTON_ID)) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.textContent = "✦";
    button.title = "优化提示词";
    button.setAttribute("aria-label", "优化提示词");
    button.addEventListener("click", () => void enhance());
    document.body.appendChild(button);
  }

  document.addEventListener("focusin", (event) => {
    if (event.target?.matches?.("textarea,[contenteditable='true']")) ensureButton();
  }, PASSIVE);
  window.addEventListener("pageshow", ensureButton, PASSIVE);
  window.addEventListener("popstate", ensureButton, PASSIVE);
  window.addEventListener("hashchange", ensureButton, PASSIVE);

  globalThis[BOOT_KEY] = { ensureButton, enhance };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ensureButton, { once: true });
  else ensureButton();
})();
