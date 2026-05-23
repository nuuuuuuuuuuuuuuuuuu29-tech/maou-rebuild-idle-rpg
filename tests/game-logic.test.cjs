const test = require("node:test");
const assert = require("node:assert/strict");

const { createInitialState } = require("../.tmp-tests/src/lib/progression.js");
const { advanceGame, claimCollectionReward, startExpedition } = require("../.tmp-tests/src/lib/expedition.js");
const { getDungeonMasteryLevel } = require("../.tmp-tests/src/lib/mastery.js");
const {
  getRareDropCandidates,
  getRareDropMasteryBonus,
  isRareDropItem,
} = require("../.tmp-tests/src/lib/rareDrops.js");
const { DEFAULT_TITLE_ID, TITLES } = require("../.tmp-tests/src/data/titles.js");
const {
  canSelectTitle,
  getSelectedTitle,
  getTitleProgress,
  getUnlockedTitles,
  normalizeSelectedTitleId,
} = require("../.tmp-tests/src/lib/titles.js");

const titleById = (id) => TITLES.find((title) => title.id === id);

const makeRecord = (overrides = {}) => ({
  id: overrides.id ?? `record-${Math.random().toString(36).slice(2, 8)}`,
  dungeonId: "ash-border-village",
  dungeonName: "Ash Border Village",
  unitNames: ["Unit"],
  strategy: "balanced",
  startedAt: 1000,
  endedAt: 2000,
  status: "success",
  logs: [],
  rewards: {
    gold: 0,
    demonExp: 0,
    unitExp: 0,
    territory: 0,
    items: [],
    rescuedUnits: [],
  },
  ...overrides,
});

const withFixedRandom = (value, fn) => {
  const originalRandom = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = originalRandom;
  }
};

test("遠征開始でアクティブ遠征とユニット状態が更新される", () => {
  const state = createInitialState();
  const unitId = state.units[0].id;

  const result = startExpedition(state, "ash-border-village", [unitId], "balanced");

  assert.equal(result.ok, true);
  assert.ok(result.state.activeExpedition);
  assert.equal(result.state.activeExpedition.dungeonId, "ash-border-village");
  assert.deepEqual(result.state.activeExpedition.unitIds, [unitId]);
  assert.equal(result.state.units[0].status, "expedition");
  assert.ok(result.state.collection.dungeons.includes("ash-border-village"));
});

test("遠征完了で報酬、経験値、実績、ボス討伐記録が反映される", () => {
  withFixedRandom(0.01, () => {
    const state = createInitialState();
    const unitId = state.units[0].id;
    const started = startExpedition(state, "ash-border-village", [unitId], "balanced");
    assert.equal(started.ok, true);

    const finished = advanceGame(started.state, started.state.activeExpedition.endsAt + 1);
    const record = finished.records[0];

    assert.equal(finished.activeExpedition, undefined);
    assert.equal(record.status, "success");
    assert.ok(record.rewards);
    assert.ok(finished.gold > state.gold);
    assert.ok(finished.territoryLiberation > state.territoryLiberation);
    assert.ok(finished.demonLordExp > state.demonLordExp || finished.demonLordLevel > state.demonLordLevel);
    assert.ok(finished.units[0].exp > state.units[0].exp || finished.units[0].level > state.units[0].level);
    assert.ok(finished.collection.items.length >= state.collection.items.length);
    assert.ok(finished.collection.monsters.length >= state.collection.monsters.length);

    const achievementIds = finished.achievements.unlocked.map((entry) => entry.achievementId);
    assert.ok(achievementIds.includes("first-expedition"));
    assert.ok(achievementIds.includes("first-reclamation"));
    assert.ok(achievementIds.includes("first-boss-defeat"));

    const bossRecord = finished.bossRecords.find((entry) => entry.dungeonId === "ash-border-village");
    assert.equal(bossRecord.defeats, 1);
    assert.equal(bossRecord.firstDefeatedAt, record.endedAt);
    assert.equal(bossRecord.lastDefeatedAt, record.endedAt);
    assert.equal(finished.dungeonMastery.find((entry) => entry.dungeonId === "ash-border-village").clearCount, 1);
    assert.ok(record.logs.some((entry) => entry.message.includes("MVP")));
  });
});

test("遠征失敗時はダンジョン熟練度を増やさない", () => {
  withFixedRandom(0.99, () => {
    const state = createInitialState();
    const unitId = state.units[0].id;
    const started = startExpedition(state, "ash-border-village", [unitId], "balanced");
    assert.equal(started.ok, true);

    const finished = advanceGame(started.state, started.state.activeExpedition.endsAt + 1);
    const mastery = finished.dungeonMastery.find((entry) => entry.dungeonId === "ash-border-village");

    assert.notEqual(finished.records[0].status, "success");
    assert.equal(mastery, undefined);
  });
});

