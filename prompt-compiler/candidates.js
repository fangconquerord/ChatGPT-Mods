(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function buildCandidates(plan, language) {
    const renderer = core.components.renderer;
    const primaryModules = plan.selectedModules.filter((module) =>
      (module.intents || []).includes(plan.primaryIntent),
    );
    const secondaryModules = plan.selectedModules.filter((module) =>
      !(module.intents || []).includes(plan.primaryIntent),
    );
    const integratedModules = plan.segments.taskCount > 1
      ? [...primaryModules.slice(0, 6), ...secondaryModules.slice(0, 2)]
      : primaryModules.slice(0, 7);
    const compactModules = primaryModules.slice(0, 3);
    const clarificationModules = plan.missingCriticalSlots.length
      ? primaryModules.slice(0, 3)
      : compactModules;
    function synthesizedCandidate(id, modules, questions, style) {
      const details = renderer.renderCandidateDetails(plan, modules, questions, language, { style, variant: id });
      return {
        ...details,
        id,
        moduleIds: modules.map((item) => item.id),
        questions,
      };
    }
    const candidates = [
      { id: "normalized_original", integrationScore: 0, moduleIds: [], profile: "original", questions: [], realizedInstructionCount: 0, specificity: 0, text: plan.goal },
      synthesizedCandidate("content_integrated", integratedModules, [], "integrated"),
      synthesizedCandidate("intent_focused", primaryModules.slice(0, 5), [], "focused"),
      synthesizedCandidate("missing_data_safe", clarificationModules, plan.clarificationQuestions, "integrated"),
      synthesizedCandidate("structured_precise", compactModules, [], "structured"),
    ];
    const seen = new Set();
    return candidates.filter((candidate) => {
      if (seen.has(candidate.text)) return false;
      seen.add(candidate.text);
      return true;
    });
  }

  core.components.candidates = { buildCandidates };
})();
