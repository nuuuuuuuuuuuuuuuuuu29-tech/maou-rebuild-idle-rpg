import { DUNGEONS } from "../data/dungeons";
import { UNIT_TEMPLATES } from "../data/units";
import type { TabId } from "../components/Nav";
import type { GameState, GameUnit } from "../types/game";

export interface NextAction {
  title: string;
  body: string;
  label: string;
  target: TabId;
}

export interface GoalItem {
  title: string;
  body: string;
  done?: boolean;
}

export const getUnitScore = (unit: GameUnit) =>
  Math.round(unit.currentHp * 0.28 + unit.atk * 2 + unit.def * 1.45 + unit.spd * 1.2 + unit.level * 8);

export const getRecommendedUnits = (game: GameState) =>
  game.units
    .filter((unit) => unit.status === "idle")
    .sort((a, b) => getUnitScore(b) - getUnitScore(a))
    .slice(0, game.maxPartySize);

export const getFirstPlayableDungeon = (game: GameState) =>
  DUNGEONS.find((dungeon) => dungeon.unlockLevel <= game.demonLordLevel) ?? DUNGEONS[0];

export const getNextLockedDungeon = (game: GameState) =>
  DUNGEONS.find((dungeon) => dungeon.unlockLevel > game.demonLordLevel);

export const getNextAction = (game: GameState): NextAction => {
  if (game.activeExpedition) {
    return {
      title: "遠征を見守ろう",
      body: "作戦記録では進行ログと残り時間を確認できます。完了すると報酬が自動で反映されます。",
      label: "作戦記録へ",
      target: "logs",
    };
  }

  if (game.records.length === 0) {
    return {
      title: "最初の遠征を始めよう",
      body: "まずは初回おすすめのダンジョンを選び、待機中の配下を1体選んで出発しましょう。",
      label: "遠征準備へ",
      target: "expedition",
    };
  }

  const affordableUnit = UNIT_TEMPLATES.find(
    (template) =>
      template.unlockLevel <= game.demonLordLevel &&
      template.hireCost <= game.gold &&
      game.units.length < game.unitCapacity,
  );
  if (affordableUnit && game.units.length < 2) {
    return {
      title: "新しい魔物を雇用しよう",
      body: `司令部で${affordableUnit.species}を迎えると、次の遠征がぐっと安定します。`,
      label: "司令部へ",
      target: "command",
    };
  }

  if (game.demonLordLevel < 2) {
    return {
      title: "魔王Lv2を目指そう",
      body: `次のレベルまであと${Math.max(0, game.demonLordExpToNext - game.demonLordExp)}EXPです。遠征成功で大きく進みます。`,
      label: "遠征準備へ",
      target: "expedition",
    };
  }

  const nextDungeon = getNextLockedDungeon(game);
  if (nextDungeon) {
    return {
      title: "次のダンジョンを解放しよう",
      body: `${nextDungeon.name}は魔王Lv${nextDungeon.unlockLevel}で解放されます。経験値を集めましょう。`,
      label: "遠征準備へ",
      target: "expedition",
    };
  }

  return {
    title: "領地を広げよう",
    body: "攻略済みの遠征でも金貨、素材、魔王経験値を得られます。部隊を育てて解放率100%を目指しましょう。",
    label: "遠征準備へ",
    target: "expedition",
  };
};

export const getGoals = (game: GameState): GoalItem[] => {
  const nextDungeon = getNextLockedDungeon(game);
  const hasSecondUnit = game.units.length >= 2;
  const firstDungeon = getFirstPlayableDungeon(game);

  return [
    {
      title: game.records.length === 0 ? `${firstDungeon.name}へ出発` : "遠征を1回完了",
      body: game.records.length === 0 ? "最初の流れを覚えるための短い遠征です。" : "作戦ログと報酬確認の基本はつかめています。",
      done: game.records.length > 0,
    },
    {
      title: "魔王Lv2を目指す",
      body: `現在 ${game.demonLordExp}/${game.demonLordExpToNext} EXP。成功した遠征ほど多く伸びます。`,
      done: game.demonLordLevel >= 2,
    },
    {
      title: hasSecondUnit ? "配下を2体以上にする" : "新しい魔物を雇用する",
      body: hasSecondUnit ? "複数編成で遠征の安定度が上がります。" : "金貨が貯まったら司令部で戦力を増やしましょう。",
      done: hasSecondUnit,
    },
    {
      title: nextDungeon ? `${nextDungeon.name}を解放` : "全ダンジョン解放済み",
      body: nextDungeon ? `魔王Lv${nextDungeon.unlockLevel}が目標です。` : "ここからは育成と領地解放率を伸ばしましょう。",
      done: !nextDungeon,
    },
  ];
};
