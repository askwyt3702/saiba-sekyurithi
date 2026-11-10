"""リアルタイム層：WebSocket の接続管理と、ゲーム内時間を進めるティックループ。

- クライアントは /ws/games/{gameId} に接続すると、まず state_snapshot を1回受け取り、
  以後は tick / log / node_update / state_snapshot / game_over を受け取る（api-contract.md 4節）。
- 時間が進むのは「WebSocket が1本以上つながっているゲーム」だけ。
  タブを閉じて放置されたゲームが裏で進み続けて負けになるのを防ぐため。
- DB を触る処理（ティック・プレイヤー操作）はすべて `lock` の中で行い、
  同じゲームの状態を同時に書き換えて矛盾が起きないようにしている。
"""
import asyncio
import time
from typing import Optional

from fastapi import WebSocket
from sqlalchemy.orm import Session

import balance_config
import game_logic
import models
from database import SessionLocal

# DB を触る処理を直列化するロック（tick と REST の操作が同時に走らないようにする）
lock = asyncio.Lock()


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[int, set[WebSocket]] = {}
        # ゲームごとに「どのログまで送ったか」を覚えておき、新しいログだけを log イベントで送る
        self.last_log_id: dict[int, int] = {}

    def active_game_ids(self) -> list[int]:
        return [gid for gid, conns in self.connections.items() if conns]

    async def connect(self, game_id: int, ws: WebSocket, db: Session, player: models.PlayerStatus) -> None:
        await ws.accept()
        self.connections.setdefault(game_id, set()).add(ws)
        state = game_logic.build_game_state(db, player)
        if state["log"]:
            self.last_log_id[game_id] = max(self.last_log_id.get(game_id, 0), int(state["log"][-1]["id"]))
        await ws.send_json({"type": "state_snapshot", "state": state})

    def disconnect(self, game_id: int, ws: WebSocket) -> None:
        conns = self.connections.get(game_id)
        if conns is not None:
            conns.discard(ws)
            if not conns:
                del self.connections[game_id]

    async def broadcast(self, game_id: int, event: dict) -> None:
        for ws in list(self.connections.get(game_id, ())):
            try:
                await ws.send_json(event)
            except Exception:
                # 送信に失敗した接続は切れたものとして外す
                self.disconnect(game_id, ws)

    async def flush_logs(self, game_id: int, db: Session) -> None:
        """まだ送っていないログを log イベントとして送る。"""
        last = self.last_log_id.get(game_id, 0)
        new_logs = db.query(models.GameLog).filter(
            models.GameLog.player_id == game_id,
            models.GameLog.id > last,
        ).order_by(models.GameLog.id).all()
        for log in new_logs:
            await self.broadcast(game_id, {"type": "log", "entry": game_logic.build_log_entry(log)})
            self.last_log_id[game_id] = log.id


manager = ConnectionManager()


async def publish_after_action(db: Session, player: models.PlayerStatus) -> None:
    """REST でプレイヤー操作を受け付けた後、接続中のクライアントへ変化を通知する。"""
    await manager.flush_logs(player.id, db)
    await manager.broadcast(player.id, {"type": "state_snapshot", "state": game_logic.build_game_state(db, player)})


async def publish_after_reset(db: Session, player: models.PlayerStatus) -> None:
    """ゲームをリセットした後、接続中のクライアントへ初期状態を通知する。"""
    manager.last_log_id.pop(player.id, None)
    state = game_logic.build_game_state(db, player)
    if state["log"]:
        manager.last_log_id[player.id] = int(state["log"][-1]["id"])
    await manager.broadcast(player.id, {"type": "state_snapshot", "state": state})


async def _tick_game(game_id: int) -> None:
    db = SessionLocal()
    try:
        player = game_logic.get_game(db, game_id)
        if player is None:
            return
        result = game_logic.tick(db, player)
        if not result.advanced:
            return

        await manager.flush_logs(game_id, db)
        await manager.broadcast(game_id, {
            "type": "tick",
            "elapsedSeconds": player.game_time,
            "alertLevel": round(player.alert_level, 2),
        })
        if result.resolved_node_ids:
            for node_id in result.resolved_node_ids:
                node = game_logic.build_node_by_id(db, player, node_id)
                if node is not None:
                    await manager.broadcast(game_id, {"type": "node_update", "node": node})
            # 資源・権限・実行中操作の一覧なども変わるので、まとめて最新状態を送る
            await manager.broadcast(game_id, {"type": "state_snapshot", "state": game_logic.build_game_state(db, player)})
        if result.finished:
            await manager.broadcast(game_id, {"type": "game_over", "result": result.finished})
    finally:
        db.close()


async def tick_loop(stop: Optional[asyncio.Event] = None) -> None:
    """TICK_INTERVAL_SECONDS ごとに、接続中の全ゲームの時間を1秒進める。"""
    next_at = time.monotonic()
    while stop is None or not stop.is_set():
        next_at += balance_config.TICK_INTERVAL_SECONDS
        await asyncio.sleep(max(0.0, next_at - time.monotonic()))
        async with lock:
            for game_id in manager.active_game_ids():
                try:
                    await _tick_game(game_id)
                except Exception as e:  # 1ゲームの失敗でループ全体を止めない
                    print(f"[tick_loop] game {game_id}: {e!r}")
