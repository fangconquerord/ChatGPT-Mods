(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function countOccurrences(text, value) {
    return value ? String(text).split(value).length - 1 : 0;
  }

  function scoreCandidate(candidate, context) {
    const { plan, fragments, bannedFluff, strongStructure } = context;
    let preservation = 25;
    let constraints = 15;
    let answerability = candidate.moduleIds.length
      ? 7 + Math.min(8, (candidate.realizedInstructionCount || 1) * 1.6)
      : 3;
    let specificity = Math.min(15, 2 + (candidate.specificity || 0) * 1.7);
    let structure = candidate.moduleIds.length || candidate.questions.length ? 8 : 4;
    let concision = 10;
    let integration = Math.min(10, candidate.integrationScore || 0);
    let penalty = 0;

    for (const fragment of fragments) {
      if (fragment.required && countOccurrences(candidate.text, fragment.token) !== 1) {
        preservation -= 25;
        penalty += 100;
      }
    }
    for (const requirement of plan.extractedConstraints) {
      if (requirement && !candidate.text.includes(requirement)) constraints -= 8;
    }

    if (plan.missingCriticalSlots.length) {
      if (candidate.questions.length) answerability += 10;
      else if (candidate.id !== "normalized_original") penalty += 12;
    }
    if (candidate.id === "normalized_original" && strongStructure) structure += 6;
    if (candidate.id === "normalized_original" && !plan.selectedModules.length) concision += 2;
    if (candidate.id === "normalized_original" && plan.selectedModules.length) specificity = 1;
    if (candidate.profile !== "original" && candidate.realizedInstructionCount === 0) penalty += 8;

    const ratio = candidate.text.length / Math.max(1, plan.goal.length);
    if (ratio > plan.maximumUsefulGrowthRatio && candidate.text.length > plan.goal.length + 360) {
      penalty += Math.min(35, (ratio - plan.maximumUsefulGrowthRatio) * 7);
    }
    if (candidate.text.length > plan.goal.length + 900) penalty += 15;
    const paragraphs = candidate.text.split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
    if (new Set(paragraphs).size !== paragraphs.length) penalty += 14;
    for (const phrase of bannedFluff) {
      if (candidate.text.toLocaleLowerCase().includes(String(phrase).toLocaleLowerCase())) penalty += 35;
    }
    const moduleUtility = candidate.moduleIds.reduce((total, id) => {
      const module = plan.selectedModules.find((item) => item.id === id);
      return total + (Number(module?.weight) || 0);
    }, 0);
    answerability += Math.min(3, moduleUtility / 28);

    const total = preservation + constraints + answerability + specificity + structure + concision + integration - penalty;
    return {
      ...candidate,
      breakdown: { answerability, concision, constraints, integration, penalty, preservation, specificity, structure },
      score: Number(Math.max(0, Math.min(100, total)).toFixed(2)),
    };
  }

  function rankCandidates(candidates, context) {
    return candidates
      .map((candidate) => scoreCandidate(candidate, context))
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length || a.id.localeCompare(b.id));
  }

  core.components.scoring = { rankCandidates, scoreCandidate };
})();
