import assert from 'node:assert/strict';
import test from 'node:test';

// Each isolated module represents an extension document sharing Chrome storage.
async function createThemeDocument({ saved, pendingRead = false } = {}) {
  const storageListeners = new Set();
  const writes = [];
  const document = { documentElement: { dataset: {} } };
  let completeRead;
  globalThis.document = document;
  globalThis.chrome = {
    runtime: { lastError: undefined },
    storage: {
      local: {
        get: (_key, callback) => {
          if (pendingRead) {
            completeRead = callback;
            return;
          }
          callback({ 'websocket-devtools-theme': saved });
        },
        set: (value, callback) => {
          writes.push(value);
          callback();
        },
      },
      onChanged: { addListener: (listener) => storageListeners.add(listener) },
    },
  };
  const theme = await import(`../src/utils/theme.js?document=${crypto.randomUUID()}`);
  const emit = (value, area = 'local') => {
    storageListeners.forEach((listener) => listener({
      [theme.THEME_STORAGE_KEY]: { newValue: value },
    }, area));
  };
  return {
    theme,
    document,
    storageListeners,
    writes,
    completeRead: (result) => completeRead(result),
    emit,
  };
}

test('theme defaults to the existing dark palette without changing saved settings', async () => {
  const { theme, document, writes, storageListeners } = await createThemeDocument();
  await theme.initializeTheme();
  await theme.initializeTheme();
  assert.equal(theme.getColorScheme(), 'dark');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.equal(storageListeners.size, 1);
  assert.deepEqual(writes, []);
});

test('saved light theme restores and user changes persist without remounting consumers', async () => {
  const { theme, document, writes } = await createThemeDocument({ saved: 'light' });
  await theme.initializeTheme();
  assert.equal(theme.getColorScheme(), 'light');
  let notifications = 0;
  const unsubscribe = theme.subscribeTheme(() => { notifications += 1; });
  theme.setColorScheme('dark');
  assert.equal(document.documentElement.dataset.theme, 'dark');
  assert.deepEqual(writes, [{ [theme.THEME_STORAGE_KEY]: 'dark' }]);
  assert.equal(notifications, 1);
  unsubscribe();
  theme.setColorScheme('light');
  assert.equal(notifications, 1);
});

test('external changes synchronize, ignore other storage areas, and reset on removal', async () => {
  const { theme, emit } = await createThemeDocument();
  await theme.initializeTheme();
  emit('light', 'sync');
  assert.equal(theme.getColorScheme(), 'dark');
  emit('light');
  assert.equal(theme.getColorScheme(), 'light');
  emit(undefined);
  assert.equal(theme.getColorScheme(), 'dark');
  emit('invalid');
  assert.equal(theme.getColorScheme(), 'dark');
});

test('a stale initial read cannot overwrite a newer external preference or user action', async () => {
  for (const change of ['external', 'user']) {
    const { theme, completeRead, emit } = await createThemeDocument({ pendingRead: true });
    const ready = theme.initializeTheme();
    if (change === 'external') emit('light');
    else theme.setColorScheme('light');
    completeRead({ [theme.THEME_STORAGE_KEY]: 'dark' });
    await ready;
    assert.equal(theme.getColorScheme(), 'light');
  }
});

test.after(() => {
  delete globalThis.document;
  delete globalThis.chrome;
});
