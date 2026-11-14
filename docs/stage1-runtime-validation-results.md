# Stage1動的マップ：実環境検証結果

検証日：2026-11-14。ブランチ：`feature/stage1-map-generator-20261114`。

## 環境と保存データの保護

AGENTS.md・起動設定・開始時のgit statusを確認した。既存の未コミット変更とステージ済み差分、2件のstashを保持。今回のリポジトリ変更は本検証記録のみで、アプリケーションコードを追加修正する必要のある不具合は再現しなかった。コミット・push・PR作成・マージは行っていない。

通常のBackend起動には期限切れゲームの削除処理があるため、既存の`postgres_data`を使用せず、Composeプロジェクト`nullroute-validation`と専用named volume `nullroute-validation_validation_pg`で検証した。既存の`share_storage_db`および`nullroute-dynamic-connect-pg-20261114`は停止・変更していない。

元のDockerfileからBackendとFrontendをビルドし、同じソースをbind mount。PostgreSQLは`postgres:16-alpine`。既存サービスが5432を使用していたため、検証DBのホストポート公開は外し、Compose内部接続を使用した。Backendは`localhost:8000`、Frontendは`http://localhost:5173`で起動。Compose設定は`%TEMP%/nullroute-validation-compose.yml`にある。

実ブラウザは専用プロファイルのMicrosoft Edge headless。DevTools Protocolで画面描画、DOMのボタン・問題選択、マウスドラッグ・ホイール入力を操作し、スクリーンショットと通信内容を記録した。通常ユーザーのブラウザ保存領域は操作していない。

## 依頼項目別の結果

| 項目 | 結果・証拠 |
| --- | --- |
| 1. 開発ルール・git status | 確認済み。既存差分・stashを保持。 |
| 2. Backend・PostgreSQL起動 | 専用Composeで成功。実PostgreSQLへ接続。 |
| 3. Frontend起動 | 元Dockerfileで起動成功。 |
| 4. localhost:5173アクセス | HTTP 200、タイトル画面表示、開始ボタン操作成功。 |
| 5. Stage1新規生成 | ミッション画面の「新しいゲームを始める」から作成。`source=generated`、24ノードを描画。 |
| 6. 2回の新規生成 | gameId 2と3でseed・座標・接続が異なる。 |
| 7. 再読込 | 再開でgameId 3を復元。全24ノードの描画座標がAPIの保存座標と一致、36接続を描画。スキャン済み進行も復元。 |
| 8. Backend再起動 | 検証Backendのみ再起動。gameId 3の進行・公開Snapshotを含むAPI状態が再起動前後で完全一致。 |
| 9. RETRY | 勝利画面のRETRYを操作。gameId・seed・座標・接続・生成hashを維持。経過時間0、攻略済み0に初期化。公開Snapshotの未スキャン情報が再マスクされる差は正常。 |
| 10. C03攻略 | 下記ルートを画面のスキャン・情報確認・解析・問題選択・侵入・データ回収で完走。全24要求が受理され、MISSION COMPLETE表示。 |
| 11. Backend停止時Mock | 検証Backendを実際に停止。接続拒否後にWorkerで動的生成し、24ノードとOFFLINE表示を確認。HTTPの再開先3を保持。Mock再読込・スキャン・RESETも同盤面で成功。 |
| 12. 409安全停止 | 専用に新規作成したgameId 6のschema_versionだけを一時999へ変更。実Backendの409 `map_snapshot_invalid`でエラー画面となり、描画ノード0、HTTP保存先を保持、Mock保存キー増加なし。検証後にschema_versionを1へ復元。 |
| 13. Stage0/2/3 | Stage0は固定5ノード、Stage2は固定16ノードを画面から新規作成・描画し、入口の通常スキャン成功。Stage3はロックされ、クリックしても選択画面のまま、保存先作成なし。Stage0/2の全攻略は今回未実施。 |

## 具体的な盤面・攻略結果

