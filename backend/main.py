"""NULL ROUTE のバックエンド。デッキバトルのプレイヤーとカード基地(図鑑・弱点ノート・戦績・実績)を保存する。

ゲームのルールはフロントだけで動く(frontend/src/game/deckbattle/)。ここではデータの保存だけを受け持つ。
データの形は docs/api-contract.md で取り決めている。
"""
import os
import time
import uuid
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

import models
from database import SessionLocal, engine

app = FastAPI(title="NULL ROUTE API")

# 画面(フロント)の URL。別のポートで動かすときは環境変数 CORS_ORIGINS にカンマ区切りで書く
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
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


def setup_database(retries: int = 30, delay: float = 1.0) -> None:
    """Docker 起動直後に PostgreSQL の準備が整うまでリトライしてから、テーブルを作る。"""
    for attempt in range(1, retries + 1):
        try:
            models.Base.metadata.create_all(bind=engine)
            return
        except Exception as e:
            if attempt == retries:
                raise
            print(f"[startup] waiting for database ({attempt}/{retries}): {e}")
            time.sleep(delay)


setup_database()


# ======= スキーマ(項目名はフロントに合わせて camelCase) =======
MAX_NAME_LENGTH = 20
MAX_LIST_ITEMS = 500
MAX_ID_LENGTH = 64
MAX_COUNT = 1_000_000
MAX_BONUS_START_COINS = 3  # frontend/src/game/deckbattle/profile.ts の MAX_BONUS_START_COINS と同じ

IdList = List[str]


def _check_ids(values: List[str]) -> List[str]:
    if len(values) > MAX_LIST_ITEMS:
        raise ValueError(f"too_many_items(max {MAX_LIST_ITEMS})")
    for v in values:
        if not v or len(v) > MAX_ID_LENGTH:
            raise ValueError("invalid_id")
    # 重複は1つにまとめる(順番は最初に出てきた順)
    return list(dict.fromkeys(values))


class ProfileStats(BaseModel):
    model_config = ConfigDict(extra="forbid")

    runsPlayed: int = Field(0, ge=0, le=MAX_COUNT)
    runsWon: int = Field(0, ge=0, le=MAX_COUNT)
    elitesDefeated: int = Field(0, ge=0, le=MAX_COUNT)
    maxEventStreak: int = Field(0, ge=0, le=MAX_COUNT)
    totalQuizCorrect: int = Field(0, ge=0, le=MAX_COUNT)
    reviewsCleared: int = Field(0, ge=0, le=MAX_COUNT)


class DeckProfileBody(BaseModel):
    """カード基地。frontend/src/game/deckbattle/profile.ts の DeckProfile と同じ形。"""

    model_config = ConfigDict(extra="forbid")

    seenCardIds: IdList = Field(default_factory=list)
    unlockedBranches: IdList = Field(default_factory=list)
    seenEnemyIds: IdList = Field(default_factory=list)
    wrongQuestionIds: IdList = Field(default_factory=list)
    bonusStartCoins: int = Field(0, ge=0, le=MAX_BONUS_START_COINS)
    stats: ProfileStats = Field(default_factory=ProfileStats)
    achievements: IdList = Field(default_factory=list)

    @field_validator("seenCardIds", "unlockedBranches", "seenEnemyIds", "wrongQuestionIds", "achievements")
    @classmethod
    def _ids(cls, values: List[str]) -> List[str]:
        return _check_ids(values)


class CreatePlayerRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    # 登録前にブラウザで遊んでいた分のカード基地(あれば一緒に保存する)
    profile: Optional[DeckProfileBody] = None

    @field_validator("name")
    @classmethod
    def _name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("name_required")
        if len(name) > MAX_NAME_LENGTH:
            raise ValueError(f"name_too_long(max {MAX_NAME_LENGTH})")
        return name


class SaveProfileRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile: DeckProfileBody


# ======= DB の行 ⇔ レスポンス =======
def _apply_profile(row: models.DeckProfile, body: DeckProfileBody) -> None:
    row.seen_card_ids = body.seenCardIds
    row.unlocked_branches = body.unlockedBranches
    row.seen_enemy_ids = body.seenEnemyIds
    row.wrong_question_ids = body.wrongQuestionIds
    row.achievements = body.achievements
    row.bonus_start_coins = body.bonusStartCoins
    row.runs_played = body.stats.runsPlayed
    row.runs_won = body.stats.runsWon
    row.elites_defeated = body.stats.elitesDefeated
    row.max_event_streak = body.stats.maxEventStreak
    row.total_quiz_correct = body.stats.totalQuizCorrect
    row.reviews_cleared = body.stats.reviewsCleared
    row.updated_at = models.utcnow()


def _profile_json(row: models.DeckProfile) -> dict:
    return {
        "seenCardIds": list(row.seen_card_ids or []),
        "unlockedBranches": list(row.unlocked_branches or []),
        "seenEnemyIds": list(row.seen_enemy_ids or []),
        "wrongQuestionIds": list(row.wrong_question_ids or []),
        "bonusStartCoins": row.bonus_start_coins or 0,
        "stats": {
            "runsPlayed": row.runs_played or 0,
            "runsWon": row.runs_won or 0,
            "elitesDefeated": row.elites_defeated or 0,
            "maxEventStreak": row.max_event_streak or 0,
            "totalQuizCorrect": row.total_quiz_correct or 0,
            "reviewsCleared": row.reviews_cleared or 0,
        },
        "achievements": list(row.achievements or []),
    }


def _player_json(player: models.Player) -> dict:
    return {"playerId": player.id, "name": player.name, "profile": _profile_json(player.profile)}


def _get_player_or_404(db: Session, player_id: str) -> models.Player:
    player = db.get(models.Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="player_not_found")
    if player.profile is None:
        player.profile = models.DeckProfile()
    return player


# ======= API =======
@app.get("/api/health")
def health():
    """フロントがバックエンドにつながるかを確かめる。"""
    return {"status": "ok"}


@app.post("/api/players", status_code=201)
def create_player(req: CreatePlayerRequest, db: Session = Depends(get_db)):
    """名前でプレイヤーを登録し、playerId を返す。ブラウザで遊んでいた分のカード基地も一緒に保存できる。"""
    player = models.Player(id=str(uuid.uuid4()), name=req.name)
    profile = models.DeckProfile()
    _apply_profile(profile, req.profile or DeckProfileBody())
    player.profile = profile
    db.add(player)
    db.commit()
    db.refresh(player)
    return _player_json(player)


@app.get("/api/players/{player_id}")
def get_player(player_id: str, db: Session = Depends(get_db)):
    """プレイヤーの名前とカード基地を返す。"""
    return _player_json(_get_player_or_404(db, player_id))


@app.put("/api/players/{player_id}/profile")
def save_profile(player_id: str, req: SaveProfileRequest, db: Session = Depends(get_db)):
    """カード基地を丸ごと保存する(送った内容で置き換える)。保存後の内容を返す。"""
    player = _get_player_or_404(db, player_id)
    _apply_profile(player.profile, req.profile)
    db.commit()
    db.refresh(player)
    return _player_json(player)
