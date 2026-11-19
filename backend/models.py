from datetime import datetime, timezone

from sqlalchemy import JSON, Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import relationship

from database import Base


def utcnow() -> datetime:
    """UTCの現在時刻(タイムゾーン情報なし)。SQLite/PostgreSQL どちらでも同じ扱いにするため。"""
    return datetime.now(timezone.utc).replace(tzinfo=None)


# 1. プレイヤー(1行 = 1人)。パスワードは使わず、ブラウザが id を覚えておく
class Player(Base):
    __tablename__ = "deck_players"

    id = Column(String(36), primary_key=True)          # ランダムな UUID(推測されにくい文字列)
    name = Column(String(20), nullable=False)          # 画面に出す名前
    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    profile = relationship("DeckProfile", uselist=False, back_populates="player", cascade="all, delete-orphan")


# 2. カード基地(図鑑・弱点ノート・戦績・実績)。1人に1行
class DeckProfile(Base):
    __tablename__ = "deck_profiles"

    player_id = Column(String(36), ForeignKey("deck_players.id"), primary_key=True)
    # 図鑑と弱点ノートは ID の一覧なので JSON の配列で持つ
    seen_card_ids = Column(JSON, nullable=False, default=list)
    unlocked_branches = Column(JSON, nullable=False, default=list)
    seen_enemy_ids = Column(JSON, nullable=False, default=list)
    wrong_question_ids = Column(JSON, nullable=False, default=list)
    achievements = Column(JSON, nullable=False, default=list)
    # 次のランの開始時にもらえる解析コイン(弱点ノートの復習で貯まる)
    bonus_start_coins = Column(Integer, nullable=False, default=0)
    # 戦績
    runs_played = Column(Integer, nullable=False, default=0)
    runs_won = Column(Integer, nullable=False, default=0)
    elites_defeated = Column(Integer, nullable=False, default=0)
    max_event_streak = Column(Integer, nullable=False, default=0)
    total_quiz_correct = Column(Integer, nullable=False, default=0)
    reviews_cleared = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)

    player = relationship("Player", back_populates="profile")
