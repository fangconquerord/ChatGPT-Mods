import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("runtime ships without global MutationObserver monkey patches", async () => {
  const manifest = JSON.parse(await source("manifest.json"));
  const scripts = manifest.content_scripts[0].js;
  assert.ok(!scripts.includes("content-performance-guard.js"));
  assert.ok(!scripts.includes("content-zh-CN-performance-fix.js"));
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
  }
});

test("Chinese localization no longer performs document-wide attachment rescans", async () => {
  const zh = await source("content-zh-CN.js");
  assert.doesNotMatch(zh, /normalizeNativeAttachmentLabels\(document\)/u);
  assert.doesNotMatch(zh, /attachmentCompatObserver\.observe\(document\.documentElement/u);
  assert.match(zh, /function attachAttachmentHost\(/u);
  assert.match(zh, /function attachAttachmentTray\(/u);
  assert.match(zh, /function localizeAddedNode\(/u);
});

test("message metadata processes new messages and composer changes incrementally", async () => {
  const meta = await source("content-message-meta.js");
  assert.match(meta, /const pendingMessages = new Set\(\)/u);
  assert.match(meta, /function collectMessagesFromNode\(/u);
  assert.match(meta, /function mutationTouchesComposer\(/u);
  assert.match(meta, /function currentConversationPath\(/u);
  assert.doesNotMatch(meta, /new MutationObserver\(scheduleRun\)/u);
});

test("chat exporter scopes code and copy-button work to added subtrees", async () => {
  const exporter = await source("content-chat-exporter.js");
  assert.match(exporter, /MUTATION_RELEVANT_SELECTOR/u);
  assert.match(exporter, /function addCodeButtons\(root = document\)/u);
  assert.match(exporter, /function addCopyTextButtons\(root = document\)/u);
  assert.match(exporter, /function scheduleMutationWork\(root\)/u);
  assert.doesNotMatch(exporter, /new MutationObserver\(scheduleMutation/u);
});

test("chat organizer observes the sidebar instead of rerendering on every page mutation", async () => {
  const organizer = await source("content-chat-organizer.js");
  assert.match(organizer, /function findSidebarRoot\(\)/u);
  assert.match(organizer, /function attachSidebar\(root\)/u);
  assert.match(organizer, /state\.sidebarObserver\.observe\(root/u);
  assert.doesNotMatch(organizer, /state\.observer\.observe\(document\.documentElement/u);
});

test("split view ignores streaming message churn", async () => {
  const split = await source("content-split-view.js");
  assert.match(split, /HEADER_RELEVANT_SELECTOR/u);
  assert.match(split, /function frameMutationTouchesNavigator\(/u);
  assert.match(split, /function nodeTouchesHeaderControls\(/u);
  assert.doesNotMatch(split, /const observer = new MutationObserver\(\(\) =>/u);
});

test("prompt enhancer only reruns when composer structure appears", async () => {
  const enhancer = await source("content-prompt-enhancer.js");
  assert.match(enhancer, /COMPOSER_SELECTOR/u);
  assert.match(enhancer, /function nodeTouchesComposer\(/u);
  assert.doesNotMatch(enhancer, /new MutationObserver\(scheduleRun\)/u);
});

test("temporary chat avoids whole-body text walking and opens transfer windows synchronously", async () => {
  const temp = await source("content-temp-chat.js");
  assert.doesNotMatch(temp, /createTreeWalker\(document\.body/u);
  assert.match(temp, /function headerSearchRoots\(\)/u);
  assert.match(temp, /const win = window\.open\("about:blank", "_blank"\)/u);
  assert.match(temp, /function nodeTouchesTempUi\(/u);
});

test("production build derives top-level content scripts from manifest", async () => {
  const build = await source("scripts/build.mjs");
  assert.match(build, /manifest\.content_scripts\.flatMap/u);
  assert.match(build, /if \(!script\.includes\("\/"\)\) rootFiles\.add\(script\)/u);
});
