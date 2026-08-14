(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  const CONSTRAINT_PATTERN = /(?:^|[^\p{L}\p{N}_])(?:не|без|кроме|только|максимум|минимум|не\s+более|не\s+менее|обязательно|запрещено|нельзя|no|without|except|only|maximum|minimum|at\s+most|at\s+least|must|mustn['’]?t|do\s+not|don['’]?t)(?=$|[^\p{L}\p{N}_])/iu;
  const QUESTION_PATTERN = /\?|^(?:как|что|почему|где|когда|какой|какая|какие|сколько|кто|how|what|why|where|when|which|who)(?:\s|$)/iu;
  const COMMAND_PATTERN = /^(?:сделай|создай|напиши|исправь|сравни|объясни|проверь|подбери|переведи|проанализируй|build|create|write|fix|compare|explain|check|find|translate|analyze)(?:\s|$)/iu;

  function segmentText(text) {
    const lines = String(text || "").split("\n");
    const nonEmptyLines = lines.map((line) => line.trim()).filter(Boolean);
    const sentences = String(text || "")
      .split(/(?<=[.!?])\s+|\n+/u)
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 120);
    const constraints = sentences.filter((sentence) => CONSTRAINT_PATTERN.test(sentence));
    const questions = sentences.filter((sentence) => QUESTION_PATTERN.test(sentence));
    const commands = sentences.filter((sentence) => COMMAND_PATTERN.test(sentence));
    const listItems = nonEmptyLines.filter((line) => /^(?:[-*•]|\d+[.)])\s+\S/u.test(line));
    const headings = nonEmptyLines.filter((line) => /^(?:#{1,6}\s+|[^.!?]{2,50}:$)/u.test(line));

    return {
      commands,
      constraints,
      headings,
      hasCode: /\uE000GPTMODS_(?:CODE|COMMAND|JSON|XML|YAML|SQL)_/u.test(text),
      hasError: /(?:ошибк\w*|вылет\w*|завис\w*|не\s+работает|\berror\b|\bexception\b|\bfailed\b|\bcrash\w*\b|\bfreez\w*\b)/iu.test(text),
      hasQuestion: questions.length > 0,
      listItems,
      questions,
      sentences,
      taskCount: Math.max(1, commands.length),
    };
  }

  function hasStrongStructure(segments, text) {
    if (segments.headings.length >= 2 || segments.listItems.length >= 3) return true;
    return /(?:^|\n)\s*(?:задача|контекст|требования|ограничения|формат ответа|task|context|requirements|constraints|output)\s*:/giu.test(text) &&
      String(text).length > 280;
  }

  core.components.segmentation = {
    COMMAND_PATTERN,
    CONSTRAINT_PATTERN,
    hasStrongStructure,
    segmentText,
  };
})();
