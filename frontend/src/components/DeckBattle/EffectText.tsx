// カードの説明文や戦闘ログの中の数値を、効果の種類ごとに色分けして表示する。
// 分け方のルールは game/deckbattle/effectText.ts(テストもそちら)。
import { splitEffectText } from '../../game/deckbattle/effectText';

export function EffectText({ text }: { text: string }) {
  return (
    <>
      {splitEffectText(text).map((part, i) =>
        part.kind === 'plain' ? (
          <span key={i}>{part.text}</span>
        ) : (
          <span key={i} className={`fx-n fx-n--${part.kind}`}>
            {part.text}
          </span>
        ),
      )}
    </>
  );
}
