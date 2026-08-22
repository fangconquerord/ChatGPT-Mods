import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { compiler, rules } from "./helpers/load-compiler.mjs";
import { readRuleSources } from "../scripts/build-rules.mjs";

const IDEMPOTENT_INPUTS = [
  "Сравни V9 Pro и V9 Turbo+.",
  "Напиши парсер JSON на Python.",
  "Игра зависает при Alt+Tab, звук остаётся, изображение не меняется.",
  "Подбери беспроводные наушники до 10000 рублей.",
  "Compare Alpha 2 and Beta 3 for daily use."
];

for (const input of IDEMPOTENT_INPUTS) {
  test(`second enhancement is idempotent: ${input.slice(0, 34)}`, () => {
    const first = compiler.enhancePrompt({ text: input });
    const second = compiler.enhancePrompt({ text: first.improvedText });
    assert.equal(second.improvedText, first.improvedText);
    assert.equal(second.action, "unchanged");
  });
}

test("same input and context always produce the same result", () => {
  const request = { text: "Сравни эти две модели.", context: [{ role: "user", content: "Модели Alpha 2 и Beta 3." }] };
  const first = compiler.enhancePrompt(request);
  assert.deepEqual(first, compiler.enhancePrompt(request));
  assert.match(first.improvedText, /Alpha 2 и Beta 3/u);
  assert.match(first.improvedText, /Явный контекст пользователя/u);
});

test("assistant assumptions are not copied into the prompt", () => {
  const result = compiler.enhancePrompt({
    text: "Посоветуй вариант.",
    context: [{ role: "assistant", content: "Предположим, что бюджет 50000 рублей и платформа Windows." }]
  });
  assert.ok(!result.improvedText.includes("50000"));
  assert.ok(!result.improvedText.includes("Windows"));
});

test("manifest loads the compiler before the composer integration", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const scripts = manifest.content_scripts[0].js;
  assert.equal(manifest.manifest_version, 3);
  assert.ok(scripts.indexOf("prompt-compiler/index.js") < scripts.indexOf("content-prompt-enhancer.js"));
  assert.ok(scripts.indexOf("prompt-compiler/rules-bundle.js") < scripts.indexOf("prompt-compiler/rules-loader.js"));
  assert.ok(scripts.indexOf("prompt-compiler/synthesis.js") < scripts.indexOf("prompt-compiler/renderer.js"));
});

