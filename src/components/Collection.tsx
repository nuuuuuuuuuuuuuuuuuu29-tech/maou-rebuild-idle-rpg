import { ACHIEVEMENTS } from "../data/achievements";
import { COLLECTION_REWARDS } from "../data/collectionRewards";
import { DUNGEONS } from "../data/dungeons";
import { getItemDefinition, ITEM_DEFINITIONS } from "../data/items";
import { UNIT_TEMPLATES } from "../data/units";
import {
  getAchievementProgress,
  getCollectionRewardProgress,
  getTotalBossDefeats,
} from "../lib/achievements";
import { formatDungeonMasteryBonus, getDungeonMasteryInfo } from "../lib/mastery";
import type { CollectionRewardContent, GameState } from "../types/game";

interface CollectionProps {
  game: GameState;
  onClaimReward: (rewardId: string) => void;
}

const categoryLabel = {
  expedition: "遠征",
  battle: "討伐",
  collection: "収集",
  growth: "育成",
};

const targetLabel = {
  monsters: "魔物",
  items: "アイテム",
  dungeons: "ダンジョン",
  total: "総登録",
};

const formatRewardContent = (rewards: CollectionRewardContent) => {
  const parts = [
    rewards.gold ? `${rewards.gold}G` : "",
    rewards.demonExp ? `魔王EXP ${rewards.demonExp}` : "",
    ...(rewards.items ?? []).map((item) => `${getItemDefinition(item.itemId).name} x${item.quantity}`),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" / ") : "記録のみ";
};

