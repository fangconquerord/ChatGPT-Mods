(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function normalizePlainText(text) {
    return String(text || "")
      .normalize("NFC")
      .replace(/\u00a0/g, " ")
      .replace(/[\u200B\uFEFF]/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]+([,.;!?])/g, "$1")
      .replace(/([!?])\1{2,}/g, "$1$1")
      .trim();
  }

  function normalizeForComparison(text) {
    return normalizePlainText(text).replace(/\s+/g, " ").toLocaleLowerCase();
  }

  function deduplicateParagraphs(text) {
    const seen = new Set();
    return String(text || "")
      .split(/\n{2,}/)
      .filter((paragraph) => {
        const key = normalizeForComparison(paragraph);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .join("\n\n");
  }

  core.components.normalization = {
    deduplicateParagraphs,
    normalizeForComparison,
    normalizePlainText,
  };
})();
