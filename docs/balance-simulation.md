# v0.7 バランス検証・シミュレーション

このツールは、序盤から中盤の遠征結果を数値で観測するための開発用CLIです。
ゲーム本体のバランス値、UI、localStorage、セーブデータは変更しません。

## 実行方法

PowerShell環境では `npm` ではなく `npm.cmd` を使います。

```bash
npm.cmd run sim:balance
```

実行時に TypeScript をテスト用CommonJSへコンパイルし、既存の遠征完了処理を通してシミュレーションします。
実ゲームのlocalStorageは読み書きしません。

## オプション

試行回数を変える:

```bash
npm.cmd run sim:balance -- --trials 1000
```

乱数seedを固定する:

```bash
npm.cmd run sim:balance -- --seed 12345
```

JSONで出力する:

```bash
npm.cmd run sim:balance -- --json
```

絞り込み例:

```bash
npm.cmd run sim:balance -- --scenario early-standard-black --strategy safe --trials 100
```

## 代表シナリオ

デフォルトでは、以下の代表ケースを各作戦方針で比較します。

- 初期部隊
- 序盤標準部隊
- 金策向け部隊
- 防御寄り部隊
- 探索向け部隊
- 高火力部隊
- 熟練度なし
- 熟練度Lv3
- 熟練度Lv5

対象ダンジョンは序盤から中盤の以下です。

- `ash-border-village`
- `black-glass-woods`
- `rust-chain-fort`
- `gray-vein-mine`
- `old-castle-moat`
- `blood-moon-chapel`
- `molten-bone-crater`

## 出力指標

- `scenarioName`: 検証シナリオ名
- `dungeonName`: 対象ダンジョン名
- `strategy`: 作戦方針
- `trials`: 試行回数
- `successRate`: 成功率
- `failureRate`: 失敗率
- `retreatRate`: 撤退率
- `averageGold`: 平均獲得金額
- `averageDemonLordExp`: 平均魔王経験値
- `averageUnitExp`: 平均ユニット経験値
- `averageTerritoryGain`: 平均領地解放率
- `rareDropRate`: Rare以上アイテムを1個以上得た試行の割合
- `averageRareItems`: Rare以上アイテムの平均入手数
- `incapacitationRate`: 参加ユニット単位の戦闘不能率
- `averageRescues`: 平均救出魔物数
- `averageItems`: 平均アイテム入手数
- `trapEventRate`: ログから推定した罠・道中圧力イベント数
- `masteryLevel`: ダンジョン熟練度Lv
- `traitProfile`: 部隊特性の合計補正

`trapEventRate` は現状の戦闘ログに専用の罠イベント種別がないため、ログからの近似値です。
厳密な罠率が必要になった場合は、ゲーム本体の挙動を変えない形でシミュレーション用テレメトリを別途検討します。

## 注意

- このツールは観測用です。
- 自動バランス調整は行いません。
- CSV出力、グラフ出力、長時間プレイAIは v0.7 では未実装です。
- `GameState.version` は `5` のままです。
