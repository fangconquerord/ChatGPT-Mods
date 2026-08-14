import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compiler, internals, rules } from "./helpers/load-compiler.mjs";
import { validateSchema } from "./helpers/schema-validator.mjs";

test("rule bundle initializes with production-scale data", () => {
  assert.deepEqual(compiler.initialize(), { intentCount: 39, moduleCount: 115, valid: true });
});

test("intent ids are unique", () => {
  assert.equal(new Set(rules.intents.map((item) => item.id)).size, rules.intents.length);
});

test("module ids are unique", () => {
  assert.equal(new Set(rules.modules.map((item) => item.id)).size, rules.modules.length);
});

test("all intent module references resolve", () => {
  const ids = new Set(rules.modules.map((item) => item.id));
  for (const intent of rules.intents) for (const id of intent.moduleIds) assert.ok(ids.has(id), `${intent.id} -> ${id}`);
});

test("all module dependency graphs are acyclic", () => {
  assert.doesNotThrow(() => internals.components.rulesLoader.validateModuleCycles(rules.modules));
});

test("every rule has Russian and English content", () => {
  for (const intent of rules.intents) assert.ok(intent.description.ru && intent.description.en);
  for (const module of rules.modules) assert.ok(module.text.ru && module.text.en);
});

for (const schemaFile of ["common.schema.json", "intents.schema.json", "modules.schema.json", "slot-schemas.schema.json"]) {
  test(`JSON Schema is valid and substantive: ${schemaFile}`, async () => {
    const schema = JSON.parse(await readFile(new URL(`../prompt-compiler/schemas/${schemaFile}`, import.meta.url), "utf8"));
    assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.ok(schema.$id);
    assert.ok(schema.$defs || schema.items);
  });
}

const schemaDocuments = {};
for (const filename of ["common.schema.json", "intents.schema.json", "modules.schema.json", "slot-schemas.schema.json"]) {
  schemaDocuments[filename] = JSON.parse(await readFile(new URL(`../prompt-compiler/schemas/${filename}`, import.meta.url), "utf8"));
}
for (const [filename, value] of [
  ["intents.schema.json", rules.intents],
  ["modules.schema.json", rules.modules],
  ["slot-schemas.schema.json", rules.slotSchemas]
]) {
  test(`rule data satisfies ${filename}`, () => {
    assert.deepEqual(validateSchema(value, schemaDocuments[filename], schemaDocuments), []);
  });
}

const CLASSIFICATION_CASES = [
  ["simple_question", "Кто такой Аристотель?"],
  ["explanation", "Объясни простыми словами, как работает кэш браузера."],
  ["definition", "Дай определение термину идемпотентность."],
  ["comparison", "Сравни V9 Pro и V9 Turbo+."],
  ["recommendation", "Посоветуй подходящий вариант для резервного копирования."],
  ["purchase_research", "Подбери беспроводные наушники до 10000 рублей."],
  ["decision_support", "Помоги решить, какой из вариантов выбрать по критериям."],
  ["troubleshooting", "Приложение не работает и постоянно вылетает."],
  ["technical_diagnosis", "Диагностируй симптомы и найди причину зависания игры."],
  ["programming_generation", "Напиши парсер JSON на Python."],
  ["debugging", "Исправь ошибку в коде: исключение при пустом вводе."],
  ["code_review", "Проведи код-ревью и найди проблемы безопасности."],
  ["refactoring", "Отрефактори модуль без изменения поведения."],
  ["configuration", "Настрой конфигурацию сервера и переменные окружения."],
  ["automation_workflow", "Автоматизируй этот воркфлоу по расписанию."],
  ["data_analysis", "Проведи анализ данных и проверь корреляцию в датасете."],
  ["spreadsheet_task", "Сделай таблицу времени в Excel без макросов."],
  ["document_analysis", "Проанализируй документ и выдели противоречия договора."],
  ["summarization", "Резюмируй текст и сохрани основные мысли."],
  ["information_extraction", "Извлеки поля и значения из приложенного текста."],
  ["rewriting", "Перепиши этот текст в более ясном стиле."],
  ["proofreading", "Проверь орфографию и исправь ошибки в тексте."],
  ["translation", "Переведи этот абзац на английский."],
  ["research", "Проведи исследование темы и найди первичные источники."],
  ["current_information", "Кто сейчас руководит компанией?"],
  ["planning", "Составь план проекта и укажи зависимости этапов."],
  ["how_to", "Как сделать резервную копию и проверить результат?"],
  ["learning", "Научи меня SQL и составь учебный план."],
  ["problem_solving", "Реши задачу и проверь вычисления."],
  ["brainstorming", "Проведи мозговой штурм и придумай разные идеи."],
  ["creative_writing", "Напиши рассказ с персонажем и цельным сюжетом."],
  ["image_generation_prompt", "Составь промт для картинки с мягким освещением."],
  ["email_or_message", "Напиши письмо клиенту об изменении встречи."],
  ["classification", "Классифицируй записи по заданным категориям."],
  ["structured_output", "Верни JSON со строгими именами полей."],
  ["file_transformation", "Конвертируй CSV в JSON без потери записей."],
  ["legal_information", "Какие требования действуют по закону для договора?"],
  ["medical_information", "Дай общую медицинскую информацию о симптомах болезни."],
  ["financial_information", "Объясни риски инвестиций и ожидаемую доходность."]
];

