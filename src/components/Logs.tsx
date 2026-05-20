import { getItemDefinition } from "../data/items";
import { getStrategy } from "../data/strategies";
import { formatSeconds, getActiveExpeditionLogs, getActiveProgress } from "../lib/expedition";
import { getGoals, getNextAction } from "../lib/guidance";
import type { ExpeditionRecord, GameState, LogType } from "../types/game";
import type { TabId } from "./Nav";

interface LogsProps {
  game: GameState;
  now: number;
  onNavigate: (tab: TabId) => void;
}

const statusText = {
  in_progress: "進行中",
  success: "奪還成功",
  failure: "敗北",
  retreat: "途中撤退",
};

const logIcon: Record<LogType, string> = {
  info: "◆",
  battle: "⚔",
  loot: "✦",
  rescue: "♢",
  success: "✓",
  failure: "×",
  retreat: "↩",
};

const rarityLabel = {
  common: "通常",
  uncommon: "上物",
  rare: "希少",
  epic: "秘宝級",
  legendary: "伝説級",
};

const RewardLine = ({ record, detailed = false }: { record: ExpeditionRecord; detailed?: boolean }) => {
  if (!record.rewards) {
    return null;
  }
  const { rewards } = record;
  const itemText = rewards.items.map((item) => `${getItemDefinition(item.itemId).name} x${item.quantity}`).join("、");
  const rescuedText = rewards.rescuedUnits.map((unit) => `${unit.name}（${unit.species}）`).join("、");
  const hasRareReward =
    rewards.items.some((item) => {
      const rarity = getItemDefinition(item.itemId).rarity;
      return rarity === "rare" || rarity === "epic" || rarity === "legendary";
    }) || rewards.rescuedUnits.some((unit) => unit.rarity === "rare" || unit.rarity === "epic" || unit.rarity === "legendary");
  const itemChips = rewards.items.map((item) => {
    const definition = getItemDefinition(item.itemId);
    return (
      <span key={item.itemId} className={`loot-chip rarity-${definition.rarity}`}>
        {definition.icon} {definition.name} x{item.quantity}
        <em>{rarityLabel[definition.rarity]}</em>
      </span>
    );
  });
  const rescuedChips = rewards.rescuedUnits.map((unit) => (
    <span key={unit.unitId} className={`loot-chip rarity-${unit.rarity}`}>
      {unit.name}（{unit.species}）
      <em>{rarityLabel[unit.rarity]}</em>
    </span>
  ));

  if (detailed) {
    return (
      <div className={hasRareReward ? "reward-grid has-rare" : "reward-grid"}>
        <article className="reward-metric">
          <span>金貨</span>
          <strong>+{rewards.gold}G</strong>
        </article>
        <article className="reward-metric">
          <span>魔王EXP</span>
          <strong>+{rewards.demonExp}</strong>
        </article>
        <article className="reward-metric">
          <span>配下EXP</span>
          <strong>+{rewards.unitExp}</strong>
        </article>
        <article className="reward-metric">
          <span>領地</span>
          <strong>+{rewards.territory}%</strong>
        </article>
        {rewards.mvp && (
          <article className="reward-metric mvp-metric wide-metric">
            <span>MVP</span>
            <strong>
              {rewards.mvp.name} / {rewards.mvp.title}
            </strong>
            <p>{rewards.mvp.note}</p>
          </article>
        )}
        <article className="reward-metric wide-metric">
          <span>戦利品</span>
          <div className="loot-chip-row">{itemChips.length > 0 ? itemChips : <strong>なし</strong>}</div>
        </article>
        <article className="reward-metric wide-metric">
          <span>救出した魔物</span>
          <div className="loot-chip-row">{rescuedChips.length > 0 ? rescuedChips : <strong>なし</strong>}</div>
        </article>
      </div>
    );
  }

  return (
    <div className="reward-box">
      <span>金貨 +{rewards.gold}G</span>
      <span>魔王EXP +{rewards.demonExp}</span>
      <span>配下EXP +{rewards.unitExp}</span>
      <span>領地 +{rewards.territory}%</span>
      {rewards.mvp && <span className="mvp-line">MVP {rewards.mvp.name}</span>}
      {rewards.items.length > 0 && <span className={hasRareReward ? "rare-line" : undefined}>戦利品 {itemText}</span>}
      {rewards.rescuedUnits.length > 0 && <span className={hasRareReward ? "rare-line" : undefined}>救出 {rescuedText}</span>}
    </div>
  );
};

