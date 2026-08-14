(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function dynamicGrowthRatio(text, classification, ambiguity, segments) {
    const length = text.length;
    if (length < 70 && classification.primaryIntent === "simple_question") return 1.15;
    if (length < 100 && ambiguity.missingCriticalSlots.length) return 6;
    if (length < 140) return segments.hasCode ? 3.2 : 4;
    if (length < 500) return 2.6;
    if (length < 1400) return 1.8;
    return 1.35;
  }

  function moduleIsApplicable(module, intentIds, text) {
    if (!(module.intents || []).some((intent) => intentIds.includes(intent))) return false;
    if ((module.forbiddenIntents || []).some((intent) => intentIds.includes(intent))) return false;
    if ((module.deactivateWhenAny || []).some((term) => text.includes(String(term).toLocaleLowerCase()))) return false;
    const activation = module.activateWhenAny || [];
    return activation.length === 0 || activation.some((term) => text.includes(String(term).toLocaleLowerCase()));
  }

  function selectModules(classification, text, rules, limit = 8) {
    const intentIds = [classification.primaryIntent, ...classification.secondaryIntents];
    const intentProfiles = intentIds
      .map((id) => rules.intents.find((intent) => intent.id === id))
      .filter(Boolean);
    const requestedIds = [...new Set(intentProfiles.flatMap((intent) => intent.moduleIds || []))];
    const byId = new Map(rules.modules.map((module) => [module.id, module]));
    const selected = [];
    const dedupeKeys = new Set();

    for (const id of requestedIds) {
      const module = byId.get(id);
      if (!module || !moduleIsApplicable(module, intentIds, text)) continue;
      if ((module.conflicts || []).some((conflict) => selected.some((item) => item.id === conflict))) continue;
      if ((module.dependsOn || []).some((dependency) => !requestedIds.includes(dependency))) continue;
      const key = module.dedupeKey || module.id;
      if (dedupeKeys.has(key)) continue;
      dedupeKeys.add(key);
      selected.push(module);
    }

    return selected
      .sort((a, b) => Number(b.weight) - Number(a.weight) || a.id.localeCompare(b.id))
      .slice(0, limit);
  }

  function buildPlan(input) {
    const selectedModules = selectModules(input.classification, input.maskedText.toLocaleLowerCase(), input.rules);
    return {
      clarificationQuestions: input.ambiguity.clarificationQuestions,
      contextText: input.contextText || "",
      entities: input.entities,
      extractedConstraints: input.entities.constraints,
      goal: input.maskedText,
      language: input.language,
      maximumUsefulGrowthRatio: dynamicGrowthRatio(input.maskedText, input.classification, input.ambiguity, input.segments),
      missingCriticalSlots: input.ambiguity.missingCriticalSlots,
      missingUsefulSlots: input.ambiguity.missingUsefulSlots,
      preservedRequirements: input.entities.requirements,
      primaryIntent: input.classification.primaryIntent,
      rejectedModuleIds: [],
      requestedOutputStructure: [],
      segments: input.segments,
      secondaryIntents: input.classification.secondaryIntents,
      selectedModuleIds: selectedModules.map((module) => module.id),
      selectedModules,
      taskGoal: input.taskGoal || input.maskedText,
    };
  }

  core.components.planner = { buildPlan, dynamicGrowthRatio, selectModules };
})();
