const directory = new URL("../../prompt-compiler/", import.meta.url);
const files = [
  "namespace.js", "types.js", "rules-bundle.js", "normalization.js", "protection.js",
  "language.js", "segmentation.js", "classifier.js", "extraction.js", "context.js",
  "ambiguity.js", "planner.js", "synthesis.js", "renderer.js", "candidates.js", "scoring.js",
  "validation.js", "diagnostics.js", "rules-loader.js", "pipeline.js", "index.js"
];
for (const file of files) await import(new URL(file, directory));

export const compiler = globalThis.GPTModsPromptCompiler;
export const internals = globalThis.GPTModsPromptCompilerInternals;
export const rules = globalThis.GPT_MODS_PROMPT_RULES;
