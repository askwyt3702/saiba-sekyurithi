// 画面幅がこれより狭いときは、ツールパネルを折りたたんだ状態で始める。
// (左のツールパネル 260px と右の詳細パネルに挟まれて、マップが狭くなりすぎるため)
export const TOOL_PANEL_COLLAPSE_WIDTH = 1100;

export function startsCollapsed(viewportWidth: number | undefined): boolean {
  return viewportWidth !== undefined && viewportWidth < TOOL_PANEL_COLLAPSE_WIDTH;
}

export function currentViewportWidth(): number | undefined {
  return typeof window === 'undefined' ? undefined : window.innerWidth;
}
