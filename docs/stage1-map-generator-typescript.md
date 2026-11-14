# Stage1生成器のTypeScript移植

2026-11-14。ブランチ`feature/stage1-map-generator-20261114`、基点b53f330。
Python版の生成・検証を移植し、BackendとFrontendで独立実行した結果を比較した。
新規ゲーム・API・UIには接続していない。

## 移植範囲と判断

候補だけを同じにしても、検証器の探索順・予算・同点選択が違うと採択候補が変わる。
約250行のPython検証器も移植対象とした。ゲームルールは再実装せず、
既存のTypeScript純粋遷移を呼ぶ。
サーバーの採択結果だけを取得する代替案は、Mock単独でのseed再現に使えないため採用していない。

| ファイル | 役割 |
|---|---|
| frontend/src/game/generation/random.ts | UTF-8 SHA256、seed正規化、counter乱数、棄却抽選、Fisher–Yates |
| frontend/src/game/generation/canonical.ts | Python内部形式への変換、正規化JSON、同一hash |
| frontend/src/game/generation/config.ts | Pythonから生成した条件と版を参照 |
| frontend/src/game/generation/generator.ts | 候補生成、候補番号順の採択、上限失敗 |
| frontend/src/game/generation/validation.ts | 構造・ルール不変検査、証拠再生、限定探索と3方針の採択 |
| scripts/gen_stage_data.py | Python正本から生成条件・版・内部キー/効果キーを追加出力 |
| frontend/src/game/data/stageData.ts | 上記スクリプトで再生成。手編集なし |
| frontend/tests/mapGenerator.test.mjs | 現在のPython実装とのライブ比較と境界テスト |

Backendの生成器・検証器・ゲームルール、固定ノード/問題/バランスは変更していない。
既存Stage1の24ノード、全45ノード135問、Stage0ガイド・固定6攻略ルートを維持する。
Stage2の通常動作・Stage3設計へ接続や変更を加えていない。

## 使用例（通常の開始処理からは呼ばない）

```typescript
import { generateStage1, GenerationFailure } from './game/generation/generator';

try {
  const generated = generateStage1('00000000000000000000000000000000');
  const map = generated.definition; // 既存GameMapDefinition
  console.log(map.nodes.length, generated.map_hash, generated.accepted_attempt);
} catch (error) {
  if (error instanceof GenerationFailure) console.log(error.seed, error.rejected);
}
```

生成/検証版はPythonと同じ`stage1-sha256-v1` / `stage1-witness-v1`。
seedは32桁の16進文字列を小文字へ正規化し、空白・改行・桁違い・非文字列は拒否する。
通常16候補を番号順に試し、最初の合格だけ返す。失敗時に固定図や別seedへ切り替えない。
日時・Math.random・DB・fetch・localStorageは生成器から使用しない。

生成器はGameMapDefinitionを返す。MockGameClientへの明示的なテスト注入で実行でき、
Snapshotのデータ構造を変えない。通常の保存ローダーで生成版を有効化したわけではないため、
生成済みマップの通常保存・再開まで完了したとは扱わない。

## 完全一致の境界

- SHA256入力・先頭4byteのbig-endian uint32、棄却抽選の乱数消費を一致。
- 枝の役割抽選、候補別stream、座標用stream、補助辺の列挙順、辺の向き/順を一致。
- ノードID・階層・説明・脆弱性・効果・問題・初期値・コストを維持。
- DFSのpush/pop順、経路数/状態数予算、Pareto判定、ノード列までの同点比較を一致。
- scan/確認/解析/正答breach/鍵認証/回収を既存純粋ルールで再生し、負けた証拠は拒否。

map_hashはcamelCaseの公開DTOではなく、Python内部定義と同じキーの正規化JSONから作る。
セット相当のID一覧はソート、辞書キーはソート、配列順は保持。整数float/負のゼロは整数へ、
日本語はUTF-8、非有限数は禁止。Python表記の小さい小数の指数や大きな整数値も境界テストを置いた。
内部で省略されるキーと効果の省略フィールドは、生成スクリプトが出力するPython側のキー定義に従う。
データ構造が将来変わった場合はライブ比較と生成同期CIで差分を検出する。

この移植は既存の有界検証器と同じ保証範囲を持つ。全回復・全誤答・分岐する攻略順を
網羅した万能探索ではなく、隠密/資源ルートの大域的最適性は保証しない。

## 検証結果

| 項目 | 結果 |
|---|---|
| Python/TSライブ比較 | 256 seedすべて完全一致 |
| 比較内容 | 全内部定義、座標、辺と順序、hash2種、採択番号、棄却列、探索件数、証拠操作列・成績 |
| 多様性 | 座標256種類・接続256種類 |
| 共通ベクトル | 3 seedの既存hash/配置/接続/証拠と一致 |
| 候補番号 | 追加で1・3・15番の候補本体と検証結果をライブ比較 |
| 不正候補 | 自己辺・重複・未知ID・階層飛越し・孤立・重なり・数値/問題等の変更・予算切れ、14ケースで一致 |
| 上限失敗 | 2候補・16候補の棄却理由と順序が一致 |
| 実Mock実行 | TS生成結果を注入し、3ルートの勝敗・時間・資源・警戒度・評価が一致 |
| SHA256 | 空文字、abc、55/56/64byte境界、長文、UTF-8/絵文字をNode標準実装と比較 |
| Backend pytest | 1072成功、既存警告2件 |
| Frontend | 751成功・スキップ0、typecheck/lint/build成功 |
| 生成同期 | gen_stage_data.py実行済み、--check成功 |

256 seedのTS生成時間は本環境で中央値129ms、p95 263ms、最大327ms。
比較テスト用VM内の測定で、Backendテスト等も実行していたためブラウザや本番の性能保証ではない。
全seedで必ず成功する証明ではなく、採択した盤面だけに実ルールの勝利証拠がある。
lintの既存set-state-in-effect警告2件とbuildの既存chunkサイズ警告は残る。

通常のCI/テストは32 seedでライブ比較する。広い比較は次で再実行できる。

```powershell
$env:NULL_ROUTE_GENERATOR_SEED_COUNT = '256'
$env:NULL_ROUTE_TEST_PYTHON = (Resolve-Path 'backend/.venv/Scripts/python.exe').Path
node --test frontend/tests/mapGenerator.test.mjs
```

## 残作業

1. Web Workerで生成/検証を実行する境界と、キャンセル/待機/失敗表示を追加する。
2. 新規作戦だけが生成器を呼ぶAPI・Mock導線へ接続し、生成版Snapshotの保存/再開を有効にする。
3. 隔離DBとブラウザで動的盤面の操作・再開・RETRY・初級向けプレイテストを行う。
4. 固定配置を前提とする説明文の扱いをUI接続時に整理する。

今回はブラウザへの接続/試遊は未実施。API契約・型の変更は該当なし。
PR #2のレビュー修正b760f33は別ブランチのまま保持し、この作業で統合していない。
main・PR #2ブランチ、既存stash・バックアップ・未追跡設計書は保持。
コミット・push・PR作成・マージは行っていない。