test("ダンジョン熟練度Lvをクリア回数から計算する", () => {
  assert.equal(getDungeonMasteryLevel(0), 0);
  assert.equal(getDungeonMasteryLevel(1), 1);
  assert.equal(getDungeonMasteryLevel(4), 1);
  assert.equal(getDungeonMasteryLevel(5), 2);
  assert.equal(getDungeonMasteryLevel(10), 3);
  assert.equal(getDungeonMasteryLevel(25), 4);
  assert.equal(getDungeonMasteryLevel(50), 5);
});

test("ダンジョン熟練度ボーナスが成功時の金額とユニット経験値に反映される", () => {
  const runSuccess = (state) =>
    withFixedRandom(0.01, () => {
      const unitId = state.units[0].id;
      const started = startExpedition(state, "ash-border-village", [unitId], "balanced");
      assert.equal(started.ok, true);
      return advanceGame(started.state, started.state.activeExpedition.endsAt + 1);
    });

  const normal = runSuccess(createInitialState());
  const mastered = runSuccess({
    ...createInitialState(),
    dungeonMastery: [{ dungeonId: "ash-border-village", clearCount: 5 }],
  });

  assert.equal(mastered.records[0].rewards.gold, Math.round(normal.records[0].rewards.gold * 1.04));
  assert.equal(mastered.records[0].rewards.unitExp, Math.round(normal.records[0].rewards.unitExp * 1.02));
  assert.equal(mastered.dungeonMastery.find((entry) => entry.dungeonId === "ash-border-village").clearCount, 6);
});

test("Rare以上アイテムをレアドロップとして判定し、候補を抽出できる", () => {
  assert.equal(isRareDropItem("fallen-signet"), true);
  assert.equal(isRareDropItem("moon-rust"), false);

  const candidates = getRareDropCandidates([
    { itemId: "moon-rust", chance: 0.8, min: 1, max: 1 },
    { itemId: "fallen-signet", chance: 0.2, min: 1, max: 1 },
  ]);

  assert.deepEqual(candidates.map((item) => item.itemId), ["fallen-signet"]);
});

test("熟練度によるレアドロップ補正はLvごとに増え、最大+1.5%を超えない", () => {
  assert.equal(getRareDropMasteryBonus(0), 0);
  assert.equal(getRareDropMasteryBonus(1), 0.003);
  assert.equal(getRareDropMasteryBonus(5), 0.015);
  assert.equal(getRareDropMasteryBonus(50), 0.015);
});

test("遠征成功時に受け取れたRare以上アイテムだけが図鑑と実績へ反映される", () => {
  withFixedRandom(0.01, () => {
    const base = createInitialState();
    const state = {
      ...base,
      demonLordLevel: 10,
      maxPartySize: 4,
      units: base.units.map((unit) => ({
        ...unit,
        level: 10,
        maxHp: 999,
        currentHp: 999,
        atk: 240,
        def: 220,
        spd: 180,
      })),
    };

    const started = startExpedition(state, "gray-vein-mine", [state.units[0].id], "balanced");
    assert.equal(started.ok, true);

    const finished = advanceGame(started.state, started.state.activeExpedition.endsAt + 1);
    const record = finished.records[0];
    const itemIds = record.rewards.items.map((item) => item.itemId);
    const achievementIds = finished.achievements.unlocked.map((entry) => entry.achievementId);

    assert.equal(record.status, "success");
    assert.ok(itemIds.includes("fallen-signet"));
    assert.ok(finished.collection.items.includes("fallen-signet"));
    assert.ok(achievementIds.includes("rare-spoil"));
    assert.ok(record.logs.some((entry) => entry.message.includes("希少戦利品")));
    assert.ok(record.logs.some((entry) => entry.message.includes("初入手")));
  });
});

test("インベントリ満杯時、未受取レアは図鑑登録されず初入手ログも出ない", () => {
  withFixedRandom(0.01, () => {
    const base = createInitialState();
    const state = {
      ...base,
      demonLordLevel: 10,
      maxPartySize: 4,
      itemCapacity: 1,
      unitCapacity: 1,
      inventory: [{ itemId: "iron-ration", quantity: 1 }],
      collection: {
        ...base.collection,
        items: ["iron-ration", "smoke-charm"],
      },
      units: base.units.map((unit) => ({
        ...unit,
        level: 10,
        maxHp: 999,
        currentHp: 999,
        atk: 240,
        def: 220,
        spd: 180,
      })),
    };

    const started = startExpedition(state, "gray-vein-mine", [state.units[0].id], "balanced");
    assert.equal(started.ok, true);

    const finished = advanceGame(started.state, started.state.activeExpedition.endsAt + 1);
    const record = finished.records[0];

    assert.equal(record.status, "success");
    assert.deepEqual(record.rewards.items, []);
    assert.equal(finished.collection.items.includes("fallen-signet"), false);
    assert.equal(record.logs.some((entry) => entry.message.includes("希少戦利品")), false);
    assert.equal(record.logs.some((entry) => entry.message.includes("初入手")), false);
  });
});

