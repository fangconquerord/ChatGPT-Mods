(() => {
  "use strict";

  if (globalThis.CGPT_FEATURE_SETTINGS) return;

  const SETTINGS_KEY = "cgptFeatureSettings";
  const DEFAULTS = {
    splitView: true,
    fileInfo: true,
    promptEnhancer: true,
    tempChat: true,
    chatOrganizer: true,
    chatExport: true,
  };

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
      try {
        if (globalThis.chrome?.storage?.sync) {
          chrome.storage.sync.get([SETTINGS_KEY], (result) => {
            resolve(mergeSettings(result?.[SETTINGS_KEY]));
          });
          return;
        }
      } catch (_error) {}

      try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        resolve(mergeSettings(raw ? JSON.parse(raw) : null));
        return;
      } catch (_error) {}

      resolve({ ...DEFAULTS });
    });
  }

  async function isEnabled(key) {
    const settings = await getSettings();
    return settings[key] !== false;
  }

  globalThis.CGPT_FEATURE_SETTINGS = {
    DEFAULTS,
    SETTINGS_KEY,
    getSettings,
    isEnabled,
  };
})();
