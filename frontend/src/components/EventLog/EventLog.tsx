import { useEffect, useRef } from 'react';
import type { LogEntry } from '../../game/model/types';
import './EventLog.css';

interface EventLogProps {
  entries: LogEntry[];
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export function EventLog({ entries }: EventLogProps) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [entries.length]);

  return (
    <div className="event-log" ref={listRef}>
      {entries.map((entry) => (
        <div key={entry.id} className={`event-log__entry event-log__entry--${entry.severity}`}>
          <span className="event-log__time">[{formatTimestamp(entry.timestamp)}]</span>
          <span>{entry.message}</span>
        </div>
      ))}
    </div>
  );
}
