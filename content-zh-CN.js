(() => {
  "use strict";

  if (globalThis.__cgptModsZhCN__) return;

  const zh = new Map([
    ["Сохранить", "保存"],
    ["Сохранить чат", "保存聊天"],
    ["Сохраняю...", "正在保存..."],
    ["Сохранить текущий чат", "保存当前聊天"],
    ["Сохранить фрагмент", "保存片段"],
    ["Сохранить этот фрагмент", "保存此片段"],
    ["Сохранить весь текущий чат", "保存整个当前聊天"],
    ["Печать", "打印"],
    ["Откроется системное окно печати", "将打开系统打印窗口"],
    ["Создаст PDF-файл и предложит место сохранения", "生成 PDF 文件并选择保存位置"],
    ["Документ Word с кодом и встроенными изображениями", "包含代码和内嵌图片的 Word 文档"],
    ["Только текст сообщения и кода", "仅导出消息和代码文本"],
    ["Открылось системное окно печати.", "已打开系统打印窗口。"],
    ["Сохранение отменено.", "已取消保存。"],
    ["Подготавливаю PDF…", "正在生成 PDF…"],
    ["PDF-файл сохранён.", "PDF 文件已保存。"],
    ["Подготавливаю документ Word…", "正在生成 Word 文档…"],
    ["Документ Word сохранён.", "Word 文档已保存。"],
    ["Текстовый файл сохранён.", "文本文件已保存。"],
    ["Не удалось сохранить чат.", "无法保存聊天。"],
    ["PDF-документ", "PDF 文档"],
    ["Документ Word", "Word 文档"],
    ["Текстовый файл", "文本文件"],
    ["Пользователь", "用户"],
    ["Фрагмент", "片段"],
    ["Фрагмент из чата ChatGPT", "ChatGPT 聊天片段"],
    ["Чат ChatGPT", "ChatGPT 聊天"],
    ["Изображение из чата", "聊天中的图片"],
    ["Подготовка PDF…", "正在准备 PDF…"],
    ["Подготавливаю чат для печати…", "正在准备聊天内容以供打印…"],
    ["Не удалось найти сообщения текущего чата.", "无法找到当前聊天中的消息。"],
    ["Некорректные данные изображения.", "图片数据无效。"],
    ["Красный", "红色"],
    ["Оранжевый", "橙色"],
    ["Жёлтый", "黄色"],
    ["Зелёный", "绿色"],
    ["Бирюзовый", "青色"],
    ["Синий", "蓝色"],
    ["Индиго", "靛蓝色"],
    ["Фиолетовый", "紫色"],
    ["Розовый", "粉色"],
    ["Серый", "灰色"],
    ["Папки", "文件夹"],
    ["+ Новая", "+ 新建"],
    ["Создать папку", "新建文件夹"],
    ["Настроить папку", "设置文件夹"],
    ["Иконка чата", "聊天图标"],
    ["Папка, цвет и иконка", "文件夹、颜色和图标"],
    ["Папка", "文件夹"],
    ["Без папки", "不使用文件夹"],
    ["Цвет", "颜色"],
    ["Действия", "操作"],
    ["Убрать папку, цвет и иконку", "移除文件夹、颜色和图标"],
    ["Цвет папки", "文件夹颜色"],
    ["Переименовать папку", "重命名文件夹"],
    ["Удалить папку", "删除文件夹"],
    ["Название папки", "文件夹名称"],
    ["Новая папка", "新建文件夹"],
    ["Иконка", "图标"],
    ["Без цвета", "无颜色"],
    ["Без иконки", "无图标"],
    ["Прикреплённые файлы", "已附加文件"],
    ["Файлы сверх лимита", "超出上限的文件"],
    ["Сверх лимита:", "超出上限："],
    ["Улучшить запрос", "优化提示词"],
    ["Сначала напишите запрос.", "请先输入提示词。"],
    ["Похоже, тут нечего улучшать.", "当前内容似乎无需优化。"],
    ["Запрос слишком длинный для безопасной обработки.", "提示词过长，无法安全处理。"],
    ["Запрос содержит повреждённые данные.", "提示词包含异常数据。"],
    ["Поле запроса не найдено.", "未找到提示词输入框。"],
    ["Запрос уже улучшен.", "提示词已经优化过了。"],
    ["Запрос улучшен. Отменить можно через Ctrl+Z.", "提示词已优化，可按 Ctrl+Z 撤销。"],
    ["Не получилось заменить текст запроса.", "无法替换提示词文本。"],
    ["Не удалось улучшить запрос. Исходный текст сохранён.", "无法优化提示词，原始文本已保留。"],
    ["Открыть два чата рядом", "并排打开两个聊天"],
    ["Split view - два чата рядом", "分屏视图 - 并排显示两个聊天"],
    ["Чат 1", "聊天 1"],
    ["Чат 2", "聊天 2"],
    ["Закрыть split view", "关闭分屏视图"],
    ["Закрыть split", "关闭分屏"],
    ["Не удалось найти сообщения в чате.", "无法找到聊天消息。"]
  ]);

  function tr(s) {
    if (typeof s !== "string" || !s) return s;
    if (zh.has(s)) return zh.get(s);
    let m = s.match(/^Удалить папку «(.+)»\? Чаты останутся, но выйдут из этой папки\.$/u);
    if (m) return `删除文件夹“${m[1]}”？聊天不会被删除，只会移出该文件夹。`;
    m = s.match(/^Удалить (.+)$/u);
    if (m) return `删除 ${m[1]}`;
    m = s.match(/^Изображение (\d+) присутствует в исходном чате$/u);
    if (m) return `原聊天中包含图片 ${m[1]}`;
    return s;
  }

  function transferText(s) {
    if (typeof s !== "string") return s;
    return s
      .replace("Продолжай этот чат. Ниже полная история временного чата в порядке сообщений.", "请继续这个聊天。下面按消息顺序提供临时聊天的完整历史记录。")
      .replace("Сохрани роли собеседников, учитывай текст, файлы и изображения из переписки.", "请保留对话双方的角色，并结合聊天中的文本、文件和图片理解上下文。")
      .replace(/\[(\d+)\] Пользователь/g, "[$1] 用户")
      .replace(/(^|\n)Текст:/g, "$1文本：")
      .replace(/(^|\n)Файлы:/g, "$1文件：")
      .replace(/(^|\n)Изображения:/g, "$1图片：")
      .replace("Продолжай этот чат дальше и учитывай весь контекст выше.", "请基于以上全部上下文继续这个聊天。");
  }

  function owned(el) {
    for (let cur = el, n = 0; cur && n < 10; cur = cur.parentElement, n++) {
      if (cur.id?.startsWith("cgpt-")) return true;
      if ([...cur.classList || []].some(x => x.startsWith("cgpt-") || x.startsWith("chat-export__"))) return true;
      if ([...cur.attributes || []].some(x => x.name.startsWith("data-cgpt-"))) return true;
    }
    return false;
  }

  function localize(root) {
    if (!root) return;
    const nodes = [];
    if (root.nodeType === Node.ELEMENT_NODE) nodes.push(root);
    if (root.querySelectorAll) nodes.push(...root.querySelectorAll("*"));
    for (const el of nodes) {
      if (!owned(el)) continue;
      for (const a of ["title", "aria-label", "placeholder"]) {
        if (el.hasAttribute(a)) el.setAttribute(a, tr(el.getAttribute(a)));
      }
      for (const node of el.childNodes) {
        if (node.nodeType !== Node.TEXT_NODE) continue;
        const v = node.nodeValue || "";
        const lead = v.match(/^\s*/u)?.[0] || "";
        const tail = v.match(/\s*$/u)?.[0] || "";
        const core = v.slice(lead.length, v.length - tail.length);
        const next = tr(core);
        if (next !== core) node.nodeValue = lead + next + tail;
      }
    }
  }

  const observer = new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === "attributes") localize(m.target);
      for (const n of m.addedNodes || []) localize(n);
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["title", "aria-label", "placeholder"] });
  localize(document);

  const alert0 = window.alert.bind(window);
  const confirm0 = window.confirm.bind(window);
  const prompt0 = window.prompt.bind(window);
  window.alert = m => alert0(tr(String(m ?? "")));
  window.confirm = m => confirm0(tr(String(m ?? "")));
  window.prompt = (m, d) => prompt0(tr(String(m ?? "")), d == null ? d : tr(String(d)));

  const set0 = globalThis.chrome?.storage?.local?.set?.bind(globalThis.chrome.storage.local);
  if (set0) {
    try {
      globalThis.chrome.storage.local.set = (items, cb) => {
        const next = items && typeof items === "object" ? { ...items } : items;
        if (next && typeof next === "object") {
          for (const [k, v] of Object.entries(next)) {
            if (k.startsWith("cgpt_nav_transfer_payload:") && v && typeof v === "object") next[k] = { ...v, text: transferText(v.text) };
          }
        }
        return set0(next, cb);
      };
    } catch (_) {}
  }

  const pm0 = Window.prototype.postMessage;
  try {
    Window.prototype.postMessage = function (m, origin, transfer) {
      const next = m?.type === "cgpt-temp-transfer" ? { ...m, text: transferText(m.text) } : m;
      return arguments.length >= 3 ? pm0.call(this, next, origin, transfer) : pm0.call(this, next, origin);
    };
  } catch (_) {}

  globalThis.__cgptModsZhCN__ = { observer, refresh: () => localize(document), translate: tr };
})();
