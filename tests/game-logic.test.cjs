const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const { createInitialState, createUnit } = require("../.tmp-tests/src/lib/progression.js");
const { advanceGame, claimCollectionReward, hireUnit, startExpedition } = require("../.tmp-tests/src/lib/expedition.js");
const { simulateExpedition } = require("../.tmp-tests/src/lib/battle.js");
const { getDungeonMasteryLevel } = require("../.tmp-tests/src/lib/mastery.js");
const {
  buildCombatLogDisplayItems,
  isBossCombatLogEntry,
} = require("../.tmp-tests/src/lib/combatLogDisplay.js");
const { getRecruitmentStatRows } = require("../.tmp-tests/src/lib/recruitment.js");
const CommandCenter = require("../.tmp-tests/src/components/CommandCenter.js").default;
const {
  getRareDropCandidates,
  getRareDropGoalSummary,
  getRareDropMasteryBonus,
  isRareDropItem,
} = require("../.tmp-tests/src/lib/rareDrops.js");
const { DEFAULT_TITLE_ID, TITLES } = require("../.tmp-tests/src/data/titles.js");
const { UNIT_TEMPLATES } = require("../.tmp-tests/src/data/units.js");
const { UNIT_TRAIT_IDS } = require("../.tmp-tests/src/data/traits.js");
const { DUNGEONS } = require("../.tmp-tests/src/data/dungeons.js");
const { getEnemyCatalogForDungeon } = require("../.tmp-tests/src/data/enemies.js");
const {
  evaluateExpeditionRisk,
  getRecommendedAction,
  getRiskReasons,
} = require("../.tmp-tests/src/lib/expeditionRisk.js");
const { getExpeditionGuideState } = require("../.tmp-tests/src/lib/expeditionGuide.js");
const {
  canSelectTitle,
  getSelectedTitle,
  getTitleProgress,
  getUnlockedTitles,
  normalizeSelectedTitleId,
} = require("../.tmp-tests/src/lib/titles.js");
const {
  TRAIT_LIMITS,
  getPartyTraitModifiers,
  getUnitTrait,
} = require("../.tmp-tests/src/lib/traits.js");

const titleById = (id) => TITLES.find((title) => title.id === id);
const dungeonById = (id) => DUNGEONS.find((dungeon) => dungeon.id === id);
const riskRank = { safe: 0, caution: 1, danger: 2, reckless: 3 };

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

const makeStrongUnit = (templateId, id = `unit-${templateId}`) => ({
  id,
  templateId,
  name: id,
  species: "Test",
  emoji: "◆",
  rarity: "common",
  level: 12,
  exp: 0,
  expToNext: 999,
  maxHp: 999,
  currentHp: 999,
  atk: 260,
  def: 240,
  spd: 200,
  status: "idle",
});

const simulateOneUnit = (templateId, randomValue = 0.01) =>
  withFixedRandom(randomValue, () => {
    const unit = makeStrongUnit(templateId);
    const state = {
      ...createInitialState(),
      demonLordLevel: 10,
      maxPartySize: 4,
      units: [unit],
    };
    return simulateExpedition(state, {
      id: `expedition-${templateId}`,
      dungeonId: "ash-border-village",
      unitIds: [unit.id],
      strategy: "balanced",
      startedAt: 1000,
      endsAt: 31_000,
      durationSeconds: 30,
    });
  });

const makeCombatEntry = (id, type, overrides = {}) => ({
  id,
  turn: overrides.turn ?? 1,
  type,
  text: overrides.text ?? `${type} text`,
  ...overrides,
});

const recruitmentStatsByKey = (template) =>
  Object.fromEntries(getRecruitmentStatRows(template).map((row) => [row.key, row]));

test("雇用候補の表示値は実際に生成されるLv1ユニットと一致する", () => {
  UNIT_TEMPLATES.forEach((template) => {
    const stats = recruitmentStatsByKey(template);
    const unit = createUnit(template.id, { id: `recruit-test-${template.id}` });

    assert.equal(stats.level.value, 1);
    assert.equal(stats.hp.value, unit.maxHp);
    assert.equal(stats.atk.value, unit.atk);
    assert.equal(stats.def.value, unit.def);
    assert.equal(stats.spd.value, unit.spd);
    assert.equal(stats.cost.value, template.hireCost);
    assert.equal(stats.cost.suffix, "G");
  });
});

