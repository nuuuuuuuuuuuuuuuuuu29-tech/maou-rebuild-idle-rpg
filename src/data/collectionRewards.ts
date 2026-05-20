import type { CollectionRewardDefinition } from "../types/game";

export const COLLECTION_REWARDS: CollectionRewardDefinition[] = [
  {
    id: "ledger-total-5",
    title: "目録係の初任務",
    description: "図鑑登録数の合計を5件にする。",
    target: "total",
    requiredCount: 5,
    rewards: {
      gold: 80,
      items: [{ itemId: "iron-ration", quantity: 1 }],
    },
  },
  {
    id: "ledger-total-10",
    title: "黒書庫の整理",
    description: "図鑑登録数の合計を10件にする。",
    target: "total",
    requiredCount: 10,
    rewards: {
      gold: 140,
      items: [{ itemId: "smoke-charm", quantity: 1 }],
    },
  },
  {
    id: "ledger-monsters-5",
    title: "配下名簿の厚み",
    description: "発見済み魔物を5種類にする。",
    target: "monsters",
    requiredCount: 5,
    rewards: {
      gold: 180,
      demonExp: 40,
    },
  },
  {
    id: "ledger-items-8",
    title: "戦利品棚の灯",
    description: "発見済みアイテムを8種類にする。",
    target: "items",
    requiredCount: 8,
    rewards: {
      gold: 220,
      items: [{ itemId: "omen-map", quantity: 1 }],
    },
  },
  {
    id: "ledger-dungeons-3",
    title: "奪還路の黒印",
    description: "発見済みダンジョンを3か所にする。",
    target: "dungeons",
    requiredCount: 3,
    rewards: {
      gold: 260,
      demonExp: 60,
    },
  },
  {
    id: "ledger-total-25",
    title: "再建記、第二章",
    description: "図鑑登録数の合計を25件にする。",
    target: "total",
    requiredCount: 25,
    rewards: {
      gold: 480,
      items: [{ itemId: "blood-lantern", quantity: 1 }],
    },
  },
];

export const getCollectionReward = (id: string) => {
  const reward = COLLECTION_REWARDS.find((entry) => entry.id === id);
  if (!reward) {
    throw new Error(`Unknown collection reward: ${id}`);
  }
  return reward;
};
