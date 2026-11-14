# PR #2：オフライン切替・Mock保存復旧のレビュー修正

2026-11-14。対象ブランチ`design/stage1-dynamic-map-20261114`。
レビュー：https://github.com/askwyt3702/saiba-sekyurithi/pull/2#pullrequestreview-5900871558

## 修正した挙動

- 接続/保存済みゲーム取得時にfetchが失敗した場合、保存済みHTTP gameIdがあってもMockへ切り替える。
  HTTPのゲームIDやDB進行は削除・上書きしない。Mock側の保存は別であり、OFFLINE表示を維持する。
- HTTPステータス409かつdetail=map_snapshot_invalidを専用エラーとして分類し、Mockへ切り替えず停止する。
  接続時だけでなく、行動/RETRYの応答で同じ409を受けた場合も停止する。
  取得できた応答のSnapshot schema/ステージが不整合な場合も、不正Snapshotとして停止する。
- 古い形式・非対応版・不整合・不正JSONのMock保存は、そのゲームの保存キーのみ削除し、
  新しい固定初期状態を作る。復旧をゲーム内ログへ記録する。
  正常な保存・同gameIdでの再開・同盤面RETRYは維持する。
- 保存領域へのアクセス/削除/書込み自体が失敗する場合、他ゲームのデータを消さずエラーを表示する。
- エラー画面に「ミッション選択へ戻る」を追加。戻る操作でresetやHTTP保存削除を行わず、
  別ミッションを選択できる。ゲーム中にエラーになった場合も古い結果画面を成功表示しない。

今回のオフライン切替は接続/再開時の処理。行動送信中の一時的な通信失敗を理由に、
進行中のHTTPゲームを別Mockへ途中移行する機能は追加していない。

## 変更ファイル

- `frontend/src/game/client/httpGameClient.ts`：HTTP status/detailによるエラー分類。
- `frontend/src/game/hooks/useGameClient.ts`：通信失敗の切替、409停止、行動/reset時の不正Snapshot停止。
- `frontend/src/game/client/mockGameClient.ts`：保存形状検査と当該Mockキーだけの復旧。
- `frontend/src/App.tsx`、`frontend/src/App.css`：エラー画面とミッション選択への復帰。
- `frontend/tests/gameConnection.test.mjs`、`httpStageSaves.test.mjs`、`mapSnapshot.test.mjs`、`missionResult.test.mjs`：回帰・境界検証。
- `docs/api-contract.md`、`docs/map-snapshot-migration.md`、`docs/map-snapshot-implementation-results.md`、本書：最新方針と初回記録の区別。

Backendのコード・判定・ステージ/問題/バランス、生成済みstageData.tsは変更していない。

## 検証結果

| 検証 | 結果 |
|---|---|
| Backend pytest | 1005成功、既存の非推奨警告2件 |
| Frontend npm test | 747成功、スキップ0 |
| typecheck | 成功 |
| lint | 成功、既存NodeDetailPanelの警告2件 |
| build | 成功、既存のchunkサイズ警告 |
| ステージデータ同期 | --check成功、3ステージ45ノード、内容変更なし |
| Snapshot既存保存/取得/再開/RETRY | 成功 |
| 保存済みHTTP ID＋通信失敗 | Mockへ切替成功 |
| 不正Snapshotの409 | 自動Mock切替なし、HTTP保存ID保持 |
| 古い/破損Mock保存 | 当該キーだけ削除し初期状態へ復旧、他保存を保持 |
| ミッション選択への復帰 | resetせず復帰可能、他ミッションを開始可能 |

専用Edgeプロファイル・1280×720・専用Viteポート15173で4つの画面操作シナリオを確認。
ブラウザの通信制御でfetch失敗/HTTP409を模擬し、既存Backend/DBへ書込みはしていない。
Mockのスキャン、保存、全画面再読み込み、同盤面RETRY、409画面からの復帰、Stage2開始を確認。
JavaScript例外0件。実Backendの稼働/停止を操作する試験は今回行っていない。
API応答の分類はHTTPクライアントのテスト、Backendの409自体は既存Snapshotテストでも確認した。

## 「新しいゲームを始める」の実装方針（今回は未実装）

### 現状の入口

ミッションカードの`onSelectMission(id)`はuseGameClientを有効にし、
HttpGameClient.ensureGame()が保存済みgameIdを優先して再開する。
RETRY/resetは同じSnapshotを使うため、固定データ変更の取り直しには使えない。
Mockの通常入口もgameId='mock'を使っているため、通常開始と新規作戦の区別がない。

### 推奨する追加

1. ミッション選択画面の解放済みカードに「新しいゲームを始める」を独立したボタンとして追加する。
   現在のカード選択による再開と解放条件は維持する。
   進行中の保存がある場合は、再開先が新規ゲームへ変わることを確認してから開始する。
   カード内ボタンでは親カードの選択イベントへ伝播させず、二重開始を防ぐ。
2. UIから`resume`/`new`という開始意図をHook/Clientへ明示する。
   HTTPの新規は既存のPOST /api/gamesを使用し、保存IDを読むensureGameとは分ける。
   古いgameIdを先に消さず、作成成功・Snapshot検証後に再開ブックマークを新IDへ更新する。
   失敗/409時は元のHTTP保存を保持する。DB上の旧ゲームは削除しない。
3. Mockは新gameIdを生成して別キーへ保存する。通常再開用のステージ別Mockブックマークを追加し、
   既存の'mock'キーを読み込める互換移行を用意する。新規操作が失敗しても旧保存を保持する。
4. 「新規要求」の識別子をクリックごとに発行し、StrictMode・連打・再送で二重作成しない。
   現在の同ステージPOST共有だけに依存せず、新規意図と再開要求を混同しないようテストする。
5. 再開は旧Snapshot、RETRYは同Snapshot、新規は現在の固定定義、という3つの動作をテストする。
   将来の動的生成接続後は新規だけが新しいseedを発行し、GET/再開/RETRYは生成器を呼ばない。

この追加では既存POSTを再利用できるが、GameClientの開始意図、Mockブックマーク、
API契約の操作説明、UIと移行テストを同時に更新する必要がある。
今回は調査と方針提示までで、新規ゲームのボタン・開始処理は追加していない。

## ブランチと保護

生成器ブランチfeature/stage1-map-generator-20261114はb53f330339e15ffab214f2189fb2551c3828f7b8のまま保持。
前段の未追跡設計書は切替前後でSHA256が一致。既存stash2件・バックアップも保持。
本修正はローカルのみで、コミット・push・PR作成・マージは行っていない。
GitHubのPR #2とCIにはまだ修正が反映されていない。