test("雇用表示は0を保持し、未定義値とNaNを表示しない", () => {
  const rows = getRecruitmentStatRows({
    baseStats: { hp: 0, atk: Number.NaN, spd: 5 },
    hireCost: 0,
  });
  const stats = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  assert.equal(stats.hp, 0);
  assert.equal(stats.spd, 5);
  assert.equal(stats.cost, 0);
  assert.equal("atk" in stats, false);
  assert.equal("def" in stats, false);
  assert.equal(JSON.stringify(rows).includes("undefined"), false);
  assert.equal(JSON.stringify(rows).includes("NaN"), false);
});

test("雇用画面に初期ステータス、費用、特性が表示される", () => {
  const game = { ...createInitialState(), demonLordLevel: 10 };
  const markup = renderToStaticMarkup(
    React.createElement(CommandCenter, {
      game,
      onHire: () => {},
      onBuyItem: () => {},
      onSellItem: () => {},
      onSellUnit: () => {},
      onExpandUnits: () => {},
      onExpandItems: () => {},
    }),
  );

  assert.equal((markup.match(/class="recruitment-stat-grid"/g) ?? []).length, UNIT_TEMPLATES.length);
  assert.ok(markup.includes('aria-label="煤牙ゴブリンの雇用時ステータス"'));
  assert.ok(markup.includes("<dt>最大HP</dt><dd>46</dd>"));
  assert.ok(markup.includes("<dt>攻撃</dt><dd>14</dd>"));
  assert.ok(markup.includes("<dt>防御</dt><dd>10</dd>"));
  assert.ok(markup.includes("<dt>速度</dt><dd>12</dd>"));
  assert.ok(markup.includes("<dt>雇用費</dt><dd>25G</dd>"));
  assert.ok(markup.includes("小鬼の勘"));
  assert.equal(markup.includes("undefined"), false);
  assert.equal(markup.includes("NaN"), false);
});

test("雇用成功と所持金不足時の既存挙動を維持する", () => {
  const base = createInitialState();
  const template = UNIT_TEMPLATES.find((entry) => entry.id === "thorn-kobold");
  const hired = hireUnit(base, template.id);

  assert.equal(hired.ok, true);
  assert.equal(hired.state.gold, base.gold - template.hireCost);
  assert.equal(hired.state.units.length, base.units.length + 1);
  const added = hired.state.units.find((unit) => unit.templateId === template.id);
  assert.equal(added.level, 1);
  assert.equal(added.maxHp, template.baseStats.hp);
  assert.equal(added.atk, template.baseStats.atk);
  assert.equal(added.def, template.baseStats.def);
  assert.equal(added.spd, template.baseStats.spd);

  const insufficient = hireUnit({ ...base, gold: 0 }, template.id);
  assert.equal(insufficient.ok, false);
  assert.equal(insufficient.state.gold, 0);
  assert.equal(insufficient.state.units.length, base.units.length);
});

test("enemy catalog resolves combat enemies for every dungeon", () => {
  DUNGEONS.forEach((dungeon) => {
    const enemies = getEnemyCatalogForDungeon(dungeon.id);

    assert.ok(enemies.length >= dungeon.enemies.length + 1, `${dungeon.id} has enemy catalog entries`);
    enemies.forEach((enemy) => {
      assert.equal(enemy.dungeonId, dungeon.id);
      assert.ok(enemy.id);
      assert.ok(enemy.name);
      assert.ok(enemy.kind);
      assert.ok(enemy.flavor);
      assert.ok(enemy.hp > 0);
      assert.ok(enemy.attack >= 0);
      assert.ok(enemy.defense >= 0);
      assert.ok(enemy.speed >= 0);
      assert.ok(enemy.weight >= 1);
    });
  });
});

test("expedition result includes detailed battle log entries", () => {
  const result = simulateOneUnit("cinder-goblin", 0.01);
  const battleLog = result.record.battleLog;

  assert.equal(result.record.status, "success");
  assert.ok(Array.isArray(battleLog));
  assert.ok(battleLog.some((entry) => entry.type === "encounter"));
  assert.ok(battleLog.some((entry) => entry.type === "allyAttack"));
  assert.ok(battleLog.some((entry) => entry.type === "enemyAttack"));
  assert.ok(battleLog.some((entry) => entry.type === "defeatEnemy"));
  assert.ok(battleLog.some((entry) => entry.type === "victory"));
  assert.ok(battleLog.some((entry) => entry.type === "reward"));
  assert.ok(result.record.encounteredEnemies.length > 0);
});

