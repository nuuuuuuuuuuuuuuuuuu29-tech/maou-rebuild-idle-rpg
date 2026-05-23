import { getDungeon } from "../data/dungeons";
import { getStrategy } from "../data/strategies";
import { formatSeconds, getActiveProgress } from "../lib/expedition";
import { getGoals, getNextAction } from "../lib/guidance";
import { getSelectedTitle } from "../lib/titles";
import type { GameState } from "../types/game";
import type { TabId } from "./Nav";

interface HomeProps {
  game: GameState;
  now: number;
  onNameChange: (name: string) => void;
  onNavigate: (tab: TabId) => void;
  onDismissTutorial: () => void;
}

const Home = ({ game, now, onNameChange, onNavigate, onDismissTutorial }: HomeProps) => {
  const active = game.activeExpedition;
  const progress = getActiveProgress(game, now);
  const activeDungeon = active ? getDungeon(active.dungeonId) : undefined;
  const strategy = active ? getStrategy(active.strategy) : undefined;
  const nextAction = getNextAction(game);
  const goals = getGoals(game);
  const selectedTitle = getSelectedTitle(game);
  const showTutorial = !game.tutorialDismissed && game.records.length === 0 && !game.activeExpedition;

  return (
    <section className="screen">
      <div className="home-hero">
        <div className="lord-name-card">
          <label htmlFor="lord-name">魔王名</label>
          <input
            id="lord-name"
            type="text"
            value={game.demonLordName}
            onChange={(event) => onNameChange(event.target.value)}
            maxLength={16}
          />
          <div className="title-badge">
            <span>称号</span>
            <strong>{selectedTitle.name}</strong>
            <small>{selectedTitle.flavor}</small>
          </div>
        </div>
        <div className="hero-copy">
          <p>小さな勝利を積み上げ、失われた魔界を取り戻す。</p>
          <button type="button" className="primary-button" onClick={() => onNavigate("expedition")}>
            遠征を編成
          </button>
        </div>
      </div>

      {showTutorial && (
        <section className="panel tutorial-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">初回案内</p>
              <h2>最初の5分で覚えること</h2>
            </div>
            <span className="pill">すぐ遊べます</span>
          </div>
          <div className="tutorial-steps">
            <article>
              <strong>1. 配下を選ぶ</strong>
              <p>最初は初期配下を1体選べば十分です。待機中の魔物だけが出撃できます。</p>
            </article>
            <article>
              <strong>2. 近場へ遠征</strong>
              <p>初回おすすめのダンジョンは短く、成功しやすい調整です。</p>
            </article>
            <article>
              <strong>3. 報酬で再建</strong>
              <p>金貨、経験値、素材、領地解放率が増えます。次は魔王Lv2を目指しましょう。</p>
            </article>
          </div>
          <div className="action-row">
            <button type="button" className="primary-button" onClick={() => onNavigate("expedition")}>
              最初の遠征へ
            </button>
            <button type="button" className="secondary-button" onClick={onDismissTutorial}>
              案内を閉じる
            </button>
          </div>
        </section>
      )}

      <section className="panel guidance-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">次にやること</p>
            <h2>{nextAction.title}</h2>
          </div>
          <button type="button" className="secondary-button" onClick={() => onNavigate(nextAction.target)}>
            {nextAction.label}
          </button>
        </div>
        <p>{nextAction.body}</p>
      </section>

      <div className="stat-grid">
        <article className="stat-card">
          <span>魔王Lv</span>
          <strong>{game.demonLordLevel}</strong>
          <small>
            EXP {game.demonLordExp}/{game.demonLordExpToNext}
          </small>
        </article>
        <article className="stat-card">
          <span>所持金</span>
          <strong>{game.gold}G</strong>
          <small>雇用と物資購入に使用</small>
        </article>
        <article className="stat-card">
          <span>領地解放率</span>
          <strong>{game.territoryLiberation}%</strong>
          <small>100%で魔界再興</small>
        </article>
        <article className="stat-card">
          <span>出撃可能数</span>
          <strong>{game.maxPartySize}体</strong>
          <small>
            配下 {game.units.length}/{game.unitCapacity}
          </small>
        </article>
      </div>

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

      <section className="panel">
        <div className="panel-heading">
          <h2>進行中の遠征</h2>
          {activeDungeon && <span className="pill">{strategy?.name}</span>}
        </div>
        {active && activeDungeon ? (
          <div className="active-expedition">
            <div className="active-title">
              <span className="large-icon">{activeDungeon.icon}</span>
              <div>
                <h3>{activeDungeon.name}</h3>
                <p>残り {formatSeconds(progress.remainingSeconds)}</p>
              </div>
            </div>
            <div className="progress-track" aria-label="遠征進捗">
              <div className="progress-fill" style={{ width: `${progress.ratio * 100}%` }} />
            </div>
            <button type="button" className="secondary-button" onClick={() => onNavigate("logs")}>
              作戦記録を見る
            </button>
          </div>
        ) : (
          <div className="empty-state">
            <p>待機中の配下が命令を待っている。</p>
            <button type="button" className="secondary-button" onClick={() => onNavigate("expedition")}>
              遠征準備へ
            </button>
          </div>
        )}
      </section>
    </section>
  );
};

export default Home;
