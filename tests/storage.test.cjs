const test = require("node:test");
const assert = require("node:assert/strict");

const { createInitialState } = require("../.tmp-tests/src/lib/progression.js");

const storagePath = "../.tmp-tests/src/lib/storage.js";

const createFakeLocalStorage = () => {
  const store = new Map();
  return {
    store,
    api: {
      get length() {
        return store.size;
      },
      clear() {
        store.clear();
      },
      getItem(key) {
        return store.has(key) ? store.get(key) : null;
      },
      key(index) {
        return Array.from(store.keys())[index] ?? null;
      },
      removeItem(key) {
        store.delete(key);
      },
      setItem(key, value) {
        store.set(key, String(value));
      },
    },
  };
};

const loadStorageWithFake = () => {
  const fake = createFakeLocalStorage();
  global.localStorage = fake.api;
  delete require.cache[require.resolve(storagePath)];
  return { fake, storage: require(storagePath) };
};

test.afterEach(() => {
  delete global.localStorage;
  delete require.cache[require.resolve(storagePath)];
});

test("localStorageへ保存し、復元できる", () => {
  const { fake, storage } = loadStorageWithFake();
  const state = {
    ...createInitialState(),
    demonLordName: "Test Lord",
    gold: 345,
  };

  const saved = storage.saveGameState(state);
  const loaded = storage.loadSavedGame();

  assert.equal(saved.ok, true);
  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.state.version, storage.SAVE_VERSION);
  assert.equal(loaded.state.demonLordName, "Test Lord");
  assert.equal(loaded.state.gold, 345);
  assert.ok(fake.store.has(storage.STORAGE_KEY));
});

test("v2相当のセーブデータをv3へ移行し、移行前バックアップを残す", () => {
  const { fake, storage } = loadStorageWithFake();
  const v2State = {
    ...createInitialState(),
    version: 2,
    achievements: undefined,
    bossRecords: undefined,
    collectionRewards: undefined,
    records: [
      {
        id: "record-v2-success",
        dungeonId: "ash-border-village",
        dungeonName: "Ash Border Village",
        unitNames: ["Unit"],
        strategy: "balanced",
        startedAt: 1000,
        endedAt: 2000,
        status: "success",
        logs: [],
        rewards: {
          gold: 80,
          demonExp: 40,
          unitExp: 30,
          territory: 4,
          items: [{ itemId: "moon-rust", quantity: 1 }],
          rescuedUnits: [],
        },
      },
    ],
  };

  delete v2State.achievements;
  delete v2State.bossRecords;
  delete v2State.collectionRewards;
  fake.api.setItem(storage.STORAGE_KEY, JSON.stringify(v2State));

  const loaded = storage.loadSavedGame();

  assert.equal(loaded.status, "migrated");
  assert.equal(loaded.migratedFrom, 2);
  assert.equal(loaded.state.version, storage.SAVE_VERSION);
  assert.ok(Array.isArray(loaded.state.achievements.unlocked));
  assert.ok(Array.isArray(loaded.state.collectionRewards.claimedIds));
  assert.equal(loaded.state.bossRecords.find((entry) => entry.dungeonId === "ash-border-village").defeats, 1);
  assert.ok(loaded.backupKey);
  assert.equal(JSON.parse(fake.api.getItem(loaded.backupKey)).version, 2);
  assert.equal(JSON.parse(fake.api.getItem(storage.STORAGE_KEY)).version, storage.SAVE_VERSION);
});

test("壊れたセーブデータをバックアップして初期状態へ復旧する", () => {
  const { fake, storage } = loadStorageWithFake();
  fake.api.setItem(storage.STORAGE_KEY, "{ broken json");

  const loaded = storage.loadSavedGame();

  assert.equal(loaded.status, "recovered");
  assert.equal(loaded.state.version, storage.SAVE_VERSION);
  assert.ok(loaded.backupKey);
  assert.equal(fake.api.getItem(loaded.backupKey), "{ broken json");
  assert.equal(JSON.parse(fake.api.getItem(storage.STORAGE_KEY)).version, storage.SAVE_VERSION);
});
