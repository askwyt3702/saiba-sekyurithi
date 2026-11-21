import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getCardDefinition, getCardStats } from '../../game/deckbattle/battle';
import type { CardInstance } from '../../game/deckbattle/types';
import { playSound } from '../../game/sound/soundEffects';
import { CardArtwork } from './CardArtwork';
import { EffectText } from './EffectText';
import './CardGrowth.css';

export interface LevelUpPresentation {
  before: CardInstance;
  after: CardInstance;
  source?: DOMRect;
}

const FLIGHT_MS = 780;
const EVOLUTION_MS = 3500;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
const PARTICLES = Array.from({ length: 14 }, (_, i) => {
  const angle = (i / 14) * Math.PI * 2;
  return {
    '--spark-x': `${Math.cos(angle) * (140 + (i % 3) * 24)}px`,
    '--spark-y': `${Math.sin(angle) * (155 + (i % 3) * 24)}px`,
    '--spark-delay': `${(i % 4) * 25}ms`,
  } as CSSProperties;
});

function GrowthDialog({ children, label }: { children: ReactNode; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    const preventDismissal = (event: Event) => event.preventDefault();
    const restoreModal = () => {
      if (element.isConnected && !element.open) element.showModal();
    };
    element.setAttribute('closedby', 'none');
    element.addEventListener('cancel', preventDismissal);
    element.addEventListener('close', restoreModal);
    element.showModal();
    return () => {
      element.removeEventListener('cancel', preventDismissal);
      element.removeEventListener('close', restoreModal);
      element.close();
    };
  }, []);

  return (
    <dialog ref={dialog} className="db-growth-dialog" aria-label={label}>
      {children}
    </dialog>
  );
}

function GrowthCard({ card, faceDelay = false }: { card: CardInstance; faceDelay?: boolean }) {
  const def = getCardDefinition(card.defId);
  const stats = getCardStats(card);
  return (
    <span className={`db-growth-card db-growth-card--lv${card.level}${faceDelay ? ' db-growth-card--reveal' : ''}`}>
      <span className="db-growth-card__meta">
        <span>Lv.{card.level}</span><span>{stats.cost} EN</span>
      </span>
      <CardArtwork defId={def.id} kind={def.kind} rarity={def.rarity} level={card.level} branchId={card.branchId} />
      <strong className="db-growth-card__name">{stats.name}</strong>
      <span className="db-growth-card__effect"><EffectText text={stats.text} /></span>
    </span>
  );
}

function GrowthFlight({
  before, after, source, evolution = false,
}: LevelUpPresentation & { evolution?: boolean }) {
  const flight = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = flight.current;
    // 親のダイアログがトップレイヤーへ移ってから、表示倍率込みの座標を測る。
    const frame = requestAnimationFrame(() => {
      if (!node || !source) return;
      const anchor = node.parentElement;
      if (!anchor) return;
      const target = anchor.getBoundingClientRect();
      const scale = target.width / anchor.offsetWidth;
      if (!scale) return;
      node.style.setProperty('--flight-x', `${(source.x + source.width / 2 - target.x - target.width / 2) / scale}px`);
      node.style.setProperty('--flight-y', `${(source.y + source.height / 2 - target.y - target.height / 2) / scale}px`);
    });
    return () => cancelAnimationFrame(frame);
  }, [source]);

  return (
    <div className={`db-growth-flight-anchor${evolution ? ' db-growth-flight-anchor--evolution' : ''}`} aria-hidden="true">
      {evolution && <span className="db-growth-flight__original"><GrowthCard card={before} /></span>}
      <div className="db-growth-flight" ref={flight}>
        {!evolution && <span className="db-growth-flight__old"><GrowthCard card={before} /></span>}
        <GrowthCard card={after} faceDelay />
      </div>
      <span className="db-growth-burst">
        {PARTICLES.map((style, i) => <i key={i} style={style} />)}
      </span>
    </div>
  );
}

