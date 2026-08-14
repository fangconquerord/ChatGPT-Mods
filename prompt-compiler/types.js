/**
 * @typedef {Object} PromptContextMessage
 * @property {"user"|"assistant"} role
 * @property {string} content
 *
 * @typedef {Object} PromptEnhancementRequest
 * @property {string} text
 * @property {PromptContextMessage[]=} context
 * @property {string=} locale
 *
 * @typedef {Object} PromptEnhancementResult
 * @property {string} originalText
 * @property {string} improvedText
 * @property {boolean} changed
 * @property {"unchanged"|"rewritten"|"clarify_then_answer"} action
 * @property {string} detectedLanguage
 * @property {string} primaryIntent
 * @property {string[]} secondaryIntents
 * @property {number} confidence
 * @property {string[]} clarifyingQuestions
 * @property {string[]} preservedFragments
 * @property {string[]} appliedRuleIds
 * @property {string[]} warnings
 * @property {{originalLength:number, improvedLength:number, growthRatio:number, candidateCount:number, qualityScore:number}} metrics
 */

(() => {
  "use strict";
  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");
  core.components.contractVersion = 1;
})();
