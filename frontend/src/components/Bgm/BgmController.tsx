import { useEffect } from 'react';
import { bgm, bgmIntensity, isBgmEnabled } from '../../game/sound/bgm';

interface BgmControllerProps {
  /** BGM を鳴らす場面か(プレイ中だけ true にする) */
  active: boolean;
  alertLevel: number;
}

// 画面には何も表示しない。プレイ中は BGM を鳴らし、警戒度に合わせて緊張感を変える。
export function BgmController({ active, alertLevel }: BgmControllerProps) {
  const intensity = bgmIntensity(alertLevel);

  useEffect(() => {
    if (!active || !isBgmEnabled()) return;
    bgm.start();
    return () => bgm.stop();
  }, [active]);

  useEffect(() => {
    bgm.setIntensity(intensity);
  }, [intensity]);

  return null;
}