test("chat organizer is injected only in the top frame and retains native chat controls", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const scripts = manifest.content_scripts[0].js;
  const source = await readFile(new URL("../content-chat-organizer.js", import.meta.url), "utf8");
  const popup = await readFile(new URL("../popup.js", import.meta.url), "utf8");

  assert.ok(scripts.includes("content-chat-organizer.js"));
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.match(source, /const STORAGE_KEY = "cgptChatOrganizer"/u);
  assert.match(source, /const GROUP_HOST_ATTR = "data-cgpt-chat-group"/u);
  assert.match(source, /function isNativePinned\(anchor, row\)/u);
  assert.match(source, /function isProjectChat\(anchor, row\)/u);
  assert.match(source, /function scheduleNativeActionCheck\(chatId\)/u);
  assert.match(source, /function moveChatToGroup\(chatId, groupId\)/u);
  assert.match(source, /function bindDropTarget\(element, groupId\)/u);
  assert.match(source, /addEventListener\("dragstart"/u);
  assert.match(source, /addEventListener\("drop"/u);
  assert.match(source, /"⚠️", "❗", "❕", "‼️"/u);
  assert.doesNotMatch(source, /if \(window !== window\.top\) return/u);
  assert.match(popup, /reset-chat-organizer/u);
  assert.match(popup, /window\.confirm/u);
  assert.match(popup, /chrome\.storage\.local\.remove/u);
});

test("Prompt Compiler browser code contains no network or dynamic execution APIs", async () => {
  const names = ["normalization", "protection", "language", "segmentation", "classifier", "extraction", "context", "ambiguity", "planner", "synthesis", "renderer", "candidates", "scoring", "validation", "diagnostics", "rules-loader", "pipeline", "index"];
  for (const name of names) {
    const source = await readFile(new URL(`../prompt-compiler/${name}.js`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\b|new\s+Function/u);
    assert.doesNotMatch(source, /from\s+["']node:/u);
  }
});

test("generated rule bundle matches every JSON source", async () => {
  const sourceRules = await readRuleSources();
  assert.equal(sourceRules.sourceDigest, rules.sourceDigest);
  assert.equal(sourceRules.intents.length, rules.intents.length);
  assert.equal(sourceRules.modules.length, rules.modules.length);
});

test("content integration uses the compiler and retains native undo guidance", async () => {
  const source = await readFile(new URL("../content-prompt-enhancer.js", import.meta.url), "utf8");
  assert.match(source, /GPTModsPromptCompiler/u);
  assert.match(source, /Ctrl\+Z/u);
  assert.doesNotMatch(source, /buildEnhancedPrompt/u);
});

test("message metadata is idle-only and leaves ChatGPT native attachments untouched", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const scripts = manifest.content_scripts[0].js;
  const source = await readFile(new URL("../content-message-meta-lite.js", import.meta.url), "utf8");

  assert.ok(scripts.includes("content-message-meta-lite.js"));
  assert.ok(!scripts.includes("content-message-meta.js"));
  assert.ok(!scripts.includes("content-zh-CN.js"));
  assert.match(source, /requestIdleCallback/u);
  assert.match(source, /backend-api\/conversation/u);
  assert.match(source, /function currentConversationPath\(/u);
  assert.match(source, /function upsertFooterTimestamp\(/u);
  assert.doesNotMatch(source, /MutationObserver/u);
  assert.doesNotMatch(source, /NATIVE_ATTACHMENT_TRAY_ATTR/u);
  assert.doesNotMatch(source, /ATTACHMENT_LIMIT/u);
  assert.doesNotMatch(source, /getBoundingClientRect/u);
});

test("candidate generation is bounded", () => {
  const result = compiler.enhancePrompt({ text: "Напиши парсер CSV на JavaScript с обработкой ошибок." });
  assert.ok(result.metrics.candidateCount >= 2 && result.metrics.candidateCount <= 5);
});

test("changed and action fields remain consistent", () => {
  for (const input of [...IDEMPOTENT_INPUTS, "Сколько будет 2 + 2?"]) {
    const result = compiler.enhancePrompt({ text: input });
    assert.equal(result.changed, result.action !== "unchanged");
    assert.equal(result.metrics.improvedLength, result.improvedText.length);
  }
});

test("ordinary prompt processing stays below the generous regression budget", () => {
  const samples = Array.from({ length: 120 }, (_, index) => `Сравни Model${index} Pro и Model${index} Turbo+ для практического использования.`);
  const startedAt = performance.now();
  for (const text of samples) compiler.enhancePrompt({ text });
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed < 1500, `120 prompts took ${elapsed.toFixed(1)} ms`);
});

test("rule bundle does not contain empty demo collections", () => {
  assert.ok(rules.intents.length >= 36);
  assert.ok(rules.modules.length >= 80);
  assert.ok(rules.protectedPatterns.length >= 25);
  assert.ok(rules.domainRules.length >= 10);
});

test("extension permissions include only local settings and user-confirmed exports", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.deepEqual([...manifest.permissions].sort(), ["activeTab", "downloads", "storage"]);
  assert.equal(manifest.background?.service_worker, "background.js");
  assert.equal(manifest.content_security_policy, undefined);
});

test("chat export is shipped with a feature toggle and a local downloads handler", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  const source = await readFile(new URL("../content-chat-exporter.js", import.meta.url), "utf8");
  const popup = await readFile(new URL("../popup.js", import.meta.url), "utf8");
  const settings = await readFile(new URL("../content-settings.js", import.meta.url), "utf8");
  const background = await readFile(new URL("../background.js", import.meta.url), "utf8");

  assert.ok(manifest.content_scripts[0].js.includes("content-chat-exporter.js"));
  assert.match(source, /const FEATURE_KEY = "chatExport"/u);
  assert.match(source, /Word \(\.rtf\)/u);
  assert.match(source, /formatButton\("print", "打印"/u);
  assert.match(source, /application\/pdf/u);
  assert.match(source, /openPdfDialog/u);
  assert.match(source, /inlineImages/u);
  assert.match(source, /buildWordRtf/u);
  assert.match(source, /buildPdfFile/u);
  assert.match(source, /enrichArchiveWithConversation/u);
  assert.match(source, /backend-api\/conversation/u);
  assert.match(source, /addCodeButtons/u);
  assert.match(popup, /key: "chatExport"/u);
  assert.match(settings, /chatExport: true/u);
  assert.match(background, /saveAs: true/u);
  assert.match(background, /chrome\.downloads\.download/u);
});

test("chat header controls are positioned around ChatGPT's native controls", async () => {
  const exporter = await readFile(new URL("../content-chat-exporter.js", import.meta.url), "utf8");
  const split = await readFile(new URL("../content-split-view.js", import.meta.url), "utf8");

  assert.match(exporter, /function findHeaderActions\(\)/u);
  assert.match(exporter, /function positionMainButton\(\)/u);
  assert.match(exporter, /HEADER_ACTION_LABEL_PATTERN/u);
  assert.match(split, /function findSidebarControl\(\)/u);
  assert.match(split, /function positionSplitButton\(\)/u);
  assert.match(split, /schedulePositionSplitButton/u);
});

test("similar what-does questions receive subject-specific reasoning rather than a shared suffix", () => {
  const outputs = [
    compiler.enhancePrompt({ text: "Что делает Redis?", locale: "ru" }).improvedText,
    compiler.enhancePrompt({ text: "Что делает функция map?", locale: "ru" }).improvedText,
    compiler.enhancePrompt({ text: "Что делает этот код?", locale: "ru" }).improvedText,
  ];
  assert.match(outputs[0], /роль|назначение|инструмент|сценарий/iu);
  assert.match(outputs[1], /вход|возвращаемое значение|исходную коллекцию/iu);
  assert.match(outputs[2], /ход выполнения|побочные эффекты|фрагмент кода/iu);
  assert.equal(new Set(outputs.map((text) => text.split(/\.\s+/u).slice(1).join(". "))).size, 3);
  for (const output of outputs) assert.doesNotMatch(output, /Требования к ответу|Response requirements/u);
});

test("write-code prompts synthesize task-specific contracts", () => {
  const parser = compiler.enhancePrompt({ text: "Напиши парсер JSON на Python.", locale: "ru" }).improvedText;
  const backup = compiler.enhancePrompt({ text: "Напиши скрипт резервного копирования на Bash.", locale: "ru" }).improvedText;
  const sorting = compiler.enhancePrompt({ text: "Напиши функцию сортировки массива на JavaScript.", locale: "ru" }).improvedText;
  assert.match(parser, /невалидн|синтаксическ[а-яё]* ошиб|повреждённ|контракт парсера/iu);
  assert.match(backup, /каталог назначения|повторный запуск|резервная копия/iu);
  assert.match(sorting, /компаратор|исходный массив|дубликаты/iu);
  assert.equal(new Set([parser, backup, sorting]).size, 3);
});

test("write-content prompts are separated from programming and shaped by format", () => {
  const story = compiler.enhancePrompt({ text: "Напиши рассказ о роботе, который боится дождя.", locale: "ru" });
  const article = compiler.enhancePrompt({ text: "Напиши статью о цифровой гигиене для родителей.", locale: "ru" });
  const poem = compiler.enhancePrompt({ text: "Напиши стихотворение о первом снеге.", locale: "ru" });
  for (const result of [story, article, poem]) assert.equal(result.primaryIntent, "creative_writing");
  assert.match(story.improvedText, /геро|персонаж|напряжение|конфликт/iu);
  assert.match(article.improvedText, /основн(?:ая|ую) мысль|тезис|абзац|переход/iu);
  assert.match(poem.improvedText, /образ|голос|ритм|финальная строка/iu);
});

test("content-synthesized prompts remain idempotent", () => {
  const inputs = [
    "Что делает Redis?",
    "Что делает функция map?",
    "Что делает этот код?",
    "Напиши письмо клиенту об отмене встречи.",
    "Напиши рассказ о роботе, который боится дождя.",
    "Напиши статью о цифровой гигиене для родителей.",
    "Напиши стихотворение о первом снеге.",
    "Напиши парсер CSV на JavaScript.",
    "Напиши скрипт резервного копирования по расписанию на Bash.",
    "Напиши письмо клиенту о переносе встречи.",
    "Что делает этот код?\n```js\ndocument.querySelector(\"button\").addEventListener(\"click\", () => window.alert(\"ok\"));\n```",
    "Нарисуй кота.",
    "Создай фотореалистичный портрет кота в дожде.",
    "Нарисуй аниме-иллюстрацию кота на крыше.",
  ];
  for (const input of inputs) {
    const first = compiler.enhancePrompt({ text: input, locale: "ru" });
    const second = compiler.enhancePrompt({ text: first.improvedText, locale: "ru" });
    assert.equal(second.action, "unchanged", input);
    assert.equal(second.improvedText, first.improvedText, input);
  }
});

test("clarification questions are tied to the active task", () => {
  const imagePrompt = compiler.enhancePrompt({ text: "Составь промт для картинки с мягким освещением.", locale: "ru" });
  assert.match(imagePrompt.improvedText, /Что именно должно быть изображено/iu);
  assert.doesNotMatch(imagePrompt.improvedText, /какой компании/iu);
});

test("image prompts with an explicit subject are enhanced instead of clarified", () => {
  const cat = compiler.enhancePrompt({ text: "Нарисуй кота.", locale: "ru" });
  const photo = compiler.enhancePrompt({ text: "Создай фотореалистичный портрет кота в дожде.", locale: "ru" });
  const anime = compiler.enhancePrompt({ text: "Нарисуй аниме-иллюстрацию кота на крыше.", locale: "ru" });
  const empty = compiler.enhancePrompt({ text: "Нарисуй.", locale: "ru" });

  for (const result of [cat, photo, anime]) {
    assert.equal(result.primaryIntent, "image_generation_prompt");
    assert.equal(result.action, "rewritten");
    assert.deepEqual(result.clarifyingQuestions, []);
    assert.match(result.improvedText, /4K/iu);
    assert.match(result.improvedText, /Негативный промт/iu);
    assert.doesNotMatch(result.improvedText, /Что именно должно быть изображено/iu);
  }
  assert.match(photo.improvedText, /фотореалистичн|профессиональной фотографии/iu);
  assert.doesNotMatch(photo.improvedText, /критери[яй] выбора|рекомендаци/iu);
  assert.match(anime.improvedText, /аниме-стилистик|аниме-иллюстраци/iu);
  assert.doesNotMatch(anime.improvedText, /фотореалистичн/iu);
  assert.equal(empty.action, "clarify_then_answer");
  assert.match(empty.improvedText, /Что именно должно быть изображено/iu);
  assert.doesNotMatch(empty.improvedText, /Негативный промт/iu);
});

test("secondary intent hints do not leak irrelevant modules into the winner", () => {
  const proofreading = compiler.enhancePrompt({ text: "Проверь орфографию и исправь ошибки в тексте.", locale: "ru" });
  assert.match(proofreading.improvedText, /орфограф|граммат|пунктуац/iu);
  assert.doesNotMatch(proofreading.improvedText, /персонаж|сюжет|жанр/iu);
});
