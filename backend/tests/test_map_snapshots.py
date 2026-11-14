from copy import deepcopy

import pytest
import main
import models
import game_data
import game_logic
from map_definition import map_from_stage
from map_repository import load_map, save_map, ensure_map, to_wire


def test_fixed_snapshot_is_saved_and_same_stage_retry_preserves_it(client, ready_act, fixed_game):
    state = fixed_game()
    gid = state['gameId']
    snapshot = state['mapSnapshot']
    assert snapshot['schemaVersion'] == 1 and snapshot['source'] == 'fixed'
    assert len(snapshot['definition']['nodes']) == 24
    assert len(snapshot['definition']['edges']) == 38
    assert not snapshot['definition']['vulnerabilities']
    assert all('question_answers' not in r for r in snapshot['definition']['securityRules'].values())
    with main.SessionLocal() as db:
        stored = deepcopy(db.get(models.GameMap, int(gid)).definition)
    ready_act(gid, 'scan', 'E01')
    ready_act(gid, 'breach', 'E01')
    assert client.get(f'/api/games/{gid}').json()['nodes'][0]['data']['status'] == 'hacked'
    reset = client.post(f'/api/games/{gid}/reset', json={'stageId': 1}).json()
    assert reset['mapSnapshot'] == snapshot
    assert reset['elapsedSeconds'] == 0 and reset['analysisResource'] == 25
    with main.SessionLocal() as db:
        assert db.get(models.GameMap, int(gid)).definition == stored


def test_display_actions_and_retry_use_saved_graph_not_current_globals(client, ready_act):
    definition = map_from_stage(game_data.get_stage(1))
    definition['nodes'][0]['pos_x'] += 123
    definition['edges'] = [e for e in definition['edges'] if 'D01' not in (e['source'], e['target'])]
    definition['edges'].append({'id': 'saved-link', 'source': 'E01', 'target': 'D02'})
    with main.SessionLocal() as db:
        player = game_logic.create_game(db, definition=definition)
        gid = str(player.id)
    other = client.post('/api/games', json={'stageId': 1}).json()
    state = client.get(f'/api/games/{gid}').json()
    assert state['nodes'][0]['position']['x'] == definition['nodes'][0]['pos_x']
    assert state['edges'] == definition['edges']
    assert state['mapSnapshot']['definition']['edges'] == state['edges']
    assert other['nodes'][0]['position'] != state['nodes'][0]['position']
    ready_act(gid, 'scan', 'E01')
    ready_act(gid, 'breach', 'E01')
    assert ready_act(gid, 'scan', 'D01')['reason'] == 'node_unreachable'
    assert ready_act(gid, 'scan', 'D02')['accepted']
    reset = client.post(f'/api/games/{gid}/reset').json()
    assert reset['edges'] == definition['edges']
    assert reset['nodes'][0]['position'] == state['nodes'][0]['position']


def test_legacy_map_is_captured_once_and_does_not_follow_master_updates(client):
    with main.SessionLocal() as db:
        player = models.PlayerStatus(stage_id=1, game_time=37, analysis_resource=19, alert_level=12)
        db.add(player)
        db.commit()
        gid = player.id
        master = db.get(models.NodeMaster, 'E01')
        original = master.pos_x
        try:
            master.pos_x = original + 321
            db.commit()
            row = ensure_map(db, player)
            assert row.source == 'legacy-fixed'
        finally:
            master.pos_x = original
            db.commit()
    state = client.get(f'/api/games/{gid}').json()
    assert state['nodes'][0]['position']['x'] == original + 321
    assert state['elapsedSeconds'] == 37 and state['analysisResource'] == 19
    assert client.get(f'/api/games/{gid}').json()['mapSnapshot'] == state['mapSnapshot']


def test_corrupt_snapshot_is_rejected_not_regenerated(client):
    gid = int(client.post('/api/games').json()['gameId'])
    with main.SessionLocal() as db:
        db.get(models.GameMap, gid).schema_version = 99
        db.commit()
    response = client.get(f'/api/games/{gid}')
    assert response.status_code == 409 and response.json()['detail'] == 'map_snapshot_invalid'


def test_wire_round_trip_does_not_consult_live_stage_configuration():
    definition = map_from_stage(game_data.get_stage(2))
    from map_repository import from_wire
    assert to_wire(from_wire(to_wire(definition))) == to_wire(definition)


def test_snapshot_and_player_creation_roll_back_together(monkeypatch):
    with main.SessionLocal() as db:
        before = db.query(models.PlayerStatus).count()
    def fail(*_args, **_kwargs):
        raise RuntimeError('snapshot write failure')
    monkeypatch.setattr(game_logic, 'save_map', fail)
    with main.SessionLocal() as db:
        with pytest.raises(RuntimeError, match='snapshot write failure'):
            game_logic.create_game(db)
        db.rollback()
        assert db.query(models.PlayerStatus).count() == before
