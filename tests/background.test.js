'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const BACKGROUND_PATH = path.join(__dirname, '..', 'background.js');
const BACKGROUND_SOURCE = fs.readFileSync(BACKGROUND_PATH, 'utf8');

function clone(value) {
  return value === undefined ? undefined : structuredClone(value);
}

function createEvent(listeners, name) {
  return {
    addListener(listener) {
      listeners[name] = listener;
    }
  };
}

function createHarness({
  history,
  scope = 'global',
  tabs = {},
  windows = [1],
  focusedWindowId = 1,
  storageDelay = 0,
  sessionSetDelay = 0,
  tabGetDelays = {},
  failWindowUpdates = [],
  windowUpdateDelay = 0,
  emitActivationOnTabUpdate = false,
  activationDuringTabUpdate = []
} = {}) {
  let session = history ? { tabHistory: clone(history) } : {};
  let local = { settings: { historyScope: scope } };
  const browserTabs = new Map(
    Object.entries(tabs).map(([tabId, tab]) => [Number(tabId), { id: Number(tabId), ...clone(tab) }])
  );
  const browserWindows = new Set(windows);
  const failingWindowUpdates = new Set(failWindowUpdates);
  const listeners = {};
  const updates = [];
  const warnings = [];
  let sessionSetCount = 0;
  const sessionSetWaiters = [];
  let signalWindowUpdateStarted;
  const windowUpdateStarted = new Promise((resolve) => {
    signalWindowUpdateStarted = resolve;
  });
  const waitForStorage = () => new Promise((resolve) => setTimeout(resolve, storageDelay));

  const chrome = {
    storage: {
      session: {
        async get() {
          await waitForStorage();
          return clone(session);
        },
        async set(value) {
          await waitForStorage();
          sessionSetCount++;
          for (const waiter of sessionSetWaiters.splice(0)) {
            waiter(sessionSetCount);
          }
          if (sessionSetDelay) {
            await new Promise((resolve) => setTimeout(resolve, sessionSetDelay));
          }
          session = { ...session, ...clone(value) };
        }
      },
      local: {
        async get() {
          await waitForStorage();
          return clone(local);
        },
        async set(value) {
          await waitForStorage();
          local = { ...local, ...clone(value) };
        }
      }
    },
    tabs: {
      async get(tabId) {
        if (tabGetDelays[tabId]) {
          await new Promise((resolve) => setTimeout(resolve, tabGetDelays[tabId]));
        }
        const tab = browserTabs.get(tabId);
        if (!tab) {
          throw new Error(`Missing tab ${tabId}`);
        }
        return clone(tab);
      },
      async query(queryInfo) {
        return [...browserTabs.values()]
          .filter((tab) => !queryInfo.windowId || tab.windowId === queryInfo.windowId)
          .filter((tab) => queryInfo.active === undefined || tab.active === queryInfo.active)
          .map(clone);
      },
      async update(tabId, updateInfo) {
        const tab = browserTabs.get(tabId);
        if (!tab) {
          throw new Error(`Missing tab ${tabId}`);
        }
        updates.push(['tab', tabId, clone(updateInfo)]);
        Object.assign(tab, updateInfo);
        if (updateInfo.active && emitActivationOnTabUpdate && listeners['tabs.onActivated']) {
          listeners['tabs.onActivated']({ tabId, windowId: tab.windowId });
          for (const activatedTabId of activationDuringTabUpdate) {
            const activatedTab = browserTabs.get(activatedTabId);
            listeners['tabs.onActivated']({
              tabId: activatedTabId,
              windowId: activatedTab.windowId
            });
          }
        }
        return clone(tab);
      },
      onActivated: createEvent(listeners, 'tabs.onActivated'),
      onAttached: createEvent(listeners, 'tabs.onAttached'),
      onRemoved: createEvent(listeners, 'tabs.onRemoved')
    },
    windows: {
      WINDOW_ID_NONE: -1,
      async getLastFocused() {
        return { id: focusedWindowId };
      },
      async update(windowId, updateInfo) {
        signalWindowUpdateStarted(windowId);
        if (windowUpdateDelay) {
          await new Promise((resolve) => setTimeout(resolve, windowUpdateDelay));
        }
        if (!browserWindows.has(windowId) || failingWindowUpdates.has(windowId)) {
          throw new Error(`Missing window ${windowId}`);
        }
        updates.push(['window', windowId, clone(updateInfo)]);
        if (updateInfo.focused) {
          focusedWindowId = windowId;
        }
        return { id: windowId, ...clone(updateInfo) };
      },
      onFocusChanged: createEvent(listeners, 'windows.onFocusChanged')
    },
    runtime: {
      onInstalled: createEvent(listeners, 'runtime.onInstalled'),
      onStartup: createEvent(listeners, 'runtime.onStartup')
    },
    commands: {
      onCommand: createEvent(listeners, 'commands.onCommand')
    },
    action: {
      onClicked: createEvent(listeners, 'action.onClicked')
    }
  };

  const context = {
    chrome,
    clearTimeout,
    console: {
      log: console.log,
      warn(...args) {
        warnings.push(args);
      }
    },
    setTimeout,
    structuredClone
  };
  vm.createContext(context);
  vm.runInContext(BACKGROUND_SOURCE, context, { filename: BACKGROUND_PATH });

  return {
    context,
    listeners,
    updates,
    warnings,
    getHistory: () => clone(session.tabHistory),
    waitForSessionSetStart() {
      if (sessionSetCount > 0) {
        return Promise.resolve(sessionSetCount);
      }
      return new Promise((resolve) => sessionSetWaiters.push(resolve));
    },
    waitForWindowUpdateStart: () => windowUpdateStarted,
    setScope(value) {
      local.settings.historyScope = value;
    },
    setActiveTab(tabId) {
      const selected = browserTabs.get(tabId);
      for (const tab of browserTabs.values()) {
        if (tab.windowId === selected.windowId) {
          tab.active = tab.id === tabId;
        }
      }
    }
  };
}

