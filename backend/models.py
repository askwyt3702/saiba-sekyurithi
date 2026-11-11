from datetime import datetime, timezone

from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


def utcnow() -> datetime:
    """UTCの現在時刻(タイムゾーン情報なし)。SQLite/PostgreSQL どちらでも同じ扱いにするため。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)

# 1. プレイヤーの現在の状態（1行 = 1ゲーム。id を gameId として扱う）
class PlayerStatus(Base):
    __tablename__ = "player_status"

    id = Column(Integer, primary_key=True, index=True)
    game_time = Column(Integer, default=0)              # 経過時間（秒）
    alert_level = Column(Float, default=0.0)            # 警戒度（%）
    analysis_resource = Column(Integer, default=25)     # 解析資源
    current_privilege = Column(String, default="GUEST") # 所持権限
    game_status = Column(String, default="playing")     # playing / paused / won / lost
    last_accessed_at = Column(DateTime, default=utcnow) # 最後にAPIで触られた時刻（古いゲームの掃除に使う）

# 2. ノードの基本設計図（マスターデータ）
class NodeMaster(Base):
    __tablename__ = "node_master"

    id = Column(String, primary_key=True, index=True)   # 例: "external-1"
    name = Column(String, index=True)                   # 例: "DMZ (Webサーバー)"
    layer = Column(String)                              # 例: "DMZ"
    pos_x = Column(Float)                               # マップX座標
    pos_y = Column(Float)                               # マップY座標
    vulnerability = Column(String, nullable=True)       # 例: "SQLインジェクション"
    info = Column(String, nullable=True)                # 説明文

# 3. 現在のノード攻略状況
class NodeState(Base):
    __tablename__ = "node_state"

    id = Column(Integer, primary_key=True, index=True)
    player_id = Column(Integer, ForeignKey("player_status.id"))
    node_id = Column(String, ForeignKey("node_master.id"))
    status = Column(String, default="unscanned")        # unscanned / scanned / hacked

    # 他のテーブルとの紐づけ（リレーション）
    player = relationship("PlayerStatus")
    node = relationship("NodeMaster")

# 4. ゲーム内ログ（画面のイベントログに表示する内容）
class GameLog(Base):
    __tablename__ = "game_log"

    id = Column(Integer, primary_key=True, index=True)
    player_id = Column(Integer, ForeignKey("player_status.id"), index=True)
    timestamp = Column(Integer, default=0)              # 記録時点の game_time
    message = Column(String)
    severity = Column(String, default="info")           # info / success / warning / danger
