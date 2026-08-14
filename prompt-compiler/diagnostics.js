(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function now() {
    return globalThis.performance?.now ? globalThis.performance.now() : Date.now();
  }

  function startDiagnostics() {
    return { startedAt: now(), stages: Object.create(null) };
  }

  function measure(diagnostics, name, callback) {
    const startedAt = now();
    const value = callback();
    diagnostics.stages[name] = Number((now() - startedAt).toFixed(3));
    return value;
  }

  function finishDiagnostics(diagnostics) {
    diagnostics.totalMs = Number((now() - diagnostics.startedAt).toFixed(3));
    delete diagnostics.startedAt;
    core.state.diagnostics.push(diagnostics);
    if (core.state.diagnostics.length > 20) core.state.diagnostics.shift();
    return diagnostics;
  }

  core.components.diagnostics = { finishDiagnostics, measure, startDiagnostics };
})();
