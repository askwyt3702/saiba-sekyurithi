# Stage1動的マップの開始・保存・再開への接続

確認日：2026-11-14。作業ブランチ：`feature/stage1-map-generator-20261114`。

## 履歴と既存変更の保護

`b760f33e00b8b84b642768e8d15255be938be279`はHEADの祖先ではないが、開始時点のステージ済み差分が同コミットの差分と一致した。双方の`git patch-id --stable`は`12142fbf4da3f5d8438e8d7d5147217e30025c0b`。最新修正は内容として取り込み済みであり、重複適用はしていない。既存の生成器コミットとステージ済み差分を保持し、main・PR #2のブランチ・2件のstashを変更していない。コミット・push・PR作成・マージは行っていない。

## 実装と主な変更ファイル

- Backend：`game_creation.py`、`main.py`、`game_logic.py`、`models.py`、`map_repository.py`。Stage1新規作成前にPython生成器で検証し、完成定義・生成情報・要求IDを進行と同じトランザクションで保存する。seed再現とrequestIdによる重複抑止に対応。GET・行動・評価・同ステージresetは保存済み定義を使用する。生成失敗は503、破損Snapshotは409。
- Mock：`mockSession.ts`、`mockGameClient.ts`、`mockGameState.ts`、`gameStart.ts`、`mapDefinition.ts`。HTTPと独立したゲーム別保存とステージ別再開先を使用。成功後にだけ再開先を更新し、正常な旧固定保存も復元する。生成結果のhashを保存復元時に検査する。破損保存から新しい動的マップを生成する場合も復旧ログを残す。
- Worker：`mapGenerator.worker.ts`、`workerClient.ts`。TypeScript生成・検証をWeb Workerで実行し、15秒でタイムアウトする。
- 開始画面：`App.tsx`、`MissionScreen.tsx`・CSS、`httpGameClient.ts`、`useGameClient.ts`。「再開 / 開始」と「新しいゲームを始める」を分離。TITLEは進行を保持、RETRYは同盤面。Stage0/2は固定、Stage3は引き続き選択不可。接続時の通信失敗はMockに切り替えるが、不正Snapshot・生成失敗・要求競合・入力エラーでは停止する。
- 表示：React Flowは既存Snapshot対応経路で保存された座標・接続を使用する。`App.tsx`でgameIdをMapViewのkeyにして新しい盤面で初期表示をやり直す。`dynamicDisplay.ts`、`map_generation_config.py`、`gen_stage_data.py`、生成`stageData.ts`で固定の接続先を前提とする説明文を動的マップ向けに補正する。生成仕様・hash対象は変えない。
- 契約・テスト：`docs/api-contract.md`、`test_dynamic_games.py`、既存Backend回帰テスト、`dynamicSession.test.mjs`、`httpStageSaves.test.mjs`、接続・結果画面のテストを更新。

## 実行結果

- Backend：`backend/.venv/Scripts/python.exe -m pytest -q`、**1079 passed**。使い捨てSQLiteで実施し、既存PostgreSQLは操作していない。依存ライブラリ由来の非推奨警告2件。
- Frontend：`npm run typecheck`成功、`npm run lint`成功（既存NodeDetailPanelの警告2件）、`npm test`は**771 passed / 0 skipped**、`npm run build`成功（チャンクサイズ警告あり）。最初のビルドはsandboxの親ディレクトリ読み取り制限で失敗し、同じコマンドを権限拡張して成功。
- `python scripts/gen_stage_data.py`を実行し、`--check`も成功（3ステージ・45ノード）。生成ファイルの手編集なし。
- 新規2回の座標・接続差、同seedのPython/TS一致、3戦略のBackend/Mock比較、API経由のC03回収、保存・再開・RETRY、起動初期化後の保存維持、生成失敗時の旧保存保護、固定保存・Stage0/2・Stage3選択不可、オフライン復旧と409停止を自動テストで確認。

## 残る確認

以下は統合実装直後の記録。後続の実ブラウザ・専用PostgreSQLでの検証結果は[実環境検証結果](stage1-runtime-validation-results.md)を参照。

- 実ブラウザの操作ツールが利用できず、初期表示・ノード選択・問題回答・ズーム・パン・スクロールの実画面試遊は未実施。ビルドと自動テストでの確認まで。
- 隔離PostgreSQLでの移行・再起動試験は未実施。SQLiteによる起動処理・保存の回帰試験は成功。
- Mock変更後のGitHub CI確認は未実施。今回はpush禁止のため、ローカルでPython比較をスキップせず検証した。共有後にCIの確認が必要。
- 依存追加は該当なし。生成仕様・既存135問・行動ルールの変更も該当なし。バックエンドの接続変更に対応してMockとAPI契約を更新済み。
