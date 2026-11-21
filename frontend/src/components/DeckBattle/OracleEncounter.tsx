import { useEffect, useRef, useState } from 'react';
import type { GameIconName } from '../../game/deckbattle/icons';
import { START_BONUS_DEFINITIONS } from '../../game/deckbattle/run';
import { playSound } from '../../game/sound/soundEffects';
import type { StartBonusId } from '../../game/deckbattle/types';
import { GameIcon } from '../GameIcon/GameIcon';
import './OracleEncounter.css';

const BONUS_ICONS: Record<StartBonusId, GameIconName> = {
  relic: 'scanner',
  tools: 'tools',
  max_hp: 'hp',
  coins: 'coin',
  rare_card: 'evolve',
};
const ACCEPTANCE_MS = 1200;
const REDUCED_ACCEPTANCE_MS = 600;

interface OracleEncounterProps {
  choices: StartBonusId[];
  onComplete: (id: StartBonusId) => void;
}

export function OracleEncounter({ choices, onComplete }: OracleEncounterProps) {
  const [selection, setSelection] = useState<{ id: StartBonusId; deadline: number } | null>(null);
  const [skipIntro, setSkipIntro] = useState(false);
  const chosen = useRef<StartBonusId | null>(null);
  const sent = useRef(false);
  const skipButton = useRef<HTMLButtonElement>(null);
  const firstChoice = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selection) skipButton.current?.focus({ preventScroll: true });
  }, [selection]);

  useEffect(() => {
    if (!selection) return;
    const timer = window.setTimeout(() => {
      if (sent.current) return;
      sent.current = true;
      onComplete(selection.id);
    }, Math.max(0, selection.deadline - performance.now()));
    return () => window.clearTimeout(timer);
  }, [selection, onComplete]);

  const choose = (id: StartBonusId) => {
    if (chosen.current || !choices.includes(id)) return;
    chosen.current = id;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setSelection({ id, deadline: performance.now() + (reduced ? REDUCED_ACCEPTANCE_MS : ACCEPTANCE_MS) });
    playSound('extract');
  };

  const skip = () => {
    if (chosen.current) {
      if (sent.current) return;
      sent.current = true;
      onComplete(chosen.current);
    } else {
      setSkipIntro(true);
      firstChoice.current?.focus({ preventScroll: true });
    }
  };

  return (
    <main className={`oracle-scene${skipIntro ? ' oracle-scene--skip-intro' : ''}${selection ? ' oracle-scene--accepted' : ''}`}
      aria-labelledby="oracle-title">
      <button ref={skipButton} type="button" className="db-btn db-btn--ghost oracle-skip"
        hidden={skipIntro && !selection} onClick={skip}>
        {selection ? '祝福演出をスキップ' : '登場演出をスキップ'}
      </button>

      <div className="oracle-content">
        <div className="oracle-stage" aria-hidden="true">
          <div className="oracle-platform" />
          <div className="oracle-apparition">
            <div className="oracle-hologram">
              <span className="oracle-orbit oracle-orbit--outer" />
              <span className="oracle-orbit oracle-orbit--inner" />
              <span className="oracle-core">
                <span className="oracle-core__iris" />
              </span>
              <span className="oracle-signal oracle-signal--left" />
              <span className="oracle-signal oracle-signal--right" />
            </div>
          </div>
        </div>

        <header className="oracle-dialogue">
          <h1 id="oracle-title"><span>管理AI</span> ORACLE</h1>
          <p className="oracle-line">「侵入者を認識。出発プロトコルをひとつ選べ。」</p>
          {selection && <p className="oracle-accepted" role="status">PROTOCOL ACCEPTED</p>}
        </header>

        <div className="oracle-choices" role="group" aria-label="出発前の強化をひとつ選ぶ">
          {choices.map((id, index) => {
            const bonus = START_BONUS_DEFINITIONS[id];
            return (
              <button ref={index === 0 ? firstChoice : undefined} key={id} type="button"
                className={`oracle-choice${selection?.id === id ? ' oracle-choice--selected' : ''}`}
                disabled={selection !== null} onClick={() => choose(id)}>
                <span className="oracle-choice__icon"><GameIcon name={BONUS_ICONS[id]} /></span>
                <span className="oracle-choice__body">
                  <strong>{bonus.name}</strong>
                  <span>{bonus.description}</span>
                </span>
                {selection?.id === id && <span className="oracle-choice__check" aria-label="選択済み"><GameIcon name="check" /></span>}
              </button>
            );
          })}
        </div>
      </div>
    </main>
  );
}
