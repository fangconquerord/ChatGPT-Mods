import { performance } from "node:perf_hooks";
import { compiler } from "../tests/helpers/load-compiler.mjs";

const samples = [
  "Сравни V9 Pro и V9 Turbo+.",
  "Напиши парсер JSON на Python с обработкой ошибок.",
  "Игра зависает при Alt+Tab, звук остаётся, изображение не меняется.",
  "Подбери беспроводные наушники до 10000 рублей.",
  "Кто сейчас руководит компанией?",
  "Compare Alpha 2 and Beta 3 for daily use.",
  "Write a local CSV converter in JavaScript without API."
];

const durations = [];
for (let index = 0; index < 1000; index += 1) {
  const startedAt = performance.now();
  compiler.enhancePrompt({ text: samples[index % samples.length] });
  durations.push(performance.now() - startedAt);
}
durations.sort((a, b) => a - b);
const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
const percentile95 = durations[Math.floor(durations.length * 0.95)];
console.log(`Prompt Compiler benchmark: ${durations.length} runs, avg ${average.toFixed(3)} ms, p95 ${percentile95.toFixed(3)} ms, max ${durations.at(-1).toFixed(3)} ms.`);
if (percentile95 > 50) process.exitCode = 1;
