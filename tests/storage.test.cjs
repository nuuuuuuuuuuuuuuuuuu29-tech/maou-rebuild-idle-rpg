const test = require("node:test");
const assert = require("node:assert/strict");

const { createInitialState } = require("../.tmp-tests/src/lib/progression.js");
const { hireUnit, startExpeditionWithSeed } = require("../.tmp-tests/src/lib/expedition.js");
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

const createV5ActiveState = (overrides = {}) => {
  const base = createInitialState();
  const startedAt = 1_700_000_000_000;
  return {
    ...base,
    version: 5,
    gold: 432,
    inventory: [{ itemId: "iron-ration", quantity: 1 }],
    units: base.units.map((unit) => ({ ...unit, status: "expedition" })),
    activeExpedition: {
      id: "legacy-v5-active",
      dungeonId: "ash-border-village",
      unitIds: [base.units[0].id],
      strategy: "balanced",
      itemId: "iron-ration",
      startedAt,
      endsAt: startedAt + 30_000,
      durationSeconds: 30,
    },
    ...overrides,
  };
};

const createFakeLocalStorage = () => {
  const store = new Map();
  let setItemFault;
  return {
    store,
    setItemFault(fault) {
      setItemFault = fault;
    },
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
        if (setItemFault?.(key, value)) {
          throw new Error("injected setItem failure");
        }
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

test("既存v6セーブをマイグレーションなしで読み込める", () => {
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

test("v4セーブデータをv6へ移行し、selectedTitleIdを安全に初期化する", () => {
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

test("v5通常セーブをv6へ移行して移行前backupを維持する", () => {
  const { fake, storage } = loadStorageWithFake();
  const raw = { ...createInitialState(), version: 5, gold: 654 };
  fake.api.setItem(storage.STORAGE_KEY, JSON.stringify(raw));

  const loaded = storage.loadSavedGame();

  assert.equal(loaded.status, "migrated");
  assert.equal(loaded.migratedFrom, 5);
  assert.equal(loaded.state.version, 6);
  assert.equal(loaded.state.gold, 654);
  assert.equal(loaded.state.activeExpedition, undefined);
  assert.ok(loaded.backupKey);
  assert.equal(JSON.parse(fake.api.getItem(loaded.backupKey)).version, 5);
  assert.equal(JSON.parse(fake.api.getItem(storage.STORAGE_KEY)).version, 6);
});

test("v5進行中遠征を正規化済みstateから一度だけ決定的にv6へupgradeする", () => {
  const { fake, storage } = loadStorageWithFake();
  const rawState = createV5ActiveState();
  const raw = JSON.stringify(rawState);
  fake.api.setItem(storage.STORAGE_KEY, raw);

  const first = storage.loadSavedGame();
  const firstActive = structuredClone(first.state.activeExpedition);
  assert.equal(first.status, "migrated");
  assert.equal(first.migratedFrom, 5);
  assert.equal(firstActive.simulationVersion, 1);
  assert.match(firstActive.seed, /^legacy-v5-[0-9a-f]{8}$/);
  assert.deepEqual(firstActive.snapshot.party.map((unit) => unit.id), firstActive.unitIds);
  assert.equal(firstActive.outcome.record.id, firstActive.id);
  assert.equal(first.state.inventory[0].quantity, rawState.inventory[0].quantity);
  assert.equal(first.state.units.length, rawState.units.length);
  assert.ok(first.backupKey);
  assert.equal(JSON.parse(fake.api.getItem(first.backupKey)).version, 5);

  fake.api.setItem(storage.STORAGE_KEY, raw);
  const sameRawAgain = storage.loadSavedGame();
  assert.equal(sameRawAgain.state.activeExpedition.seed, firstActive.seed);
  assert.deepEqual(sameRawAgain.state.activeExpedition.outcome, firstActive.outcome);

  const savedV6 = JSON.stringify(sameRawAgain.state);
  fake.api.setItem(storage.STORAGE_KEY, savedV6);
  const reloaded = storage.loadSavedGame();
  assert.equal(reloaded.status, "loaded");
  assert.deepEqual(reloaded.state.activeExpedition.seed, firstActive.seed);
  assert.deepEqual(reloaded.state.activeExpedition.snapshot, firstActive.snapshot);
  assert.deepEqual(reloaded.state.activeExpedition.outcome, firstActive.outcome);
});

test("必須時刻を失ったv5 activeは再抽選せず安全に中止し、itemを変更しない", () => {
  const { fake, storage } = loadStorageWithFake();
  const raw = createV5ActiveState();
  delete raw.activeExpedition.startedAt;
  fake.api.setItem(storage.STORAGE_KEY, JSON.stringify(raw));

  const loaded = storage.loadSavedGame();

  assert.equal(loaded.status, "migrated");
  assert.equal(loaded.state.activeExpedition, undefined);
  assert.equal(loaded.state.inventory[0].quantity, raw.inventory[0].quantity);
  assert.equal(loaded.state.units[0].status, "idle");
  assert.match(loaded.message, /進行中遠征の必須情報/);
});

test("有効なv6 activeはseed・snapshot・outcomeを変更せず再読込する", () => {
  const { storage } = loadStorageWithFake();
  const base = createInitialState();
  const started = startExpeditionWithSeed(
    base,
    "ash-border-village",
    [base.units[0].id],
    "balanced",
    "storage-valid-seed",
  ).state;
  const expected = structuredClone(started.activeExpedition);

  assert.equal(storage.saveGameState(started).ok, true);
  const loaded = storage.loadSavedGame();

  assert.equal(loaded.status, "loaded");
  assert.deepEqual(loaded.state.activeExpedition, expected);
  assert.equal(loaded.state.units[0].status, "expedition");
});

let validatorFixture;
const createValidatorFixture = () => {
  if (!validatorFixture) {
    const initial = createInitialState();
    const base = {
      ...initial,
      demonLordName: "局所復旧を検証する魔王",
      gold: 987,
      records: [makeRecord({ id: "record-preserved-before-active" })],
    };
    for (let index = 0; index < 100; index += 1) {
      const started = startExpeditionWithSeed(
        base,
        "ash-border-village",
        [base.units[0].id],
        "balanced",
        `validator-fixture-${index}`,
      ).state;
      const active = started.activeExpedition;
      if (
        active.outcome.party[0].battleEndHp > 0 &&
        active.outcome.rescuedUnits.length > 0 &&
        active.outcome.record.rewards.mvp &&
        active.outcome.progressLogCount < active.outcome.record.logs.length &&
        active.outcome.record.battleLog.length > 1 &&
        active.outcome.record.encounteredEnemies.length > 0
      ) {
        validatorFixture = started;
        break;
      }
    }
    assert.ok(validatorFixture, "validator用の正常なv6 active fixtureを生成できる");
  }
  return structuredClone(validatorFixture);
};

const activeCorruptions = [
  ["record.dungeonName欠損", (active) => { delete active.outcome.record.dungeonName; }],
  ["record.unitNames件数不一致", (active) => { active.outcome.record.unitNames = []; }],
  ["logs空配列", (active) => { active.outcome.record.logs = []; }],
  ["logs ID重複", (active) => { active.outcome.record.logs[1].id = active.outcome.record.logs[0].id; }],
  ["logs時刻逆転", (active) => { active.outcome.record.logs[2].at = active.outcome.record.logs[1].at - 1; }],
  ["logs startedAt未満", (active) => { active.outcome.record.logs[0].at = active.startedAt - 1; }],
  ["completion logがendsAtより前", (active) => {
    active.outcome.record.logs[active.outcome.progressLogCount].at = active.endsAt - 1;
  }],
  ["progressLogCount不一致", (active) => { active.outcome.progressLogCount += 1; }],
  ["battleLog欠損", (active) => { delete active.outcome.record.battleLog; }],
  ["battleLog不正type", (active) => { active.outcome.record.battleLog[0].type = "invalid"; }],
  ["battleLog ID重複", (active) => {
    active.outcome.record.battleLog[1].id = active.outcome.record.battleLog[0].id;
  }],
  ["battleLog不正HP", (active) => { active.outcome.record.battleLog[0].hpAfter = -1; }],
  ["encounteredEnemies欠損", (active) => { delete active.outcome.record.encounteredEnemies; }],
  ["encounteredEnemy dungeonId不一致", (active) => {
    active.outcome.record.encounteredEnemies[0].dungeonId = "black-glass-woods";
  }],
  ["snapshot.currentHpがmaxHp超過", (active) => {
    active.snapshot.party[0].currentHp = active.snapshot.party[0].maxHp + 1;
  }],
  ["snapshot.levelが0", (active) => { active.snapshot.party[0].level = 0; }],
  ["snapshot mastery multiplierが0", (active) => { active.snapshot.mastery.goldMultiplier = 0; }],
  ["party battleEndHpがsnapshot.maxHp超過", (active) => {
    active.outcome.party[0].battleEndHp = active.snapshot.party[0].maxHp + 1;
  }],
  ["生存partyにrecoveryUntilあり", (active) => { active.outcome.party[0].recoveryUntil = active.endsAt + 1; }],
  ["downed partyのrecoveryUntil欠損", (active) => {
    active.outcome.party[0].battleEndHp = 0;
    delete active.outcome.party[0].recoveryUntil;
  }],
  ["rescued unit status不正", (active) => { active.outcome.rescuedUnits[0].status = "expedition"; }],
  ["rescued unit downed status不正", (active) => { active.outcome.rescuedUnits[0].status = "downed"; }],
  ["rescued unit recoveryUntilあり", (active) => {
    active.outcome.rescuedUnits[0].recoveryUntil = active.endsAt + 1;
  }],
  ["rescue summary name不一致", (active) => {
    active.outcome.record.rewards.rescuedUnits[0].name = "改ざんされた救出名";
  }],
  ["rescue summary rarity不一致", (active) => {
    active.outcome.record.rewards.rescuedUnits[0].rarity =
      active.outcome.rescuedUnits[0].rarity === "common" ? "rare" : "common";
  }],
  ["MVPが参加者外", (active) => { active.outcome.record.rewards.mvp.unitId = "unit-outsider"; }],
];

for (const [label, corrupt] of activeCorruptions) {
  test(`v6 active ${label}を再生成せず局所復旧する`, () => {
    const { fake, storage } = loadStorageWithFake();
    const rawState = createValidatorFixture();
    const expected = {
      demonLordName: rawState.demonLordName,
      gold: rawState.gold,
      inventory: structuredClone(rawState.inventory),
      recordIds: rawState.records.map((record) => record.id),
      collection: structuredClone(rawState.collection),
      participantId: rawState.activeExpedition.unitIds[0],
    };
    corrupt(rawState.activeExpedition);
    const raw = JSON.stringify(rawState);
    fake.api.setItem(storage.STORAGE_KEY, raw);

    const loaded = storage.loadSavedGame();

    assert.equal(loaded.status, "recovered", label);
    assert.equal(loaded.state.activeExpedition, undefined, label);
    assert.equal(loaded.state.demonLordName, expected.demonLordName, label);
    assert.equal(loaded.state.gold, expected.gold, label);
    assert.deepEqual(loaded.state.inventory, expected.inventory, label);
    assert.deepEqual(loaded.state.records.map((record) => record.id), expected.recordIds, label);
    assert.deepEqual(loaded.state.collection, expected.collection, label);
    assert.equal(loaded.state.units.find((unit) => unit.id === expected.participantId).status, "idle", label);
    assert.ok(loaded.backupKey, label);
    assert.equal(fake.api.getItem(loaded.backupKey), raw, label);
    assert.equal(JSON.parse(fake.api.getItem(storage.STORAGE_KEY)).activeExpedition, undefined, label);
    assert.match(loaded.message, /進行中遠征だけを解除/, label);
  });
}

test("現行セーブをversion 6の整形済みJSONとして書き出せる", () => {
  const { fake, storage } = loadStorageWithFake();
  const base = createInitialState();
  const state = startExpeditionWithSeed(
    { ...base, demonLordName: "書き出し魔王", gold: 765 },
    "ash-border-village",
    [base.units[0].id],
    "balanced",
    "export-active-seed",
  ).state;
  fake.api.setItem(storage.STORAGE_KEY, "current-save-must-not-change");
  const before = [...fake.store.entries()];

  const result = storage.exportGameState(state, new Date("2026-07-01T15:30:45Z"));
  const exported = JSON.parse(result.json);

  assert.equal(result.ok, true);
  assert.equal(result.filename, "maou-rebuild-save-v6-20260701-153045.json");
  assert.equal(/[\\/:*?"<>|]/.test(result.filename), false);
  assert.equal(result.json.endsWith("\n"), true);
  assert.equal(exported.version, 6);
  assert.equal(exported.demonLordName, "書き出し魔王");
  assert.equal(exported.gold, 765);
  assert.equal(exported.activeExpedition.seed, state.activeExpedition.seed);
  assert.deepEqual(exported.activeExpedition.snapshot, state.activeExpedition.snapshot);
  assert.deepEqual(exported.activeExpedition.outcome, state.activeExpedition.outcome);
  assert.deepEqual([...fake.store.entries()], before);
});

test("正常なv6セーブをcurrent backup後にactive outcomeごと読み込める", () => {
  const { fake, storage } = loadStorageWithFake();
  const current = { ...createInitialState(), demonLordName: "置換前魔王", gold: 111 };
  const currentRaw = JSON.stringify(current);
  fake.api.setItem(storage.STORAGE_KEY, currentRaw);
  const base = createInitialState();
  const imported = startExpeditionWithSeed(
    { ...base, demonLordName: "取込後魔王", gold: 876, records: [makeRecord({ id: "imported-record" })] },
    "ash-border-village",
    [base.units[0].id],
    "balanced",
    "import-active-seed",
  ).state;
  const expectedActive = structuredClone(imported.activeExpedition);

  const result = storage.importGameState(JSON.stringify(imported));
  const persisted = JSON.parse(fake.api.getItem(storage.STORAGE_KEY));

  assert.equal(result.ok, true);
  assert.equal(result.status, "imported");
  assert.equal(result.state.version, 6);
  assert.equal(result.state.demonLordName, "取込後魔王");
  assert.equal(result.state.gold, 876);
  assert.equal(result.state.records[0].id, "imported-record");
  assert.deepEqual(result.state.activeExpedition, expectedActive);
  assert.ok(result.backupKey);
  assert.equal(fake.api.getItem(result.backupKey), currentRaw);
  assert.equal(persisted.demonLordName, "取込後魔王");
  assert.deepEqual(persisted.activeExpedition, expectedActive);
});

test("v5通常セーブをcurrent backup後にv6へ移行して読み込める", () => {
  const { fake, storage } = loadStorageWithFake();
  const currentRaw = JSON.stringify({ ...createInitialState(), gold: 100 });
  fake.api.setItem(storage.STORAGE_KEY, currentRaw);
  const imported = { ...createInitialState(), version: 5, demonLordName: "旧世代魔王", gold: 654, activeExpedition: undefined };

  const result = storage.importGameState(JSON.stringify(imported));

  assert.equal(result.ok, true);
  assert.equal(result.status, "migrated");
  assert.equal(result.importedFromVersion, 5);
  assert.equal(result.state.version, 6);
  assert.equal(result.state.demonLordName, "旧世代魔王");
  assert.equal(result.state.gold, 654);
  assert.equal(result.state.activeExpedition, undefined);
  assert.equal(fake.api.getItem(result.backupKey), currentRaw);
  assert.equal(JSON.parse(fake.api.getItem(storage.STORAGE_KEY)).version, 6);
});

test("v5 active importは同じrawから同じlegacy seedとoutcomeを一度だけ生成する", () => {
  const rawState = createV5ActiveState({ demonLordName: "移行遠征魔王" });
  const raw = JSON.stringify(rawState);
  const firstEnvironment = loadStorageWithFake();
  firstEnvironment.fake.api.setItem(firstEnvironment.storage.STORAGE_KEY, JSON.stringify(createInitialState()));
  const first = firstEnvironment.storage.importGameState(raw);
  const firstActive = structuredClone(first.state.activeExpedition);

  const secondEnvironment = loadStorageWithFake();
  secondEnvironment.fake.api.setItem(secondEnvironment.storage.STORAGE_KEY, JSON.stringify(createInitialState()));
  const second = secondEnvironment.storage.importGameState(raw);

  assert.equal(first.ok, true);
  assert.equal(first.status, "migrated");
  assert.equal(first.importedFromVersion, 5);
  assert.match(firstActive.seed, /^legacy-v5-[0-9a-f]{8}$/);
  assert.deepEqual(second.state.activeExpedition.seed, firstActive.seed);
  assert.deepEqual(second.state.activeExpedition.snapshot, firstActive.snapshot);
  assert.deepEqual(second.state.activeExpedition.outcome, firstActive.outcome);
  assert.equal(first.state.inventory[0].quantity, rawState.inventory[0].quantity);

  const persistedV6 = JSON.stringify(first.state);
  const repeated = secondEnvironment.storage.importGameState(persistedV6);
  assert.equal(repeated.status, "imported");
  assert.deepEqual(repeated.state.activeExpedition, firstActive);
});

test("不正JSON importは現在のセーブを変更せずbackupも作らない", () => {
  const { fake, storage } = loadStorageWithFake();
  const currentRaw = JSON.stringify({ ...createInitialState(), demonLordName: "保護対象" });
  fake.api.setItem(storage.STORAGE_KEY, currentRaw);

  const result = storage.importGameState("{ broken json");

  assert.equal(result.ok, false);
  assert.equal(result.state, undefined);
  assert.equal(fake.api.getItem(storage.STORAGE_KEY), currentRaw);
  assert.equal([...fake.store.keys()].some((key) => key.startsWith("maou-rebuild-state-backup")), false);
});

test("未来version importは現在のセーブを変更せず拒否する", () => {
  const { fake, storage } = loadStorageWithFake();
  const currentRaw = JSON.stringify({ ...createInitialState(), gold: 321 });
  fake.api.setItem(storage.STORAGE_KEY, currentRaw);

  const result = storage.importGameState(JSON.stringify({ version: 999 }));

  assert.equal(result.ok, false);
  assert.match(result.message, /新しいversion 999/);
  assert.equal(fake.api.getItem(storage.STORAGE_KEY), currentRaw);
  assert.equal(fake.store.size, 1);
});

test("空・不正root・不正version importを現在のセーブ不変で拒否する", () => {
  const invalidValues = ["", "[]", JSON.stringify({ version: "6" }), JSON.stringify({ version: 0 }), JSON.stringify({ version: 1.5 }), JSON.stringify({ version: 6, units: {} })];
  invalidValues.forEach((raw) => {
    const { fake, storage } = loadStorageWithFake();
    const currentRaw = JSON.stringify({ ...createInitialState(), gold: 246 });
    fake.api.setItem(storage.STORAGE_KEY, currentRaw);
    const result = storage.importGameState(raw);
    assert.equal(result.ok, false, raw);
    assert.equal(result.state, undefined, raw);
    assert.equal(fake.api.getItem(storage.STORAGE_KEY), currentRaw, raw);
    assert.equal(fake.store.size, 1, raw);
  });
});

test("破損v6 active importは再抽選せず局所復旧してcurrent backupを残す", () => {
  const { fake, storage } = loadStorageWithFake();
  const currentRaw = JSON.stringify({ ...createInitialState(), demonLordName: "置換前" });
  fake.api.setItem(storage.STORAGE_KEY, currentRaw);
  const imported = createValidatorFixture();
  const participantId = imported.activeExpedition.unitIds[0];
  imported.activeExpedition.outcome.progressLogCount += 1;

  const result = storage.importGameState(JSON.stringify(imported));

  assert.equal(result.ok, true);
  assert.equal(result.status, "recovered");
  assert.equal(result.state.activeExpedition, undefined);
  assert.equal(result.state.units.find((unit) => unit.id === participantId).status, "idle");
  assert.equal(result.state.gold, imported.gold);
  assert.deepEqual(result.state.inventory, imported.inventory);
  assert.deepEqual(result.state.records.map((record) => record.id), imported.records.map((record) => record.id));
  assert.deepEqual(result.state.collection, imported.collection);
  assert.equal(fake.api.getItem(result.backupKey), currentRaw);
  assert.match(result.message, /進行中遠征だけを解除/);
});

test("pre-import backup失敗時はimportを中止してcurrent saveを維持する", () => {
  const { fake, storage } = loadStorageWithFake();
  const currentRaw = JSON.stringify({ ...createInitialState(), gold: 444 });
  fake.api.setItem(storage.STORAGE_KEY, currentRaw);
  fake.setItemFault((key) => key.startsWith("maou-rebuild-state-backup-pre-import"));
  const importedRaw = JSON.stringify({ ...createInitialState(), gold: 999 });

  const result = storage.importGameState(importedRaw);

  assert.equal(result.ok, false);
  assert.match(result.message, /バックアップできないため/);
  assert.equal(result.state, undefined);
  assert.equal(fake.api.getItem(storage.STORAGE_KEY), currentRaw);
  assert.equal(fake.store.size, 1);
});

test("imported save書込み失敗時は旧saveと成功済みbackupを維持する", () => {
  const { fake, storage } = loadStorageWithFake();
  const currentRaw = JSON.stringify({ ...createInitialState(), gold: 555 });
  fake.api.setItem(storage.STORAGE_KEY, currentRaw);
  fake.setItemFault((key) => key === storage.STORAGE_KEY);
  const importedRaw = JSON.stringify({ ...createInitialState(), gold: 999 });

  const result = storage.importGameState(importedRaw);

  assert.equal(result.ok, false);
  assert.match(result.message, /保存に失敗/);
  assert.equal(result.state, undefined);
  assert.equal(fake.api.getItem(storage.STORAGE_KEY), currentRaw);
  assert.ok(result.backupKey);
  assert.equal(fake.api.getItem(result.backupKey), currentRaw);
});

test("既存resetはcurrent saveをbackupしてversion 6の初期状態を保存する", () => {
  const { fake, storage } = loadStorageWithFake();
  const currentRaw = JSON.stringify({ ...createInitialState(), demonLordName: "初期化前魔王", gold: 777 });
  fake.api.setItem(storage.STORAGE_KEY, currentRaw);

  const result = storage.resetGameState();

  assert.equal(result.ok, true);
  assert.equal(result.state.version, 6);
  assert.equal(result.state.gold, createInitialState().gold);
  assert.ok(result.backupKey);
  assert.equal(fake.api.getItem(result.backupKey), currentRaw);
  assert.equal(JSON.parse(fake.api.getItem(storage.STORAGE_KEY)).version, 6);
});

test("保存versionは6でpackage versionは1.1.0-alpha.8を使用する", () => {
  const { storage } = loadStorageWithFake();
  const packageJson = require("../package.json");
  assert.equal(storage.SAVE_VERSION, 6);
  assert.equal(createInitialState().version, 6);
  assert.equal(packageJson.version, "1.1.0-alpha.8");
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