const Logs = ({ game, now, onNavigate }: LogsProps) => {
  const activeLogs = getActiveExpeditionLogs(game, now);
  const progress = getActiveProgress(game, now);
  const latestRecord = game.records[0];
  const nextAction = getNextAction(game);
  const goals = getGoals(game);

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">作戦記録</p>
          <h2>遠征ログ</h2>
        </div>
        {game.activeExpedition && <span className="pill">残り {formatSeconds(progress.remainingSeconds)}</span>}
      </div>

      {game.activeExpedition && (
        <section className="panel">
          <div className="panel-heading">
            <h2>進行中</h2>
            <span className="pill">{statusText.in_progress}</span>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress.ratio * 100}%` }} />
          </div>
          <ol className="log-list">
            {activeLogs.map((log) => (
              <li key={log.id} className={`log-entry ${log.type}`}>
                <span>{logIcon[log.type]}</span>
                <p>{log.message}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {latestRecord && !game.activeExpedition && (
        <section className={`panel result-highlight is-${latestRecord.status}`}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">遠征完了</p>
              <h2>今回増えたもの</h2>
            </div>
            <span className={`status-dot ${latestRecord.status === "success" ? "good" : latestRecord.status === "failure" ? "bad" : "warn"}`}>
              {statusText[latestRecord.status]}
            </span>
          </div>
          <RewardLine record={latestRecord} detailed />
          <div className="next-step-strip">
            <div>
              <strong>{nextAction.title}</strong>
              <p>{nextAction.body}</p>
            </div>
            <button type="button" className="secondary-button" onClick={() => onNavigate(nextAction.target)}>
              {nextAction.label}
            </button>
          </div>
        </section>
      )}

      {latestRecord && !game.activeExpedition && (
        <section className="panel">
          <div className="panel-heading">
            <h2>次の目標</h2>
            <span className="pill">{goals.filter((goal) => goal.done).length}/{goals.length}</span>
          </div>
          <div className="goal-list">
            {goals.map((goal) => (
              <article key={goal.title} className={goal.done ? "goal-item is-done" : "goal-item"}>
                <span>{goal.done ? "✓" : "◆"}</span>
                <div>
                  <strong>{goal.title}</strong>
                  <p>{goal.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="record-stack">
        {game.records.length === 0 && !game.activeExpedition && (
          <div className="empty-state">
            <p>まだ記録はない。最初の遠征が、魔界の年代記の一行目になる。</p>
          </div>
        )}

        {game.records.map((record) => (
          <article key={record.id} className={`record-card is-${record.status}`}>
            <div className="panel-heading">
              <div>
                <h3>{record.dungeonName}</h3>
                <p>
                  {new Date(record.endedAt).toLocaleString()} / {getStrategy(record.strategy).name}
                </p>
              </div>
              <span className={`status-dot ${record.status === "success" ? "good" : record.status === "failure" ? "bad" : "warn"}`}>
                {statusText[record.status]}
              </span>
            </div>
            <RewardLine record={record} />
            <ol className="log-list battle-report">
              {record.logs.map((log) => (
                <li key={log.id} className={`log-entry ${log.type}`}>
                  <span>{logIcon[log.type]}</span>
                  <p>{log.message}</p>
                </li>
              ))}
            </ol>
          </article>
        ))}
      </div>
    </section>
  );
};

export default Logs;
