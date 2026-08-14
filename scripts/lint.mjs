import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [path.join(root, "prompt-compiler"), path.join(root, "content-prompt-enhancer.js")];
const files = [];

async function collect(target) {
  const entries = await readdir(target, { withFileTypes: true }).catch(() => null);
  if (!entries) {
    files.push(target);
    return;
  }
  for (const entry of entries) {
    const absolute = path.join(target, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    else if (/\.(?:js|json)$/u.test(entry.name)) files.push(absolute);
  }
}

for (const target of targets) await collect(target);
const failures = [];
for (const file of files) {
  const source = await readFile(file, "utf8");
  if (source.split("\n").some((line) => /[ \t]+$/u.test(line))) failures.push(`${path.relative(root, file)}: trailing whitespace`);
  if (/\b(?:eval|Function)\s*\(/u.test(source)) failures.push(`${path.relative(root, file)}: dynamic execution is forbidden`);
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/u.test(source)) failures.push(`${path.relative(root, file)}: network API is forbidden in Prompt Compiler`);
  if (/(?:^|\W)TODO(?:\W|$)/u.test(source) && !file.endsWith("rules-bundle.js")) failures.push(`${path.relative(root, file)}: TODO is not allowed`);
  if (file.endsWith(".json")) {
    try { JSON.parse(source); } catch (error) { failures.push(`${path.relative(root, file)}: ${error.message}`); }
  }
}
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Lint passed for ${files.length} Prompt Compiler files.`);
