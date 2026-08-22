(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  const TOKEN_PATTERN = /\uE000GPTMODS_([A-Z_]+)_(\d{4})\uE001/g;
  const MAX_MATCHES_PER_PATTERN = 256;
  const MAX_TOTAL_MATCHES = 512;
  let cachedDefinitions = null;
  let cachedPatterns = null;

  function assertSafePattern(definition) {
    if (!definition || typeof definition.id !== "string") {
      throw new Error("Protected pattern must have a stable id");
    }
    if (typeof definition.pattern !== "string" || definition.pattern.length > 700) {
      throw new Error(`Protected pattern ${definition.id} is invalid or too long`);
    }
    if (/\\[1-9]|\(\?<[=!]/.test(definition.pattern)) {
      throw new Error(`Protected pattern ${definition.id} uses a disallowed construct`);
    }
    const flags = String(definition.flags || "gu");
    if (!flags.includes("g") || /[^dgimsuvy]/.test(flags)) {
      throw new Error(`Protected pattern ${definition.id} has unsafe flags`);
    }
  }

  function compilePatterns(definitions) {
    if (definitions === cachedDefinitions && cachedPatterns) return cachedPatterns;

    const compiled = (definitions || []).map((definition) => {
      assertSafePattern(definition);
      try {
        return {
          ...definition,
          regex: new RegExp(definition.pattern, definition.flags || "gu"),
        };
      } catch (error) {
        throw new Error(`Protected pattern ${definition.id} cannot compile: ${error.message}`);
      }
    });

    cachedDefinitions = definitions;
    cachedPatterns = compiled;
    return compiled;
  }

  function protectText(text, patternDefinitions) {
    let maskedText = String(text || "");
    const fragments = [];
    const patterns = compilePatterns(patternDefinitions || []);

    for (const definition of patterns) {
      if (fragments.length >= MAX_TOTAL_MATCHES) break;
      let count = 0;
      definition.regex.lastIndex = 0;
      maskedText = maskedText.replace(definition.regex, (value) => {
        if (
          count >= MAX_MATCHES_PER_PATTERN ||
          fragments.length >= MAX_TOTAL_MATCHES ||
          value.includes("\uE000GPTMODS_")
        ) {
          return value;
        }

        count += 1;
        const index = fragments.length;
        const type = definition.type || definition.id.toUpperCase().replace(/[^A-Z_]/g, "_");
        const token = `\uE000GPTMODS_${type}_${String(index).padStart(4, "0")}\uE001`;
        fragments.push({
          index,
          token,
          type,
          value,
          required: definition.required !== false,
          ruleId: definition.id,
        });
        return token;
      });
    }

    return { maskedText, fragments };
  }

  function restoreText(text, fragments) {
    let restored = String(text || "");
    for (const fragment of fragments || []) {
      restored = restored.split(fragment.token).join(fragment.value);
    }
    return restored;
  }

  function validateTokens(maskedText, fragments) {
    const errors = [];
    for (const fragment of fragments || []) {
      const occurrences = maskedText.split(fragment.token).length - 1;
      if (fragment.required && occurrences !== 1) {
        errors.push(`${fragment.ruleId}: expected one token, found ${occurrences}`);
      }
    }
    const known = new Set((fragments || []).map((item) => item.token));
    for (const match of String(maskedText || "").matchAll(TOKEN_PATTERN)) {
      if (!known.has(match[0])) errors.push(`unknown protected token ${match[0]}`);
    }
    return { ok: errors.length === 0, errors };
  }

  core.components.protection = {
    TOKEN_PATTERN,
    MAX_MATCHES_PER_PATTERN,
    MAX_TOTAL_MATCHES,
    assertSafePattern,
    compilePatterns,
    protectText,
    restoreText,
    validateTokens,
  };
})();