test("図鑑報酬を受け取り、二重受け取りを防止する", () => {
  const state = {
    ...createInitialState(),
    collection: {
      monsters: ["cinder-goblin"],
      items: ["iron-ration", "smoke-charm", "moon-rust"],
      dungeons: ["ash-border-village"],
    },
  };

  const first = claimCollectionReward(state, "ledger-total-5");
  assert.equal(first.ok, true);
  assert.ok(first.state.collectionRewards.claimedIds.includes("ledger-total-5"));
  assert.equal(first.state.gold, state.gold + 80);
  assert.equal(first.state.inventory.find((entry) => entry.itemId === "iron-ration").quantity, 3);

  const second = claimCollectionReward(first.state, "ledger-total-5");
  assert.equal(second.ok, false);
  assert.equal(second.state.gold, first.state.gold);
  assert.equal(
    second.state.collectionRewards.claimedIds.filter((id) => id === "ledger-total-5").length,
    1,
  );
});

test("保有枠不足時は図鑑報酬を受け取らない", () => {
  const base = createInitialState();
  const state = {
    ...base,
    inventory: [{ itemId: "iron-ration", quantity: base.itemCapacity }],
    collection: {
      monsters: ["cinder-goblin"],
      items: ["iron-ration", "smoke-charm", "moon-rust"],
      dungeons: ["ash-border-village"],
    },
  };

  const result = claimCollectionReward(state, "ledger-total-5");

  assert.equal(result.ok, false);
  assert.equal(result.state.gold, state.gold);
  assert.deepEqual(result.state.collectionRewards.claimedIds, []);
  assert.equal(result.state.inventory[0].quantity, base.itemCapacity);
});

test("初期状態で基本称号を取得し、未選択時は安全な称号へフォールバックする", () => {
  const state = createInitialState();
  const unlockedIds = getUnlockedTitles(state).map((title) => title.id);

  assert.ok(unlockedIds.includes(DEFAULT_TITLE_ID));
  assert.equal(getSelectedTitle(state).id, DEFAULT_TITLE_ID);
  assert.equal(normalizeSelectedTitleId({ ...state, selectedTitleId: "unknown-title" }), DEFAULT_TITLE_ID);
});

test("遠征回数、成功数、魔王レベル、図鑑数の称号条件を判定できる", () => {
  const state = {
    ...createInitialState(),
    demonLordLevel: 3,
    territoryLiberation: 25,
    records: [makeRecord(), makeRecord({ status: "failure", rewards: undefined })],
    collection: {
      monsters: ["cinder-goblin", "thorn-kobold", "dusk-batkin", "bone-vanguard", "iron-slime"],
      items: ["iron-ration", "smoke-charm", "moon-rust", "grave-moss"],
      dungeons: ["ash-border-village"],
    },
  };

  assert.equal(getTitleProgress(state, titleById("first-expedition-title")).done, true);
  assert.equal(getTitleProgress(state, titleById("first-reclamation-title")).done, true);
  assert.equal(getTitleProgress(state, titleById("lord-level-three-title")).done, true);
  assert.equal(getTitleProgress(state, titleById("territory-quarter-title")).done, true);
  assert.equal(getTitleProgress(state, titleById("monster-binder-title")).done, true);
  assert.equal(getTitleProgress(state, titleById("ledger-keeper-title")).done, true);
});

test("ボス討伐、ダンジョン熟練度、Rare以上入手、不屈系の称号条件を判定できる", () => {
  const state = {
    ...createInitialState(),
    records: [
      makeRecord({
        rewards: {
          gold: 0,
          demonExp: 0,
          unitExp: 0,
          territory: 0,
          items: [{ itemId: "fallen-signet", quantity: 1 }],
          rescuedUnits: [],
        },
      }),
      makeRecord({ status: "retreat", rewards: undefined }),
    ],
    bossRecords: [{ dungeonId: "ash-border-village", defeats: 1, firstDefeatedAt: 2000, lastDefeatedAt: 2000 }],
    dungeonMastery: [
      { dungeonId: "ash-border-village", clearCount: 5 },
      { dungeonId: "black-glass-woods", clearCount: 1 },
    ],
  };

  assert.equal(getTitleProgress(state, titleById("first-boss-slayer-title")).done, true);
  assert.equal(getTitleProgress(state, titleById("ash-village-ruler")).done, true);
  assert.equal(getTitleProgress(state, titleById("black-glass-walker")).done, true);
  assert.equal(getTitleProgress(state, titleById("rare-spoil-bearer")).done, true);
  assert.equal(getTitleProgress(state, titleById("unyielding-rebuilder")).done, true);
});

test("獲得済み称号のみ選択可能として扱う", () => {
  const base = createInitialState();
  const progressed = {
    ...base,
    records: [makeRecord()],
  };

  assert.equal(canSelectTitle(base, "first-expedition-title"), false);
  assert.equal(canSelectTitle(progressed, "first-expedition-title"), true);
  assert.equal(normalizeSelectedTitleId(progressed, "first-expedition-title"), "first-expedition-title");
  assert.notEqual(normalizeSelectedTitleId(progressed, "not-real-title"), "not-real-title");
});
