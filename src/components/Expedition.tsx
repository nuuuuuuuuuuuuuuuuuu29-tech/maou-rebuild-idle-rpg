import { useEffect, useMemo, useState } from "react";
import { DUNGEONS } from "../data/dungeons";
import { getItemDefinition, supportItems } from "../data/items";
import { STRATEGIES } from "../data/strategies";
import { formatSeconds, getActiveProgress, getAdjustedDuration } from "../lib/expedition";
import { getExpeditionGuideState } from "../lib/expeditionGuide";
import { evaluateExpeditionRisk, getRecommendedAction, getRiskLabel, getRiskReasons } from "../lib/expeditionRisk";
import { getFirstPlayableDungeon, getRecommendedUnits, getUnitScore } from "../lib/guidance";
import { formatDungeonMasteryBonus, getDungeonMasteryInfo } from "../lib/mastery";
import { getRareDropCandidates } from "../lib/rareDrops";
import { formatPartyTraitSummary, getPartyTraitModifiers, getUnitTrait } from "../lib/traits";
import type { GameState, GameUnit, StrategyId } from "../types/game";

interface ExpeditionProps {
  game: GameState;
  now: number;
  onStart: (dungeonId: string, unitIds: string[], strategy: StrategyId, itemId?: string) => void;
}

