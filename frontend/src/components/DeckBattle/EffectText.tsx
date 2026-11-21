// カードの説明文や戦闘ログの中の数値を、効果の種類ごとに色分けして表示する。
// 過熱・脆弱などの言葉は点線の下線を付け、カーソルを合わせると意味を出す。
// 分け方のルールは game/deckbattle/effectText.ts、言葉の意味は game/deckbattle/glossary.ts(テストもそちら)。
import { splitEffectText } from '../../game/deckbattle/effectText';
import { findGlossaryKeys, GLOSSARY } from '../../game/deckbattle/glossary';

export function EffectText({ text }: { text: string }) {
  return (
    <>
      {splitEffectText(text).map((part, i) => {
        const help = part.help ? GLOSSARY[part.help] : undefined;
        const className = [part.kind === 'plain' ? '' : `fx-n fx-n--${part.kind}`, help ? 'fx-help' : '']
          .filter(Boolean)
          .join(' ');
        return (
          <span key={i} className={className || undefined} title={help ? `${help.term}:${help.text}` : undefined}>
            {part.text}
          </span>
        );
      })}
    </>
  );
}

/** 文に出てくる言葉の意味をまとめて並べる(カードを大きく表示したときに下に出す) */
export function GlossaryList({ text }: { text: string }) {
  const keys = findGlossaryKeys(text);
  if (keys.length === 0) return null;
  return (
    <dl className="db-glossary">
      {keys.map((key) => (
        <div key={key} className="db-glossary__item">
          <dt>{GLOSSARY[key].term}</dt>
          <dd>{GLOSSARY[key].text}</dd>
        </div>
      ))}
    </dl>
  );
}
