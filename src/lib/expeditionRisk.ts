import { DUNGEONS } from "../data/dungeons";
import type { DungeonDefinition, DungeonEnemy, GameState, GameUnit, StrategyId } from "../types/game";
import { getUnitScore } from "./guidance";

export type ExpeditionRiskLevel = "safe" | "caution" | "danger" | "reckless";

export interface ExpeditionRisk {
  level: ExpeditionRiskLevel;
  reasons: string[];
  recommendedAction: string;
  blocksStart: false;
  metrics: {
    partyScore: number;
    requiredScore: number;
    levelGap: number;
    selectedCount: number;
  };
}

const riskLabels: Record<ExpeditionRiskLevel, string> = {
  safe: "安全",
  caution: "注意",
  danger: "危険",
  reckless: "無謀",
};

const riskRank: Record<ExpeditionRiskLevel, number> = {
  safe: 0,
  caution: 1,
  danger: 2,
  reckless: 3,
};

const strategyPressure: Record<StrategyId, number> = {
  safe: 0.12,
  balanced: 0,
  rush: -0.14,
  loot: -0.16,
};

const strategyReason: Partial<Record<StrategyId, string>> = {
  safe: "安全重視は報酬が控えめな代わりに、被害を抑えやすい作戦です。",
  rush: "強行突破は時間短縮の代わりに、被害が増えやすい作戦です。",
  loot: "戦利品重視は報酬が増える代わりに、失敗と被害のリスクが上がります。",
};

const enemyPressure = (enemy: DungeonEnemy, difficulty: number) =>
  enemy.hp * 0.22 + enemy.atk * 2.4 + enemy.def + enemy.spd * 0.9 + difficulty * 10;

const getRequiredScore = (dungeon: DungeonDefinition) => {
  const enemyAverage =
    dungeon.enemies.reduce((total, enemy) => total + enemyPressure(enemy, dungeon.difficulty), 0) /
    Math.max(1, dungeon.enemies.length);
  const bossPressure = enemyPressure(dungeon.boss, dungeon.difficulty);
  return Math.round(enemyAverage * dungeon.floors * 0.58 + bossPressure * 0.9 + dungeon.difficulty * 16 + dungeon.floors * 6);
};

const getFirstUnlockedDungeon = (game: Pick<GameState, "demonLordLevel">) =>
  DUNGEONS.find((dungeon) => dungeon.unlockLevel <= game.demonLordLevel) ?? DUNGEONS[0];

const pickRiskLevel = (value: number): ExpeditionRiskLevel => {
  if (value >= 0.92) {
    return "safe";
  }
  if (value >= 0.62) {
    return "caution";
  }
  if (value >= 0.42) {
    return "danger";
  }
  return "reckless";
};

const worsenRisk = (level: ExpeditionRiskLevel, amount: number): ExpeditionRiskLevel => {
  const nextRank = Math.min(riskRank.reckless, riskRank[level] + amount);
  return (Object.keys(riskRank) as ExpeditionRiskLevel[]).find((candidate) => riskRank[candidate] === nextRank) ?? "reckless";
};

const getAction = (
  game: GameState,
  dungeon: DungeonDefinition,
  level: ExpeditionRiskLevel,
  strategyId: StrategyId,
) => {
  const firstUnlocked = getFirstUnlockedDungeon(game);
  if (game.records.length === 0 && dungeon.id !== firstUnlocked.id) {
    return `初回は「${firstUnlocked.name}」をバランス重視で進めるのがおすすめです。`;
  }
  if (level === "reckless") {
    return "安全重視へ切り替えるか、低難度の遠征で魔王Lvと部隊Lvを上げてから挑みましょう。";
  }
  if (level === "danger") {
    return strategyId === "safe"
      ? "挑戦するなら、戦闘不能に備えて回復待ちの時間を見込んでください。"
      : "安全重視に切り替えると、被害を抑えやすくなります。";
  }
  if (level === "caution") {
    return "挑戦可能ですが、戦闘不能が出る可能性があります。必要なら安全重視を選びましょう。";
  }
  return "現在の部隊なら大きな無理はありません。目的に合わせて作戦を選べます。";
};

export const evaluateExpeditionRisk = (
  game: GameState,
  dungeon: DungeonDefinition,
  selectedUnits: GameUnit[],
  strategyId: StrategyId,
): ExpeditionRisk => {
  const selectedCount = selectedUnits.length;
  const partyScore = selectedUnits.reduce((total, unit) => total + getUnitScore(unit), 0);
  const requiredScore = getRequiredScore(dungeon);
  const levelGap = game.demonLordLevel - dungeon.recommendedLevel;
  const reasons: string[] = [];

  if (selectedCount === 0) {
    reasons.push("出撃ユニットが選ばれていません。");
    return {
      level: "reckless",
      reasons,
      recommendedAction: "待機中の魔物を1体以上選んでから遠征を始めましょう。",
      blocksStart: false,
      metrics: { partyScore, requiredScore, levelGap, selectedCount },
    };
  }

  if (levelGap < 0) {
    reasons.push(`推奨Lv${dungeon.recommendedLevel}に対して現在Lv${game.demonLordLevel}です。`);
  }
  if (selectedCount < Math.min(game.maxPartySize, 2) && dungeon.recommendedLevel >= 2) {
    reasons.push("部隊数が少なく、連戦で押し切られやすい編成です。");
  }

  const scoreRatio = partyScore / Math.max(1, requiredScore);
  if (scoreRatio < 0.48) {
    reasons.push("部隊戦力がかなり不足しています。");
  } else if (scoreRatio < 0.7) {
    reasons.push("部隊戦力に余裕が少なく、被害が出やすい見込みです。");
  } else if (scoreRatio < 0.95) {
    reasons.push("部隊戦力は届いていますが、安定周回にはまだ余裕がありません。");
  }

  if (strategyReason[strategyId]) {
    reasons.push(strategyReason[strategyId]);
  }

  const partySizeBonus = Math.min(0.08, Math.max(0, selectedCount - 1) * 0.035);
  const adjustedRatio = scoreRatio + levelGap * 0.08 + strategyPressure[strategyId] + partySizeBonus;
  let level = pickRiskLevel(adjustedRatio);

  if (levelGap <= -2) {
    level = worsenRisk(level, 2);
  } else if (levelGap < 0) {
    level = worsenRisk(level, 1);
  }

  if (reasons.length === 0) {
    reasons.push("推奨Lvと部隊戦力はおおむね足りています。");
  }

  return {
    level,
    reasons,
    recommendedAction: getAction(game, dungeon, level, strategyId),
    blocksStart: false,
    metrics: { partyScore, requiredScore, levelGap, selectedCount },
  };
};

export const getRiskLabel = (risk: ExpeditionRisk | ExpeditionRiskLevel) =>
  riskLabels[typeof risk === "string" ? risk : risk.level];

export const getRiskReasons = (risk: ExpeditionRisk) => [...risk.reasons];

export const getRecommendedAction = (risk: ExpeditionRisk) => risk.recommendedAction;

