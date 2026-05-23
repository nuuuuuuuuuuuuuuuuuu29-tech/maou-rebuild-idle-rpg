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
  DungeonMasteryRecord,
  ExpeditionRecord,
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
import { deriveDungeonMasteryFromRecords, mergeDungeonMasteryRecords } from "./mastery";
import { createInitialState, createUnit } from "./progression";

export const SAVE_VERSION = 4;
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

const normalizeActiveExpedition = (active: unknown, units: GameUnit[]) => {
  if (!isRecord(active)) {
    return undefined;
  }

  const dungeonId = typeof active.dungeonId === "string" && DUNGEON_IDS.has(active.dungeonId) ? active.dungeonId : "";
  const availableUnitIds = new Set(units.map((unit) => unit.id));
  const unitIds = uniqueStringArray(active.unitIds).filter((unitId) => availableUnitIds.has(unitId));
  if (!dungeonId || unitIds.length === 0) {
    return undefined;
  }

  const startedAt = numberOr(active.startedAt, Date.now());
  const durationSeconds = integerAtLeast(active.durationSeconds, 30, 1);
  const endsAt = Math.max(startedAt, numberOr(active.endsAt, startedAt + durationSeconds * 1000));
  const strategy =
    typeof active.strategy === "string" && STRATEGY_IDS.has(active.strategy as StrategyId)
      ? (active.strategy as StrategyId)
      : "balanced";
  const itemId = typeof active.itemId === "string" && SUPPORT_ITEM_IDS.has(active.itemId) ? active.itemId : undefined;

  return {
    id: stringOr(active.id, `expedition-migrated-${startedAt}`),
    dungeonId,
    unitIds,
    strategy,
    itemId,
    startedAt,
    endsAt,
    durationSeconds,
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

const normalizeGameState = (saved: UnknownRecord): GameState => {
  const fallback = createVersionedInitialState();
  const inventory = normalizeInventory(saved.inventory, fallback.inventory);
  const records = normalizeRecords(saved.records);
  const normalizedUnits = normalizeUnits(saved.units, fallback.units);
  const activeExpedition = normalizeActiveExpedition(saved.activeExpedition, normalizedUnits);
  const units = activeExpedition
    ? normalizedUnits
    : normalizedUnits.map((unit) => (unit.status === "expedition" ? { ...unit, status: "idle" as const } : unit));
  const collection = normalizeCollection(
    saved.collection,
    fallback.collection,
    units,
    inventory,
    records,
    activeExpedition?.dungeonId,
  );
  const bossRecords = normalizeBossRecords(saved.bossRecords, records);
  const dungeonMastery = normalizeDungeonMastery(saved.dungeonMastery, records, bossRecords);

  const normalized: GameState = {
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
    units,
    inventory,
    activeExpedition,
    records,
    collection,
    achievements: normalizeAchievements(saved.achievements, fallback.achievements),
    bossRecords,
    dungeonMastery,
    collectionRewards: normalizeCollectionRewards(saved.collectionRewards, fallback.collectionRewards),
    tutorialDismissed: typeof saved.tutorialDismissed === "boolean" ? saved.tutorialDismissed : fallback.tutorialDismissed,
    createdAt: numberOr(saved.createdAt, fallback.createdAt),
    updatedAt: numberOr(saved.updatedAt, fallback.updatedAt),
  };

  return evaluateAchievements(normalized, normalized.updatedAt).state;
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
    const state = normalizeGameState(migration.data);

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
        message: `古いセーブデータをversion ${SAVE_VERSION}へ移行しました。${backupText}${saveText}`,
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
