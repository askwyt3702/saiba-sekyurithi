# ステージ2 第1段階試作

## 実装したもの

- 「偽装された通信記録」を独立したstageId=2として登録。入口S2-E01、目標S2-C03。
- 設計書と一致する16ノード（External 1 / DMZ 4 / Internal 7 / Core 4）、双方向21接続。
- 初期資源25、上限30、共通コスト、通常/遠隔スキャン・侵入・回復・一時停止/再開・回収。
- S2-I03資源+7、S2-I06資源+5、S2-I05警戒度−8、S2-I07資源+5/警戒度−15、S2-C04警戒度−10の静的効果。
- S2-C03侵入後の回収で勝利。別Coreからの回収は却下。回収時も警戒度100%で敗北を優先。
- ミッション選択カードから開始可能。開始ログ・詳細・画面上部で第1段階の未実装範囲を表示。
- 入口ラベルとマップ初期表示はステージ定義を参照し、訓練/E01/S2-E01を区別。
- 既存のリザルト・RETRY/TITLEを再利用。

ステージ1の24ノード・38接続・効果、訓練の5ノード・5接続・数値は変更していない。
既存PlayerStatus.stage_id・NodeMaster・NodeStateを再利用し、DBスキーマ変更なし。起動時に全45ノードを同期する。

## 保存とステージ切り替え

HTTPクライアントは`nullroute.gameId.0`、`.1`、`.2`でゲームIDを個別保存する。
旧共有キー`nullroute.gameId`は実際のstageIdを確認して移行し、既に新しい保存先がある場合は上書きしない。
ステージ選択時に別ステージのゲームをリセットする旧挙動を廃止。別ゲームIDで新規開始/再開するためステージ1の進行が残る。
RETRY/リセットは選択中のステージだけを初期化する。
同時作成リクエストの共有はAPIベースURL・stageIdごとに分け、別ステージの作成結果を共有しない。
切り替え前の状態・遅れて届いたイベントを新しい画面に表示しない。接続失敗時のMockも選択stageIdで開始する。
旧バックエンドがstageId=2を1として返した場合はロード・保存せず、エラーとしてMockへ切り替える。

API自体の明示的な`reset`に別stageIdを渡す機能は互換性のため維持。通常のミッション選択からは別ステージへのresetを呼ばない。
未定義stageId全般の既定ステージへのフォールバック方針は今回変更していない。登録された2は正しく2を返す。

## 解放条件

従来のステージ2は未実装を示すlockedクラスとクリック処理なしのカードで、ステージ1クリアフラグ等の解放判定は存在しなかった。
今回の試作はいつでも選択可能とし、架空の解放条件は追加していない。ステージ3は未解放のまま。
ステージ2はキーボードでも選べるbuttonにした。

## 未実装の範囲と難易度

**条件付き監視と解除条件付きゲートは未実装。** 第1段階では追加警戒度も前提ロックも発生しない。
I04の取得によるC02解除、I07の取得による監視無効化/C04解除を実装済みの効果として表示・記録しない。
静的な資源補給・警戒度低下だけが有効。

`backend/stage2_data.py`の`planned_mechanics`に第2段階の設定を保存し、生成データの`plannedMechanics`へ同期した。
これはゲーム判定から参照しない準備用メタデータであり、フラグの切り替えだけで動く機能ではない。

- 監視：S2-I07未侵入時にS2-I01/C01/C03の侵入警戒度+12。
- 前提：S2-C02にはS2-I04、S2-C04にはS2-I07。
- +12と第2段階高速ルート予測83.75%は中級〜上級者向けの意図したリスクとして維持。難易度緩和目的の数値変更なし。
- 現在は基礎プレイの試作であり、完成時の戦略性・難易度・最短性の検証にはならない。ゲート未実装のため、設計完成時には使えない近道も通れる。

## 第1段階の実測

接頭辞S2-を省略。各ノードを通常スキャン→侵入し、C03でデータ回収。全て回復なし。

