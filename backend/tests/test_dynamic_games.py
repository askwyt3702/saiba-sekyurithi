from copy import deepcopy
import pytest
import main
import models
from map_generation import generate_stage1, GenerationFailure


def test_generated_game_seed_replay_retry_and_isolation(client):
    seed='0'*32
    first=client.post('/api/games',json={'stageId':1,'seed':seed,'requestId':'dynamic-proof-000'}).json()
    assert first['mapSnapshot']['source']=='generated'
    definition=first['mapSnapshot']['definition']
    assert definition['seed']==seed and len(definition['nodes'])==24
    generated=generate_stage1(seed)
    assert first['mapSnapshot']['generationInfo']['mapHash']==generated.map_hash
    assert first['edges']==generated.definition['edges']
    again=client.post('/api/games',json={'stageId':1,'seed':seed,'requestId':'dynamic-proof-000'}).json()
    assert again['gameId']==first['gameId']
    assert client.post('/api/games',json={'stageId':1,'seed':'1'*32,'requestId':'dynamic-proof-000'}).status_code==409
    second=client.post('/api/games',json={'stageId':1}).json()
    assert second['gameId']!=first['gameId']
    assert second['mapSnapshot']['definition']['seed']!=seed
    assert second['edges']!=first['edges']
    assert second['nodes'][0]['position']!=first['nodes'][0]['position']
    gid=first['gameId']
    for action in generated.validation.routes['fast'].actions:
        body={'type':action.type,'nodeId':action.node_id,'questionId':action.question_id,'exploitId':action.exploit_id}
        response=client.post(f'/api/games/{gid}/actions',json=body)
        assert response.status_code==200 and response.json()['accepted'],response.text
    state=client.get(f'/api/games/{gid}').json()
    assert state['status']=='won' and state['elapsedSeconds']==225
    with main.SessionLocal() as db:stored=deepcopy(db.get(models.GameMap,int(gid)).definition)
    main.init_db()
    assert client.get(f'/api/games/{gid}').json()['status']=='won'
    reset=client.post(f'/api/games/{gid}/reset').json()
    assert reset['elapsedSeconds']==0 and reset['edges']==first['edges']
    assert reset['mapSnapshot']==first['mapSnapshot']
    with main.SessionLocal() as db:assert db.get(models.GameMap,int(gid)).definition==stored


def test_generation_failure_preserves_old_game_and_leaves_no_partial_rows(client,monkeypatch):
    old=client.post('/api/games',json={'stageId':1,'seed':'2'*32}).json()
    with main.SessionLocal() as db:count=db.query(models.PlayerStatus).count()
    def fail(*_args,**_kwargs):raise GenerationFailure('3'*32,[['failed']]*16)
    monkeypatch.setattr('game_creation.generate_stage1',fail)
    response=client.post('/api/games',json={'stageId':1,'seed':'3'*32})
    assert response.status_code==503 and response.json()['detail']=='map_generation_failed'
    assert client.get('/api/games/'+old['gameId']).json()==old
    with main.SessionLocal() as db:assert db.query(models.PlayerStatus).count()==count


def test_generated_corruption_is_409_and_old_fixed_saves_remain_valid(client,fixed_game):
    old=fixed_game()
    state=client.post('/api/games',json={'stageId':1,'seed':'4'*32}).json()
    with main.SessionLocal() as db:
        row=db.get(models.GameMap,int(state['gameId']))
        value=deepcopy(row.definition);value['nodes'][0]['position']['x']+=1;row.definition=value;db.commit()
    assert client.get('/api/games/'+state['gameId']).status_code==409
    assert client.post('/api/games/'+state['gameId']+'/reset').status_code==409
    assert client.get('/api/games/'+old['gameId']).json()==old


@pytest.mark.parametrize('payload',[{'stageId':3},{'stageId':-1},{'stageId':2,'seed':'0'*32},{'stageId':1,'seed':'bad'}])
def test_bad_creation_request_is_rejected(client,payload):
    assert client.post('/api/games',json=payload).status_code==422
