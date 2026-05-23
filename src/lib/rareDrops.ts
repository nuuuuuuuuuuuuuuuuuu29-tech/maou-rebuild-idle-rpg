import { DUNGEONS } from "../data/dungeons";
import { getItemDefinition } from "../data/items";
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

export const getDungeonRareDropCandidates = (dungeonId: string, limit = 3) => {
  const dungeon = DUNGEONS.find((entry) => entry.id === dungeonId);
  return dungeon ? getRareDropCandidates(dungeon.rewards, limit) : [];
};
