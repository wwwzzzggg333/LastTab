/* Started by Cursor Administrator 20260301231518975 */

let tabHistory = [];
let currentIndex = -1;
let isExtensionNavigating = false;

/* Started by Cursor Administrator 20260301231518975 */
async function saveState() {
  try {
    await chrome.storage.session.set({
      tabHistory,
      currentIndex
    });
  } catch (e) {
    /* ignore if storage.session unavailable */
  }
}
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
async function restoreState() {
  try {
    const data = await chrome.storage.session.get(['tabHistory', 'currentIndex']);
    if (data.tabHistory && data.tabHistory.length > 0) {
      tabHistory = data.tabHistory;
      currentIndex = data.currentIndex ?? -1;

      const allTabs = await chrome.tabs.query({});
      const aliveIds = new Set(allTabs.map(t => t.id));
      tabHistory = tabHistory.filter(id => aliveIds.has(id));
      if (currentIndex >= tabHistory.length) {
        currentIndex = tabHistory.length - 1;
      }
      if (currentIndex < 0 && tabHistory.length > 0) {
        currentIndex = 0;
      }
    }
  } catch (e) {
    /* ignore */
  }
}
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
function recordTab(tabId) {
  if (isExtensionNavigating) return;

  if (tabHistory.length > 0 && tabHistory[currentIndex] === tabId) return;

  if (currentIndex < tabHistory.length - 1) {
    tabHistory = tabHistory.slice(0, currentIndex + 1);
  }

  tabHistory.push(tabId);
  currentIndex = tabHistory.length - 1;
  saveState();
}
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
function removeTabFromHistory(tabId) {
  let removed = false;
  for (let i = tabHistory.length - 1; i >= 0; i--) {
    if (tabHistory[i] === tabId) {
      tabHistory.splice(i, 1);
      if (i < currentIndex) {
        currentIndex--;
      } else if (i === currentIndex) {
        currentIndex = Math.min(currentIndex, tabHistory.length - 1);
      }
      removed = true;
    }
  }
  if (currentIndex < 0 && tabHistory.length > 0) {
    currentIndex = 0;
  }
  if (removed) saveState();
}
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
async function activateTab(tabId) {
  try {
    const tab = await chrome.tabs.get(tabId);
    await chrome.tabs.update(tabId, { active: true });
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    return true;
  } catch (e) {
    removeTabFromHistory(tabId);
    return false;
  }
}
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
async function goBack() {
  if (currentIndex <= 0) return;

  isExtensionNavigating = true;
  let targetIndex = currentIndex - 1;

  while (targetIndex >= 0) {
    const targetTabId = tabHistory[targetIndex];
    const success = await activateTab(targetTabId);
    if (success) {
      currentIndex = targetIndex;
      saveState();
      break;
    }
    targetIndex--;
  }

  setTimeout(() => { isExtensionNavigating = false; }, 300);
}
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
async function goForward() {
  if (currentIndex >= tabHistory.length - 1) return;

  isExtensionNavigating = true;
  let targetIndex = currentIndex + 1;

  while (targetIndex < tabHistory.length) {
    const targetTabId = tabHistory[targetIndex];
    const success = await activateTab(targetTabId);
    if (success) {
      currentIndex = targetIndex;
      saveState();
      break;
    }
    targetIndex++;
  }

  setTimeout(() => { isExtensionNavigating = false; }, 300);
}
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
chrome.tabs.onActivated.addListener((activeInfo) => {
  recordTab(activeInfo.tabId);
});
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
chrome.tabs.onRemoved.addListener((tabId) => {
  removeTabFromHistory(tabId);
});
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
chrome.action.onClicked.addListener(() => {
  goBack();
});
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
chrome.commands.onCommand.addListener((command) => {
  if (command === 'go-back') {
    goBack();
  } else if (command === 'go-forward') {
    goForward();
  }
});
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'go-back') {
    goBack();
    sendResponse({ ok: true });
  } else if (message.action === 'go-forward') {
    goForward();
    sendResponse({ ok: true });
  }
  return false;
});
/* Ended by Cursor Administrator 20260301231518975 */

/* Started by Cursor Administrator 20260301231518975 */
async function init() {
  await restoreState();

  if (tabHistory.length === 0) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      tabHistory.push(tabs[0].id);
      currentIndex = 0;
      saveState();
    }
  }
}

init();
/* Ended by Cursor Administrator 20260301231518975 */

/* Ended by Cursor Administrator 20260301231518975 */