test('serializes concurrent tab activations without dropping history entries', async () => {
  const harness = createHarness({
    history: {
      global: { stack: [{ tabId: 1, windowId: 1 }], pointer: 0 },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 1 },
      2: { windowId: 1 },
      3: { windowId: 1 }
    },
    storageDelay: 5
  });

  await Promise.all([
    harness.context.recordActivation(2, 1),
    harness.context.recordActivation(3, 1)
  ]);

  assert.deepEqual(
    harness.getHistory().global.stack.map(({ tabId }) => tabId),
    [1, 2, 3]
  );
});

test('serializes rapid back commands so each command advances the pointer', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [1, 2, 3].map((tabId) => ({ tabId, windowId: 1 })),
        pointer: 2
      },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 1 },
      2: { windowId: 1 },
      3: { windowId: 1 }
    },
    storageDelay: 5
  });

  await Promise.all([
    harness.context.navigate(-1),
    harness.context.navigate(-1)
  ]);

  assert.equal(harness.getHistory().global.pointer, 0);
  assert.deepEqual(
    harness.updates.filter(([type]) => type === 'tab').map(([, tabId]) => tabId),
    [2, 1]
  );
});

test('initializes the focused tab so the first observed switch can navigate back', async () => {
  const harness = createHarness({
    tabs: {
      1: { windowId: 1, active: true },
      2: { windowId: 1, active: false }
    }
  });

  await harness.context.enqueueOperation(() => {});
  await harness.context.recordActivation(2, 1);
  await harness.context.navigate(-1);

  assert.deepEqual(
    harness.getHistory().global.stack.map(({ tabId }) => tabId),
    [1, 2]
  );
  assert.deepEqual(
    harness.updates.filter(([type]) => type === 'tab').map(([, tabId]) => tabId),
    [1]
  );
});

test('records the active tab when focus moves to another Chrome window', async () => {
  const harness = createHarness({
    tabs: {
      1: { windowId: 1, active: true },
      2: { windowId: 2, active: true }
    },
    windows: [1, 2],
    focusedWindowId: 1
  });

  await harness.context.enqueueOperation(() => {});
  assert.equal(typeof harness.listeners['windows.onFocusChanged'], 'function');

  harness.listeners['windows.onFocusChanged'](2);
  await harness.context.enqueueOperation(() => {});

  assert.deepEqual(
    harness.getHistory().global.stack.map(({ tabId }) => tabId),
    [1, 2]
  );
});

test('records every manual activation in both global and per-window histories', async () => {
  const harness = createHarness({
    tabs: {
      1: { windowId: 1, active: false },
      2: { windowId: 1, active: false }
    }
  });

  await harness.context.enqueueOperation(() => {});
  await harness.context.recordActivation(1, 1);
  await harness.context.recordActivation(2, 1);

  assert.deepEqual(
    harness.getHistory().global.stack.map(({ tabId }) => tabId),
    [1, 2]
  );
  assert.deepEqual(
    harness.getHistory().perWindow['1'].stack.map(({ tabId }) => tabId),
    [1, 2]
  );
});

