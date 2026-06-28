import { ACHIEVEMENTS } from "../data/achievements";
import { COLLECTION_REWARDS } from "../data/collectionRewards";
import { DUNGEONS } from "../data/dungeons";
import { ITEM_DEFINITIONS } from "../data/items";
import { UNIT_TEMPLATES } from "../data/units";
import type {
  AchievementState,
  BossDefeatRecord,
  CollectionState,
  CollectionRewardState,
  CombatEnemySnapshot,
  CombatLogEntry,
  CombatLogType,
  DungeonMasteryRecord,
  ExpeditionDepartureSnapshotV1,
  ExpeditionRawOutcomeV1,
  ExpeditionRecord,
  ExpeditionSimulationMetadata,
  ExpeditionState,
  ExpeditionStatus,
  GameState,
  GameUnit,
  InventoryItem,
  LogEntry,
  LogType,
  Rarity,
  RewardItemStack,
  StrategyId,
  UnitStatus,
} from "../types/game";
import { deriveBossRecordsFromRecords, evaluateAchievements, mergeBossRecords } from "./achievements";
import { createExpeditionDepartureSnapshotV1, createExpeditionRawOutcomeV1 } from "./expedition";
import { deriveDungeonMasteryFromRecords, mergeDungeonMasteryRecords } from "./mastery";
import { createInitialState, createUnit } from "./progression";
import { createLegacyV5ExpeditionSeed, hashSeed } from "./rng";
import { normalizeSelectedTitleId } from "./titles";

export const SAVE_VERSION = 6;
export const STORAGE_KEY = "maou-rebuild-state-v1";

const BACKUP_PREFIX = "maou-rebuild-state-backup";

type UnknownRecord = Record<string, unknown>;

export type LoadStatus = "fresh" | "loaded" | "migrated" | "recovered";

export interface LoadGameResult {
  state: GameState;
  status: LoadStatus;
  message: string;
  backupKey?: string;
  migratedFrom?: number;
  canSave?: boolean;
}

export interface StorageWriteResult {
  ok: boolean;
  message: string;
}

export interface StorageResetResult {
  ok: boolean;
  message: string;
  state?: GameState;
  backupKey?: string;
}

interface BackupResult {
  key?: string;
  failed?: boolean;
  message?: string;
}

const UNIT_TEMPLATE_IDS = new Set(UNIT_TEMPLATES.map((unit) => unit.id));
const ITEM_IDS = new Set(ITEM_DEFINITIONS.map((item) => item.id));
const SUPPORT_ITEM_IDS = new Set(ITEM_DEFINITIONS.filter((item) => item.type === "support").map((item) => item.id));
const DUNGEON_IDS = new Set(DUNGEONS.map((dungeon) => dungeon.id));
const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));
const COLLECTION_REWARD_IDS = new Set(COLLECTION_REWARDS.map((reward) => reward.id));
const STRATEGY_IDS = new Set<StrategyId>(["balanced", "safe", "rush", "loot"]);
const UNIT_STATUSES = new Set<UnitStatus>(["idle", "expedition", "downed"]);
const EXPEDITION_STATUSES = new Set<ExpeditionStatus>(["in_progress", "success", "failure", "retreat"]);
const LOG_TYPES = new Set<LogType>(["info", "battle", "loot", "rescue", "success", "failure", "retreat"]);
const COMPLETION_LOG_TYPES = new Set<LogType>(["success", "failure", "retreat", "loot", "rescue"]);
const COMBAT_LOG_TYPES = new Set<CombatLogType>([
  "encounter",
  "allyAttack",
  "enemyAttack",
  "damage",
  "defeatEnemy",
  "defeatAlly",
  "retreat",
  "victory",
  "reward",
]);
const RARITIES = new Set<Rarity>(["common", "uncommon", "rare", "epic", "legendary"]);

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const numberOr = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const stringOr = (value: unknown, fallback: string) => (typeof value === "string" ? value : fallback);

const integerAtLeast = (value: unknown, fallback: number, min: number) =>
  Math.max(min, Math.floor(numberOr(value, fallback)));

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const uniqueStringArray = (value: unknown, allowedIds?: Set<string>) => {
  if (!Array.isArray(value)) {
    return [];
  }

  return [
    ...new Set(
      value.filter((entry): entry is string => typeof entry === "string").filter((entry) => !allowedIds || allowedIds.has(entry)),
    ),
  ];
};

const createVersionedInitialState = (): GameState => ({
  ...createInitialState(),
  version: SAVE_VERSION,
});

const backupKeyFor = (reason: string) =>
  `${BACKUP_PREFIX}-${reason}-${new Date().toISOString().replace(/[:.]/g, "-")}`;

const backupRawSave = (raw: string, reason: string): BackupResult => {
  if (typeof localStorage === "undefined") {
    return { failed: true, message: "localStorageを利用できないため、バックアップを作成できませんでした。" };
  }

  try {
    const key = backupKeyFor(reason);
    localStorage.setItem(key, raw);
    return { key };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "不明な保存エラー";
    return { failed: true, message: `バックアップ作成に失敗しました: ${detail}` };
  }
};

const backupCurrentSave = (reason: string): BackupResult => {
  if (typeof localStorage === "undefined") {
    return { failed: true, message: "localStorageを利用できないため、バックアップを作成できませんでした。" };
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return {};
  }

  return backupRawSave(raw, reason);
};

const isPotentialSaveData = (value: unknown): value is UnknownRecord => {
  if (!isRecord(value)) {
    return false;
  }

  if ("version" in value && value.version !== undefined && typeof value.version !== "number") {
    return false;
  }

  for (const key of ["units", "inventory", "records"] as const) {
    if (key in value && value[key] !== undefined && !Array.isArray(value[key])) {
      return false;
    }
  }

  if ("collection" in value && value.collection !== undefined && !isRecord(value.collection)) {
    return false;
  }

  if (
    "activeExpedition" in value &&
    value.activeExpedition !== undefined &&
    value.activeExpedition !== null &&
    !isRecord(value.activeExpedition)
  ) {
    return false;
  }

  return true;
};

