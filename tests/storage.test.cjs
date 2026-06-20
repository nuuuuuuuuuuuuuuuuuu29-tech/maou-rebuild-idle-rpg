const test = require("node:test");
const assert = require("node:assert/strict");

const { createInitialState } = require("../.tmp-tests/src/lib/progression.js");
const { hireUnit } = require("../.tmp-tests/src/lib/expedition.js");
const { DEFAULT_TITLE_ID } = require("../.tmp-tests/src/data/titles.js");

const storagePath = "../.tmp-tests/src/lib/storage.js";

const makeRecord = (overrides = {}) => ({
  id: "record-storage-success",
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
    items: [],
    rescuedUnits: [],
  },
  ...overrides,
});

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

test("雇用済みユニットと所持金を保存復元できる", () => {
  const { storage } = loadStorageWithFake();
  const base = createInitialState();
  const hired = hireUnit(base, "thorn-kobold");

  assert.equal(hired.ok, true);
  assert.equal(storage.saveGameState(hired.state).ok, true);

  const loaded = storage.loadSavedGame();
  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.state.gold, hired.state.gold);
  assert.equal(loaded.state.units.length, hired.state.units.length);
  assert.ok(loaded.state.units.some((unit) => unit.templateId === "thorn-kobold"));
});

test("既存v5セーブをマイグレーションなしで読み込める", () => {
  const { fake, storage } = loadStorageWithFake();
  const state = {
    ...createInitialState(),
    version: storage.SAVE_VERSION,
    gold: 777,
    dungeonMastery: [{ dungeonId: "ash-border-village", clearCount: 5 }],
    selectedTitleId: DEFAULT_TITLE_ID,
  };
  fake.api.setItem(storage.STORAGE_KEY, JSON.stringify(state));

  const loaded = storage.loadSavedGame();

  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.backupKey, undefined);
  assert.equal(loaded.state.version, storage.SAVE_VERSION);
  assert.equal(loaded.state.gold, 777);
  assert.equal(loaded.state.dungeonMastery.find((entry) => entry.dungeonId === "ash-border-village").clearCount, 5);
  assert.equal(loaded.state.selectedTitleId, DEFAULT_TITLE_ID);
});

test("v4セーブデータをv5へ移行し、selectedTitleIdを安全に初期化する", () => {
  const { fake, storage } = loadStorageWithFake();
  const v4State = {
    ...createInitialState(),
    version: 4,
    gold: 888,
    selectedTitleId: undefined,
  };
  delete v4State.selectedTitleId;
  fake.api.setItem(storage.STORAGE_KEY, JSON.stringify(v4State));

  const loaded = storage.loadSavedGame();

  assert.equal(loaded.status, "migrated");
  assert.equal(loaded.migratedFrom, 4);
  assert.equal(loaded.state.version, storage.SAVE_VERSION);
  assert.equal(loaded.state.gold, 888);
  assert.equal(loaded.state.selectedTitleId, DEFAULT_TITLE_ID);
  assert.ok(loaded.backupKey);
  assert.equal(JSON.parse(fake.api.getItem(loaded.backupKey)).version, 4);
  assert.equal(JSON.parse(fake.api.getItem(storage.STORAGE_KEY)).version, storage.SAVE_VERSION);
});

test("selectedTitleIdを保存復元し、不正な称号IDは安全に無効化する", () => {
  const { fake, storage } = loadStorageWithFake();
  const selectableState = {
    ...createInitialState(),
    records: [makeRecord()],
    selectedTitleId: "first-expedition-title",
  };

  storage.saveGameState(selectableState);
  const loadedSelected = storage.loadSavedGame();

  assert.equal(loadedSelected.status, "loaded");
  assert.equal(loadedSelected.state.selectedTitleId, "first-expedition-title");

  fake.api.setItem(
    storage.STORAGE_KEY,
    JSON.stringify({
      ...createInitialState(),
      version: storage.SAVE_VERSION,
      selectedTitleId: "not-real-title",
    }),
  );

  const loadedInvalid = storage.loadSavedGame();

  assert.equal(loadedInvalid.status, "loaded");
  assert.equal(loadedInvalid.state.selectedTitleId, DEFAULT_TITLE_ID);
});

test("detailed battle logs are saved and restored without a version bump", () => {
  const { storage } = loadStorageWithFake();
  const state = {
    ...createInitialState(),
    records: [
      makeRecord({
        battleLog: [
          {
            id: "combat-1",
            turn: 1,
            type: "encounter",
            actorName: "煤けた骸骨兵",
            hpBefore: 30,
            hpAfter: 30,
            enemyId: "tax-armor",
            text: "煤けた境界村で「煤けた骸骨兵」と遭遇した。",
          },
          {
            id: "combat-2",
            turn: 1,
            type: "allyAttack",
            actorName: "Unit",
            targetName: "煤けた骸骨兵",
            damage: 12,
            hpBefore: 30,
            hpAfter: 18,
            enemyId: "tax-armor",
            text: "Unitの攻撃。煤けた骸骨兵に 12 ダメージ。",
          },
        ],
        encounteredEnemies: [
          {
            id: "tax-armor",
            name: "煤けた骸骨兵",
            kind: "骸骨兵",
            hp: 30,
            attack: 8,
            defense: 4,
            speed: 3,
            flavor: "村境に残された骨の番兵。",
            dungeonId: "ash-border-village",
          },
        ],
      }),
    ],
  };

  const saved = storage.saveGameState(state);
  const loaded = storage.loadSavedGame();
  const record = loaded.state.records[0];

  assert.equal(saved.ok, true);
  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.state.version, storage.SAVE_VERSION);
  assert.equal(record.battleLog.length, 2);
  assert.equal(record.battleLog[0].type, "encounter");
  assert.equal(record.battleLog[1].damage, 12);
  assert.equal(record.encounteredEnemies.length, 1);
  assert.equal(record.encounteredEnemies[0].id, "tax-armor");
});

test("v2相当のセーブデータを現行版へ移行し、移行前バックアップを残す", () => {
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
  assert.equal(loaded.state.dungeonMastery.find((entry) => entry.dungeonId === "ash-border-village").clearCount, 1);
  assert.ok(loaded.backupKey);
  assert.equal(JSON.parse(fake.api.getItem(loaded.backupKey)).version, 2);
  assert.equal(JSON.parse(fake.api.getItem(storage.STORAGE_KEY)).version, storage.SAVE_VERSION);
});

test("v3相当のセーブデータをv4へ移行し、ダンジョン熟練度を復元する", () => {
  const { fake, storage } = loadStorageWithFake();
  const v3State = {
    ...createInitialState(),
    version: 3,
    dungeonMastery: undefined,
    records: [
      {
        id: "record-v3-success",
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
          items: [],
          rescuedUnits: [],
        },
      },
    ],
    bossRecords: [
      {
        dungeonId: "ash-border-village",
        defeats: 3,
        firstDefeatedAt: 1000,
        lastDefeatedAt: 3000,
      },
    ],
  };

  delete v3State.dungeonMastery;
  fake.api.setItem(storage.STORAGE_KEY, JSON.stringify(v3State));

  const loaded = storage.loadSavedGame();

  assert.equal(loaded.status, "migrated");
  assert.equal(loaded.migratedFrom, 3);
  assert.equal(loaded.state.version, storage.SAVE_VERSION);
  assert.equal(loaded.state.dungeonMastery.find((entry) => entry.dungeonId === "ash-border-village").clearCount, 3);
  assert.ok(loaded.backupKey);
  assert.equal(JSON.parse(fake.api.getItem(loaded.backupKey)).version, 3);
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
