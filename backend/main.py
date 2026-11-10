from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

import models
from database import engine, SessionLocal

app = FastAPI(title="NULL ROUTE API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    db = SessionLocal()
    # ノード情報の初期化
    if db.query(models.NodeMaster).count() == 0:
        initial_nodes = [
            models.NodeMaster(id="external-1", name="External (公開サーバー)", layer="External", pos_x=250, pos_y=50, info="最初の侵入口。SSHポート(22)が開いている。"),
            models.NodeMaster(id="dmz-1", name="DMZ (Webサーバー)", layer="DMZ", pos_x=150, pos_y=150, info="古いバージョンのApacheが稼働中。"),
            models.NodeMaster(id="dmz-2", name="DMZ (メールサーバー)", layer="DMZ", pos_x=350, pos_y=150, info="SMTPサーバー。社員のメールアドレスが漏洩している。"),
            models.NodeMaster(id="internal-1", name="Internal (社内網)", layer="Internal", pos_x=250, pos_y=250, info="Active Directoryサーバー。アクセス権が厳重。"),
            models.NodeMaster(id="core-1", name="Core (機密DB)", layer="Core", pos_x=250, pos_y=350, info="目標データが存在。SQLインジェクションの痕跡あり。")
        ]
        db.add_all(initial_nodes)
        db.commit()
    
    # テスト用プレイヤーデータの初期化
    if db.query(models.PlayerStatus).count() == 0:
        player = models.PlayerStatus(analysis_resource=100)
        db.add(player)
        db.commit()
    db.close()

models.Base.metadata.create_all(bind=engine)
init_db()

# ======= 1. ネットワーク全体を取得するAPI（更新） =======
@app.get("/api/network")
def get_network_map(db: Session = Depends(get_db)):
    player = db.query(models.PlayerStatus).first()
    db_nodes = db.query(models.NodeMaster).all()
    
    nodes_data = []
    for node in db_nodes:
        # そのノードの現在のステータスをNodeStateテーブルから探す
        state = db.query(models.NodeState).filter(
            models.NodeState.node_id == node.id,
            models.NodeState.player_id == player.id
        ).first()
        
        current_status = state.status if state else "unscanned"
        
        nodes_data.append({
            "id": node.id,
            "position": {"x": node.pos_x, "y": node.pos_y},
            "data": {
                "label": node.name,
                "layer": node.layer,
                # 未スキャンなら情報を隠し、スキャン済みなら情報を開示する
                "info": node.info if current_status == "scanned" else "不明（スキャンが必要です）",
                "status": current_status
            }
        })

    edges_data = [
        {"id": "e1", "source": "external-1", "target": "dmz-1", "animated": True},
        {"id": "e2", "source": "external-1", "target": "dmz-2", "animated": True},
        {"id": "e3", "source": "dmz-1", "target": "internal-1"},
        {"id": "e4", "source": "dmz-2", "target": "internal-1"},
        {"id": "e5", "source": "internal-1", "target": "core-1"}
    ]
    
    return {"nodes": nodes_data, "edges": edges_data}


# ======= 2. スキャンを実行するAPI（新規追加） =======
class ScanRequest(BaseModel):
    node_id: str

@app.post("/api/scan")
def scan_node(req: ScanRequest, db: Session = Depends(get_db)):
    target_node = db.query(models.NodeMaster).filter(models.NodeMaster.id == req.node_id).first()
    if not target_node:
        return {"error": "指定されたノードが存在しません"}
    player = db.query(models.PlayerStatus).first()
    
    # リソースが足りない場合はエラーを返す
    if player.analysis_resource < 10:
        return {"error": "解析資源が足りません"}

    # ノードの状態を取得（無ければ作る）
    node_state = db.query(models.NodeState).filter(
        models.NodeState.node_id == req.node_id,
        models.NodeState.player_id == player.id
    ).first()

    if not node_state:
        node_state = models.NodeState(player_id=player.id, node_id=req.node_id, status="scanned")
        db.add(node_state)
    else:
        node_state.status = "scanned"
    
    # スキャン実行で資源を10消費
    player.analysis_resource -= 10
    
    db.commit()
    return {
        "message": f"ノード {req.node_id} のスキャン完了", 
        "status": "scanned", 
        "remaining_resource": player.analysis_resource
    }