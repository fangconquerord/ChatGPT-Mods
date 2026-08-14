(async () => {
  "use strict";

  const BOOT_KEY = "__cgptChatExporter__";
  const FEATURE_KEY = "chatExport";
  const BUTTON_ID = "cgpt-chat-export-btn";
  const MENU_ID = "cgpt-chat-export-menu";
  const TOAST_ID = "cgpt-chat-export-toast";
  const STYLE_ID = "cgpt-chat-export-style";
  const CONTROL_ATTR = "data-cgpt-chat-export-control";
  const SNIPPET_ATTR = "data-cgpt-chat-export-snippet";
  const DOWNLOAD_MESSAGE = "cgpt-download-chat-export";
  const PASSIVE = { passive: true };
  const COPY_LABEL_PATTERN = /\bcopy\b|копир(?:овать|овать текст|овать код)/iu;
  const ACTION_LABEL_PATTERN = /\b(?:copy|edit|regenerate|share|like|dislike|read aloud|more|branch)\b|(?:копир|редакт|повтор|подел|оцен|озвуч|ещ[её]|ветв)/iu;
  const HEADER_ACTION_LABEL_PATTERN = /\b(?:share|more|menu|options)\b|(?:подел|ещ[её]|меню|действ)/iu;

  if (window !== window.top) return;

  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) {
    return;
  }

  if (globalThis[BOOT_KEY]?.ensure) {
    globalThis[BOOT_KEY].ensure();
    return;
  }

  const state = {
    menu: null,
    toastTimer: 0,
    mutationTimer: 0,
    activeScope: null,
    menuAnchor: null,
    exporting: false,
  };

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      :root {
        --cgpt-export-surface: var(--main-surface-primary, var(--bg-elevated-secondary, #ffffff));
        --cgpt-export-surface-hover: color-mix(in srgb, var(--cgpt-export-surface) 90%, currentColor);
        --cgpt-export-text: var(--text-primary, #0d0d0d);
        --cgpt-export-muted: var(--text-secondary, rgba(13,13,13,.62));
        --cgpt-export-border: color-mix(in srgb, var(--cgpt-export-text) 14%, transparent);
        --cgpt-export-shadow: 0 12px 30px rgba(0,0,0,.16);
      }

      @media (prefers-color-scheme: dark) {
        :root {
          --cgpt-export-surface: var(--main-surface-primary, #212121);
          --cgpt-export-text: var(--text-primary, #f7f7f8);
          --cgpt-export-muted: var(--text-secondary, rgba(247,247,248,.64));
          --cgpt-export-shadow: 0 14px 34px rgba(0,0,0,.42);
        }
      }

      #${BUTTON_ID} {
        position: fixed;
        top: max(10px, env(safe-area-inset-top));
        right: auto;
        z-index: 2147483000;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        min-height: 32px;
        padding: 0 10px;
        border: 1px solid var(--cgpt-export-border);
        border-radius: 999px;
        background: color-mix(in srgb, var(--cgpt-export-surface) 92%, transparent);
        box-shadow: 0 1px 2px rgba(0,0,0,.04);
        color: var(--cgpt-export-text);
        font: 500 12px/1 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: -.01em;
        cursor: pointer;
        visibility: hidden;
        transition: background .15s ease, border-color .15s ease, box-shadow .15s ease, transform .15s ease;
      }

      #${BUTTON_ID}:hover {
        background: var(--cgpt-export-surface-hover);
        border-color: color-mix(in srgb, var(--cgpt-export-text) 24%, transparent);
        box-shadow: 0 3px 10px rgba(0,0,0,.10);
      }

      #${BUTTON_ID}:active { transform: scale(.98); }
      #${BUTTON_ID}.is-compact > span { display: none; }
      #${BUTTON_ID}.is-compact { width: 32px; min-width: 32px; padding: 0; gap: 0; }

      #${BUTTON_ID}:focus-visible,
      .cgpt-chat-export-snippet:focus-visible,
      .cgpt-chat-export-format:focus-visible {
        outline: 2px solid #10a37f;
        outline-offset: 2px;
      }

      #${BUTTON_ID} svg,
      .cgpt-chat-export-snippet svg {
        width: 15px;
        height: 15px;
        fill: none;
        stroke: currentColor;
        stroke-width: 1.7;
        stroke-linecap: round;
        stroke-linejoin: round;
        flex: 0 0 auto;
      }

      #${MENU_ID} {
        position: fixed;
        z-index: 2147483001;
        width: min(286px, calc(100vw - 24px));
        padding: 6px;
        border: 1px solid var(--cgpt-export-border);
        border-radius: 14px;
        background: var(--cgpt-export-surface);
        box-shadow: var(--cgpt-export-shadow);
        color: var(--cgpt-export-text);
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      .cgpt-chat-export-menu__title {
        display: block;
        padding: 7px 8px 5px;
        color: var(--cgpt-export-muted);
        font-size: 11px;
        line-height: 1.25;
      }

      .cgpt-chat-export-format {
        display: grid;
        grid-template-columns: 30px minmax(0, 1fr);
        gap: 8px;
        width: 100%;
        min-height: 54px;
        padding: 8px;
        border: 0;
        border-radius: 10px;
        background: transparent;
        color: inherit;
        font: inherit;
        text-align: left;
        cursor: pointer;
      }

      .cgpt-chat-export-format:hover:not(:disabled) { background: color-mix(in srgb, var(--cgpt-export-text) 8%, transparent); }
      .cgpt-chat-export-format:disabled { cursor: wait; opacity: .58; }

      .cgpt-chat-export-format__icon {
        display: grid;
        place-items: center;
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: color-mix(in srgb, #10a37f 16%, transparent);
        color: #10a37f;
        font-size: 10px;
        font-weight: 720;
        letter-spacing: .02em;
      }

      .cgpt-chat-export-format__name { display: block; font-size: 12px; font-weight: 620; line-height: 1.2; }
      .cgpt-chat-export-format__desc { display: block; margin-top: 2px; color: var(--cgpt-export-muted); font-size: 10.5px; line-height: 1.25; }

      .cgpt-chat-export-snippet {
        display: inline-flex !important;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        min-width: 28px;
        margin-inline-start: 4px;
        padding: 0;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        opacity: .72;
        transition: opacity .14s ease, background .14s ease;
      }

      .cgpt-chat-export-snippet:hover { background: color-mix(in srgb, currentColor 11%, transparent); opacity: 1; }
      .cgpt-chat-export-snippet[data-cgpt-export-floating="1"] { position: absolute; top: 6px; right: 44px; z-index: 2; }

      #${TOAST_ID} {
        position: fixed;
        z-index: 2147483003;
        max-width: min(360px, calc(100vw - 28px));
        padding: 9px 11px;
        border: 1px solid var(--cgpt-export-border);
        border-radius: 10px;
        background: var(--cgpt-export-surface);
        box-shadow: var(--cgpt-export-shadow);
        color: var(--cgpt-export-text);
        font: 12px/1.35 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        pointer-events: none;
      }

      html.cgpt-split-active #${BUTTON_ID},
      html.cgpt-split-active #${MENU_ID},
      html.cgpt-split-active .cgpt-chat-export-snippet,
      html.cgpt-split-active #${TOAST_ID} { display: none !important; }
    `;
    document.documentElement.appendChild(style);
  }

  function exportIcon() {
    return `
      <svg aria-hidden="true" viewBox="0 0 24 24">
        <path d="M14 3H6.8A1.8 1.8 0 0 0 5 4.8v14.4A1.8 1.8 0 0 0 6.8 21h10.4a1.8 1.8 0 0 0 1.8-1.8V8z"></path>
        <path d="M14 3v5h5"></path>
        <path d="M12 11v6"></path>
        <path d="m9.5 14.5 2.5 2.5 2.5-2.5"></path>
      </svg>
    `;
  }

  function getVisibleText(node) {
    return String(node?.innerText || node?.textContent || "")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function getMessageScope(node) {
    return (
      node?.closest?.("[data-message-author-role]") ||
      node?.closest?.('[data-testid*="conversation-turn" i]') ||
      node?.closest?.('[data-testid*="turn" i]') ||
      node?.closest?.("article") ||
      node?.parentElement ||
      node ||
      null
    );
  }

  function getRole(node) {
    const roleNode = node?.matches?.("[data-message-author-role]")
      ? node
      : node?.querySelector?.("[data-message-author-role]");
    const role = String(roleNode?.getAttribute("data-message-author-role") || "").toLowerCase();
    if (role === "user") return "Пользователь";
    if (role === "assistant") return "ChatGPT";
    return "Фрагмент";
  }

  function getRoleKey(node) {
    const roleNode = node?.matches?.("[data-message-author-role]")
      ? node
      : node?.querySelector?.("[data-message-author-role]");
    const role = String(roleNode?.getAttribute("data-message-author-role") || "").toLowerCase();
    return role === "user" || role === "assistant" ? role : "fragment";
  }

  function collectMessageNodes(scope = null) {
    if (scope) {
      if (scope.matches?.("pre")) return [scope];
      return [getMessageScope(scope)].filter(Boolean);
    }

    const roleNodes = Array.from(document.querySelectorAll("[data-message-author-role]"))
      .filter((node) => {
        const role = String(node.getAttribute("data-message-author-role") || "").toLowerCase();
        return role === "user" || role === "assistant";
      });

    if (roleNodes.length) return roleNodes;

    return Array.from(document.querySelectorAll('[data-testid*="conversation-turn" i], main article'))
      .filter((node) => getVisibleText(node));
  }

  function sanitizeClone(source) {
    const clone = source.cloneNode(true);
    const originalImages = Array.from(source.querySelectorAll("img"));
    const removeSelectors = [
      "script",
      "style",
      "noscript",
      "iframe",
      "object",
      "embed",
      "form",
      "input",
      "textarea",
      "select",
      "canvas",
      `[${CONTROL_ATTR}]`,
      "[data-cgpt-ts]",
      "[data-cgpt-ts-row]",
    ].join(", ");

    clone.querySelectorAll(removeSelectors).forEach((node) => node.remove());

    clone.querySelectorAll("button, [role='button']").forEach((node) => {
      const label = getVisibleText(node) || node.getAttribute("aria-label") || node.getAttribute("title") || "";
      if (ACTION_LABEL_PATTERN.test(label) || !getVisibleText(node)) {
        node.remove();
        return;
      }

      const text = document.createElement("span");
      text.textContent = getVisibleText(node);
      node.replaceWith(text);
    });

    clone.querySelectorAll("svg, [aria-hidden='true']").forEach((node) => {
      if (!node.matches("img")) node.remove();
    });

    clone.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attribute) => {
        if (/^on/iu.test(attribute.name) || attribute.name === "style") {
          node.removeAttribute(attribute.name);
        }
      });
    });

    clone.querySelectorAll("img").forEach((image, index) => {
      const original = originalImages[index];
      const src = original?.currentSrc || original?.src || image.getAttribute("src") || "";
      if (src) image.setAttribute("src", src);
      image.removeAttribute("srcset");
      image.removeAttribute("sizes");
      image.removeAttribute("loading");
      if (!image.getAttribute("alt")) image.setAttribute("alt", "Изображение из чата");
    });

    clone.querySelectorAll("a").forEach((link) => {
      const href = link.href || link.getAttribute("href") || "";
      if (href) link.setAttribute("href", href);
      link.setAttribute("target", "_blank");
      link.setAttribute("rel", "noreferrer noopener");
    });

    return clone;
  }

  function chatTitle() {
    const heading = getVisibleText(document.querySelector("main h1"));
    const raw = heading || String(document.title || "").replace(/\s*[|–—-]\s*ChatGPT\s*$/iu, "");
    return raw || "Чат ChatGPT";
  }

  function timestampForFilename() {
    const now = new Date();
    const pad = (value) => String(value).padStart(2, "0");
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
  }

  function safeFilename(value) {
    return String(value || "chatgpt-chat")
      .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 90) || "chatgpt-chat";
  }

  function normalizedComparisonText(value) {
    return getVisibleText({ textContent: value })
      .toLocaleLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function createArchiveSection(node, role = getRole(node)) {
    const clone = sanitizeClone(node);
    const text = getVisibleText(clone);
    if (!text && !clone.querySelector("img, a")) return null;

    const section = document.createElement("section");
    section.className = "chat-export__message";
    const label = document.createElement("div");
    label.className = "chat-export__role";
    label.textContent = role;
    section.appendChild(label);
    section.appendChild(clone);
    return section;
  }

  function createPlainArchiveSection(message) {
    const section = document.createElement("section");
    section.className = "chat-export__message";
    const label = document.createElement("div");
    label.className = "chat-export__role";
    label.textContent = message.role === "user" ? "Пользователь" : "ChatGPT";
    const content = document.createElement("div");
    content.className = "chat-export__plain";
    content.textContent = message.text;
    section.append(label, content);
    return section;
  }

  function refreshPlainText(archive) {
    archive.plainText = Array.from(archive.body.querySelectorAll(".chat-export__message"))
      .map((section) => {
        const role = getVisibleText(section.querySelector(".chat-export__role"));
        const copy = section.cloneNode(true);
        copy.querySelector(".chat-export__role")?.remove();
        return `${role}:\n${getVisibleText(copy)}`.trim();
      })
      .filter(Boolean)
      .join("\n\n────────────────────\n\n");
  }

  function buildArchive(scope = null) {
    const nodes = collectMessageNodes(scope);
    const body = document.createElement("div");
    body.className = "chat-export__messages";

    const entries = [];
    nodes.forEach((node) => {
      const section = createArchiveSection(node);
      if (!section) return;
      body.appendChild(section);
      entries.push({
        node,
        section,
        role: getRoleKey(node),
        text: normalizedComparisonText(getVisibleText(section)),
      });
    });

    if (!body.children.length) {
      throw new Error("Не удалось найти сообщения текущего чата.");
    }

    const title = scope ? "Фрагмент из чата ChatGPT" : chatTitle();
    const archive = { title, body, entries, plainText: "" };
    refreshPlainText(archive);
    return archive;
  }

  function getConversationId() {
    const match = location.pathname.match(/\/c\/([^/?#]+)/iu);
    return match?.[1] || "";
  }

  function messageTextFromApi(message) {
    const content = message?.content;
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    return parts
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .filter(Boolean)
      .join("\n\n")
      .trim();
  }

  function getCurrentConversationPath(data) {
    const mapping = data?.mapping || {};
    const fromCurrentNode = [];
    let nodeId = data?.current_node;

    while (nodeId && mapping[nodeId]) {
      fromCurrentNode.push(mapping[nodeId]);
      nodeId = mapping[nodeId]?.parent;
    }

    const nodes = fromCurrentNode.length
      ? fromCurrentNode.reverse()
      : Object.values(mapping).sort((a, b) => (a?.message?.create_time || 0) - (b?.message?.create_time || 0));

    return nodes
      .map((node) => {
        const role = String(node?.message?.author?.role || "").toLowerCase();
        const text = messageTextFromApi(node?.message);
        return { role, text };
      })
      .filter((message) => (message.role === "user" || message.role === "assistant") && message.text);
  }

  async function enrichArchiveWithConversation(archive, scope = null) {
    if (scope) return archive;
    if (!archive.entries.some((entry) => entry.role === "user" || entry.role === "assistant")) return archive;
    const conversationId = getConversationId();
    if (!conversationId) return archive;

    try {
      const response = await fetch(`/backend-api/conversation/${encodeURIComponent(conversationId)}`, {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      if (!response.ok) return archive;

      const messages = getCurrentConversationPath(await response.json());
      if (messages.length <= archive.entries.length) return archive;

      const remaining = [...archive.entries];
      const orderedSections = [];
      const nextEntries = [];

      messages.forEach((message) => {
        const comparable = normalizedComparisonText(message.text);
        const index = remaining.findIndex((entry) =>
          entry.role === message.role &&
          comparable &&
          (entry.text.includes(comparable) || comparable.includes(entry.text)),
        );
        const entry = index >= 0 ? remaining.splice(index, 1)[0] : null;
        const section = entry?.section || createPlainArchiveSection(message);
        if (!section) return;
        orderedSections.push(section);
        nextEntries.push(entry || {
          node: null,
          section,
          role: message.role,
          text: comparable,
        });
      });

      // Retain a visible DOM message if ChatGPT's API omitted it while the page was updating.
      remaining.forEach((entry) => {
        orderedSections.push(entry.section);
        nextEntries.push(entry);
      });

      archive.body.replaceChildren(...orderedSections);
      archive.entries = nextEntries;
      refreshPlainText(archive);
    } catch (_error) {
      // Exporting the visible chat is still useful when the current conversation is unavailable.
    }

    return archive;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function documentStyles() {
    return `
      * { box-sizing: border-box; }
      body { margin: 0; background: #fff; color: #202123; font-family: Arial, Helvetica, sans-serif; font-size: 11pt; line-height: 1.52; }
      .chat-export { max-width: 860px; margin: 0 auto; padding: 36px 30px 52px; }
      .chat-export__heading { margin: 0 0 6px; font-size: 20pt; line-height: 1.22; }
      .chat-export__meta { margin: 0 0 28px; color: #6b7280; font-size: 9.5pt; }
      .chat-export__message { margin: 0 0 22px; padding: 16px 18px; border: 1px solid #e5e7eb; border-radius: 12px; break-inside: avoid; }
      .chat-export__role { margin: 0 0 10px; color: #10a37f; font-size: 9pt; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; }
      p { margin: 0 0 10px; } p:last-child { margin-bottom: 0; }
      h1, h2, h3, h4 { margin: 18px 0 9px; line-height: 1.25; } h1 { font-size: 18pt; } h2 { font-size: 15pt; } h3 { font-size: 12.5pt; }
      ul, ol { margin: 8px 0 12px; padding-left: 24px; } li + li { margin-top: 3px; }
      blockquote { margin: 12px 0; padding: 8px 14px; border-left: 3px solid #10a37f; background: #f5f7f7; color: #374151; }
      pre { overflow-wrap: anywhere; margin: 12px 0; padding: 13px; border: 1px solid #e5e7eb; border-radius: 8px; background: #f7f7f8; color: #111827; font: 9.5pt/1.45 Consolas, "Courier New", monospace; white-space: pre-wrap; }
      .chat-export__plain { white-space: pre-wrap; }
      code { font-family: Consolas, "Courier New", monospace; } :not(pre) > code { padding: 1px 4px; border-radius: 4px; background: #f1f3f4; font-size: .92em; }
      table { width: 100%; margin: 12px 0; border-collapse: collapse; font-size: 10pt; } th, td { padding: 7px 8px; border: 1px solid #dfe3e8; text-align: left; vertical-align: top; } th { background: #f6f7f8; }
      img { display: block; max-width: 100%; height: auto; margin: 12px 0; border-radius: 8px; }
      a { color: #0a7f62; overflow-wrap: anywhere; } hr { border: 0; border-top: 1px solid #e5e7eb; margin: 18px 0; }
      @page { size: auto; margin: 14mm; }
      @media print { .chat-export { max-width: none; padding: 0; } .chat-export__message { break-inside: avoid; } }
    `;
  }

  function buildDocumentHtml(archive) {
    return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(archive.title)}</title><style>${documentStyles()}</style></head>
<body><main class="chat-export"><h1 class="chat-export__heading">${escapeHtml(archive.title)}</h1><p class="chat-export__meta">Экспортировано из ChatGPT · ${escapeHtml(new Date().toLocaleString("ru-RU"))}</p>${archive.body.innerHTML}</main></body></html>`;
  }

  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error || new Error("Не удалось подготовить файл."));
      reader.onload = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  }

  async function inlineImages(root) {
    const images = Array.from(root.querySelectorAll("img"));
    await Promise.all(
      images.map(async (image) => {
        const source = image.currentSrc || image.getAttribute("src") || "";
        if (!/^(?:https?:|blob:)/iu.test(source)) return;

        try {
          const response = await fetch(source, { credentials: "include" });
          const blob = await response.blob();
          if (!response.ok || !blob.type.startsWith("image/") || blob.size > 12 * 1024 * 1024) return;
          image.setAttribute("src", await blobToDataUrl(blob));
        } catch (_error) {
          // If a CDN forbids reading an image, retain its original, working link.
        }
      }),
    );
  }

  function loadImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Не удалось прочитать изображение."));
      image.src = source;
    });
  }

  async function rasterizeImage(imageElement, maxDimension = 1600) {
    const source = imageElement?.currentSrc || imageElement?.getAttribute?.("src") || "";
    if (!source) return null;

    try {
      const image = await loadImage(source);
      const originalWidth = image.naturalWidth || image.width;
      const originalHeight = image.naturalHeight || image.height;
      if (!originalWidth || !originalHeight) return null;

      const scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
      const width = Math.max(1, Math.round(originalWidth * scale));
      const height = Math.max(1, Math.round(originalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      return { width, height, dataUrl: canvas.toDataURL("image/jpeg", 0.9) };
    } catch (_error) {
      return null;
    }
  }

  function dataUrlToBytes(dataUrl) {
    const comma = String(dataUrl || "").indexOf(",");
    if (comma < 0) throw new Error("Некорректные данные изображения.");
    const binary = atob(String(dataUrl).slice(comma + 1));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  function bytesToHex(bytes) {
    const chunks = [];
    for (let start = 0; start < bytes.length; start += 8192) {
      let chunk = "";
      const end = Math.min(bytes.length, start + 8192);
      for (let index = start; index < end; index += 1) {
        chunk += bytes[index].toString(16).padStart(2, "0");
      }
      chunks.push(chunk);
    }
    return chunks.join("");
  }

  function rtfEscape(text) {
    let result = "";
    const value = String(text || "").replace(/\r\n?/g, "\n");
    for (let index = 0; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      const character = value[index];
      if (character === "\\" || character === "{" || character === "}") {
        result += `\\${character}`;
      } else if (character === "\n") {
        result += "\\line ";
      } else if (code >= 32 && code <= 126) {
        result += character;
      } else {
        result += `\\u${code > 32767 ? code - 65536 : code}?`;
      }
    }
    return result;
  }

  function textFromArchiveSection(section) {
    const copy = section.cloneNode(true);
    copy.querySelector(".chat-export__role")?.remove();
    copy.querySelectorAll("img").forEach((image) => image.remove());
    return getVisibleText(copy);
  }

  async function buildWordRtf(archive) {
    const parts = [
      "{\\rtf1\\ansi\\deff0\\uc1",
      "{\\fonttbl{\\f0 Arial;}{\\f1 Courier New;}}",
      "{\\colortbl;\\red16\\green163\\blue127;\\red32\\green33\\blue35;}",
      "\\viewkind4\\pard\\sa180\\sl276\\slmult1\\f0\\fs22 ",
      `\\fs34\\b ${rtfEscape(archive.title)}\\b0\\fs22\\par `,
      `\\cf2 ${rtfEscape(`Экспортировано из ChatGPT · ${new Date().toLocaleString("ru-RU")}`)}\\cf0\\par\\par `,
    ];

    for (const section of archive.body.querySelectorAll(".chat-export__message")) {
      const role = getVisibleText(section.querySelector(".chat-export__role"));
      parts.push(`\\pard\\sa100\\sb120\\cf1\\b ${rtfEscape(role)}\\b0\\cf0\\par `);
      const text = textFromArchiveSection(section);
      if (text) parts.push(`\\pard\\sa160\\f0\\fs22 ${rtfEscape(text)}\\par `);

      const images = Array.from(section.querySelectorAll("img"));
      for (const image of images) {
        const raster = await rasterizeImage(image, 1500);
        if (!raster) continue;
        const widthGoal = Math.round(Math.min(9300, raster.width * 8));
        const heightGoal = Math.round((widthGoal * raster.height) / raster.width);
        parts.push(
          `\\pard\\qc{\\pict\\jpegblip\\picw${raster.width}\\pich${raster.height}\\picwgoal${widthGoal}\\pichgoal${heightGoal} ${bytesToHex(dataUrlToBytes(raster.dataUrl))}}\\par `,
        );
      }
    }

    parts.push("}");
    return parts.join("");
  }

  function createPdfCanvasPage() {
    const canvas = document.createElement("canvas");
    canvas.width = 1240;
    canvas.height = 1754;
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.textBaseline = "top";
    return { canvas, context, y: 76 };
  }

  function wrapCanvasText(context, text, maxWidth) {
    const lines = [];
    String(text || "").replace(/\r\n?/g, "\n").split("\n").forEach((paragraph) => {
      if (!paragraph.trim()) {
        lines.push("");
        return;
      }
      let line = "";
      paragraph.split(/\s+/).forEach((word) => {
        const candidate = line ? `${line} ${word}` : word;
        if (!line || context.measureText(candidate).width <= maxWidth) {
          line = candidate;
          return;
        }
        lines.push(line);
        line = word;
        while (context.measureText(line).width > maxWidth && line.length > 1) {
          let cut = line.length - 1;
          while (cut > 1 && context.measureText(line.slice(0, cut)).width > maxWidth) cut -= 1;
          lines.push(line.slice(0, cut));
          line = line.slice(cut);
        }
      });
      if (line) lines.push(line);
    });
    return lines;
  }

  async function createPdfPages(archive) {
    const pages = [];
    let page = createPdfCanvasPage();
    pages.push(page);
    const margin = 76;
    const maxY = page.canvas.height - margin;
    const newPage = () => {
      page = createPdfCanvasPage();
      pages.push(page);
    };
    const ensureSpace = (height) => {
      if (page.y + height > maxY) newPage();
    };
    const drawLines = (text, font, color, lineHeight, gap = 0) => {
      page.context.font = font;
      const lines = wrapCanvasText(page.context, text, page.canvas.width - margin * 2);
      page.context.fillStyle = color;
      lines.forEach((line) => {
        ensureSpace(lineHeight);
        page.context.fillText(line, margin, page.y);
        page.y += lineHeight;
      });
      page.y += gap;
    };

    drawLines(archive.title, "700 34px Arial", "#202123", 44, 8);
    drawLines(`Экспортировано из ChatGPT · ${new Date().toLocaleString("ru-RU")}`, "20px Arial", "#6b7280", 28, 26);

    for (const section of archive.body.querySelectorAll(".chat-export__message")) {
      ensureSpace(44);
      const role = getVisibleText(section.querySelector(".chat-export__role"));
      drawLines(role.toUpperCase(), "700 18px Arial", "#0a8b6d", 26, 8);
      const text = textFromArchiveSection(section);
      if (text) drawLines(text, "22px Arial", "#202123", 32, 16);

      for (const image of section.querySelectorAll("img")) {
        const raster = await rasterizeImage(image, 1120);
        if (!raster) continue;
        const availableWidth = page.canvas.width - margin * 2;
        const scale = Math.min(1, availableWidth / raster.width, 520 / raster.height);
        const width = Math.round(raster.width * scale);
        const height = Math.round(raster.height * scale);
        ensureSpace(height + 22);
        const printable = await loadImage(raster.dataUrl);
        page.context.drawImage(printable, margin, page.y, width, height);
        page.y += height + 22;
      }

      page.y += 16;
    }

    return pages.map((item) => dataUrlToBytes(item.canvas.toDataURL("image/jpeg", 0.91)));
  }

  function concatenateBytes(parts) {
    const length = parts.reduce((sum, part) => sum + part.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    parts.forEach((part) => {
      result.set(part, offset);
      offset += part.length;
    });
    return result;
  }

  function buildPdfFile(pageImages) {
    const encode = (value) => new TextEncoder().encode(value);
    const objects = [];
    const pageRefs = [];
    let nextObject = 3;

    pageImages.forEach((image) => {
      const imageRef = nextObject++;
      const contentRef = nextObject++;
      const pageRef = nextObject++;
      const imageHeader = encode(`<< /Type /XObject /Subtype /Image /Width 1240 /Height 1754 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`);
      objects[imageRef] = concatenateBytes([imageHeader, image, encode("\nendstream")]);
      const content = "q\n595.28 0 0 841.89 0 0 cm\n/Im0 Do\nQ";
      objects[contentRef] = encode(`<< /Length ${encode(content).length} >>\nstream\n${content}\nendstream`);
      objects[pageRef] = encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im0 ${imageRef} 0 R >> >> /Contents ${contentRef} 0 R >>`);
      pageRefs.push(pageRef);
    });

    objects[1] = encode("<< /Type /Catalog /Pages 2 0 R >>");
    objects[2] = encode(`<< /Type /Pages /Count ${pageRefs.length} /Kids [${pageRefs.map((ref) => `${ref} 0 R`).join(" ")}] >>`);

    const header = encode("%PDF-1.4\n%âãÏÓ\n");
    const body = [header];
    const offsets = [0];
    let offset = header.length;
    for (let index = 1; index < nextObject; index += 1) {
      const object = objects[index];
      const wrapped = concatenateBytes([encode(`${index} 0 obj\n`), object, encode("\nendobj\n")]);
      offsets[index] = offset;
      body.push(wrapped);
      offset += wrapped.length;
    }

    const xrefOffset = offset;
    const xref = `xref\n0 ${nextObject}\n0000000000 65535 f \n${offsets.slice(1).map((item) => `${String(item).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${nextObject} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    body.push(encode(xref));
    return new Blob([concatenateBytes(body)], { type: "application/pdf" });
  }

  async function requestDownload(filename, mime, content) {
    const url = await blobToDataUrl(new Blob([content], { type: mime }));
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: DOWNLOAD_MESSAGE,
          filename,
          url,
        },
        (result) => {
          const error = chrome.runtime.lastError;
          if (error) {
            reject(new Error(error.message));
            return;
          }
          if (!result?.ok) {
            reject(new Error(result?.error || "Браузер не смог начать сохранение."));
            return;
          }
          resolve(result);
        },
      );
    });
  }

  async function chooseSaveFile(filename, mime, extension, description) {
    if (typeof window.showSaveFilePicker !== "function") return null;

    try {
      return await window.showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description,
            accept: { [mime.split(";")[0]]: [extension] },
          },
        ],
      });
    } catch (error) {
      if (error?.name === "AbortError") return false;
      // Some Chromium profiles disable the File System Access API. The downloads
      // fallback below still presents Chrome's own "Save as" dialog.
      return null;
    }
  }

  async function saveFile(handle, filename, mime, content) {
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(new Blob([content], { type: mime }));
      await writable.close();
      return;
    }

    await requestDownload(filename, mime, content);
  }

  function printArchive(printWindow, archive) {
    if (printWindow.closed) return;
    printWindow.document.open();
    printWindow.document.write(buildDocumentHtml(archive));
    printWindow.document.close();

    const print = () => {
      printWindow.focus();
      printWindow.print();
    };

    const images = Array.from(printWindow.document.images);
    Promise.all(
      images.map(
        (image) =>
          image.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", resolve, { once: true });
              }),
      ),
    ).then(() => window.setTimeout(print, 120));
  }

  function openPdfDialog(archive, scope = null) {
    const name = safeFilename(`${archive.title} ${timestampForFilename()}`);
    const printWindow = window.open("about:blank", "_blank");
    if (!printWindow) {
      throw new Error("Браузер заблокировал окно печати. Разрешите всплывающие окна для chatgpt.com.");
    }

    try {
      printWindow.opener = null;
    } catch (_error) {}

    printWindow.document.open();
    printWindow.document.write("<!doctype html><title>Подготовка PDF…</title><body>Подготавливаю чат для печати…</body>");
    printWindow.document.close();
    printWindow.document.title = name;
    void enrichArchiveWithConversation(archive, scope).then(() => printArchive(printWindow, archive));
  }

  function showToast(message, anchor = null) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute(CONTROL_ATTR, "1");
      toast.setAttribute("role", "status");
      toast.setAttribute("aria-live", "polite");
      document.body.appendChild(toast);
    }

    toast.textContent = message;
    const rect = (anchor || document.getElementById(BUTTON_ID))?.getBoundingClientRect();
    const width = toast.getBoundingClientRect().width;
    const height = toast.getBoundingClientRect().height;
    const left = Math.max(14, Math.min((rect?.right || window.innerWidth - 14) - width, window.innerWidth - width - 14));
    const top = Math.max(14, Math.min((rect?.bottom || 56) + 10, window.innerHeight - height - 14));
    toast.style.left = `${Math.round(left)}px`;
    toast.style.top = `${Math.round(top)}px`;
    toast.hidden = false;

    if (state.toastTimer) window.clearTimeout(state.toastTimer);
    state.toastTimer = window.setTimeout(() => {
      toast.hidden = true;
    }, 4200);
  }

  function closeMenu() {
    state.menu?.remove();
    state.menu = null;
    state.activeScope = null;
    state.menuAnchor = null;
  }

  function formatButton(type, name, description) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cgpt-chat-export-format";
    button.dataset.format = type;
    button.innerHTML = `<span class="cgpt-chat-export-format__icon">${type.toUpperCase()}</span><span><span class="cgpt-chat-export-format__name">${name}</span><span class="cgpt-chat-export-format__desc">${description}</span></span>`;
    button.addEventListener("click", () => void exportCurrent(button, type));
    return button;
  }

  function isVisibleTopButton(element) {
    if (!element?.isConnected || element.id === BUTTON_ID || element.closest(`[${CONTROL_ATTR}]`)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top < 92 &&
      rect.bottom > -4
    );
  }

  function headerButtonLabel(element) {
    return [
      element.getAttribute?.("aria-label"),
      element.getAttribute?.("title"),
      element.getAttribute?.("data-testid"),
      getVisibleText(element),
    ]
      .filter(Boolean)
      .join(" ");
  }

  function findHeaderActions() {
    const controls = Array.from(document.querySelectorAll("header button, header [role='button'], button, [role='button']"))
      .filter(isVisibleTopButton)
      .filter((element) => element.getBoundingClientRect().left > window.innerWidth * 0.42);
    const explicit = controls.filter((element) => HEADER_ACTION_LABEL_PATTERN.test(headerButtonLabel(element)));
    const candidates = explicit.length ? explicit : controls;
    return candidates.sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
  }

  function positionMainButton() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) return;

    button.classList.remove("is-compact");
    let buttonRect = button.getBoundingClientRect();
    const action = findHeaderActions()[0] || null;
    const actionRect = action?.getBoundingClientRect();
    const pad = 12;

    if (actionRect && actionRect.left < buttonRect.width + pad * 2) {
      button.classList.add("is-compact");
      buttonRect = button.getBoundingClientRect();
    }

    const left = actionRect
      ? Math.max(pad, actionRect.left - buttonRect.width - 8)
      : Math.max(pad, window.innerWidth - buttonRect.width - 150);
    const top = actionRect
      ? Math.max(pad, actionRect.top + (actionRect.height - buttonRect.height) / 2)
      : 10;

    button.style.left = `${Math.round(left)}px`;
    button.style.top = `${Math.round(top)}px`;
    button.style.visibility = "visible";
    if (state.menu) positionMenu(state.menuAnchor || button);
  }

  function positionMenu(anchor) {
    const menu = state.menu;
    if (!menu || !anchor?.isConnected) return;

    const rect = anchor.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const pad = 12;
    const left = Math.max(pad, Math.min(rect.right - menuRect.width, window.innerWidth - menuRect.width - pad));
    const top = rect.bottom + 8 + menuRect.height <= window.innerHeight - pad
      ? rect.bottom + 8
      : Math.max(pad, rect.top - menuRect.height - 8);
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function openMenu(anchor, scope = null) {
    if (state.menu) {
      closeMenu();
      return;
    }

    const menu = document.createElement("div");
    menu.id = MENU_ID;
    menu.setAttribute(CONTROL_ATTR, "1");
    menu.setAttribute("role", "menu");
    menu.innerHTML = `<span class="cgpt-chat-export-menu__title">${scope ? "Сохранить этот фрагмент" : "Сохранить весь текущий чат"}</span>`;
    menu.appendChild(formatButton("print", "Печать", "Откроется системное окно печати"));
    menu.appendChild(formatButton("pdf", "PDF", "Создаст PDF-файл и предложит место сохранения"));
    menu.appendChild(formatButton("word", "Word (.rtf)", "Документ Word с кодом и встроенными изображениями"));
    menu.appendChild(formatButton("txt", "TXT", "Только текст сообщения и кода"));

    document.body.appendChild(menu);
    state.menu = menu;
    state.activeScope = scope;
    state.menuAnchor = anchor;
    positionMenu(anchor);
  }

  async function exportCurrent(button, type) {
    if (state.exporting) return;
    state.exporting = true;
    const buttons = Array.from(state.menu?.querySelectorAll("button") || []);
    buttons.forEach((item) => { item.disabled = true; });

    try {
      const archive = buildArchive(state.activeScope);
      const filename = safeFilename(`${archive.title} ${timestampForFilename()}`);

      if (type === "print") {
        openPdfDialog(archive, state.activeScope);
        closeMenu();
        showToast("Открылось системное окно печати.", button);
        return;
      }

      if (type === "pdf") {
        const handle = await chooseSaveFile(
          `${filename}.pdf`,
          "application/pdf",
          ".pdf",
          "PDF-документ",
        );
        if (handle === false) {
          closeMenu();
          showToast("Сохранение отменено.", button);
          return;
        }
        showToast("Подготавливаю PDF…", button);
        await enrichArchiveWithConversation(archive, state.activeScope);
        await inlineImages(archive.body);
        const pdf = buildPdfFile(await createPdfPages(archive));
        await saveFile(handle, `${filename}.pdf`, "application/pdf", pdf);
        closeMenu();
        showToast("PDF-файл сохранён.", button);
        return;
      }

      if (type === "word") {
        const handle = await chooseSaveFile(
          `${filename}.rtf`,
          "application/rtf",
          ".rtf",
          "Документ Word",
        );
        if (handle === false) {
          closeMenu();
          showToast("Сохранение отменено.", button);
          return;
        }
        showToast("Подготавливаю документ Word…", button);
        await enrichArchiveWithConversation(archive, state.activeScope);
        await inlineImages(archive.body);
        await saveFile(handle, `${filename}.rtf`, "application/rtf", await buildWordRtf(archive));
        closeMenu();
        showToast("Документ Word сохранён.", button);
        return;
      }

      const handle = await chooseSaveFile(
        `${filename}.txt`,
        "text/plain;charset=utf-8",
        ".txt",
        "Текстовый файл",
      );
      if (handle === false) {
        closeMenu();
        showToast("Сохранение отменено.", button);
        return;
      }
      await enrichArchiveWithConversation(archive, state.activeScope);
      await saveFile(handle, `${filename}.txt`, "text/plain;charset=utf-8", `\ufeff${archive.plainText}\n`);
      closeMenu();
      showToast("Текстовый файл сохранён.", button);
    } catch (error) {
      console.warn("[ChatGPT Mods] Chat export failed:", error);
      showToast(error?.message || "Не удалось сохранить чат.", button);
      buttons.forEach((item) => { item.disabled = false; });
    } finally {
      state.exporting = false;
    }
  }

  function createMainButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const button = document.createElement("button");
    button.id = BUTTON_ID;
    button.type = "button";
    button.setAttribute(CONTROL_ATTR, "1");
    button.setAttribute("aria-label", "Сохранить текущий чат");
    button.innerHTML = `${exportIcon()}<span>Сохранить</span>`;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(button);
    });
    document.body.appendChild(button);
  }

  function isCopyControl(button) {
    if (!button || button.closest(`[${CONTROL_ATTR}]`)) return false;
    const label = [button.getAttribute("aria-label"), button.getAttribute("title"), getVisibleText(button)]
      .filter(Boolean)
      .join(" ");
    return COPY_LABEL_PATTERN.test(label);
  }

  function findCodeToolbar(pre) {
    let current = pre.parentElement;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const copy = Array.from(current.querySelectorAll("button")).find(isCopyControl);
      if (copy) return { host: current, copy };
      current = current.parentElement;
    }
    return { host: pre.parentElement, copy: null };
  }

  function createSnippetButton(scope, floating = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cgpt-chat-export-snippet";
    button.setAttribute(CONTROL_ATTR, "1");
    button.setAttribute(SNIPPET_ATTR, "1");
    button.setAttribute("aria-label", "Сохранить фрагмент");
    if (floating) button.setAttribute("data-cgpt-export-floating", "1");
    button.innerHTML = exportIcon();
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu(button, scope);
    });
    return button;
  }

  function addCodeButtons() {
    document.querySelectorAll("pre").forEach((pre) => {
      if (pre.closest(`[${CONTROL_ATTR}]`) || pre.dataset.cgptExportCode === "1") return;
      const { host, copy } = findCodeToolbar(pre);
      if (!host) return;

      pre.dataset.cgptExportCode = "1";
      const button = createSnippetButton(pre);
      if (copy?.parentElement) {
        copy.dataset.cgptExportCopy = "1";
        copy.insertAdjacentElement("afterend", button);
      } else {
        const computed = window.getComputedStyle(host);
        if (computed.position === "static") host.style.position = "relative";
        button.setAttribute("data-cgpt-export-floating", "1");
        host.appendChild(button);
      }
    });
  }

  function addCopyTextButtons() {
    document.querySelectorAll("button").forEach((copy) => {
      if (!isCopyControl(copy) || copy.dataset.cgptExportCopy === "1") return;
      const scope = getMessageScope(copy);
      if (!scope || !getVisibleText(scope)) return;

      copy.dataset.cgptExportCopy = "1";
      const button = createSnippetButton(scope);
      copy.insertAdjacentElement("afterend", button);
    });
  }

  function ensure() {
    ensureStyle();
    createMainButton();
    positionMainButton();
    addCodeButtons();
    addCopyTextButtons();
  }

  function scheduleEnsure() {
    if (state.mutationTimer) return;
    state.mutationTimer = window.setTimeout(() => {
      state.mutationTimer = 0;
      ensure();
    }, 120);
  }

  function boot() {
    ensure();
    document.addEventListener("pointerdown", (event) => {
      if (!state.menu) return;
      const button = document.getElementById(BUTTON_ID);
      if (state.menu.contains(event.target) || button?.contains(event.target) || event.target.closest?.(`[${SNIPPET_ATTR}]`)) return;
      closeMenu();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", () => {
      positionMainButton();
      if (state.menu) positionMenu(state.menuAnchor || document.getElementById(BUTTON_ID));
    }, PASSIVE);
    window.addEventListener("scroll", () => {
      if (state.menu) positionMenu(state.menuAnchor || document.getElementById(BUTTON_ID));
    }, PASSIVE);

    const observer = new MutationObserver(scheduleEnsure);
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  globalThis[BOOT_KEY] = { ensure };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
