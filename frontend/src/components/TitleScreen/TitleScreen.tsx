import { useEffect, useRef } from 'react';
import './TitleScreen.css';

interface TitleScreenProps {
  onStart: () => void;
}

// 文字雨に使うキャラクター（16進数 + カタカナ）
const CHARS =
  '0123456789ABCDEF' +
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '{}[]<>/\\|;:!?@#$%^&*';

// 画面端に表示する不穏なアラートメッセージ
const ALERTS = [
  'INTRUSION DETECTED',
  'FIREWALL BYPASSED',
  'ROOT ACCESS GRANTED',
  'DECRYPTING...',
  'TRACE ROUTE: ACTIVE',
  'DATA EXFILTRATION',
  'BACKDOOR INSTALLED',
  'CREDENTIALS STOLEN',
  'KERNEL EXPLOIT: OK',
  'ANOMALY DETECTED',
  'SYSTEM COMPROMISED',
  'PACKET INTERCEPT',
];

function HackBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
      init();
    };

    // ---- 文字雨 ----
    const COL_SIZE = 18;
    type Column = {
      x: number;
      y: number;
      speed: number;
      chars: string[];
      isRed: boolean;   // 赤い感染カラム
      dim: number;      // 透明度係数
    };
    let cols: Column[] = [];

    const init = () => {
      cols = [];
      const colCount = Math.floor(canvas.width / COL_SIZE);
      for (let i = 0; i < colCount; i++) {
        cols.push({
          x: i * COL_SIZE,
          y: Math.random() * -canvas.height,
          speed: Math.random() * 1.2 + 0.4,
          chars: Array.from({ length: 30 }, () =>
            CHARS[Math.floor(Math.random() * CHARS.length)]
          ),
          isRed: Math.random() < 0.08,   // 8%の列が赤（感染）
          dim: Math.random() * 0.5 + 0.3,
        });
      }
    };

    // ---- パルスリング ----
    type Ring = { x: number; y: number; r: number; maxR: number; alpha: number; isRed: boolean };
    const rings: Ring[] = [];
    let ringTimer = 0;

    const spawnRing = () => {
      // たまに赤いリング（侵入アラート）
      const isRed = Math.random() < 0.25;
      rings.push({
        x: canvas.width  * (0.3 + Math.random() * 0.4),
        y: canvas.height * (0.2 + Math.random() * 0.6),
        r: 0,
        maxR: 180 + Math.random() * 120,
        alpha: 0.6,
        isRed,
      });
    };

    // 初期化
    init();
    for (let i = 0; i < 3; i++) spawnRing();

    let frame = 0;
    let animId: number;

    const draw = () => {
      animId = requestAnimationFrame(draw);
      frame++;
      // 30fps で動かす（軽量化）
      if (frame % 2 !== 0) return;

      // 半透明でクリア（残像効果）
      ctx.fillStyle = 'rgba(0, 8, 3, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${COL_SIZE - 2}px monospace`;

      for (const col of cols) {
        col.y += col.speed * COL_SIZE * 0.18;
        if (col.y > canvas.height + 200) {
          col.y = -COL_SIZE * (5 + Math.random() * 20);
          col.isRed = Math.random() < 0.08;
        }

        // ランダムに文字を更新
        if (Math.random() < 0.08) {
          const idx = Math.floor(Math.random() * col.chars.length);
          col.chars[idx] = CHARS[Math.floor(Math.random() * CHARS.length)];
        }

        const count = Math.floor(col.y / COL_SIZE);
        for (let k = 0; k < col.chars.length; k++) {
          const ky = count - k;
          if (ky < 0 || ky * COL_SIZE > canvas.height) continue;

          if (col.isRed) {
            // 感染カラム：赤グラデーション
            if (k === 0) {
              ctx.fillStyle = `rgba(255,80,80,${col.dim})`;
            } else {
              const fade = Math.max(0, 1 - k / col.chars.length);
              ctx.fillStyle = `rgba(160,0,0,${fade * col.dim * 0.7})`;
            }
          } else {
            // 通常カラム：緑グラデーション
            if (k === 0) {
              ctx.fillStyle = `rgba(180,255,180,${col.dim})`;  // 先頭は明るく
            } else {
              const fade = Math.max(0, 1 - k / col.chars.length);
              ctx.fillStyle = `rgba(0,${Math.floor(120 + fade * 100)},40,${fade * col.dim * 0.6})`;
            }
          }
          ctx.fillText(col.chars[k], col.x, ky * COL_SIZE);
        }
      }

      // パルスリング
      ringTimer++;
      if (ringTimer > 90) {
        ringTimer = 0;
        if (rings.length < 6) spawnRing();
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.r += 1.5;
        ring.alpha = (1 - ring.r / ring.maxR) * 0.5;
        if (ring.alpha <= 0) { rings.splice(i, 1); continue; }

        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, Math.PI * 2);
        if (ring.isRed) {
          ctx.strokeStyle = `rgba(220,30,30,${ring.alpha})`;
        } else {
          ctx.strokeStyle = `rgba(0,220,80,${ring.alpha})`;
        }
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    };

    draw();
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="ts-canvas" />;
}

// 画面端に点滅するアラートテキスト
function AlertOverlay() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // 位置プリセット（4隅 + 左右中央）
    const positions = [
      { top: '8%',  left: '1%'   },
      { top: '8%',  right: '1%'  },
      { top: '82%', left: '1%'   },
      { top: '82%', right: '1%'  },
      { top: '45%', left: '0.5%' },
      { top: '45%', right: '0.5%'},
    ];

    const spans: HTMLSpanElement[] = positions.map((pos, i) => {
      const s = document.createElement('span');
      s.className = 'ts-alert-txt';
      s.textContent = ALERTS[i % ALERTS.length];
      Object.assign(s.style, pos, { position: 'absolute' });
      el.appendChild(s);
      return s;
    });

    // ランダムにテキストを入れ替えて点滅させる
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * spans.length);
      spans[idx].textContent = ALERTS[Math.floor(Math.random() * ALERTS.length)];
      spans[idx].classList.remove('ts-alert-flash');
      void spans[idx].offsetWidth; // reflow
      spans[idx].classList.add('ts-alert-flash');
    }, 1200);

    return () => clearInterval(interval);
  }, []);

  return <div ref={ref} className="ts-alerts" />;
}

export function TitleScreen({ onStart }: TitleScreenProps) {
  return (
    <main className="ts-root">
      {/* 文字雨 + パルスリング */}
      <HackBackground />

      {/* 暗いオーバーレイ（中央を少し見やすく） */}
      <div className="ts-vignette" />

      {/* 画面端の不穏なアラート */}
      <AlertOverlay />

      {/* 中央パネル */}
      <div className="ts-center">
        <div className="ts-panel">
          <p className="ts-label">CYBER MYSTERY PROJECT</p>

          <h1 className="ts-title">
            <span className="ts-t-null">NULL</span>
            <span className="ts-t-route"> ROUTE</span>
          </h1>

          <div className="ts-divider" />
          <p className="ts-subtitle">— CYBER MYSTERY GAME —</p>

          <div className="ts-menu">
            <button className="ts-btn-start" onClick={onStart}>
              ▶&nbsp;&nbsp;START GAME
            </button>
            <button className="ts-btn-setting">
              ⚙&nbsp;&nbsp;SETTING
            </button>
          </div>

          <p className="ts-ver">v1.0.0 // NULL_ROUTE_SYS</p>
        </div>
      </div>
    </main>
  );
}