const Expedition = ({ game, now, onStart }: ExpeditionProps) => {
  const firstUnlocked = getFirstPlayableDungeon(game).id;
  const [dungeonId, setDungeonId] = useState(firstUnlocked);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);
  const [strategyId, setStrategyId] = useState<StrategyId>("balanced");
  const [itemId, setItemId] = useState("");
  const [autoSelectedOnce, setAutoSelectedOnce] = useState(false);
  const active = game.activeExpedition;
  const progress = getActiveProgress(game, now);
  const selectedDungeon = DUNGEONS.find((dungeon) => dungeon.id === dungeonId) ?? DUNGEONS[0];
  const selectedMastery = getDungeonMasteryInfo(game, selectedDungeon.id);
  const rareDropCandidates = useMemo(() => getRareDropCandidates(selectedDungeon.rewards, 3), [selectedDungeon]);
  const selectableUnits = useMemo(() => game.units.filter((unit) => unit.status === "idle"), [game.units]);
  const recommendedUnits = useMemo(() => getRecommendedUnits(game), [game]);
  const recommendedUnitIds = useMemo(() => new Set(recommendedUnits.map((unit) => unit.id)), [recommendedUnits]);
  const duration = getAdjustedDuration(dungeonId, strategyId);
  const inventoryById = useMemo(
    () => new Map(game.inventory.map((item) => [item.itemId, item.quantity])),
    [game.inventory],
  );
  const selectedUnits = selectedUnitIds
    .map((id) => game.units.find((unit) => unit.id === id))
    .filter((unit): unit is GameUnit => Boolean(unit));
  const selectedScore = selectedUnits.reduce((total, unit) => total + getUnitScore(unit), 0);
  const partyTraitModifiers = useMemo(() => getPartyTraitModifiers(selectedUnits), [selectedUnits]);
  const partyTraitSummary = formatPartyTraitSummary(partyTraitModifiers);
  const isFirstRun = game.records.length === 0;
  const expeditionRisk = evaluateExpeditionRisk(game, selectedDungeon, selectedUnits, strategyId);
  const riskReasons = getRiskReasons(expeditionRisk).slice(0, 2);
  const riskAction = getRecommendedAction(expeditionRisk);
  const selectedStrategy = STRATEGIES.find((strategy) => strategy.id === strategyId);
  const guideState = getExpeditionGuideState({
    dungeonSelected: Boolean(selectedDungeon),
    selectedUnitCount: selectedUnitIds.length,
    strategySelected: Boolean(selectedStrategy),
    selectedDungeonName: selectedDungeon.name,
    firstDungeonName: DUNGEONS.find((dungeon) => dungeon.id === firstUnlocked)?.name ?? selectedDungeon.name,
    strategyName: selectedStrategy?.name ?? "未選択",
    isFirstRun,
  });
  const shouldHighlightUnits = guideState.highlightTarget === "units";
  const shouldHighlightStart = guideState.highlightTarget === "start";

  useEffect(() => {
    setSelectedUnitIds((previous) => {
      const selectableIds = new Set(selectableUnits.map((unit) => unit.id));
      const next = previous.filter((id) => selectableIds.has(id));
      return next.length === previous.length ? previous : next;
    });
  }, [selectableUnits]);

  useEffect(() => {
    if (!active && isFirstRun && !autoSelectedOnce && selectedUnitIds.length === 0 && recommendedUnits.length > 0) {
      setSelectedUnitIds([recommendedUnits[0].id]);
      setAutoSelectedOnce(true);
    }
  }, [active, autoSelectedOnce, isFirstRun, recommendedUnits, selectedUnitIds.length]);

  const toggleUnit = (unitId: string) => {
    setSelectedUnitIds((previous) => {
      if (previous.includes(unitId)) {
        return previous.filter((id) => id !== unitId);
      }
      if (previous.length >= game.maxPartySize) {
        return previous;
      }
      return [...previous, unitId];
    });
  };

  if (active) {
    const dungeon = DUNGEONS.find((candidate) => candidate.id === active.dungeonId);
    return (
      <section className="screen">
        <div className="panel">
          <div className="panel-heading">
            <h2>遠征中</h2>
            <span className="pill">{formatSeconds(progress.remainingSeconds)}</span>
          </div>
          <div className="active-title">
            <span className="large-icon">{dungeon?.icon}</span>
            <div>
              <h3>{dungeon?.name}</h3>
              <p>部隊は魔界の霧の奥へ進んでいる。完了後は作戦記録で報酬を確認しよう。</p>
            </div>
          </div>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progress.ratio * 100}%` }} />
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">遠征準備</p>
          <h2>奪還する領地を選ぶ</h2>
        </div>
        <span className="pill">最大 {game.maxPartySize}体</span>
      </div>

      {isFirstRun && (
        <section className="panel recommendation-panel">
          <div>
            <p className="eyebrow">初回おすすめ</p>
            <h2>まずは「煤けた境界村」に、初期配下1体で出発</h2>
          </div>
          <p>
            最初の遠征は短めで成功しやすく、報酬確認までの流れを覚えるための場所です。
            ユニットはおすすめが自動選択されています。
          </p>
        </section>
      )}

      <section className="panel expedition-guide-panel" aria-live="polite">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">出撃までの手順</p>
            <h2>{guideState.title}</h2>
          </div>
          <span className={guideState.ready ? "pill guide-ready-pill" : "pill"}>{guideState.ready ? "準備完了" : "次はこちら"}</span>
        </div>
        <p>{guideState.body}</p>
        <div className="expedition-step-list">
          {guideState.steps.map((step) => (
            <span key={step.id} className={`guide-step is-${step.status}`}>
              {step.label}
            </span>
          ))}
        </div>
      </section>

      <section className="dungeon-grid">
        {DUNGEONS.map((dungeon) => {
          const locked = dungeon.unlockLevel > game.demonLordLevel;
          const recommended = isFirstRun && dungeon.id === firstUnlocked;
          const mastery = getDungeonMasteryInfo(game, dungeon.id);
          return (
            <button
              key={dungeon.id}
              type="button"
              className={[
                "dungeon-card",
                dungeon.id === dungeonId ? "is-selected" : "",
                guideState.highlightTarget === "dungeon" && !locked ? "is-next-target" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={locked}
              onClick={() => setDungeonId(dungeon.id)}
            >
              {recommended && <span className="corner-badge">初回おすすめ</span>}
              {guideState.highlightTarget === "dungeon" && !locked && <span className="next-marker">次はこちら</span>}
              <span className="large-icon">{locked ? "🔒" : dungeon.icon}</span>
              <strong>{locked ? "？？？" : dungeon.name}</strong>
              <small>
                {locked
                  ? `魔王Lv${dungeon.unlockLevel}で解放`
                  : `推奨Lv ${dungeon.recommendedLevel} / ${dungeon.floors}階 / ${formatSeconds(dungeon.durationSeconds)}`}
              </small>
              {!locked && <small>熟練度Lv{mastery.level} / 踏破{mastery.clearCount}回</small>}
            </button>
          );
        })}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{selectedDungeon.name}</h2>
            <p>{selectedDungeon.description}</p>
          </div>
          <span className="pill">{formatSeconds(duration)}</span>
        </div>

        <div className="prep-summary">
          <span>選択中 {selectedUnitIds.length}/{game.maxPartySize}体</span>
          <span>部隊戦力 {selectedScore}</span>
          <span>{strategyId === "balanced" ? "初回向き" : "作戦変更中"}</span>
          <span>熟練度Lv{selectedMastery.level}</span>
          <span>踏破{selectedMastery.clearCount}回</span>
          <span>{formatDungeonMasteryBonus(selectedMastery.level)}</span>
          <span>{selectedMastery.nextTarget ? `次Lvまで${selectedMastery.remainingToNext}回` : "熟練度最大"}</span>
        </div>

        <div className={`risk-panel risk-${expeditionRisk.level}`}>
          <div className="risk-heading">
            <span>危険度</span>
            <strong>{getRiskLabel(expeditionRisk)}</strong>
          </div>
          <ul>
            {riskReasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p>{riskAction}</p>
        </div>

        <div className="trait-preview">
          <strong>部隊特性</strong>
          <small>{selectedUnitIds.length > 0 ? partyTraitSummary : "ユニットを選択すると特性補正を確認できます。"}</small>
        </div>

        <div className="rare-drop-preview">
          <div>
            <strong>主な希少候補</strong>
            <small>
              {selectedMastery.level > 0
                ? "熟練度により、希少品の気配がわずかに濃くなっています。"
                : "熟練度が上がると、希少品の気配が少しずつ濃くなります。"}
            </small>
          </div>
          <div className="rare-candidate-row">
            {rareDropCandidates.length > 0 ? (
              rareDropCandidates.map((item) => (
                <span key={item.itemId} className={`loot-chip rarity-${item.rarity}`}>
                  {item.icon} {item.name}
                  <em>{item.label}</em>
                </span>
              ))
            ) : (
              <span className="rare-candidate-empty">この遠征では基礎物資が中心です。</span>
            )}
          </div>
        </div>

        <div className="form-block">
          <div className="sub-heading">
            <h3>出撃ユニット</h3>
            <span className="hint">迷ったら「おすすめ」表示の魔物を選べば大丈夫です。</span>
          </div>
          <div className="selectable-grid">
            {selectableUnits.map((unit) => {
              const recommended = recommendedUnitIds.has(unit.id);
              const trait = getUnitTrait(unit);
              return (
                <button
                  key={unit.id}
                  type="button"
                  className={[
                    "select-chip",
                    selectedUnitIds.includes(unit.id) ? "is-selected" : "",
                    shouldHighlightUnits && (recommended || recommendedUnits.length === 0) ? "is-next-target" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onClick={() => toggleUnit(unit.id)}
                >
                  {shouldHighlightUnits && (recommended || recommendedUnits.length === 0) && (
                    <span className="next-marker">次はこちら</span>
                  )}
                  <span>{unit.emoji}</span>
                  <strong>{unit.name}</strong>
                  <small>
                    Lv{unit.level} / HP {unit.currentHp} / 戦力 {getUnitScore(unit)}
                  </small>
                  <em>{recommended ? `おすすめ / ${trait.name}` : trait.name}</em>
                </button>
              );
            })}
          </div>
        </div>

        <div className="form-block">
          <div className="sub-heading">
            <h3>作戦方針</h3>
            <span className="hint">初回はバランス重視がおすすめです。</span>
          </div>
          <div className="strategy-grid">
            {STRATEGIES.map((strategy) => (
              <button
                key={strategy.id}
                type="button"
                className={[
                  "strategy-card",
                  strategy.id === strategyId ? "is-selected" : "",
                  guideState.highlightTarget === "strategy" && strategy.id === "balanced" ? "is-next-target" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => setStrategyId(strategy.id)}
              >
                {guideState.highlightTarget === "strategy" && strategy.id === "balanced" && (
                  <span className="next-marker">次はこちら</span>
                )}
                <strong>{strategy.name}</strong>
                <small>{strategy.description}</small>
              </button>
            ))}
          </div>
        </div>

        <div className="form-block">
          <div className="sub-heading">
            <h3>持ち込みアイテム</h3>
            <span className="hint">なしでも出発できます。安全重視なら護符や携行食が役立ちます。</span>
          </div>
          <select value={itemId} onChange={(event) => setItemId(event.target.value)}>
            <option value="">なし</option>
            {supportItems.map((item) => {
              const quantity = inventoryById.get(item.id) ?? 0;
              return (
                <option key={item.id} value={item.id} disabled={quantity <= 0}>
                  {item.icon} {item.name} x{quantity}
                </option>
              );
            })}
          </select>
          {itemId && <p className="hint">{getItemDefinition(itemId).description}</p>}
        </div>

        <button
          type="button"
          className={["primary-button", "wide", "start-button", shouldHighlightStart ? "is-next-target is-ready" : ""]
            .filter(Boolean)
            .join(" ")}
          onClick={() => onStart(dungeonId, selectedUnitIds, strategyId, itemId || undefined)}
          disabled={selectedUnitIds.length === 0}
        >
          {guideState.ready ? "準備完了：遠征開始" : "配下を選ぶと開始できます"}
        </button>
      </section>
    </section>
  );
};

export default Expedition;
