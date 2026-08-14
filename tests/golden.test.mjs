import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compiler } from "./helpers/load-compiler.mjs";

const cases = JSON.parse(await readFile(new URL("./fixtures/golden-cases.json", import.meta.url), "utf8"));

for (const fixture of cases) {
  test(`golden: ${fixture.id}`, () => {
    const result = compiler.enhancePrompt({ text: fixture.input });
    if (fixture.intent) assert.equal(result.primaryIntent, fixture.intent);
    if (fixture.action) assert.equal(result.action, fixture.action);
    for (const value of fixture.contains || []) assert.ok(result.improvedText.includes(value), `${fixture.id} lost ${value}\n${result.improvedText}`);
    for (const value of fixture.excludes || []) assert.ok(!result.improvedText.toLocaleLowerCase().includes(value.toLocaleLowerCase()), `${fixture.id} invented ${value}`);
    assert.equal(result.changed, result.action !== "unchanged");
    assert.ok(result.clarifyingQuestions.length <= 3);
  });
}
