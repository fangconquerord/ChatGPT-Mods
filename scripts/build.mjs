import { cp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildRuleBundle } from "./build-rules.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await buildRuleBundle();
await rm(output, { force: true, recursive: true });
await mkdir(output, { recursive: true });

const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
if (manifest.manifest_version !== 3) {
  throw new Error("Production manifest is not Manifest V3");
}

const scriptPaths = [...new Set(
  manifest.content_scripts.flatMap((entry) => entry.js || []),
)];

const rootFiles = new Set([
  "manifest.json",
  "popup.html",
  "popup.css",
  "popup.js",
  "background.js",
  "README.md",
  "LICENSE",
]);

for (const script of scriptPaths) {
  if (!script.includes("/")) rootFiles.add(script);
}

for (const file of rootFiles) {
  await cp(path.join(root, file), path.join(output, file));
}

await cp(path.join(root, "icons"), path.join(output, "icons"), { recursive: true });
await cp(path.join(root, "prompt-compiler"), path.join(output, "prompt-compiler"), { recursive: true });

for (const script of scriptPaths) {
  await readFile(path.join(output, script));
}

console.log(
  `Production build created in dist with ${scriptPaths.length} content scripts.`,
);
