import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("manifest loads prompt compiler before the lightweight prompt enhancer", async () => {
  const manifest = JSON.parse(await source("manifest.json"));
  const scripts = manifest.content_scripts[0].js;
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.ok(scripts.indexOf("prompt-compiler/index.js") < scripts.indexOf("content-prompt-enhancer-lite.js"));
  assert.ok(scripts.indexOf("prompt-compiler/rules-bundle.js") < scripts.indexOf("prompt-compiler/rules-loader.js"));
});

test("chat export remains user-triggered and keeps supported output paths", async () => {
  const exporter = await source("content-chat-exporter-lite.js");
  const background = await source("background.js");
  assert.match(exporter, /Word \(\.rtf\)/u);
  assert.match(exporter, /PDF（通过打印窗口另存）/u);
  assert.match(exporter, /application\/rtf/u);
  assert.match(exporter, /text\/plain/u);
  assert.match(exporter, /openPrintDialog/u);
  assert.match(background, /chrome\.downloads\.download/u);
});

test("temporary chat transfer remains available without mutation observers", async () => {
  const temp = await source("content-temp-chat-lite.js");
  assert.match(temp, /cgpt_nav_transfer_payload/u);
  assert.match(temp, /window\.open/u);
  assert.match(temp, /setComposerText/u);
  assert.doesNotMatch(temp, /MutationObserver/u);
});

test("feature settings remain enabled by default", async () => {
  const settings = await source("content-settings.js");
  for (const key of ["splitView", "fileInfo", "promptEnhancer", "tempChat", "chatOrganizer", "chatExport"]) {
    assert.match(settings, new RegExp(`${key}: true`, "u"));
  }
});

test("extension permissions stay minimal", async () => {
  const manifest = JSON.parse(await source("manifest.json"));
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "downloads", "storage"]);
  assert.equal(manifest.background?.service_worker, "background.js");
});
