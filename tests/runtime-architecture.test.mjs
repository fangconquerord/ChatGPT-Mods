import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("runtime is top-frame only and excludes legacy streaming observers", async () => {
  const manifest = JSON.parse(await source("manifest.json"));
  const entry = manifest.content_scripts[0];
  const scripts = entry.js;

  assert.equal(entry.all_frames, false);
  for (const legacy of [
    "content-performance-guard.js",
    "content-zh-CN-performance-fix.js",
    "content-zh-CN.js",
    "content-message-meta.js",
    "content-chat-exporter.js",
    "content-temp-chat.js",
    "content-prompt-enhancer.js",
    "content-split-view.js",
  ]) {
    assert.ok(!scripts.includes(legacy), `${legacy} must not be shipped`);
  }

  for (const runtime of [
    "content-chat-exporter-lite.js",
    "content-chat-organizer.js",
    "content-temp-chat-lite.js",
    "content-message-meta-lite.js",
    "content-prompt-enhancer-lite.js",
    "content-split-view-lite.js",
  ]) {
    assert.ok(scripts.includes(runtime), `${runtime} must be shipped`);
  }
});

test("message metadata never observes streaming DOM", async () => {
  const meta = await source("content-message-meta-lite.js");
  assert.match(meta, /requestIdleCallback/u);
  assert.match(meta, /backend-api\/conversation/u);
  assert.doesNotMatch(meta, /MutationObserver/u);
  assert.doesNotMatch(meta, /getBoundingClientRect/u);
  assert.doesNotMatch(meta, /getComputedStyle/u);
  assert.doesNotMatch(meta, /__reactFiber/u);
});

test("chat exporter is fully on-demand", async () => {
  const exporter = await source("content-chat-exporter-lite.js");
  assert.doesNotMatch(exporter, /MutationObserver/u);
  assert.doesNotMatch(exporter, /\.innerText/u);
  assert.doesNotMatch(exporter, /getComputedStyle/u);
  assert.doesNotMatch(exporter, /getBoundingClientRect/u);
  assert.match(exporter, /function collectPlainText\(/u);
  assert.match(exporter, /button\.addEventListener\("click"/u);
});

test("split view is event-driven until explicitly opened", async () => {
  const split = await source("content-split-view-lite.js");
  assert.doesNotMatch(split, /MutationObserver/u);
  assert.match(split, /function openSplit\(/u);
  assert.match(split, /window\.addEventListener\("pageshow"/u);
  assert.match(split, /window\.addEventListener\("popstate"/u);
});

test("prompt enhancer does not watch document mutations", async () => {
  const enhancer = await source("content-prompt-enhancer-lite.js");
  assert.doesNotMatch(enhancer, /MutationObserver/u);
  assert.match(enhancer, /GPTModsPromptCompiler/u);
  assert.match(enhancer, /document\.addEventListener\("focusin"/u);
});

test("temporary chat uses finite checks instead of a document observer", async () => {
  const temp = await source("content-temp-chat-lite.js");
  assert.doesNotMatch(temp, /MutationObserver/u);
  assert.doesNotMatch(temp, /\.innerText/u);
  assert.match(temp, /\[0, 400, 1200, 2600\]/u);
  assert.match(temp, /function scheduleFiniteChecks\(/u);
});

test("chat organizer confines active rendering to the sidebar", async () => {
  const organizer = await source("content-chat-organizer.js");
  assert.match(organizer, /state\.sidebarObserver\.observe\(root/u);
  assert.match(organizer, /if \(state\.sidebarRoot\?\.isConnected\) return/u);
});

test("production build derives top-level content scripts from manifest", async () => {
  const build = await source("scripts/build.mjs");
  assert.match(build, /manifest\.content_scripts\.flatMap/u);
  assert.match(build, /if \(!script\.includes\("\/"\)\) rootFiles\.add\(script\)/u);
});