for (const [expected, input] of CLASSIFICATION_CASES) {
  test(`classifies ${expected}`, () => {
    const result = compiler.enhancePrompt({ text: input, locale: "ru" });
    assert.equal(result.primaryIntent, expected);
    assert.ok(result.confidence >= 0.2 && result.confidence <= 0.99);
  });
}

const PROTECTED_CASES = [
  ["code fence", "```js\nconst x = 1;\n```"],
  ["inline code", "`array.map(x => x.id)`"],
  ["URL", "https://example.com/a?q=1"],
  ["Markdown link", "[guide](https://example.com/docs)"],
  ["email", "dev.team+test@example.org"],
  ["IPv4", "192.168.10.24"],
  ["hash", "a3f1c9e7b2d4a6c8e0f1a3b5c7d9e1f2"],
  ["version", "v2.1.4-beta"],
  ["date ISO", "2026-08-05"],
  ["date local", "05.08.2026"],
  ["time", "23:45:10"],
  ["currency symbol", "₽ 12500"],
  ["currency word", "10000 рублей"],
  ["percentage", "37.5%"],
  ["measurement", "16 GB"],
  ["resolution", "3840x2160 px"],
  ["frequency", "144 Hz"],
  ["Windows path", "D:\\work\\config.json"],
  ["Unix path", "/var/log/app.log"],
  ["file name", "content-prompt-enhancer.js"],
  ["CLI option", "--config=settings.json"],
  ["environment assignment", "NODE_ENV=production"],
  ["HTTP error", "HTTP 404"],
  ["error message", "Error: connection refused by peer"],
  ["model Qwen", "Qwen3.5-0.8B"],
  ["model V9", "V9 Turbo+"],
  ["model GPT", "GPT-5.6"],
  ["JSON", "{\"enabled\":true,\"limit\":10}"],
  ["YAML", "enabled: true"],
  ["XML", "<item id=\"7\">value</item>"],
  ["SQL", "SELECT id, name FROM users WHERE active = 1;"],
  ["PowerShell", "Get-ChildItem -Path C:\\work -Force"],
  ["CMD", "dir C:\\work /b"],
  ["Bash", "grep -R error /var/log/app"],
  ["regular expression", "/^[a-z0-9_-]+$/giu"],
  ["quoted text", "«не изменяй это»"]
];

for (const [name, value] of PROTECTED_CASES) {
  test(`protects and restores ${name}`, () => {
    const protectedValue = internals.components.protection.protectText(value, rules.protectedPatterns);
    assert.ok(protectedValue.fragments.length > 0, `${name} was not protected`);
    assert.equal(internals.components.protection.restoreText(protectedValue.maskedText, protectedValue.fragments), value);
    assert.ok(internals.components.protection.validateTokens(protectedValue.maskedText, protectedValue.fragments).ok);
  });
}

const NEGATION_CASES = [
  "Не используй API.", "без макросов", "не менять содержимое", "только локально",
  "кроме файла X", "максимум 10", "не более 50", "не удалять данные"
];
for (const value of NEGATION_CASES) {
  test(`preserves constraint: ${value}`, () => {
    const result = compiler.enhancePrompt({ text: `Реализуй задачу; ${value}`, locale: "ru" });
    assert.ok(result.improvedText.includes(value));
  });
}

test("rejects non-string input through the typed public contract", () => {
  assert.throws(() => compiler.enhancePrompt({ text: 42 }), TypeError);
});

test("returns safe unchanged result for whitespace", () => {
  const result = compiler.enhancePrompt({ text: "   " });
  assert.equal(result.action, "unchanged");
  assert.ok(result.warnings.includes("input_empty"));
});

test("returns safe unchanged result for oversized input", () => {
  const input = "a".repeat(50001);
  const result = compiler.enhancePrompt({ text: input });
  assert.equal(result.improvedText, input);
  assert.ok(result.warnings.includes("input_too_long"));
});

test("constraint extraction keeps the restrictive clause instead of freezing the whole sentence", () => {
  const extract = internals.components.extraction.extractConstraintClause;
  assert.equal(extract("Сделай таблицу времени в Excel без макросов."), "без макросов.");
  assert.equal(extract("Реализуй задачу; Не используй API."), "Не используй API.");
});

test("visual subject extraction distinguishes a described image from an empty image request", () => {
  const extract = internals.components.ambiguity.extractVisualSubject;
  assert.equal(extract("Нарисуй кота.", "ru"), "кота");
  assert.equal(extract("Создай фотореалистичный портрет кота в дожде.", "ru"), "кота дожде");
  assert.equal(extract("Составь промт для картинки с мягким освещением.", "ru"), "");
  assert.equal(extract("Draw a cat.", "en"), "cat");
});