function StatsComparison({
  before,
  after,
  evolution = false,
}: Pick<LevelUpPresentation, 'before' | 'after'> & { evolution?: boolean }) {
  const previous = getCardStats(before);
  const next = getCardStats(after);
  const nameChanged = previous.name !== next.name;
  const costDown = next.cost < previous.cost;
  return (
    <div className={`db-growth-compare${evolution ? ' db-growth-compare--evo' : ''}`}>
      <div className="db-growth-compare__box db-growth-compare__box--before">
        <div className="db-growth-compare__head">
          <span className="db-growth-compare__pill db-growth-compare__pill--before">
            {evolution ? '進化前' : '強化前'}
          </span>
          <span className="db-growth-compare__lv">
            Lv.{before.level} · {previous.cost} EN
          </span>
        </div>
        {nameChanged && <div className="db-growth-compare__name">{previous.name}</div>}
        <div className="db-growth-compare__text"><EffectText text={previous.text} /></div>
      </div>

      <div className="db-growth-compare__arrow" aria-hidden="true">
        <span className="db-growth-compare__arrow-label">{evolution ? 'EVOLVE' : 'UP'}</span>
        <svg viewBox="0 0 48 28" className="db-growth-compare__arrow-svg">
          <path d="M4 14 H36 M27 5 L38 14 L27 23" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="db-growth-compare__box db-growth-compare__box--after">
        <div className="db-growth-compare__head">
          <span className="db-growth-compare__pill db-growth-compare__pill--after">
            {evolution ? 'EVOLVED!' : 'POWER UP!'}
          </span>
          <span className="db-growth-compare__lv">
            Lv.{after.level} · {next.cost} EN
            {costDown && <span className="db-growth-compare__cost-down">COST DOWN</span>}
          </span>
        </div>
        {nameChanged && <div className="db-growth-compare__name db-growth-compare__name--after">{next.name}</div>}
        <div className="db-growth-compare__text"><EffectText text={next.text} /></div>
      </div>
    </div>
  );
}

function LevelUpStep({ upgrade, onNext, onSkip, remaining }: {
  upgrade: LevelUpPresentation; onNext: () => void; onSkip: () => void; remaining: number;
}) {
  const [ready, setReady] = useState(() => window.matchMedia(REDUCED_MOTION).matches);
  const completed = useRef(false);
  const skipButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    skipButton.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setReady(true), FLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, []);
  const finish = (callback: () => void) => {
    if (completed.current) return;
    completed.current = true;
    callback();
  };
  return (
    <section className="db-growth-content">
      <h2 className="db-growth-title">LEVEL UP!</h2>
      <p className="db-growth-sub">{getCardStats(upgrade.after).name} <strong>Lv.1 → Lv.2</strong></p>
      <GrowthFlight {...upgrade} />
      <StatsComparison {...upgrade} />
      <div className="db-growth-actions">
        <button ref={skipButton} type="button" className="db-btn db-btn--ghost" onClick={() => finish(onSkip)}>強化演出をスキップ</button>
        <button type="button" className="db-btn" disabled={!ready} onClick={() => finish(onNext)}>
          {remaining > 1 ? `次のカード（残り${remaining - 1}枚）` : '続ける'}
        </button>
      </div>
    </section>
  );
}

export function LevelUpOverlay({ queue, onNext, onSkip }: {
  queue: LevelUpPresentation[]; onNext: () => void; onSkip: () => void;
}) {
  const upgrade = queue[0];
  return (
    <GrowthDialog label="カード強化">
      <LevelUpStep key={upgrade.before.uid} upgrade={upgrade} remaining={queue.length} onNext={onNext} onSkip={onSkip} />
    </GrowthDialog>
  );
}

type EvolutionChoice = LevelUpPresentation & { branchId: string };

function EvolutionComplete({ choice, onComplete }: { choice: EvolutionChoice; onComplete: () => void }) {
  const completed = useRef(false);
  const skipButton = useRef<HTMLButtonElement>(null);
  useEffect(() => skipButton.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (completed.current) return;
      completed.current = true;
      onComplete();
    }, window.matchMedia(REDUCED_MOTION).matches ? 2200 : EVOLUTION_MS);
    return () => window.clearTimeout(timer);
  }, [onComplete]);
  return (
    <section className="db-growth-content db-growth-content--complete">
      <h2 className="db-growth-title">EVOLUTION COMPLETE</h2>
      <GrowthFlight {...choice} evolution />
      <p className="db-growth-sub">
        {getCardStats(choice.before).name} <strong className="db-growth-sub__arrow">➜</strong> <strong>{getCardStats(choice.after).name}</strong>
      </p>
      <StatsComparison {...choice} evolution />
      <div className="db-growth-actions">
        <button ref={skipButton} type="button" className="db-btn db-btn--ghost" onClick={() => {
          if (completed.current) return;
          completed.current = true;
          onComplete();
        }}>進化演出をスキップ</button>
      </div>
    </section>
  );
}

