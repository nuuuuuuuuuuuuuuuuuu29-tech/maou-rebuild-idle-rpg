import { TITLES } from "../data/titles";
import {
  formatTitleRequirement,
  getSelectedTitle,
  getTitleProgress,
  getUnlockedTitles,
  isTitleUnlocked,
} from "../lib/titles";
import type { GameState, TitleCategory } from "../types/game";

interface TitlesProps {
  game: GameState;
  onSelectTitle: (titleId: string) => void;
}

const titleCategoryLabel: Record<TitleCategory, string> = {
  expedition: "遠征",
  battle: "討伐",
  growth: "成長",
  collection: "収集",
  mastery: "熟練",
  rare: "希少",
  resilience: "不屈",
};

const titleCategoryTone: Record<TitleCategory, "good" | "warn" | "bad"> = {
  expedition: "warn",
  battle: "bad",
  growth: "good",
  collection: "good",
  mastery: "warn",
  rare: "warn",
  resilience: "bad",
};

const Titles = ({ game, onSelectTitle }: TitlesProps) => {
  const selectedTitle = getSelectedTitle(game);
  const unlockedTitleIds = new Set(getUnlockedTitles(game).map((title) => title.id));

  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">称号</p>
          <h2>掲げる名</h2>
        </div>
        <span className="pill">
          {unlockedTitleIds.size}/{TITLES.length}
        </span>
      </div>
      <div className="title-current">
        <span>表示中</span>
        <strong>{selectedTitle.name}</strong>
        <small>{selectedTitle.flavor}</small>
      </div>
      <div className="meta-grid">
        {TITLES.map((title) => {
          const unlocked = isTitleUnlocked(game, title);
          const selected = selectedTitle.id === title.id;
          const progress = getTitleProgress(game, title);
          const ratio = Math.min(1, progress.current / progress.target);
          const hidden = title.hiddenUntilUnlocked && !unlocked;
          const titleName = hidden ? "？？？" : title.name;
          const flavor = hidden ? "条件はまだ霧の奥に隠されています。" : title.flavor;

          return (
            <article
              key={title.id}
              className={[
                "title-card",
                unlocked ? "is-complete" : "",
                selected ? "is-selected-title" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="meta-card-heading">
                <span className={`status-dot ${titleCategoryTone[title.category]}`}>
                  {titleCategoryLabel[title.category]}
                </span>
                <strong>{titleName}</strong>
              </div>
              <p>{flavor}</p>
              <div className="progress-mini">
                <div className="progress-mini-fill" style={{ width: `${ratio * 100}%` }} />
              </div>
              <small>
                {unlocked ? "獲得済み" : `${formatTitleRequirement(title)} / ${progress.current}/${progress.target}`}
              </small>
              <button
                type="button"
                className={selected ? "secondary-button" : "primary-button"}
                disabled={!unlocked || selected}
                onClick={() => onSelectTitle(title.id)}
              >
                {selected ? "表示中" : unlocked ? "この称号を掲げる" : "未獲得"}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default Titles;
