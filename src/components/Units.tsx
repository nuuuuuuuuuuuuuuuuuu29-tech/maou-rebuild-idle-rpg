import { useState } from "react";
import { getUnitTemplate } from "../data/units";
import { formatSeconds } from "../lib/expedition";
import type { GameState, GameUnit, UnitStatus } from "../types/game";

interface UnitsProps {
  game: GameState;
  now: number;
  onRename: (unitId: string, name: string) => void;
}

const statusLabel: Record<UnitStatus, string> = {
  idle: "待機中",
  expedition: "遠征中",
  downed: "戦闘不能",
};

const statusClass: Record<UnitStatus, string> = {
  idle: "good",
  expedition: "warn",
  downed: "bad",
};

const rarityLabel = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

const recoveryText = (unit: GameUnit, now: number) => {
  if (unit.status !== "downed" || !unit.recoveryUntil) {
    return "";
  }
  return `回復まで ${formatSeconds((unit.recoveryUntil - now) / 1000)}`;
};

const Units = ({ game, now, onRename }: UnitsProps) => {
  const [selectedId, setSelectedId] = useState(game.units[0]?.id ?? "");
  const [editingNames, setEditingNames] = useState<Record<string, string>>({});
  const selected = game.units.find((unit) => unit.id === selectedId) ?? game.units[0];

  const submitRename = (unit: GameUnit) => {
    onRename(unit.id, editingNames[unit.id] ?? unit.name);
    setEditingNames((previous) => {
      const { [unit.id]: _removed, ...rest } = previous;
      return rest;
    });
  };

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">配下一覧</p>
          <h2>
            魔物ユニット {game.units.length}/{game.unitCapacity}
          </h2>
        </div>
        <span className="pill">待機 {game.units.filter((unit) => unit.status === "idle").length}体</span>
      </div>

      <div className="unit-layout">
        <div className="unit-list">
          {game.units.map((unit) => (
            <article key={unit.id} className="entity-card unit-card">
              <button type="button" className="card-hit" onClick={() => setSelectedId(unit.id)}>
                <span className="unit-emoji">{unit.emoji}</span>
                <span>
                  <strong>{unit.name}</strong>
                  <small>
                    {unit.species} / Lv{unit.level} / {rarityLabel[unit.rarity]}
                  </small>
                </span>
                <span className={`status-dot ${statusClass[unit.status]}`}>{statusLabel[unit.status]}</span>
              </button>

              <div className="mini-stats">
                <span>HP {unit.currentHp}/{unit.maxHp}</span>
                <span>ATK {unit.atk}</span>
                <span>DEF {unit.def}</span>
                <span>SPD {unit.spd}</span>
              </div>

              <div className="rename-row">
                <input
                  type="text"
                  value={editingNames[unit.id] ?? unit.name}
                  maxLength={12}
                  onChange={(event) =>
                    setEditingNames((previous) => ({ ...previous, [unit.id]: event.target.value }))
                  }
                  aria-label={`${unit.name}の名前`}
                />
                <button type="button" className="icon-button" onClick={() => submitRename(unit)}>
                  改名
                </button>
              </div>
              {unit.status === "downed" && <p className="hint">{recoveryText(unit, now)}</p>}
            </article>
          ))}
        </div>

        {selected && (
          <aside className="detail-panel">
            <span className="detail-emoji">{selected.emoji}</span>
            <h3>{selected.name}</h3>
            <p>{getUnitTemplate(selected.templateId).description}</p>
            <div className="detail-grid">
              <span>種族</span>
              <strong>{selected.species}</strong>
              <span>状態</span>
              <strong>{statusLabel[selected.status]}</strong>
              <span>経験値</span>
              <strong>
                {selected.exp}/{selected.expToNext}
              </strong>
              <span>レアリティ</span>
              <strong>{rarityLabel[selected.rarity]}</strong>
            </div>
          </aside>
        )}
      </div>
    </section>
  );
};

export default Units;
