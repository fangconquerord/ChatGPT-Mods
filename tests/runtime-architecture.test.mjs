import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("performance guard loads before every runtime DOM observer", async () => {
  const manifest = JSON.parse(await source("manifest.json"));
  const scripts = manifest.content_scripts[0].js;
  const guardIndex = scripts.indexOf("content-performance-guard.js");
  assert.ok(guardIndex >= 0);

  for (const runtime of [
    "content-zh-CN.js",
    "content-chat-exporter.js",
    "content-chat-organizer.js",
    "content-temp-chat.js",
    "content-message-meta.js",
    "content-prompt-enhancer.js",
    "content-split-view.js",
  ]) {
    assert.ok(scripts.includes(runtime), `${runtime} must be shipped`);
    assert.ok(guardIndex < scripts.indexOf(runtime), `guard must load before ${runtime}`);
  }

  assert.ok(!scripts.includes("content-zh-CN-performance-fix.js"));
});

test("Chinese localization no longer performs document-wide attachment rescans", async () => {
  const zh = await source("content-zh-CN.js");
  assert.doesNotMatch(zh, /normalizeNativeAttachmentLabels\(document\)/u);
  assert.doesNotMatch(zh, /attachmentCompatObserver\.observe\(document\.documentElement/u);
  assert.match(zh, /function attachAttachmentHost\(/u);
  assert.match(zh, /function attachAttachmentTray\(/u);
});

test("streaming guard is cross-realm safe", async () => {
  const guard = await source("content-performance-guard.js");
  assert.match(guard, /node\.nodeType === 1/u);
  assert.doesNotMatch(guard, /node instanceof Element/u);
  assert.match(guard, /suppressedMutations/u);
});

test("production build derives top-level content scripts from manifest", async () => {
  const build = await source("scripts/build.mjs");
  assert.match(build, /manifest\.content_scripts\.flatMap/u);
  assert.match(build, /if \(!script\.includes\("\/"\)\) rootFiles\.add\(script\)/u);
});
