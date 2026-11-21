// 絵文字の代わりに使う、線の太さと形をそろえたアイコン。
// 色は文字の色(currentColor)、大きさは文字の大きさ(1em)に合わせるので、文章の中にそのまま置ける。
import { createElement } from 'react';
import type { GameIconName } from '../../game/deckbattle/icons';
import { GAME_ICON_SHAPES } from './gameIconShapes';
import './GameIcon.css';

interface GameIconProps {
  name: GameIconName;
  /** 読み上げる名前。飾りなら省略する(読み上げない) */
  label?: string;
  className?: string;
}

export function GameIcon({ name, label, className }: GameIconProps) {
  return (
    <svg
      className={`game-icon${className ? ` ${className}` : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="square"
      strokeLinejoin="miter"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {GAME_ICON_SHAPES[name].map(([tag, attrs], index) => createElement(tag, { key: index, ...attrs }))}
    </svg>
  );
}