- 1回目：gameId `2`、seed `6b6a9254c1c6d6de4f254537e41d5a71`。
- 2回目：gameId `3`、seed `654a817fcbb69d6d433d8f374ef985a2`、mapHash `141b775d19cbc4b344b3d196d27b7305605a41e4058ca58da03f3a70f2c945d6`。
- 攻略順：E01 → D02 → D01 → I01 → I02 → C02 → C03 → データ回収。E01の情報確認と解析、各ノードの確認を明示実行。問題の正答選択後に侵入実行ボタンを操作し、APIを直接呼んで進行を置換していない。
- 結果：225秒、警戒度47.75%、残資源4、ROOT、Aランク、801点。勝利後のRETRYも画面から実行した。
- 実WorkerのMock：seed `55f16250840f50da3eafd4300af3ce98`、mapHash `6d0243b576e1cae5eab39dde98888a48b56cd3228eaefb233338f00c278a284d`。同seedをローカルPython生成器に渡した結果と一致。生成待ち中も20msの監視タイマーが40回進み、画面スレッドが生成処理で停止しないことを確認。

PostgreSQLの`game_map`を直接SELECTし、gameId 2/3に`source=generated`、32桁seed、24ノードを含むJSONが保存されていることを確認した。

## React Flow・操作・ログ

- 1280×720でタイトル、ミッション、初期マップ、攻略中、勝利、409、OFFLINEを実描画・撮影。
- 確認したStage1盤面の24ノードの実DOM矩形を比較し、ノード間の重なり0。全36接続のSVG描画と選択時の強調を確認。交差線は存在し、縮小時の文字・線の視認性には限界がある。
- ホイール入力でviewportのYが-3から-153へ移動。ズームボタンでscale 1→1.2→1。ドラッグでもviewportが移動。フィットボタンによる表示変更も確認した。
- ノード選択・通常スキャン・確認モーダル・解析・問題選択・侵入・回収・結果・RETRY・ミッション移動が動作。今回の操作中にアプリのフリーズは再現しなかった。
- ブラウザのアプリ由来Console.error／捕捉したRuntime例外はなし。意図した409とBackend停止中の接続拒否はネットワークエラーとして記録される。
- 既存の軽微な項目：`favicon.ico`が404、React Flowが帰属表示の非表示設定に関する警告を出す。ゲーム操作を妨げないため今回は変更していない。
- Backendにゲーム処理由来のHTTP 500やTracebackはなし。起動直後にDB待機リトライ2回。その後正常起動。DBログに検証用SELECTでテーブル名を`game_maps`と誤記したエラーが1件あるが、正しい`game_map`で再確認済みであり、アプリのSQLエラーではない。

## 証跡と終了時の状態

証跡は検証端末の`%TEMP%/`に保存した。端末固有のユーザー名を含む絶対パスや生ログはコミットに含めない。

- `nullroute-title.png`、`nullroute-stage1.png`、`nullroute-map-overview.png`、`nullroute-victory.png`、`nullroute-409.png`、`nullroute-offline.png`、`nullroute-final-map.png`
- `nullroute-play-result.json`：画面からの24操作のリクエスト・受理結果と勝利状態。
- `nullroute-progress-before.json`：最終再起動前の状態。
- `nullroute-browser-events.jsonl`、`nullroute-runtime-compose.log`：ブラウザとComposeログ。
- `nullroute_browser.py`と`nullroute-*.js`：今回のブラウザ操作用スクリプト。

終了時は検証用Backend・PostgreSQL・Frontendを起動したまま。gameId 3はRETRY後にE01をスキャンした状態（10秒）で、ブラウザ再読込後も復元確認済み。検証用ゲームと専用volumeは削除していない。停止する場合は次を使用する（volume削除オプションは不要）。

```powershell
docker compose -p nullroute-validation -f "$env:TEMP\nullroute-validation-compose.yml" stop
```

## 未確認・残課題と開発ルール対応

- 既存の実DBそのものの移行は未実施。専用PostgreSQLで新規Snapshotの永続化・再起動を検証した。旧データを持つDBの移行試験とは区別する。
- ブラウザはEdge headless・1280×720のみ。有人試遊、他解像度・他ブラウザ、タッチ操作、長時間負荷、多人数同時作成は未確認。
- Stage0/2の全問題・全攻略は今回の実ブラウザ検証対象外。基本開始・描画・スキャンのみ確認。
- 新しいコード変更がないため、前回成功したBackend 1079件／Frontend 771件、typecheck・lint・buildの全再実行はしていない。GitHub CIも未確認（push禁止）。
- 今回の生成スクリプト再実行・Mock更新・API契約更新・型更新・依存追加は**該当なし**。`python scripts/gen_stage_data.py --check`は実行し、3ステージ・45ノードで同期成功。
