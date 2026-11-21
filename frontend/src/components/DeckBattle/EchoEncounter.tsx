import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { RELIC_DEFINITIONS } from '../../game/deckbattle/relics';
import type { RelicId, RunState } from '../../game/deckbattle/types';
import { GameIcon } from '../GameIcon/GameIcon';
import './EchoEncounter.css';

const LINES = [
  '第一防衛層の突破を確認した。',
  '損傷したシステムを修復する。',
  'ここから先は、従来の権限では生き残れない。',
  '新たな権限をひとつ選択せよ。',
];
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function EchoEncounter({ run, onChoose, onContinue }: {
  run: RunState; onChoose: (id: RelicId) => void; onContinue: () => void;
}) {
  const mid = run.intermission;
  const accepted = mid?.step === 'accepted';
  const [ready, setReady] = useState(() => reduced() || accepted);
  const locked = useRef(false);
  const continueRef = useRef(onContinue);
  useEffect(() => { continueRef.current = onContinue; }, [onContinue]);
  useEffect(() => {
    if (accepted) {
      const timer = window.setTimeout(() => continueRef.current(), reduced() ? 350 : 850);
      return () => window.clearTimeout(timer);
    }
    if (!ready) {
      const timer = window.setTimeout(() => setReady(true), 2150);
      return () => window.clearTimeout(timer);
    }
  }, [accepted, ready]);

  return (
    <main className={`echo-scene${accepted ? ' echo-scene--accepted' : ''}${ready ? ' echo-scene--ready' : ''}`} aria-labelledby="echo-label">
      <button type="button" className="db-btn db-btn--ghost echo-skip" onClick={() => accepted ? onContinue() : setReady(true)}
        hidden={ready && !accepted}>演出をスキップ</button>
      <div className="echo-core" aria-hidden="true"><span /><span /><strong /><i /><i /><i /></div>
      <h1 id="echo-label">ECHO <small>// 残響する管理AI</small></h1>
      <div className="echo-dialogue">
        {LINES.map((line, index) => <p key={line} style={{ '--echo-line-delay': `${index * 370}ms` } as CSSProperties}>「{line}」</p>)}
      </div>
      <div className="echo-recovery">
        <strong>SYSTEM RESTORED</strong><span>HP FULL RECOVERY</span>
        <div className="echo-hp" aria-label={`HP ${run.hp} / ${run.maxHp}`}>
          <i style={{ '--echo-before': `${Math.min(100, (mid?.previousHp ?? run.hp) / run.maxHp * 100)}%` } as CSSProperties} />
          <b>{run.hp} / {run.maxHp}</b>
        </div>
      </div>
      {accepted && mid.relicId ? (
        <p className="echo-accepted" role="status"><GameIcon name="check" /> 権限獲得 · {RELIC_DEFINITIONS[mid.relicId].name}</p>
      ) : ready && (
        <div className="echo-options" aria-label="ECHOの権限をひとつ選ぶ">
          {mid?.choices?.map((id) => {
            const def = RELIC_DEFINITIONS[id];
            return <button type="button" key={id} className="db-btn echo-option" onClick={() => {
              if (locked.current) return;
              locked.current = true;
              onChoose(id);
            }}><strong><GameIcon name={def.icon} /> {def.name}</strong><span>{def.description}</span></button>;
          })}
        </div>
      )}
    </main>
  );
}
