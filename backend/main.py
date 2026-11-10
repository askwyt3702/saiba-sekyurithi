from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import engine, SessionLocal

app = FastAPI(title="NULL ROUTE API")

# React からの通信を許可
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ======= データベース連携のための準備 =======

# DBセッション（接続）を取得する関数
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 初期データを自動登録する関数（空っぽの時に1回だけ実行）
def init_db():
    db = SessionLocal()
    if db.query(models.NodeMaster).count() == 0:
        initial_nodes = [
            models.NodeMaster(id="external-1", name="External (公開サーバー)", layer="External", pos_x=250, pos_y=50, info="最初の侵入口。"),
            models.NodeMaster(id="dmz-1", name="DMZ (Webサーバー)", layer="DMZ", pos_x=150, pos_y=150, info="不明"),
            models.NodeMaster(id="dmz-2", name="DMZ (メールサーバー)", layer="DMZ", pos_x=350, pos_y=150, info="不明"),
            models.NodeMaster(id="internal-1", name="Internal (社内網)", layer="Internal", pos_x=250, pos_y=250, info="不明"),
            models.NodeMaster(id="core-1", name="Core (機密DB)", layer="Core", pos_x=250, pos_y=350, info="機密データが眠る最終目標。")
        ]
        db.add_all(initial_nodes)
        db.commit()
    db.close()

# テーブル作成と初期データの登録を実行
models.Base.metadata.create_all(bind=engine)
init_db()

# ======= 本物のAPIエンドポイント =======

@app.get("/api/network")
def get_network_map(db: Session = Depends(get_db)):
    # 1. PostgreSQLから全ノードのデータを取得
    db_nodes = db.query(models.NodeMaster).all()
    
    # 2. React Flowが読み込める形式（JSON）に変換
    nodes_data = []
    for node in db_nodes:
        nodes_data.append({
            "id": node.id,
            "position": {"x": node.pos_x, "y": node.pos_y},
            "data": {
                "label": node.name,
                "layer": node.layer,
                "info": node.info,
                "status": "unscanned" # ※現状は一旦「未スキャン」固定
            }
        })

    # 3. 線のデータ（一旦直書き。後でEdgesテーブルを作ってDB化することも可能）
    edges_data = [
        {"id": "e1", "source": "external-1", "target": "dmz-1", "animated": True},
        {"id": "e2", "source": "external-1", "target": "dmz-2", "animated": True},
        {"id": "e3", "source": "dmz-1", "target": "internal-1"},
        {"id": "e4", "source": "dmz-2", "target": "internal-1"},
        {"id": "e5", "source": "internal-1", "target": "core-1"}
    ]
    
    return {"nodes": nodes_data, "edges": edges_data}