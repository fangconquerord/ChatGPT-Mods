(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function renderModules(modules, language) {
    return modules
      .map((module) => module.text?.[language] || module.text?.en)
      .filter(Boolean)
      .join(" ");
  }

  function renderCandidateDetails(plan, modules, questions, language, options) {
    return core.components.synthesis.render(plan, modules, questions, language, options);
  }

  function renderCandidate(plan, modules, questions, language, options) {
    return renderCandidateDetails(plan, modules, questions, language, options).text;
  }

  core.components.renderer = { renderCandidate, renderCandidateDetails, renderModules };
})();
