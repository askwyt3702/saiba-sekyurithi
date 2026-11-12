import { useEffect, useMemo, useRef, useState } from 'react';
import type { ActionRequest, ActionResult, GameClient, GameState, ServerEvent } from '../model/types';
import { MockGameClient } from '../client/mockGameClient';
import { HttpGameClient } from '../client/httpGameClient';
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

// enabled が true になるまでバックエンドに接続しない(タイトル画面を開いただけでゲームが作られないように)
export function useGameClient(enabled: boolean, stageId: number = DEFAULT_STAGE_ID) {
  const clientRef = useRef<GameClient | null>(null);
  const connection = useMemo(() => ({ enabled, stageId }), [enabled, stageId]);
  const [snapshot, setSnapshot] = useState<{ connection: object; state: GameState } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const handleEvent = (event: ServerEvent) => {
      if (!cancelled) {
        setSnapshot((prev) => {
          const state = applyEvent(prev?.connection === connection ? prev.state : null, event);
          return state ? { connection, state } : null;
        });
      }
    };

    // まず実バックエンド(HttpGameClient)へ接続を試み、
    // バックエンド未起動の場合は MockGameClient にフォールバックする。
    const httpClient = new HttpGameClient('http://localhost:8000', stageId);
    clientRef.current = httpClient;

    httpClient
      .connect(handleEvent)
      .then((initial) => {
        if (!cancelled) setSnapshot({ connection, state: initial });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[useGameClient] バックエンド接続失敗のため MockGameClient に切り替えます:', err);
        httpClient.disconnect();
        const mockClient = new MockGameClient('mock', stageId);
        clientRef.current = mockClient;
        void mockClient.connect(handleEvent).then((initial) => {
          if (!cancelled) setSnapshot({ connection, state: initial });
        });
      });

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [enabled, stageId, connection]);

  const sendAction = (action: ActionRequest): Promise<ActionResult> => {
    if (!clientRef.current) return Promise.resolve({ accepted: false, reason: 'invalid_state' });
    return clientRef.current.sendAction(action);
  };

  const reset = (): Promise<void> => clientRef.current?.reset() ?? Promise.resolve();

  const state = enabled && snapshot?.connection === connection && snapshot.state.stageId === stageId ? snapshot.state : null;
  return { state, sendAction, reset };
}
