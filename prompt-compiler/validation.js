(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function validateInput(text) {
    if (typeof text !== "string") return { ok: false, code: "input_not_string", message: "Prompt text must be a string" };
    if (!text.trim()) return { ok: false, code: "input_empty", message: "Prompt text is empty" };
    if (text.length > 50000) return { ok: false, code: "input_too_long", message: "Prompt text exceeds 50,000 characters" };
    const controlCount = (text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []).length;
    if (controlCount > Math.max(3, text.length * 0.02)) {
      return { ok: false, code: "input_binary", message: "Prompt contains binary or damaged data" };
    }
    return { ok: true, code: "ok", message: "" };
  }

  function validateCandidate(candidate, context) {
    const errors = [];
    const tokenCheck = core.components.protection.validateTokens(candidate.text, context.fragments);
    errors.push(...tokenCheck.errors);
    if (!candidate.text.trim()) errors.push("candidate is empty");
    if (/\uE000GPTMODS_[A-Z_]+_\d{4}\uE001/.test(core.components.protection.restoreText(candidate.text, context.fragments))) {
      errors.push("unrestored protected token");
    }
    if (candidate.text.length > context.plan.goal.length * context.plan.maximumUsefulGrowthRatio &&
        candidate.text.length > context.plan.goal.length + 360) {
      errors.push("candidate exceeds dynamic length limit");
    }
    for (const constraint of context.plan.extractedConstraints) {
      if (constraint && !candidate.text.includes(constraint)) errors.push(`lost constraint: ${constraint.slice(0, 80)}`);
    }
    const lower = candidate.text.toLocaleLowerCase();
    for (const phrase of context.bannedFluff) {
      if (lower.includes(String(phrase).toLocaleLowerCase())) errors.push(`banned phrase: ${phrase}`);
    }
    const paragraphs = candidate.text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    if (new Set(paragraphs).size !== paragraphs.length) errors.push("duplicate paragraphs");
    if (/(?:Требования к ответу|Response requirements):[ \t]*(?:\n{2,}|$)/u.test(candidate.text)) errors.push("empty section");
    return { ok: errors.length === 0, errors };
  }

  core.components.validation = { validateCandidate, validateInput };
})();