const migrateV1ToV2 = (source: UnknownRecord): UnknownRecord => ({
  ...source,
  version: 2,
});

const migrateV2ToV3 = (source: UnknownRecord): UnknownRecord => ({
  ...source,
  version: 3,
  achievements: isRecord(source.achievements) ? source.achievements : { unlocked: [] },
  bossRecords: Array.isArray(source.bossRecords) ? source.bossRecords : [],
  collectionRewards: isRecord(source.collectionRewards) ? source.collectionRewards : { claimedIds: [] },
});

const migrateV3ToV4 = (source: UnknownRecord): UnknownRecord => ({
  ...source,
  version: 4,
  dungeonMastery: Array.isArray(source.dungeonMastery) ? source.dungeonMastery : [],
});

const migrateV4ToV5 = (source: UnknownRecord): UnknownRecord => ({
  ...source,
  version: 5,
  selectedTitleId: typeof source.selectedTitleId === "string" ? source.selectedTitleId : undefined,
});

const migrateV5ToV6 = (source: UnknownRecord): UnknownRecord => ({
  ...source,
  version: 6,
});

const migrateSaveData = (source: UnknownRecord) => {
  const fromVersion = typeof source.version === "number" ? source.version : 1;

  if (!Number.isInteger(fromVersion) || fromVersion < 1) {
    throw new Error("セーブデータのversionが不正です。");
  }

  if (fromVersion > SAVE_VERSION) {
    throw new Error(`このゲームより新しいversion ${fromVersion} のセーブデータです。`);
  }

  let data = { ...source };
  if (fromVersion < 2) {
    data = migrateV1ToV2(data);
  }
  if (fromVersion < 3) {
    data = migrateV2ToV3(data);
  }
  if (fromVersion < 4) {
    data = migrateV3ToV4(data);
  }
  if (fromVersion < 5) {
    data = migrateV4ToV5(data);
  }
  if (fromVersion < 6) {
    data = migrateV5ToV6(data);
  }

  return {
    data,
    fromVersion,
    migrated: fromVersion !== SAVE_VERSION,
  };
};

const normalizeInventory = (inventory: unknown, fallback: InventoryItem[]) => {
  if (!Array.isArray(inventory)) {
    return fallback;
  }

  const quantities = new Map<string, number>();
  inventory.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== "string" || !ITEM_IDS.has(entry.itemId)) {
      return;
    }

    const quantity = integerAtLeast(entry.quantity, 0, 0);
    if (quantity <= 0) {
      return;
    }
    quantities.set(entry.itemId, (quantities.get(entry.itemId) ?? 0) + quantity);
  });

  return [...quantities.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
};

const normalizeUnits = (units: unknown, fallback: GameUnit[]) => {
  if (!Array.isArray(units)) {
    return fallback;
  }

  const normalized = units.flatMap((entry, index) => {
    if (!isRecord(entry) || typeof entry.templateId !== "string" || !UNIT_TEMPLATE_IDS.has(entry.templateId)) {
      return [];
    }

    const level = integerAtLeast(entry.level, 1, 1);
    const name = typeof entry.name === "string" && entry.name.trim() ? entry.name.slice(0, 12) : undefined;
    const base = createUnit(entry.templateId, {
      id: stringOr(entry.id, `unit-migrated-${index + 1}`),
      name,
      level,
    });
    const status =
      typeof entry.status === "string" && UNIT_STATUSES.has(entry.status as UnitStatus)
        ? (entry.status as UnitStatus)
        : base.status;

    return [
      {
        ...base,
        exp: integerAtLeast(entry.exp, base.exp, 0),
        expToNext: integerAtLeast(entry.expToNext, base.expToNext, 1),
        currentHp: clamp(integerAtLeast(entry.currentHp, base.currentHp, 0), 0, base.maxHp),
        status,
        recoveryUntil: status === "downed" ? numberOr(entry.recoveryUntil, Date.now() + 30_000) : undefined,
      },
    ];
  });

  return normalized.length > 0 ? normalized : fallback;
};

const nonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const finiteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonNegativeNumber = (value: unknown): value is number => finiteNumber(value) && value >= 0;

const normalizeLegacyActiveMetadata = (
  active: unknown,
  units: GameUnit[],
): { metadata?: ExpeditionSimulationMetadata; reason?: string } => {
  if (active === undefined || active === null) {
    return {};
  }
  if (!isRecord(active)) {
    return { reason: "進行中遠征の保存形式が不正だったため解除しました。" };
  }

  const dungeonId = nonEmptyString(active.dungeonId) && DUNGEON_IDS.has(active.dungeonId) ? active.dungeonId : undefined;
  const availableUnitIds = new Set(units.map((unit) => unit.id));
  const unitIds = uniqueStringArray(active.unitIds).filter((unitId) => availableUnitIds.has(unitId));
  const strategy =
    typeof active.strategy === "string" && STRATEGY_IDS.has(active.strategy as StrategyId)
      ? (active.strategy as StrategyId)
      : undefined;
  const itemId =
    active.itemId === undefined
      ? undefined
      : typeof active.itemId === "string" && SUPPORT_ITEM_IDS.has(active.itemId)
        ? active.itemId
        : null;
  if (
    !dungeonId ||
    unitIds.length === 0 ||
    !strategy ||
    itemId === null ||
    !finiteNumber(active.startedAt) ||
    !finiteNumber(active.endsAt) ||
    !finiteNumber(active.durationSeconds) ||
    active.durationSeconds <= 0 ||
    active.endsAt < active.startedAt
  ) {
    return { reason: "進行中遠征の必須情報を復元できなかったため解除しました。" };
  }

  const derivedIdSource = [
    dungeonId,
    unitIds.join(","),
    strategy,
    itemId ?? "",
    active.startedAt,
    active.endsAt,
    active.durationSeconds,
  ].join("|");
  return {
    metadata: {
      id: nonEmptyString(active.id)
        ? active.id
        : `expedition-legacy-${hashSeed(derivedIdSource).toString(16).padStart(8, "0")}`,
      dungeonId,
      unitIds,
      strategy,
      ...(itemId ? { itemId } : {}),
      startedAt: active.startedAt,
      endsAt: active.endsAt,
      durationSeconds: Math.floor(active.durationSeconds),
    },
  };
};

