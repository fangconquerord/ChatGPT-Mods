(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  function findDuplicates(items, selector) {
    const seen = new Set();
    const duplicates = [];
    for (const item of items) {
      const id = selector(item);
      if (seen.has(id)) duplicates.push(id);
      seen.add(id);
    }
    return duplicates;
  }

  function validateModuleCycles(modules) {
    const byId = new Map(modules.map((module) => [module.id, module]));
    const visiting = new Set();
    const visited = new Set();
    function visit(id, path) {
      if (visiting.has(id)) throw new Error(`Module dependency cycle: ${[...path, id].join(" -> ")}`);
      if (visited.has(id)) return;
      visiting.add(id);
      for (const dependency of byId.get(id)?.dependsOn || []) visit(dependency, [...path, id]);
      visiting.delete(id);
      visited.add(id);
    }
    for (const id of byId.keys()) visit(id, []);
  }

  function validateRules(rules) {
    const errors = [];
    if (!rules || typeof rules !== "object") throw new Error("Prompt Compiler rule bundle is missing");
    const requiredArrays = ["intents", "modules", "slotSchemas", "protectedPatterns", "bypassRules", "validationRules", "outputStructures", "domainRules"];
    for (const key of requiredArrays) {
      if (!Array.isArray(rules[key])) errors.push(`${key} must be an array`);
    }
    if (errors.length) throw new Error(`Invalid Prompt Compiler rules: ${errors.join("; ")}`);
    if (rules.intents.length < 36) errors.push("intents.json must contain at least 36 intents");
    if (rules.modules.length < 80) errors.push("modules.json must contain at least 80 modules");
    for (const duplicate of findDuplicates(rules.intents, (item) => item.id)) errors.push(`duplicate intent id ${duplicate}`);
    for (const duplicate of findDuplicates(rules.modules, (item) => item.id)) errors.push(`duplicate module id ${duplicate}`);
    const intentIds = new Set(rules.intents.map((item) => item.id));
    const moduleIds = new Set(rules.modules.map((item) => item.id));
    const bypassIds = new Set(rules.bypassRules.map((item) => item.id));
    for (const intent of rules.intents) {
      if (!intent.description?.ru || !intent.description?.en) errors.push(`intent ${intent.id} has empty localization`);
      for (const id of intent.moduleIds || []) if (!moduleIds.has(id)) errors.push(`intent ${intent.id} references missing module ${id}`);
      for (const id of intent.incompatibleModuleIds || []) if (!moduleIds.has(id)) errors.push(`intent ${intent.id} references missing incompatible module ${id}`);
      for (const id of intent.bypassRuleIds || []) if (!bypassIds.has(id)) errors.push(`intent ${intent.id} references missing bypass rule ${id}`);
    }
    for (const module of rules.modules) {
      if (!module.text?.ru || !module.text?.en) errors.push(`module ${module.id} has empty localization`);
      if (!Number.isFinite(module.weight) || module.weight < 0 || module.weight > 10) errors.push(`module ${module.id} has invalid weight`);
      if (!Number.isFinite(module.lengthCost) || module.lengthCost < 0 || module.lengthCost > 10) errors.push(`module ${module.id} has invalid lengthCost`);
      for (const id of module.intents || []) if (!intentIds.has(id)) errors.push(`module ${module.id} references missing intent ${id}`);
      for (const id of module.dependsOn || []) if (!moduleIds.has(id)) errors.push(`module ${module.id} depends on missing module ${id}`);
      for (const id of module.conflicts || []) if (!moduleIds.has(id)) errors.push(`module ${module.id} conflicts with missing module ${id}`);
    }
    for (const schema of rules.slotSchemas) if (!intentIds.has(schema.intentId)) errors.push(`slot schema references missing intent ${schema.intentId}`);
    for (const structure of rules.outputStructures) {
      for (const id of structure.intents || []) if (!intentIds.has(id)) errors.push(`output structure ${structure.id} references missing intent ${id}`);
    }
    for (const domain of rules.domainRules) {
      for (const id of domain.moduleIds || []) if (!moduleIds.has(id)) errors.push(`domain rule ${domain.id} references missing module ${id}`);
    }
    for (const collection of [rules.bypassRules, rules.validationRules, rules.outputStructures, rules.domainRules, rules.protectedPatterns]) {
      for (const duplicate of findDuplicates(collection, (item) => item.id)) errors.push(`duplicate rule id ${duplicate}`);
    }
    try { core.components.protection.compilePatterns(rules.protectedPatterns); } catch (error) { errors.push(error.message); }
    try { validateModuleCycles(rules.modules); } catch (error) { errors.push(error.message); }
    if (errors.length) throw new Error(`Invalid Prompt Compiler rules: ${errors.join("; ")}`);
    return { intentCount: rules.intents.length, moduleCount: rules.modules.length, valid: true };
  }

  function loadRules() {
    if (core.state.rules) return core.state.rules;
    const rules = globalThis.GPT_MODS_PROMPT_RULES;
    validateRules(rules);
    core.state.rules = rules;
    return rules;
  }

  core.components.rulesLoader = { loadRules, validateModuleCycles, validateRules };
})();
