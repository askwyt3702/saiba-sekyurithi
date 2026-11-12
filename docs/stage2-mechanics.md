# ステージ2：第2段階 実装・検証報告

## 実装

S2-I07未攻略中、S2-I01・S2-C01・S2-C03の侵入に追加警戒度12%。スキャン・回復・回収には追加しない。I07攻略後は監視を解除し、イベントログを表示する。追加分を含む行動後警戒度が100%なら侵入完了・ノード効果より先に敗北する。

S2-C02はS2-I04、S2-C04はS2-I07攻略で解除する。侵入には既存のスキャン・隣接・権限・資源条件も必要。ロック中の侵入拒否はnode_lockedで、資源・時間・警戒度・ログを変えない。通常・リモートスキャン条件は従来どおり。解除時に一度だけログを出す。

UIは全体の監視・ゲート状態、マップの監視対象とロック表示、詳細の解除ノードID・追加警戒度・侵入後警戒度予測を表示する。100%の敗北リスクを操作前に確認できる。攻略状態から導出するためロード・リセットでも同期する。ステージ0・1には表示しない。

16ノード・21接続、初期資源25・上限30、基本コスト、既存の静的ノード効果、共通評価式は変更していない。ステージ0・1の定義がHEADと一致することをPythonで比較済み。DBスキーマ・GameStateレスポンスの追加項目は不要。API契約とフロント型にnode_lockedを追加した。BackendとMockで同じ生成設定を使用する。

## 実測ルート

全IDの接頭辞はS2-。各ノードを通常スキャン→侵入し、最後にC03で回収する。初期状態から既存Backend実装をメモリ内SQLiteで実行した結果であり、予測値ではない。Mockとも各操作後の状態・判定・ギミックログを比較した。

| 方針 | 攻略順（全IDにS2-） | 時間 | 最終警戒度 | 残資源 | 勝敗 | 評価 |
|---|---|---:|---:|---:|---|---|
| 高速 | E01→D01→D03→I01→I02→C01→C03 | 225秒 | 83.75% | 1 | 勝利 | B / 591 |
| 安全 | E01→D02→D04→I05→I07→I02→C04→C03 | 255秒 | 20.25% | 3 | 勝利 | S / 921 |
| 資源回収 | E01→D02→D04→I04→I06→I03→C02→C03 | 255秒 | 65.25% | 10 | 勝利 | A / 766 |

高速は最短時間だが警戒度と資源の余裕が小さい。安全は30秒多くかけて監視を解除する。資源回収は補給を得る代わりにC03の監視が残る。追加警戒度12%と意図した高速ルートの難易度は緩和していない。

再現コマンド：`backend/.venv/Scripts/python.exe scripts/simulate_stage_routes.py`。

## 検証結果

- Python 3.12環境：pytest 202件成功（依存ライブラリの非推奨警告2件）。
- npm test：60件成功・スキップなし。BackendとMockの操作結果・状態・ギミックログ一致を含む。
- npm run typecheck：成功。
- npm run lint：エラーなし。既存警告6件（public/script.jsの未使用関数5件、既存パスコード欄のeffect内setState 1件）。
- npm run build：成功。サンドボックスの親ディレクトリ読込制限による初回失敗後、通常権限で再実行。
- 生成スクリプト実行済み。gen_stage_data.py --check成功：3ステージ・45ノード。
- 監視対象3ノードの解除前後、84%からの侵入で100%敗北、83.99%から99.99%で継続、両ゲートの拒否時全状態不変、解除後侵入、解除ログ重複防止、リセット、ステージ0・1回帰、UI表示更新を検証。

## 変更ファイル

- Backend：backend/game_logic.py、backend/stage2_data.py
- 生成：scripts/gen_stage_data.py、frontend/src/game/data/stageData.ts（スクリプト生成）
- Mock・型・共通判定：frontend/src/game/client/mockGameClient.ts、frontend/src/game/model/actionRules.ts、frontend/src/game/model/types.ts
- UI：frontend/src/App.tsx、frontend/src/components/StageMechanics/StageMechanicsStatus.tsx、同StageMechanicsStatus.css、frontend/src/components/MapView/MapView.tsx、同NetworkNodeView.tsx・NetworkNodeView.css、frontend/src/components/NodeDetailPanel/NodeDetailPanel.tsx・NodeDetailPanel.css、frontend/src/components/MissionScreen/MissionScreen.tsx
- 検証：backend/tests/fixtures/stage_routes.json、backend/tests/test_stage2.py、scripts/simulate_stage_routes.py、frontend/tests/strategy.test.mjs、frontend/tests/stage2Ui.test.mjs、frontend/tests/missionResult.test.mjs
- 文書：docs/api-contract.md、docs/stage2-level-design.md、docs/stage2-mechanics.md

## 残る確認

ブラウザでの目視プレイテストとリモートCIは未実施。UIの自動テストは描画要素・操作可否・状態更新を検証しており、実ブラウザの見た目の確認は代替しない。チーム確認時は新規開始またはリセットを使用する。第1段階のセーブに既に攻略済みのゲートがあっても進行を巻き戻さない。既存セーブのI07攻略状態は監視状態に反映するが、過去の解除ログは追加しない。

依存ライブラリ追加なし。コミット・プッシュは依頼どおり未実施。