test("battle log damage and HP values never become negative", () => {
  const result = simulateOneUnit("cinder-goblin", 0.01);

  result.record.battleLog.forEach((entry) => {
    if (entry.damage !== undefined) {
      assert.ok(entry.damage >= 0, `${entry.type} damage is non-negative`);
    }
    if (entry.hpBefore !== undefined) {
      assert.ok(entry.hpBefore >= 0, `${entry.type} hpBefore is non-negative`);
    }
    if (entry.hpAfter !== undefined) {
      assert.ok(entry.hpAfter >= 0, `${entry.type} hpAfter is non-negative`);
    }
  });
});

test("combat log display compacts matching ally and enemy damage rows", () => {
  const displayItems = buildCombatLogDisplayItems([
    makeCombatEntry("encounter-1", "encounter", { actorName: "Rust Guard", text: "Rust Guard appears." }),
    makeCombatEntry("ally-attack-1", "allyAttack", {
      actorName: "Ally",
      targetName: "Rust Guard",
      damage: 12,
      hpBefore: 30,
      hpAfter: 18,
      text: "Ally attacks Rust Guard for 12 damage.",
    }),
    makeCombatEntry("enemy-hp-1", "damage", {
      actorName: "Rust Guard",
      hpBefore: 30,
      hpAfter: 18,
      text: "Rust Guard HP: 30 -> 18",
    }),
    makeCombatEntry("enemy-attack-1", "enemyAttack", {
      actorName: "Rust Guard",
      targetName: "Ally",
      damage: 8,
      hpBefore: 20,
      hpAfter: 12,
      text: "Rust Guard attacks Ally for 8 damage.",
    }),
    makeCombatEntry("ally-hp-1", "damage", {
      actorName: "Ally",
      hpBefore: 20,
      hpAfter: 12,
      text: "Ally HP: 20 -> 12",
    }),
  ]);

  const entries = displayItems.filter((item) => item.kind === "entry");

  assert.equal(displayItems[0].kind, "heading");
  assert.equal(entries.length, 3);
  assert.equal(entries[1].entry.type, "allyAttack");
  assert.match(entries[1].displayText, /HP 30 → 18/);
  assert.equal(entries[1].mergedDamageEntry.id, "enemy-hp-1");
  assert.equal(entries[2].entry.type, "enemyAttack");
  assert.match(entries[2].displayText, /HP 20 → 12/);
  assert.equal(entries[2].mergedDamageEntry.id, "ally-hp-1");
  assert.equal(entries.some((item) => item.entry.id === "enemy-hp-1"), false);
  assert.equal(entries.some((item) => item.entry.id === "ally-hp-1"), false);
});