const isValidSnapshot = (
  snapshot: unknown,
  active: ExpeditionSimulationMetadata,
): snapshot is ExpeditionDepartureSnapshotV1 => {
  if (
    !isRecord(snapshot) ||
    !Number.isInteger(snapshot.demonLordLevel) ||
    (snapshot.demonLordLevel as number) < 1 ||
    !Array.isArray(snapshot.party)
  ) {
    return false;
  }
  if (snapshot.party.length !== active.unitIds.length) {
    return false;
  }
  const validParty = snapshot.party.every((entry, index) =>
    isRecord(entry) &&
    entry.id === active.unitIds[index] &&
    nonEmptyString(entry.templateId) &&
    UNIT_TEMPLATE_IDS.has(entry.templateId) &&
    typeof entry.name === "string" &&
    Number.isInteger(entry.level) &&
    (entry.level as number) >= 1 &&
    finiteNumber(entry.maxHp) &&
    entry.maxHp >= 1 &&
    nonNegativeNumber(entry.currentHp) &&
    entry.currentHp <= entry.maxHp &&
    nonNegativeNumber(entry.atk) &&
    nonNegativeNumber(entry.def) &&
    nonNegativeNumber(entry.spd),
  );
  if (!validParty || !isRecord(snapshot.mastery)) {
    return false;
  }
  return (
    Number.isInteger(snapshot.mastery.clearCount) &&
    (snapshot.mastery.clearCount as number) >= 0 &&
    Number.isInteger(snapshot.mastery.level) &&
    (snapshot.mastery.level as number) >= 0 &&
    nonNegativeNumber(snapshot.mastery.rareDropBonus) &&
    finiteNumber(snapshot.mastery.goldMultiplier) &&
    snapshot.mastery.goldMultiplier > 0 &&
    finiteNumber(snapshot.mastery.unitExpMultiplier) &&
    snapshot.mastery.unitExpMultiplier > 0
  );
};

const isValidRewardItems = (items: unknown) =>
  Array.isArray(items) && items.every((entry) =>
    isRecord(entry) &&
    typeof entry.itemId === "string" &&
    ITEM_IDS.has(entry.itemId) &&
    Number.isInteger(entry.quantity) &&
    (entry.quantity as number) > 0,
  );

const isValidRescueSummary = (entry: unknown) =>
  isRecord(entry) &&
  nonEmptyString(entry.unitId) &&
  typeof entry.name === "string" &&
  typeof entry.species === "string" &&
  typeof entry.rarity === "string" &&
  RARITIES.has(entry.rarity as Rarity);

const isValidRewards = (rewards: unknown) => {
  if (
    !isRecord(rewards) ||
    !nonNegativeNumber(rewards.gold) ||
    !nonNegativeNumber(rewards.demonExp) ||
    !nonNegativeNumber(rewards.unitExp) ||
    !nonNegativeNumber(rewards.territory) ||
    !isValidRewardItems(rewards.items) ||
    !Array.isArray(rewards.rescuedUnits) ||
    !rewards.rescuedUnits.every(isValidRescueSummary)
  ) {
    return false;
  }
  return rewards.mvp === undefined || (
    isRecord(rewards.mvp) &&
    nonEmptyString(rewards.mvp.unitId) &&
    typeof rewards.mvp.name === "string" &&
    typeof rewards.mvp.title === "string" &&
    typeof rewards.mvp.note === "string"
  );
};

const isValidBattleLog = (battleLog: unknown) => {
  if (!Array.isArray(battleLog)) {
    return false;
  }
  const ids = new Set<string>();
  return battleLog.every((entry) => {
    if (
      !isRecord(entry) ||
      !nonEmptyString(entry.id) ||
      ids.has(entry.id) ||
      !Number.isInteger(entry.turn) ||
      (entry.turn as number) < 0 ||
      typeof entry.type !== "string" ||
      !COMBAT_LOG_TYPES.has(entry.type as CombatLogType) ||
      typeof entry.text !== "string" ||
      (entry.damage !== undefined && !nonNegativeNumber(entry.damage)) ||
      (entry.hpBefore !== undefined && !nonNegativeNumber(entry.hpBefore)) ||
      (entry.hpAfter !== undefined && !nonNegativeNumber(entry.hpAfter)) ||
      (entry.actorName !== undefined && typeof entry.actorName !== "string") ||
      (entry.targetName !== undefined && typeof entry.targetName !== "string") ||
      (entry.enemyId !== undefined && typeof entry.enemyId !== "string")
    ) {
      return false;
    }
    ids.add(entry.id);
    return true;
  });
};

const isValidEncounteredEnemies = (enemies: unknown, active: ExpeditionSimulationMetadata) =>
  Array.isArray(enemies) && enemies.every((enemy) =>
    isRecord(enemy) &&
    nonEmptyString(enemy.id) &&
    typeof enemy.name === "string" &&
    typeof enemy.kind === "string" &&
    typeof enemy.flavor === "string" &&
    enemy.dungeonId === active.dungeonId &&
    finiteNumber(enemy.hp) &&
    enemy.hp >= 1 &&
    nonNegativeNumber(enemy.attack) &&
    nonNegativeNumber(enemy.defense) &&
    nonNegativeNumber(enemy.speed) &&
    (enemy.isBoss === undefined || typeof enemy.isBoss === "boolean"),
  );

