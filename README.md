# NULL ROUTE

ハッカーとなって防御システムに侵入する、PC向けのデッキ構築ローグライト(ターン制のカードバトル)。使うほど育つ攻撃・防御のカードでデッキを作り、セキュリティのクイズに答えながら、最奥の監視AI「ARGUS」を目指す。企画は [`docs/deckbattle-plan-v0.3.md`](docs/deckbattle-plan-v0.3.md)。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `frontend/` | React + TypeScript + Vite。ゲームのルールは `src/game/deckbattle/`、画面は `src/components/DeckBattle/` |
| `backend/` | FastAPI + SQLAlchemy + PostgreSQL。プレイヤーとカード基地を保存する |
| `docs/api-contract.md` | フロント/バック間のデータ契約。形を変えたら**必ずこのファイルを更新してからチームに共有**すること |
| `docs/deckbattle-plan-v0.3.md` | 企画書(共有ドキュメントの写し) |

ゲームはブラウザの中だけで動きます。バックエンドは、プレイヤー登録(名前だけ)と**カード基地**(図鑑・弱点ノート・戦績・実績)の保存を受け持ちます。ミッション選択画面の「👤 プレイヤー登録」で名前を登録すると、カード基地がサーバーにも保存されます。バックエンドにつながらないときは、ブラウザ(localStorage)だけに保存して遊べ、画面右上に「オフライン」と出ます。

## セットアップ

### 置き場所に注意(OneDriveの中に置かない)

リポジトリは `C:\dev\saiba-sekyurithi` のような**OneDriveの外**にcloneしてください。
デスクトップやドキュメントがOneDriveと同期されていると、Dockerが同期中のファイルを読めずに落ちたり(ログに `EIO`)、gitの操作が失敗したりします。

```bash
cd C:\dev
git clone git@github.com:askwyt3702/saiba-sekyurithi.git
```

### コミットメッセージのチェックを有効にする(cloneしたら1回だけ)

リポジトリのフォルダで次を実行します。

```bash
git config core.hooksPath .githooks
```

これで、コミットするたびに [`.githooks/commit-msg`](.githooks/commit-msg) がメッセージの形を確認します。
1行目が `feat: クリア画面に効果音を追加` のような「種類: 何をどう変えたか」の形になっていない場合や、
「なんか変えた」「修正」のような中身の分からない言葉だけの場合は、コミットが止まって理由が表示されます。
Antigravity などのAIやエディタのボタンからコミットしたときも同じように確認されます。
止まったときは、表示された例のとおりにメッセージを直して、もう一度コミットしてください。

### Docker Composeでまとめて起動(推奨)

リポジトリのフォルダで実行します。

```bash
docker compose up -d --build -V
```

- frontend: http://localhost:5173
- backend: http://localhost:8000
- db(PostgreSQL): `localhost:5432`(user: `detective` / password: `secretpassword` / db: `cyber_mystery`。`docker-compose.yml`参照)

`-V` は、コンテナ内の `node_modules` を作り直すための指定です。`frontend/package.json` の依存が変わった後に付け忘れると、古い `node_modules` が残って画面のサーバーが起動しません。
ゲームのDBは `postgres_data/` フォルダに保存されているので、`-V` を付けても消えません。
古いゲームのテーブル(`player_status` など)が残っていても、新しいゲームは別のテーブル(`deck_players`・`deck_profiles`)を使うので問題ありません。

### 画面が開かないとき

| 症状(`docker compose logs --tail 40 frontend` などで確認) | 原因 | 直し方 |
|---|---|---|
| `Host version "…" does not match binary version "…"` | 古い `node_modules` が残っている | `docker compose up -d --build -V` で起動し直す |
| `EIO` やファイルが見つからないエラー | リポジトリがOneDriveの中にある | OneDriveの外にcloneし直す(上の「置き場所に注意」) |
| 最新にしたはずなのに古い画面のまま、または上のエラーが続く | 古いフォルダ(移動前のコピーなど)でDockerを起動している | 下のコマンドで起動元のフォルダを確認し、違えばそのフォルダで `docker compose down` してから正しいフォルダで起動する |
| `port is already allocated` | 5173・8000・5432番を別のアプリが使っている | そのアプリを止める |
| `Cannot connect to the Docker daemon` | Docker Desktopが起動していない | Docker Desktopを起動する |

起動元のフォルダの確認(`CONFIG FILES` の列に、起動したフォルダの `docker-compose.yml` が表示される):

```bash
docker compose ls
```

### 個別に起動する場合

#### frontend

```bash
cd frontend
npm install
npm run dev
```

その他のコマンド:

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # oxlint
npm test            # テスト(tests/*.test.mjs)
npm run build        # 本番ビルド
```

接続するバックエンドを変えたいときは、`frontend/.env.development.local` に `VITE_API_BASE=http://localhost:8001` のように書きます(このファイルはコミットされません)。

#### backend

PostgreSQLが必要です。DBだけdocker-composeで起動するのが手軽です(`docker compose up db`)。

```bash
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql://detective:secretpassword@localhost:5432/cyber_mystery uvicorn main:app --reload
```

画面を 5173 番以外のポートで動かすときは、環境変数 `CORS_ORIGINS` にその URL を書きます(例:`CORS_ORIGINS=http://localhost:5174`)。

#### バックエンドのテスト

```bash
cd backend
pip install -r requirements-dev.txt
pytest
```

テストは使い捨ての SQLite で動くので、PostgreSQL は要りません。手元に Python 環境が無いときは、docker のバックエンドのイメージで実行できます(リポジトリのフォルダで実行):

```bash
docker compose run --rm --no-deps backend sh -c "pip install -q -r requirements-dev.txt && pytest"
```

## CI

`main`へのpush・Pull Requestで [`.github/workflows/ci.yml`](.github/workflows/ci.yml) が自動実行されます。

- **frontend**: 依存関係インストール → 型チェック(`tsc --noEmit`) → lint(`oxlint`) → テスト(`npm test`) → ビルド
- **backend**: 依存関係インストール → 実際にPostgreSQLへ接続してアプリをimportまで通す(importのtypoやモデル定義ミスなど、起動して初めて分かる不具合を早期検知する) → テスト(`pytest`)

ローカルで事前に確認したい場合は、上記の`npm run typecheck` / `npm run lint` / `npm test` / `npm run build`、backendなら `cd backend` して `pytest` を実行してください。
