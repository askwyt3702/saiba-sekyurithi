// 遊び方の説明画面。内容は game/deckbattle/howToPlay.ts。
import { useEffect, useState } from 'react';
import { buildHowToPlayPages } from '../../game/deckbattle/howToPlay';
import { playSound } from '../../game/sound/soundEffects';
import './HowToPlayModal.css';

interface HowToPlayModalProps {
  onClose: () => void;
}

export function HowToPlayModal({ onClose }: HowToPlayModalProps) {
  const [pages] = useState(buildHowToPlayPages);
  const [index, setIndex] = useState(0);
  const page = pages[index];
  const isLast = index === pages.length - 1;

  const go = (next: number) => {
    playSound('click');
    setIndex(Math.max(0, Math.min(pages.length - 1, next)));
  };

  // Esc で閉じる、左右キーでページを移る
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(pages.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pages.length]);

  return (
    <div className="htp-overlay" role="dialog" aria-modal="true" aria-labelledby="htp-title" onClick={onClose}>
      <div className="htp-box" onClick={(e) => e.stopPropagation()}>
        <header className="htp-head">
          <span className="htp-tag">HOW TO PLAY // 遊び方</span>
          <button type="button" className="htp-close" onClick={onClose} aria-label="遊び方を閉じる">
            ✕
          </button>
        </header>

        <nav className="htp-tabs" aria-label="遊び方のページ">
          {pages.map((p, i) => (
            <button
              key={p.title}
              type="button"
              className={`htp-tab ${i === index ? 'htp-tab--current' : ''}`}
              aria-current={i === index ? 'page' : undefined}
              onClick={() => go(i)}
            >
              <span aria-hidden="true">{p.icon}</span> {p.title}
            </button>
          ))}
        </nav>

        <section className="htp-body">
          <h2 id="htp-title" className="htp-title">
            <span aria-hidden="true">{page.icon}</span> {page.title}
          </h2>
          <p className="htp-lead">{page.lead}</p>
          <dl className={`htp-items ${page.items.length > 6 ? 'htp-items--compact' : ''}`}>
            {page.items.map((item) => (
              <div key={item.term} className="htp-item">
                <dt className="htp-term">{item.term}</dt>
                <dd className="htp-text">{item.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <footer className="htp-foot">
          <span className="htp-page">
            {index + 1} / {pages.length}
          </span>
          <div className="htp-actions">
            <button type="button" className="htp-btn htp-btn--ghost" onClick={() => go(index - 1)} disabled={index === 0}>
              ← 前へ
            </button>
            {isLast ? (
              <button type="button" className="htp-btn" onClick={onClose}>
                はじめる
              </button>
            ) : (
              <button type="button" className="htp-btn" onClick={() => go(index + 1)}>
                次へ →
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}
