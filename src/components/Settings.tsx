import type { GameState } from "../types/game";

interface SettingsProps {
  game: GameState;
  saveVersion: number;
  onReset: () => void;
}

const Settings = ({ game, saveVersion, onReset }: SettingsProps) => {
  const handleReset = () => {
    const confirmed = window.confirm(
      "現在のセーブデータをバックアップしてから初期化します。進行状況は新しいゲームに戻ります。実行しますか？",
    );
    if (confirmed) {
      onReset();
    }
  };

  return (
    <section className="screen">
      <div className="screen-heading">
        <div>
          <p className="eyebrow">設定</p>
          <h2>セーブデータ管理</h2>
        </div>
        <span className="pill">version {game.version}</span>
      </div>

      <section className="panel compact-panel">
        <div className="panel-heading">
          <h2>保存状態</h2>
          <span className="pill">最新 version {saveVersion}</span>
        </div>
        <div className="settings-grid">
          <article className="settings-metric">
            <span>魔王名</span>
            <strong>{game.demonLordName}</strong>
          </article>
          <article className="settings-metric">
            <span>魔王Lv</span>
            <strong>{game.demonLordLevel}</strong>
          </article>
          <article className="settings-metric">
            <span>遠征記録</span>
            <strong>{game.records.length}件</strong>
          </article>
          <article className="settings-metric">
            <span>最終更新</span>
            <strong>{new Date(game.updatedAt).toLocaleString()}</strong>
          </article>
        </div>
        <p className="hint">
          読み込み時に古いセーブは自動で移行されます。破損が見つかった場合は、元データを別キーへ退避してから初期化します。
        </p>
      </section>

      <section className="panel danger-panel">
        <div className="panel-heading">
          <div>
            <h2>セーブ初期化</h2>
            <p className="hint">現在のセーブをバックアップしたうえで、新しい魔王軍としてやり直します。</p>
          </div>
        </div>
        <button type="button" className="danger-button" onClick={handleReset}>
          セーブデータを初期化
        </button>
      </section>
    </section>
  );
};

export default Settings;
