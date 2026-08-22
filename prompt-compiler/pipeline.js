(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function baseResult(text, warning, language = "en") {
    return {
      action: "unchanged",
      appliedRuleIds: [],
      changed: false,
      clarifyingQuestions: [],
      confidence: 0,
      detectedLanguage: language,
      improvedText: text,
      metrics: { candidateCount: 1, growthRatio: 1, improvedLength: text.length, originalLength: text.length, qualityScore: 0 },
      originalText: text,
      preservedFragments: [],
      primaryIntent: "simple_question",
      secondaryIntents: [],
      warnings: warning ? [warning] : [],
    };
  }

  function shouldBypass(text, segments, rules, language) {
    const lower = text.toLocaleLowerCase();
    const moduleTexts = rules.modules.map((module) => module.text?.[language]).filter(Boolean);
    const moduleMatches = moduleTexts.reduce((count, value) => count + (lower.includes(value.toLocaleLowerCase()) ? 1 : 0), 0);
    if (moduleMatches >= 2) return "idempotent_compiler_output";
    if (core.components.synthesis.looksSynthesized(text, language)) return "idempotent_synthesized_output";
    if (core.components.segmentation.hasStrongStructure(segments, text)) return "already_structured";
    if (text.length <= 140 && /^(?:сколько будет\s+)?\d+\s*[+×x*/-]\s*\d+\s*\??$/iu.test(text)) return "simple_calculation";
    if (text.length <= 140 && /^(?:переведи|translate)\s+\S+(?:\s+\S+){0,4}\s+(?:на|to|into)\s+\S+[.!?]?$/iu.test(text)) return "short_translation";
    if (text.length <= 120 && /^(?:что (?:означает|такое)|what is|what does .+ mean)\b/iu.test(text)) return "short_definition";
    if (text.length <= 140 && /^(?:исправь|correct|fix)\b[^\n]{0,120}[«"'`].+[»"'`][.!?]?$/iu.test(text)) return "literal_proofread";
    for (const rule of rules.bypassRules) {
      if (rule.maxLength && text.length > rule.maxLength) continue;
      if ((rule.containsAny || []).some((term) => lower.includes(String(term).toLocaleLowerCase()))) return rule.id;
    }
    return "";
  }

  function enhancePrompt(request) {
    const originalText = request?.text;
    if (typeof originalText !== "string") throw new TypeError("PromptEnhancementRequest.text must be a string");
    const inputValidation = core.components.validation.validateInput(originalText);
    if (!inputValidation.ok) return baseResult(originalText, inputValidation.code, String(request?.locale || "").startsWith("ru") ? "ru" : "en");

    const rules = core.components.rulesLoader.loadRules();
    const diagnostics = core.components.diagnostics.startDiagnostics();
    const protectedText = core.components.diagnostics.measure(diagnostics, "protection", () =>
      core.components.protection.protectText(originalText, rules.protectedPatterns),
    );
    const maskedText = core.components.diagnostics.measure(diagnostics, "normalization", () =>
      core.components.normalization.normalizePlainText(protectedText.maskedText),
    );
    const language = core.components.diagnostics.measure(diagnostics, "language", () =>
      core.components.language.detectLanguage(maskedText, request?.locale, { ru: rules.aliasesRu, en: rules.aliasesEn }),
    );
    const normalizedText = core.components.protection.restoreText(maskedText, protectedText.fragments);
    const segments = core.components.diagnostics.measure(diagnostics, "segmentation", () =>
      core.components.segmentation.segmentText(maskedText),
    );
    let entities = core.components.diagnostics.measure(diagnostics, "extraction", () =>
      core.components.extraction.extractEntities(normalizedText, protectedText.fragments, segments),
    );
    const context = core.components.context.analyzeContext(request?.context, normalizedText);
    if (context.resolvedText) {
      const contextSegments = core.components.segmentation.segmentText(context.resolvedText);
      const contextEntities = core.components.extraction.extractEntities(context.resolvedText, [], contextSegments);
      entities = {
        ...entities,
        comparisonObjects: entities.comparisonObjects.length >= 2
          ? entities.comparisonObjects
          : contextEntities.comparisonObjects,
        products: [...new Set([...entities.products, ...contextEntities.products])],
      };
    }
    const classification = core.components.diagnostics.measure(diagnostics, "classification", () =>
      core.components.classifier.classifyIntent(`${maskedText} ${context.resolvedText}`, language, segments, entities, rules.intents),
    );
    const bypassReason = shouldBypass(normalizedText, segments, rules, language);
    if (bypassReason) {
      core.components.diagnostics.finishDiagnostics({ ...diagnostics, bypassReason });
      const result = baseResult(normalizedText, "", language);
      result.confidence = classification.confidence;
      result.primaryIntent = classification.primaryIntent;
      result.secondaryIntents = classification.secondaryIntents;
      result.preservedFragments = protectedText.fragments.map((item) => item.value);
      result.metrics.qualityScore = 100;
      result.metrics.originalLength = originalText.length;
      result.metrics.improvedLength = normalizedText.length;
      result.metrics.growthRatio = Number((normalizedText.length / Math.max(1, originalText.length)).toFixed(3));
      result.changed = normalizedText !== originalText;
      result.action = result.changed ? "rewritten" : "unchanged";
      result.improvedText = normalizedText;
      result.appliedRuleIds = [`bypass.${bypassReason}`];
      return result;
    }

    const ambiguity = core.components.diagnostics.measure(diagnostics, "ambiguity", () =>
      core.components.ambiguity.detectAmbiguity(classification.primaryIntent, normalizedText, entities, segments, rules.slotSchemas, rules.ambiguityRules, language),
    );
    const contextualGoal = context.resolvedText
      ? `${maskedText}\n\n${language === "ru" ? "Явный контекст пользователя" : "Explicit user context"}:\n${context.resolvedText}`
      : maskedText;
    const plan = core.components.diagnostics.measure(diagnostics, "planning", () =>
      core.components.planner.buildPlan({
        ambiguity,
        classification,
        contextText: context.resolvedText,
        entities,
        language,
        maskedText: contextualGoal,
        rules,
        segments,
        taskGoal: maskedText,
      }),
    );
    const candidates = core.components.diagnostics.measure(diagnostics, "candidates", () =>
      core.components.candidates.buildCandidates(plan, language),
    );
    const scoringContext = {
      bannedFluff: rules.bannedFluff[language] || rules.bannedFluff.en || [],
      fragments: protectedText.fragments,
      plan,
      strongStructure: false,
    };
    const ranked = core.components.diagnostics.measure(diagnostics, "scoring", () =>
      core.components.scoring.rankCandidates(candidates, scoringContext),
    );
    const eligibleCandidates = ambiguity.missingCriticalSlots.length && ambiguity.clarificationQuestions.length
      ? ranked.filter((candidate) => candidate.questions.length > 0)
      : ranked;
    let winner = eligibleCandidates.find((candidate) =>
      core.components.validation.validateCandidate(candidate, scoringContext).ok,
    );
    const warnings = [];
    if (!winner) {
      winner = ranked.find((candidate) => candidate.id === "normalized_original") || { id: "normalized_original", text: maskedText, moduleIds: [], questions: [], score: 0 };
      warnings.push("safe_fallback_used");
    }
    const improvedText = core.components.protection.restoreText(winner.text, protectedText.fragments);
    const changed = core.components.normalization.normalizeForComparison(improvedText) !== core.components.normalization.normalizeForComparison(originalText);
    const action = changed
      ? (winner.questions.length ? "clarify_then_answer" : "rewritten")
      : "unchanged";
    core.components.diagnostics.finishDiagnostics({ ...diagnostics, candidateCount: candidates.length, winnerId: winner.id });

    return {
      action,
      appliedRuleIds: [`intent.${classification.primaryIntent}`, ...winner.moduleIds.map((id) => `module.${id}`)],
      changed,
      clarifyingQuestions: winner.questions,
      confidence: classification.confidence,
      detectedLanguage: language,
      improvedText,
      metrics: {
        candidateCount: candidates.length,
        growthRatio: Number((improvedText.length / Math.max(1, originalText.length)).toFixed(3)),
        improvedLength: improvedText.length,
        originalLength: originalText.length,
        qualityScore: winner.score,
      },
      originalText,
      preservedFragments: protectedText.fragments.map((item) => item.value),
      primaryIntent: classification.primaryIntent,
      secondaryIntents: classification.secondaryIntents,
      warnings,
    };
  }

  core.components.pipeline = { baseResult, enhancePrompt, shouldBypass };
})();
