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

  const OWNED_SELECTOR = [
    '[id^="cgpt-"]',
    '[class*="cgpt-"]',
    '[class*="chat-export__"]',
    '[data-cgpt-chat-export-control]',
    '[data-cgpt-chat-export-snippet]',
    '[data-cgpt-chat-group]',
    '[data-cgpt-chat-row]',
    '[data-cgpt-chat-organizer-control]',
    '[data-cgpt-chat-organizer-menu]',
    '[data-cgpt-composer-files]',
    '[data-cgpt-prompt-enhancer]',
    '[data-cgpt-prompt-enhancer-toast]'
  ].join(",");

  const NATIVE_ATTACHMENT_TRAY_ATTR = "data-cgpt-native-attachment-tray";
  const ATTACHMENT_COMPAT_STYLE_ID = "cgpt-attachment-native-preview-style";
  const ATTACHMENT_LIMIT = 10;

  function tr(value) {
    if (typeof value !== "string" || !value) return value;
    if (zh.has(value)) return zh.get(value);

    let match = value.match(/^Удалить папку «(.+)»\? Чаты останутся, но выйдут из этой папки\.$/u);
    if (match) return `删除文件夹“${match[1]}”？聊天不会被删除，只会移出该文件夹。`;

    match = value.match(/^Удалить (.+)$/u);
    if (match) return `删除 ${match[1]}`;

    match = value.match(/^Изображение (\d+) присутствует в исходном чате$/u);
    if (match) return `原聊天中包含图片 ${match[1]}`;

    return value;
  }

  function isOwned(element) {
    return Boolean(element?.closest?.(OWNED_SELECTOR));
  }

  function translateTextNode(node) {
    const value = node?.nodeValue || "";
    if (!value.trim()) return;

    const leading = value.match(/^\s*/u)?.[0] || "";
    const trailing = value.match(/\s*$/u)?.[0] || "";
    const core = value.slice(leading.length, value.length - trailing.length);
    const translated = tr(core);

    if (translated !== core) {
      node.nodeValue = leading + translated + trailing;
    }
  }

  function translateElement(element) {
    if (!(element instanceof Element)) return;

    for (const attribute of ["title", "aria-label", "placeholder"]) {
      if (!element.hasAttribute(attribute)) continue;
      const current = element.getAttribute(attribute) || "";
      const translated = tr(current);
      if (translated !== current) {
        element.setAttribute(attribute, translated);
      }
    }

    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
    }
  }

  function translateOwnedTree(root) {
    if (!(root instanceof Element)) return;
    translateElement(root);
    root.querySelectorAll("*").forEach(translateElement);
  }

  function normalizeNativeAttachmentLabels(root) {
    const nodes = [];

    if (root instanceof Element && root.matches("[aria-label], [title]")) {
      nodes.push(root);
    }

    if (root?.querySelectorAll) {
      nodes.push(...root.querySelectorAll("[aria-label], [title]"));
    }

    for (const element of nodes) {
      for (const attribute of ["aria-label", "title"]) {
        const current = element.getAttribute(attribute) || "";
        if (!current.includes("：")) continue;
        if (!/^(?:移除|删除|刪除).+\.[a-zA-Z0-9]{1,6}$/u.test(current)) continue;
        element.setAttribute(attribute, current.replace(/：/gu, ":"));
      }
    }
  }

  function canonicalAttachmentName(value) {
    return (value || "")
      .replace(/^(?:移除|删除|刪除)\s*(?:文件|附件)?\s*\d*\s*[：:]\s*/u, "")
      .trim();
  }

  function ensureAttachmentCompatStyle() {
    if (document.getElementById(ATTACHMENT_COMPAT_STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = ATTACHMENT_COMPAT_STYLE_ID;
    style.textContent = `
      html .cgpt-composer-files-grid {
        display: none !important;
      }

      html .cgpt-composer-files__overflow {
        display: none !important;
      }
    `;
    document.documentElement.appendChild(style);
  }

  function collectCompatAttachmentNames(host) {
    const rawNames = [];
    const items = Array.isArray(host?._cgptAttachmentItems)
      ? host._cgptAttachmentItems
      : [];

    for (const item of items) {
      if (item?.name) rawNames.push(item.name);
    }

    if (!rawNames.length && host?.querySelectorAll) {
      host
        .querySelectorAll(
          ".cgpt-composer-file__name-copy, .cgpt-composer-files__overflow-name",
        )
        .forEach((element) => {
          const value = element.textContent?.trim();
          if (value) rawNames.push(value);
        });
    }

    return Array.from(
      new Set(rawNames.map(canonicalAttachmentName).filter(Boolean)),
    );
  }

  function refreshAttachmentCompat() {
    ensureAttachmentCompatStyle();
    normalizeNativeAttachmentLabels(document);

    document
      .querySelectorAll(`[${NATIVE_ATTACHMENT_TRAY_ATTR}="1"]`)
      .forEach((element) => element.removeAttribute(NATIVE_ATTACHMENT_TRAY_ATTR));

    const host = document.querySelector('[data-cgpt-composer-files="1"]');
    if (!host) return;

    const names = collectCompatAttachmentNames(host);
    if (!names.length) return;

    const count = host.querySelector(".cgpt-composer-files__count");
    if (!count) return;

    count.textContent = `${names.length}/${ATTACHMENT_LIMIT}`;
    count.classList.toggle("is-over-limit", names.length > ATTACHMENT_LIMIT);
  }

  function localizeAddedNode(node) {
    if (!node) return;

    if (node.nodeType === Node.TEXT_NODE) {
      if (isOwned(node.parentElement)) translateTextNode(node);
      return;
    }

    if (!(node instanceof Element)) return;

    normalizeNativeAttachmentLabels(node);

    if (node.matches(OWNED_SELECTOR)) {
      translateOwnedTree(node);
      return;
    }

    node.querySelectorAll(OWNED_SELECTOR).forEach(translateOwnedTree);
  }

  function initialLocalize() {
    document.querySelectorAll(OWNED_SELECTOR).forEach(translateElement);
    normalizeNativeAttachmentLabels(document);
  }

  const pending = new Set();
  let frame = 0;
  let attachmentCompatFrame = 0;

  function flushPending() {
    frame = 0;
    const nodes = Array.from(pending);
    pending.clear();
    nodes.forEach(localizeAddedNode);
  }

  function scheduleAttachmentCompat() {
    if (attachmentCompatFrame) return;
    attachmentCompatFrame = requestAnimationFrame(() => {
      attachmentCompatFrame = 0;
      refreshAttachmentCompat();
    });
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) pending.add(node);
    }

    if (!frame && pending.size) {
      frame = requestAnimationFrame(flushPending);
    }
  });

  const attachmentCompatObserver = new MutationObserver(() => {
    scheduleAttachmentCompat();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  attachmentCompatObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [NATIVE_ATTACHMENT_TRAY_ATTR, "aria-label", "title"]
  });

  initialLocalize();
  refreshAttachmentCompat();

  globalThis.__cgptModsZhCN__ = {
    observer,
    attachmentCompatObserver,
    refresh: initialLocalize,
    refreshAttachmentCompat,
    translate: tr
  };
})();