test("combat log display keeps defeat, retreat, victory, reward, and unmatched rows", () => {
  const displayItems = buildCombatLogDisplayItems([
    makeCombatEntry("encounter-1", "encounter", { actorName: "First Enemy" }),
    makeCombatEntry("ally-attack-1", "allyAttack", {
      actorName: "Ally",
      targetName: "First Enemy",
      hpBefore: 6,
      hpAfter: 0,
      text: "Ally attacks First Enemy for 6 damage.",
    }),
    makeCombatEntry("enemy-hp-1", "damage", { actorName: "First Enemy", hpBefore: 6, hpAfter: 0 }),
    makeCombatEntry("defeat-enemy-1", "defeatEnemy", { targetName: "First Enemy" }),
    makeCombatEntry("encounter-2", "encounter", { actorName: "Second Enemy" }),
    makeCombatEntry("enemy-attack-1", "enemyAttack", {
      actorName: "Second Enemy",
      targetName: "Ally",
      hpBefore: 8,
      hpAfter: 0,
      text: "Second Enemy attacks Ally for 8 damage.",
    }),
    makeCombatEntry("ally-hp-1", "damage", { actorName: "Ally", hpBefore: 8, hpAfter: 0 }),
    makeCombatEntry("defeat-ally-1", "defeatAlly", { targetName: "Ally" }),
    makeCombatEntry("solo-attack", "allyAttack", { actorName: "Ally", targetName: "Third Enemy" }),
    makeCombatEntry("bad-attack", "enemyAttack", {
      actorName: "Third Enemy",
      targetName: "Ally",
      hpBefore: 10,
      hpAfter: 7,
    }),
    makeCombatEntry("wrong-hp", "damage", { actorName: "Other Ally", hpBefore: 10, hpAfter: 7 }),
    makeCombatEntry("victory-1", "victory"),
    makeCombatEntry("retreat-1", "retreat"),
    makeCombatEntry("reward-1", "reward"),
  ]);
  const entries = displayItems.filter((item) => item.kind === "entry");
  const headings = displayItems.filter((item) => item.kind === "heading");

  assert.deepEqual(headings.map((item) => item.enemyName), ["First Enemy", "Second Enemy"]);
  assert.deepEqual(
    entries.map((item) => item.entry.type),
    [
      "encounter",
      "allyAttack",
      "defeatEnemy",
      "encounter",
      "enemyAttack",
      "defeatAlly",
      "allyAttack",
      "enemyAttack",
      "damage",
      "victory",
      "retreat",
      "reward",
    ],
  );
  assert.match(entries.find((item) => item.entry.id === "ally-attack-1").displayText, /HP 6 → 0/);
  assert.equal(entries.find((item) => item.entry.id === "defeat-enemy-1").entry.type, "defeatEnemy");
  assert.match(entries.find((item) => item.entry.id === "enemy-attack-1").displayText, /HP 8 → 0/);
  assert.equal(entries.find((item) => item.entry.id === "defeat-ally-1").entry.type, "defeatAlly");
  assert.equal(entries.find((item) => item.entry.id === "solo-attack").displayText, "allyAttack text");
  assert.equal(entries.find((item) => item.entry.id === "bad-attack").mergedDamageEntry, undefined);
  assert.equal(entries.find((item) => item.entry.id === "wrong-hp").entry.type, "damage");
});

test("combat log display does not compact across battle boundaries or missing logs", () => {
  const displayItems = buildCombatLogDisplayItems([
    makeCombatEntry("attack-1", "allyAttack", {
      actorName: "Ally",
      targetName: "First Enemy",
      hpBefore: 10,
      hpAfter: 5,
    }),
    makeCombatEntry("encounter-1", "encounter", { actorName: "Second Enemy" }),
    makeCombatEntry("late-hp-1", "damage", { actorName: "First Enemy", hpBefore: 10, hpAfter: 5 }),
  ]);
  const entries = displayItems.filter((item) => item.kind === "entry");

  assert.equal(buildCombatLogDisplayItems([]).length, 0);
  assert.equal(entries.find((item) => item.entry.id === "attack-1").mergedDamageEntry, undefined);
  assert.equal(entries.find((item) => item.entry.id === "late-hp-1").entry.type, "damage");
});

test("combat log display identifies boss encounters and defeats from dungeon enemy IDs", () => {
  const dungeon = dungeonById("ash-border-village");
  const normalEnemy = dungeon.enemies[0];
  const boss = dungeon.boss;
  const displayItems = buildCombatLogDisplayItems(
    [
      makeCombatEntry("normal-encounter", "encounter", {
        enemyId: normalEnemy.id,
        actorName: normalEnemy.name,
      }),
      makeCombatEntry("normal-defeat", "defeatEnemy", {
        enemyId: normalEnemy.id,
        targetName: normalEnemy.name,
      }),
      makeCombatEntry("boss-encounter", "encounter", {
        enemyId: boss.id,
        actorName: boss.name,
      }),
      makeCombatEntry("boss-attack", "allyAttack", {
        enemyId: boss.id,
        actorName: "Ally",
        targetName: boss.name,
        hpBefore: 12,
        hpAfter: 0,
      }),
      makeCombatEntry("boss-damage", "damage", {
        actorName: boss.name,
        hpBefore: 12,
        hpAfter: 0,
      }),
      makeCombatEntry("boss-defeat", "defeatEnemy", {
        enemyId: boss.id,
        targetName: boss.name,
      }),
      makeCombatEntry("ally-defeat", "defeatAlly"),
      makeCombatEntry("victory", "victory"),
      makeCombatEntry("retreat", "retreat"),
      makeCombatEntry("reward", "reward"),
    ],
    dungeon.id,
  );
  const headings = displayItems.filter((item) => item.kind === "heading");
  const entries = displayItems.filter((item) => item.kind === "entry");

  assert.equal(isBossCombatLogEntry(makeCombatEntry("boss", "encounter", { enemyId: boss.id }), dungeon.id), true);
  assert.equal(
    isBossCombatLogEntry(makeCombatEntry("normal", "encounter", { enemyId: normalEnemy.id }), dungeon.id),
    false,
  );
  assert.deepEqual(
    headings.map((item) => ({ number: item.battleNumber, name: item.enemyName, isBoss: item.isBoss })),
    [
      { number: 1, name: normalEnemy.name, isBoss: false },
      { number: 2, name: boss.name, isBoss: true },
    ],
  );
  assert.equal(entries.find((item) => item.entry.id === "normal-defeat").isBossDefeat, false);
  assert.equal(entries.find((item) => item.entry.id === "boss-defeat").isBossDefeat, true);
  assert.match(entries.find((item) => item.entry.id === "boss-attack").displayText, /HP 12 → 0/);
  assert.deepEqual(
    entries.slice(-4).map((item) => item.entry.type),
    ["defeatAlly", "victory", "retreat", "reward"],
  );
});

