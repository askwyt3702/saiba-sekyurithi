# 動的生成 第1段階：行動ルールの基盤

## 実装した境界

Backendの`game_rules.validate_action(map, state, action)`は行動前の条件のみを判定し、`transition(map, state, action)`は入力をコピーして状態とログイベントを返す。DB・乱数・現在時刻・グローバルなステージ参照を使わない。ルール内の作業用オブジェクトは更新するが、呼出元のマップ・状態・行動は変更しない。

対象はスキャン/遠隔スキャン、侵入、権限、資源・時間・警戒度、補給/低減、鍵認証、監視/ゲート解除、回収、回復、pause/resume、勝利/検知/手詰まり。検知はノード効果・勝利より優先する。既存の数値と効果は変更していない。

`game_logic.apply_action`はDBから状態と過去の暗号認証を読み、純粋遷移の結果を保存するアダプター。認証状態は純粋状態ではboolとして保持し、旧データのログからの変換はアダプター側だけが担う。DBスキーマ・API項目は変更していない。

TypeScriptも`gameRules.validateAction`と`transition`へ同様に分離。内部のRuleRunnerはコピーされた状態だけを更新する。MockGameClientは固定マップからの開始/reset、鍵文字と表示用ログIDの生成、購読者への通知を担当する。純粋遷移のログIDは決定的な値で、Mockアダプターが表示用IDへ変換する。

PythonとTypeScriptは別言語の対応実装であり、単一バイナリを共有する方式ではない。共有シナリオを実BackendとMockへ一手ずつ実行し、判定・時間・警戒度・資源・権限・ノード攻略・勝敗・評価・ギミックログを照合する。各言語のシミュレーターはその言語のゲーム本体と同じ遷移を使える。

## マップ型

Pythonは`map_definition.GameMapDefinition`（TypedDict）、TypeScriptは`model/mapDefinition.GameMapDefinition`（StageDefinitionを拡張）。ステージID、seed、generator/rules版、ノード/辺、入口/最終目標/鍵/重要目標、ノード効果、監視、ゲート、初期状態、コスト・減衰・上限・回復・評価設定を持つ。

固定データは`map_from_stage` / `mapFromStage`で共有参照のないコピーへ変換する。seed=null、generatorVersion=fixed-v1、rulesVersion=turn-v1は内部の識別子で、生成器や版互換ローダーが実装されたことを意味しない。重要目標は現在空。S3の新ルールは未実装。

Pythonは既存のsnake_case/集合、フロントは既存のcamelCase/配列を維持した内部型であり、まだ保存JSONやAPIの新契約ではない。将来のスナップショット保存時に正規化・公開/非公開分離・バージョン検証のアダプターが必要。未取得の鍵文字はマップへ含めず、純粋状態/RuleContextで明示入力する。

Mockは任意のGameMapDefinitionをコンストラクター第3引数で受け取れる。通常は今までの固定ステージを使用する。既存のUI/HTTP GameStateはまだ固定ステージ参照のため、ゲーム全体で動的マップが遊べると解釈しない。

## 同期と検証

生成スクリプトで既存の初期権限・権限序列・階層順・敗北閾値を追加出力し、mapFromStageが利用する。新しいゲーム数値は追加していない。stageData.tsはスクリプトで再生成する。

既存の共有シナリオは抽出前の実行結果を保存し、抽出後の各操作の結果と比較した。追加テストは純粋遷移の決定性、入力の非変更、返却状態の独立性、拒否時の無消費、DBアダプターとのログを含む一致、別マップの入口/ゲート/目標/初期資源を扱えること、鍵認証後の無消費回収と不正暗号拒否を検証する。

pytestは245件成功、npm testは102件成功・スキップなし。typecheck/build成功。lintはエラーなし、既存警告7件。生成--checkは3ステージ・45ノードで成功。既存37シナリオの各操作結果が抽出前と一致した。CIはコミット・プッシュ禁止のため今回変更については実行しない。ブラウザでの目視操作は未実施。

| 代表ルート | 時間 | 最終警戒度 | 残資源 | 評価 |
|---|---:|---:|---:|---|
| S1最短 | 225秒 | 47.75% | 1 | A |
| S1安全 | 255秒 | 18.25% | 1 | S |
| S1資源 | 255秒 | 45.25% | 13 | A |
| S2高速 | 225秒 | 83.75% | 1 | B |
| S2安全 | 255秒 | 20.25% | 3 | S |
| S2資源 | 255秒 | 65.25% | 10 | A |

## 変更ファイル

- Backend：backend/game_logic.py、backend/game_rules.py（新規）、backend/map_definition.py（新規）
- Mock/モデル：frontend/src/game/client/mockGameClient.ts、frontend/src/game/model/gameRules.ts（新規）、frontend/src/game/model/mapDefinition.ts（新規）、frontend/src/game/model/missionResult.ts、frontend/src/game/model/types.ts、frontend/src/game/data/mockGameState.ts
- 生成：scripts/gen_stage_data.py、frontend/src/game/data/stageData.ts（スクリプト生成）
- 検証：backend/tests/test_game_rules.py（新規）、backend/tests/test_stage_strategy.py、backend/tests/fixtures/stage_routes.json、frontend/tests/gameRules.test.mjs（新規）、frontend/tests/strategy.test.mjs、scripts/simulate_stage_routes.py
- 文書：docs/api-contract.md（通信契約は不変と明記）、docs/action-rules-foundation.md（新規）

## 第2段階

1. S1の24ノード動的生成関数を作り、今回の純粋遷移で3方針を検証する。
2. seed/乱数列/候補順/探索量と正規化Snapshotの仕様を決め、Python/TypeScriptで比較する。
3. ゲーム別定義をDB保存・API・UIの参照元へ接続し、再読込固定と旧ゲーム互換を検証する。

今回はランダム生成・難度評価・ゲーム別DB保存・S3ギミック・コミット・プッシュは行わない。既存の未追跡docs/random-map-generation.mdは変更せず保持する。
