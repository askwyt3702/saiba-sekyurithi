import { useEffect, useRef, useState } from 'react';
import type { ActionRequest, ActionResult, GameState, ServerEvent } from '../model/types';
import { MockGameClient } from '../client/mockGameClient';

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
  const clientRef = useRef<MockGameClient | null>(null);
  const [state, setState] = useState<GameState | null>(null);

  useEffect(() => {
    // 今はMockGameClient固定。backend接続後はここをWebSocketGameClientに差し替える。
    const client = new MockGameClient(gameId);
    clientRef.current = client;

    client.connect((event) => setState((prev) => applyEvent(prev, event))).then(setState);

    return () => {
      client.disconnect();
      clientRef.current = null;
    };
  }, [gameId]);

  const sendAction = (action: ActionRequest): Promise<ActionResult> => {
    if (!clientRef.current) return Promise.resolve({ accepted: false, reason: 'invalid_state' });
    return clientRef.current.sendAction(action);
  };

  return { state, sendAction };
}
