import { DUNGEONS } from "../data/dungeons";
import { ITEM_DEFINITIONS, getItemDefinition } from "../data/items";
import type { DungeonRewardItem, Rarity, RewardItemStack } from "../types/game";

export const RARE_DROP_RARITIES = new Set<Rarity>(["rare", "epic", "legendary"]);
export const RARE_DROP_MASTERY_BONUS_PER_LEVEL = 0.003;
export const RARE_DROP_MASTERY_BONUS_CAP = 0.015;

const rarityRank: Record<Rarity, number> = {
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
};

const itemDefinitionsById = new Map(ITEM_DEFINITIONS.map((item) => [item.id, item]));

export interface RareDropGoalItem {
  itemId: string;
  displayName: string;
  displayIcon: string;
  rarity: Rarity;
  label: string;
  obtained: boolean;
}

export interface RareDropGoalSummary {
  items: RareDropGoalItem[];
  obtainedCount: number;
  remainingCount: number;
  totalCount: number;
  allObtained: boolean;
}

export const getRarityLabel = (rarity: Rarity) => {
  const labels: Record<Rarity, string> = {
    common: "Common",
    uncommon: "Uncommon",
    rare: "Rare",
    epic: "Epic",
    legendary: "Legendary",
  };
  return labels[rarity];
};

export const isRareDropRarity = (rarity: Rarity) => RARE_DROP_RARITIES.has(rarity);

export const isRareDropItem = (itemId: string) => isRareDropRarity(getItemDefinition(itemId).rarity);

export const getRareDropMasteryBonus = (masteryLevel: number) =>
  Math.min(
    RARE_DROP_MASTERY_BONUS_CAP,
    Math.max(0, Math.floor(masteryLevel)) * RARE_DROP_MASTERY_BONUS_PER_LEVEL,
  );

export const getRareDropItems = (items: RewardItemStack[]) =>
  items.filter((item) => isRareDropItem(item.itemId));

export const getFirstDiscoveredRareDropItems = (
  items: RewardItemStack[],
  knownItemIds: Iterable<string>,
) => {
  const known = new Set(knownItemIds);
  return getRareDropItems(items).filter((item) => !known.has(item.itemId));
};

export const formatRareDropItems = (items: RewardItemStack[]) =>
  getRareDropItems(items)
    .map((item) => {
      const definition = getItemDefinition(item.itemId);
      return `${definition.icon} ${definition.name} x${item.quantity} (${getRarityLabel(definition.rarity)})`;
    })
    .join(" / ");

export const getRareDropCandidates = (rewards: DungeonRewardItem[], limit = 3) =>
  rewards
    .map((reward) => {
      const item = getItemDefinition(reward.itemId);
      return {
        itemId: item.id,
        name: item.name,
        icon: item.icon,
        rarity: item.rarity,
        label: getRarityLabel(item.rarity),
      };
    })
    .filter((item) => isRareDropRarity(item.rarity))
    .sort((a, b) => rarityRank[b.rarity] - rarityRank[a.rarity] || a.name.localeCompare(b.name))
    .slice(0, limit);

export const getRareDropGoalSummary = (
  rewards: readonly (DungeonRewardItem | null | undefined)[] | null | undefined,
  obtainedItemIds: Iterable<string> | null | undefined,
): RareDropGoalSummary => {
  const obtained = new Set(obtainedItemIds ?? []);
  const seen = new Set<string>();
  const items = (rewards ?? [])
    .flatMap<RareDropGoalItem>((reward) => {
      if (!reward || typeof reward.itemId !== "string" || seen.has(reward.itemId)) {
        return [];
      }

      const item = itemDefinitionsById.get(reward.itemId);
      if (!item || !isRareDropRarity(item.rarity)) {
        return [];
      }

      seen.add(item.id);
      const isObtained = obtained.has(item.id);
      return [
        {
          itemId: item.id,
          displayName: isObtained ? item.name : "？？？",
          displayIcon: isObtained ? item.icon : "",
          rarity: item.rarity,
          label: getRarityLabel(item.rarity),
          obtained: isObtained,
        },
      ];
    })
    .sort(
      (a, b) =>
        Number(a.obtained) - Number(b.obtained) ||
        rarityRank[b.rarity] - rarityRank[a.rarity] ||
        a.itemId.localeCompare(b.itemId),
    );
  const obtainedCount = items.filter((item) => item.obtained).length;
  const totalCount = items.length;

  return {
    items,
    obtainedCount,
    remainingCount: totalCount - obtainedCount,
    totalCount,
    allObtained: totalCount > 0 && obtainedCount === totalCount,
  };
};

export const getDungeonRareDropCandidates = (dungeonId: string, limit = 3) => {
  const dungeon = DUNGEONS.find((entry) => entry.id === dungeonId);
  return dungeon ? getRareDropCandidates(dungeon.rewards, limit) : [];
};
