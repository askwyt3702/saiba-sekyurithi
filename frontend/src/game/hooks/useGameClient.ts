import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActionRequest, ActionResult, GameClient, GameState, ServerEvent } from '../model/types';
import { createMockSession } from '../client/mockSession';
import type { GameStart } from '../model/gameStart';
import { HttpGameClient, HttpGameError } from '../client/httpGameClient';
import { DEFAULT_STAGE_ID } from '../data/stageData';

function applyEvent(prev: GameState | null, event: ServerEvent): GameState | null {
  if (event.type === 'state_snapshot') return event.state;
  if (!prev) return prev;

  switch (event.type) {
    case 'tick':
      return { ...prev, elapsedSeconds: event.elapsedSeconds, alertLevel: event.alertLevel };
    case 'node_update':
      return { ...prev, nodes: prev.nodes.map((n) => (n.id === event.node.id ? event.node : n)) };
    case 'log':
      return { ...prev, log: [...prev.log, event.entry] };
    case 'game_over':
      return { ...prev, status: event.result === 'won' ? 'won' : 'lost' };
    default:
      return prev;
  }
}

// どちらにつながっているか。'mock' のときはバックエンドに届いておらず、画面に目印を出す。
export type ConnectionMode = 'backend' | 'mock';

// enabled が true になるまでバックエンドに接続しない(タイトル画面を開いただけでゲームが作られないように)
export function useGameClient(enabled: boolean, stageId: number = DEFAULT_STAGE_ID, start?:GameStart) {
  const clientRef = useRef<GameClient | null>(null);
  const connection = useMemo(() => ({ enabled, stageId,start }), [enabled, stageId,start]);
  const [snapshot, setSnapshot] = useState<{ connection: object; state: GameState; mode: ConnectionMode } | null>(null);
  const [failure, setFailure] = useState<{ connection: object; message: string } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let mode: ConnectionMode = 'backend';
    const handleEvent = (event: ServerEvent) => {
      if (!cancelled) {
        setSnapshot((prev) => {
          const state = applyEvent(prev?.connection === connection ? prev.state : null, event);
          return state ? { connection, state, mode } : null;
        });
      }
    };

    // まず実バックエンド(HttpGameClient)へ接続を試み、
    // バックエンド未起動の場合は MockGameClient にフォールバックする。
    const httpClient = new HttpGameClient('http://localhost:8000', stageId,start);
    clientRef.current = httpClient;

    httpClient
      .connect(handleEvent)
      .then((initial) => {
        if (!cancelled) setSnapshot({ connection, state: initial, mode });
      })
      .catch(async (err) => {
        if (cancelled) return;
        const fail = (message: string) => setFailure({ connection, message });
        httpClient.disconnect();
        if (err instanceof HttpGameError && (err.isSnapshotInvalid||err.blocksFallback)) {
          fail(err.isSnapshotInvalid?'保存済みのマップが不正、または非対応の形式です。Backendの保存データを確認してください。':'新しいゲームを作成できませんでした。以前の保存は保持されています。時間をおいて再試行してください。');
          clientRef.current = null;
          return;
        }
        console.warn('[useGameClient] バックエンド接続失敗のため MockGameClient に切り替えます:', err);
        mode = 'mock';
        try {
          const session=await createMockSession(stageId,start??{mode:'resume'},handleEvent,()=>!cancelled);
          if(cancelled){session.client.disconnect();return;}
          clientRef.current = session.client;
          setSnapshot({ connection, state: session.state, mode });
        } catch { if (!cancelled) {
          clientRef.current?.disconnect();
          clientRef.current = null;
          fail('Mockゲームを開始できませんでした。ブラウザの保存領域や設定を確認してください。');
        } }
      });

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [enabled, stageId, connection,start]);

  const stopInvalidSnapshot = (error: unknown, client: GameClient) => {
    if (clientRef.current !== client || !(error instanceof HttpGameError) || !error.isSnapshotInvalid) return false;
    client.disconnect();
    clientRef.current = null;
    setFailure({ connection, message: '保存済みのマップが不正、または非対応の形式です。Backendの保存データを確認してください。' });
    return true;
  };

  const sendAction = async (action: ActionRequest): Promise<ActionResult> => {
    const client = clientRef.current;
    if (!client) return { accepted: false, reason: 'invalid_state' };
    try { return await client.sendAction(action); }
    catch (error) {
      if (stopInvalidSnapshot(error, client)) return { accepted: false, reason: 'invalid_state' };
      throw error;
    }
  };

  const reset = async (): Promise<void> => {
    const client = clientRef.current;
    if (!client) return;
    try { await client.reset(); }
    catch (error) { stopInvalidSnapshot(error, client); throw error; }
  };

  const state = enabled && snapshot?.connection === connection && snapshot.state.stageId === stageId ? snapshot.state : null;
  const connectionMode: ConnectionMode | null = state ? snapshot?.mode ?? null : null;
  return { state, connectionMode, sendAction, reset, connectionError: failure?.connection === connection ? failure.message : null };
}
