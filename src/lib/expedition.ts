import { getCollectionReward } from "../data/collectionRewards";
import { getDungeon } from "../data/dungeons";
import { getItemDefinition } from "../data/items";
import { getStrategy } from "../data/strategies";
import { getUnitTemplate } from "../data/units";
import type { GameState, GameUnit, StrategyId } from "../types/game";
import { evaluateAchievements, getCollectionRewardProgress, updateBossRecordsForRecord } from "./achievements";
import { simulateExpedition, simulateExpeditionV1 } from "./battle";
import { formatDungeonMasteryBonus, getDungeonMasteryInfo, updateDungeonMasteryForRecord } from "./mastery";
import {
  addInventoryStacks,
  applyDemonExperience,
  applyUnitExperience,
  createUnit,
  getInventoryCount,
  makeId,
  mergeCollection,
  recoverUnits,
  removeInventoryItem,
} from "./progression";
import { formatRareDropItems, getFirstDiscoveredRareDropItems, getRareDropItems } from "./rareDrops";

export interface GameActionResult {
  ok: boolean;
  message: string;
  state: GameState;
}

const ok = (state: GameState, message: string): GameActionResult => ({ ok: true, message, state });

const fail = (state: GameState, message: string): GameActionResult => ({ ok: false, message, state });

const rarityBonus = {
  common: 0,
  uncommon: 18,
  rare: 42,
  epic: 90,
  legendary: 180,
};

const totalItemQuantity = (items: { quantity: number }[]) =>
  items.reduce((total, item) => total + item.quantity, 0);

const restoreSurvivingParticipants = (
  units: GameUnit[],
  participantIds: Set<string>,
  battlePartyById: Map<string, GameUnit>,
) =>
  units.map((unit) => {
    if (!participantIds.has(unit.id)) {
      return unit;
    }

    const battleUnit = battlePartyById.get(unit.id);
    if (!battleUnit || battleUnit.currentHp <= 0) {
      return unit;
    }

    return {
      ...unit,
      currentHp: unit.maxHp,
      status: "idle" as const,
      recoveryUntil: undefined,
    };
  });

