# v1.1候補: 敵キャラクターと詳細戦闘ログ

## 概要

v1.1候補では、遠征結果と作戦記録で「何が起きたか」を読み取りやすくするため、敵キャラクターと詳細戦闘ログを追加します。

## 追加内容

- ダンジョンごとの敵キャラクター定義
- 敵名、種族、HP、攻撃、防御、速度、説明文の表示
- 味方攻撃、敵反撃、HP変化、撃破、撤退、勝利、報酬の詳細ログ
- 作戦記録から後で読める戦闘ログ表示

## v1.1.0-alpha.1で確認できるログ

- 敵キャラクター追加
- 詳細戦闘ログ追加
- 敵遭遇ログ
- 味方攻撃ログ
- 敵攻撃ログ
- HP減少ログ
- 敵撃破ログ
- 味方撃破ログ
- 撤退ログ
- 報酬ログ
- 作戦記録からの再閲覧

## v1.1.0-alpha.2で改善した表示

- 戦闘ごとの区切り見出しを追加
- 区切り見出しに敵名を表示
- 味方死亡ログを赤系・太字で強調
- 敵撃破ログを成功系の色で強調
- 勝利ログ、撤退ログ、報酬ログを状態に応じて色分け
- 保存構造、戦闘ロジック、報酬計算、敵ステータス、ダンジョン定義は変更なし

## v1.1.0-alpha.3で改善した表示

- 攻撃ログと対応するHP変化ログを表示上1行に統合
- 味方攻撃と敵攻撃の両方に対応
- 撃破、味方死亡、勝利、撤退、報酬ログは別行のまま維持
- 生の `battleLog` とlocalStorageの保存形式は変更なし
- `GameState.version` は 5 のまま
- 戦闘ロジックとバランスは変更なし
- Preview QAでは生ログ42件に対して表示25件となり、表示行数を約40%削減

## v1.1.0-alpha.4で改善した雇用画面

- 雇用候補に初期Lv、最大HP、攻撃、防御、速度を表示
- 雇用費と固定特性を比較しやすく表示
- 表示値は既存の魔物定義と特性定義から取得し、雇用後Lv1の実値と一致
- 役割など、既存データに存在しない項目は追加していない
- 雇用処理、保存形式、能力値、雇用費、戦闘バランスは変更なし
- `GameState.version` は 5 のまま
- Preview QAで375px表示、雇用、所持金不足、リロード復元を確認済み

## v1.1.0-alpha.5で改善したボス戦表示

### 追加

- ボス戦専用の「ボス戦」ラベル
- ボス戦専用の暗赤・金系表示
- ボス撃破専用の「ボス撃破」ラベル
- 通常戦とボス戦の視認性改善
- 旧ログ・不完全ログの安全な通常表示フォールバック

### 維持

- 戦闘ごとの区切り
- 攻撃、ダメージ、HP変化の1行統合
- 味方死亡ログの赤字・太字
- 敵撃破、勝利、撤退、報酬ログの強調
- `battleLog` の生データ
- 保存・リロード復元

### 変更なし

- 敵能力値
- ボス出現条件
- 戦闘ロジック
- 報酬
- 成功率
- バランス
- localStorage形式
- `SAVE_VERSION`（5のまま）

### 検証

- Unit tests: 51件 pass
- Build: 成功
- Balance simulation: 成功
- E2E smoke: 7件 pass
- Preview手動QA: 全項目OK
- 375px表示: 問題なし
- console error: 0件
- React warning: 0件

## v1.1.0-alpha.6で追加したレアドロップ目標表示

### 概要

遠征準備画面で、選択中ダンジョンのレアドロップ候補と収集状況を確認できるようにしました。

### 追加内容

- Rare以上の候補をダンジョン別に表示
- Rare / Epic / Legendaryのレアリティ表示
- 未入手・入手済み表示
- 未発見アイテムの名前・アイコンを `？？？` で隠蔽
- 未入手候補を優先表示
- 収集数表示
- 候補なしの空状態
- 全収集済み表示
- ダンジョン選択時の表示切り替え

### データ源

- `DungeonDefinition.rewards`
- `ItemDefinition.rarity`
- `collection.items`
- UI側へドロップ候補を重複定義せず、既存の構造化データから表示を導出

### 互換性

