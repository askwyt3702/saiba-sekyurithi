# NULL ROUTE 開発ルール(AIアシスタント向け)

このリポジトリでは5人が並行して開発している。AIアシスタントはここに書かれたルールを必ず守ること。
人間のメンバー向けの起動手順は README.md を参照。

## プロジェクトの前提

- フロント:`frontend/`(React + TypeScript + Vite + React Flow)
- バックエンド:`backend/`(FastAPI + SQLAlchemy + PostgreSQL)
- フロントとバックエンドのデータの形は `docs/api-contract.md` で取り決めている
- ゲームは**ターン制**(操作は即座に結果が確定する)。チームで決定済みのため、WebSocketや実時間で進む仕組みは追加しない

## 最重要:バックエンドを変えたら、フロントの生成ファイルも更新する

フロントは、バックエンドが止まっているときでも動くMock(ダミー)を持っている。
Mockのステージやギミックの数値、データ回収ボタンの判定は、`backend/game_data.py` と `backend/balance_config.py` から
自動生成した `frontend/src/game/data/stageData.ts` を使っている。

次のどれかを変えたら、リポジトリのルートで `python scripts/gen_stage_data.py` を実行し、
生成された `frontend/src/game/data/stageData.ts` も**同じコミットに含める**こと。

- ステージ(ノード・エッジ・脆弱性)
- ギミック(最終目標 `TARGET_NODE_IDS`・暗号鍵 `KEY_FRAGMENT_NODE_IDS`・ノードの特殊効果 `NODE_EFFECTS`)
- 初期の解析資源などの数値
- 各操作のコスト(`ACTION_COSTS`)や警戒度の減衰(`ALERT_DECAY_PER_SECOND`)

`stageData.ts` は手で編集しない。フロントの `balanceConfig.ts` もこの生成値を読んでいるだけなので、数値を直接書かない。
生成し忘れると、GitHubのCI(`stage-data` ジョブ)が失敗する。

## ゲームのルール(判定の処理)を変えるとき

`backend/game_logic.py` の判定を変えたら、同じルールを `frontend/src/game/client/mockGameClient.ts` にも反映する。
Mockはバックエンドのルールを写したもので、片方だけ変えると挙動がずれる。

## APIやデータの形を変えるとき

レスポンスの項目名・却下理由・エンドポイントを変えたら、`docs/api-contract.md` を更新する。
フロントの型(`frontend/src/game/model/types.ts`)にも合わせて反映する。

## コミット前の確認

- バックエンドを変えた場合:`cd backend` して `pytest` を実行し、すべて通ることを確認する
- フロントを変えた場合:`frontend` で `npm run typecheck`、`npm run lint`、`npm run build` を実行する
- テンプレートのままのプロジェクト、バックアップ用のコピー、ビルド成果物(`dist/` など)はコミットしない。古い内容はgitの履歴に残っているので、バックアップファイルは不要

## 依存ライブラリを追加したとき

`frontend/package.json` に依存を追加すると、他のメンバーのdocker環境では古い `node_modules` が残ってエラーになる。
コミットメッセージかチームへの連絡で、「`docker compose up --build -V` で起動し直す」ことを伝える。

## 作業の最後に

変更内容を説明するとき、上のルールのうち実施したもの(生成スクリプトの実行、Mockや契約書の更新、テストの結果)を明記すること。
該当しない場合は「該当なし」と書くこと。
