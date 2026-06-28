import { getUnitTemplate } from "../data/units";
import type {
  CollectionState,
  GameState,
  GameUnit,
  InventoryItem,
  RewardItemStack,
} from "../types/game";

export const makeId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const getUnitExpToNext = (level: number) => Math.floor(38 + level * level * 18);

export const getDemonExpToNext = (level: number) => Math.floor(90 + level * 72);

export const getMaxPartySize = (level: number) => Math.min(5, 2 + Math.floor((level - 1) / 2));

export const createUnit = (
  templateId: string,
  options: { name?: string; level?: number; id?: string } = {},
): GameUnit => {
  const template = getUnitTemplate(templateId);
  const level = options.level ?? 1;
  const bonusLevels = Math.max(0, level - 1);
  const maxHp = template.baseStats.hp + template.growth.hp * bonusLevels;

  return {
    id: options.id ?? makeId("unit"),
    templateId,
    name: options.name ?? template.defaultName,
    species: template.species,
    emoji: template.emoji,
    rarity: template.rarity,
    level,
    exp: 0,
    expToNext: getUnitExpToNext(level),
    maxHp,
    currentHp: maxHp,
    atk: template.baseStats.atk + template.growth.atk * bonusLevels,
    def: template.baseStats.def + template.growth.def * bonusLevels,
    spd: template.baseStats.spd + template.growth.spd * bonusLevels,
    status: "idle",
  };
};

export const getInventoryCount = (inventory: InventoryItem[]) =>
  inventory.reduce((total, item) => total + item.quantity, 0);

export const addInventoryStacks = (
  inventory: InventoryItem[],
  stacks: RewardItemStack[],
  capacity: number,
) => {
  const next = inventory.map((item) => ({ ...item }));
  const accepted: RewardItemStack[] = [];
  let filled = getInventoryCount(next);

  stacks.forEach((stack) => {
    let remaining = stack.quantity;
    while (remaining > 0 && filled < capacity) {
      const existing = next.find((item) => item.itemId === stack.itemId);
      if (existing) {
        existing.quantity += 1;
      } else {
        next.push({ itemId: stack.itemId, quantity: 1 });
      }

      const acceptedStack = accepted.find((item) => item.itemId === stack.itemId);
      if (acceptedStack) {
        acceptedStack.quantity += 1;
      } else {
        accepted.push({ itemId: stack.itemId, quantity: 1 });
      }

      remaining -= 1;
      filled += 1;
    }
  });

  return { inventory: next.filter((item) => item.quantity > 0), accepted };
};

export const removeInventoryItem = (inventory: InventoryItem[], itemId: string, quantity = 1) =>
  inventory
    .map((item) =>
      item.itemId === itemId ? { ...item, quantity: Math.max(0, item.quantity - quantity) } : item,
    )
    .filter((item) => item.quantity > 0);

export const applyUnitExperience = (unit: GameUnit, amount: number): GameUnit => {
  if (amount <= 0) {
    return unit;
  }

  const template = getUnitTemplate(unit.templateId);
  const next: GameUnit = { ...unit, exp: unit.exp + amount };

  while (next.exp >= next.expToNext) {
    next.exp -= next.expToNext;
    next.level += 1;
    next.expToNext = getUnitExpToNext(next.level);
    next.maxHp += template.growth.hp;
    next.atk += template.growth.atk;
    next.def += template.growth.def;
    next.spd += template.growth.spd;
    if (next.currentHp > 0) {
      next.currentHp = Math.min(next.maxHp, next.currentHp + template.growth.hp);
    }
  }

  return next;
};

export const applyDemonExperience = (state: GameState, amount: number): GameState => {
  if (amount <= 0) {
    return state;
  }

  let level = state.demonLordLevel;
  let exp = state.demonLordExp + amount;
  let expToNext = state.demonLordExpToNext;
  let unitCapacity = state.unitCapacity;
  let itemCapacity = state.itemCapacity;

  while (exp >= expToNext) {
    exp -= expToNext;
    level += 1;
    expToNext = getDemonExpToNext(level);
    unitCapacity += 1;
    itemCapacity += 2;
  }

  return {
    ...state,
    demonLordLevel: level,
    demonLordExp: exp,
    demonLordExpToNext: expToNext,
    maxPartySize: getMaxPartySize(level),
    unitCapacity,
    itemCapacity,
  };
};

export const recoverUnits = (state: GameState, now: number): GameState => {
  let changed = false;
  const units = state.units.map((unit) => {
    if (unit.status !== "downed" || !unit.recoveryUntil || unit.recoveryUntil > now) {
      return unit;
    }

    changed = true;
    return {
      ...unit,
      currentHp: unit.maxHp,
      status: "idle" as const,
      recoveryUntil: undefined,
    };
  });

  return changed ? { ...state, units, updatedAt: now } : state;
};

export const mergeCollection = (
  collection: CollectionState,
  entries: Partial<CollectionState>,
): CollectionState => ({
  monsters: [...new Set([...collection.monsters, ...(entries.monsters ?? [])])],
  items: [...new Set([...collection.items, ...(entries.items ?? [])])],
  dungeons: [...new Set([...collection.dungeons, ...(entries.dungeons ?? [])])],
});

export const createInitialState = (): GameState => {
  const now = Date.now();
  const firstUnit = createUnit("cinder-goblin", { name: "ハイツメ", id: "unit-first-cinder" });

  return {
    version: 6,
    demonLordName: "煤冠の魔王",
    demonLordLevel: 1,
    demonLordExp: 0,
    demonLordExpToNext: getDemonExpToNext(1),
    gold: 120,
    territoryLiberation: 0,
    unitCapacity: 8,
    itemCapacity: 16,
    maxPartySize: getMaxPartySize(1),
    units: [firstUnit],
    inventory: [
      { itemId: "iron-ration", quantity: 2 },
      { itemId: "smoke-charm", quantity: 1 },
    ],
    records: [],
    collection: {
      monsters: [firstUnit.templateId],
      items: ["iron-ration", "smoke-charm"],
      dungeons: [],
    },
    achievements: {
      unlocked: [],
    },
    bossRecords: [],
    dungeonMastery: [],
    collectionRewards: {
      claimedIds: [],
    },
    tutorialDismissed: false,
    createdAt: now,
    updatedAt: now,
  };
};
