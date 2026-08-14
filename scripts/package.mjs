import { mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import "./build.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseDirectory = path.join(root, "release");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
const archive = path.join(releaseDirectory, `ChatGPT-Mods-${manifest.version}.zip`);
await mkdir(releaseDirectory, { recursive: true });
await rm(archive, { force: true });
const command = `$ErrorActionPreference='Stop'; Compress-Archive -Path '${path.join(root, "dist", "*").replaceAll("'", "''")}' -DestinationPath '${archive.replaceAll("'", "''")}' -CompressionLevel Optimal`;
const result = spawnSync("powershell", ["-NoProfile", "-Command", command], { encoding: "utf8" });
if (result.status !== 0) throw new Error(result.stderr || result.stdout || "Unable to create extension archive");
const archiveStats = await stat(archive).catch(() => null);
if (!archiveStats || archiveStats.size === 0) throw new Error("Extension archive was not created or is empty");
console.log(`Packaged extension: ${archive}`);
