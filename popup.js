"use strict";

const SETTINGS_KEY = "cgptFeatureSettings";
const CHAT_ORGANIZER_STORAGE_KEY = "cgptChatOrganizer";
const DEFAULTS = {
  splitView: true,
  fileInfo: true,
  promptEnhancer: true,
  tempChat: true,
  chatOrganizer: true,
  chatExport: true,
};

const FEATURES = [
  {
    key: "chatExport",
    title: "Сохранение чата",
    desc: "Экспорт текущего чата в PDF, Word или TXT",
  },
  {
    key: "splitView",
    title: "Split",
    desc: "Два чата рядом на одном экране",
  },
  {
    key: "fileInfo",
    title: "Информация о файлах",
    desc: "Подсказки по вложениям и метаданные сообщений",
  },
  {
    key: "promptEnhancer",
    title: "Улучшение запроса",
    desc: "Локальный Prompt Compiler рядом с полем ввода",
  },
  {
    key: "tempChat",
    title: "Сохранение временного чата",
    desc: "Перенос временного диалога в обычный чат",
  },
];

FEATURES.push({
  key: "chatOrganizer",
  title: "Папки и оформление чатов",
  desc: "Локальные группы, цвета и иконки в боковом списке",
});

const listEl = document.getElementById("settings-list");
const statusEl = document.getElementById("status");
let currentSettings = { ...DEFAULTS };
let reloadTimer = 0;

function mergeSettings(value) {
  const settings = { ...DEFAULTS };
  if (!value || typeof value !== "object") return settings;

  Object.keys(DEFAULTS).forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      settings[key] = value[key];
    }
  });

  return settings;
}

function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get([SETTINGS_KEY], (result) => {
      resolve(mergeSettings(result?.[SETTINGS_KEY]));
    });
  });
}

function setSettings(nextSettings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: nextSettings }, resolve);
  });
}

function resetChatOrganizer() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([CHAT_ORGANIZER_STORAGE_KEY], resolve);
  });
}

function getActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs?.[0] || null);
    });
  });
}

function isChatGptTab(tab) {
  return /^https:\/\/chatgpt\.com(\/|$)/i.test(tab?.url || "");
}

function scheduleChatGptReload() {
  if (reloadTimer) window.clearTimeout(reloadTimer);

  reloadTimer = window.setTimeout(async () => {
    reloadTimer = 0;
    const tab = await getActiveTab();

    if (isChatGptTab(tab) && tab.id !== undefined) {
      chrome.tabs.reload(tab.id);
      statusEl.textContent = "Настройки сохранены. Страница ChatGPT обновляется.";
      return;
    }

    statusEl.textContent = "Настройки сохранены.";
  }, 450);
}

function render(settings) {
  listEl.textContent = "";

  FEATURES.forEach((feature) => {
    const row = document.createElement("label");
    row.className = "setting";

    const textWrap = document.createElement("span");
    const title = document.createElement("span");
    const desc = document.createElement("span");

    title.className = "setting-title";
    title.textContent = feature.title;
    desc.className = "setting-desc";
    desc.textContent = feature.desc;

    textWrap.appendChild(title);
    textWrap.appendChild(desc);

    const toggle = document.createElement("span");
    toggle.className = "toggle";

    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = settings[feature.key] !== false;
    input.dataset.key = feature.key;
    input.setAttribute("aria-label", feature.title);

    const slider = document.createElement("span");
    slider.className = "slider";

    input.addEventListener("change", async () => {
      const key = input.dataset.key;
      currentSettings = {
        ...currentSettings,
        [key]: input.checked,
      };

      statusEl.textContent = "Сохраняю...";
      await setSettings(currentSettings);
      scheduleChatGptReload();
    });

    toggle.appendChild(input);
    toggle.appendChild(slider);
    row.appendChild(textWrap);
    row.appendChild(toggle);
    listEl.appendChild(row);
  });
}

async function init() {
  currentSettings = await getSettings();
  render(currentSettings);

  const resetButton = document.getElementById("reset-chat-organizer");
  resetButton?.addEventListener("click", async () => {
    const confirmed = window.confirm(
      "Удалить все пользовательские папки, цвета и иконки чатов? Это действие нельзя отменить.",
    );
    if (!confirmed) return;

    resetButton.disabled = true;
    statusEl.textContent = "Удаляю настройки папок...";
    await resetChatOrganizer();
    resetButton.disabled = false;
    statusEl.textContent = "Папки, цвета и иконки удалены.";
  });

  statusEl.textContent = "";
}

void init();
