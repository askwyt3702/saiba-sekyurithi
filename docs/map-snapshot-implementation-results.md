# 固定MapSnapshot保存基盤の検証結果（2026-11-14）

本書は初回実装時点の記録。後続のPR #2レビューで変更した通信失敗時のMock切替と
古い/破損Mock保存の復旧方針は[レビュー修正報告](pr2-offline-recovery-review.md)を参照。

作業ブランチ：`design/stage1-dynamic-map-20261114`。コミット・pushは未実施。
詳細契約は[api-contract.md](api-contract.md)、移行は[map-snapshot-migration.md](map-snapshot-migration.md)。

## 実装

新規ゲームの固定定義をgame_mapへ原子的に保存し、表示・到達判定・効果・
確認/問題判定・コスト・初期状態・評価の参照元にする。
APIは未公開情報を除いたSnapshotを返し、React Flowと操作パネルへ渡す。
Mockも同じ固定定義を使用してlocalStorageに完全定義と進行を保存する。
同gameIdで再開し、同stageのRETRYは定義を保持して進行を初期化する。
Stage1の元データ（24ノード・38接続・座標）は変更していない。
Stage0/2にも同じ保存基盤を適用し、問題・ゲームルールは変更していない。

## 変更ファイル

- Backend：`models.py`、`main.py`、`game_logic.py`、`map_definition.py`、新規`map_repository.py`、新規`tests/test_map_snapshots.py`。
- Frontend：`src/App.tsx`、`src/components/MapView/MapView.tsx`、`src/components/NodeDetailPanel/NodeDetailPanel.tsx`、`src/components/StageMechanics/StageMechanicsStatus.tsx`、`src/components/ToolPanel/ToolPanel.tsx`、`src/components/ToolPanel/breachStatus.ts`。
- Frontendモデル/接続：`src/game/client/httpGameClient.ts`、`src/game/client/mockGameClient.ts`、`src/game/data/securityLearningData.ts`、`src/game/hooks/useGameClient.ts`、`src/game/model/mapDefinition.ts`、`src/game/model/missionResult.ts`、`src/game/model/types.ts`。
- Frontendテスト：`tests/gameConnection.test.mjs`、`tests/stage2Ui.test.mjs`、新規`tests/mapSnapshot.test.mjs`。
- 文書：`docs/api-contract.md`、新規`docs/map-snapshot-migration.md`、本書。
- 前段の未追跡設計書`docs/stage1-dynamic-map-implementation-plan.md`を保持。今回の実装変更には混入させない。

## 自動検証

| 検証 | 結果 |
|---|---|
| Backend pytest | 1005 passed、警告2件 |
| Frontend npm test | 732 passed、スキップ0 |
| typecheck | 成功 |
| lint | 成功、既存NodeDetailPanelのsetState-in-effect警告2件 |
| build | 成功、500KB超のchunk警告あり |
| gen_stage_data.py | 実行済み、生成ファイルに内容差分なし |
| gen_stage_data.py --check | 3ステージ・45ノード同期成功 |
| Backend/Mock | 既存状態遷移比較に加え、固定0/1/2のSnapshot完全定義が一致 |

追加試験は保存・取得・同盤面RETRY・カタログ変更からの独立・表示と到達判定の一致・
旧セーブ補完・非対応版拒否・保存失敗の原子性・Mock保存破損/容量不足・
保存済みHTTPゲームを別のMock盤面で隠さないことを検証する。
全45ノード135問の既存テストとチュートリアル攻略も成功。

## 6ルート再実行

`scripts/simulate_stage_routes.py`を現在のDBアダプター経由で実行。
すべて勝利、途中のBackend/Mock比較は既存Frontendテストで一致。

| ステージ | 方針 | 時間（秒） | 警戒度 | 残資源 | ランク | スコア |
|---|---|---:|---:|---:|---|---:|
| 1 | 高速 | 225 | 47.75% | 4 | A | 801 |
| 1 | 安全 | 255 | 18.25% | 4 | S | 941 |
| 1 | 資源 | 255 | 45.25% | 15 | A | 866 |
| 2 | 高速 | 225 | 83.75% | 1 | B | 591 |
| 2 | 安全 | 255 | 20.25% | 3 | S | 921 |
| 2 | 資源 | 255 | 65.25% | 10 | A | 766 |

チュートリアルも135秒・31.25%・資源10・S（944）で勝利。
難易度・報酬・問題・効果の数値変更はしていない。

## 隔離DBとEdge

既存PostgreSQLと既存Dockerサービスは変更せず、専用PostgreSQL16コンテナ
（tmpfs、127.0.0.1:55439）・Backend18009・Frontend15173・専用Edgeプロファイルを使用。
実APIの通信先のみテスト用に切替。リポジトリの本番設定は変更していない。

- 旧コミットのテーブル構成から起動移行。game_mapがない状態から追加され、
  旧ゲームの30秒・資源25・攻略状態・E01座標617が保持された。
  NodeMasterは現在値600へ同期されても保存座標617は変わらなかった。
- 実Backend接続で23項目成功。188 API応答はすべて200、JS例外0、通信エラー0。
  Stage1/2開始、問題回答、確認/解析/調査ログ、報酬・失敗ペナルティ、IDS、
  Stage2監視/ゲート、勝敗/RETRY、チュートリアル、4画面幅、マップ操作を含む。
- ブラウザ再読み込み後にStage2のgameId3・30秒・警戒度5.5%・資源22・
  S2-E01攻略済みを保持。Backend再起動後も同じ結果。
- Mockの別オリジンで保存・ブラウザ再読み込み・同盤面RETRYを確認。
- React Flowの既存のattribution警告は残る。

## 残課題

ランダム生成・seed入力・生成候補の攻略保証・難易度探索は未実装（今回の範囲外）。
Stage3は既存設計のみで、今回追加しない。
旧セーブに過去のルール/接続が保存されていないため、移行時の固定定義を採用する制約がある。
JSON/ルール版を変える次段階では、古いSnapshotへの対応を追加してから導入する。
MockはブラウザlocalStorageの保持期間/容量に依存する。
