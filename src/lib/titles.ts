import { getDungeon } from "../data/dungeons";
import { getItemDefinition } from "../data/items";
import { DEFAULT_TITLE_ID, getTitleDefinition, TITLES } from "../data/titles";
import type { ExpeditionRecord, GameState, TitleDefinition, TitleRequirement } from "../types/game";
import { getTotalBossDefeats } from "./achievements";
import { getDungeonMasteryInfo } from "./mastery";
import { isRareDropRarity } from "./rareDrops";

export interface TitleProgress {
  current: number;
  target: number;
  done: boolean;
}

const totalCollectionCount = (state: GameState) =>
  state.collection.monsters.length + state.collection.items.length + state.collection.dungeons.length;

const getSuccessCount = (records: ExpeditionRecord[]) =>
  records.filter((record) => record.status === "success").length;

const getFailureOrRetreatCount = (records: ExpeditionRecord[]) =>
  records.filter((record) => record.status === "failure" || record.status === "retreat").length;

const getRareRewardCount = (state: Pick<GameState, "records">) =>
  state.records.reduce((total, record) => {
    const itemCount =
      record.rewards?.items.filter((item) => isRareDropRarity(getItemDefinition(item.itemId).rarity)).length ?? 0;
    const rescuedCount =
      record.rewards?.rescuedUnits.filter((unit) => isRareDropRarity(unit.rarity)).length ?? 0;
    return total + itemCount + rescuedCount;
  }, 0);

const getBestDungeonMasteryLevel = (state: Pick<GameState, "dungeonMastery">) =>
  state.dungeonMastery.reduce(
    (best, record) => Math.max(best, getDungeonMasteryInfo(state, record.dungeonId).level),
    0,
  );

const asProgress = (current: number, target: number): TitleProgress => ({
  current,
  target,
  done: current >= target,
});

export const getTitleProgress = (state: GameState, title: TitleDefinition): TitleProgress => {
  const requirement = title.requirement;

  switch (requirement.type) {
    case "always":
      return { current: 1, target: 1, done: true };
    case "expeditionCount":
      return asProgress(state.records.length, requirement.count);
    case "successCount":
      return asProgress(getSuccessCount(state.records), requirement.count);
    case "failureOrRetreatCount":
      return asProgress(getFailureOrRetreatCount(state.records), requirement.count);
    case "bossDefeats":
      return asProgress(getTotalBossDefeats(state), requirement.count);
    case "demonLordLevel":
      return asProgress(state.demonLordLevel, requirement.level);
    case "territoryLiberation":
      return asProgress(state.territoryLiberation, requirement.percent);
    case "collectionTotal":
      return asProgress(totalCollectionCount(state), requirement.count);
    case "monsterCollection":
      return asProgress(state.collection.monsters.length, requirement.count);
    case "itemCollection":
      return asProgress(state.collection.items.length, requirement.count);
    case "dungeonCollection":
      return asProgress(state.collection.dungeons.length, requirement.count);
    case "dungeonMasteryLevel": {
      const current = requirement.dungeonId
        ? getDungeonMasteryInfo(state, requirement.dungeonId).level
        : getBestDungeonMasteryLevel(state);
      return asProgress(current, requirement.level);
    }
    case "rareRewards":
      return asProgress(getRareRewardCount(state), requirement.count);
    default:
      return { current: 0, target: 1, done: false };
  }
};

export const isTitleUnlocked = (state: GameState, title: TitleDefinition) =>
  getTitleProgress(state, title).done;

export const getUnlockedTitles = (state: GameState) =>
  TITLES.filter((title) => isTitleUnlocked(state, title));

export const getBestUnlockedTitle = (state: GameState) => {
  const defaultTitle = getTitleDefinition(DEFAULT_TITLE_ID) ?? TITLES[0];
  return (
    [...getUnlockedTitles(state)].sort(
      (a, b) => b.priority - a.priority || a.name.localeCompare(b.name),
    )[0] ?? defaultTitle
  );
};

export const canSelectTitle = (state: GameState, titleId: string) => {
  const title = getTitleDefinition(titleId);
  return Boolean(title && isTitleUnlocked(state, title));
};

export const normalizeSelectedTitleId = (state: GameState, selectedTitleId = state.selectedTitleId) => {
  if (selectedTitleId && canSelectTitle(state, selectedTitleId)) {
    return selectedTitleId;
  }

  return getBestUnlockedTitle(state).id;
};

export const getSelectedTitle = (state: GameState) =>
  getTitleDefinition(normalizeSelectedTitleId(state)) ?? getBestUnlockedTitle(state);

const requirementLabel = (requirement: TitleRequirement) => {
  switch (requirement.type) {
    case "always":
      return "最初から獲得";
    case "expeditionCount":
      return `遠征記録 ${requirement.count}件`;
    case "successCount":
      return `遠征成功 ${requirement.count}回`;
    case "failureOrRetreatCount":
      return `失敗または撤退 ${requirement.count}回`;
    case "bossDefeats":
      return `ボス討伐 ${requirement.count}回`;
    case "demonLordLevel":
      return `魔王Lv ${requirement.level}`;
    case "territoryLiberation":
      return `領地解放率 ${requirement.percent}%`;
    case "collectionTotal":
      return `図鑑登録 ${requirement.count}件`;
    case "monsterCollection":
      return `魔物図鑑 ${requirement.count}種`;
    case "itemCollection":
      return `アイテム図鑑 ${requirement.count}種`;
    case "dungeonCollection":
      return `ダンジョン発見 ${requirement.count}箇所`;
    case "dungeonMasteryLevel":
      return requirement.dungeonId
        ? `${getDungeon(requirement.dungeonId).name} 熟練度Lv${requirement.level}`
        : `いずれかのダンジョン熟練度Lv${requirement.level}`;
    case "rareRewards":
      return `Rare以上の戦利品 ${requirement.count}件`;
    default:
      return "条件未設定";
  }
};

export const formatTitleRequirement = (title: TitleDefinition) => requirementLabel(title.requirement);