const isValidRescuedUnit = (
  unit: unknown,
  active: ExpeditionSimulationMetadata,
  participantIds: Set<string>,
): unit is GameUnit =>
  isRecord(unit) &&
  nonEmptyString(unit.id) &&
  unit.id.startsWith(`${active.id}-rescue-`) &&
  !participantIds.has(unit.id) &&
  nonEmptyString(unit.templateId) &&
  UNIT_TEMPLATE_IDS.has(unit.templateId) &&
  typeof unit.name === "string" &&
  typeof unit.species === "string" &&
  typeof unit.emoji === "string" &&
  typeof unit.rarity === "string" &&
  RARITIES.has(unit.rarity as Rarity) &&
  Number.isInteger(unit.level) &&
  (unit.level as number) >= 1 &&
  nonNegativeNumber(unit.exp) &&
  finiteNumber(unit.expToNext) &&
  unit.expToNext >= 1 &&
  finiteNumber(unit.maxHp) &&
  unit.maxHp >= 1 &&
  finiteNumber(unit.currentHp) &&
  unit.currentHp >= 1 &&
  unit.currentHp <= unit.maxHp &&
  nonNegativeNumber(unit.atk) &&
  nonNegativeNumber(unit.def) &&
  nonNegativeNumber(unit.spd) &&
  unit.status === "idle" &&
  unit.recoveryUntil === undefined;

const isValidRawOutcome = (
  outcome: unknown,
  active: ExpeditionSimulationMetadata,
  snapshot: ExpeditionDepartureSnapshotV1,
): outcome is ExpeditionRawOutcomeV1 => {
  if (!isRecord(outcome) || !isRecord(outcome.record) || !Array.isArray(outcome.party) || !Array.isArray(outcome.rescuedUnits)) {
    return false;
  }
  const record = outcome.record;
  const rescuedUnits = outcome.rescuedUnits;
  if (
    record.id !== active.id ||
    record.dungeonId !== active.dungeonId ||
    !nonEmptyString(record.dungeonName) ||
    record.startedAt !== active.startedAt ||
    record.endedAt !== active.endsAt ||
    typeof record.status !== "string" ||
    !["success", "failure", "retreat"].includes(record.status) ||
    !Array.isArray(record.unitNames) ||
    !record.unitNames.every((name) => typeof name === "string") ||
    record.unitNames.length !== active.unitIds.length ||
    !record.unitNames.every((name, index) => name === snapshot.party[index]?.name) ||
    record.strategy !== active.strategy ||
    !Array.isArray(record.logs) ||
    record.logs.length === 0 ||
    !isValidRewards(record.rewards)
  ) {
    return false;
  }
  const logIds = new Set<string>();
  let previousLogAt = Number.NEGATIVE_INFINITY;
  const logsValid = record.logs.every((log) => {
    if (
      !isRecord(log) ||
      !nonEmptyString(log.id) ||
      logIds.has(log.id) ||
      !finiteNumber(log.at) ||
      log.at < active.startedAt ||
      log.at > active.endsAt ||
      log.at < previousLogAt ||
      typeof log.type !== "string" ||
      !LOG_TYPES.has(log.type as LogType) ||
      typeof log.message !== "string"
    ) {
      return false;
    }
    logIds.add(log.id);
    previousLogAt = log.at;
    return true;
  });
  const firstCompletionIndex = record.logs.findIndex(
    (log) => isRecord(log) && typeof log.type === "string" && COMPLETION_LOG_TYPES.has(log.type as LogType),
  );
  const expectedProgressLogCount = firstCompletionIndex < 0 ? record.logs.length : firstCompletionIndex;
  if (
    !logsValid ||
    !isRecord(record.logs[0]) ||
    record.logs[0].at !== active.startedAt ||
    !Number.isInteger(outcome.progressLogCount) ||
    outcome.progressLogCount !== expectedProgressLogCount ||
    record.logs.some((log, index) =>
      !isRecord(log) ||
      !finiteNumber(log.at) ||
      (index < expectedProgressLogCount ? log.at >= active.endsAt : log.at !== active.endsAt),
    ) ||
    outcome.party.length !== active.unitIds.length
  ) {
    return false;
  }
  const partyIds = new Set<string>();
  const partyValid = outcome.party.every((entry, index) => {
    if (
      !isRecord(entry) ||
      entry.unitId !== active.unitIds[index] ||
      !nonEmptyString(entry.unitId) ||
      partyIds.has(entry.unitId) ||
      !nonNegativeNumber(entry.battleEndHp) ||
      entry.battleEndHp > snapshot.party[index].maxHp ||
      (entry.battleEndHp === 0
        ? !finiteNumber(entry.recoveryUntil) || entry.recoveryUntil < active.endsAt
        : entry.recoveryUntil !== undefined)
    ) {
      return false;
    }
    partyIds.add(entry.unitId);
    return true;
  });
  const participantIds = new Set(active.unitIds);
  if (!partyValid || !rescuedUnits.every((unit) => isValidRescuedUnit(unit, active, participantIds))) {
    return false;
  }
  const rescuedIds = rescuedUnits.map((unit) => unit.id);
  if (new Set(rescuedIds).size !== rescuedIds.length) {
    return false;
  }
  const summaries = (record.rewards as UnknownRecord).rescuedUnits as unknown[];
  if (
    summaries.length !== rescuedIds.length ||
    !summaries.every((entry, index) => {
      const rescued = rescuedUnits[index];
      return isRecord(entry) &&
        entry.unitId === rescued.id &&
        entry.name === rescued.name &&
        entry.species === rescued.species &&
        entry.rarity === rescued.rarity;
    })
  ) {
    return false;
  }
  const rewards = record.rewards as UnknownRecord;
  if (isRecord(rewards.mvp)) {
    const unitIndex = active.unitIds.indexOf(String(rewards.mvp.unitId));
    if (
      unitIndex < 0 ||
      typeof rewards.mvp.name !== "string" ||
      rewards.mvp.name !== snapshot.party[unitIndex].name ||
      typeof rewards.mvp.title !== "string" ||
      typeof rewards.mvp.note !== "string"
    ) {
      return false;
    }
  }
  if (!isValidBattleLog(record.battleLog)) {
    return false;
  }
  if (!isValidEncounteredEnemies(record.encounteredEnemies, active)) {
    return false;
  }
  return true;
};

