import asyncio
from contextlib import asynccontextmanager
from typing import Literal, Optional

from fastapi import FastAPI, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

import models
import game_logic
import realtime
from database import engine, SessionLocal
from game_data import NODES


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 起動時にティックループ（ゲーム内時間を進める処理）を開始し、終了時に止める
    stop = asyncio.Event()
    task = asyncio.create_task(realtime.tick_loop(stop))
    try:
        yield
    finally:
        stop.set()
        task.cancel()


app = FastAPI(title="NULL ROUTE API", lifespan=lifespan)

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


async def _run_action(game_id: int, action_type: str, node_id: Optional[str]):
    """操作を受け付けて (player, db, reason) を返す。reason が None なら受理。
    ティックループと同時に状態を書き換えないよう、realtime.lock の中で実行する。
    """
    db = SessionLocal()
    try:
        player = _get_game_or_404(db, game_id)
    except HTTPException:
        db.close()
        raise
    try:
        game_logic.apply_action(db, player, action_type, node_id)
    except game_logic.ActionRejected as e:
        db.rollback()
        return player, db, e.reason
    await realtime.publish_after_action(db, player)
    return player, db, None


# ======= 1. ゲームの作成・取得 =======
@app.post("/api/games")
async def create_game():
    """新しいゲームを開始し、初期状態(GameState)を返す。"""
    async with realtime.lock:
        db = SessionLocal()
        try:
            player = game_logic.create_game(db)
            return game_logic.build_game_state(db, player)
        finally:
            db.close()


@app.get("/api/games/{game_id}")
def get_game_state(game_id: int, db: Session = Depends(get_db)):
    """現在のゲーム状態(GameState)を返す。"""
    player = _get_game_or_404(db, game_id)
    return game_logic.build_game_state(db, player)


# ======= 2. プレイヤー操作 =======
@app.post("/api/games/{game_id}/actions")
async def post_action(game_id: int, action: ActionRequest):
    """scan / breach / dataExtract / pause / resume を受け付ける。
    受理可否(accepted, reason)と、受付直後の GameState を state として返す。
    scan / breach / dataExtract の結果は、ゲーム内時間が経過した後に WebSocket で届く。
    """
    async with realtime.lock:
        player, db, reason = await _run_action(game_id, action.type, action.nodeId)
        try:
            body = {"accepted": reason is None, "state": game_logic.build_game_state(db, player)}
            if reason is not None:
                body["reason"] = reason
            return body
        finally:
            db.close()


# ======= 3. リアルタイム更新（WebSocket） =======
@app.websocket("/ws/games/{game_id}")
async def game_socket(ws: WebSocket, game_id: int):
    async with realtime.lock:
        db = SessionLocal()
        try:
            player = game_logic.get_game(db, game_id)
            if player is None:
                await ws.close(code=4404)
                return
            await realtime.manager.connect(game_id, ws, db, player)
        finally:
            db.close()
    try:
        while True:
            # クライアントからのメッセージは今は使わない（操作は REST で送る）。切断検知のために待つ
            await ws.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        realtime.manager.disconnect(game_id, ws)


# ======= 4. 旧API（互換用：既定のゲーム = 最初のプレイヤー を対象にする） =======
@app.get("/api/network")
def get_network_map(db: Session = Depends(get_db)):
    player = db.query(models.PlayerStatus).order_by(models.PlayerStatus.id).first()
    state = game_logic.build_game_state(db, player)
    return {"nodes": state["nodes"], "edges": state["edges"]}


class ScanRequest(BaseModel):
    node_id: str

@app.post("/api/scan")
async def scan_node(req: ScanRequest):
    """旧API。スキャンを「開始」する（完了はゲーム内時間の経過後）。"""
    async with realtime.lock:
        db = SessionLocal()
        try:
            player = db.query(models.PlayerStatus).order_by(models.PlayerStatus.id).first()
        finally:
            db.close()
        player, db, reason = await _run_action(player.id, "scan", req.node_id)
        try:
            if reason is not None:
                return {"error": reason}
            return {
                "message": f"ノード {req.node_id} のスキャンを開始しました",
                "status": "unscanned",
                "remaining_resource": player.analysis_resource,
            }
        finally:
            db.close()
