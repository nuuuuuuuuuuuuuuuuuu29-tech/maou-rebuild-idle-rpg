import { ITEM_DEFINITIONS, getItemDefinition, supportItems } from "../data/items";
import { UNIT_TEMPLATES } from "../data/units";
import { getInventoryCount } from "../lib/progression";
import type { GameState } from "../types/game";

interface CommandCenterProps {
  game: GameState;
  onHire: (templateId: string) => void;
  onBuyItem: (itemId: string) => void;
  onSellItem: (itemId: string) => void;
  onSellUnit: (unitId: string) => void;
  onExpandUnits: () => void;
  onExpandItems: () => void;
}

const CommandCenter = ({
  game,
  onHire,
  onBuyItem,
  onSellItem,
  onSellUnit,
  onExpandUnits,
  onExpandItems,
}: CommandCenterProps) => {
  const canSell = game.demonLordLevel >= 3;
  const canExpand = game.demonLordLevel >= 4;

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">司令部</p>
          <h2>雇用・物資・整理</h2>
        </div>
        <span className="pill">{game.gold}G</span>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>魔物の雇用</h2>
          <span className="pill">
            {game.units.length}/{game.unitCapacity}
          </span>
        </div>
        <div className="market-grid">
          {UNIT_TEMPLATES.map((template) => {
            const locked = game.demonLordLevel < template.unlockLevel;
            return (
              <article key={template.id} className="market-card">
                <span className="large-icon">{locked ? "🔒" : template.emoji}</span>
                <h3>{locked ? "？？？" : template.species}</h3>
                <p>{locked ? `魔王Lv${template.unlockLevel}で契約可能` : template.description}</p>
                <button type="button" className="secondary-button" disabled={locked} onClick={() => onHire(template.id)}>
                  {template.hireCost}G
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>アイテム購入</h2>
          <span className="pill">
            {getInventoryCount(game.inventory)}/{game.itemCapacity}
          </span>
        </div>
        <div className="market-grid">
          {supportItems.map((item) => {
            const locked = game.demonLordLevel < item.unlockLevel;
            return (
              <article key={item.id} className="market-card">
                <span className="large-icon">{locked ? "🔒" : item.icon}</span>
                <h3>{locked ? "？？？" : item.name}</h3>
                <p>{locked ? `魔王Lv${item.unlockLevel}で入荷` : item.description}</p>
                <button type="button" className="secondary-button" disabled={locked} onClick={() => onBuyItem(item.id)}>
                  {item.price}G
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>売却</h2>
          <span className={canSell ? "pill" : "pill muted"}>{canSell ? "解放済" : "Lv3"}</span>
        </div>
        <div className="sell-grid">
          {game.units.map((unit) => (
            <button
              key={unit.id}
              type="button"
              className="sell-row"
              disabled={!canSell || unit.status !== "idle" || game.units.length <= 1}
              onClick={() => onSellUnit(unit.id)}
            >
              <span>{unit.emoji}</span>
              <strong>{unit.name}</strong>
              <small>{unit.status === "idle" ? "契約解除" : "不可"}</small>
            </button>
          ))}
          {game.inventory.map((entry) => {
            const item = getItemDefinition(entry.itemId);
            return (
              <button key={entry.itemId} type="button" className="sell-row" disabled={!canSell} onClick={() => onSellItem(entry.itemId)}>
                <span>{item.icon}</span>
                <strong>{item.name}</strong>
                <small>
                  x{entry.quantity} / {item.sellPrice}G
                </small>
              </button>
            );
          })}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>保有上限の拡張</h2>
          <span className={canExpand ? "pill" : "pill muted"}>{canExpand ? "解放済" : "Lv4"}</span>
        </div>
        <div className="upgrade-row">
          <button type="button" className="secondary-button" disabled={!canExpand} onClick={onExpandUnits}>
            配下枠 +1
          </button>
          <button type="button" className="secondary-button" disabled={!canExpand} onClick={onExpandItems}>
            アイテム枠 +3
          </button>
        </div>
      </section>

      <section className="panel compact-panel">
        <h2>保管庫</h2>
        <div className="inventory-line">
          {ITEM_DEFINITIONS.map((item) => {
            const quantity = game.inventory.find((entry) => entry.itemId === item.id)?.quantity ?? 0;
            return quantity > 0 ? (
              <span key={item.id} className="inventory-pill">
                {item.icon} {item.name} x{quantity}
              </span>
            ) : null;
          })}
        </div>
      </section>
    </section>
  );
};

export default CommandCenter;
