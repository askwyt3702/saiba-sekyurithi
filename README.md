# NULL ROUTE

ハッカーとなり仮想ネットワークに侵入して目的のデータを入手する、PC向けターン制戦略シミュレーションゲーム(操作した時点で結果が確定し、ゲーム内時間は操作ごとに進む)。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `frontend/` | React + TypeScript + Vite。ネットワークマップは [`@xyflow/react`](https://reactflow.dev/) を使用 |
| `backend/` | FastAPI + SQLAlchemy + PostgreSQL |
| `docs/api-contract.md` | フロント/バック間のデータ契約。形を変えたら**必ずこのファイルを更新してからチームに共有**すること |

バックエンドはゲームの作成・取得・操作・リセットのAPI(`/api/games`)を提供しています。フロントはバックエンドにつながらないとき、`MockGameClient`(ブラウザ内で完結するダミー実装)に自動で切り替わり、ステータスバーに「OFFLINE (Mock)」と表示します。

## セットアップ

### 置き場所に注意(OneDriveの中に置かない)

リポジトリは `C:\dev\saiba-sekyurithi` のような**OneDriveの外**にcloneしてください。
デスクトップやドキュメントがOneDriveと同期されていると、Dockerが同期中のファイルを読めずに落ちたり(ログに `EIO`)、gitの操作が失敗したりします。

```bash
cd C:\dev
git clone git@github.com:askwyt3702/saiba-sekyurithi.git
```

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

`npm test`のMock比較テストはバックエンドのPython環境も使用します。Python 3.12環境に`backend/requirements-dev.txt`を導入してください。Pythonのパスは`NULL_ROUTE_TEST_PYTHON`で指定できます（通常は`backend/.venv`を自動検出）。ゲームDBには接続せず、メモリ内SQLiteで再生します。Python環境が無い手元では、この比較テストだけ警告を出してスキップします（他のテストは実行されます）。CIでは必ず実行され、Mockとバックエンドの挙動がずれていると失敗します。

#### backend

PostgreSQLが必要です。DBだけdocker-composeで起動するのが手軽です(`docker compose up db`)。

```bash
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql://detective:secretpassword@localhost:5432/cyber_mystery uvicorn main:app --reload
```

## CI

`main`へのpush・Pull Requestで [`.github/workflows/ci.yml`](.github/workflows/ci.yml) が自動実行されます。

- **frontend**: 依存関係インストール → 型チェック(`tsc --noEmit`) → lint(`oxlint`) → テスト(`npm test`、Mockとバックエンドの比較テストを含む) → ビルド
- **stage-data**: `python scripts/gen_stage_data.py` を実行し、生成した `frontend/src/game/data/stageData.ts` がコミット済みの内容と一致するか確認(バックエンドのステージや数値を変えて生成し忘れると失敗する)
- **backend**: 依存関係インストール → 実際にPostgreSQLへ接続してアプリをimportまで通す(importのtypoやモデル定義ミスなど、起動して初めて分かる不具合を早期検知する) → テスト(`pytest`)

ローカルで事前に確認したい場合は、上記の`npm run typecheck` / `npm run lint` / `npm test` / `npm run build`、backendなら `cd backend` して `pytest` を実行してください。
