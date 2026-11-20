// カードの説明文や戦闘ログを、効果の種類ごとの部分に分ける(画面で色を変えるため)。
// 例:「8ダメージ＋過熱4」→「8ダメージ」(damage)・「＋」・「過熱4」(burn)
// 過熱・脆弱などの言葉には、意味の説明(glossary.ts)の名前も付ける(カーソルを合わせると説明を出すため)。
import { glossaryKeyFor, PLAIN_KEYWORD_PATTERN, type GlossaryKey } from './glossary';

export type EffectTextKind =
  | 'plain'
  | 'damage' // 敵へのダメージ
  | 'self' // 自分の HP が減る
  | 'block' // FW(ブロック)
  | 'heal' // 回復
  | 'draw' // カードを引く
  | 'energy' // 帯域
  | 'burn' // 過熱
  | 'debuff' // 脆弱
  | 'jam' // ジャミング
  | 'retaliate' // 反撃
  | 'buff' // 次の攻撃+N・倍率・2回発動など
  | 'num'; // そのほかの数字(目立たせるだけ)

export interface EffectTextPart {
  kind: EffectTextKind;
  text: string;
  /** 説明のある言葉なら、その名前 */
  help?: GlossaryKey;
}

// 先に書いたものから優先して当てる(「FW貫通5」はFWではなくダメージ、など)
const RULES: Array<[Exclude<EffectTextKind, 'plain'>, string]> = [
  ['self', 'HP[−-]\\d+'],
  ['heal', '(?:HP)?\\+?\\d+回復'],
  ['damage', '(?:FW)?貫通\\d+(?:ダメージ)?(?:[×x]\\d+)?'],
  ['block', 'FWで\\d+防いだ|FW[+＋]?\\d+(?:を得て)?'],
  ['burn', '過熱\\d+'],
  ['debuff', '脆弱\\d+T'],
  ['jam', '(?:ジャミング|ジャム)\\d+T'],
  ['retaliate', '反撃\\d+|\\d+反撃'],
  ['buff', '次の?攻撃[＋+]\\d+|攻撃力が?[＋+]\\d+|[×x]?\\d+(?:\\.\\d+)?倍|\\d+回発動'],
  ['energy', '帯域[＋+]?\\d+(?:回復)?|帯域\\s?[−-]\\d+|帯域が\\s?\\d+\\s?減|[−-]\\d+EN|\\d+EN'],
  ['draw', '\\d+枚引く|\\d+ドロー|ドロー[＋+]\\d+'],
  ['damage', '\\d+ダメージ(?:を\\d+回)?|敵全体に?\\d+(?:ダメージ)?(?:[×x]\\d+回?)?|全体\\d+|\\d+[×x]\\d+(?:回)?|[×x]\\d+回|さらに[＋+]\\d+'],
  ['num', '\\d+(?:\\.\\d+)?'],
];

const PATTERN = new RegExp(RULES.map(([, re], i) => `(?<k${i}>${re})`).join('|'), 'g');

export function splitEffectText(text: string): EffectTextPart[] {
  const parts: EffectTextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(PATTERN)) {
    const index = m.index ?? 0;
    if (index > last) parts.push(...splitPlain(text.slice(last, index)));
    const groupIndex = RULES.findIndex((_, i) => m.groups?.[`k${i}`] !== undefined);
    const help = glossaryKeyFor(m[0]);
    parts.push(help ? { kind: RULES[groupIndex][0], text: m[0], help } : { kind: RULES[groupIndex][0], text: m[0] });
    last = index + m[0].length;
  }
  if (last < text.length) parts.push(...splitPlain(text.slice(last)));
  return parts;
}

/** 数字を含まない部分から「毎ターン」「ノイズ」などの言葉を切り出す */
function splitPlain(text: string): EffectTextPart[] {
  const parts: EffectTextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(PLAIN_KEYWORD_PATTERN)) {
    const index = m.index ?? 0;
    const help = glossaryKeyFor(m[0]);
    if (!help) continue;
    if (index > last) parts.push({ kind: 'plain', text: text.slice(last, index) });
    parts.push({ kind: 'plain', text: m[0], help });
    last = index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'plain', text: text.slice(last) });
  return parts;
}
