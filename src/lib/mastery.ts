import { DUNGEONS } from "../data/dungeons";
import type { BossDefeatRecord, DungeonMasteryRecord, ExpeditionRecord, GameState } from "../types/game";

export const DUNGEON_MASTERY_THRESHOLDS = [1, 5, 10, 25, 50] as const;

export const getDungeonMasteryLevel = (clearCount: number) =>
  DUNGEON_MASTERY_THRESHOLDS.filter((threshold) => clearCount >= threshold).length;

export const getNextDungeonMasteryTarget = (clearCount: number) =>
  DUNGEON_MASTERY_THRESHOLDS.find((threshold) => clearCount < threshold);

export const getDungeonMasteryBonus = (level: number) => ({
  goldMultiplier: 1 + level * 0.02,
  unitExpMultiplier: 1 + level * 0.01,
  goldPercent: level * 2,
  unitExpPercent: level,
});

export const getDungeonMasteryRecord = (
  state: Pick<GameState, "dungeonMastery">,
  dungeonId: string,
): DungeonMasteryRecord => {
  const record = state.dungeonMastery.find((entry) => entry.dungeonId === dungeonId);
  return record ? { ...record } : { dungeonId, clearCount: 0 };
};

export const getDungeonMasteryInfo = (state: Pick<GameState, "dungeonMastery">, dungeonId: string) => {
  const record = getDungeonMasteryRecord(state, dungeonId);
  const level = getDungeonMasteryLevel(record.clearCount);
  const nextTarget = getNextDungeonMasteryTarget(record.clearCount);
  const bonus = getDungeonMasteryBonus(level);

  return {
    ...record,
    level,
    nextTarget,
    remainingToNext: nextTarget ? Math.max(0, nextTarget - record.clearCount) : 0,
    bonus,
  };
};

export const formatDungeonMasteryBonus = (level: number) => {
  const bonus = getDungeonMasteryBonus(level);
  return `金 +${bonus.goldPercent}% / ユニットEXP +${bonus.unitExpPercent}%`;
};

export const deriveDungeonMasteryFromRecords = (
  records: ExpeditionRecord[],
  bossRecords: BossDefeatRecord[] = [],
) => {
  const counts = new Map<string, number>();
  const knownDungeonIds = new Set(DUNGEONS.map((dungeon) => dungeon.id));

  records
    .filter((record) => record.status === "success" && knownDungeonIds.has(record.dungeonId))
    .forEach((record) => {
      counts.set(record.dungeonId, (counts.get(record.dungeonId) ?? 0) + 1);
    });

  bossRecords
    .filter((record) => knownDungeonIds.has(record.dungeonId) && record.defeats > 0)
    .forEach((record) => {
      counts.set(record.dungeonId, Math.max(counts.get(record.dungeonId) ?? 0, Math.floor(record.defeats)));
    });

  return [...counts.entries()]
    .map(([dungeonId, clearCount]) => ({ dungeonId, clearCount }))
    .sort((a, b) => a.dungeonId.localeCompare(b.dungeonId));
};

export const mergeDungeonMasteryRecords = (
  records: DungeonMasteryRecord[],
  derived: DungeonMasteryRecord[] = [],
) => {
  const knownDungeonIds = new Set(DUNGEONS.map((dungeon) => dungeon.id));
  const byDungeon = new Map<string, number>();

  [...derived, ...records].forEach((record) => {
    if (!knownDungeonIds.has(record.dungeonId) || record.clearCount <= 0) {
      return;
    }
    byDungeon.set(record.dungeonId, Math.max(byDungeon.get(record.dungeonId) ?? 0, Math.floor(record.clearCount)));
  });

  return [...byDungeon.entries()]
    .map(([dungeonId, clearCount]) => ({ dungeonId, clearCount }))
    .sort((a, b) => a.dungeonId.localeCompare(b.dungeonId));
};

export const updateDungeonMasteryForRecord = (
  records: DungeonMasteryRecord[],
  record: ExpeditionRecord,
) => {
  if (record.status !== "success") {
    return {
      records,
      changed: false,
      previousLevel: getDungeonMasteryLevel(getDungeonMasteryRecord({ dungeonMastery: records }, record.dungeonId).clearCount),
      nextLevel: getDungeonMasteryLevel(getDungeonMasteryRecord({ dungeonMastery: records }, record.dungeonId).clearCount),
      clearCount: getDungeonMasteryRecord({ dungeonMastery: records }, record.dungeonId).clearCount,
    };
  }

  const current = getDungeonMasteryRecord({ dungeonMastery: records }, record.dungeonId);
  const previousLevel = getDungeonMasteryLevel(current.clearCount);
  const nextRecord = { dungeonId: record.dungeonId, clearCount: current.clearCount + 1 };
  const nextLevel = getDungeonMasteryLevel(nextRecord.clearCount);
  const nextRecords = mergeDungeonMasteryRecords(
    [...records.filter((entry) => entry.dungeonId !== record.dungeonId), nextRecord],
  );

  return {
    records: nextRecords,
    changed: true,
    previousLevel,
    nextLevel,
    clearCount: nextRecord.clearCount,
  };
};
