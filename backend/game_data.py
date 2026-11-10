# ステージのマスターデータ（ノード・エッジ）。
# 起動時に node_master テーブルへ同期される（ここを編集すれば既存DBの内容も更新される）。
# シナリオ/データ担当がステージを追加するときは、このファイルを編集すればよい。

NODES = [
    {"id": "external-1", "name": "External (公開サーバー)", "layer": "External", "pos_x": 250, "pos_y": 50,
     "vulnerability": "弱いSSHパスワード", "info": "最初の侵入口。SSHポート(22)が開いている。"},
    {"id": "dmz-1", "name": "DMZ (Webサーバー)", "layer": "DMZ", "pos_x": 150, "pos_y": 150,
     "vulnerability": "古いApacheの既知の脆弱性", "info": "古いバージョンのApacheが稼働中。"},
    {"id": "dmz-2", "name": "DMZ (メールサーバー)", "layer": "DMZ", "pos_x": 350, "pos_y": 150,
     "vulnerability": "漏洩した社員アドレスへのフィッシング", "info": "SMTPサーバー。社員のメールアドレスが漏洩している。"},
    {"id": "internal-1", "name": "Internal (社内網)", "layer": "Internal", "pos_x": 250, "pos_y": 250,
     "vulnerability": "Active Directoryの権限設定ミス", "info": "Active Directoryサーバー。アクセス権が厳重。"},
    {"id": "core-1", "name": "Core (機密DB)", "layer": "Core", "pos_x": 250, "pos_y": 350,
     "vulnerability": "SQLインジェクション", "info": "目標データが存在。SQLインジェクションの痕跡あり。"},
]

EDGES = [
    {"id": "e1", "source": "external-1", "target": "dmz-1", "animated": True},
    {"id": "e2", "source": "external-1", "target": "dmz-2", "animated": True},
    {"id": "e3", "source": "dmz-1", "target": "internal-1"},
    {"id": "e4", "source": "dmz-2", "target": "internal-1"},
    {"id": "e5", "source": "internal-1", "target": "core-1"},
]

# 最初から侵入対象にできる（隣接する侵入済みノードが不要な）layer
ENTRY_LAYERS = {"External"}
