import { useState, type ChangeEvent } from "react";
import type { StorageExportResult, StorageImportResult } from "../lib/storage";
import type { GameState } from "../types/game";

interface SettingsProps {
  game: GameState;
  saveVersion: number;
  onExport: () => StorageExportResult;
  onImport: (raw: string) => StorageImportResult;
  onReset: () => void;
}

const Settings = ({ game, saveVersion, onExport, onImport, onReset }: SettingsProps) => {
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferFeedback, setTransferFeedback] = useState("");
  const [selectedFilename, setSelectedFilename] = useState("");

  const handleExport = () => {
    if (transferBusy) {
      return;
    }
    setTransferBusy(true);
    const result = onExport();
    if (!result.ok || !result.json || !result.filename) {
      setTransferFeedback(result.message);
      setTransferBusy(false);
      return;
    }

    let objectUrl: string | undefined;
    let anchor: HTMLAnchorElement | undefined;
    try {
      const blob = new Blob([result.json], { type: "application/json" });
      objectUrl = URL.createObjectURL(blob);
      anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      setTransferFeedback(result.message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なダウンロードエラー";
      setTransferFeedback(`ダウンロードに失敗しました。(${detail})`);
    } finally {
      anchor?.remove();
      if (objectUrl) {
        const urlToRevoke = objectUrl;
        window.setTimeout(() => URL.revokeObjectURL(urlToRevoke), 0);
      }
      setTransferBusy(false);
    }
  };

  const handleImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file || transferBusy) {
      input.value = "";
      return;
    }
    setSelectedFilename(file.name);
    const confirmed = window.confirm(
      "選択したセーブデータを読み込みます。現在のセーブはブラウザ内へバックアップされ、進行状況は読み込んだ内容へ置き換わります。実行しますか？",
    );
    if (!confirmed) {
      input.value = "";
      setSelectedFilename("");
      setTransferFeedback("読み込みをキャンセルしました。");
      return;
    }

    setTransferBusy(true);
    try {
      const raw = await file.text();
      const result = onImport(raw);
      setTransferFeedback(result.message);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "不明なファイル読み込みエラー";
      setTransferFeedback(`ファイルを読み込めませんでした。(${detail})`);
    } finally {
      input.value = "";
      setTransferBusy(false);
    }
  };

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

      <section className="panel save-transfer-panel" aria-busy={transferBusy}>
        <div className="panel-heading">
          <div>
            <h2>バックアップと復元</h2>
            <p className="hint">
              現在の進行状況をJSONファイルへ保存したり、以前に書き出したセーブを読み込んだりできます。
            </p>
          </div>
        </div>
        <p className="save-transfer-warning">
          読み込みに成功すると現在の進行状況は置き換わります。置き換え前のセーブはブラウザ内へバックアップします。
        </p>
        <div className="save-transfer-actions">
          <button type="button" className="secondary-button" disabled={transferBusy} onClick={handleExport}>
            {transferBusy ? "処理中…" : "セーブデータを書き出す"}
          </button>
          <label className={transferBusy ? "secondary-button save-file-control is-disabled" : "secondary-button save-file-control"}>
            {transferBusy ? "処理中…" : "セーブデータを読み込む"}
            <input
              className="save-file-input"
              type="file"
              accept=".json,application/json"
              aria-label="セーブデータファイルを選択"
              disabled={transferBusy}
              onChange={handleImportFile}
            />
          </label>
        </div>
        {selectedFilename && <p className="save-selected-file" title={selectedFilename}>選択: {selectedFilename}</p>}
        <p className="settings-feedback" role="status" aria-live="polite">
          {transferFeedback}
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