const Collection = ({ game, onClaimReward }: CollectionProps) => {
  const totalDiscoveries =
    game.collection.monsters.length + game.collection.items.length + game.collection.dungeons.length;
  const unlockedAchievements = new Map(
    game.achievements.unlocked.map((entry) => [entry.achievementId, entry.unlockedAt]),
  );
  const claimedRewards = new Set(game.collectionRewards.claimedIds);
  const bossRecords = new Map(game.bossRecords.map((record) => [record.dungeonId, record]));
  const totalDungeonClears = game.dungeonMastery.reduce((total, record) => total + record.clearCount, 0);

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">図鑑 / 実績</p>
          <h2>再建の記録</h2>
        </div>
        <span className="pill">{totalDiscoveries}件</span>
      </div>

      <section className="panel collection-summary-panel">
        <div className="summary-metrics">
          <article className="reward-metric">
            <span>実績</span>
            <strong>
              {game.achievements.unlocked.length}/{ACHIEVEMENTS.length}
            </strong>
          </article>
          <article className="reward-metric">
            <span>ボス討伐</span>
            <strong>{getTotalBossDefeats(game)}回</strong>
          </article>
          <article className="reward-metric">
            <span>図鑑報酬</span>
            <strong>
              {game.collectionRewards.claimedIds.length}/{COLLECTION_REWARDS.length}
            </strong>
          </article>
          <article className="reward-metric">
            <span>熟練踏破</span>
            <strong>{totalDungeonClears}回</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>実績</h2>
          <span className="pill">
            {game.achievements.unlocked.length}/{ACHIEVEMENTS.length}
          </span>
        </div>
        <div className="meta-grid">
          {ACHIEVEMENTS.map((achievement) => {
            const unlockedAt = unlockedAchievements.get(achievement.id);
            const progress = getAchievementProgress(game, achievement);
            const ratio = Math.min(1, progress.current / progress.target);
            return (
              <article
                key={achievement.id}
                className={unlockedAt ? "achievement-card is-complete" : "achievement-card"}
              >
                <div className="meta-card-heading">
                  <span className="status-dot good">{categoryLabel[achievement.category]}</span>
                  <strong>{achievement.title}</strong>
                </div>
                <p>{achievement.description}</p>
                <div className="progress-mini">
                  <div className="progress-mini-fill" style={{ width: `${ratio * 100}%` }} />
                </div>
                <small>
                  {unlockedAt
                    ? `${new Date(unlockedAt).toLocaleDateString()} 解除`
                    : `${progress.current}/${progress.target}`}
                </small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>図鑑報酬</h2>
          <span className="pill">
            {game.collectionRewards.claimedIds.length}/{COLLECTION_REWARDS.length}
          </span>
        </div>
        <div className="meta-grid">
          {COLLECTION_REWARDS.map((reward) => {
            const progress = getCollectionRewardProgress(game, reward);
            const claimed = claimedRewards.has(reward.id);
            const claimable = progress.done && !claimed;
            const ratio = Math.min(1, progress.current / progress.target);

            return (
              <article
                key={reward.id}
                className={
                  claimed
                    ? "collection-reward-card is-complete"
                    : claimable
                      ? "collection-reward-card is-claimable"
                      : "collection-reward-card"
                }
              >
                <div className="meta-card-heading">
                  <span className="status-dot warn">{targetLabel[reward.target]}</span>
                  <strong>{reward.title}</strong>
                </div>
                <p>{reward.description}</p>
                <div className="progress-mini">
                  <div className="progress-mini-fill" style={{ width: `${ratio * 100}%` }} />
                </div>
                <small>
                  {progress.current}/{progress.target} / 報酬: {formatRewardContent(reward.rewards)}
                </small>
                <button
                  type="button"
                  className={claimable ? "primary-button" : "secondary-button"}
                  disabled={!claimable}
                  onClick={() => onClaimReward(reward.id)}
                >
                  {claimed ? "受取済み" : claimable ? "受け取る" : "未達成"}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>ボス討伐記録</h2>
          <span className="pill">{getTotalBossDefeats(game)}回</span>
        </div>
        <div className="meta-grid">
          {DUNGEONS.map((dungeon) => {
            const known = game.collection.dungeons.includes(dungeon.id);
            const record = bossRecords.get(dungeon.id);
            return (
              <article key={dungeon.id} className={record ? "boss-record-card is-complete" : "boss-record-card"}>
                <div className="meta-card-heading">
                  <span className="large-icon">{known ? dungeon.icon : "??"}</span>
                  <strong>{known ? dungeon.name : "？？？"}</strong>
                </div>
                <p>{known ? dungeon.boss.name : "未発見の支配者"}</p>
                <small>
                  {record
                    ? `${record.defeats}回討伐 / 初討伐 ${new Date(record.firstDefeatedAt ?? 0).toLocaleDateString()}`
                    : known
                      ? "未討伐"
                      : "未発見"}
                </small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>魔物</h2>
          <span className="pill">
            {game.collection.monsters.length}/{UNIT_TEMPLATES.length}
          </span>
        </div>
        <div className="collection-grid">
          {UNIT_TEMPLATES.map((unit) => {
            const known = game.collection.monsters.includes(unit.id);
            return (
              <article key={unit.id} className="collection-card">
                <span className="large-icon">{known ? unit.emoji : "??"}</span>
                <strong>{known ? unit.species : "？？？"}</strong>
                <small>{known ? unit.description : "未発見"}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>アイテム</h2>
          <span className="pill">
            {game.collection.items.length}/{ITEM_DEFINITIONS.length}
          </span>
        </div>
        <div className="collection-grid">
          {ITEM_DEFINITIONS.map((item) => {
            const known = game.collection.items.includes(item.id);
            return (
              <article key={item.id} className="collection-card">
                <span className="large-icon">{known ? item.icon : "??"}</span>
                <strong>{known ? item.name : "？？？"}</strong>
                <small>{known ? item.description : "未発見"}</small>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>ダンジョン</h2>
          <span className="pill">
            {game.collection.dungeons.length}/{DUNGEONS.length}
          </span>
        </div>
        <div className="collection-grid">
          {DUNGEONS.map((dungeon) => {
            const known = game.collection.dungeons.includes(dungeon.id);
            const mastery = getDungeonMasteryInfo(game, dungeon.id);
            return (
              <article key={dungeon.id} className="collection-card">
                <span className="large-icon">{known ? dungeon.icon : "??"}</span>
                <strong>{known ? dungeon.name : "？？？"}</strong>
                <small>{known ? dungeon.description : "未発見"}</small>
                {known && (
                  <small>
                    熟練度Lv{mastery.level} / 踏破{mastery.clearCount}回 /{" "}
                    {mastery.nextTarget ? `次Lvまで${mastery.remainingToNext}回` : "熟練度最大"} /{" "}
                    {formatDungeonMasteryBonus(mastery.level)}
                  </small>
                )}
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
};

export default Collection;
