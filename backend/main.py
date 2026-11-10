from typing import Literal, Optional

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

import models
import game_logic
from database import engine, SessionLocal
from game_data import NODES

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

def migrate_db():
    """create_all は既存テーブルへの列追加をしないため、足りない列だけ追加する簡易マイグレーション。"""
    columns = {c["name"] for c in inspect(engine).get_columns("player_status")}
    if "game_status" not in columns:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE player_status ADD COLUMN game_status VARCHAR DEFAULT 'playing'"))
            conn.execute(text("UPDATE player_status SET game_status = 'playing' WHERE game_status IS NULL"))

def init_db():
    db = SessionLocal()
    try:
        # ノード情報を game_data.py の内容に同期（既存行は上書き、無ければ追加）
        for node in NODES:
            db.merge(models.NodeMaster(**node))
        db.commit()

        # テスト用プレイヤーデータの初期化（/api/network・/api/scan が使う既定のゲーム）
        if db.query(models.PlayerStatus).count() == 0:
            game_logic.create_game(db)
    finally:
        db.close()

models.Base.metadata.create_all(bind=engine)
migrate_db()
init_db()


# ======= スキーマ =======
class ActionRequest(BaseModel):
    type: Literal["scan", "breach", "dataExtract", "pause", "resume"]
    nodeId: Optional[str] = None


def _get_game_or_404(db: Session, game_id: int) -> models.PlayerStatus:
    player = game_logic.get_game(db, game_id)
    if player is None:
        raise HTTPException(status_code=404, detail="指定されたゲームが存在しません")
    return player


# ======= 1. ゲームの作成・取得 =======
@app.post("/api/games")
def create_game(db: Session = Depends(get_db)):
    """新しいゲームを開始し、初期状態(GameState)を返す。"""
    player = game_logic.create_game(db)
    return game_logic.build_game_state(db, player)


@app.get("/api/games/{game_id}")
def get_game_state(game_id: int, db: Session = Depends(get_db)):
    """現在のゲーム状態(GameState)を返す。"""
    player = _get_game_or_404(db, game_id)
    return game_logic.build_game_state(db, player)


# ======= 2. プレイヤー操作 =======
@app.post("/api/games/{game_id}/actions")
def post_action(game_id: int, action: ActionRequest, db: Session = Depends(get_db)):
    """scan / breach / dataExtract / pause / resume を実行する。
    受理可否(accepted, reason)に加えて、操作後の GameState を state として返す。
    """
    player = _get_game_or_404(db, game_id)
    try:
        game_logic.apply_action(db, player, action.type, action.nodeId)
    except game_logic.ActionRejected as e:
        db.rollback()
        return {"accepted": False, "reason": e.reason, "state": game_logic.build_game_state(db, player)}
    return {"accepted": True, "state": game_logic.build_game_state(db, player)}


# ======= 3. 旧API（互換用：既定のゲーム = 最初のプレイヤー を対象にする） =======
@app.get("/api/network")
def get_network_map(db: Session = Depends(get_db)):
    player = db.query(models.PlayerStatus).order_by(models.PlayerStatus.id).first()
    state = game_logic.build_game_state(db, player)
    return {"nodes": state["nodes"], "edges": state["edges"]}


class ScanRequest(BaseModel):
    node_id: str

@app.post("/api/scan")
def scan_node(req: ScanRequest, db: Session = Depends(get_db)):
    player = db.query(models.PlayerStatus).order_by(models.PlayerStatus.id).first()
    try:
        game_logic.apply_action(db, player, "scan", req.node_id)
    except game_logic.ActionRejected as e:
        db.rollback()
        return {"error": e.reason}
    return {
        "message": f"ノード {req.node_id} のスキャン完了",
        "status": "scanned",
        "remaining_resource": player.analysis_resource,
    }
