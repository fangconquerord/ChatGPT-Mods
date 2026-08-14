(() => {
  "use strict";

  const existing = globalThis.GPTModsPromptCompilerInternals;
  if (existing?.version === "1.1.1") return;

  globalThis.GPTModsPromptCompilerInternals = {
    version: "1.1.1",
    components: Object.create(null),
    state: {
      diagnostics: [],
      rules: null,
    },
  };
})();
