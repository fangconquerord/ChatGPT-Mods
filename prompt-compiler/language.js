(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function countMatches(text, pattern) {
    return (String(text || "").match(pattern) || []).length;
  }

  function detectLanguage(text, locale, aliases) {
    const value = String(text || "").replace(/\uE000GPTMODS_[A-Z_]+_\d{4}\uE001/g, " ");
    const cyrillic = countMatches(value, /[А-Яа-яЁё]/g);
    const latin = countMatches(value, /[A-Za-z]/g);
    const lower = value.toLocaleLowerCase();
    const ruWords = (aliases?.ru?.languageMarkers || []).filter((word) => lower.includes(word)).length;
    const enWords = (aliases?.en?.languageMarkers || []).filter((word) => lower.includes(word)).length;
    const ruScore = cyrillic * 1.4 + ruWords * 4;
    const enScore = latin + enWords * 4;

    if (ruScore === 0 && enScore === 0) {
      return String(locale || "").toLowerCase().startsWith("ru") ? "ru" : "en";
    }
    return ruScore >= enScore ? "ru" : "en";
  }

  core.components.language = { detectLanguage };
})();
