import assert from "node:assert/strict";
import test from "node:test";
import { compiler, internals, rules } from "./helpers/load-compiler.mjs";

test("bypass normalization keeps changed and action consistent", () => {
  const result = compiler.enhancePrompt({ text: "2  +  2?", locale: "en" });
  assert.equal(result.improvedText, "2 + 2?");
  assert.equal(result.changed, true);
  assert.equal(result.action, "rewritten");
});

test("normalization preserves semantic ZWJ and ZWNJ characters", () => {
  const normalize = internals.components.normalization.normalizePlainText;
  assert.equal(normalize("👩‍💻 test"), "👩‍💻 test");
  assert.equal(normalize("a\u200Cb"), "a\u200Cb");
  assert.equal(normalize("a\u200Db"), "a\u200Db");
  assert.equal(normalize("a\u200Bb"), "ab");
});

test("protected pattern compilation is cached for the stable rule bundle", () => {
  const compile = internals.components.protection.compilePatterns;
  assert.equal(compile(rules.protectedPatterns), compile(rules.protectedPatterns));
});

test("protected fragments have a hard total bound", () => {
  const protect = internals.components.protection.protectText;
  const input = Array.from({ length: 700 }, (_, index) => `https://example.com/${index}`).join(" ");
  const result = protect(input, rules.protectedPatterns);
  assert.ok(result.fragments.length <= internals.components.protection.MAX_TOTAL_MATCHES);
  assert.equal(internals.components.protection.MAX_TOTAL_MATCHES, 512);
});