test('uses the live window when a historical tab has moved', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [
          { tabId: 9, windowId: 2 },
          { tabId: 1, windowId: 1 }
        ],
        pointer: 0
      },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 2 },
      9: { windowId: 2 }
    },
    windows: [2]
  });

  await harness.context.enqueueOperation(() => {});
  await harness.context.navigate(1);

  assert.equal(harness.getHistory().global.pointer, 1);
  assert.deepEqual(harness.updates, [
    ['window', 2, { focused: true }],
    ['tab', 1, { active: true }]
  ]);
});

test('updates global history and removes obsolete per-window entries when a tab moves', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [{ tabId: 1, windowId: 1 }],
        pointer: 0
      },
      perWindow: {
        1: {
          stack: [{ tabId: 1, windowId: 1 }],
          pointer: 0
        }
      }
    },
    tabs: {
      1: { windowId: 2 }
    },
    windows: [1, 2]
  });

  await harness.context.enqueueOperation(() => {});
  assert.equal(typeof harness.listeners['tabs.onAttached'], 'function');
  harness.listeners['tabs.onAttached'](1, { newWindowId: 2, newPosition: 0 });
  await harness.context.enqueueOperation(() => {});

  assert.equal(harness.getHistory().global.stack[0].windowId, 2);
  assert.deepEqual(harness.getHistory().perWindow['1'].stack, []);
});

test('does not commit the pointer when focusing the destination window fails', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [
          { tabId: 1, windowId: 1 },
          { tabId: 2, windowId: 2 }
        ],
        pointer: 1
      },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 1 },
      2: { windowId: 2 }
    },
    windows: [1, 2],
    focusedWindowId: 2,
    failWindowUpdates: [1]
  });

  await harness.context.enqueueOperation(() => {});
  await harness.context.navigate(-1);

  assert.equal(harness.getHistory().global.pointer, 1);
  assert.deepEqual(harness.updates, []);
});

test('suppresses only the programmatic activation and keeps unrelated manual visits', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [1, 2, 3].map((tabId) => ({ tabId, windowId: 1 })),
        pointer: 2
      },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 1 },
      2: { windowId: 1 },
      3: { windowId: 1 },
      4: { windowId: 1 }
    },
    emitActivationOnTabUpdate: true,
    activationDuringTabUpdate: [4]
  });

  await harness.context.enqueueOperation(() => {});
  await harness.context.navigate(-1);
  await harness.context.enqueueOperation(() => {});

  assert.deepEqual(
    harness.getHistory().global.stack.map(({ tabId }) => tabId),
    [1, 2, 4]
  );
});

test('preserves activation event order even when tab lookups would resolve out of order', async () => {
  const harness = createHarness({
    tabs: {
      1: { windowId: 1, active: false },
      2: { windowId: 1, active: false }
    },
    tabGetDelays: {
      1: 20,
      2: 1
    }
  });

  await harness.context.enqueueOperation(() => {});
  harness.listeners['tabs.onActivated']({ tabId: 1, windowId: 1 });
  harness.listeners['tabs.onActivated']({ tabId: 2, windowId: 1 });
  await new Promise((resolve) => setTimeout(resolve, 30));
  await harness.context.enqueueOperation(() => {});

  assert.deepEqual(
    harness.getHistory().global.stack.map(({ tabId }) => tabId),
    [1, 2]
  );
});

test('keeps history aligned with the final target when a manual activation occurs during window focus', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [1, 2, 3].map((tabId) => ({ tabId, windowId: 1 })),
        pointer: 2
      },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 1 },
      2: { windowId: 1 },
      3: { windowId: 1 },
      4: { windowId: 1 }
    },
    windowUpdateDelay: 20,
    emitActivationOnTabUpdate: true
  });

  await harness.context.enqueueOperation(() => {});
  const navigation = harness.context.navigate(-1);
  await harness.waitForWindowUpdateStart();
  harness.listeners['tabs.onActivated']({ tabId: 4, windowId: 1 });
  await navigation;
  await harness.context.enqueueOperation(() => {});

  const global = harness.getHistory().global;
  assert.equal(global.stack[global.pointer].tabId, 2);
  assert.equal(global.stack[global.pointer - 1].tabId, 4);
});

