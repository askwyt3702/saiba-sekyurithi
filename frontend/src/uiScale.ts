// 画面全体を、基準の大きさ(1280×720)で作ったデザインのまま拡大・縮小する。
// 倍率は「幅と高さのうち、きつい方」に合わせるので、文字やパネルの比率は崩れない。
// 縦横比が16:9と違う画面では、余った分だけレイアウトが広がる(黒い帯は出さず、マップなどが広く使える)。
//
// CSSでは、画面いっぱいの大きさに 100vh / 100vw ではなく var(--app-h) / var(--app-w) を使うこと。
// (#root に zoom がかかるため、100vh だと倍率の分だけはみ出す)

export const DESIGN_WIDTH = 1280;
export const DESIGN_HEIGHT = 720;
// 小さすぎると文字が読めず、大きすぎると間延びするので上下限を設ける
export const MIN_UI_SCALE = 0.75;
export const MAX_UI_SCALE = 2;

export function computeUiScale(viewportWidth: number, viewportHeight: number): number {
  const fit = Math.min(viewportWidth / DESIGN_WIDTH, viewportHeight / DESIGN_HEIGHT);
  return Math.min(MAX_UI_SCALE, Math.max(MIN_UI_SCALE, fit));
}

let currentScale = 1;

export function getUiScale(): number {
  return currentScale;
}

export const UI_SCALE_EVENT = 'uiscalechange';

function applyUiScale(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const previous = currentScale;
  currentScale = computeUiScale(width, height);
  const style = document.documentElement.style;
  style.setProperty('--ui-scale', String(currentScale));
  style.setProperty('--app-w', `${width / currentScale}px`);
  style.setProperty('--app-h', `${height / currentScale}px`);
  if (previous !== currentScale) window.dispatchEvent(new Event(UI_SCALE_EVENT));
}

export function startUiScaling(): void {
  applyUiScale();
  window.addEventListener('resize', applyUiScale);
}
