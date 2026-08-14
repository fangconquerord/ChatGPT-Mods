(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function hasPurpose(text) {
    const stripped = String(text)
      .replace(/^(?:напиши|создай|сделай|реализуй|write|create|build|implement)\s+/iu, "")
      .replace(/^(?:a|an)\s+/iu, "")
      .replace(/^(?:программу|приложение|скрипт|program|application|app|script)[.!?\s]*$/iu, "");
    return stripped.trim().length >= 8 && !/^(?:программу|program|app|application)$/iu.test(stripped.trim());
  }

  function slotIsPresent(slot, text, entities, segments) {
    switch (slot) {
      case "goal": return text.trim().length >= 3;
      case "purpose": return hasPurpose(text);
      case "comparison_objects": return entities.comparisonObjects.length >= 2;
      case "source_text": return /[«"'`].+[»"'`]|:\s*\S+/su.test(text) || text.trim().split(/\s+/).length >= 4;
      case "target_language": return /\b(?:на|в)\s+(?:русск\w*|английск\w*)|\b(?:into|to)\s+(?:russian|english)\b/iu.test(text);
      case "error_or_symptom": return segments.hasError || entities.errors.length > 0;
      case "subject": return entities.products.some((item) => !/^(?:Кто|Who|Компания|Company)$/iu.test(item)) || /\b(?:у|для|про|about|of|for)\s+[A-ZА-ЯЁ][\w.-]+/u.test(text);
      case "input_data": return /\b(?:вход\w*|данн\w*|input|dataset|csv|json|таблиц\w*)\b/iu.test(text);
      case "expected_result": return /\b(?:результат\w*|выход\w*|долж(?:ен|на|но)|верни|получить|output|result|should|return)\b/iu.test(text) || hasPurpose(text);
      case "document": return /\b(?:файл\w*|документ\w*|текст\w*|file|document|text)\b/iu.test(text);
      case "topic": return text.trim().split(/\s+/).length >= 3;
      case "recipient": return /\b(?:для|кому|получател\w*|аудитори\w*|to|for|recipient|audience)\b/iu.test(text);
      case "output_format": return entities.fileFormats.length > 0 || /\b(?:формат|список|таблица|json|format|list|table)\b/iu.test(text);
      default: return false;
    }
  }

  function extractVisualSubject(text, language) {
    const source = String(text || "").replace(/\uE000GPTMODS_[A-Z_]+_\d{4}\uE001/g, " ").trim();
    const command = language === "ru"
      ? /^(?:нарисуй|изобрази|сгенерируй(?:\s+(?:изображение|картинку|арт))?|создай|сделай|покажи|составь\s+(?:промт|описание)\s+(?:для\s+)?)\s*/iu
      : /^(?:draw|illustrate|render|generate(?:\s+(?:an?\s+)?(?:image|picture|artwork))?|create|make|show|write\s+(?:an?\s+)?(?:image\s+)?prompt\s+(?:for\s+)?)\s*/iu;
    const visualTerms = language === "ru"
      ? /(?:изображен[а-яё]*|картинк[а-яё]*|иллюстраци[а-яё]*|арт[а-яё]*|фото(?:графи[а-яё]*)?|портрет[а-яё]*|аниме|рисунк[а-яё]*|рендер[а-яё]*|реалистичн[а-яё]*|фотореалистичн[а-яё]*|высок[а-яё]* детализаци[а-яё]*|качественн[а-яё]*|красив[а-яё]*|4k|8k|hd|мягк[а-яё]* освещени[а-яё]*|свет[а-яё]*|стил[а-яё]*|в\s+стиле)/giu
      : /(?:image|picture|illustration|artwork|photo(?:graph)?|portrait|anime|drawing|render|realistic|photorealistic|high[-\s]?detail|high[-\s]?quality|beautiful|4k|8k|hd|soft\s+light(?:ing)?|light(?:ing)?|style|in\s+the\s+style)/giu;
    const remainder = source
      .replace(command, " ")
      .replace(visualTerms, " ")
      .replace(/[\d\s.,;:!?()[\]{}"'`«»—–_-]+/gu, " ")
      .trim();
    return remainder
      .split(/\s+/u)
      .filter((word) => word.length > 1 && !/^(?:с|в|на|для|и|of|in|on|at|with|for|the|a|an)$/iu.test(word))
      .join(" ");
  }

  function contextualQuestion(primaryIntent, slot, language, templates) {
    const localized = {
      en: {
        "classification:input_data": "Which records or objects should be classified?",
        "data_analysis:input_data": "Which dataset should be analyzed, and in what format is it available?",
        "image_generation_prompt:subject": "What should the image depict?",
        "information_extraction:document": "Which source text or document should the fields be extracted from?",
        "structured_output:output_format": "Which fields and data types must the output contain?",
      },
      ru: {
        "classification:input_data": "Какие записи или объекты нужно классифицировать?",
        "data_analysis:input_data": "Какой набор данных нужно проанализировать и в каком формате он доступен?",
        "image_generation_prompt:subject": "Что именно должно быть изображено?",
        "information_extraction:document": "Из какого текста или документа нужно извлечь поля?",
        "structured_output:output_format": "Какие поля и типы данных должен содержать результат?",
      },
    };
    return localized[language]?.[`${primaryIntent}:${slot}`] || templates[slot];
  }

  function detectAmbiguity(primaryIntent, text, entities, segments, slotSchemas, ambiguityRules, language) {
    const schema = slotSchemas.find((item) => item.intentId === primaryIntent) || {
      critical: [], useful: [], optional: [],
    };
    const visualSubject = primaryIntent === "image_generation_prompt"
      ? extractVisualSubject(text, language)
      : "";
    const isPresent = (slot) =>
      slot === "subject" && primaryIntent === "image_generation_prompt"
        ? Boolean(visualSubject)
        : slotIsPresent(slot, text, entities, segments);
    const missingCriticalSlots = (schema.critical || []).filter((slot) => !isPresent(slot));
    const missingUsefulSlots = (schema.useful || []).filter(
      (slot) => !isPresent(slot),
    );
    const questions = [];
    const templates = ambiguityRules.questions?.[language] || ambiguityRules.questions?.en || {};
    for (const slot of missingCriticalSlots) {
      const question = contextualQuestion(primaryIntent, slot, language, templates);
      if (question && !questions.includes(question)) questions.push(question);
      if (questions.length === 3) break;
    }

    return {
      clarificationQuestions: questions,
      missingCriticalSlots,
      missingUsefulSlots,
    };
  }

  core.components.ambiguity = { contextualQuestion, detectAmbiguity, extractVisualSubject, slotIsPresent };
})();
