import type { AchievementDefinition } from "../types/game";

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "first-expedition",
    title: "黒旗の初遠征",
    description: "遠征記録を1件残す。",
    category: "expedition",
    requirement: { type: "expeditionCount", count: 1 },
  },
  {
    id: "first-reclamation",
    title: "奪還の狼煙",
    description: "遠征で初めて勝利する。",
    category: "battle",
    requirement: { type: "successCount", count: 1 },
  },
  {
    id: "three-victories",
    title: "小領主の帰還",
    description: "遠征勝利を3回達成する。",
    category: "battle",
    requirement: { type: "successCount", count: 3 },
  },
  {
    id: "first-boss-defeat",
    title: "首級を掲げる者",
    description: "いずれかのダンジョンボスを討伐する。",
    category: "battle",
    requirement: { type: "bossDefeats", count: 1 },
  },
  {
    id: "five-boss-defeats",
    title: "玉座へ続く斬跡",
    description: "ボス討伐数の合計が5回に到達する。",
    category: "battle",
    requirement: { type: "bossDefeats", count: 5 },
  },
  {
    id: "first-rescue",
    title: "牢の鍵を折る",
    description: "囚われた魔物を1体救出する。",
    category: "expedition",
    requirement: { type: "rescuedUnits", count: 1 },
  },
  {
    id: "rare-spoil",
    title: "月影の戦利品",
    description: "Rare以上のアイテムか魔物を獲得する。",
    category: "collection",
    requirement: { type: "rareRewards", count: 1 },
  },
  {
    id: "collector-ten",
    title: "再建目録の一頁",
    description: "図鑑登録数の合計が10件に到達する。",
    category: "collection",
    requirement: { type: "collectionTotal", count: 10 },
  },
  {
    id: "monster-five",
    title: "配下、五つの影",
    description: "発見済み魔物が5種類に到達する。",
    category: "collection",
    requirement: { type: "monsterCollection", count: 5 },
  },
  {
    id: "item-eight",
    title: "倉に灯るもの",
    description: "発見済みアイテムが8種類に到達する。",
    category: "collection",
    requirement: { type: "itemCollection", count: 8 },
  },
  {
    id: "dungeon-three",
    title: "地図に増える黒印",
    description: "発見済みダンジョンが3か所に到達する。",
    category: "expedition",
    requirement: { type: "dungeonCollection", count: 3 },
  },
  {
    id: "lord-level-three",
    title: "魔王軍、再点火",
    description: "魔王Lv3に到達する。",
    category: "growth",
    requirement: { type: "demonLordLevel", level: 3 },
  },
];

export const getAchievement = (id: string) => {
  const achievement = ACHIEVEMENTS.find((entry) => entry.id === id);
  if (!achievement) {
    throw new Error(`Unknown achievement: ${id}`);
  }
  return achievement;
};
