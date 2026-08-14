(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function initialize() {
    const rules = core.components.rulesLoader.loadRules();
    return core.components.rulesLoader.validateRules(rules);
  }

  globalThis.GPTModsPromptCompiler = Object.freeze({
    enhancePrompt: core.components.pipeline.enhancePrompt,
    getDiagnostics: () => core.state.diagnostics.map((item) => ({ ...item, stages: { ...item.stages } })),
    initialize,
    validateRules: core.components.rulesLoader.validateRules,
    version: core.version,
  });
})();
