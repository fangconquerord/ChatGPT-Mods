(() => {
  "use strict";

  const core = globalThis.GPTModsPromptCompilerInternals;
  if (!core) throw new Error("Prompt Compiler namespace is not initialized");

  const SUPPRESSED_BY_PROFILE = {
    backup_script: new Set(["error_handling", "full_runnable_code", "no_pseudocode", "preserve_language_tech", "tests", "usage_example"]),
    browser_extension: new Set(["error_handling", "full_runnable_code", "no_pseudocode", "preserve_language_tech", "tests", "usage_example"]),
    callable_behavior: new Set(["concise_simple", "define_then_example", "direct_answer_first", "explain_plain", "learning_examples"]),
    code_behavior: new Set(["concise_simple", "define_then_example", "direct_answer_first", "explain_plain", "learning_examples"]),
    collection_algorithm: new Set(["error_handling", "full_runnable_code", "no_pseudocode", "preserve_language_tech", "tests", "usage_example"]),
    comparison: new Set(["compare_practical", "compare_table", "compare_tradeoffs", "recommendation_by_scenario", "verify_revisions"]),
    content_writing: new Set(["brainstorm_constraints", "creative_coherence", "creative_style_preserve", "response_format"]),
    data_parser: new Set(["error_handling", "full_runnable_code", "no_pseudocode", "preserve_language_tech", "tests", "usage_example"]),
    email_message: new Set(["avoid_invented_data", "email_ready_text", "email_recipient_tone", "rewrite_preserve_meaning"]),
    error_meaning: new Set(["concise_simple", "define_then_example", "direct_answer_first", "explain_plain", "learning_examples"]),
    file_utility: new Set(["error_handling", "full_runnable_code", "no_pseudocode", "preserve_language_tech", "tests", "usage_example"]),
    generic_code: new Set(["error_handling", "full_runnable_code", "no_pseudocode", "preserve_language_tech", "tests", "usage_example"]),
    general_explanation: new Set(["concise_simple", "define_then_example", "direct_answer_first", "explain_plain", "learning_examples"]),
    image_generation: new Set(["avoid_invented_data", "image_negative_constraints", "image_visual_details", "response_format"]),
    narrative_writing: new Set(["brainstorm_constraints", "creative_coherence", "creative_style_preserve", "response_format"]),
    poetry_writing: new Set(["brainstorm_constraints", "creative_coherence", "creative_style_preserve", "response_format"]),
    service_api: new Set(["error_handling", "full_runnable_code", "no_pseudocode", "preserve_language_tech", "tests", "usage_example"]),
    software_role: new Set(["concise_simple", "define_then_example", "direct_answer_first", "explain_plain", "learning_examples"]),
  };

  function stableHash(value) {
    let hash = 2166136261;
    for (const character of String(value || "")) {
      hash ^= character.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function choose(values, seed, salt) {
    if (!values?.length) return "";
    return values[stableHash(`${seed}\u241f${salt}`) % values.length];
  }

  function stripTerminal(value) {
    return String(value || "").trim().replace(/[.!?]+$/u, "");
  }

  function ensureTerminal(value) {
    const text = String(value || "").trim();
    if (!text || /[.!?]$/u.test(text)) return text;
    return `${text}.`;
  }

  function replaceLeadingVerb(text, pattern, replacements, seed, salt) {
    if (!pattern.test(text)) return text;
    return text.replace(pattern, `${choose(replacements, seed, salt)} `);
  }

  function normalizedInstruction(value) {
    return String(value || "")
      .toLocaleLowerCase()
      .replace(/[\s.,;:!?—–-]+/gu, " ")
      .trim();
  }

  function uniqueInstructions(values) {
    const result = [];
    const seen = new Set();
    for (const value of values.flat().filter(Boolean)) {
      const sentence = ensureTerminal(value);
      const key = normalizedInstruction(sentence);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.push(sentence);
    }
    return result;
  }

  function inferProfile(plan) {
    const text = String(plan.taskGoal || plan.goal || "").toLocaleLowerCase();
    const intent = plan.primaryIntent;

    if (intent === "image_generation_prompt") return "image_generation";
    if (intent === "email_or_message") return "email_message";
    if (intent === "comparison") return "comparison";
    if (intent === "creative_writing") {
      if (/стих|поэм|рифм|poem|poetry|verse|rhyme/iu.test(text)) return "poetry_writing";
      if (/стать|пост|описани|заметк|article|blog\s+post|description|essay/iu.test(text)) return "content_writing";
      return "narrative_writing";
    }
    if (["programming_generation", "debugging", "code_review", "refactoring", "configuration", "automation_workflow"].includes(intent)) {
      if (/резервн|копи(?:я|рован)|архив|backup|snapshot|archive/iu.test(text)) return "backup_script";
      if (/парс(?:ер|инг)|разобрать\s+(?:json|xml|yaml)|конверт|convert|parse|\b(?:json|csv|xml|yaml|tsv)\b/iu.test(text)) return "data_parser";
      if (/сортир|компаратор|массив|список|коллекц|\bsort\b|\barray\b|\blist\b|collection/iu.test(text)) return "collection_algorithm";
      if (/расширен\w*\s+(?:chrome|браузер)|browser\s+extension|content\s+script|manifest\s*v?3/iu.test(text)) return "browser_extension";
      if (/\bapi\b|endpoint|http\s+(?:server|service)|веб-?сервис|маршрут\w*|контроллер\w*/iu.test(text)) return "service_api";
      if (/файл|каталог|директор|путь|\bfile\b|directory|folder|path/iu.test(text)) return "file_utility";
      return "generic_code";
    }

    if (["simple_question", "explanation", "definition"].includes(intent)) {
      if (/этот\s+код|фрагмент\w*\s+код|код\s+(?:выше|ниже)|this\s+code|code\s+(?:above|below)|\uE000GPTMODS_CODE_/iu.test(text)) return "code_behavior";
      if (/функци|метод\w*|процедур|оператор\w*|\bfunction\b|\bmethod\b|callback/iu.test(text)) return "callable_behavior";
      if (/ошиб|исключен|статус\w*|\berror\b|\bexception\b|http\s*\d{3}/iu.test(text)) return "error_meaning";
      if (/redis|docker|kubernetes|postgres|mysql|mongodb|nginx|apache|kafka|rabbitmq|database|баз\w*\s+данн|сервер|фреймворк|библиотек|\bapi\b|операционн\w*\s+систем/iu.test(text)) return "software_role";
      return "general_explanation";
    }

    if (["troubleshooting", "technical_diagnosis", "debugging"].includes(intent)) return "diagnosis";
    if (intent === "how_to") return "procedure";
    return "general";
  }

  function extractQuestionSubject(task, language) {
    const text = String(task || "").trim().split("\n", 1)[0].trim();
    const patterns = language === "ru"
      ? [
        /^что\s+делает\s+(.+?)[?!.]*$/iu,
        /^для\s+чего\s+(?:нужен|нужна|нужно|нужны)\s+(.+?)[?!.]*$/iu,
      ]
      : [
        /^what\s+does\s+(.+?)\s+do[?!.]*$/iu,
        /^what\s+is\s+(.+?)\s+for[?!.]*$/iu,
      ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return stripTerminal(match[1]);
    }
    return "";
  }

  function rewriteQuestion(plan, profile, language, seed) {
    const task = String(plan.taskGoal || plan.goal || "").trim();
    const firstLine = task.split("\n", 1)[0].trim();
    const attachment = task.slice(firstLine.length).trim();
    const subject = extractQuestionSubject(task, language);
    if (!subject) {
      if (language === "ru") {
        return `Дай прямой содержательный ответ на вопрос: ${task}`;
      }
      return `Give a direct, substantive answer to this question: ${task}`;
    }

    const variants = language === "ru" ? {
      callable_behavior: [
        `Разбери, что делает ${subject}, какие данные получает и какой результат возвращает`,
        `Объясни, как работает ${subject}: что поступает на вход и что получается на выходе`,
      ],
      code_behavior: [
        `Разбери, что делает ${subject}: что происходит при выполнении и к какому результату это приводит`,
        `Разбери, что делает ${subject}, проследив выполнение от входных данных до результата`,
      ],
      general_explanation: [
        `Объясни, что делает ${subject} и зачем это нужно`,
        `Раскрой назначение ${subject} и практический смысл его работы`,
      ],
      software_role: [
        `Объясни, какую роль выполняет ${subject} и какую задачу решает`,
        `Раскрой назначение ${subject}: для чего это используют и что получают в результате`,
      ],
    } : {
      callable_behavior: [
        `Explain how ${subject} works, including its input and return value`,
        `Break down the behavior of ${subject}: what it receives and what it produces`,
      ],
      code_behavior: [
        `Trace the behavior of ${subject} from its inputs to its result`,
        `Explain the execution logic of ${subject} and the observable result`,
      ],
      general_explanation: [
        `Explain what ${subject} does and why it is useful`,
        `Clarify the purpose of ${subject} and its practical effect`,
      ],
      software_role: [
        `Explain the role of ${subject} and the problem it solves`,
        `Clarify what ${subject} is used for and what it provides in practice`,
      ],
    };
    const rewritten = ensureTerminal(choose(variants[profile] || variants.general_explanation, seed, "question_rewrite"));
    return attachment ? `${rewritten}\n${attachment}` : rewritten;
  }

  function imagePromptRemainder(task, language) {
    const command = language === "ru"
      ? /^(?:нарисуй|изобрази|сгенерируй(?:\s+(?:изображение|картинку|арт))?|создай|сделай|покажи|составь\s+(?:промт|описание)\s+(?:для\s+)?)\s*/iu
      : /^(?:draw|illustrate|render|generate(?:\s+(?:an?\s+)?(?:image|picture|artwork))?|create|make|show|write\s+(?:an?\s+)?(?:image\s+)?prompt\s+(?:for\s+)?)\s*/iu;
    return String(task || "").trim().replace(command, "").trim();
  }

  function rewriteImageTask(plan, language) {
    const task = String(plan.taskGoal || plan.goal || "").trim();
    const ambiguity = core.components.ambiguity;
    if (!ambiguity?.extractVisualSubject(task, language)) return ensureTerminal(task);
    const remainder = stripTerminal(imagePromptRemainder(task, language));
    if (!remainder) return ensureTerminal(task);

    if (language === "ru") {
      const alreadyVisual = /^(?:изображени[а-яё]*|картинк[а-яё]*|иллюстраци[а-яё]*|арт[а-яё]*|фото(?:графи[а-яё]*)?|фотореалистичн[а-яё]*|реалистичн[а-яё]*|аниме|3d|портрет[а-яё]*|обложк[а-яё]*)/iu.test(remainder);
      return ensureTerminal(alreadyVisual
        ? `Создай ${remainder}`
        : `Создай высокодетализированное изображение ${remainder}`);
    }

    const alreadyVisual = /^(?:an?\s+)?(?:image|picture|illustration|artwork|photo(?:graph)?|photorealistic|realistic|anime|3d|portrait|cover)/iu.test(remainder);
    const subject = remainder.replace(/^an?\s+/iu, "");
    return ensureTerminal(alreadyVisual
      ? `Create ${remainder}`
      : `Create a high-detail image of ${subject}`);
  }

  function rewriteTask(plan, profile, language, variant) {
    const task = String(plan.taskGoal || plan.goal || "").trim();
    const seed = `${task}\u241f${variant}`;
    if (plan.primaryIntent === "image_generation_prompt") return rewriteImageTask(plan, language);
    if (["simple_question", "explanation", "definition"].includes(plan.primaryIntent) && extractQuestionSubject(task, language)) {
      return rewriteQuestion(plan, profile, language, seed);
    }

    if (language === "ru") {
      if (["programming_generation", "debugging", "code_review", "refactoring", "configuration", "automation_workflow"].includes(plan.primaryIntent)) {
        const profileVerbs = {
          backup_script: ["Создай", "Подготовь", "Реализуй"],
          browser_extension: ["Реализуй", "Подготовь", "Создай"],
          collection_algorithm: ["Реализуй", "Разработай", "Создай"],
          data_parser: ["Реализуй", "Создай", "Разработай"],
          file_utility: ["Реализуй", "Подготовь", "Создай"],
          generic_code: ["Реализуй", "Создай", "Разработай"],
          service_api: ["Реализуй", "Спроектируй и реализуй", "Создай"],
        };
        return ensureTerminal(replaceLeadingVerb(
          task,
          /^(?:напиши|создай|сделай|реализуй|подготовь)\s+/iu,
          profileVerbs[profile] || profileVerbs.generic_code,
          seed,
          "code_verb",
        ));
      }
      if (plan.primaryIntent === "email_or_message") {
        return ensureTerminal(replaceLeadingVerb(task, /^(?:напиши|создай|сделай|подготовь)\s+/iu, ["Составь", "Подготовь", "Сформулируй"], seed, "message_verb"));
      }
      if (plan.primaryIntent === "comparison") {
        return ensureTerminal(replaceLeadingVerb(task, /^(?:сравни|сопоставь)\s+/iu, ["Сопоставь", "Сравни", "Разбери различия между"], seed, "compare_verb"));
      }
      if (plan.primaryIntent === "creative_writing") {
        const verbs = profile === "poetry_writing"
          ? ["Сочини", "Создай", "Напиши"]
          : profile === "content_writing"
            ? ["Подготовь", "Создай", "Сформулируй"]
            : ["Создай", "Сочини", "Напиши"];
        return ensureTerminal(replaceLeadingVerb(task, /^(?:напиши|создай|сочини|подготовь)\s+/iu, verbs, seed, "creative_verb"));
      }
      const mappings = [
        [/^объясни\s+/iu, ["Разъясни", "Раскрой", "Объясни"]],
        [/^проанализируй\s+/iu, ["Проанализируй", "Разбери", "Исследуй"]],
        [/^проверь\s+/iu, ["Проверь", "Перепроверь"]],
        [/^подбери\s+/iu, ["Подбери", "Предложи", "Найди"]],
        [/^составь\s+/iu, ["Составь", "Подготовь", "Разработай"]],
        [/^(?:сделай|создай|напиши)\s+/iu, ["Создай", "Подготовь", "Составь"]],
      ];
      for (const [pattern, replacements] of mappings) {
        if (pattern.test(task)) return ensureTerminal(replaceLeadingVerb(task, pattern, replacements, seed, "general_verb"));
      }
      return ensureTerminal(task);
    }

    if (["programming_generation", "debugging", "code_review", "refactoring", "configuration", "automation_workflow"].includes(plan.primaryIntent)) {
      return ensureTerminal(replaceLeadingVerb(task, /^(?:write|create|build|implement|make)\s+/iu, ["Implement", "Build", "Create"], seed, "code_verb"));
    }
    if (plan.primaryIntent === "email_or_message") {
      return ensureTerminal(replaceLeadingVerb(task, /^(?:write|create|draft)\s+/iu, ["Draft", "Write", "Prepare"], seed, "message_verb"));
    }
    if (plan.primaryIntent === "comparison") {
      return ensureTerminal(replaceLeadingVerb(task, /^(?:compare|contrast)\s+/iu, ["Compare", "Contrast", "Work out the differences between"], seed, "compare_verb"));
    }
    if (plan.primaryIntent === "creative_writing") {
      const verbs = profile === "poetry_writing" ? ["Compose", "Create", "Write"] : ["Create", "Draft", "Write"];
      return ensureTerminal(replaceLeadingVerb(task, /^(?:write|create|compose|draft)\s+/iu, verbs, seed, "creative_verb"));
    }
    const mappings = [
      [/^explain\s+/iu, ["Explain", "Clarify", "Break down"]],
      [/^analyze\s+/iu, ["Analyze", "Examine", "Review"]],
      [/^check\s+/iu, ["Check", "Review", "Verify"]],
      [/^prepare\s+/iu, ["Prepare", "Draft", "Create"]],
      [/^(?:write|create|make)\s+/iu, ["Create", "Prepare", "Draft"]],
    ];
    for (const [pattern, replacements] of mappings) {
      if (pattern.test(task)) return ensureTerminal(replaceLeadingVerb(task, pattern, replacements, seed, "general_verb"));
    }
    return ensureTerminal(task);
  }

  function dynamicFocusVariants(plan, profile, language) {
    const text = String(plan.taskGoal || plan.goal || "").toLocaleLowerCase();
    const format = String(plan.entities?.fileFormats?.[0] || "").toLocaleUpperCase();
    const protectedValues = Object.values(plan.entities?.protectedByType || {}).flat().join("\n").toLocaleLowerCase();

    if (profile === "image_generation") {
      if (!core.components.ambiguity.extractVisualSubject(plan.taskGoal || plan.goal, language)) return [];
      const wantsText = /(?:с\s+(?:текстом|надписью|логотипом)|текст\s+на|надпись|логотип|with\s+(?:text|a\s+logo)|text\s+on|caption|logo)/iu.test(text);
      const photo = /(?:фото|фотографи|фотореалист|photoreal|photograph|cinematic\s+photo)/iu.test(text);
      const anime = /(?:аниме|манга|anime|manga)/iu.test(text);
      const threeDimensional = /(?:\b3d\b|3-d|three-dimensional|тр[её]хмерн|рендер)/iu.test(text);
      const textRestriction = wantsText ? "" : language === "ru" ? ", текст и водяные знаки" : ", text and watermarks";

      if (language === "ru") {
        if (photo) return [
          `Качество профессиональной фотореалистичной фотографии: естественный свет, чёткий фокус на главном объекте, реалистичные фактуры и высокая детализация, разрешение 4K. Негативный промт: размытие, шум, низкая детализация, искажённая анатомия, лишние конечности${textRestriction}.`,
          `Фотореалистичная сцена с проработанными материалами, аккуратной глубиной резкости и кинематографичным светом, 4K. Негативный промт: не в фокусе, артефакты, неестественные пропорции, дублирующиеся детали${textRestriction}.`,
        ];
        if (anime) return [
          `Сохрани чистую аниме-стилистику: выразительная композиция, согласованная палитра, аккуратные контуры и детализированный фон, разрешение 4K. Негативный промт: размытые линии, низкая детализация, искажённая анатомия, лишние пальцы или конечности${textRestriction}.`,
          `Аниме-иллюстрация с ясным силуэтом главного объекта, читаемым светом и проработанными деталями, 4K. Негативный промт: грязные контуры, артефакты, нарушенная перспектива, дублированные части тела${textRestriction}.`,
        ];
        if (threeDimensional) return [
          `Детализированный 3D-рендер с физически правдоподобными материалами, выразительным светом и чистой композицией, разрешение 4K. Негативный промт: шумный рендер, низкополигональные артефакты, размытые текстуры, искажённая геометрия${textRestriction}.`,
          `Высококачественный 3D-кадр: чёткие материалы, корректные тени, объёмный свет и проработанные поверхности, 4K. Негативный промт: пикселизация, артефакты рендера, неестественные пропорции, лишние детали${textRestriction}.`,
        ];
        return [
          `Выразительная композиция с главным объектом в центре внимания, чистый свет, проработанные фактуры и высокая детализация, разрешение 4K. Негативный промт: размытие, низкая детализация, искажённая анатомия, лишние конечности${textRestriction}.`,
          `Высокодетализированная художественная сцена: чёткий силуэт, гармоничная палитра, глубина и аккуратный свет, 4K. Негативный промт: артефакты, размытые контуры, нарушенная перспектива, дублированные детали${textRestriction}.`,
        ];
      }

      if (photo) return [
        `Professional photorealistic quality: natural lighting, sharp focus on the main subject, realistic textures, high detail, and 4K resolution. Negative prompt: blur, noise, low detail, distorted anatomy, extra limbs${textRestriction}.`,
        `A photorealistic scene with refined materials, controlled depth of field, cinematic lighting, and 4K resolution. Negative prompt: out of focus, artifacts, unnatural proportions, duplicated details${textRestriction}.`,
      ];
      if (anime) return [
        `Preserve a clean anime style with expressive composition, a cohesive palette, crisp linework, a detailed background, and 4K resolution. Negative prompt: blurry lines, low detail, distorted anatomy, extra fingers or limbs${textRestriction}.`,
        `Anime illustration with a clear silhouette for the main subject, readable lighting, refined details, and 4K resolution. Negative prompt: muddy linework, artifacts, broken perspective, duplicated body parts${textRestriction}.`,
      ];
      if (threeDimensional) return [
        `Detailed 3D render with physically plausible materials, expressive lighting, a clean composition, and 4K resolution. Negative prompt: noisy rendering, low-poly artifacts, blurry textures, distorted geometry${textRestriction}.`,
        `High-quality 3D shot with crisp materials, correct shadows, volumetric light, refined surfaces, and 4K resolution. Negative prompt: pixelation, rendering artifacts, unnatural proportions, extra details${textRestriction}.`,
      ];
      return [
        `Expressive composition with the main subject clearly emphasized, clean lighting, refined textures, high detail, and 4K resolution. Negative prompt: blur, low detail, distorted anatomy, extra limbs${textRestriction}.`,
        `High-detail artistic scene with a clear silhouette, harmonious color palette, depth, clean lighting, and 4K resolution. Negative prompt: artifacts, blurry contours, broken perspective, duplicated details${textRestriction}.`,
      ];
    }

    if (profile === "data_parser") {
      const ruConcern = format === "JSON"
        ? "различай объект, массив и скалярные значения, сохрани вложенность и отдельно сообщай о синтаксической ошибке"
        : format === "CSV" || format === "TSV"
          ? "явно задай разделитель, наличие заголовка и кодировку; корректно обработай кавычки, пустые поля и разное число колонок"
          : format === "XML"
            ? "сохрани иерархию элементов и атрибуты, отдельно обработай повреждённую разметку и пространства имён"
            : "задай правила распознавания записи и отдельно опиши поведение для повреждённой или неполной строки";
      const enConcern = format === "JSON"
        ? "distinguish objects, arrays, and scalar values, preserve nesting, and report syntax errors separately"
        : format === "CSV" || format === "TSV"
          ? "make the delimiter, header handling, and encoding explicit; handle quoted and empty fields plus inconsistent column counts"
          : format === "XML"
            ? "preserve the element hierarchy and attributes, and handle malformed markup and namespaces explicitly"
            : "define how a record is recognized and what happens to malformed or incomplete lines";
      const dataName = format || (language === "ru" ? "исходных данных" : "source data");
      return language === "ru" ? [
        `Дай полный запускаемый пример без псевдокода и заглушек. Зафиксируй, как ${dataName} поступает на вход и что возвращается; ${ruConcern}. Покажи корректный пример и отказ на невалидном вводе.`,
        `Верни самодостаточный полный запускаемый пример, а не набор фрагментов. Определи контракт для ${dataName}: источник, результат и формат ошибки. В реализации ${ruConcern}; продемонстрируй успешный и ошибочный сценарии.`,
        `Собери рабочий полный запускаемый пример. Не оставляй способ передачи ${dataName} неявным: ${ruConcern}. Заверши двумя короткими проверками — для валидных и повреждённых данных.`,
      ] : [
        `Provide a complete runnable example without pseudocode or placeholders. Fix how ${dataName} enters and what is returned; ${enConcern}. Show one valid input and one clear failure.`,
        `Return a self-contained complete runnable example rather than disconnected snippets. Define the contract for ${dataName}: source, result, and error shape. In the implementation, ${enConcern}; demonstrate success and failure.`,
        `Build a working complete runnable example. Do not leave the way ${dataName} is supplied implicit: ${enConcern}. Finish with concise checks for valid and malformed data.`,
      ];
    }

    if (profile === "backup_script") {
      const scheduled = /расписани|cron|таймер|scheduled|schedule/iu.test(text);
      const ruExtra = scheduled
        ? "Предотврати пересечение двух запусков и сделай код завершения пригодным для планировщика"
        : "Сделай повторный запуск безопасным и явно определи поведение при уже существующей копии";
      const enExtra = scheduled
        ? "prevent overlapping runs and return an exit status suitable for a scheduler"
        : "make repeated execution safe and define what happens when a backup already exists";
      return language === "ru" ? [
        `Дай полный запускаемый пример без псевдокода и заглушек. Оформи источник и каталог назначения как параметры, не подставляя выдуманные пути. ${ruExtra}; покажи, как обнаруживается ошибка записи и как проверяется пригодность копии.`,
        `Верни самодостаточный рабочий скрипт. Сначала проверь источник и доступность назначения, затем выполняй копирование без молчаливой потери данных. ${ruExtra}; добавь пример запуска и проверку результата.`,
        `Собери готовый к запуску сценарий резервного копирования с явными параметрами и понятными сообщениями об отказе. ${ruExtra}; отдельно покажи способ убедиться, что созданную копию можно прочитать.`,
      ] : [
        `Provide a complete runnable example without pseudocode or placeholders. Parameterize the source and destination instead of inventing paths. ${enExtra}; show how write failure is surfaced and how backup usability is verified.`,
        `Return a self-contained working script. Check the source and destination before copying and avoid silent data loss. ${enExtra}; include one invocation and a result check.`,
        `Build a ready-to-run backup workflow with explicit parameters and clear failure messages. ${enExtra}; separately show how to confirm that the produced backup can be read.`,
      ];
    }

    if (profile === "collection_algorithm") {
      const objectItems = /объект|пол[юея]|ключ|property|object|field|key/iu.test(text);
      const strings = /строк|текст|алфав|locale|string|alphabet/iu.test(text);
      const ruComparator = objectItems
        ? "задай ключ или callback для сравнения объектов и поведение при отсутствующем поле"
        : strings
          ? "укажи правила регистра и локали вместо неявного сравнения строк"
          : "явно задай направление и поведение компаратора для равных значений";
      const enComparator = objectItems
        ? "accept a key or callback for object comparison and define behavior for a missing field"
        : strings
          ? "state case and locale handling instead of relying on implicit string comparison"
          : "make sort direction and comparator behavior for equal values explicit";
      return language === "ru" ? [
        `Дай полный запускаемый пример без псевдокода и заглушек. В контракте функции ${ruComparator}; укажи, изменяется ли исходный массив. Проверь пустой ввод, дубликаты и обычный несортированный набор.`,
        `Верни самодостаточный рабочий код. ${ruComparator}; отдельно обозначь мутацию входной коллекции и покажи результаты для пустого массива, повторяющихся и разных значений.`,
        `Реализуй решение так, чтобы порядок не оставался догадкой: ${ruComparator}. Покажи полный запуск и сравни исходный массив с результатом на обычном и граничном примерах.`,
      ] : [
        `Provide a complete runnable example without pseudocode or placeholders. In the function contract, ${enComparator}; state whether the input array is mutated. Test empty input, duplicates, and an ordinary unsorted set.`,
        `Return self-contained working code. ${enComparator}; call out mutation of the source collection and show empty, repeated, and distinct values.`,
        `Implement the solution so ordering is never implicit: ${enComparator}. Show a complete run and compare the original array with the result in normal and edge cases.`,
      ];
    }

    if (profile === "callable_behavior") {
      const operation = /(?:^|[^a-z])map(?:[^a-z]|$)/iu.test(text) ? "map"
        : /(?:^|[^a-z])filter(?:[^a-z]|$)/iu.test(text) ? "filter"
          : /(?:^|[^a-z])reduce(?:[^a-z]|$)/iu.test(text) ? "reduce"
            : "";
      if (operation) {
        const ruDetail = operation === "map"
          ? "объясни роль callback, связь каждого исходного элемента с новым и то, создаётся ли новая коллекция"
          : operation === "filter"
            ? "объясни роль предиката, условие попадания элемента в результат и то, создаётся ли новая коллекция"
            : "объясни аккумулятор, начальное значение и порядок свёртки элементов";
        const enDetail = operation === "map"
          ? "explain the callback, how each source element maps to a new value, and whether a new collection is created"
          : operation === "filter"
            ? "explain the predicate, how an item qualifies for the result, and whether a new collection is created"
            : "explain the accumulator, initial value, and order in which items are folded";
        return language === "ru" ? [
          `Сначала сформулируй результат одним предложением; затем ${ruDetail}. Покажи минимальный пример с входом, выходом и исходной коллекцией после вызова.`,
          `Начни с назначения операции, после чего ${ruDetail}. На коротком примере подпиши аргументы callback и итоговое значение.`,
          `Свяжи объяснение с данными: ${ruDetail}. Не ограничивайся определением — покажи один вызов и его точный результат.`,
        ] : [
          `State the result in one sentence, then ${enDetail}. Show a minimal example with the input, output, and source collection after the call.`,
          `Begin with the operation's purpose, then ${enDetail}. Label the callback arguments and final value in a small example.`,
          `Tie the explanation to actual data: ${enDetail}. Go beyond a definition by showing one call and its exact result.`,
        ];
      }
    }

    if (profile === "code_behavior") {
      const hasRequestCall = protectedValues.includes(["fet", "ch"].join("")) ||
        protectedValues.includes(["xml", "http", "request"].join("")) ||
        /axios|https?:\/\//iu.test(protectedValues);
      const codeKind = /queryselector|addeventlistener|document\.|window\./iu.test(protectedValues) ? "dom"
        : hasRequestCall ? "request"
          : /\bselect\b|\binsert\b|\bupdate\b|\bdelete\b.+\bfrom\b/iu.test(protectedValues) ? "sql"
            : "";
      if (codeKind) {
        const ruDetail = codeKind === "dom"
          ? "проследи поиск элементов, регистрацию событий и изменения DOM"
          : codeKind === "request"
            ? "проследи формирование запроса, асинхронный ответ и ветку ошибки"
            : "объясни, какие строки читает или изменяет запрос и от чего зависит результат";
        const enDetail = codeKind === "dom"
          ? "trace element lookup, event registration, and DOM changes"
          : codeKind === "request"
            ? "trace request construction, the asynchronous response, and the error branch"
            : "explain which rows the query reads or changes and what controls the result";
        return language === "ru" ? [
          `Сначала назови наблюдаемый результат, затем ${ruDetail}. Отдельно отметь входные данные, побочные эффекты и возможный отказ.`,
          `Раздели ответ на итог и ход выполнения: ${ruDetail}. Не пропускай изменения состояния и обработку ошибки.`,
        ] : [
          `State the observable result first, then ${enDetail}. Call out inputs, side effects, and possible failure separately.`,
          `Separate the outcome from the execution path: ${enDetail}. Do not omit state changes or error handling.`,
        ];
      }
    }

    if (profile === "email_message") {
      const cancellation = /отмен|не состо|cancel|called off/iu.test(text);
      const reschedule = /перенос|изменени\w*\s+встреч|друг(?:ая|ое)\s+(?:дата|время)|reschedul|change.+meeting/iu.test(text);
      if (cancellation) {
        return language === "ru" ? [
          "Верни готовый к отправке текст: тактично сообщи об отмене, признай возможное неудобство и обозначь следующий шаг. Не придумывай причину, дату или новую договорённость, которых нет в запросе.",
          "Сразу и уважительно сообщи, что встреча отменяется, без лишних оправданий. Сохрани готовый к отправке формат и предложи дальнейшее действие только условно, если оно не задано.",
          "Составь краткое самостоятельное письмо: решение об отмене, вежливое признание неудобства и понятный способ продолжить коммуникацию. Не заполняй отсутствующие детали догадками.",
        ] : [
          "Return send-ready copy that communicates the cancellation tactfully, acknowledges the inconvenience, and makes the next step clear. Do not invent a reason, date, or replacement arrangement.",
          "State promptly and respectfully that the meeting is canceled, without unnecessary justification. Keep the message send-ready and make any unprovided next action conditional.",
          "Draft a concise self-contained email covering the cancellation, a courteous acknowledgment, and a clear way to continue the conversation without fabricated details.",
        ];
      }
      if (reschedule) {
        return language === "ru" ? [
          "Верни готовый к отправке текст: ясно обозначь изменение встречи, сохрани уважительный тон и попроси подтвердить следующий шаг. Не придумывай новую дату или причину, если их нет в запросе.",
          "Сразу сообщи, что договорённость о встрече меняется, затем кратко обозначь действие для получателя. Не подставляй отсутствующее время и оставь его для согласования.",
          "Сделай письмо самодостаточным и тактичным: что изменилось, какое подтверждение нужно и как продолжить согласование. Сохрани только факты из запроса.",
        ] : [
          "Return send-ready copy that states the meeting change clearly, keeps a respectful tone, and asks for the appropriate confirmation. Do not invent a new date or reason.",
          "State immediately that the meeting arrangement is changing, then give the recipient a clear action. Leave any unspecified time open for agreement.",
          "Make the email self-contained and tactful: what changed, what confirmation is needed, and how scheduling should continue, using only supplied facts.",
        ];
      }
    }

    return null;
  }

  function focusInstructions(plan, profile, language, variant) {
    const seed = `${plan.taskGoal || plan.goal}\u241f${variant}`;
    const format = plan.entities?.fileFormats?.[0] || (language === "ru" ? "данных" : "data");

    const ru = {
      backup_script: [
        "Дай полный запускаемый пример без псевдокода и заглушек. Сделай источник и каталог назначения явными параметрами; безопасно обработай отсутствующий источник, ошибку записи и повторный запуск, не допуская молчаливой потери данных. Покажи пример запуска и способ проверить пригодность копии.",
        "Верни самодостаточный рабочий скрипт, а не набор фрагментов. Не подставляй выдуманные пути: оформи источник и место хранения как параметры, предусмотрев сбой копирования и повторный запуск. Покажи, как убедиться, что резервная копия читается.",
      ],
      browser_extension: [
        "Дай полный запускаемый пример по файлам, без псевдокода и заглушек. Укажи, как части расширения связаны, учти Manifest V3, минимальные разрешения и жизненный цикл content script. Добавь проверку в Chrome после перезагрузки расширения.",
        "Верни самодостаточное рабочее решение по файлам. Сохрани совместимость с Manifest V3, не расширяй разрешения без необходимости и добавь короткий сценарий ручной проверки в браузере.",
      ],
      callable_behavior: [
        "Сначала сформулируй результат одним предложением; затем укажи входные данные, возвращаемое значение, влияние на исходную коллекцию и покажи минимальный пример.",
        "Начни с сути, после чего проследи вход и выход, отметь возможное изменение исходных данных и закрепи объяснение коротким примером.",
      ],
      code_behavior: [
        "Сначала назови наблюдаемый результат, затем проследи ключевые шаги выполнения, входы, выходы и побочные эффекты. Если самого фрагмента нет в контексте, прямо укажи, что для разбора нужен код.",
        "Раздели объяснение на итог работы и ход выполнения; отдельно отметь изменения состояния и возможные побочные эффекты. Не угадывай отсутствующий фрагмент кода.",
      ],
      collection_algorithm: [
        "Дай полный запускаемый пример без псевдокода и заглушек. Явно задай порядок сортировки и поведение компаратора, укажи, изменяется ли исходный массив, и продемонстрируй пустой массив, дубликаты и обычный набор значений.",
        "Верни самодостаточный рабочий код. Определи контракт функции: направление сортировки, сравнение элементов и мутацию входного массива; покажи результат на пустом вводе, повторяющихся и несортированных значениях.",
      ],
      comparison: [
        "Сначала покажи практические различия по сопоставимым критериям, затем существенные компромиссы каждого варианта и вывод по сценариям использования. Не придумывай предпочтения пользователя.",
        "Сведи практические различия в компактное сопоставление, отдели преимущества от ограничений и заверши условной рекомендацией для разных сценариев.",
      ],
      content_writing: [
        "Сразу задай основную мысль и выстрой материал вокруг неё: сильное начало, логичные переходы и конкретный вывод. Сохрани заданные тему, аудиторию и тон; не добавляй служебное объяснение после готового текста.",
        "Сделай текст цельным: обозначь тезис в начале, развивай по одному смыслу за абзац и закончи выводом, который следует из содержания. Не выдумывай факты и сохраняй явно заданный стиль.",
      ],
      data_parser: [
        `Дай полный запускаемый пример без псевдокода и заглушек. Зафиксируй контракт парсера: способ передачи ${format}, возвращаемый результат и реакцию на невалидные данные. Покажи запуск на корректном вводе и понятную ошибку на повреждённом.`,
        `Верни самодостаточный полный запускаемый пример, а не набор фрагментов. Явно определи вход и выход для ${format}, отдельно обработай синтаксически неверные данные и продемонстрируй корректный и ошибочный сценарии.`,
      ],
      email_message: [
        "Верни готовый к отправке текст: сразу сообщи цель письма, сохрани уважительный тон и обозначь следующий шаг. Не придумывай имена, даты, причины или договорённости, которых нет в запросе.",
        "Сделай сообщение самодостаточным и тактичным: кратко обозначь изменение, извинись за неудобство и предложи понятный следующий шаг без выдуманных деталей.",
      ],
      error_meaning: [
        "Сначала расшифруй сообщение простыми словами, затем назови наиболее вероятные причины, признаки для их различения и безопасную первую проверку.",
        "Начни с точного смысла ошибки, после чего свяжи возможные причины с наблюдаемыми симптомами и предложи одну обратимую диагностическую проверку.",
      ],
      file_utility: [
        "Дай полный запускаемый пример без псевдокода и заглушек. Сделай пути и режим перезаписи явными параметрами, сохрани кодировку и не удаляй исходные данные при ошибке. Покажи успешный запуск и ожидаемое сообщение при недоступном файле.",
        "Верни самодостаточный рабочий код. Определи поведение для отсутствующего файла, существующего результата и ошибок доступа; не зашивай пути в код. Добавь пример запуска и проверку сохранности данных.",
      ],
      general_code: [
        "Дай полный запускаемый пример без псевдокода и заглушек. Явно обозначь вход, результат и обработку ожидаемых ошибок; заверши коротким примером использования.",
        "Верни самодостаточный рабочий код, а не набор фрагментов. Зафиксируй интерфейс, предусмотренные отказы и покажи один нормальный и один граничный сценарий.",
      ],
      general_explanation: [
        "Сначала дай прямой ответ одним предложением, затем кратко раскрой механизм и приведи один пример, который действительно проясняет назначение.",
        "Начни с сути без вводной части; после этого объясни принцип работы и покажи практическое следствие на коротком примере.",
      ],
      narrative_writing: [
        "Построй цельную сцену вокруг цели персонажа и препятствия: начало должно запускать действие, детали — двигать конфликт, а финал — завершать заданную дугу. Сохрани указанные жанр, голос и события без пояснений вне рассказа.",
        "Дай герою ясное стремление, развивай напряжение через конкретные действия и заверши историю следствием принятого решения. Не меняй заданных персонажей, точки зрения и ключевых событий.",
      ],
      poetry_writing: [
        "Собери стихотворение вокруг одного центрального образа, сохрани заданные настроение и форму, избегай случайных рифм и пояснений после текста.",
        "Выдержи единый голос и ритмический принцип; каждый образ должен развивать основную тему, а финальная строка — давать смысловое завершение без авторского комментария.",
      ],
      service_api: [
        "Дай полный запускаемый пример без псевдокода и заглушек. Явно определи контракт: метод и маршрут, входные поля, успешный ответ и формат ошибок. Добавь валидацию, один корректный запрос и один отказ без привязки к неуказанной инфраструктуре.",
        "Верни самодостаточный рабочий сервис. Зафиксируй интерфейс, коды ответа и обработку некорректного ввода; покажи полный запуск и примеры успешного и ошибочного запросов.",
      ],
      software_role: [
        "Сначала дай прямой ответ одним предложением; затем кратко раскрой место инструмента в системе, типичный сценарий применения и одно существенное ограничение.",
        "Начни с решаемой задачи, после чего объясни базовый принцип работы, практический сценарий и границу, за которой нужен другой инструмент.",
      ],
    };

    const en = {
      backup_script: [
        "Provide a complete runnable example without pseudocode or placeholders. Make the source and destination explicit parameters, handle a missing source, write failure, and repeated runs safely, then show how to verify that the backup is usable.",
        "Return a self-contained working script rather than disconnected snippets. Do not invent filesystem paths: parameterize the source and storage location, cover copy failure and repeated execution, and demonstrate backup verification.",
      ],
      browser_extension: [
        "Provide a complete runnable example organized by file, without pseudocode or placeholders. Explain how the extension parts interact, keep Manifest V3 compatibility and minimal permissions, and give a short Chrome verification flow.",
        "Return a self-contained working extension organized by file. Preserve Manifest V3 behavior, avoid unnecessary permissions, and include a concise manual browser check.",
      ],
      callable_behavior: [
        "State the result first, then cover the input, return value, mutation of the original collection, and a minimal example.",
        "Begin with the core behavior, trace input to output, note whether the source data changes, and finish with a small example.",
      ],
      code_behavior: [
        "State the observable result first, then trace the key execution steps, inputs, outputs, and side effects. If the code is absent from context, say that the fragment is required for analysis.",
        "Separate the result from the execution path and call out state changes and side effects. Do not guess code that was not provided.",
      ],
      collection_algorithm: [
        "Provide a complete runnable example without pseudocode or placeholders. Define the sort direction and comparator behavior, say whether the input array is mutated, and demonstrate empty input, duplicates, and an ordinary unsorted case.",
        "Return self-contained working code. Make the function contract explicit—ordering, element comparison, and input mutation—and show empty, repeated, and unsorted values.",
      ],
      comparison: [
        "Start with practical differences across comparable criteria, then cover the important trade-offs and conclude by usage scenario without inventing user preferences.",
        "Present the practical differences compactly, separate strengths from limitations, and finish with a conditional recommendation for distinct scenarios.",
      ],
      content_writing: [
        "Establish the central point immediately and organize the piece around it with a strong opening, logical transitions, and a concrete conclusion. Preserve the requested topic, audience, and tone without commentary after the finished copy.",
        "Make the piece coherent: state the thesis early, develop one idea per paragraph, and end with a conclusion supported by the content. Do not invent facts, and retain the specified style.",
      ],
      data_parser: [
        `Provide a complete runnable example without pseudocode or placeholders. Define the parser contract: how ${format} enters, what is returned, and how invalid data is reported. Demonstrate both a valid input and a clear failure.`,
        `Return a self-contained complete runnable example rather than disconnected snippets. Make the input and output for ${format} explicit, handle malformed data separately, and show one successful and one failing example.`,
      ],
      email_message: [
        "Return send-ready copy that states the purpose promptly, uses a respectful tone, and makes the next step clear. Do not invent dates, reasons, or prior agreements.",
        "Make the message tactful and self-contained: state the change, acknowledge the inconvenience, and offer a clear next step without fabricated details.",
      ],
      error_meaning: [
        "Translate the message into plain language first, then list the most likely causes, the evidence that separates them, and one safe initial check.",
        "Begin with the precise meaning of the error, connect possible causes to the observed symptoms, and suggest one reversible diagnostic check.",
      ],
      file_utility: [
        "Provide a complete runnable example without pseudocode or placeholders. Parameterize paths and overwrite behavior, preserve encoding, and avoid deleting source data on failure. Show a successful run and the expected response to an inaccessible file.",
        "Return self-contained working code. Define behavior for a missing source, an existing output, and access errors; avoid hard-coded paths and include a data-preservation check.",
      ],
      general_code: [
        "Provide a complete runnable example without pseudocode or placeholders. Make the input, result, and expected error handling explicit, then show a short usage example.",
        "Return self-contained working code rather than disconnected snippets. Define the interface, handle expected failures, and demonstrate one normal and one edge case.",
      ],
      general_explanation: [
        "Give the direct answer in one sentence, then explain the mechanism briefly and use one example that clarifies the purpose.",
        "Lead with the point, follow with the operating principle, and show one concise practical consequence.",
      ],
      narrative_writing: [
        "Build a complete scene around a character goal and an obstacle: the opening should start the action, details should advance the conflict, and the ending should complete the requested arc. Preserve the supplied genre, voice, and events.",
        "Give the protagonist a clear aim, build tension through concrete action, and end with a consequence of the decisive choice. Keep the specified characters, viewpoint, and key events unchanged.",
      ],
      poetry_writing: [
        "Build the poem around one central image, preserve the requested mood and form, and avoid filler rhymes or commentary after the poem.",
        "Maintain a consistent voice and rhythmic principle; let each image develop the core theme and use the final line for meaningful closure without an author note.",
      ],
      service_api: [
        "Provide a complete runnable example without pseudocode or placeholders. Define the contract explicitly: method and route, input fields, success response, and error format. Include validation plus one valid and one failing request.",
        "Return a self-contained working service. Fix the interface, response codes, and invalid-input behavior, then show a complete run and both successful and error requests.",
      ],
      software_role: [
        "Give the direct answer in one sentence, then cover the tool's place in a system, a typical use case, and one meaningful limitation.",
        "Start with the problem it solves, then explain the basic mechanism, a practical scenario, and the boundary where another tool is needed.",
      ],
    };

    const variants = dynamicFocusVariants(plan, profile, language) || (language === "ru" ? ru[profile] : en[profile]);
    return variants ? [choose(variants, seed, `focus_${profile}`)] : [];
  }

  function moduleInstruction(module, language, profile, plan, variant) {
    if (["content_writing", "email_message", "narrative_writing", "poetry_writing"].includes(profile) &&
        !(module.intents || []).includes(plan.primaryIntent)) return "";
    if (SUPPRESSED_BY_PROFILE[profile]?.has(module.id)) return "";
    const text = module.text?.[language] || module.text?.en || "";
    if (!text) return "";

    const seed = `${plan.taskGoal || plan.goal}\u241f${variant}\u241f${module.id}`;
    const variants = language === "ru" ? {
      acceptance_criteria: ["Заверши проверяемыми критериями готовности, не придумывая сроки.", "Обозначь наблюдаемые признаки того, что задача выполнена."],
      avoid_invented_data: ["Не заполняй отсутствующие факты догадками; явно оставь их неизвестными.", "Отдели заданные данные от того, что потребовало бы уточнения."],
      direct_answer_first: ["Начни с прямого ответа и добавляй только объяснение, необходимое для вывода.", "Сначала сформулируй вывод, затем коротко обоснуй его."],
      response_format: ["Соблюдай запрошенный формат без служебных секций и лишних комментариев.", "Верни результат ровно в указанной форме."],
    } : {
      acceptance_criteria: ["Finish with verifiable completion criteria without inventing dates.", "State observable signs that the task is complete."],
      avoid_invented_data: ["Do not fill missing facts with guesses; leave them explicitly unknown.", "Separate supplied information from details that require clarification."],
      direct_answer_first: ["Lead with the direct answer and add only the explanation needed to support it.", "State the conclusion first, then justify it briefly."],
      response_format: ["Follow the requested format without extra service sections or commentary.", "Return the result in exactly the requested form."],
    };
    return variants[module.id] ? choose(variants[module.id], seed, "module_variant") : text;
  }

  function contextualBlock(plan, language) {
    if (!plan.contextText) return "";
    const heading = language === "ru" ? "Явный контекст пользователя" : "Explicit user context";
    return `${heading}:\n${String(plan.contextText).trim()}`;
  }

  function clarificationBlock(plan, questions, language) {
    if (!questions?.length) return "";
    const missing = new Set(plan.missingCriticalSlots || []);
    let lead;
    if (language === "ru") {
      if (missing.has("purpose") || missing.has("expected_result")) lead = "Чтобы не выдумывать назначение и ожидаемый результат, сначала уточни:";
      else if (missing.has("subject")) lead = "Чтобы ответ относился к нужному объекту, сначала уточни:";
      else lead = "Перед выполнением уточни только действительно недостающие данные:";
    } else if (missing.has("purpose") || missing.has("expected_result")) lead = "To avoid inventing the purpose or expected result, clarify first:";
    else if (missing.has("subject")) lead = "To make the answer refer to the intended subject, clarify first:";
    else lead = "Before proceeding, clarify only the genuinely missing information:";
    return `${lead}\n${questions.map((question) => `- ${question}`).join("\n")}`;
  }

  function instructionParagraphs(instructions, style) {
    if (!instructions.length) return [];
    if (style === "compact") return [instructions.slice(0, 2).join(" ")];
    if (style === "structured") return instructions;
    if (instructions.length <= 2) return [instructions.join(" ")];
    const boundary = Math.ceil(instructions.length / 2);
    return [instructions.slice(0, boundary).join(" "), instructions.slice(boundary).join(" ")];
  }

  function render(plan, modules, questions, language, options = {}) {
    const style = options.style || "integrated";
    const variant = options.variant || style;
    const profile = inferProfile(plan);
    const rewrittenTask = rewriteTask(plan, profile, language, variant);
    const focus = focusInstructions(plan, profile, language, variant);
    const realizedModules = modules
      .map((module) => moduleInstruction(module, language, profile, plan, variant))
      .filter(Boolean);
    const instructions = uniqueInstructions([...focus, ...realizedModules]);
    const questionsText = clarificationBlock(plan, questions, language);
    const contextText = contextualBlock(plan, language);
    let sections;

    if (style === "structured" && instructions.length >= 2) {
      const taskHeading = language === "ru" ? "Задача" : "Task";
      const resultHeading = language === "ru" ? "Критерии результата" : "Result criteria";
      sections = [
        `${taskHeading}:\n${rewrittenTask}`,
        `${resultHeading}:\n${instructions.map((instruction) => `- ${instruction}`).join("\n")}`,
      ];
    } else {
      const paragraphs = instructionParagraphs(instructions, style);
      if (style === "integrated" && !questionsText && paragraphs.length && !rewrittenTask.includes("\n")) {
        sections = [`${rewrittenTask} ${paragraphs.shift()}`, ...paragraphs];
      } else {
        sections = [rewrittenTask, ...paragraphs];
      }
    }
    if (questionsText) sections.splice(1, 0, questionsText);
    if (contextText) sections.push(contextText);

    const specificity = profile === "general" ? 2 : (profile === "general_explanation" || profile === "generic_code" ? 4 : 7);
    const integrationScore = style === "integrated" ? 10 : style === "focused" ? 9 : style === "compact" ? 8 : 7;
    return {
      integrationScore,
      profile,
      realizedInstructionCount: instructions.length,
      specificity,
      text: sections.filter(Boolean).join("\n\n"),
    };
  }

  function looksSynthesized(text, language) {
    const value = String(text || "");
    const patterns = language === "ru" ? [
      /полный запускаемый пример|самодостаточн\w+ рабоч\w+ код/iu,
      /без псевдокода и заглушек|не набор фрагментов/iu,
      /сначала (?:дай|назови|сформулируй|покажи|расшифруй)|начни с (?:сути|решаемой задачи|точного смысла)/iu,
      /затем (?:кратко |укажи|проследи|назови|раскрой)|после чего (?:объясни|проследи)/iu,
      /практические различия/iu,
      /(?:компромисс|преимуществ).+(?:сценари|рекомендац)/isu,
      /явно (?:задай|определи).+(?:компаратор|контракт|вход|выход)/isu,
      /контракт[а-яё]* (?:парсера|для)|поступает на вход|способ передачи/iu,
      /невалидн|поврежд[её]нн[а-яё]* данн|синтаксическ[а-яё]+ ошиб/iu,
      /источник.+(?:каталог назначения|место хранения)|проверь источник.+назначени/isu,
      /повторн[а-яё]+ запуск|пригодност[а-яё]+ копи|копи[а-яё]+ можно прочитать/iu,
      /пересечени[а-яё]+ (?:двух )?запуск|пригодн[а-яё]+ для планировщика|код завершения.+планировщик/isu,
      /исходн[а-яё]+ массив|мутаци[а-яё]+ входн|пуст[а-яё]+ (?:массив|ввод).+дубликат/isu,
      /(?:высок[а-яё]+ детализаци|фотореалистичн[а-яё]*|аниме-стилистик|3d-рендер)/iu,
      /разрешени[а-яё]* 4k|\b4k\b/iu,
      /негативн[а-яё]* промт|избегай:.*(?:размыт|артефакт)/isu,
      /не (?:подставляй|зашивай|придумывай).+(?:пут|детал|факт)/isu,
      /если самого фрагмента нет|не угадывай отсутствующий фрагмент/iu,
      /раздели (?:объяснение|ответ) на итог(?: работы)? и ход выполнения|ключевые шаги выполнения.+побочные эффекты/isu,
      /изменени[а-яё]+ состояния|обработк[а-яё]+ ошиб/iu,
      /готов[а-яё]+ к отправке текст.+не придумывай|самодостаточн[а-яё]+ и тактичн/isu,
      /сразу сообщи цель письма.+следующий шаг|изменение.+следующий шаг/isu,
      /сообщи (?:об отмене|что встреча отменяется)|встреча отменяется|решение об отмене/iu,
      /неудобств|продолжить коммуникацию|дальнейшее действие/iu,
      /изменени[а-яё]+ встреч|договор[её]нност[а-яё]+ о встрече меняется|что изменилось/iu,
      /подтвердить следующий шаг|оставь.+для согласования|продолжить согласование/isu,
      /цель персонажа|герою ясное стремление/iu,
      /финал[а-яё]*|заверши[а-яё]* истор|следстви[а-яё]+ принятого решения/iu,
      /центрального образа|единый голос/iu,
      /финальн[а-яё]+ строк|смыслов[а-яё]+ завершени|после текста/iu,
      /основную мысль|обозначь тезис/iu,
      /логичн[а-яё]+ переход|по одному смыслу за абзац|законч[а-яё]+ выводом/iu,
      /^Задача:\s*[\s\S]+^Критерии результата:/mu,
    ] : [
      /complete runnable example|self-contained working code/iu,
      /without pseudocode or placeholders|rather than disconnected snippets/iu,
      /(?:state|give) the (?:direct answer|result) first|begin with the (?:core behavior|precise meaning)|lead with the point/iu,
      /then (?:cover|trace|explain|list)|follow with the operating principle/iu,
      /practical differences/iu,
      /(?:trade-offs|strengths).+(?:scenario|recommendation)/isu,
      /(?:make|define) the .+ explicit.+(?:comparator|contract|input|output)/isu,
      /parser contract|enters and what is returned|way .+ is supplied/iu,
      /invalid|malformed|syntax errors?/iu,
      /source.+destination|check the source.+destination/isu,
      /repeated execution|backup usability|backup can be read/iu,
      /overlapping runs|suitable for a scheduler|exit status.+scheduler/isu,
      /input array is mutated|mutation of the source|empty input.+duplicates/isu,
      /(?:high detail|photorealistic|anime style|detailed 3d render)/iu,
      /4k resolution|\b4k\b/iu,
      /negative prompt|avoid:.*(?:blur|artifact)/isu,
      /do not (?:invent|guess).+(?:path|detail|fact|code)/isu,
      /separate the result from the execution path|key execution steps.+side effects/isu,
      /state changes|error handling/iu,
      /send-ready copy.+do not invent|tactful and self-contained/isu,
      /states? the purpose promptly.+next step|state the change.+next step/isu,
      /communicates? the cancellation|meeting is canceled|covering the cancellation/iu,
      /acknowledges? the inconvenience|continue the conversation|next action conditional/iu,
      /meeting change|meeting arrangement is changing|what changed/iu,
      /appropriate confirmation|open for agreement|scheduling should continue/iu,
      /character goal|protagonist a clear aim/iu,
      /ending|end with a consequence|complete the requested arc/iu,
      /central image|consistent voice/iu,
      /final line|meaningful closure|after the poem/iu,
      /central point|state the thesis/iu,
      /logical transitions|one idea per paragraph|end with a conclusion/iu,
      /^Task:\s*[\s\S]+^Result criteria:/mu,
    ];
    let hits = 0;
    for (const pattern of patterns) if (pattern.test(value)) hits += 1;
    return hits >= 2;
  }

  core.components.synthesis = {
    choose,
    inferProfile,
    looksSynthesized,
    render,
    rewriteTask,
    stableHash,
  };
})();
