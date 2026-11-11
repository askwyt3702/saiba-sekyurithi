import time
from typing import Literal, Optional

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

import models
import game_logic
from database import engine, SessionLocal
from game_data import ALL_STAGE_NODES, DEFAULT_STAGE_ID

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
    with engine.begin() as conn:
        if "game_status" not in columns:
            conn.execute(text("ALTER TABLE player_status ADD COLUMN game_status VARCHAR DEFAULT 'playing'"))
            conn.execute(text("UPDATE player_status SET game_status = 'playing' WHERE game_status IS NULL"))
        if "stage_id" not in columns:
            conn.execute(text("ALTER TABLE player_status ADD COLUMN stage_id INTEGER DEFAULT 1"))
            conn.execute(text("UPDATE player_status SET stage_id = 1 WHERE stage_id IS NULL"))
        if "last_accessed_at" not in columns:
            conn.execute(text("ALTER TABLE player_status ADD COLUMN last_accessed_at TIMESTAMP"))
        # 既存のゲームには「今触った」扱いで猶予期間を与える（いきなり全部消えないように）
        conn.execute(
            text("UPDATE player_status SET last_accessed_at = :now WHERE last_accessed_at IS NULL"),
            {"now": models.utcnow()},
        )

def init_db():
    db = SessionLocal()
    try:
        # 全ステージのノード情報を game_data.py の内容に同期（既存行は上書き、無ければ追加）
        for node in ALL_STAGE_NODES:
            db.merge(models.NodeMaster(**node))
        db.commit()
        # game_data.py から消えたノードも DB から取り除く
        removed_nodes = game_logic.remove_obsolete_nodes(db)
        if removed_nodes:
            print(f"[startup] removed {removed_nodes} obsolete node(s)")

        # テスト用プレイヤーデータの初期化（/api/network・/api/scan が使う既定のゲーム）
        if db.query(models.PlayerStatus).count() == 0:
            game_logic.create_game(db)

        # 長期間使われていないゲームを掃除する
        removed = game_logic.cleanup_stale_games(db)
        if removed:
            print(f"[startup] removed {removed} stale game(s)")
    finally:
        db.close()

def setup_database(retries: int = 30, delay: float = 1.0) -> None:
    """Docker 起動直後に PostgreSQL の準備が整うまでリトライしてから初期化する。"""
    for attempt in range(1, retries + 1):
        try:
            models.Base.metadata.create_all(bind=engine)
            migrate_db()
            init_db()
            return
        except Exception as e:
            if attempt == retries:
                raise
            print(f"[startup] waiting for database ({attempt}/{retries}): {e}")
            time.sleep(delay)

setup_database()


# ======= スキーマ =======
class CreateGameRequest(BaseModel):
    stageId: int = DEFAULT_STAGE_ID


class ResetGameRequest(BaseModel):
    stageId: Optional[int] = None


class ActionRequest(BaseModel):
    type: Literal[
        "scan",
        "remoteScan",
        "breach",
        "dataExtract",
        "recover",
        "pause",
        "resume",
    ]
    nodeId: Optional[str] = None



def _get_game_or_404(db: Session, game_id: int) -> models.PlayerStatus:
    player = game_logic.get_game(db, game_id)
    if player is None:
        raise HTTPException(status_code=404, detail="指定されたゲームが存在しません")
    game_logic.touch_game(db, player)  # 使われたことを記録（古いゲームの掃除用）
    return player


# ======= 0. ステージ一覧の取得 =======
@app.get("/api/stages")
def get_stages():
    """選択可能なステージ（ミッション）一覧を返す。"""
    return {"stages": game_logic.list_stages()}


# ======= 1. ゲームの作成・取得・リセット =======
@app.post("/api/games")
def create_game(req: Optional[CreateGameRequest] = None, db: Session = Depends(get_db)):
    """新しいゲームを開始し、初期状態(GameState)を返す。
    ボディ無しでも呼べる（既定ステージ1）。{"stageId": 0} 等を渡せば指定ステージで開始する。
    """
    game_logic.cleanup_stale_games(db)  # 作るついでに、長期間使われていないゲームを掃除する
    stage_id = req.stageId if req is not None else DEFAULT_STAGE_ID
    player = game_logic.create_game(db, stage_id=stage_id)
    return game_logic.build_game_state(db, player)


@app.get("/api/games/{game_id}")
def get_game_state(game_id: int, db: Session = Depends(get_db)):
    """現在のゲーム状態(GameState)を返す。"""
    player = _get_game_or_404(db, game_id)
    return game_logic.build_game_state(db, player)


@app.post("/api/games/{game_id}/reset")
def reset_game(game_id: int, req: Optional[ResetGameRequest] = None, db: Session = Depends(get_db)):
    """指定されたゲームを初期状態にリセットし、初期 GameState を返す。"""
    player = _get_game_or_404(db, game_id)
    stage_id = req.stageId if req is not None else None
    game_logic.reset_game(db, player, stage_id=stage_id)
    return game_logic.build_game_state(db, player)


# ======= 2. プレイヤー操作 =======
@app.post("/api/games/{game_id}/actions")
def post_action(game_id: int, action: ActionRequest, db: Session = Depends(get_db)):

    """scan / remoteScan / breach / dataExtract / pause / resume を実行する。
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
