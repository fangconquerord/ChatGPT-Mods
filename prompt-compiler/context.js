(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  const REFERENCE_PATTERN = /(?:^|[^\p{L}\p{N}_])(?:эти|эта|этот|выше|второй вариант|тот файл|эта ошибка|these|this one|above|second option|that file|this error)(?=$|[^\p{L}\p{N}_])/iu;

  function analyzeContext(context, currentText) {
    if (!Array.isArray(context) || !REFERENCE_PATTERN.test(currentText)) {
      return { resolvedText: "", usedMessages: 0, ambiguous: false };
    }
    const recentUserMessages = context
      .slice(-8)
      .filter((message) => message?.role === "user" && typeof message.content === "string")
      .map((message) => message.content.trim().slice(0, 2000))
      .filter(Boolean);
    if (recentUserMessages.length !== 1) {
      return { resolvedText: "", usedMessages: 0, ambiguous: recentUserMessages.length > 1 };
    }
    return { resolvedText: recentUserMessages[0], usedMessages: 1, ambiguous: false };
  }

  core.components.context = { analyzeContext };
})();