| 方針 | 取得順序 | 時間 | 最終警戒度 | 残資源 | 評価 |
|---|---|---:|---:|---:|---|
| 設計上の高速 | E01→D01→D03→I01→I02→C01→C03 | 225秒 | 47.75% | 1 | A・771 |
| 静的な低警戒効果 | E01→D02→D04→I05→I07→I02→C04→C03 | 255秒 | 20.25% | 3 | S・921 |
| 補給 | E01→D02→D04→I04→I06→I03→C02→C03 | 255秒 | 53.25% | 10 | A・826 |

これは監視なしの実測。設計書の高速83.75%・補給65.25%は第2段階の予測であり、数値を混同しない。
S2-C03で99%から回収すると100%・lost・評価nullとなることも確認した。

## 変更ファイル

- データ/判定：`backend/stage2_data.py`、`backend/game_data.py`、`backend/game_logic.py`（開始文言のみ）
- 生成：`scripts/gen_stage_data.py`、`frontend/src/game/data/stageData.ts`
- 保存/接続：`frontend/src/game/client/httpGameClient.ts`、`frontend/src/game/hooks/useGameClient.ts`、`frontend/src/game/data/mockGameState.ts`
- 画面：`frontend/src/App.tsx`、`components/MissionScreen/MissionScreen.tsx`とCSS、`components/NodeDetailPanel/NodeDetailPanel.tsx`、`components/MapView/MapView.tsx`、`components/MapView/NetworkNodeView.tsx`
- テスト：`backend/tests/test_stage2.py`、`backend/tests/fixtures/stage_routes.json`、`frontend/tests/missionResult.test.mjs`、`frontend/tests/httpStageSaves.test.mjs`、`frontend/tests/gameConnection.test.mjs`、`frontend/tests/stage2Ui.test.mjs`
- 文書：`docs/api-contract.md`、`docs/stage2-level-design.md`、この文書

Mockのゲーム判定は既存のステージ別ルールを再利用。ステージ2専用のmain.py・DBスキーマ変更は不要。
統合時にはチームの暗号鍵入力機能と、Python未導入時の比較テスト扱いの更新を保持した。この更新に伴うmain.py・models.py・型・Mock・鍵入力UIも統合済み。
チームのDB更新はバックエンド再起動時に既存マイグレーションで適用される。ステージ2自体には鍵断片を設定していない。
新しい拒否理由やGameStateレスポンス項目は追加していない。StageDefinitionの試作説明・開始文言・計画メタデータは生成側で型定義する。

## 検証

- Python 3.12でpytest 189件成功（チーム更新統合後）。ステージ1/訓練の回帰と、独立作成・リセット・DB同期・ID衝突なし・設計書との接続一致を確認。
- npm test 47件成功。ステージ別セーブ/旧キー移行/同時作成/古い応答の拒否/切り替えイベント/Mockへのフォールバック/カード選択を検証。
- React Flowへ16ノード・21接続とS2-E01の入口情報が渡ることを検証。実ブラウザの画面操作を行うE2Eではない。
- 共有27シナリオをBackend/Mockで一手ずつ比較。今回のステージ2は3ルート、入口制限、回収敗北、資源0回復、回収対象、未実装ゲートを含む。
- typecheck・lint・build成功。lintはpublic/script.jsの未使用関数5件と、統合した鍵入力UIのset-state-in-effect 1件の警告がある（エラーなし）。
- `backend/.venv/Scripts/python.exe scripts/gen_stage_data.py`で再生成。3ステージ・45ノード。`--check`で同期確認。
- 依存追加なし。dockerのnode_modules更新は該当なし。バックエンド再起動でステージ2ノードをDBへ同期する。

## 第2段階の作業

1. planned_mechanicsを元に条件付き監視とゲートの実判定をBackend/Mockで実装する。静的な低減で検知を取り消さず、加算は検知判定前。
2. 手詰まり判定にも同じゲート検証を使い、拒否時にコストを消費しない。新しい拒否理由を採用する場合はAPI契約・型・UIを同期。
3. 関連ノード・監視状態・操作後の警戒度・ロック条件を、プレイヤーが判断できるよう表示する。
4. +12と83.75%のリスクを保ち、全経路・方針変更・境界・回復をシミュレーションする。単に難しいことを理由に緩和しない。
5. 条件実装後に試作の未実装表示を更新し、ブラウザの目視・初見プレイテストを行う。