const normalizeV6ActiveExpedition = (active: unknown, units: GameUnit[]): ExpeditionState | undefined => {
  if (!isRecord(active)) {
    return undefined;
  }
  const legacy = normalizeLegacyActiveMetadata(active, units);
  if (
    !legacy.metadata ||
    !nonEmptyString(active.id) ||
    !Number.isInteger(active.durationSeconds) ||
    active.simulationVersion !== 1 ||
    !nonEmptyString(active.seed) ||
    !isValidSnapshot(active.snapshot, legacy.metadata) ||
    !isValidRawOutcome(active.outcome, legacy.metadata, active.snapshot)
  ) {
    return undefined;
  }
  return {
    ...legacy.metadata,
    simulationVersion: 1,
    seed: active.seed,
    snapshot: active.snapshot,
    outcome: active.outcome,
  };
};

const normalizeLogs = (logs: unknown): LogEntry[] => {
  if (!Array.isArray(logs)) {
    return [];
  }

  return logs.flatMap((entry, index) => {
    if (!isRecord(entry) || typeof entry.message !== "string") {
      return [];
    }

    const type =
      typeof entry.type === "string" && LOG_TYPES.has(entry.type as LogType) ? (entry.type as LogType) : "info";

    return [
      {
        id: stringOr(entry.id, `log-migrated-${index + 1}`),
        at: numberOr(entry.at, Date.now()),
        type,
        message: entry.message,
      },
    ];
  });
};

const normalizeCombatLog = (battleLog: unknown): CombatLogEntry[] | undefined => {
  if (!Array.isArray(battleLog)) {
    return undefined;
  }

  const normalized = battleLog.flatMap((entry, index) => {
    if (!isRecord(entry) || typeof entry.text !== "string") {
      return [];
    }

    const type =
      typeof entry.type === "string" && COMBAT_LOG_TYPES.has(entry.type as CombatLogType)
        ? (entry.type as CombatLogType)
        : "damage";
    const damage = typeof entry.damage === "number" && Number.isFinite(entry.damage) ? Math.max(0, Math.round(entry.damage)) : undefined;
    const hpBefore =
      typeof entry.hpBefore === "number" && Number.isFinite(entry.hpBefore) ? Math.max(0, Math.round(entry.hpBefore)) : undefined;
    const hpAfter =
      typeof entry.hpAfter === "number" && Number.isFinite(entry.hpAfter) ? Math.max(0, Math.round(entry.hpAfter)) : undefined;

    return [
      {
        id: stringOr(entry.id, `combat-log-migrated-${index + 1}`),
        turn: integerAtLeast(entry.turn, 0, 0),
        type,
        actorName: typeof entry.actorName === "string" ? entry.actorName : undefined,
        targetName: typeof entry.targetName === "string" ? entry.targetName : undefined,
        damage,
        hpBefore,
        hpAfter,
        enemyId: typeof entry.enemyId === "string" ? entry.enemyId : undefined,
        text: entry.text,
      },
    ];
  });

  return normalized.length > 0 ? normalized : undefined;
};

const normalizeEncounteredEnemies = (enemies: unknown): CombatEnemySnapshot[] | undefined => {
  if (!Array.isArray(enemies)) {
    return undefined;
  }

  const normalized = enemies.flatMap((entry, index) => {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      typeof entry.name !== "string" ||
      typeof entry.kind !== "string" ||
      typeof entry.flavor !== "string"
    ) {
      return [];
    }

    const dungeonId = typeof entry.dungeonId === "string" && DUNGEON_IDS.has(entry.dungeonId) ? entry.dungeonId : undefined;
    if (!dungeonId) {
      return [];
    }

    return [
      {
        id: stringOr(entry.id, `enemy-migrated-${index + 1}`),
        name: entry.name,
        kind: entry.kind,
        hp: integerAtLeast(entry.hp, 1, 1),
        attack: integerAtLeast(entry.attack, 1, 0),
        defense: integerAtLeast(entry.defense, 0, 0),
        speed: integerAtLeast(entry.speed, 0, 0),
        flavor: entry.flavor,
        dungeonId,
        isBoss: typeof entry.isBoss === "boolean" ? entry.isBoss : undefined,
      },
    ];
  });

  return normalized.length > 0 ? normalized : undefined;
};