test("boss display falls back to normal for incomplete or unknown log data", () => {
  assert.equal(isBossCombatLogEntry(makeCombatEntry("missing-id", "encounter"), "ash-border-village"), false);
  assert.equal(
    isBossCombatLogEntry(makeCombatEntry("unknown-dungeon", "encounter", { enemyId: "village-warden" }), "missing"),
    false,
  );
  assert.doesNotThrow(() => buildCombatLogDisplayItems([makeCombatEntry("old", "encounter")], "missing"));
  assert.equal(buildCombatLogDisplayItems([makeCombatEntry("old", "encounter")], "missing")[0].isBoss, false);
});

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

test("選択ダンジョンのRare以上だけを目標化し、未入手を優先する", () => {
  const dungeon = DUNGEONS.find((entry) => entry.id === "abyssal-throne-ruins");
  const rewardsBefore = structuredClone(dungeon.rewards);
  const summary = getRareDropGoalSummary(dungeon.rewards, ["eclipse-feather", "void-crystal"]);

  assert.deepEqual(
    summary.items.map((item) => item.itemId),
    ["abyss-heart", "demon-crown-fragment", "moat-black-water", "eclipse-feather", "void-crystal"],
  );
  assert.deepEqual(new Set(summary.items.map((item) => item.rarity)), new Set(["rare", "epic", "legendary"]));
  assert.equal(summary.items.some((item) => item.itemId === "moon-rust"), false);
  assert.equal(summary.obtainedCount, 2);
  assert.equal(summary.remainingCount, 3);
  assert.equal(summary.totalCount, 5);
  assert.equal(summary.allObtained, false);
  assert.deepEqual(dungeon.rewards, rewardsBefore);
});

test("未発見名を隠し、入手済みなら正式名と収集済み状態を導出する", () => {
  const dungeon = DUNGEONS.find((entry) => entry.id === "gray-vein-mine");
  const hidden = getRareDropGoalSummary(dungeon.rewards, []);
  const obtained = getRareDropGoalSummary(dungeon.rewards, ["fallen-signet"]);

  assert.equal(hidden.items[0].displayName, "？？？");
  assert.equal(hidden.items[0].displayIcon, "");
  assert.equal(hidden.items[0].label, "Rare");
  assert.equal(hidden.items[0].obtained, false);
  assert.equal(obtained.items[0].displayName, "落王の印片");
  assert.equal(obtained.items[0].obtained, true);
  assert.equal(obtained.allObtained, true);
  assert.equal(createInitialState().version, 5);
});

