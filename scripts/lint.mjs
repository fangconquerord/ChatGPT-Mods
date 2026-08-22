import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const excludedDirectories = new Set(["dist", "release", "node_modules", ".git"]);
const files = [];

async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await collect(absolute);
    else if (/\.(?:js|mjs|json)$/u.test(entry.name)) files.push(absolute);
  }
}

await collect(root);

const failures = [];
for (const file of files.sort()) {
  const source = await readFile(file, "utf8");
  const relative = path.relative(root, file).replaceAll("\\", "/");

  if (source.split("\n").some((line) => /[ \t]+$/u.test(line))) {
    failures.push(`${relative}: trailing whitespace`);
  }

  if (/(?:^|\W)TODO(?:\W|$)/u.test(source) && !relative.endsWith("prompt-compiler/rules-bundle.js")) {
    failures.push(`${relative}: TODO is not allowed`);
  }

  if (relative.startsWith("prompt-compiler/") || relative === "content-prompt-enhancer.js") {
    if (/\b(?:eval|Function)\s*\(/u.test(source)) {
      failures.push(`${relative}: dynamic execution is forbidden`);
    }
    if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource)\b/u.test(source) && relative.startsWith("prompt-compiler/")) {
      failures.push(`${relative}: network API is forbidden in Prompt Compiler`);
    }
  }

  if (relative.endsWith(".json")) {
    try {
      JSON.parse(source);
    } catch (error) {
      failures.push(`${relative}: ${error.message}`);
    }
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log(`Lint passed for ${files.length} JavaScript/JSON files.`);