const normalizeRewardItems = (items: unknown): RewardItemStack[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  const quantities = new Map<string, number>();
  items.forEach((entry) => {
    if (!isRecord(entry) || typeof entry.itemId !== "string" || !ITEM_IDS.has(entry.itemId)) {
      return;
    }

    const quantity = integerAtLeast(entry.quantity, 0, 0);
    if (quantity > 0) {
      quantities.set(entry.itemId, (quantities.get(entry.itemId) ?? 0) + quantity);
    }
  });

  return [...quantities.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
};

const normalizeRewards = (rewards: unknown): ExpeditionRecord["rewards"] | undefined => {
  if (!isRecord(rewards)) {
    return undefined;
  }

  const rescuedUnits = Array.isArray(rewards.rescuedUnits)
    ? rewards.rescuedUnits.flatMap((entry, index) => {
        if (!isRecord(entry) || typeof entry.name !== "string" || typeof entry.species !== "string") {
          return [];
        }
        const rarity =
          typeof entry.rarity === "string" && RARITIES.has(entry.rarity as Rarity)
            ? (entry.rarity as Rarity)
            : "common";
        return [
          {
            unitId: stringOr(entry.unitId, `rescued-migrated-${index + 1}`),
            name: entry.name,
            species: entry.species,
            rarity,
          },
        ];
      })
    : [];

  const mvpSource = rewards.mvp;
  const mvp = isRecord(mvpSource)
    ? {
        unitId: stringOr(mvpSource.unitId, "mvp-migrated"),
        name: stringOr(mvpSource.name, "名もなき配下"),
        title: stringOr(mvpSource.title, "影の功労者"),
        note: stringOr(mvpSource.note, "古い記録から復元されたMVPです。"),
      }
    : undefined;

  return {
    gold: integerAtLeast(rewards.gold, 0, 0),
    demonExp: integerAtLeast(rewards.demonExp, 0, 0),
    unitExp: integerAtLeast(rewards.unitExp, 0, 0),
    territory: integerAtLeast(rewards.territory, 0, 0),
    items: normalizeRewardItems(rewards.items),
    rescuedUnits,
    mvp,
  };
};

const normalizeRecords = (records: unknown): ExpeditionRecord[] => {
  if (!Array.isArray(records)) {
    return [];
  }

  return records
    .flatMap((entry, index) => {
      if (!isRecord(entry) || typeof entry.dungeonId !== "string" || !DUNGEON_IDS.has(entry.dungeonId)) {
        return [];
      }

      const dungeon = DUNGEONS.find((candidate) => candidate.id === entry.dungeonId);
      const status =
        typeof entry.status === "string" && EXPEDITION_STATUSES.has(entry.status as ExpeditionStatus)
          ? (entry.status as ExpeditionStatus)
          : "failure";
      const strategy =
        typeof entry.strategy === "string" && STRATEGY_IDS.has(entry.strategy as StrategyId)
          ? (entry.strategy as StrategyId)
          : "balanced";

      return [
        {
          id: stringOr(entry.id, `record-migrated-${index + 1}`),
          dungeonId: entry.dungeonId,
          dungeonName: stringOr(entry.dungeonName, dungeon?.name ?? "記録不明の遠征"),
          unitNames: uniqueStringArray(entry.unitNames),
          strategy,
          startedAt: numberOr(entry.startedAt, Date.now()),
          endedAt: numberOr(entry.endedAt, Date.now()),
          status,
          logs: normalizeLogs(entry.logs),
          rewards: normalizeRewards(entry.rewards),
          battleLog: normalizeCombatLog(entry.battleLog),
          encounteredEnemies: normalizeEncounteredEnemies(entry.encounteredEnemies),
        },
      ];
    })
    .slice(0, 40);
};

const normalizeCollection = (
  collection: unknown,
  fallback: CollectionState,
  units: GameUnit[],
  inventory: InventoryItem[],
  records: ExpeditionRecord[],
  activeDungeonId?: string,
): CollectionState => {
  const source: UnknownRecord = isRecord(collection) ? collection : {};
  const monsters = uniqueStringArray(source.monsters, UNIT_TEMPLATE_IDS);
  const items = uniqueStringArray(source.items, ITEM_IDS);
  const dungeons = uniqueStringArray(source.dungeons, DUNGEON_IDS);

  return {
    monsters: [
      ...new Set([...fallback.monsters, ...monsters, ...units.map((unit) => unit.templateId)].filter((id) => UNIT_TEMPLATE_IDS.has(id))),
    ],
    items: [
      ...new Set([...fallback.items, ...items, ...inventory.map((item) => item.itemId)].filter((id) => ITEM_IDS.has(id))),
    ],
    dungeons: [
      ...new Set(
        [
          ...dungeons,
          ...records.map((record) => record.dungeonId),
          ...(activeDungeonId ? [activeDungeonId] : []),
        ].filter((id) => DUNGEON_IDS.has(id)),
      ),
    ],
  };
};

const normalizeAchievements = (achievements: unknown, fallback: AchievementState): AchievementState => {
  if (!isRecord(achievements)) {
    return fallback;
  }

  const unlocked = Array.isArray(achievements.unlocked)
    ? achievements.unlocked.flatMap((entry, index) => {
        if (typeof entry === "string" && ACHIEVEMENT_IDS.has(entry)) {
          return [{ achievementId: entry, unlockedAt: Date.now() + index }];
        }
        if (!isRecord(entry) || typeof entry.achievementId !== "string" || !ACHIEVEMENT_IDS.has(entry.achievementId)) {
          return [];
        }
        return [
          {
            achievementId: entry.achievementId,
            unlockedAt: numberOr(entry.unlockedAt, Date.now() + index),
          },
        ];
      })
    : [];

  const byId = new Map<string, { achievementId: string; unlockedAt: number }>();
  [...fallback.unlocked, ...unlocked].forEach((entry) => {
    const current = byId.get(entry.achievementId);
    if (!current || entry.unlockedAt < current.unlockedAt) {
      byId.set(entry.achievementId, entry);
    }
  });

  return {
    unlocked: [...byId.values()].sort((a, b) => a.unlockedAt - b.unlockedAt),
  };
};

const normalizeBossRecords = (bossRecords: unknown, records: ExpeditionRecord[]): BossDefeatRecord[] => {
  const explicit = Array.isArray(bossRecords)
    ? bossRecords.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.dungeonId !== "string" || !DUNGEON_IDS.has(entry.dungeonId)) {
          return [];
        }
        const defeats = integerAtLeast(entry.defeats, 0, 0);
        if (defeats <= 0) {
          return [];
        }
        const firstDefeatedAt = numberOr(entry.firstDefeatedAt, NaN);
        const lastDefeatedAt = numberOr(entry.lastDefeatedAt, Number.isFinite(firstDefeatedAt) ? firstDefeatedAt : Date.now());
        return [
          {
            dungeonId: entry.dungeonId,
            defeats,
            firstDefeatedAt: Number.isFinite(firstDefeatedAt) ? firstDefeatedAt : lastDefeatedAt,
            lastDefeatedAt,
          },
        ];
      })
    : [];

  return mergeBossRecords(explicit, deriveBossRecordsFromRecords(records));
};

