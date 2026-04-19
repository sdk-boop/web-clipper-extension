// background.js

const CLIPS_KEY = "webClipperClippings";
const CATS_KEY  = "webClipperCategories";

// ── Keyboard shortcuts ────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === "take-screenshot") {
    triggerInTab(tab.id, () => {
      if (typeof window.__wcStartScreenshot === "function") window.__wcStartScreenshot();
    });
  }
  if (command === "capture-clipboard") {
    triggerInTab(tab.id, () => {
      if (typeof window.__wcCaptureClipboard === "function") window.__wcCaptureClipboard();
    });
  }
});

function triggerInTab(tabId, fn) {
  chrome.scripting.executeScript({ target: { tabId }, func: fn })
    .catch(() => {}); // ignore if tab can't be scripted (e.g. chrome:// pages)
}

// ── Messages ──────────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {

  if (msg.type === "START_SCREENSHOT") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) triggerInTab(tab.id, () => {
        if (typeof window.__wcStartScreenshot === "function") window.__wcStartScreenshot();
      });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "TRIGGER_PDF_CAPTURE") {
    // Called from popup when on a PDF page — triggers clipboard read in the tab
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) triggerInTab(tab.id, () => {
        if (typeof window.__wcCaptureClipboard === "function") window.__wcCaptureClipboard();
      });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === "CAPTURE_AREA") {
    chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        sendResponse({ error: chrome.runtime.lastError.message }); return;
      }
      sendResponse({ dataUrl });
    });
    return true;
  }

  if (msg.type === "GET_CURRENT_TAB_URL") {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      sendResponse({ url: tab ? tab.url : "" });
    });
    return true;
  }

  if (msg.type === "SAVE_CLIPPING") {
    saveClipping(msg.clipping).then(total => sendResponse({ ok: true, total }));
    return true;
  }
  if (msg.type === "GET_CLIPPINGS") {
    getClippings().then(clippings => sendResponse({ clippings }));
    return true;
  }
  if (msg.type === "GET_CATEGORIES") {
    getCategories().then(categories => sendResponse({ categories }));
    return true;
  }
  if (msg.type === "ADD_CATEGORY") {
    addCategory(msg.name).then(categories => sendResponse({ categories }));
    return true;
  }
  if (msg.type === "DELETE_CLIPPING") {
    deleteClipping(msg.id).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "MOVE_CLIPPING") {
    moveClipping(msg.id, msg.category).then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "CLEAR_ALL") {
    chrome.storage.local.set({ [CLIPS_KEY]: [] }, () => sendResponse({ ok: true }));
    return true;
  }
  if (msg.type === "CLEAR_CATEGORY") {
    clearCategory(msg.category).then(() => sendResponse({ ok: true }));
    return true;
  }
});

// ── Storage ───────────────────────────────────────────────────────────────────
async function getClippings() {
  return new Promise(r => chrome.storage.local.get([CLIPS_KEY], d => r(d[CLIPS_KEY] || [])));
}
async function getCategories() {
  return new Promise(r => chrome.storage.local.get([CATS_KEY], d => r(d[CATS_KEY] || [])));
}
async function saveClipping(clipping) {
  const [existing, cats] = await Promise.all([getClippings(), getCategories()]);
  const isDup = existing.some(c =>
    c.url === clipping.url &&
    (c.text||"").slice(0,120) === (clipping.text||"").slice(0,120) &&
    c.type === clipping.type
  );
  if (isDup) return existing.length;
  if (clipping.category && clipping.category !== "Uncategorized" && !cats.includes(clipping.category)) {
    await new Promise(r => chrome.storage.local.set({ [CATS_KEY]: [...cats, clipping.category] }, r));
  }
  const updated = [...existing, clipping].slice(-300);
  await new Promise(r => chrome.storage.local.set({ [CLIPS_KEY]: updated }, r));
  return updated.length;
}
async function addCategory(name) {
  const cats = await getCategories();
  if (cats.includes(name)) return cats;
  const updated = [...cats, name];
  await new Promise(r => chrome.storage.local.set({ [CATS_KEY]: updated }, r));
  return updated;
}
async function deleteClipping(id) {
  const existing = await getClippings();
  await new Promise(r => chrome.storage.local.set(
    { [CLIPS_KEY]: existing.filter(c => c.id !== id) }, r));
}
async function moveClipping(id, category) {
  const existing = await getClippings();
  await new Promise(r => chrome.storage.local.set(
    { [CLIPS_KEY]: existing.map(c => c.id === id ? {...c, category} : c) }, r));
}
async function clearCategory(category) {
  const existing = await getClippings();
  await new Promise(r => chrome.storage.local.set(
    { [CLIPS_KEY]: existing.filter(c => c.category !== category) }, r));
}
