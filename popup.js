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
    title: "保存聊天",
    desc: "将当前聊天导出为 PDF、Word 或 TXT",
  },
  {
    key: "splitView",
    title: "分屏视图",
    desc: "在同一屏幕中并排打开两个聊天",
  },
  {
    key: "fileInfo",
    title: "文件信息",
    desc: "显示附件提示和消息元数据",
  },
  {
    key: "promptEnhancer",
    title: "优化提示词",
    desc: "在输入框旁使用本地 Prompt Compiler",
  },
  {
    key: "tempChat",
    title: "保存临时聊天",
    desc: "将临时聊天内容迁移到普通聊天",
  },
];

FEATURES.push({
  key: "chatOrganizer",
  title: "聊天文件夹与外观",
  desc: "在侧边栏中使用本地文件夹、颜色和图标整理聊天",
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
      statusEl.textContent = "设置已保存，正在刷新 ChatGPT 页面。";
      return;
    }

    statusEl.textContent = "设置已保存。";
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

      statusEl.textContent = "正在保存...";
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
      "确定删除所有自定义文件夹、聊天颜色和图标吗？此操作无法撤销。",
    );
    if (!confirmed) return;

    resetButton.disabled = true;
    statusEl.textContent = "正在删除文件夹设置...";
    await resetChatOrganizer();
    resetButton.disabled = false;
    statusEl.textContent = "文件夹、颜色和图标已删除。";
  });

  statusEl.textContent = "";
}

void init();
