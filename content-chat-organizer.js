(async () => {
  "use strict";

  const BOOT_KEY = "__cgptChatOrganizer__";
  const FEATURE_KEY = "chatOrganizer";
  const STORAGE_KEY = "cgptChatOrganizer";
  const STYLE_ID = "cgpt-chat-organizer-style";
  const GROUP_HOST_ATTR = "data-cgpt-chat-group";
  const GROUP_BODY_ATTR = "data-cgpt-chat-group-body";
  const TOOLBAR_ATTR = "data-cgpt-chat-groups-toolbar";
  const ROW_ATTR = "data-cgpt-chat-row";
  const CONTROL_ATTR = "data-cgpt-chat-organizer-control";
  const MENU_ATTR = "data-cgpt-chat-organizer-menu";
  const PASSIVE = { passive: true };
  const MAX_NAME_LENGTH = 60;

  const COLORS = [
    { value: "#ef4444", label: "Красный" },
    { value: "#f97316", label: "Оранжевый" },
    { value: "#eab308", label: "Жёлтый" },
    { value: "#22c55e", label: "Зелёный" },
    { value: "#06b6d4", label: "Бирюзовый" },
    { value: "#3b82f6", label: "Синий" },
    { value: "#6366f1", label: "Индиго" },
    { value: "#a855f7", label: "Фиолетовый" },
    { value: "#ec4899", label: "Розовый" },
    { value: "#94a3b8", label: "Серый" },
  ];
  const COLOR_VALUES = new Set(COLORS.map((item) => item.value));
  const ICONS = [
    "📁", "📌", "⭐", "💡", "🎯", "🚀", "💼", "📚",
    "🧠", "🛠️", "💻", "📊", "📈", "🧪", "🎨", "✍️",
    "🧾", "💬", "🌿", "🏠", "🔒", "🔖", "🗓️", "⚡",
    "🔥", "🎵", "🎬", "📷", "🧩", "🧭", "🛰️", "🪄",
    "⚠️", "❗", "❕", "‼️", "⛔", "🚫", "❌", "✅",
    "🆘", "🐞", "🛑", "💥", "🔴", "🟠", "🟡", "🟢",
  ];
  const ICON_VALUES = new Set(ICONS);

  if (
    globalThis.CGPT_FEATURE_SETTINGS?.isEnabled &&
    !(await globalThis.CGPT_FEATURE_SETTINGS.isEnabled(FEATURE_KEY))
  ) {
    return;
  }

  if (globalThis[BOOT_KEY]?.scheduleRun) {
    globalThis[BOOT_KEY].scheduleRun();
    return;
  }

  const state = {
    data: emptyData(),
    observer: null,
    timer: 0,
    running: false,
    pendingRun: false,
    saveChain: Promise.resolve(),
    menu: null,
    lastChatId: null,
    nativeActionTimers: new Map(),
    draggedChatId: null,
  };

  function emptyData() {
    return {
      version: 1,
      groups: [],
      chats: {},
    };
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/gu, " ").trim();
  }

  function makeId(prefix) {
    return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function isColor(value) {
    return COLOR_VALUES.has(value);
  }

  function isIcon(value) {
    return ICON_VALUES.has(value);
  }

  function normalizeData(value) {
    const next = emptyData();
    if (!value || typeof value !== "object") return next;

    const ids = new Set();
    if (Array.isArray(value.groups)) {
      value.groups.forEach((item) => {
        const id = typeof item?.id === "string" ? item.id.slice(0, 96) : "";
        const name = normalizeText(item?.name).slice(0, MAX_NAME_LENGTH);
        if (!id || !name || ids.has(id)) return;
        ids.add(id);
        next.groups.push({
          id,
          name,
          color: isColor(item?.color) ? item.color : "#6366f1",
          icon: isIcon(item?.icon) ? item.icon : "📁",
          collapsed: Boolean(item?.collapsed),
        });
      });
    }

    if (!value.chats || typeof value.chats !== "object") return next;
    Object.entries(value.chats).forEach(([id, item]) => {
      if (!/^[a-zA-Z0-9_-]{6,160}$/u.test(id) || !item || typeof item !== "object") {
        return;
      }
      const groupId = ids.has(item.groupId) ? item.groupId : null;
      const color = isColor(item.color) ? item.color : null;
      const icon = isIcon(item.icon) ? item.icon : null;
      if (!groupId && !color && !icon) return;
      next.chats[id] = { groupId, color, icon };
    });

    return next;
  }

  function cloneData(data) {
    return {
      version: 1,
      groups: data.groups.map((group) => ({ ...group })),
      chats: Object.fromEntries(
        Object.entries(data.chats).map(([id, chat]) => [id, { ...chat }]),
      ),
    };
  }

  function storageGet() {
    return new Promise((resolve) => {
      try {
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.get([STORAGE_KEY], (result) => {
            resolve(result?.[STORAGE_KEY] ?? null);
          });
          return;
        }
      } catch (_error) {}

      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        resolve(raw ? JSON.parse(raw) : null);
        return;
      } catch (_error) {}

      resolve(null);
    });
  }

  function storageSet(data) {
    return new Promise((resolve) => {
      try {
        if (globalThis.chrome?.storage?.local) {
          chrome.storage.local.set({ [STORAGE_KEY]: data }, resolve);
          return;
        }
      } catch (_error) {}

      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (_error) {}
      resolve();
    });
  }

  async function updateData(mutator) {
    const draft = cloneData(state.data);
    const changed = mutator(draft);
    if (changed === false) return;
    state.data = normalizeData(draft);
    state.saveChain = state.saveChain.then(() => storageSet(state.data));
    await state.saveChain;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      "[" + GROUP_HOST_ATTR + "] { margin: 5px 0; padding: 2px; list-style: none; border: 1px solid color-mix(in srgb, var(--cgpt-group-color) 48%, transparent); border-radius: 10px; background: color-mix(in srgb, var(--cgpt-group-color) 13%, transparent); }",
      "[" + GROUP_HOST_ATTR + "] * { box-sizing: border-box; }",
      ".cgpt-chat-group__header { display: flex; align-items: center; min-height: 30px; gap: 4px; padding: 2px 5px 2px 7px; border-radius: 8px; background: color-mix(in srgb, var(--cgpt-group-color) 17%, transparent); color: inherit; }",
      ".cgpt-chat-group__toggle { min-width: 0; flex: 1; display: flex; align-items: center; gap: 7px; padding: 5px 2px; border: 0; background: transparent; color: inherit; font: inherit; font-size: 12px; font-weight: 650; text-align: left; cursor: pointer; }",
      ".cgpt-chat-group__chevron { width: 12px; color: var(--cgpt-group-color, currentColor); font-size: 13px; transition: transform .16s ease; }",
      "[" + GROUP_HOST_ATTR + "][data-cgpt-collapsed='1'] .cgpt-chat-group__chevron { transform: rotate(-90deg); }",
      ".cgpt-chat-group__icon { width: 17px; text-align: center; font-size: 14px; }",
      ".cgpt-chat-group__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".cgpt-chat-group__menu, .cgpt-chat-groups__add, .cgpt-organizer__control { border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }",
      ".cgpt-chat-group__menu { width: 26px; height: 26px; border-radius: 7px; color: rgba(127,127,127,.9); font-size: 17px; line-height: 1; opacity: .72; }",
      ".cgpt-chat-group__menu:hover, .cgpt-chat-groups__add:hover, .cgpt-organizer__control:hover { background: rgba(127,127,127,.16); opacity: 1; }",
      ".cgpt-chat-group__body { display: grid; gap: 1px; min-height: 4px; margin: 2px 0 1px; padding: 1px; border-radius: 7px; }",
      "[" + GROUP_HOST_ATTR + "][data-cgpt-collapsed='1'] .cgpt-chat-group__body { display: none; }",
      "[" + GROUP_HOST_ATTR + "].cgpt-organizer-is-drop-target { outline: 2px solid var(--cgpt-group-color); outline-offset: 2px; }",
      "[" + GROUP_HOST_ATTR + "].cgpt-organizer-is-drop-target .cgpt-chat-group__header { background: color-mix(in srgb, var(--cgpt-group-color) 30%, transparent); }",
      "[" + TOOLBAR_ATTR + "] { display: flex; align-items: center; justify-content: space-between; min-height: 27px; margin: 8px 4px 2px; color: rgba(127,127,127,.9); }",
      "[" + TOOLBAR_ATTR + "].cgpt-organizer-is-drop-target { border-radius: 7px; outline: 2px dashed rgba(127,127,127,.75); outline-offset: 2px; background: rgba(127,127,127,.14); }",
      ".cgpt-chat-groups__label { font-size: 11px; font-weight: 700; letter-spacing: .035em; text-transform: uppercase; }",
      ".cgpt-chat-groups__add { display: inline-flex; align-items: center; gap: 4px; padding: 4px 7px; border-radius: 7px; font-size: 11px; font-weight: 650; }",
      "[" + ROW_ATTR + "] { position: relative !important; border-radius: 8px; }",
      "[" + ROW_ATTR + "][data-cgpt-chat-color] { border: 1px solid color-mix(in srgb, var(--cgpt-chat-color) 52%, transparent) !important; background: color-mix(in srgb, var(--cgpt-chat-color) 22%, transparent) !important; }",
      "[" + ROW_ATTR + "][data-cgpt-chat-color] > a { background: transparent !important; }",
      "[" + ROW_ATTR + "][data-cgpt-chat-has-icon][data-cgpt-row-link] { padding-left: 29px !important; }",
      "[" + ROW_ATTR + "][data-cgpt-chat-has-icon]:not([data-cgpt-row-link]) a[href*='/c/'] { padding-left: 29px !important; }",
      "[" + ROW_ATTR + "][draggable='true'] { cursor: grab; }",
      "[" + ROW_ATTR + "].cgpt-organizer-is-dragging { opacity: .48; }",
      ".cgpt-organizer__icon { position: absolute; z-index: 5; top: 50%; left: 8px; display: flex; align-items: center; justify-content: center; width: 18px; height: 18px; margin: 0; transform: translateY(-50%); font-size: 14px; line-height: 1; pointer-events: none; }",
      ".cgpt-organizer__control { position: absolute; z-index: 4; top: 50%; right: 52px; width: 24px; height: 24px; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; border-radius: 7px; font-size: 13px; line-height: 1; opacity: 0; transition: opacity .14s ease, background .14s ease; }",
      "[" + ROW_ATTR + "]:hover .cgpt-organizer__control, .cgpt-organizer__control:focus-visible { opacity: .85; }",
      "[" + MENU_ATTR + "] { position: fixed; z-index: 2147483644; width: 284px; max-width: calc(100vw - 16px); max-height: min(520px, calc(100vh - 16px)); overflow: auto; padding: 10px; border: 1px solid rgba(127,127,127,.34); border-radius: 12px; background: Canvas; color: CanvasText; box-shadow: 0 16px 46px rgba(0,0,0,.32); font-family: ui-sans-serif, system-ui, sans-serif; }",
      ".cgpt-organizer-menu__title { margin: 0 0 8px; font-size: 12px; font-weight: 750; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }",
      ".cgpt-organizer-menu__section { margin-top: 10px; padding-top: 9px; border-top: 1px solid rgba(127,127,127,.24); }",
      ".cgpt-organizer-menu__label { display: block; margin-bottom: 6px; color: rgba(127,127,127,.95); font-size: 10px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase; }",
      ".cgpt-organizer-menu__select, .cgpt-organizer-menu__button { width: 100%; min-height: 31px; border: 1px solid rgba(127,127,127,.35); border-radius: 7px; background: transparent; color: inherit; font: inherit; font-size: 12px; text-align: left; }",
      ".cgpt-organizer-menu__select { padding: 0 8px; }",
      ".cgpt-organizer-menu__button { padding: 6px 8px; cursor: pointer; }",
      ".cgpt-organizer-menu__button:hover { background: rgba(127,127,127,.14); }",
      ".cgpt-organizer-menu__button.is-danger { color: #ef4444; }",
      ".cgpt-organizer-menu__swatches, .cgpt-organizer-menu__icons { display: grid; grid-template-columns: repeat(8, 1fr); gap: 5px; }",
      ".cgpt-organizer-menu__swatch, .cgpt-organizer-menu__icon { display: flex; align-items: center; justify-content: center; height: 28px; border: 1px solid rgba(127,127,127,.32); border-radius: 7px; background: transparent; color: inherit; cursor: pointer; }",
      ".cgpt-organizer-menu__swatch { width: 100%; }",
      ".cgpt-organizer-menu__swatch > span { width: 16px; height: 16px; border-radius: 99px; background: var(--cgpt-swatch-color, transparent); border: 1px solid rgba(127,127,127,.45); }",
      ".cgpt-organizer-menu__icon { font-size: 15px; }",
      ".cgpt-organizer-menu__swatch.is-selected, .cgpt-organizer-menu__icon.is-selected { outline: 2px solid var(--cgpt-menu-accent, #6366f1); outline-offset: 1px; }",
      ".cgpt-organizer-menu__empty { color: rgba(127,127,127,.9); font-size: 12px; }",
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function getConversationId(anchor) {
    try {
      const url = new URL(anchor.href, location.origin);
      return url.pathname.match(/\/c\/([^/?#]+)/u)?.[1] || null;
    } catch (_error) {
      return null;
    }
  }

  function isProjectChat(anchor, row) {
    try {
      const url = new URL(anchor.href, location.origin);
      if (/\/g\/[^/]+\/c\/[^/]+/u.test(url.pathname)) return true;
    } catch (_error) {}
    return Boolean(row?.closest?.("[data-project-id], [data-testid*='project' i]"));
  }

  function hasPinnedMarker(element) {
    let current = element;
    for (let depth = 0; current && depth < 5; depth += 1) {
      const marker = [
        current.getAttribute?.("data-testid"),
        current.getAttribute?.("aria-label"),
        current.id,
        current.className,
      ].filter(Boolean).join(" ");
      if (/(^|[-_\s])pinned?([-_\s]|$)|закрепл/iu.test(marker)) return true;
      current = current.parentElement;
    }
    return false;
  }

  function isNativePinned(anchor, row) {
    if (hasPinnedMarker(anchor) || hasPinnedMarker(row)) return true;
    let previous = row?.previousElementSibling || null;
    for (let index = 0; previous && index < 5; index += 1, previous = previous.previousElementSibling) {
      if (previous.querySelector?.("a[href*='/c/']")) break;
      if (/^(?:pinned(?: chats?)?|закрепл[её]нные(?: чаты)?)$/iu.test(normalizeText(previous.textContent))) {
        return true;
      }
    }
    return false;
  }

  function isLikelySidebarAnchor(anchor) {
    if (!anchor?.isConnected || anchor.closest("[" + MENU_ATTR + "]")) return false;
    if (anchor.closest("[role='dialog'], [role='menu'], [data-radix-popper-content-wrapper]")) return false;
    if (anchor.closest("aside, nav")) return true;
    const rect = anchor.getBoundingClientRect?.();
    return Boolean(rect && rect.width > 0 && rect.left < 430 && rect.width < 430);
  }

  function findChatRow(anchor) {
    let current = anchor.parentElement;
    for (let depth = 0; current && depth < 4; depth += 1) {
      const otherChats = current.querySelectorAll?.("a[href*='/c/']").length || 0;
      const testId = current.getAttribute?.("data-testid") || "";
      const hasRowControls = Boolean(
        current.querySelector?.(":scope > button, :scope > [role='button']"),
      );
      if (
        otherChats <= 1 &&
        (
          current.tagName === "LI" ||
          /conversation|chat/i.test(testId) ||
          (hasRowControls && current.firstElementChild?.matches?.("a[href*='/c/']"))
        )
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return anchor;
  }

  function collectChatInfos() {
    const seenRows = new Set();
    const infos = [];
    document.querySelectorAll("a[href*='/c/']").forEach((anchor) => {
      const id = getConversationId(anchor);
      if (!id || !isLikelySidebarAnchor(anchor)) return;
      const row = findChatRow(anchor);
      if (!row || seenRows.has(row)) return;
      seenRows.add(row);
      infos.push({
        id,
        anchor,
        row,
        title: normalizeText(anchor.textContent).slice(0, 160) || "Чат",
        project: isProjectChat(anchor, row),
        pinned: isNativePinned(anchor, row),
      });
    });
    return infos;
  }

  function getDirectToolbar(container) {
    return Array.from(container.children).find((child) => child.hasAttribute?.(TOOLBAR_ATTR)) || null;
  }

  function findChatContainer(infos) {
    const counts = new Map();
    infos.forEach(({ row }) => {
      const parent = row.parentElement;
      if (!parent || row.closest("[" + GROUP_HOST_ATTR + "]")) return;
      counts.set(parent, (counts.get(parent) || 0) + 1);
    });

    let best = null;
    let bestCount = 0;
    counts.forEach((count, parent) => {
      if (count > bestCount) {
        best = parent;
        bestCount = count;
      }
    });
    if (best) return best;

    const existingGroup = document.querySelector("[" + GROUP_HOST_ATTR + "]");
    return existingGroup?.parentElement || null;
  }

  function getDraggedChatId(event) {
    return state.draggedChatId || event?.dataTransfer?.getData("text/plain") || null;
  }

  function clearDragState() {
    state.draggedChatId = null;
    document.querySelectorAll(".cgpt-organizer-is-drop-target, .cgpt-organizer-is-dragging").forEach((element) => {
      element.classList.remove("cgpt-organizer-is-drop-target", "cgpt-organizer-is-dragging");
    });
  }

  async function moveChatToGroup(chatId, groupId) {
    if (!chatId) return;
    await updateData((draft) => {
      if (groupId && !draft.groups.some((group) => group.id === groupId)) {
        return false;
      }
      const chat = draft.chats[chatId] || { groupId: null, color: null, icon: null };
      if (chat.groupId === groupId) return false;
      chat.groupId = groupId;
      if (!chat.groupId && !chat.color && !chat.icon) {
        delete draft.chats[chatId];
      } else {
        draft.chats[chatId] = chat;
      }
    });
    scheduleRun();
  }

  function bindDropTarget(element, groupId) {
    const canAccept = (event) => Boolean(getDraggedChatId(event));
    element.addEventListener("dragenter", (event) => {
      if (!canAccept(event)) return;
      event.preventDefault();
      element.classList.add("cgpt-organizer-is-drop-target");
    });
    element.addEventListener("dragover", (event) => {
      if (!canAccept(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      element.classList.add("cgpt-organizer-is-drop-target");
    });
    element.addEventListener("dragleave", (event) => {
      if (!element.contains(event.relatedTarget)) {
        element.classList.remove("cgpt-organizer-is-drop-target");
      }
    });
    element.addEventListener("drop", (event) => {
      const chatId = getDraggedChatId(event);
      if (!chatId) return;
      event.preventDefault();
      clearDragState();
      void moveChatToGroup(chatId, groupId);
    });
  }

  function createToolbar() {
    const toolbar = document.createElement("div");
    toolbar.setAttribute(TOOLBAR_ATTR, "1");
    toolbar.title = "Перетащите чат сюда, чтобы убрать его из папки";
    toolbar.setAttribute("aria-label", "Перетащите сюда, чтобы убрать чат из папки");
    const label = document.createElement("span");
    label.className = "cgpt-chat-groups__label";
    label.textContent = "Папки";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "cgpt-chat-groups__add";
    add.textContent = "+ Новая";
    add.title = "Создать папку";
    add.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void createGroup();
    });
    toolbar.append(label, add);
    bindDropTarget(toolbar, null);
    return toolbar;
  }

  function ensureToolbar(container) {
    let toolbar = getDirectToolbar(container);
    if (!toolbar) {
      toolbar = createToolbar();
      container.prepend(toolbar);
    }
    return toolbar;
  }

  function makeGroupHost(group, container) {
    const host = document.createElement(
      /^(?:UL|OL)$/u.test(container?.tagName || "") ? "li" : "div",
    );
    host.setAttribute(GROUP_HOST_ATTR, group.id);

    const header = document.createElement("div");
    header.className = "cgpt-chat-group__header";
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cgpt-chat-group__toggle";
    const chevron = document.createElement("span");
    chevron.className = "cgpt-chat-group__chevron";
    chevron.textContent = "⌄";
    const icon = document.createElement("span");
    icon.className = "cgpt-chat-group__icon";
    const name = document.createElement("span");
    name.className = "cgpt-chat-group__name";
    toggle.append(chevron, icon, name);
    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void updateData((draft) => {
        const target = draft.groups.find((item) => item.id === group.id);
        if (!target) return false;
        target.collapsed = !target.collapsed;
      }).then(scheduleRun);
    });

    const menuButton = document.createElement("button");
    menuButton.type = "button";
    menuButton.className = "cgpt-chat-group__menu";
    menuButton.textContent = "⋯";
    menuButton.title = "Настроить папку";
    menuButton.setAttribute("aria-label", "Настроить папку");
    menuButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      openGroupMenu(group.id, event.currentTarget);
    });

    const body = document.createElement("div");
    body.className = "cgpt-chat-group__body";
    body.setAttribute(GROUP_BODY_ATTR, group.id);
    header.append(toggle, menuButton);
    host.append(header, body);
    bindDropTarget(host, group.id);
    return host;
  }

  function getGroupHost(container, group) {
    let host = Array.from(container.children).find(
      (child) => child.getAttribute?.(GROUP_HOST_ATTR) === group.id,
    );
    if (!host) {
      host = makeGroupHost(group, container);
      container.appendChild(host);
    }
    host.style.setProperty("--cgpt-group-color", group.color);
    host.setAttribute("data-cgpt-collapsed", group.collapsed ? "1" : "0");
    host.querySelector(".cgpt-chat-group__icon").textContent = group.icon;
    host.querySelector(".cgpt-chat-group__name").textContent = group.name;
    const body = host.querySelector("[" + GROUP_BODY_ATTR + "]");
    return { host, body };
  }

  function installRowDrag(info) {
    const { row } = info;
    row.draggable = !info.pinned;
    if (row.getAttribute("data-cgpt-drag-ready") === "1") return;
    row.setAttribute("data-cgpt-drag-ready", "1");
    row.addEventListener("dragstart", (event) => {
      const chatId = row.dataset.cgptChatId;
      if (!chatId || row.draggable === false) {
        event.preventDefault();
        return;
      }
      state.draggedChatId = chatId;
      row.classList.add("cgpt-organizer-is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", chatId);
      }
    });
    row.addEventListener("dragend", clearDragState);
  }

  function updateChatDecoration(info, chat, group) {
    const { row } = info;
    row.setAttribute(ROW_ATTR, info.id);
    row.dataset.cgptChatId = info.id;
    row.toggleAttribute("data-cgpt-row-link", row.tagName === "A");
    const color = chat?.color || group?.color || null;
    if (color) {
      row.setAttribute("data-cgpt-chat-color", "1");
      row.style.setProperty("--cgpt-chat-color", color);
    } else {
      row.removeAttribute("data-cgpt-chat-color");
      row.style.removeProperty("--cgpt-chat-color");
    }

    let icon = row.querySelector(":scope > .cgpt-organizer__icon");
    const iconValue = chat?.icon || null;
    if (iconValue) {
      if (!icon) {
        icon = document.createElement("span");
        icon.className = "cgpt-organizer__icon";
        icon.setAttribute("aria-hidden", "true");
        row.insertBefore(icon, row.firstChild);
      }
      row.setAttribute("data-cgpt-chat-has-icon", "1");
      icon.textContent = iconValue;
      icon.title = "Иконка чата";
    } else if (icon) {
      icon.remove();
      row.removeAttribute("data-cgpt-chat-has-icon");
    } else {
      row.removeAttribute("data-cgpt-chat-has-icon");
    }

    let control = row.querySelector(":scope > [" + CONTROL_ATTR + "]");
    if (!control) {
      control = document.createElement("button");
      control.type = "button";
      control.className = "cgpt-organizer__control";
      control.setAttribute(CONTROL_ATTR, "1");
      control.textContent = "✦";
      control.title = "Папка, цвет и иконка";
      control.setAttribute("aria-label", "Папка, цвет и иконка");
      control.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      control.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openChatMenu(info.id, info.title, event.currentTarget);
      });
      row.appendChild(control);
    }
    installRowDrag(info);
  }

  function restoreToContainer(row, container) {
    if (!row?.isConnected || !container || row.parentElement === container) return;
    container.appendChild(row);
  }

  function removeOrphanHosts(container) {
    const validIds = new Set(state.data.groups.map((group) => group.id));
    Array.from(container.children)
      .filter((child) => child.hasAttribute?.(GROUP_HOST_ATTR))
      .forEach((host) => {
        const id = host.getAttribute(GROUP_HOST_ATTR);
        if (validIds.has(id)) return;
        const body = host.querySelector("[" + GROUP_BODY_ATTR + "]");
        Array.from(body?.children || []).forEach((row) => container.appendChild(row));
        host.remove();
      });
  }

  async function removeProjectAssignments(infos) {
    const projectIds = infos.filter((info) => info.project).map((info) => info.id);
    if (!projectIds.length) return;
    const removable = projectIds.filter((id) => state.data.chats[id]);
    if (!removable.length) return;
    await updateData((draft) => {
      removable.forEach((id) => delete draft.chats[id]);
    });
  }

  async function render() {
    ensureStyle();
    const infos = collectChatInfos();
    await removeProjectAssignments(infos);
    const container = findChatContainer(infos);
    if (!container) return;

    const toolbar = ensureToolbar(container);
    removeOrphanHosts(container);
    let insertionPoint = toolbar.nextSibling;
    const groupsById = new Map();
    state.data.groups.forEach((group) => {
      const groupHost = getGroupHost(container, group);
      groupsById.set(group.id, groupHost);
      if (groupHost.host !== insertionPoint) {
        container.insertBefore(groupHost.host, insertionPoint);
      }
      insertionPoint = groupHost.host.nextSibling;
    });

    infos.forEach((info) => {
      if (info.project) return;
      const chat = state.data.chats[info.id] || null;
      const group = chat?.groupId
        ? state.data.groups.find((item) => item.id === chat.groupId) || null
        : null;
      updateChatDecoration(info, chat, group);
      if (group && !info.pinned) {
        const body = groupsById.get(group.id)?.body;
        if (body && info.row.parentElement !== body) body.appendChild(info.row);
      } else {
        restoreToContainer(info.row, container);
      }
    });
  }

  function closeMenu() {
    if (!state.menu) return;
    state.menu.remove();
    state.menu = null;
  }

  function createMenu(title) {
    closeMenu();
    const menu = document.createElement("div");
    menu.setAttribute(MENU_ATTR, "1");
    menu.setAttribute("role", "dialog");
    const heading = document.createElement("p");
    heading.className = "cgpt-organizer-menu__title";
    heading.textContent = title;
    menu.appendChild(heading);
    document.body.appendChild(menu);
    state.menu = menu;
    return menu;
  }

  function positionMenu(menu, anchor) {
    const rect = anchor?.getBoundingClientRect?.();
    const menuRect = menu.getBoundingClientRect();
    const preferredLeft = rect ? rect.right - menuRect.width : 8;
    const preferredTop = rect ? rect.bottom + 6 : 8;
    const left = Math.max(8, Math.min(preferredLeft, window.innerWidth - menuRect.width - 8));
    const top = Math.max(8, Math.min(preferredTop, window.innerHeight - menuRect.height - 8));
    menu.style.left = left + "px";
    menu.style.top = top + "px";
  }

  function createSection(menu, label) {
    const section = document.createElement("section");
    section.className = "cgpt-organizer-menu__section";
    const heading = document.createElement("span");
    heading.className = "cgpt-organizer-menu__label";
    heading.textContent = label;
    section.appendChild(heading);
    menu.appendChild(section);
    return section;
  }

  function createAction(text, handler, danger) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cgpt-organizer-menu__button" + (danger ? " is-danger" : "");
    button.textContent = text;
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      handler();
    });
    return button;
  }

  function addPalette(section, selectedColor, selectedIcon, onColor, onIcon) {
    const colors = document.createElement("div");
    colors.className = "cgpt-organizer-menu__swatches";
    const noColor = document.createElement("button");
    noColor.type = "button";
    noColor.className = "cgpt-organizer-menu__swatch" + (!selectedColor ? " is-selected" : "");
    noColor.title = "Без цвета";
    noColor.textContent = "×";
    noColor.addEventListener("click", () => onColor(null));
    colors.appendChild(noColor);
    COLORS.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cgpt-organizer-menu__swatch" + (selectedColor === item.value ? " is-selected" : "");
      button.title = item.label;
      const dot = document.createElement("span");
      dot.style.setProperty("--cgpt-swatch-color", item.value);
      button.appendChild(dot);
      button.addEventListener("click", () => onColor(item.value));
      colors.appendChild(button);
    });
    section.appendChild(colors);

    const iconSection = createSection(section.parentElement, "Иконка");
    const icons = document.createElement("div");
    icons.className = "cgpt-organizer-menu__icons";
    const noIcon = document.createElement("button");
    noIcon.type = "button";
    noIcon.className = "cgpt-organizer-menu__icon" + (!selectedIcon ? " is-selected" : "");
    noIcon.title = "Без иконки";
    noIcon.textContent = "×";
    noIcon.addEventListener("click", () => onIcon(null));
    icons.appendChild(noIcon);
    ICONS.forEach((icon) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "cgpt-organizer-menu__icon" + (selectedIcon === icon ? " is-selected" : "");
      button.textContent = icon;
      button.title = icon;
      button.addEventListener("click", () => onIcon(icon));
      icons.appendChild(button);
    });
    iconSection.appendChild(icons);
  }

  function openChatMenu(chatId, title, anchor) {
    const chat = state.data.chats[chatId] || { groupId: null, color: null, icon: null };
    const menu = createMenu(title);

    const groupSection = createSection(menu, "Папка");
    const select = document.createElement("select");
    select.className = "cgpt-organizer-menu__select";
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "Без папки";
    select.appendChild(none);
    state.data.groups.forEach((group) => {
      const option = document.createElement("option");
      option.value = group.id;
      option.textContent = group.icon + " " + group.name;
      select.appendChild(option);
    });
    select.value = chat.groupId || "";
    select.addEventListener("change", () => {
      const groupId = select.value || null;
      void updateData((draft) => {
        const current = draft.chats[chatId] || { groupId: null, color: null, icon: null };
        current.groupId = groupId;
        draft.chats[chatId] = current;
      }).then(() => {
        closeMenu();
        scheduleRun();
      });
    });
    groupSection.appendChild(select);
    groupSection.appendChild(createAction("Создать папку", () => {
      void createGroup(chatId);
    }));

    const colorSection = createSection(menu, "Цвет");
    addPalette(
      colorSection,
      chat.color,
      chat.icon,
      (color) => {
        void updateData((draft) => {
          const current = draft.chats[chatId] || { groupId: null, color: null, icon: null };
          current.color = color;
          draft.chats[chatId] = current;
        }).then(() => {
          closeMenu();
          scheduleRun();
        });
      },
      (icon) => {
        void updateData((draft) => {
          const current = draft.chats[chatId] || { groupId: null, color: null, icon: null };
          current.icon = icon;
          draft.chats[chatId] = current;
        }).then(() => {
          closeMenu();
          scheduleRun();
        });
      },
    );

    const actions = createSection(menu, "Действия");
    actions.appendChild(createAction("Убрать папку, цвет и иконку", () => {
      void updateData((draft) => {
        delete draft.chats[chatId];
      }).then(() => {
        closeMenu();
        scheduleRun();
      });
    }, true));
    positionMenu(menu, anchor);
  }

  function openGroupMenu(groupId, anchor) {
    const group = state.data.groups.find((item) => item.id === groupId);
    if (!group) return;
    const menu = createMenu(group.icon + " " + group.name);
    const colorSection = createSection(menu, "Цвет папки");
    addPalette(
      colorSection,
      group.color,
      group.icon,
      (color) => {
        if (!color) return;
        void updateData((draft) => {
          const current = draft.groups.find((item) => item.id === groupId);
          if (!current) return false;
          current.color = color;
        }).then(() => {
          closeMenu();
          scheduleRun();
        });
      },
      (icon) => {
        if (!icon) return;
        void updateData((draft) => {
          const current = draft.groups.find((item) => item.id === groupId);
          if (!current) return false;
          current.icon = icon;
        }).then(() => {
          closeMenu();
          scheduleRun();
        });
      },
    );
    const actions = createSection(menu, "Действия");
    actions.appendChild(createAction("Переименовать папку", () => {
      const name = askGroupName(group.name);
      if (!name) return;
      void updateData((draft) => {
        const current = draft.groups.find((item) => item.id === groupId);
        if (!current) return false;
        current.name = name;
      }).then(() => {
        closeMenu();
        scheduleRun();
      });
    }));
    actions.appendChild(createAction("Удалить папку", () => {
      const confirmed = window.confirm(
        "Удалить папку «" + group.name + "»? Чаты останутся, но выйдут из этой папки.",
      );
      if (!confirmed) return;
      void updateData((draft) => {
        draft.groups = draft.groups.filter((item) => item.id !== groupId);
        Object.values(draft.chats).forEach((chat) => {
          if (chat.groupId === groupId) chat.groupId = null;
        });
      }).then(() => {
        closeMenu();
        scheduleRun();
      });
    }, true));
    positionMenu(menu, anchor);
  }

  function askGroupName(defaultValue) {
    const name = window.prompt("Название папки", defaultValue || "Новая папка");
    return normalizeText(name).slice(0, MAX_NAME_LENGTH);
  }

  async function createGroup(assignChatId) {
    const name = askGroupName("Новая папка");
    if (!name) return;
    const group = {
      id: makeId("folder"),
      name,
      color: "#6366f1",
      icon: "📁",
      collapsed: false,
    };
    await updateData((draft) => {
      draft.groups.push(group);
      if (assignChatId) {
        const chat = draft.chats[assignChatId] || { groupId: null, color: null, icon: null };
        chat.groupId = group.id;
        draft.chats[assignChatId] = chat;
      }
    });
    closeMenu();
    scheduleRun();
  }

  function findEventChatId(target) {
    const row = target?.closest?.("[" + ROW_ATTR + "]");
    if (row?.dataset?.cgptChatId) return row.dataset.cgptChatId;
    const anchor = target?.closest?.("a[href*='/c/']");
    return anchor ? getConversationId(anchor) : null;
  }

  function isNativeDestructiveAction(target) {
    const text = normalizeText([
      target?.getAttribute?.("aria-label"),
      target?.getAttribute?.("title"),
      target?.textContent,
    ].filter(Boolean).join(" "));
    return /(?:delete\s+(?:chat|conversation)|удалить\s+(?:чат|разговор)|(?:move|add).{0,30}project|(?:переместить|добавить).{0,30}проект)/iu.test(text);
  }

  function scheduleNativeActionCheck(chatId) {
    if (!chatId || !state.data.chats[chatId]) return;
    window.clearTimeout(state.nativeActionTimers.get(chatId));
    const timer = window.setTimeout(() => {
      state.nativeActionTimers.delete(chatId);
      const infos = collectChatInfos();
      const current = infos.find((info) => info.id === chatId);
      if (!current || current.project) {
        void updateData((draft) => {
          delete draft.chats[chatId];
        }).then(scheduleRun);
      }
    }, 1600);
    state.nativeActionTimers.set(chatId, timer);
  }

  function handlePointerDown(event) {
    const chatId = findEventChatId(event.target);
    if (chatId) state.lastChatId = chatId;
  }

  function handleDocumentClick(event) {
    if (event.target?.closest?.("[" + MENU_ATTR + "]")) return;
    if (isNativeDestructiveAction(event.target)) {
      scheduleNativeActionCheck(state.lastChatId || findEventChatId(event.target));
    }
  }

  function scheduleRun() {
    if (state.timer) return;
    state.timer = window.setTimeout(async () => {
      state.timer = 0;
      if (state.running) {
        state.pendingRun = true;
        return;
      }
      state.running = true;
      try {
        await render();
      } finally {
        state.running = false;
        if (state.pendingRun) {
          state.pendingRun = false;
          scheduleRun();
        }
      }
    }, 90);
  }

  function start() {
    ensureStyle();
    scheduleRun();
    state.observer = new MutationObserver(scheduleRun);
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("pointerdown", (event) => {
      if (state.menu && !event.target.closest("[" + MENU_ATTR + "]") && !event.target.closest("[" + CONTROL_ATTR + "]")) {
        closeMenu();
      }
    }, true);
    window.addEventListener("pageshow", scheduleRun, PASSIVE);
    window.addEventListener("popstate", scheduleRun, PASSIVE);
    window.addEventListener("resize", scheduleRun, PASSIVE);

    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local" || !Object.prototype.hasOwnProperty.call(changes, STORAGE_KEY)) return;
        state.data = normalizeData(changes[STORAGE_KEY].newValue);
        scheduleRun();
      });
    } catch (_error) {}
  }

  globalThis[BOOT_KEY] = { scheduleRun };
  state.data = normalizeData(await storageGet());
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