test("ダンジョン変更・候補なし・不完全な報酬データを安全に扱う", () => {
  const borderVillage = DUNGEONS.find((entry) => entry.id === "ash-border-village");
  const crater = DUNGEONS.find((entry) => entry.id === "molten-bone-crater");
  const empty = getRareDropGoalSummary(borderVillage.rewards, []);
  const craterGoals = getRareDropGoalSummary(crater.rewards, []);
  const incomplete = getRareDropGoalSummary(
    [
      null,
      { itemId: "missing-item", chance: 1, min: 1, max: 1 },
      { itemId: "lava-core", chance: 0.1, min: 1, max: 1 },
      { itemId: "lava-core", chance: 0.1, min: 1, max: 1 },
    ],
    undefined,
  );

  assert.deepEqual(empty, {
    items: [],
    obtainedCount: 0,
    remainingCount: 0,
    totalCount: 0,
    allObtained: false,
  });
  assert.deepEqual(craterGoals.items.map((item) => item.itemId), ["lava-core", "night-war-drum", "ash-iron"]);
  assert.deepEqual(incomplete.items.map((item) => item.itemId), ["lava-core"]);
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

test("全UnitTemplateに種族固定特性が解決できる", () => {
  UNIT_TEMPLATES.forEach((template) => {
    assert.ok(UNIT_TRAIT_IDS[template.id], `${template.id} has trait mapping`);
    const trait = getUnitTrait(template.id);
    assert.ok(trait.id);
    assert.ok(trait.name);
  });
});

test("特性効果を集計し、上限値を超えない", () => {
  const goldUnits = Array.from({ length: 5 }, (_, index) => makeStrongUnit("cinder-goblin", `gold-${index}`));
  const shieldUnits = Array.from({ length: 5 }, (_, index) => makeStrongUnit("bone-vanguard", `shield-${index}`));
  const mixed = getPartyTraitModifiers([makeStrongUnit("cinder-goblin"), makeStrongUnit("bone-vanguard")]);
  const cappedGold = getPartyTraitModifiers(goldUnits);
  const cappedShield = getPartyTraitModifiers(shieldUnits);

  assert.equal(mixed.goldBonus, 0.02);
  assert.equal(mixed.damageReduction, 0.03);
  assert.equal(cappedGold.goldBonus, TRAIT_LIMITS.goldBonus);
  assert.equal(cappedShield.damageReduction, TRAIT_LIMITS.damageReduction);
  assert.equal(cappedGold.goldMultiplier, 1 + TRAIT_LIMITS.goldBonus);
  assert.equal(cappedShield.damageMultiplier, 1 - TRAIT_LIMITS.damageReduction);
});

test("金額補正が遠征報酬に控えめに反映される", () => {
  const goldResult = simulateOneUnit("cinder-goblin", 0.01);
  const controlResult = simulateOneUnit("bone-vanguard", 0.01);

  assert.equal(goldResult.record.status, "success");
  assert.equal(controlResult.record.status, "success");
  assert.ok(goldResult.rewards.gold > controlResult.rewards.gold);
  assert.ok(goldResult.rewards.gold - controlResult.rewards.gold <= 2);
});

test("被ダメージ軽減が戦闘中だけ反映され、永続ステータスは書き換えない", () => {
  const simulateWeakRun = (templateId) =>
    withFixedRandom(0.5, () => {
      const unit = {
        ...makeStrongUnit(templateId),
        level: 1,
        maxHp: 120,
        currentHp: 120,
        atk: 10,
        def: 5,
        spd: 5,
      };
      const state = {
        ...createInitialState(),
        demonLordLevel: 1,
        units: [unit],
      };
      return simulateExpedition(state, {
        id: `expedition-${templateId}`,
        dungeonId: "gray-vein-mine",
        unitIds: [unit.id],
        strategy: "rush",
        startedAt: 1000,
        endsAt: 31_000,
        durationSeconds: 30,
      });
    });

  const shieldResult = simulateWeakRun("bone-vanguard");
  const controlResult = simulateWeakRun("cinder-goblin");
  const shieldUnit = shieldResult.partyUpdates[0];
  const controlUnit = controlResult.partyUpdates[0];

  assert.ok(shieldUnit.currentHp > controlUnit.currentHp);
  assert.equal(shieldUnit.atk, controlUnit.atk);
  assert.equal(shieldUnit.def, controlUnit.def);
  assert.equal(shieldUnit.spd, controlUnit.spd);
});

test("罠回避、ボス戦補正、通常戦補正を分離して計算できる", () => {
  const shadow = getPartyTraitModifiers([makeStrongUnit("dusk-batkin")]);
  const breaker = getPartyTraitModifiers([makeStrongUnit("mire-ogre")]);
  const quick = getPartyTraitModifiers([makeStrongUnit("spark-imp")]);

  assert.equal(shadow.trapAvoidance, 0.03);
  assert.equal(breaker.bossPowerBonus, 0.02);
  assert.equal(breaker.normalPowerBonus, 0);
  assert.equal(quick.normalPowerBonus, 0.01);
  assert.equal(quick.bossPowerBonus, 0);
});

test("初期部隊の最初の遠征は危険度が安全または注意に収まる", () => {
  const state = createInitialState();
  const dungeon = dungeonById("ash-border-village");

  const balanced = evaluateExpeditionRisk(state, dungeon, state.units, "balanced");
  const safe = evaluateExpeditionRisk(state, dungeon, state.units, "safe");

  assert.ok(["safe", "caution"].includes(balanced.level));
  assert.ok(["safe", "caution"].includes(safe.level));
  assert.equal(balanced.blocksStart, false);
});

test("初期相当部隊で黒玻璃の林へ向かうと危険または無謀になる", () => {
  const state = { ...createInitialState(), demonLordLevel: 2 };
  const dungeon = dungeonById("black-glass-woods");
  const risk = evaluateExpeditionRisk(state, dungeon, state.units, "balanced");

  assert.ok(["danger", "reckless"].includes(risk.level));
  assert.ok(getRiskReasons(risk).some((reason) => reason.includes("部隊戦力")));
});

test("強行突破と戦利品重視は安全重視より危険度が下がらない", () => {
  const state = createInitialState();
  const dungeon = dungeonById("ash-border-village");
  const safe = evaluateExpeditionRisk(state, dungeon, state.units, "safe");
  const rush = evaluateExpeditionRisk(state, dungeon, state.units, "rush");
  const loot = evaluateExpeditionRisk(state, dungeon, state.units, "loot");

  assert.ok(riskRank[rush.level] >= riskRank[safe.level]);
  assert.ok(riskRank[loot.level] >= riskRank[safe.level]);
});

test("ユニット未選択は無謀だが、警告ロジック自体は出撃をブロックしない", () => {
  const state = createInitialState();
  const dungeon = dungeonById("ash-border-village");
  const risk = evaluateExpeditionRisk(state, dungeon, [], "balanced");

  assert.equal(risk.level, "reckless");
  assert.equal(risk.blocksStart, false);
  assert.ok(getRiskReasons(risk).some((reason) => reason.includes("出撃ユニット")));
});

test("推奨Lv不足とおすすめ行動を危険度理由として返せる", () => {
  const state = createInitialState();
  const dungeon = dungeonById("black-glass-woods");
  const risk = evaluateExpeditionRisk(state, dungeon, state.units, "balanced");

  assert.ok(getRiskReasons(risk).some((reason) => reason.includes("推奨Lv")));
  assert.ok(getRecommendedAction(risk).length > 0);
});

test("遠征準備ガイドは未選択状態から次の操作を返す", () => {
  const guide = getExpeditionGuideState({
    dungeonSelected: false,
    selectedUnitCount: 0,
    strategySelected: false,
    selectedDungeonName: "未選択",
    firstDungeonName: "煤けた境界村",
    strategyName: "未選択",
    isFirstRun: true,
  });

  assert.equal(guide.currentStep, "dungeon");
  assert.equal(guide.highlightTarget, "dungeon");
  assert.equal(guide.ready, false);
  assert.ok(guide.body.includes("煤けた境界村"));
});

test("遠征準備ガイドは配下未選択と準備完了を区別する", () => {
  const noUnit = getExpeditionGuideState({
    dungeonSelected: true,
    selectedUnitCount: 0,
    strategySelected: true,
    selectedDungeonName: "煤けた境界村",
    firstDungeonName: "煤けた境界村",
    strategyName: "バランス重視",
    isFirstRun: true,
  });
  const ready = getExpeditionGuideState({
    dungeonSelected: true,
    selectedUnitCount: 1,
    strategySelected: true,
    selectedDungeonName: "煤けた境界村",
    firstDungeonName: "煤けた境界村",
    strategyName: "バランス重視",
    isFirstRun: true,
  });

  assert.equal(noUnit.currentStep, "units");
  assert.equal(noUnit.ready, false);
  assert.equal(ready.currentStep, "start");
  assert.equal(ready.highlightTarget, "start");
  assert.equal(ready.ready, true);
  assert.equal(ready.steps.find((step) => step.id === "item").status, "optional");
});

test("GameState.versionはv0.6でも5のまま", () => {
  assert.equal(createInitialState().version, 5);
});