- `SAVE_VERSION` は 5 のまま
- localStorageキー変更なし
- `GameState` 変更なし
- `storage.ts` 変更なし
- 保存マイグレーション変更なし
- 表示専用保存データなし
- ドロップ候補変更なし
- ドロップ率変更なし
- 熟練度補正変更なし
- アイテム能力変更なし
- 報酬・バランス変更なし

### 検証結果

- Unit tests: 54件 pass
- Build: 成功
- Balance simulation: 成功
- Playwright E2E smoke: 8件 pass
- Preview QA: 合格
- 未入手・一部入手済み・全収集済みを確認
- 375px表示: 問題なし
- デスクトップ表示: 問題なし
- console error: 0件
- React warning: 0件
- アプリ由来の4xx / 5xx: なし

## v1.1.0-alpha.7で修正した遠征帰還後HP回復

### 概要

遠征から生還した参加ユニットの負傷HPが回復せず、周回をまたいで蓄積する不具合を修正しました。

### 原因

- 遠征完了処理で戦闘後の `currentHp` をGameStateへ反映していた
- 経験値適用後に生存者を回復する処理がなかった
- 既存の時間回復処理は `downed` だけを対象としていた
- 生存負傷者を回復させる経路が存在しなかった

### 修正内容

- `simulation.partyUpdates` の戦闘終了時HPで生存判定
- 経験値・レベルアップ処理を従来どおり適用
- 生存参加者だけ、レベルアップ後のmaxHpまで回復
- 生存者をidleへ戻し、recoveryUntilを解除
- 戦闘不能者はHP0・downed・回復待ちを維持
- 非参加ユニットは変更しない
- 戦闘レポートと作戦記録には戦闘終了時の負傷HPを維持

### 処理の分離

- 作戦記録・戦闘ログ: 戦闘終了時の実際のHPを記録
- 帰還後GameState: 生存参加者を最大HPへ回復
- `simulateExpedition` や戦闘結果生成処理では全回復していない

### 互換性

- `SAVE_VERSION` は 5 のまま
- localStorageキー変更なし
- `GameState` 型変更なし
- `storage.ts` 変更なし
- 保存マイグレーション変更なし
- 新規保存項目なし
- 敵・味方ステータス変更なし
- ダメージ計算変更なし
- 成功率・作戦補正変更なし
- 報酬・経験値量変更なし
- 遠征時間変更なし
- 戦闘不能回復時間変更なし
- ドロップ候補・確率変更なし

### ゲーム仕様への影響

- 戦闘中の数値計算や報酬バランスは変更なし
- 生存者の負傷を次の遠征へ持ち越さない仕様へ変更
- 戦闘不能者の回復待ちペナルティは従来どおり維持

### 検証結果

- Unit tests: 58件 pass
- Build: 成功
- Balance simulation: 成功
- Playwright E2E smoke: 8件 pass
- Preview QA: 合格
- 生存者の負傷と帰還後全回復: 確認
- レベルアップ後maxHpまでの回復: Unit testで確認
- 戦闘不能者のHP0・downed・回復待ち維持: Unit testで確認
- 非参加ユニット不変: Unit testで確認
- 作戦記録と保存後HPの分離: 確認
- リロード復元: 確認
- 375px表示: 問題なし
- デスクトップ表示: 問題なし
- console error: 0件
- React warning: 0件
- アプリ由来の4xx / 5xx: なし

## v1.1.0-alpha.8で追加した遠征結果永続化とBalance回帰CI

### 概要

- 遠征結果を出発時に一度だけ確定・保存し、リロード時や遠征完了時の再simulationを廃止
- 保存済み結果を唯一の正本として、遠征中から帰還後まで結果の一貫性を維持
- v5からv6への保存移行、破損した進行中遠征の局所復旧、固定seedによるBalance回帰CIを追加

### 遠征開始時の結果保存

遠征開始時に `simulationVersion`、永続seed、出発時snapshot、raw outcomeを保存します。raw outcomeには最終作戦記録、戦闘終了時HP、戦闘不能者の回復期限、救出候補、MVP、遠征ログ、戦闘ログ、遭遇した敵が含まれます。これらは出発時に一度だけ生成され、リロード時や完了時には再生成しません。

### 遠征中ログ

- 保存済みfinal log sequenceの安全なprefixだけを進捗に応じて表示
- リロード前後でログのID、順序、messageを維持
- `endsAt`より前はcompletion-only情報を表示しない
- success、failure、retreat、loot、rescue、MVPを完了前に公開しない