const normalizeDungeonMastery = (
  dungeonMastery: unknown,
  records: ExpeditionRecord[],
  bossRecords: BossDefeatRecord[],
): DungeonMasteryRecord[] => {
  const explicit = Array.isArray(dungeonMastery)
    ? dungeonMastery.flatMap((entry) => {
        if (!isRecord(entry) || typeof entry.dungeonId !== "string" || !DUNGEON_IDS.has(entry.dungeonId)) {
          return [];
        }
        const clearCount = integerAtLeast(entry.clearCount, 0, 0);
        return clearCount > 0 ? [{ dungeonId: entry.dungeonId, clearCount }] : [];
      })
    : [];

  return mergeDungeonMasteryRecords(explicit, deriveDungeonMasteryFromRecords(records, bossRecords));
};

const normalizeCollectionRewards = (
  collectionRewards: unknown,
  fallback: CollectionRewardState,
): CollectionRewardState => {
  if (!isRecord(collectionRewards)) {
    return fallback;
  }

  return {
    claimedIds: [
      ...new Set([...fallback.claimedIds, ...uniqueStringArray(collectionRewards.claimedIds, COLLECTION_REWARD_IDS)]),
    ],
  };
};

interface NormalizeGameStateResult {
  state: GameState;
  activeRecoveryReason?: string;
  migrationNote?: string;
}

const normalizeGameState = (saved: UnknownRecord, sourceVersion: number): NormalizeGameStateResult => {
  const fallback = createVersionedInitialState();
  const inventory = normalizeInventory(saved.inventory, fallback.inventory);
  const records = normalizeRecords(saved.records);
  const normalizedUnits = normalizeUnits(saved.units, fallback.units);
  const bossRecords = normalizeBossRecords(saved.bossRecords, records);
  const dungeonMastery = normalizeDungeonMastery(saved.dungeonMastery, records, bossRecords);

  const provisional: GameState = {
    ...fallback,
    version: SAVE_VERSION,
    demonLordName: stringOr(saved.demonLordName, fallback.demonLordName).slice(0, 16),
    demonLordLevel: integerAtLeast(saved.demonLordLevel, fallback.demonLordLevel, 1),
    demonLordExp: integerAtLeast(saved.demonLordExp, fallback.demonLordExp, 0),
    demonLordExpToNext: integerAtLeast(saved.demonLordExpToNext, fallback.demonLordExpToNext, 1),
    gold: integerAtLeast(saved.gold, fallback.gold, 0),
    territoryLiberation: clamp(integerAtLeast(saved.territoryLiberation, fallback.territoryLiberation, 0), 0, 100),
    unitCapacity: integerAtLeast(saved.unitCapacity, fallback.unitCapacity, 1),
    itemCapacity: integerAtLeast(saved.itemCapacity, fallback.itemCapacity, 1),
    maxPartySize: integerAtLeast(saved.maxPartySize, fallback.maxPartySize, 1),
    units: normalizedUnits,
    inventory,
    activeExpedition: undefined,
    records,
    collection: normalizeCollection(saved.collection, fallback.collection, normalizedUnits, inventory, records),
    achievements: normalizeAchievements(saved.achievements, fallback.achievements),
    bossRecords,
    dungeonMastery,
    collectionRewards: normalizeCollectionRewards(saved.collectionRewards, fallback.collectionRewards),
    selectedTitleId: typeof saved.selectedTitleId === "string" ? saved.selectedTitleId : undefined,
    tutorialDismissed: typeof saved.tutorialDismissed === "boolean" ? saved.tutorialDismissed : fallback.tutorialDismissed,
    createdAt: numberOr(saved.createdAt, fallback.createdAt),
    updatedAt: numberOr(saved.updatedAt, fallback.updatedAt),
  };

  let activeExpedition: ExpeditionState | undefined;
  let activeRecoveryReason: string | undefined;
  let migrationNote: string | undefined;
  const hasSavedActive = saved.activeExpedition !== undefined && saved.activeExpedition !== null;

  if (hasSavedActive && sourceVersion < 6) {
    const legacy = normalizeLegacyActiveMetadata(saved.activeExpedition, normalizedUnits);
    if (legacy.metadata) {
      // v5 active expedition is upgraded once from the normalized migration-time state because the original departure snapshot was not stored.
      const snapshot = createExpeditionDepartureSnapshotV1(provisional, legacy.metadata);
      const seed = createLegacyV5ExpeditionSeed({
        expeditionId: legacy.metadata.id,
        dungeonId: legacy.metadata.dungeonId,
        unitIds: legacy.metadata.unitIds,
        strategy: legacy.metadata.strategy,
        itemId: legacy.metadata.itemId,
        startedAt: legacy.metadata.startedAt,
        endsAt: legacy.metadata.endsAt,
        durationSeconds: legacy.metadata.durationSeconds,
      });
      activeExpedition = {
        ...legacy.metadata,
        simulationVersion: 1,
        seed,
        snapshot,
        outcome: createExpeditionRawOutcomeV1(provisional, legacy.metadata, seed, snapshot),
      };
    } else {
      migrationNote = legacy.reason;
    }
  } else if (hasSavedActive) {
    activeExpedition = normalizeV6ActiveExpedition(saved.activeExpedition, normalizedUnits);
    if (!activeExpedition) {
      activeRecoveryReason = "破損した進行中遠征だけを解除しました。保存済み結果の再抽選は行っていません。";
    }
  }

  const units = activeExpedition
    ? normalizedUnits.map((unit) =>
        activeExpedition?.unitIds.includes(unit.id)
          ? { ...unit, status: "expedition" as const, recoveryUntil: undefined }
          : unit.status === "expedition"
            ? { ...unit, status: "idle" as const }
            : unit,
      )
    : normalizedUnits.map((unit) =>
        unit.status === "expedition" ? { ...unit, status: "idle" as const, recoveryUntil: undefined } : unit,
      );
  const normalized: GameState = {
    ...provisional,
    units,
    activeExpedition,
    collection: normalizeCollection(
      saved.collection,
      fallback.collection,
      units,
      inventory,
      records,
      activeExpedition?.dungeonId,
    ),
  };

  const withSafeTitle = {
    ...normalized,
    selectedTitleId: normalizeSelectedTitleId(normalized),
  };

  return {
    state: evaluateAchievements(withSafeTitle, withSafeTitle.updatedAt).state,
    activeRecoveryReason,
    migrationNote,
  };
};

