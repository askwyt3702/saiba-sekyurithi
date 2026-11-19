# NULL ROUTE フロント/バック データ契約 v1.0

デッキバトル(デッキ構築ローグライト)用。v0.x(古いノード侵入ゲームの API)は git の履歴に残っている。

ゲームのルールはすべてフロント(`frontend/src/game/deckbattle/`)で動く。バックエンド(`backend/main.py`)は、プレイヤーと**カード基地**(図鑑・弱点ノート・戦績・実績)を PostgreSQL に保存するだけ。

- フロントの呼び出し:`frontend/src/game/deckbattle/api.ts`
- バックエンドのテスト:`backend/tests/test_players_api.py`
- 接続先:`http://localhost:8000`(フロントは環境変数 `VITE_API_BASE` で変えられる)
- 項目名は camelCase。日時は返さない

## プレイヤーの見分け方

パスワードは使わない。名前を登録するとサーバーがランダムな `playerId`(UUID の文字列)を返し、ブラウザが localStorage に覚えておく。`playerId` を知っていればそのプレイヤーのデータを読み書きできるので、`playerId` は画面に出さない。

## 型

### DeckProfile(カード基地)

`frontend/src/game/deckbattle/profile.ts` の `DeckProfile` と同じ形。

| 項目 | 型 | 内容 | 制限 |
| --- | --- | --- | --- |
| `seenCardIds` | string[] | 図鑑に登録したカード ID | 各64文字以内、500件まで |
| `unlockedBranches` | string[] | 解放した Lv.3 進化先の ID | 同上 |
| `seenEnemyIds` | string[] | 出会った敵の ID | 同上 |
| `wrongQuestionIds` | string[] | 弱点ノート(間違えた問題の ID) | 同上 |
| `bonusStartCoins` | number | 次のランの開始時にもらえる解析コイン | 0〜3 |
| `stats.runsPlayed` | number | プレイ回数 | 0以上の整数 |
| `stats.runsWon` | number | クリア回数 | 同上 |
| `stats.elitesDefeated` | number | エリート撃破数 | 同上 |
| `stats.maxEventStreak` | number | クイズの最高連続正解 | 同上 |
| `stats.totalQuizCorrect` | number | クイズの正解数 | 同上 |
| `stats.reviewsCleared` | number | 弱点ノートの復習で正解した数 | 同上 |
| `achievements` | string[] | 解除した実績の ID | 各64文字以内、500件まで |

- 項目はすべて省略できる(省略すると空の配列か0)。ここにない項目を送ると 422
- 配列の中の重複は、サーバーが1つにまとめる(最初に出てきた順)

### PlayerResponse

```json
{
  "playerId": "69368590-19d6-437c-be07-5ce1729dc3a5",
  "name": "高橋",
  "profile": { "seenCardIds": ["ssh_brute"], "...": "DeckProfile の残りの項目" }
}
```

## エンドポイント

### GET /api/health

つながるかの確認。`200 {"status": "ok"}`

### POST /api/players

名前でプレイヤーを登録する。登録前にブラウザで遊んでいた分のカード基地を `profile` で一緒に送れる。

```json
{ "name": "高橋", "profile": { "...": "DeckProfile(省略可)" } }
```

- `name`:前後の空白を取り除いて1〜20文字。同じ名前でも別のプレイヤーになる
- 成功:`201` と PlayerResponse
- 名前が空・長すぎる、profile の形が違う:`422`

### GET /api/players/{playerId}

- 成功:`200` と PlayerResponse
- いない:`404 {"detail": "player_not_found"}`

### PUT /api/players/{playerId}/profile

カード基地を丸ごと保存する(送った内容で置き換える。足し合わせはしない)。

```json
{ "profile": { "...": "DeckProfile" } }
```

- 成功:`200` と、保存後の PlayerResponse
- いない:`404 {"detail": "player_not_found"}`
- 形が違う:`422`(保存済みの内容は変わらない)

## フロントの動き(`frontend/src/game/deckbattle/playerSync.ts`)

| 場面 | 動き |
| --- | --- |
| 未登録 | 今までどおりブラウザ(localStorage)だけに保存する |
| 登録したとき | ブラウザのカード基地を `POST /api/players` で送り、返ってきた `playerId` を覚える |
| カード基地を保存するたび | ブラウザに保存し、`PUT …/profile` でサーバーにも送る。続けて保存したときは順番に送り、最後の内容が残る |
| 起動したとき | `GET /api/players/{playerId}` の内容をブラウザに写す(別のブラウザで遊んだ分が反映される) |
| サーバーにつながらない | 「オフライン」と表示してブラウザだけに保存し、送れていない印を付ける。次に起動したときは、サーバーの古い内容で上書きせず、ブラウザの分を先に送る |
| サーバーに `playerId` がない(DB を作り直したなど) | 未登録に戻す。ブラウザのカード基地は残す |

ランの途中の状態は保存しない(読み込み直すとランは最初から)。
