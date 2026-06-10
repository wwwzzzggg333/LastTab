const MAX_STACK_SIZE = 50;
const STORAGE_KEY = 'tabHistory';
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = { historyScope: 'global' };

let isNavigating = false;

async function getSettings() {
  const result = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(result[SETTINGS_KEY] || {}) };
}

async function getHistoryData() {
  const result = await chrome.storage.session.get(STORAGE_KEY);
  return result[STORAGE_KEY] || {
    global: { stack: [], pointer: -1 },
    perWindow: {}
  };
}

async function saveHistoryData(data) {
  await chrome.storage.session.set({ [STORAGE_KEY]: data });
}

function getActiveStack(data, windowId, scope) {
  if (scope === 'global') {
    return data.global;
  }
  const key = String(windowId);
  if (!data.perWindow[key]) {
    data.perWindow[key] = { stack: [], pointer: -1 };
  }
  return data.perWindow[key];
}

function isSameEntry(a, b) {
  return a && b && a.tabId === b.tabId && a.windowId === b.windowId;
}

function removeTabFromStack(stackData, tabId) {
  let removedBeforeOrAtPointer = 0;
  const newStack = [];
  for (let i = 0; i < stackData.stack.length; i++) {
    if (stackData.stack[i].tabId === tabId) {
      if (i <= stackData.pointer) {
        removedBeforeOrAtPointer++;
      }
      continue;
    }
    newStack.push(stackData.stack[i]);
  }
  stackData.stack = newStack;
  stackData.pointer -= removedBeforeOrAtPointer;
  if (stackData.pointer < -1) {
    stackData.pointer = -1;
  }
  if (stackData.pointer >= stackData.stack.length) {
    stackData.pointer = stackData.stack.length - 1;
  }
}

async function recordActivation(tabId, windowId) {
  if (isNavigating) {
    return;
  }

  const settings = await getSettings();
  const data = await getHistoryData();
  const stackData = getActiveStack(data, windowId, settings.historyScope);
  const entry = { tabId, windowId };
  const current = stackData.stack[stackData.pointer];

  if (isSameEntry(current, entry)) {
    return;
  }

  if (stackData.pointer < stackData.stack.length - 1) {
    stackData.stack = stackData.stack.slice(0, stackData.pointer + 1);
  }

  stackData.stack.push(entry);
  stackData.pointer = stackData.stack.length - 1;

  if (stackData.stack.length > MAX_STACK_SIZE) {
    const overflow = stackData.stack.length - MAX_STACK_SIZE;
    stackData.stack = stackData.stack.slice(overflow);
    stackData.pointer = stackData.stack.length - 1;
  }

  await saveHistoryData(data);
}

async function isEntryValid(entry) {
  try {
    await chrome.tabs.get(entry.tabId);
    return true;
  } catch {
    return false;
  }
}

async function navigate(direction) {
  let windowId;
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    windowId = win.id;
  } catch (err) {
    console.warn('LastTab: cannot get focused window', err);
    return;
  }

  const settings = await getSettings();
  const data = await getHistoryData();
  const stackData = getActiveStack(data, windowId, settings.historyScope);

  if (stackData.stack.length === 0) {
    return;
  }

  while (true) {
    const nextPointer = stackData.pointer + direction;
    if (nextPointer < 0 || nextPointer >= stackData.stack.length) {
      break;
    }

    const entry = stackData.stack[nextPointer];
    if (!(await isEntryValid(entry))) {
      stackData.stack.splice(nextPointer, 1);
      if (nextPointer <= stackData.pointer) {
        stackData.pointer--;
      }
      continue;
    }

    stackData.pointer = nextPointer;
    await saveHistoryData(data);

    isNavigating = true;
    try {
      await chrome.windows.update(entry.windowId, { focused: true });
      await chrome.tabs.update(entry.tabId, { active: true });
    } catch (err) {
      console.warn('LastTab: navigation failed', err);
    } finally {
      setTimeout(() => {
        isNavigating = false;
      }, 100);
    }
    return;
  }

  await saveHistoryData(data);
}

async function handleTabRemoved(tabId) {
  const data = await getHistoryData();
  removeTabFromStack(data.global, tabId);
  for (const key of Object.keys(data.perWindow)) {
    removeTabFromStack(data.perWindow[key], tabId);
  }
  await saveHistoryData(data);
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId)
    .then((tab) => recordActivation(activeInfo.tabId, tab.windowId))
    .catch((err) => console.warn('LastTab: onActivated error', err));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handleTabRemoved(tabId).catch((err) => console.warn('LastTab: onRemoved error', err));
});

chrome.commands.onCommand.addListener((command) => {
  if (command === 'go-back') {
    navigate(-1).catch((err) => console.warn('LastTab: go-back error', err));
  } else if (command === 'go-forward') {
    navigate(1).catch((err) => console.warn('LastTab: go-forward error', err));
  }
});

chrome.action.onClicked.addListener(() => {
  navigate(-1).catch((err) => console.warn('LastTab: action click error', err));
});
