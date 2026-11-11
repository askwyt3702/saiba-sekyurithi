
import { useEffect, useRef, useState } from 'react';
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
  // 初期状態ではログを折りたたむ
  const [collapsed, setCollapsed] = useState(true);

  const listRef = useRef<HTMLDivElement>(null);

  // ログが増えたとき、開いていれば一番下へスクロール
  useEffect(() => {
    if (!collapsed) {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
      });
    }
  }, [entries.length, collapsed]);

  return (
    <div
      className={[
        'event-log',
        collapsed ? 'event-log--collapsed' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        className="event-log__toggle"
        onClick={() => setCollapsed((prev) => !prev)}
        aria-expanded={!collapsed}
      >
        {collapsed
          ? `▲ EVENT LOG（${entries.length}件）`
          : `▼ EVENT LOG（${entries.length}件）`}
      </button>

      {!collapsed && (
        <div ref={listRef} className="event-log__list">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`event-log__entry event-log__entry--${entry.severity}`}
            >
              <span className="event-log__time">
                [{formatTimestamp(entry.timestamp)}]
              </span>
              <span>{entry.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
