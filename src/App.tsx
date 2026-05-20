import { useEffect, useRef, useState } from "react";
import Collection from "./components/Collection";
import CommandCenter from "./components/CommandCenter";
import Expedition from "./components/Expedition";
import Home from "./components/Home";
import Logs from "./components/Logs";
import Nav, { type TabId } from "./components/Nav";
import Settings from "./components/Settings";
import Units from "./components/Units";
import {
  advanceGame,
  buyItem,
  claimCollectionReward,
  expandItemCapacity,
  expandUnitCapacity,
  hireUnit,
  renameUnit,
  sellItem,
  sellUnit,
  startExpedition,
  type GameActionResult,
} from "./lib/expedition";
import { SAVE_VERSION, loadSavedGame, resetGameState, saveGameState } from "./lib/storage";
import type { GameState, StrategyId } from "./types/game";

const App = () => {
  const [initialLoad] = useState(() => loadSavedGame());
  const [now, setNow] = useState(Date.now());
  const [game, setGame] = useState<GameState>(() => advanceGame(initialLoad.state, Date.now()));
  const [tab, setTab] = useState<TabId>("home");
  const [notice, setNotice] = useState(initialLoad.message || "魔王軍、再建開始。");
  const [saveEnabled, setSaveEnabled] = useState(initialLoad.canSave ?? true);
  const [levelUpNotice, setLevelUpNotice] = useState<string | null>(null);
  const previousLevelRef = useRef(game.demonLordLevel);

  useEffect(() => {
    if (!saveEnabled) {
      return;
    }
    const result = saveGameState(game);
    if (!result.ok) {
      setNotice(result.message);
    }
  }, [game, saveEnabled]);

  useEffect(() => {
    if (game.demonLordLevel > previousLevelRef.current) {
      setLevelUpNotice(`魔王Lv${game.demonLordLevel}到達。出撃枠や保有上限が強化された。`);
    }
    previousLevelRef.current = game.demonLordLevel;
  }, [game.demonLordLevel]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      setGame((previous) => advanceGame(previous, current));
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const applyAction = (result: GameActionResult) => {
    setNotice(result.message);
    setGame(advanceGame(result.state, Date.now()));
  };

  const updateName = (name: string) => {
    setGame((previous) => ({ ...previous, demonLordName: name.slice(0, 16), updatedAt: Date.now() }));
  };

  const dismissTutorial = () => {
    setGame((previous) => ({ ...previous, tutorialDismissed: true, updatedAt: Date.now() }));
    setNotice("準備は整った。まずは小さな領地を取り戻そう。");
  };

  const handleStartExpedition = (
    dungeonId: string,
    unitIds: string[],
    strategy: StrategyId,
    itemId?: string,
  ) => {
    const result = startExpedition(game, dungeonId, unitIds, strategy, itemId);
    applyAction(result);
    if (result.ok) {
      setGame((previous) => ({ ...previous, tutorialDismissed: true, updatedAt: Date.now() }));
      setTab("logs");
    }
  };

  const handleRenameUnit = (unitId: string, name: string) => applyAction(renameUnit(game, unitId, name));

  const handleResetGame = () => {
    const result = resetGameState();
    setNotice(result.message);
    if (!result.ok || !result.state) {
      return;
    }

    const next = advanceGame(result.state, Date.now());
    setGame(next);
    setSaveEnabled(true);
    previousLevelRef.current = next.demonLordLevel;
    setLevelUpNotice(null);
    setTab("home");
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">放置型・遠征型・魔物育成RPG</p>
          <h1>魔王再建記</h1>
        </div>
        <div className="header-badge">
          <span>領地</span>
          <strong>{game.territoryLiberation}%</strong>
        </div>
      </header>

      <main className="app-main">
        {levelUpNotice && (
          <div className="level-up-banner" role="status">
            <div>
              <span>LEVEL UP</span>
              <strong>{levelUpNotice}</strong>
            </div>
            <button type="button" className="icon-button" onClick={() => setLevelUpNotice(null)}>
              閉じる
            </button>
          </div>
        )}
        <div className="notice" role="status">
          {notice}
        </div>

        {tab === "home" && (
          <Home
            game={game}
            now={now}
            onNameChange={updateName}
            onNavigate={setTab}
            onDismissTutorial={dismissTutorial}
          />
        )}
        {tab === "units" && <Units game={game} now={now} onRename={handleRenameUnit} />}
        {tab === "expedition" && <Expedition game={game} now={now} onStart={handleStartExpedition} />}
        {tab === "logs" && <Logs game={game} now={now} onNavigate={setTab} />}
        {tab === "command" && (
          <CommandCenter
            game={game}
            onHire={(templateId) => applyAction(hireUnit(game, templateId))}
            onBuyItem={(itemId) => applyAction(buyItem(game, itemId))}
            onSellItem={(itemId) => applyAction(sellItem(game, itemId))}
            onSellUnit={(unitId) => applyAction(sellUnit(game, unitId))}
            onExpandUnits={() => applyAction(expandUnitCapacity(game))}
            onExpandItems={() => applyAction(expandItemCapacity(game))}
          />
        )}
        {tab === "collection" && (
          <Collection game={game} onClaimReward={(rewardId) => applyAction(claimCollectionReward(game, rewardId))} />
        )}
        {tab === "settings" && <Settings game={game} saveVersion={SAVE_VERSION} onReset={handleResetGame} />}
      </main>

      <Nav active={tab} onChange={setTab} />
    </div>
  );
};

export default App;