export const formatSeconds = (totalSeconds: number) => {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}:${rest.toString().padStart(2, "0")}` : `${rest}秒`;
};

export const getAdjustedDuration = (dungeonId: string, strategyId: StrategyId) => {
  const dungeon = getDungeon(dungeonId);
  const strategy = getStrategy(strategyId);
  return Math.max(30, Math.round(dungeon.durationSeconds * strategy.durationMultiplier));
};

export const getActiveProgress = (state: GameState, now: number) => {
  if (!state.activeExpedition) {
    return { ratio: 0, remainingSeconds: 0 };
  }

  const { startedAt, endsAt } = state.activeExpedition;
  const duration = endsAt - startedAt;
  const elapsed = now - startedAt;
  return {
    ratio: Math.min(1, Math.max(0, elapsed / duration)),
    remainingSeconds: Math.max(0, Math.ceil((endsAt - now) / 1000)),
  };
};

export const getActiveExpeditionLogs = (state: GameState, now: number) => {
  const active = state.activeExpedition;
  if (!active) {
    return [];
  }

  const dungeon = getDungeon(active.dungeonId);
  const party = active.unitIds
    .map((id) => state.units.find((unit) => unit.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const ratio = getActiveProgress(state, now).ratio;
  const entries = [
    { at: active.startedAt, message: `${dungeon.name}へ出発。${party.join("、")}が黒旗を担ぐ。` },
    { at: active.startedAt + (active.endsAt - active.startedAt) * 0.25, message: "入口付近で敵影を確認。斥候が低い合図を返した。" },
    { at: active.startedAt + (active.endsAt - active.startedAt) * 0.5, message: "中層で古い物資箱を発見。開けるかどうか、隊長が短く迷う。" },
    { at: active.startedAt + (active.endsAt - active.startedAt) * 0.75, message: "最深部の気配が濃い。魔王軍の足音が静かに揃う。" },
  ];
  const visibleCount = ratio >= 1 ? entries.length : Math.max(1, Math.ceil(ratio * entries.length));

  return entries.slice(0, visibleCount).map((entry, index) => ({
    id: `active-${active.id}-${index}`,
    at: Math.floor(entry.at),
    type: "info" as const,
    message: entry.message,
  }));
};

const finishExpedition = (state: GameState, now: number, simulationSeed?: string): GameState => {
  if (!state.activeExpedition || state.activeExpedition.endsAt > now) {
    return state;
  }

  const active = state.activeExpedition;
  const simulation = simulationSeed === undefined
    ? simulateExpedition(state, active)
    : simulateExpeditionV1(state, active, simulationSeed);
  const masteryBefore = getDungeonMasteryInfo(state, active.dungeonId);
  const masteryApplies = simulation.record.status === "success" && masteryBefore.level > 0;
  const goldWithMastery = masteryApplies
    ? Math.round(simulation.rewards.gold * masteryBefore.bonus.goldMultiplier)
    : simulation.rewards.gold;
  const unitExpWithMastery = masteryApplies
    ? Math.round(simulation.rewards.unitExp * masteryBefore.bonus.unitExpMultiplier)
    : simulation.rewards.unitExp;
  const participantIds = new Set(active.unitIds);
  const partyById = new Map(simulation.partyUpdates.map((unit) => [unit.id, unit]));
  const inventoryResult = addInventoryStacks(state.inventory, simulation.rewards.items, state.itemCapacity);
  const rescueRoom = Math.max(0, state.unitCapacity - state.units.length);
  const acceptedRescues = simulation.rescuedUnits.slice(0, rescueRoom);
  const acceptedRescueSummaries = acceptedRescues.map((unit) => ({
    unitId: unit.id,
    name: unit.name,
    species: unit.species,
    rarity: unit.rarity,
  }));
  const rewards = {
    ...simulation.rewards,
    gold: goldWithMastery,
    unitExp: unitExpWithMastery,
    items: inventoryResult.accepted,
    rescuedUnits: acceptedRescueSummaries,
  };

  let units = state.units.map((unit) => {
    const battleUnit = partyById.get(unit.id);
    const mergedUnit = battleUnit ?? unit;
    return participantIds.has(unit.id) ? applyUnitExperience(mergedUnit, rewards.unitExp) : mergedUnit;
  });
  units = restoreSurvivingParticipants(units, participantIds, partyById);
  units = [...units, ...acceptedRescues];

  const levelUpLogs = units
    .filter((unit) => participantIds.has(unit.id))
    .flatMap((unit) => {
      const before = partyById.get(unit.id) ?? state.units.find((candidate) => candidate.id === unit.id);
      if (!before || unit.level <= before.level) {
        return [];
      }

      return [
        {
          id: makeId("log"),
          at: active.endsAt,
          type: "success" as const,
          message: `${unit.name}がLv${unit.level}に成長。HP ${unit.maxHp} / ATK ${unit.atk} / DEF ${unit.def} / SPD ${unit.spd}になった。`,
        },
      ];
    });

  const extraLogs =
    totalItemQuantity(inventoryResult.accepted) < totalItemQuantity(simulation.rewards.items)
      ? [
          {
            id: makeId("log"),
            at: active.endsAt,
            type: "loot" as const,
            message: "持ち帰り袋がいっぱいで、一部の戦利品は現地に隠してきた。",
          },
        ]
      : [];
  const acceptedRareDrops = getRareDropItems(inventoryResult.accepted);
  const firstRareDrops = getFirstDiscoveredRareDropItems(inventoryResult.accepted, state.collection.items);
  const rareDropLogs = [
    ...(acceptedRareDrops.length > 0
      ? [
          {
            id: makeId("log"),
            at: active.endsAt,
            type: "loot" as const,
            message: `希少戦利品: ${formatRareDropItems(acceptedRareDrops)} を宝物庫に納めた。遠征隊の足跡に、薄い金の火が残る。`,
          },
        ]
      : []),
    ...(firstRareDrops.length > 0
      ? [
          {
            id: makeId("log"),
            at: active.endsAt,
            type: "success" as const,
            message: `初入手: ${formatRareDropItems(firstRareDrops)} を図鑑に刻んだ。次の周回で狙うべき影が、ひとつ増えた。`,
          },
        ]
      : []),
  ];
  const masteryBonusLogs =
    masteryApplies && (goldWithMastery > simulation.rewards.gold || unitExpWithMastery > simulation.rewards.unitExp)
      ? [
          {
            id: makeId("log"),
            at: active.endsAt,
            type: "loot" as const,
            message: `熟練度Lv${masteryBefore.level}の地の利が働いた。${formatDungeonMasteryBonus(masteryBefore.level)}。`,
          },
        ]
      : [];

  const record = {
    ...simulation.record,
    endedAt: active.endsAt,
    rewards,
    logs: [...simulation.record.logs, ...levelUpLogs, ...extraLogs, ...rareDropLogs, ...masteryBonusLogs],
  };
  const masteryResult = updateDungeonMasteryForRecord(state.dungeonMastery, record);

  const discoveredItems = [
    ...inventoryResult.accepted.map((item) => item.itemId),
    ...state.inventory.map((item) => item.itemId),
  ];
  const discoveredMonsters = [...units.map((unit) => unit.templateId)];
  let next: GameState = {
    ...state,
    activeExpedition: undefined,
    units,
    inventory: inventoryResult.inventory,
    gold: state.gold + rewards.gold,
    territoryLiberation: Math.min(100, state.territoryLiberation + rewards.territory),
    records: [record, ...state.records].slice(0, 40),
    dungeonMastery: masteryResult.records,
    collection: mergeCollection(state.collection, {
      monsters: discoveredMonsters,
      items: discoveredItems,
      dungeons: [active.dungeonId],
    }),
    updatedAt: now,
  };

  next = applyDemonExperience(next, rewards.demonExp);
  const bossResult = updateBossRecordsForRecord(next, record);
  next = bossResult.state;

  const achievementResult = evaluateAchievements(next, active.endsAt);
  next = achievementResult.state;

  const metaLogs = [
    ...(masteryResult.changed && masteryResult.nextLevel > masteryResult.previousLevel
      ? [
          {
            id: makeId("log"),
            at: active.endsAt,
            type: "success" as const,
            message: `熟練度上昇: ${record.dungeonName} がLv${masteryResult.nextLevel}に到達。踏破${masteryResult.clearCount}回、次回以降 ${formatDungeonMasteryBonus(masteryResult.nextLevel)}。`,
          },
        ]
      : []),
    ...(bossResult.firstDefeat
      ? [
          {
            id: makeId("log"),
            at: active.endsAt,
            type: "success" as const,
            message: `${record.dungeonName}のボス討伐記録が刻まれた。玉座へ戻る道に、また一つ黒い杭が打たれる。`,
          },
        ]
      : []),
    ...achievementResult.unlocked.map((achievement) => ({
      id: makeId("log"),
      at: active.endsAt,
      type: "success" as const,
      message: `実績解除: ${achievement.title} - ${achievement.description}`,
    })),
  ];

  if (metaLogs.length > 0) {
    next = {
      ...next,
      records: next.records.map((entry, index) =>
        index === 0 ? { ...entry, logs: [...entry.logs, ...metaLogs] } : entry,
      ),
    };
  }

  return next;
};

const advanceGameInternal = (state: GameState, now: number, simulationSeed?: string): GameState => {
  const recovered = recoverUnits(state, now);
  const finished = finishExpedition(recovered, now, simulationSeed);
  return recoverUnits(finished, now);
};

export const advanceGame = (state: GameState, now: number): GameState =>
  advanceGameInternal(state, now);

export const advanceGameWithSimulationSeed = (state: GameState, now: number, seed: string): GameState =>
  advanceGameInternal(state, now, seed);

export const startExpedition = (
  state: GameState,
  dungeonId: string,
  unitIds: string[],
  strategyId: StrategyId,
  itemId?: string,
): GameActionResult => {
  const now = Date.now();
  if (state.activeExpedition) {
    return fail(state, "進行中の遠征があります。");
  }

  const dungeon = getDungeon(dungeonId);
  if (state.demonLordLevel < dungeon.unlockLevel) {
    return fail(state, "このダンジョンはまだ解放されていません。");
  }

  const uniqueUnitIds = [...new Set(unitIds)];
  if (uniqueUnitIds.length === 0) {
    return fail(state, "出撃ユニットを選んでください。");
  }
  if (uniqueUnitIds.length > state.maxPartySize) {
    return fail(state, `出撃可能数は最大${state.maxPartySize}体です。`);
  }

  const selectedUnits = uniqueUnitIds.map((id) => state.units.find((unit) => unit.id === id));
  if (selectedUnits.some((unit) => !unit || unit.status !== "idle")) {
    return fail(state, "待機中のユニットだけが出撃できます。");
  }

  let inventory = state.inventory;
  if (itemId) {
    const item = getItemDefinition(itemId);
    const stock = inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
    if (item.type !== "support" || stock <= 0) {
      return fail(state, "選択した持ち込みアイテムを使えません。");
    }
    inventory = removeInventoryItem(inventory, itemId, 1);
  }

  const durationSeconds = getAdjustedDuration(dungeonId, strategyId);
  const activeExpedition = {
    id: makeId("expedition"),
    dungeonId,
    unitIds: uniqueUnitIds,
    strategy: strategyId,
    itemId,
    startedAt: now,
    endsAt: now + durationSeconds * 1000,
    durationSeconds,
  };

  return ok(
    {
      ...state,
      inventory,
      activeExpedition,
      units: state.units.map((unit) =>
        uniqueUnitIds.includes(unit.id) ? { ...unit, status: "expedition" as const } : unit,
      ),
      collection: mergeCollection(state.collection, { dungeons: [dungeonId] }),
      updatedAt: now,
    },
    `${dungeon.name}への遠征を開始しました。`,
  );
};

export const renameUnit = (state: GameState, unitId: string, name: string): GameActionResult => {
  const nextName = name.trim().slice(0, 12);
  if (!nextName) {
    return fail(state, "名前を入力してください。");
  }

  return ok(
    {
      ...state,
      units: state.units.map((unit) => (unit.id === unitId ? { ...unit, name: nextName } : unit)),
      updatedAt: Date.now(),
    },
    "ユニット名を変更しました。",
  );
};

export const hireUnit = (state: GameState, templateId: string): GameActionResult => {
  const template = getUnitTemplate(templateId);
  if (state.demonLordLevel < template.unlockLevel) {
    return fail(state, "魔王レベルが足りません。");
  }
  if (state.units.length >= state.unitCapacity) {
    return fail(state, "配下の保有上限に達しています。");
  }

  const emergencyFree = template.id === "cinder-goblin" && state.units.length === 0;
  const cost = emergencyFree ? 0 : template.hireCost;
  if (state.gold < cost) {
    return fail(state, "所持金が足りません。");
  }

  const unit = createUnit(templateId);
  return ok(
    {
      ...state,
      gold: state.gold - cost,
      units: [...state.units, unit],
      collection: mergeCollection(state.collection, { monsters: [templateId] }),
      updatedAt: Date.now(),
    },
    `${template.species}を雇用しました。`,
  );
};

export const buyItem = (state: GameState, itemId: string): GameActionResult => {
  const item = getItemDefinition(itemId);
  if (item.price <= 0 || item.type !== "support") {
    return fail(state, "この品は購入できません。");
  }
  if (state.demonLordLevel < item.unlockLevel) {
    return fail(state, "魔王レベルが足りません。");
  }
  if (getInventoryCount(state.inventory) >= state.itemCapacity) {
    return fail(state, "アイテム保有上限に達しています。");
  }
  if (state.gold < item.price) {
    return fail(state, "所持金が足りません。");
  }

  const added = addInventoryStacks(state.inventory, [{ itemId, quantity: 1 }], state.itemCapacity);
  return ok(
    {
      ...state,
      gold: state.gold - item.price,
      inventory: added.inventory,
      collection: mergeCollection(state.collection, { items: [itemId] }),
      updatedAt: Date.now(),
    },
    `${item.name}を購入しました。`,
  );
};

export const claimCollectionReward = (state: GameState, rewardId: string): GameActionResult => {
  const reward = getCollectionReward(rewardId);
  if (state.collectionRewards.claimedIds.includes(rewardId)) {
    return fail(state, "この図鑑報酬はすでに受け取り済みです。");
  }

  const progress = getCollectionRewardProgress(state, reward);
  if (!progress.done) {
    return fail(state, "図鑑の記録がまだ足りません。もう少し遠征を重ねましょう。");
  }

  const rewardItems = reward.rewards.items ?? [];
  if (getInventoryCount(state.inventory) + totalItemQuantity(rewardItems) > state.itemCapacity) {
    return fail(state, "アイテム保有枠が足りません。司令部で売却するか、保有上限を拡張してください。");
  }

  const now = Date.now();
  const inventoryResult = addInventoryStacks(state.inventory, rewardItems, state.itemCapacity);
  let next: GameState = {
    ...state,
    gold: state.gold + (reward.rewards.gold ?? 0),
    inventory: inventoryResult.inventory,
    collection: mergeCollection(state.collection, { items: inventoryResult.accepted.map((item) => item.itemId) }),
    collectionRewards: {
      claimedIds: [...new Set([...state.collectionRewards.claimedIds, rewardId])],
    },
    updatedAt: now,
  };

  next = applyDemonExperience(next, reward.rewards.demonExp ?? 0);
  next = evaluateAchievements(next, now).state;

  const rewardParts = [
    reward.rewards.gold ? `${reward.rewards.gold}G` : "",
    reward.rewards.demonExp ? `魔王EXP ${reward.rewards.demonExp}` : "",
    ...inventoryResult.accepted.map((item) => `${getItemDefinition(item.itemId).name} x${item.quantity}`),
  ].filter(Boolean);

  return ok(next, `図鑑報酬「${reward.title}」を受け取りました。${rewardParts.join(" / ")}`);
};

export const sellItem = (state: GameState, itemId: string): GameActionResult => {
  if (state.demonLordLevel < 3) {
    return fail(state, "売却は魔王Lv3で解放されます。");
  }
  const item = getItemDefinition(itemId);
  const stock = state.inventory.find((entry) => entry.itemId === itemId)?.quantity ?? 0;
  if (stock <= 0) {
    return fail(state, "売却できる在庫がありません。");
  }

  return ok(
    {
      ...state,
      gold: state.gold + item.sellPrice,
      inventory: removeInventoryItem(state.inventory, itemId, 1),
      updatedAt: Date.now(),
    },
    `${item.name}を売却しました。`,
  );
};

export const sellUnit = (state: GameState, unitId: string): GameActionResult => {
  if (state.demonLordLevel < 3) {
    return fail(state, "配下の売却は魔王Lv3で解放されます。");
  }
  if (state.units.length <= 1) {
    return fail(state, "最後の配下は売却できません。");
  }
  const unit = state.units.find((candidate) => candidate.id === unitId);
  if (!unit) {
    return fail(state, "ユニットが見つかりません。");
  }
  if (unit.status !== "idle") {
    return fail(state, "待機中のユニットだけ売却できます。");
  }

  const price = Math.max(18, unit.level * 14 + rarityBonus[unit.rarity]);
  return ok(
    {
      ...state,
      gold: state.gold + price,
      units: state.units.filter((candidate) => candidate.id !== unitId),
      updatedAt: Date.now(),
    },
    `${unit.name}を契約解除し、${price}Gを得ました。`,
  );
};

export const expandUnitCapacity = (state: GameState): GameActionResult => {
  if (state.demonLordLevel < 4) {
    return fail(state, "配下枠の拡張は魔王Lv4で解放されます。");
  }
  const cost = 120 + Math.max(0, state.unitCapacity - 8) * 45;
  if (state.gold < cost) {
    return fail(state, "所持金が足りません。");
  }

  return ok({ ...state, gold: state.gold - cost, unitCapacity: state.unitCapacity + 1, updatedAt: Date.now() }, "配下の保有上限を増やしました。");
};

export const expandItemCapacity = (state: GameState): GameActionResult => {
  if (state.demonLordLevel < 4) {
    return fail(state, "アイテム枠の拡張は魔王Lv4で解放されます。");
  }
  const cost = 80 + Math.max(0, state.itemCapacity - 16) * 18;
  if (state.gold < cost) {
    return fail(state, "所持金が足りません。");
  }

  return ok({ ...state, gold: state.gold - cost, itemCapacity: state.itemCapacity + 3, updatedAt: Date.now() }, "アイテム保有上限を増やしました。");
};