### 帰還時処理

- raw outcomeで生成結果を固定し、live stateでは適用可否だけを決定
- 現在のitem capacityとunit capacityに応じて、受け取れるitemと救出魔物を確定
- progression、achievements、accepted rewardsを帰還時に一度だけ反映し、duplicate rewardを防止
- 参加ユニットの現在のidentity、名前、Lv、EXPを維持
- 生存者は経験値・レベルアップ処理後のmaxHpへ回復
- 戦闘不能者はHP0と保存済みrecovery deadlineを維持

### v5からv6への移行

- `SAVE_VERSION`: 5から6へ更新
- `GameState.version`: 5から6へ更新
- localStorageキー `maou-rebuild-state-v1` は変更なし
- 通常のv5 saveを起動時にv6へmigration
- v5の進行中遠征は、migration時の正規化済みstateから一度だけupgrade
- legacy seedは保存済みmetadataからdeterministicに生成
- 持ち込みitemは再消費せず、migration前のraw saveをbackup

### 破損active expeditionの復旧

- 破損した保存結果を再生成・再抽選しない
- raw saveをbackupしてから `activeExpedition` だけを削除
- 参加ユニットをidleへ戻し、その他のGameStateを維持
- 復旧時に新しいseedやoutcomeを生成しない

### Balance regression CI

- 既存CIへ独立した `Deterministic balance regression` jobを追加
- UbuntuとNode.js 22で実行し、secret、browser、localStorage、external serviceは不要
- seed 12345・1,000 trialsを2回実行し、JSONの完全一致を確認
- seed 12345・10,000 trials・36行のcommit済みbaselineと完全比較
- toleranceやfield除外はなく、意図的なBalance変更ではbaseline差分を明示更新
- failure時は生成outputとdiffをartifact化し、成功時はGitHub Actions summaryを出力

### 互換性

変更しないもの:

- localStorageキー、package dependency
- 敵・味方能力値、damage式、success式、reward base values
- drop rates、rescue rates、MVP probabilities
- expedition durations、recovery durations
- UI layout、CSS

変更するもの:

- package version: `1.1.0-alpha.8`
- `SAVE_VERSION`: `6`
- `GameState.version`: `6`
- 進行中遠征の保存構造、migration / recovery path、CI workflow

### 検証結果

- Unit: 100 passed
- Build: passed
- E2E: 8 passed
- Balance 1,000: passed
- Balance 10,000: passed
- 36 rows: exact match
- same-seed: exact match
- v5 normal migration: passed
- v5 active migration: passed
- corrupt v6 active recovery: passed
- item capacity fixture: passed
- unit capacity fixture: passed
- 375×812: passed
- console error: 0
- React warning: 0
- page error: 0
- same-origin 4xx / 5xx: 0

## セーブデータへの影響

- 現行の `GameState.version` と `SAVE_VERSION` は6です。
- localStorageキーは `maou-rebuild-state-v1` のままです。
- v5 saveは自動migrationし、migration前のraw saveをbackupします。
- v5の進行中遠征は保存済みmetadata由来のseedを使い、migration時のstateから一度だけdeterministicにupgradeします。
- v6の進行中遠征は、保存済みoutcomeをnested dataまで厳格にvalidationします。
- 破損を検出した場合は結果を再生成せず、該当する `activeExpedition` だけを局所復旧します。
- 遠征結果は開始時に保存し、リロード時や完了時には再生成しません。
- 既存の完了済み作戦記録は維持されます。
- package versionはsave schemaの判定には使用しません。

## QA観点

- 遠征開始時にseed、snapshot、outcomeが保存されること
- active logsがfinal logsのprefixで、completion-only情報を早期表示しないこと
- リロード後もseed、snapshot、outcome、ログID・順序・messageが変わらないこと
- 完了時に再simulationせず、rewardを二重付与しないこと
- 帰還後もlive unit identityを維持し、item / unit capacityを帰還時に適用すること
- v5通常saveのmigrationとv5 active migrationの再現性を確認すること
- 破損したv6 activeだけを局所復旧し、他のGameStateを維持すること
- Balance baselineとsame-seed出力がそれぞれexact matchすること
- 375px幅で進行中・完了後ログを読めること
- console error、React warning、page errorがなく、same-origin 4xx / 5xxが発生しないこと
- Unit、Build、E2E、Balance 1,000 / 10,000が成功すること
