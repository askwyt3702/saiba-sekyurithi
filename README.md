# NULL ROUTE

ハッカーとなり仮想ネットワークに侵入して目的のデータを入手する、PC向けリアルタイム戦略シミュレーションゲーム。

## 構成

| ディレクトリ | 内容 |
|---|---|
| `frontend/` | React + TypeScript + Vite。ネットワークマップは [`@xyflow/react`](https://reactflow.dev/) を使用 |
| `backend/` | FastAPI + SQLAlchemy + PostgreSQL |
| `docs/api-contract.md` | フロント/バック間のデータ契約。形を変えたら**必ずこのファイルを更新してからチームに共有**すること |

現状、フロントは `MockGameClient`(ブラウザ内で完結するダミー実装)でバックエンド未接続でも動作確認できます。バックエンドは `GET /api/network` のみ実装済みで、プレイヤー状態・操作コマンド・リアルタイム更新は未実装です(詳細は `docs/api-contract.md` の「まだ決まっていないこと」を参照)。

## セットアップ

### Docker Composeでまとめて起動(推奨)

```bash
docker compose up
```

- frontend: http://localhost:5173
- backend: http://localhost:8000
- db(PostgreSQL): `localhost:5432`(user: `detective` / password: `secretpassword` / db: `cyber_mystery`。`docker-compose.yml`参照)

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

#### backend

PostgreSQLが必要です。DBだけdocker-composeで起動するのが手軽です(`docker compose up db`)。

```bash
cd backend
pip install -r requirements.txt
DATABASE_URL=postgresql://detective:secretpassword@localhost:5432/cyber_mystery uvicorn main:app --reload
```

## CI

`main`へのpush・Pull Requestで [`.github/workflows/ci.yml`](.github/workflows/ci.yml) が自動実行されます。

- **frontend**: 依存関係インストール → 型チェック(`tsc --noEmit`) → lint(`oxlint`) → テスト(`npm test`) → ビルド
- **backend**: 依存関係インストール → 実際にPostgreSQLへ接続してアプリをimportまで通す(importのtypoやモデル定義ミスなど、起動して初めて分かる不具合を早期検知する)

ローカルで事前に確認したい場合は、上記の`npm run typecheck` / `npm run lint` / `npm test` / `npm run build`、backendなら `python -c "import main"`(DBが必要)を実行してください。
