(() => {
  "use strict";

  const BOOT_KEY = "__cgptModsPerformanceGuard__";
  if (globalThis[BOOT_KEY]) return;

  const NativeMutationObserver = globalThis.MutationObserver;
  if (typeof NativeMutationObserver !== "function") return;

  const MESSAGE_SELECTOR = [
    "[data-message-author-role]",
    '[data-testid*="conversation-turn" i]',
    '[data-testid*="turn" i]'
  ].join(",");

  const STRUCTURAL_SELECTOR = [
    "pre",
    "button",
    "form",
    "nav",
    "aside",
    "header",
    '[role="button"]',
    '[data-message-author-role]',
    '[data-testid*="conversation-turn" i]',
    '[data-testid*="copy" i]',
    '[data-testid*="attach" i]',
    '[data-testid*="upload" i]',
    '[id^="cgpt-"]',
    '[class*="cgpt-"]',
    '[data-cgpt-chat-export-control]',
    '[data-cgpt-chat-export-snippet]',
    '[data-cgpt-composer-files]'
  ].join(",");

  const stats = {
    seenMutations: 0,
    forwardedMutations: 0,
    suppressedMutations: 0,
    forwardedBatches: 0,
    suppressedBatches: 0
  };

  function isElementLike(node) {
    return Boolean(node && node.nodeType === 1 && typeof node.matches === "function");
  }

  function asElement(node) {
    if (isElementLike(node)) return node;
    const parent = node?.parentElement;
    return isElementLike(parent) ? parent : null;
  }

  function safeClosest(element, selector) {
    try {
      return element?.closest?.(selector) || null;
    } catch (_error) {
      return null;
    }
  }

  function isInsideMessage(node) {
    return Boolean(safeClosest(asElement(node), MESSAGE_SELECTOR));
  }

  function addedNodeHasStructuralInterest(node) {
    if (!isElementLike(node)) return false;
    try {
      if (node.matches(STRUCTURAL_SELECTOR)) return true;
      return Boolean(node.querySelector?.(STRUCTURAL_SELECTOR));
    } catch (_error) {
      return true;
    }
  }

  function shouldSuppressMutation(mutation) {
    if (!mutation || !isInsideMessage(mutation.target)) return false;

    // ChatGPT streams assistant output through frequent text/markdown mutations.
    // Extension modules that watch the whole page do not need those token-level
    // updates. Preserve structural controls and new conversation turns, while
    // suppressing ordinary text/layout churn inside an existing message.
    if (mutation.type === "attributes") return true;
    if (mutation.type === "characterData") return true;
    if (mutation.type !== "childList") return false;

    for (const node of mutation.addedNodes || []) {
      if (addedNodeHasStructuralInterest(node)) return false;
    }

    return true;
  }

  function filterMutations(mutations) {
    const forwarded = [];

    for (const mutation of mutations || []) {
      stats.seenMutations += 1;
      if (shouldSuppressMutation(mutation)) {
        stats.suppressedMutations += 1;
      } else {
        stats.forwardedMutations += 1;
        forwarded.push(mutation);
      }
    }

    return forwarded;
  }

  class GuardedMutationObserver {
    constructor(callback) {
      if (typeof callback !== "function") {
        throw new TypeError("MutationObserver callback must be a function");
      }

      this._callback = callback;
      this._observer = new NativeMutationObserver((mutations) => {
        const forwarded = filterMutations(mutations);
        if (!forwarded.length) {
          stats.suppressedBatches += 1;
          return;
        }

        stats.forwardedBatches += 1;
        callback(forwarded, this);
      });
    }

    observe(target, options) {
      return this._observer.observe(target, options);
    }

    disconnect() {
      return this._observer.disconnect();
    }

    takeRecords() {
      return filterMutations(this._observer.takeRecords());
    }
  }

  try {
    Object.defineProperty(GuardedMutationObserver, "name", {
      value: "MutationObserver"
    });
  } catch (_error) {}

  try {
    Object.defineProperty(globalThis, "MutationObserver", {
      configurable: true,
      writable: true,
      value: GuardedMutationObserver
    });
  } catch (_error) {
    globalThis.MutationObserver = GuardedMutationObserver;
  }

  globalThis[BOOT_KEY] = {
    NativeMutationObserver,
    getStats() {
      return { ...stats };
    },
    resetStats() {
      Object.keys(stats).forEach((key) => {
        stats[key] = 0;
      });
    }
  };
})();