export function EvolutionOverlay({ cards, onChoose, onOpenDeck, children }: {
  cards: CardInstance[];
  onChoose: (uid: string, branchId: string) => void;
  onOpenDeck: () => void;
  children?: ReactNode;
}) {
  const groups = [...new Set(cards.map((card) => card.defId))].map((defId) => ({
    defId, cards: cards.filter((card) => card.defId === defId),
  }));
  const [selectedDefId, setSelectedDefId] = useState(groups[0].defId);
  const [choice, setChoice] = useState<EvolutionChoice | null>(null);
  const selectionLocked = useRef(false);
  const selection = useRef<HTMLElement>(null);
  const deckButton = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    if (selection.current) selection.current.inert = Boolean(children);
    if (!children && !choice) deckButton.current?.focus({ preventScroll: true });
  }, [children, choice]);
  const group = groups.find((item) => item.defId === selectedDefId) ?? groups[0];
  const card = group.cards[0];
  const def = getCardDefinition(card.defId);
  const before = { ...card, level: 2 as const };

  return (
    <GrowthDialog label="分岐進化">
      {choice ? (
        <EvolutionComplete choice={choice} onComplete={() => {
          onChoose(choice.before.uid, choice.branchId);
          setChoice(null);
          selectionLocked.current = false;
        }} />
      ) : (
        <section ref={selection} className="db-growth-content db-growth-content--evolve">
          <h2 className="db-growth-title">EVOLUTION READY</h2>
          <p className="db-growth-sub">Lv.3 到達 · 進化先を選択（残り{cards.length}枚）</p>
          <div className="db-growth-actions">
            {groups.length > 1 && groups.map((item) => (
              <button key={item.defId} type="button" className="db-btn db-btn--ghost" aria-pressed={item === group}
                onClick={() => setSelectedDefId(item.defId)}>
                {getCardDefinition(item.defId).name} ×{item.cards.length}
              </button>
            ))}
            <button ref={deckButton} type="button" className="db-btn db-btn--ghost" onClick={onOpenDeck}>デッキを見る</button>
          </div>
          <div className="db-growth-branches" key={card.uid}>
            <div className="db-growth-original">
              <span className="db-growth-original__tag">進化前 (Lv.2)</span>
              <GrowthCard card={before} />
            </div>
            <div className="db-growth-branch-arrow db-growth-branch-arrow--left" aria-hidden="true">
              <span className="db-growth-branch-arrow__label">ROUTE A</span>
              <svg viewBox="0 0 46 28" className="db-growth-branch-arrow__svg">
                <path d="M42 14 H10 M19 5 L8 14 L19 23" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <div className="db-growth-branch-arrow db-growth-branch-arrow--right" aria-hidden="true">
              <span className="db-growth-branch-arrow__label">ROUTE B</span>
              <svg viewBox="0 0 46 28" className="db-growth-branch-arrow__svg">
                <path d="M4 14 H36 M27 5 L38 14 L27 23" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            {def.branches.map((branch, idx) => {
              const after = { ...card, branchId: branch.id };
              return (
                <button key={branch.id} type="button" className="db-growth-candidate" onClick={(event) => {
                  if (selectionLocked.current) return;
                  selectionLocked.current = true;
                  const source = event.currentTarget.querySelector('.db-growth-card')?.getBoundingClientRect();
                  playSound('click');
                  setChoice({ before, after, source, branchId: branch.id });
                }}>
                  <span className="db-growth-candidate__tag">進化候補 {idx === 0 ? 'A' : 'B'} (Lv.3)</span>
                  <GrowthCard card={after} />
                  <span className="db-growth-candidate__cta">▶ この進化にする</span>
                </button>
              );
            })}
          </div>
        </section>
      )}
      {children}
    </GrowthDialog>
  );
}
