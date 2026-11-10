import { useEffect, useRef, useState } from 'react';
import type { ActionRequest, ActionResult, GameClient, GameState, ServerEvent } from '../model/types';
import { MockGameClient } from '../client/mockGameClient';
import { WebSocketGameClient } from '../client/webSocketGameClient';

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

export function useGameClient(gameId: string) {
  const clientRef = useRef<GameClient | null>(null);
  const [state, setState] = useState<GameState | null>(null);

  useEffect(() => {
    let cancelled = false;
    const handleEvent = (event: ServerEvent) => {
      if (!cancelled) {
        setState((prev) => applyEvent(prev, event));
      }
    };

    // まず実バックエンド(WebSocketGameClient)へ接続を試み、
    // バックエンド未起動の場合は MockGameClient にフォールバックする。
    const wsClient = new WebSocketGameClient(gameId);
    clientRef.current = wsClient;

    wsClient
      .connect(handleEvent)
      .then((initial) => {
        if (!cancelled) setState(initial);
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[useGameClient] バックエンド接続失敗のため MockGameClient に切り替えます:', err);
        wsClient.disconnect();
        const mockClient = new MockGameClient(gameId);
        clientRef.current = mockClient;
        void mockClient.connect(handleEvent).then((initial) => {
          if (!cancelled) setState(initial);
        });
      });

    return () => {
      cancelled = true;
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [gameId]);

  const sendAction = (action: ActionRequest): Promise<ActionResult> => {
    if (!clientRef.current) return Promise.resolve({ accepted: false, reason: 'invalid_state' });
    return clientRef.current.sendAction(action);
  };

  return { state, sendAction };
}
