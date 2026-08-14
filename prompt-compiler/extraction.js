(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  const PROGRAMMING_LANGUAGES = [
    "JavaScript", "TypeScript", "Python", "Java", "Kotlin", "Swift", "C++", "C#", "Rust", "Go", "PHP", "Ruby", "SQL", "PowerShell", "Bash",
  ];
  const PLATFORMS = ["Windows", "Linux", "macOS", "Android", "iOS", "Chrome", "Firefox", "Excel", "WordPress", "Node.js"];
  const FORMATS = ["JSON", "YAML", "XML", "CSV", "TSV", "PDF", "DOCX", "XLSX", "SQL", "Markdown"];

  function unique(values) {
    return [...new Set(values.filter(Boolean))];
  }

  function findKnown(text, values) {
    return values.filter((value) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`, "iu").test(text));
  }

  function extractComparisonObjects(text) {
    const patterns = [
      /(?:сравни|сравнить|отличия между)\s+(.{1,70}?)\s+(?:и|с)\s+(.{1,70}?)(?:[.?!]|$)/iu,
      /(?:compare|difference between)\s+(.{1,70}?)\s+(?:and|vs\.?|with)\s+(.{1,70}?)(?:[.?!]|$)/iu,
      /(?:модели|варианты|models|options)\s+(.{1,70}?)\s+(?:и|and|vs\.?)\s+(.{1,70}?)(?:[.?!]|$)/iu,
    ];
    for (const pattern of patterns) {
      const match = String(text).match(pattern);
      if (match) return [match[1].trim(), match[2].trim()];
    }
    return [];
  }

  function extractConstraintClause(sentence) {
    const value = String(sentence || "").trim();
    const marker = /(?:^|[;,:]\s*|\s)(?:не|без|кроме|только|максимум|минимум|не\s+более|не\s+менее|обязательно|запрещено|нельзя|no|without|except|only|maximum|minimum|at\s+most|at\s+least|must|mustn['’]?t|do\s+not|don['’]?t)(?=$|\s)/iu;
    const match = value.match(marker);
    if (!match || match.index === undefined) return value;
    const offset = match.index + (match[0].length - match[0].trimStart().length);
    return value.slice(offset).replace(/^[;,:]\s*/u, "").trim();
  }

  function extractEntities(originalText, protectedFragments, segments) {
    const text = String(originalText || "");
    const byType = Object.create(null);
    for (const fragment of protectedFragments || []) {
      (byType[fragment.type] ||= []).push(fragment.value);
    }
    const products = unique([
      ...extractComparisonObjects(text),
      ...(text.match(/\b[A-ZА-ЯЁ][\wА-Яа-яЁё]*(?:[ .+_-][A-ZА-ЯЁ0-9][\wА-Яа-яЁё+]*){0,3}\b/gu) || []),
    ]).slice(0, 20);
    const requirements = unique(segments.constraints.map(extractConstraintClause)).slice(0, 20);

    return {
      comparisonObjects: extractComparisonObjects(text),
      constraints: requirements,
      currencies: unique(text.match(/(?:₽|\$|€|£|руб(?:лей|ля|ль)?|доллар\w*|евро|usd|eur|rub)\b/giu) || []),
      dates: byType.DATE || [],
      errors: unique(text.match(/(?:ошибка|error|exception|failed)[^\n.!?]{0,160}/giu) || []),
      fileFormats: findKnown(text, FORMATS),
      numbers: unique(text.match(/\b\d+(?:[.,]\d+)?\b/g) || []),
      platforms: findKnown(text, PLATFORMS),
      products,
      programmingLanguages: findKnown(text, PROGRAMMING_LANGUAGES),
      protectedByType: byType,
      requirements,
    };
  }

  core.components.extraction = {
    FORMATS,
    PLATFORMS,
    PROGRAMMING_LANGUAGES,
    extractConstraintClause,
    extractComparisonObjects,
    extractEntities,
  };
})();
