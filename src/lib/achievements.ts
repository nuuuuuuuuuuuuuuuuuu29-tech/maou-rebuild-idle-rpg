import { ACHIEVEMENTS } from "../data/achievements";
import { getItemDefinition } from "../data/items";
import type {
  AchievementDefinition,
  BossDefeatRecord,
  CollectionRewardDefinition,
  ExpeditionRecord,
  GameState,
  Rarity,
} from "../types/game";

const rareRanks = new Set<Rarity>(["rare", "epic", "legendary"]);

const totalCollectionCount = (state: GameState) =>
  state.collection.monsters.length + state.collection.items.length + state.collection.dungeons.length;

export const getTotalBossDefeats = (state: Pick<GameState, "bossRecords">) =>
  state.bossRecords.reduce((total, record) => total + record.defeats, 0);

const getRescuedUnitCount = (state: Pick<GameState, "records">) =>
  state.records.reduce((total, record) => total + (record.rewards?.rescuedUnits.length ?? 0), 0);

const getRareRewardCount = (state: Pick<GameState, "records">) =>
  state.records.reduce((total, record) => {
    const itemCount =
      record.rewards?.items.filter((item) => rareRanks.has(getItemDefinition(item.itemId).rarity)).length ?? 0;
    const rescuedCount =
      record.rewards?.rescuedUnits.filter((unit) => rareRanks.has(unit.rarity)).length ?? 0;
    return total + itemCount + rescuedCount;
  }, 0);

export const getAchievementProgress = (state: GameState, achievement: AchievementDefinition) => {
  const requirement = achievement.requirement;
  switch (requirement.type) {
    case "expeditionCount":
      return { current: state.records.length, target: requirement.count, done: state.records.length >= requirement.count };
    case "successCount": {
      const current = state.records.filter((record) => record.status === "success").length;
      return { current, target: requirement.count, done: current >= requirement.count };
    }
    case "bossDefeats": {
      const current = getTotalBossDefeats(state);
      return { current, target: requirement.count, done: current >= requirement.count };
    }
    case "demonLordLevel":
      return { current: state.demonLordLevel, target: requirement.level, done: state.demonLordLevel >= requirement.level };
    case "collectionTotal": {
      const current = totalCollectionCount(state);
      return { current, target: requirement.count, done: current >= requirement.count };
    }
    case "monsterCollection":
      return {
        current: state.collection.monsters.length,
        target: requirement.count,
        done: state.collection.monsters.length >= requirement.count,
      };
    case "itemCollection":
      return {
        current: state.collection.items.length,
        target: requirement.count,
        done: state.collection.items.length >= requirement.count,
      };
    case "dungeonCollection":
      return {
        current: state.collection.dungeons.length,
        target: requirement.count,
        done: state.collection.dungeons.length >= requirement.count,
      };
    case "rescuedUnits": {
      const current = getRescuedUnitCount(state);
      return { current, target: requirement.count, done: current >= requirement.count };
    }
    case "rareRewards": {
      const current = getRareRewardCount(state);
      return { current, target: requirement.count, done: current >= requirement.count };
    }
    default:
      return { current: 0, target: 1, done: false };
  }
};

export const evaluateAchievements = (state: GameState, unlockedAt: number) => {
  const unlockedIds = new Set(state.achievements.unlocked.map((entry) => entry.achievementId));
  const unlocked = ACHIEVEMENTS.filter(
    (achievement) => !unlockedIds.has(achievement.id) && getAchievementProgress(state, achievement).done,
  );

  if (unlocked.length === 0) {
    return { state, unlocked };
  }

  return {
    state: {
      ...state,
      achievements: {
        unlocked: [
          ...state.achievements.unlocked,
          ...unlocked.map((achievement) => ({ achievementId: achievement.id, unlockedAt })),
        ],
      },
    },
    unlocked,
  };
};

export const deriveBossRecordsFromRecords = (records: ExpeditionRecord[]) => {
  const byDungeon = new Map<string, BossDefeatRecord>();

  records
    .filter((record) => record.status === "success")
    .forEach((record) => {
      const current = byDungeon.get(record.dungeonId);
      if (!current) {
        byDungeon.set(record.dungeonId, {
          dungeonId: record.dungeonId,
          defeats: 1,
          firstDefeatedAt: record.endedAt,
          lastDefeatedAt: record.endedAt,
        });
        return;
      }

      byDungeon.set(record.dungeonId, {
        dungeonId: record.dungeonId,
        defeats: current.defeats + 1,
        firstDefeatedAt: Math.min(current.firstDefeatedAt ?? record.endedAt, record.endedAt),
        lastDefeatedAt: Math.max(current.lastDefeatedAt ?? record.endedAt, record.endedAt),
      });
    });

  return [...byDungeon.values()];
};

export const mergeBossRecords = (records: BossDefeatRecord[], derived: BossDefeatRecord[]) => {
  const byDungeon = new Map<string, BossDefeatRecord>();

  [...derived, ...records].forEach((record) => {
    const current = byDungeon.get(record.dungeonId);
    if (!current) {
      byDungeon.set(record.dungeonId, { ...record });
      return;
    }

    byDungeon.set(record.dungeonId, {
      dungeonId: record.dungeonId,
      defeats: Math.max(current.defeats, record.defeats),
      firstDefeatedAt:
        current.firstDefeatedAt && record.firstDefeatedAt
          ? Math.min(current.firstDefeatedAt, record.firstDefeatedAt)
          : current.firstDefeatedAt ?? record.firstDefeatedAt,
      lastDefeatedAt:
        current.lastDefeatedAt && record.lastDefeatedAt
          ? Math.max(current.lastDefeatedAt, record.lastDefeatedAt)
          : current.lastDefeatedAt ?? record.lastDefeatedAt,
    });
  });

  return [...byDungeon.values()].sort((a, b) => a.dungeonId.localeCompare(b.dungeonId));
};

export const updateBossRecordsForRecord = (state: GameState, record: ExpeditionRecord) => {
  if (record.status !== "success") {
    return { state, firstDefeat: false };
  }

  const current = state.bossRecords.find((entry) => entry.dungeonId === record.dungeonId);
  const firstDefeat = !current || current.defeats <= 0;
  const nextRecord: BossDefeatRecord = {
    dungeonId: record.dungeonId,
    defeats: (current?.defeats ?? 0) + 1,
    firstDefeatedAt: current?.firstDefeatedAt ?? record.endedAt,
    lastDefeatedAt: record.endedAt,
  };

  return {
    state: {
      ...state,
      bossRecords: [
        ...state.bossRecords.filter((entry) => entry.dungeonId !== record.dungeonId),
        nextRecord,
      ].sort((a, b) => a.dungeonId.localeCompare(b.dungeonId)),
    },
    firstDefeat,
  };
};

export const getCollectionRewardProgress = (state: GameState, reward: CollectionRewardDefinition) => {
  const current =
    reward.target === "monsters"
      ? state.collection.monsters.length
      : reward.target === "items"
        ? state.collection.items.length
        : reward.target === "dungeons"
          ? state.collection.dungeons.length
          : totalCollectionCount(state);

  return {
    current,
    target: reward.requiredCount,
    done: current >= reward.requiredCount,
  };
};
