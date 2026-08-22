(() => {
  "use strict";

  const BOOT_KEY = "__cgptModsZhCNPerfFix__";
  if (globalThis[BOOT_KEY]) return;

  const zhState = globalThis.__cgptModsZhCN__;
  if (!zhState) return;

  const HOST_SELECTOR = '[data-cgpt-composer-files="1"]';
  const NATIVE_ATTACHMENT_TRAY_ATTR = "data-cgpt-native-attachment-tray";
  const TRAY_SELECTOR = `[${NATIVE_ATTACHMENT_TRAY_ATTR}="1"]`;
  const LABEL_SELECTOR = "[aria-label], [title]";
  const ATTACHMENT_LIMIT = 10;

  // The original compatibility observer watches the entire ChatGPT DOM for
  // child and aria/title mutations, then rescans the whole document. During a
  // streamed long answer this can become increasingly expensive. Disconnect it
  // immediately and replace it with incremental, attachment-scoped observers.
  try {
    zhState.attachmentCompatObserver?.disconnect?.();
  } catch (_error) {}

  let host = null;
  let tray = null;
  let hostObserver = null;
  let trayObserver = null;
  let frame = 0;

  function canonicalAttachmentName(value) {
    return (value || "")
      .replace(/^(?:移除|删除|刪除)\s*(?:文件|附件)?\s*\d*\s*[：:]\s*/u, "")
      .trim();
  }

  function normalizeLabelElement(element) {
    if (!(element instanceof Element)) return;

    for (const attribute of ["aria-label", "title"]) {
      const current = element.getAttribute(attribute) || "";
      if (!current.includes("：")) continue;
      if (!/^(?:移除|删除|刪除).+\.[a-zA-Z0-9]{1,6}$/u.test(current)) continue;
      element.setAttribute(attribute, current.replace(/：/gu, ":"));
    }
  }

  function normalizeLabelsIn(root) {
    if (!(root instanceof Element)) return;
    if (root.matches(LABEL_SELECTOR)) normalizeLabelElement(root);
    root.querySelectorAll(LABEL_SELECTOR).forEach(normalizeLabelElement);
  }

  function collectAttachmentNames(targetHost) {
    const rawNames = [];
    const items = Array.isArray(targetHost?._cgptAttachmentItems)
      ? targetHost._cgptAttachmentItems
      : [];

    for (const item of items) {
      if (item?.name) rawNames.push(item.name);
    }

    if (!rawNames.length && targetHost?.querySelectorAll) {
      targetHost
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

  function refreshHost(targetHost = host) {
    if (!(targetHost instanceof Element) || !targetHost.isConnected) return;

    normalizeLabelsIn(targetHost);

    const names = collectAttachmentNames(targetHost);
    const count = targetHost.querySelector(".cgpt-composer-files__count");
    if (!count) return;

    count.textContent = `${names.length}/${ATTACHMENT_LIMIT}`;
    count.classList.toggle("is-over-limit", names.length > ATTACHMENT_LIMIT);
  }

  function refreshScoped() {
    frame = 0;

    if (host?.isConnected) refreshHost(host);
    if (tray?.isConnected) normalizeLabelsIn(tray);
  }

  function scheduleRefresh() {
    if (frame) return;
    frame = requestAnimationFrame(refreshScoped);
  }

  function createScopedObserver(target) {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          normalizeLabelElement(mutation.target);
          continue;
        }

        for (const node of mutation.addedNodes) {
          if (node instanceof Element) normalizeLabelsIn(node);
        }
      }

      scheduleRefresh();
    });

    observer.observe(target, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-label", "title"]
    });

    return observer;
  }

  function attachHost(nextHost) {
    if (!(nextHost instanceof Element)) return;
    if (host === nextHost && host.isConnected) return;

    hostObserver?.disconnect();
    host = nextHost;
    normalizeLabelsIn(host);
    refreshHost(host);
    hostObserver = createScopedObserver(host);
  }

  function attachTray(nextTray) {
    if (!(nextTray instanceof Element)) return;
    if (tray === nextTray && tray.isConnected) return;

    trayObserver?.disconnect();
    tray = nextTray;
    normalizeLabelsIn(tray);
    trayObserver = createScopedObserver(tray);
  }

  function discoverWithin(root) {
    if (!(root instanceof Element) && root !== document) return;

    if (!host?.isConnected) {
      const nextHost =
        root instanceof Element && root.matches(HOST_SELECTOR)
          ? root
          : root.querySelector?.(HOST_SELECTOR);
      if (nextHost) attachHost(nextHost);
    }

    if (!tray?.isConnected) {
      const nextTray =
        root instanceof Element && root.matches(TRAY_SELECTOR)
          ? root
          : root.querySelector?.(TRAY_SELECTOR);
      if (nextTray) attachTray(nextTray);
    }
  }

  // This locator observer still sees page mutations, but it performs no full
  // document scans. It only inspects newly-added subtrees and the rare native
  // attachment-tray marker so dynamic composer replacement continues to work.
  const locatorObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (mutation.target instanceof Element && mutation.target.matches(TRAY_SELECTOR)) {
          attachTray(mutation.target);
        }
        continue;
      }

      for (const node of mutation.addedNodes) {
        if (!(node instanceof Element)) continue;
        discoverWithin(node);
      }
    }

    if (!host?.isConnected || !tray?.isConnected) {
      scheduleRefresh();
    }
  });

  locatorObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [NATIVE_ATTACHMENT_TRAY_ATTR]
  });

  discoverWithin(document);

  function refreshAttachmentCompat() {
    if (!host?.isConnected || !tray?.isConnected) discoverWithin(document);
    refreshScoped();
  }

  // Preserve the public compatibility surface for any other extension module.
  zhState.attachmentCompatObserver = locatorObserver;
  zhState.refreshAttachmentCompat = refreshAttachmentCompat;

  globalThis[BOOT_KEY] = {
    locatorObserver,
    get hostObserver() {
      return hostObserver;
    },
    get trayObserver() {
      return trayObserver;
    },
    refresh: refreshAttachmentCompat
  };
})();
