import { useCallback, useLayoutEffect, useRef, useState } from 'react';

export const CARD_TRAVEL_MS = 210;
export const CARD_DISCARD_MS = 180;
const DRAW_MS = 235;
const DRAW_INTERVAL_MS = 42;

export function reduceBattleMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function centerOffset(from: DOMRect, to: DOMRect, scale: number) {
  return {
    x: (to.left + to.width / 2 - from.left - from.width / 2) / scale,
    y: (to.top + to.height / 2 - from.top - from.height / 2) / scale,
  };
}

function mountGhost(overlay: HTMLElement, origin: HTMLElement, stage: DOMRect, source: DOMRect, scale: number) {
  const ghost = document.createElement('div');
  ghost.className = `${origin.className} db-card-flight`;
  ghost.append(...Array.from(origin.childNodes, (node) => node.cloneNode(true)));
  Object.assign(ghost.style, {
    left: `${(source.left - stage.left) / scale}px`,
    top: `${(source.top - stage.top) / scale}px`,
    width: `${source.width / scale}px`,
    height: `${source.height / scale}px`,
  });
  overlay.append(ghost);
  return ghost;
}

export function useBattleMotion(hand: string[], turn: number, battleKey: string, visible: boolean) {
  const layer = useRef<HTMLDivElement>(null);
  const flight = useRef<{ card: HTMLElement; arrival: string } | null>(null);
  const draws = useRef<Animation[]>([]);
  const drawGhosts = useRef<HTMLElement[]>([]);
  const drawLocked = useRef(false);
  const skipNextDraw = useRef(false);
  const [drawing, setDrawing] = useState(false);
  const previous = useRef({ hand: [] as string[], turn, battleKey: '', visible: false });

  const launch = useCallback((uid: string, target: string) => {
    const overlay = layer.current;
    const field = overlay?.parentElement;
    const origin = field?.querySelector<HTMLElement>(`.db-hand [data-growth-card="${CSS.escape(uid)}"]`);
    const destination = field?.querySelector(`[data-battle-anchor="${CSS.escape(target)}"]`);
    if (!overlay || !origin || !destination || reduceBattleMotion()) return;
    const stage = overlay.getBoundingClientRect();
    const scale = stage.width / overlay.offsetWidth;
    if (!scale) return;
    const source = origin.getBoundingClientRect();
    const { x, y } = centerOffset(source, destination.getBoundingClientRect(), scale);
    const card = mountGhost(overlay, origin, stage, source, scale);
    const arrival = `translate(${x}px, ${y}px) scale(.58)`;
    flight.current = { card, arrival };
    card.animate([
      { transform: 'translate(0, 0) scale(1)' },
      { transform: 'translate(0, -20px) scale(1.09)', offset: .25 },
      { transform: arrival },
    ], { duration: CARD_TRAVEL_MS, easing: 'cubic-bezier(.22,.7,.26,1)', fill: 'forwards' });
  }, []);

  const discard = useCallback(() => {
    const overlay = layer.current;
    const current = flight.current;
    const destination = overlay?.parentElement?.querySelector('[data-battle-anchor="discard"]');
    if (!overlay || !current || !destination) return;
    const { card, arrival } = current;
    const scale = overlay.getBoundingClientRect().width / overlay.offsetWidth;
    if (!scale) return;
    const { x, y } = centerOffset(card.getBoundingClientRect(), destination.getBoundingClientRect(), scale);
    const animation = card.animate([
      { transform: `translate(0, 0) ${arrival}` },
      { transform: `translate(${x}px, ${y}px) ${arrival} scale(.38)`, opacity: 0 },
    ], { duration: CARD_DISCARD_MS, easing: 'ease-in', fill: 'forwards' });
    animation.onfinish = () => {
      card.remove();
      if (flight.current === current) flight.current = null;
    };
  }, []);

  const clearDraws = useCallback(() => {
    for (const draw of draws.current) draw.cancel();
    for (const ghost of drawGhosts.current) ghost.remove();
    draws.current = [];
    drawGhosts.current = [];
    drawLocked.current = false;
  }, []);

  const clear = useCallback((skipDraw = false) => {
    flight.current?.card.remove();
    flight.current = null;
    clearDraws();
    skipNextDraw.current = skipDraw;
    setDrawing(false);
  }, [clearDraws]);

  useLayoutEffect(() => {
    const old = previous.current;
    previous.current = { hand, turn, battleKey, visible };
    if (skipNextDraw.current) {
      skipNextDraw.current = false;
      return;
    }
    const overlay = layer.current;
    const field = overlay?.parentElement;
    const pile = field?.querySelector('[data-battle-anchor="draw"]');
    const handArea = field?.querySelector('.db-hand')?.getBoundingClientRect();
    if (!visible || !overlay || !pile || !handArea || reduceBattleMotion()) return;
    const stage = overlay.getBoundingClientRect();
    const scale = stage.width / overlay.offsetWidth;
    if (!scale) return;
    const fresh = turn !== old.turn || battleKey !== old.battleKey || !old.visible ? hand : hand.filter((uid) => !old.hand.includes(uid));
    if (!fresh.length) return;
    const origin = pile.getBoundingClientRect();
    const destinations = fresh.flatMap((uid, index) => {
      const card = field?.querySelector<HTMLElement>(`.db-hand [data-growth-card="${CSS.escape(uid)}"]`);
      if (!card) return [];
      const destination = card.getBoundingClientRect();
      if (destination.left < handArea.left - 1 || destination.right > handArea.right + 1) return [];
      return [{ card, destination, delay: index * DRAW_INTERVAL_MS }];
    });
    const ghosts: HTMLElement[] = [];
    const animations = destinations.flatMap(({ card, destination, delay }) => {
      const { x, y } = centerOffset(destination, origin, scale);
      const ghost = mountGhost(overlay, card, stage, destination, scale);
      ghosts.push(ghost);
      const slide = ghost.animate([
        { transform: `translate(${x}px, ${y}px) scale(.33)`, opacity: 0 },
        { transform: `translate(${x}px, ${y}px) scale(.38)`, opacity: 1, offset: .1 },
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      ], { duration: DRAW_MS, delay, easing: 'cubic-bezier(.2,.6,.3,1)', fill: 'backwards' });
      slide.onfinish = () => ghost.remove();
      const land = card.animate([
        { opacity: 0, scale: '1' },
        { opacity: 1, scale: '1.06', offset: .02 },
        { opacity: 1, scale: '1' },
      ], { duration: 110, delay: delay + DRAW_MS, easing: 'ease-out', fill: 'backwards' });
      return [slide, land];
    });
    if (!animations.length) return;
    draws.current = animations;
    drawGhosts.current = ghosts;
    drawLocked.current = true;
    setDrawing(true);
    void Promise.allSettled(animations.map((animation) => animation.finished)).then(() => {
      if (draws.current !== animations) return;
      draws.current = [];
      drawGhosts.current = [];
      drawLocked.current = false;
      setDrawing(false);
    });
  }, [hand, turn, battleKey, visible]);

  useLayoutEffect(() => () => {
    flight.current?.card.remove();
    clearDraws();
  }, [clearDraws]);

  const isDrawing = useCallback(() => drawLocked.current, []);
  return { layer, launch, discard, clear, drawing, isDrawing };
}