test('captures the active tab at window-focus event time before queued mutations run', async () => {
  const harness = createHarness({
    tabs: {
      1: { windowId: 1, active: true },
      2: { windowId: 2, active: true },
      3: { windowId: 2, active: false }
    },
    windows: [1, 2],
    focusedWindowId: 1
  });

  await harness.context.enqueueOperation(() => {});
  let releaseQueue;
  const blocker = harness.context.enqueueOperation(
    () => new Promise((resolve) => {
      releaseQueue = resolve;
    })
  );
  await new Promise((resolve) => setImmediate(resolve));

  harness.listeners['windows.onFocusChanged'](2);
  harness.setActiveTab(3);
  harness.listeners['tabs.onActivated']({ tabId: 3, windowId: 2 });
  releaseQueue();
  await blocker;
  await harness.context.enqueueOperation(() => {});

  assert.deepEqual(
    harness.getHistory().global.stack.map(({ tabId }) => tabId),
    [1, 2, 3]
  );
});

test('captures manual activation immediately after a navigation request is queued', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [1, 2, 3].map((tabId) => ({ tabId, windowId: 1 })),
        pointer: 2
      },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 1 },
      2: { windowId: 1 },
      3: { windowId: 1 },
      4: { windowId: 1 }
    },
    storageDelay: 5,
    emitActivationOnTabUpdate: true
  });

  await harness.context.enqueueOperation(() => {});
  const navigation = harness.context.navigate(-1);
  harness.listeners['tabs.onActivated']({ tabId: 4, windowId: 1 });
  await navigation;
  await harness.context.enqueueOperation(() => {});

  const global = harness.getHistory().global;
  assert.equal(global.stack[global.pointer].tabId, 2);
  assert.equal(global.stack[global.pointer - 1].tabId, 4);
});

test('buffers an unrelated window-focus snapshot inside the active navigation transaction', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [1, 2, 3].map((tabId) => ({ tabId, windowId: 1 })),
        pointer: 2
      },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 1, active: false },
      2: { windowId: 1, active: false },
      3: { windowId: 1, active: true },
      4: { windowId: 3, active: true }
    },
    windows: [1, 3],
    focusedWindowId: 1,
    windowUpdateDelay: 20,
    emitActivationOnTabUpdate: true
  });

  await harness.context.enqueueOperation(() => {});
  const navigation = harness.context.navigate(-1);
  await harness.waitForWindowUpdateStart();
  harness.listeners['windows.onFocusChanged'](3);
  await navigation;
  await harness.context.enqueueOperation(() => {});

  const global = harness.getHistory().global;
  assert.equal(global.stack[global.pointer].tabId, 2);
  assert.equal(global.stack[global.pointer - 1].tabId, 4);
});

test('replays manual activation when navigation exits at the history boundary', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [1, 2].map((tabId) => ({ tabId, windowId: 1 })),
        pointer: 0
      },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 1 },
      2: { windowId: 1 },
      4: { windowId: 1 }
    },
    storageDelay: 5
  });

  await harness.context.enqueueOperation(() => {});
  const navigation = harness.context.navigate(-1);
  harness.listeners['tabs.onActivated']({ tabId: 4, windowId: 1 });
  await navigation;
  await harness.context.enqueueOperation(() => {});

  const global = harness.getHistory().global;
  assert.deepEqual(global.stack.map(({ tabId }) => tabId), [1, 4]);
  assert.equal(global.pointer, 1);
});

test('keeps capture ownership through commit before the next queued navigation starts', async () => {
  const harness = createHarness({
    history: {
      global: {
        stack: [1, 2, 3].map((tabId) => ({ tabId, windowId: 1 })),
        pointer: 2
      },
      perWindow: {}
    },
    tabs: {
      1: { windowId: 1 },
      2: { windowId: 1 },
      3: { windowId: 1 },
      4: { windowId: 1 }
    },
    emitActivationOnTabUpdate: true,
    sessionSetDelay: 20
  });

  await harness.context.enqueueOperation(() => {});
  const firstBack = harness.context.navigate(-1);
  const secondBack = harness.context.navigate(-1);
  await harness.waitForSessionSetStart();
  harness.listeners['tabs.onActivated']({ tabId: 4, windowId: 1 });
  await Promise.all([firstBack, secondBack]);
  await harness.context.enqueueOperation(() => {});

  const activatedTabs = harness.updates
    .filter(([type]) => type === 'tab')
    .map(([, tabId]) => tabId);
  const global = harness.getHistory().global;
  assert.equal(global.stack[global.pointer].tabId, activatedTabs.at(-1));
});