const recoverCorruptSave = (raw: string, reason: string): LoadGameResult => {
  const backup = backupRawSave(raw, "corrupt");
  const state = createVersionedInitialState();

  if (!backup.failed) {
    saveGameState(state);
  }

  return {
    state,
    status: "recovered",
    backupKey: backup.key,
    canSave: !backup.failed,
    message: backup.failed
      ? `セーブデータの破損を検知しました。${reason} ${backup.message ?? ""} 現在は初期データで起動していますが、元データは上書きしていません。`
      : `セーブデータの破損を検知したため初期化しました。元データは ${backup.key} に退避しています。`,
  };
};

export const saveGameState = (state: GameState): StorageWriteResult => {
  if (typeof localStorage === "undefined") {
    return { ok: false, message: "この環境ではlocalStorageを利用できないため、セーブできません。" };
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, version: SAVE_VERSION }));
    return { ok: true, message: "セーブしました。" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "不明な保存エラー";
    return { ok: false, message: `セーブに失敗しました。ブラウザの保存領域を確認してください。(${detail})` };
  }
};

export const loadSavedGame = (): LoadGameResult => {
  if (typeof localStorage === "undefined") {
    return {
      state: createVersionedInitialState(),
      status: "fresh",
      message: "localStorageを利用できないため、このプレイは保存されません。",
      canSave: false,
    };
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return { state: createVersionedInitialState(), status: "fresh", message: "" };
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPotentialSaveData(parsed)) {
      return recoverCorruptSave(raw, "保存形式がゲームの想定と一致しません。");
    }

    const migration = migrateSaveData(parsed);
    const normalized = normalizeGameState(migration.data, migration.fromVersion);
    const state = normalized.state;

    if (normalized.activeRecoveryReason) {
      const backup = backupRawSave(raw, "corrupt-active-expedition");
      const saveResult = backup.failed ? undefined : saveGameState(state);
      const backupText = backup.failed
        ? ` ${backup.message ?? "進行中遠征の復旧前バックアップを作成できませんでした。"}`
        : ` 元データは ${backup.key} に退避しています。`;
      const saveText = saveResult && !saveResult.ok ? ` ${saveResult.message}` : "";
      return {
        state,
        status: "recovered",
        backupKey: backup.key,
        canSave: !backup.failed && Boolean(saveResult?.ok),
        message: `${normalized.activeRecoveryReason}${backupText}${saveText}`,
      };
    }

    if (migration.migrated) {
      const backup = backupRawSave(raw, `pre-migration-v${migration.fromVersion}`);
      const saveResult = saveGameState(state);
      const backupText = backup.failed ? "移行前バックアップの作成には失敗しました。" : `移行前データは ${backup.key} に退避しています。`;
      const saveText = saveResult.ok ? "" : ` ${saveResult.message}`;
      return {
        state,
        status: "migrated",
        backupKey: backup.key,
        migratedFrom: migration.fromVersion,
        message: `古いセーブデータをversion ${SAVE_VERSION}へ移行しました。${normalized.migrationNote ?? ""}${backupText}${saveText}`,
      };
    }

    return { state, status: "loaded", message: "" };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "不明な読み込みエラー";
    return recoverCorruptSave(raw, detail);
  }
};

export const loadGameState = (): GameState => loadSavedGame().state;

export const resetGameState = (): StorageResetResult => {
  const backup = backupCurrentSave("manual-reset");
  if (backup.failed) {
    return {
      ok: false,
      message: `バックアップを作成できなかったため、リセットを中止しました。${backup.message ?? ""}`,
    };
  }

  const state = createVersionedInitialState();
  const saveResult = saveGameState(state);
  if (!saveResult.ok) {
    return {
      ok: false,
      backupKey: backup.key,
      message: `初期化データの保存に失敗しました。${backup.key ? `現在のセーブは ${backup.key} に退避済みです。` : ""} ${saveResult.message}`,
    };
  }

  return {
    ok: true,
    state,
    backupKey: backup.key,
    message: backup.key
      ? `セーブデータを初期化しました。以前のデータは ${backup.key} にバックアップしています。`
      : "セーブデータを初期化しました。",
  };
};

export const clearGameState = () => {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(STORAGE_KEY);
  }
};
