const test = require("node:test");
const assert = require("node:assert/strict");

const { createInitialState } = require("../.tmp-tests/src/lib/progression.js");
const { advanceGame, claimCollectionReward, startExpedition } = require("../.tmp-tests/src/lib/expedition.js");

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
    assert.ok(record.logs.some((entry) => entry.message.includes("MVP")));
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
