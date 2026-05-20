import type { StrategyDefinition } from "../types/game";

export const STRATEGIES: StrategyDefinition[] = [
  {
    id: "balanced",
    name: "バランス重視",
    description: "標準的な進軍。危険と報酬の揺れが少ない。",
    successBonus: 0,
    rewardMultiplier: 1,
    durationMultiplier: 1,
    damageMultiplier: 1,
    lootBonus: 0,
    unitExpMultiplier: 1,
  },
  {
    id: "safe",
    name: "安全重視",
    description: "慎重に進む。成功率は上がるが報酬は控えめ。",
    successBonus: 0.12,
    rewardMultiplier: 0.82,
    durationMultiplier: 1.15,
    damageMultiplier: 0.75,
    lootBonus: -0.05,
    unitExpMultiplier: 0.92,
  },
  {
    id: "rush",
    name: "強行突破",
    description: "速度を優先する。時間は短いが被害が増えやすい。",
    successBonus: -0.02,
    rewardMultiplier: 1,
    durationMultiplier: 0.72,
    damageMultiplier: 1.35,
    lootBonus: 0,
    unitExpMultiplier: 1.08,
  },
  {
    id: "loot",
    name: "戦利品重視",
    description: "寄り道して倉庫を探す。報酬は増えるが戦闘リスクも上がる。",
    successBonus: -0.08,
    rewardMultiplier: 1.28,
    durationMultiplier: 1.08,
    damageMultiplier: 1.2,
    lootBonus: 0.18,
    unitExpMultiplier: 1,
  },
];

export const getStrategy = (id: StrategyDefinition["id"]) => {
  const strategy = STRATEGIES.find((candidate) => candidate.id === id);
  if (!strategy) {
    throw new Error(`Unknown strategy: ${id}`);
  }
  return strategy;
};
