"""Generate/validate before writing; fixed adapters remain for legacy regression."""
import secrets
from sqlalchemy.exc import IntegrityError
import game_data
import game_logic
import models
from map_generation import generate_stage1
from map_generation_config import VALIDATOR_VERSION
from map_random import normalize_seed


class CreationConflict(ValueError):
    pass


def create_new_game(db, stage_id=1, seed=None, request_id=None):
    if stage_id not in game_data.STAGES:
        raise ValueError("unsupported_stage")
    if seed is not None:
        if stage_id != 1:
            raise ValueError("seed_not_supported")
        seed = normalize_seed(seed)
    existing = db.get(models.GameCreationRequest, request_id) if request_id else None
    if existing:
        if existing.stage_id != stage_id or (seed is not None and existing.seed != seed):
            raise CreationConflict("creation_request_conflict")
        player = db.get(models.PlayerStatus, existing.game_id)
        if player.stage_id != stage_id:
            raise CreationConflict("creation_request_conflict")
        return player
    definition, metadata = None, None
    if stage_id == 1:
        generated = generate_stage1(seed or secrets.token_hex(16))
        definition = generated.definition
        metadata = {"mapHash": generated.map_hash, "configHash": generated.config_hash,
                    "validatorVersion": VALIDATOR_VERSION, "acceptedAttempt": generated.accepted_attempt}
    try:
        return game_logic.create_game(db, stage_id, definition=definition, generation=metadata, request_id=request_id)
    except IntegrityError:
        db.rollback()
        existing = db.get(models.GameCreationRequest, request_id) if request_id else None
        if not existing:
            raise
        if existing.stage_id != stage_id or (seed is not None and existing.seed != seed):
            raise CreationConflict("creation_request_conflict")
        player = db.get(models.PlayerStatus, existing.game_id)
        if player is None or player.stage_id != stage_id:
            raise CreationConflict("creation_request_conflict")
        return player
