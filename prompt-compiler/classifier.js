(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function containsTrigger(text, trigger) {
    const value = String(trigger || "").toLocaleLowerCase().trim();
    if (!value) return false;
    return text.includes(value);
  }

  function countTriggerHits(text, triggers) {
    let hits = 0;
    for (const trigger of triggers || []) {
      if (containsTrigger(text, trigger)) hits += 1;
    }
    return hits;
  }

  function scoreIntent(intent, text, language, segments, entities) {
    const localized = intent.triggers?.[language] || intent.triggers?.en || {};
    const strongHits = countTriggerHits(text, localized.strong);
    const positiveHits = countTriggerHits(text, localized.positive);
    const weakHits = countTriggerHits(text, localized.weak);
    const negativeHits = countTriggerHits(text, localized.negative);
    let score = strongHits * 6 + positiveHits * 3 + weakHits - negativeHits * 4;

    const required = localized.requiredCombinations || [];
    for (const combination of required) {
      if (Array.isArray(combination) && combination.every((term) => containsTrigger(text, term))) {
        score += 5;
      }
    }

    if (segments.hasQuestion && ["simple_question", "explanation", "definition", "how_to"].includes(intent.id)) score += 1.5;
    if (segments.hasError && ["troubleshooting", "technical_diagnosis", "debugging"].includes(intent.id)) score += 5;
    if (segments.hasCode && ["programming_generation", "debugging", "code_review", "refactoring", "configuration"].includes(intent.id)) score += 2.5;
    if (entities.comparisonObjects.length >= 2 && ["comparison", "decision_support"].includes(intent.id)) score += 7;
    if (entities.currencies.length && ["purchase_research", "recommendation"].includes(intent.id)) score += 3;
    if (segments.commands.length && !["simple_question", "definition"].includes(intent.id)) score += 0.8;
    const authoredContent = /(?:стать[яьюи]|текст\w*|пост\w*|рассказ\w*|сценари\w*|стих\w*|поэм\w*|описани\w*|эссе|письм\w*|сообщени\w*|article|blog\s+post|story|poem|screenplay|description|essay|letter|message)/iu.test(text);
    const codingSubject = entities.programmingLanguages.length > 0 ||
      /(?:код\w*|скрипт\w*|программ\w*|функци\w*|класс\w*|парсер\w*|бот\w*|расширени\w*|алгоритм\w*|\bcode\b|script|program|function|class|parser|extension|algorithm|\bapi\b|\bsql\b)/iu.test(text);
    if (intent.id === "programming_generation" && authoredContent && !codingSubject) score -= 14;
    if (intent.id === "creative_writing" && authoredContent && !/письм|сообщени|letter|message/iu.test(text)) score += 8;
    const visualAction = /^(?:нарисуй|изобрази|сгенерируй|создай|сделай|draw|illustrate|render|generate|create|make)(?=\s|$)/iu.test(text);
    const visualLanguage = /(?:изображени|картинк|иллюстраци|\bарт\b|фото|фотореалист|портрет|аниме|рисунк|рендер|обложк|\bimage\b|picture|illustration|artwork|photo|photoreal|portrait|anime|drawing|render|cover)/iu.test(text);
    const visualPromptRequest = visualAction && (visualLanguage || /^(?:нарисуй|изобрази|draw|illustrate|render)(?=\s|$)/iu.test(text)) ||
      /(?:промт|prompt)\s+(?:для|for)\s+(?:картин|изображени|image|picture|illustration)/iu.test(text);
    if (intent.id === "image_generation_prompt" && visualPromptRequest) score += 12;
    if (visualPromptRequest && ["purchase_research", "recommendation"].includes(intent.id)) score -= 8;
    if (strongHits + positiveHits + weakHits === 0) score -= 1.5;

    return {
      id: intent.id,
      priority: Number(intent.priority) || 0,
      ruleId: `intent.${intent.id}`,
      score,
      triggerHits: strongHits + positiveHits + weakHits,
    };
  }

  function classifyIntent(text, language, segments, entities, intents) {
    const lower = String(text || "").toLocaleLowerCase();
    const ranked = intents
      .map((intent) => scoreIntent(intent, lower, language, segments, entities))
      .sort((a, b) => b.score - a.score || b.priority - a.priority || a.id.localeCompare(b.id));
    let primary = ranked[0];
    if (!primary || primary.score < 1) {
      primary = ranked.find((item) => item.id === "simple_question") || {
        id: "simple_question",
        ruleId: "intent.simple_question",
        score: 1,
        triggerHits: 0,
      };
    }
    const secondary = ranked
      .filter((item) => item.id !== primary.id && item.score >= Math.max(4, primary.score * 0.45))
      .slice(0, 3);
    const confidence = Math.max(0.2, Math.min(0.99, 0.35 + primary.score / 30 - (secondary[0]?.score || 0) / 100));

    return {
      confidence: Number(confidence.toFixed(3)),
      primaryIntent: primary.id,
      ranked: ranked.slice(0, 8),
      secondaryIntents: secondary.map((item) => item.id),
    };
  }

  core.components.classifier = { classifyIntent, scoreIntent };
})();
