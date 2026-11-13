import { useEffect, useState } from 'react';
import { getUiScale, UI_SCALE_EVENT } from './uiScale';

// 画面の拡大率を返す。ウィンドウの大きさが変わって倍率が変わると再描画される。
export function useUiScale(): number {
  const [scale, setScale] = useState(getUiScale);
  useEffect(() => {
    const update = () => setScale(getUiScale());
    window.addEventListener(UI_SCALE_EVENT, update);
    return () => window.removeEventListener(UI_SCALE_EVENT, update);
  }, []);
  return scale;
}
