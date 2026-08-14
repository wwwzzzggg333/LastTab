const MAX_STACK_SIZE = 50;
const STORAGE_KEY = 'tabHistory';
const SETTINGS_KEY = 'settings';
const DEFAULT_SETTINGS = { historyScope: 'global' };

let navigationInProgress = null;
let operationQueue = Promise.resolve();

function enqueueOperation(operation) {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.catch(() => {});
  return result;
}

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

function recordEntryInStack(stackData, entry) {
  const current = stackData.stack[stackData.pointer];

  if (isSameEntry(current, entry)) {
    return false;
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

  return true;
}

function alignStackWithEntry(stackData, entry) {
  for (let i = stackData.stack.length - 1; i >= 0; i--) {
    if (isSameEntry(stackData.stack[i], entry)) {
      const changed = stackData.pointer !== i;
      stackData.pointer = i;
      return changed;
    }
  }
  return recordEntryInStack(stackData, entry);
}

function recordActivationInData(data, entry) {
  const changedGlobal = recordEntryInStack(data.global, entry);
  const changedPerWindow = recordEntryInStack(
    getActiveStack(data, entry.windowId, 'perWindow'),
    entry
  );
  return changedGlobal || changedPerWindow;
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

function recordActivation(tabId, windowId) {
  return enqueueOperation(() => recordActivationNow(tabId, windowId));
}

async function recordActivationNow(tabId, windowId) {
  const data = await getHistoryData();
  const entry = { tabId, windowId };

  if (recordActivationInData(data, entry)) {
    await saveHistoryData(data);
  }
}

function initializeHistory() {
  return enqueueOperation(initializeHistoryNow);
}

async function initializeHistoryNow() {
  const activeTabs = await chrome.tabs.query({ active: true });
  if (activeTabs.length === 0) {
    return;
  }

  const data = await getHistoryData();
  let changed = false;

  for (const tab of activeTabs) {
    const perWindowStack = getActiveStack(data, tab.windowId, 'perWindow');
    if (perWindowStack.stack.length === 0) {
      changed = recordEntryInStack(perWindowStack, {
        tabId: tab.id,
        windowId: tab.windowId
      }) || changed;
    }
  }

  if (data.global.stack.length === 0) {
    let focusedWindowId;
    try {
      focusedWindowId = (await chrome.windows.getLastFocused({ populate: false })).id;
    } catch {
      focusedWindowId = undefined;
    }
    const focusedTab = activeTabs.find((tab) => tab.windowId === focusedWindowId) || activeTabs[0];
    changed = recordEntryInStack(data.global, {
      tabId: focusedTab.id,
      windowId: focusedTab.windowId
    }) || changed;
  }

  if (changed) {
    await saveHistoryData(data);
  }
}

function recordFocusedWindow(windowId, activeTabPromise) {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return Promise.resolve();
  }

  return enqueueOperation(async () => {
    const [tab] = await activeTabPromise;
    if (tab) {
      await recordActivationNow(tab.id, tab.windowId);
    }
  });
}

async function getLiveTab(entry) {
  try {
    return await chrome.tabs.get(entry.tabId);
  } catch {
    return null;
  }
}

function navigate(direction) {
  const navigation = {
    tabId: null,
    windowId: null,
    targetEventSeen: false,
    bufferedActivations: [],
    pendingFocusSnapshots: []
  };
  if (!navigationInProgress) {
    navigationInProgress = navigation;
  }
  return enqueueOperation(() => navigateNow(direction, navigation))
    .finally(() => finishNavigationCapture(navigation));
}

function finishNavigationCapture(navigation) {
  if (navigationInProgress === navigation) {
    navigationInProgress = null;
  }
}

async function takeNavigationBuffer(navigation) {
  const pendingFocusSnapshots = navigation.pendingFocusSnapshots.splice(0);
  await Promise.all(pendingFocusSnapshots);
  const bufferedActivations = navigation.bufferedActivations;
  navigation.bufferedActivations = [];
  return bufferedActivations;
}

function applyBufferedActivations(data, bufferedActivations) {
  let changed = false;
  for (const activation of bufferedActivations) {
    changed = recordActivationInData(data, activation.entry) || changed;
  }
  return changed;
}

async function commitNavigationData(navigation, data, initialChanged = false) {
  let changed = initialChanged;

  while (true) {
    const bufferedActivations = await takeNavigationBuffer(navigation);
    changed = applyBufferedActivations(data, bufferedActivations) || changed;

    if (changed) {
      changed = false;
      await saveHistoryData(data);
      continue;
    }

    if (
      navigation.pendingFocusSnapshots.length > 0 ||
      navigation.bufferedActivations.length > 0
    ) {
      continue;
    }

    finishNavigationCapture(navigation);
    return;
  }
}

async function replayNavigationBuffer(navigation, existingData) {
  const data = existingData || await getHistoryData();
  await commitNavigationData(navigation, data);
}

async function navigateNow(direction, navigation) {
  navigationInProgress = navigation;
  let windowId;
  try {
    const win = await chrome.windows.getLastFocused({ populate: false });
    windowId = win.id;
  } catch (err) {
    console.warn('LastTab: cannot get focused window', err);
    await replayNavigationBuffer(navigation);
    return;
  }

  let settings;
  let data;
  try {
    settings = await getSettings();
    data = await getHistoryData();
  } catch (err) {
    await replayNavigationBuffer(navigation);
    throw err;
  }
  const stackData = getActiveStack(data, windowId, settings.historyScope);

  if (stackData.stack.length === 0) {
    await replayNavigationBuffer(navigation, data);
    return;
  }

  let historyChanged = false;

  while (true) {
    const nextPointer = stackData.pointer + direction;
    if (nextPointer < 0 || nextPointer >= stackData.stack.length) {
      break;
    }

    const entry = stackData.stack[nextPointer];
    const liveTab = await getLiveTab(entry);
    if (!liveTab || (settings.historyScope === 'perWindow' && liveTab.windowId !== windowId)) {
      stackData.stack.splice(nextPointer, 1);
      if (nextPointer <= stackData.pointer) {
        stackData.pointer--;
      }
      historyChanged = true;
      continue;
    }

    if (entry.windowId !== liveTab.windowId) {
      entry.windowId = liveTab.windowId;
      historyChanged = true;
    }

    navigation.tabId = entry.tabId;
    navigation.windowId = liveTab.windowId;
    let navigationSucceeded = false;
    try {
      await chrome.windows.update(liveTab.windowId, { focused: true });
      await chrome.tabs.update(entry.tabId, { active: true });
      navigationSucceeded = true;
    } catch (err) {
      console.warn('LastTab: navigation failed', err);
    }
    const bufferedActivations = await takeNavigationBuffer(navigation);
    const beforeTarget = bufferedActivations.filter(({ afterTarget }) => !afterTarget);
    const afterTarget = bufferedActivations.filter(({ afterTarget }) => afterTarget);

    if (navigationSucceeded) {
      for (const activation of beforeTarget) {
        historyChanged = recordActivationInData(data, activation.entry) || historyChanged;
      }

      const target = { tabId: entry.tabId, windowId: liveTab.windowId };
      if (beforeTarget.length > 0) {
        historyChanged = recordActivationInData(data, target) || historyChanged;
      } else {
        stackData.pointer = nextPointer;
        historyChanged = true;

        if (settings.historyScope === 'global') {
          historyChanged = alignStackWithEntry(
            getActiveStack(data, liveTab.windowId, 'perWindow'),
            target
          ) || historyChanged;
        } else {
          historyChanged = alignStackWithEntry(data.global, target) || historyChanged;
        }
      }

      for (const activation of afterTarget) {
        historyChanged = recordActivationInData(data, activation.entry) || historyChanged;
      }
    } else {
      for (const activation of bufferedActivations) {
        historyChanged = recordActivationInData(data, activation.entry) || historyChanged;
      }
    }

    await commitNavigationData(navigation, data, historyChanged);
    return;
  }

  await commitNavigationData(navigation, data, historyChanged);
}

function handleTabRemoved(tabId) {
  return enqueueOperation(() => handleTabRemovedNow(tabId));
}

async function handleTabRemovedNow(tabId) {
  const data = await getHistoryData();
  removeTabFromStack(data.global, tabId);
  for (const key of Object.keys(data.perWindow)) {
    removeTabFromStack(data.perWindow[key], tabId);
  }
  await saveHistoryData(data);
}

function handleTabAttached(tabId, newWindowId) {
  return enqueueOperation(() => handleTabAttachedNow(tabId, newWindowId));
}

async function handleTabAttachedNow(tabId, newWindowId) {
  const data = await getHistoryData();
  let changed = false;

  for (const entry of data.global.stack) {
    if (entry.tabId === tabId && entry.windowId !== newWindowId) {
      entry.windowId = newWindowId;
      changed = true;
    }
  }

  for (const key of Object.keys(data.perWindow)) {
    const beforeLength = data.perWindow[key].stack.length;
    removeTabFromStack(data.perWindow[key], tabId);
    changed = data.perWindow[key].stack.length !== beforeLength || changed;
  }

  if (changed) {
    await saveHistoryData(data);
  }
}

chrome.tabs.onActivated.addListener((activeInfo) => {
  if (navigationInProgress) {
    if (
      navigationInProgress.tabId === activeInfo.tabId &&
      navigationInProgress.windowId === activeInfo.windowId
    ) {
      navigationInProgress.targetEventSeen = true;
      return;
    }

    navigationInProgress.bufferedActivations.push({
      entry: { tabId: activeInfo.tabId, windowId: activeInfo.windowId },
      afterTarget: navigationInProgress.targetEventSeen
    });
    return;
  }

  recordActivation(activeInfo.tabId, activeInfo.windowId)
    .catch((err) => console.warn('LastTab: onActivated error', err));
});

chrome.tabs.onRemoved.addListener((tabId) => {
  handleTabRemoved(tabId).catch((err) => console.warn('LastTab: onRemoved error', err));
});

chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
  handleTabAttached(tabId, attachInfo.newWindowId)
    .catch((err) => console.warn('LastTab: onAttached error', err));
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (navigationInProgress && navigationInProgress.windowId === windowId) {
    return;
  }
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    return;
  }
  const activeTabPromise = chrome.tabs.query({ active: true, windowId });
  if (navigationInProgress) {
    const navigation = navigationInProgress;
    const afterTarget = navigation.targetEventSeen;
    navigation.pendingFocusSnapshots.push(
      activeTabPromise
        .then(([tab]) => {
          if (tab) {
            navigation.bufferedActivations.push({
              entry: { tabId: tab.id, windowId: tab.windowId },
              afterTarget
            });
          }
        })
        .catch((err) => console.warn('LastTab: cannot capture focused tab', err))
    );
    return;
  }
  recordFocusedWindow(windowId, activeTabPromise)
    .catch((err) => console.warn('LastTab: onFocusChanged error', err));
});

chrome.runtime.onInstalled.addListener(() => {
  initializeHistory().catch((err) => console.warn('LastTab: onInstalled error', err));
});

chrome.runtime.onStartup.addListener(() => {
  initializeHistory().catch((err) => console.warn('LastTab: onStartup error', err));
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

initializeHistory().catch((err) => console.warn('LastTab: initialization error', err));
