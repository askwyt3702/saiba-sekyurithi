// カードや敵の説明に出てくる言葉の意味。
// 遊び方の「用語」ページと、カードの説明文の言葉にカーソルを合わせたときの説明で、同じ文を使う。
import { BURN_TURNS } from './battle';

export type GlossaryKey =
  | 'fw'
  | 'energy'
  | 'burn'
  | 'vulnerable'
  | 'jam'
  | 'retaliate'
  | 'pierce'
  | 'aoe'
  | 'nextAttack'
  | 'repeat'
  | 'persistent'
  | 'noise'
  | 'weakness'
  | 'combo';

export interface GlossaryEntry {
  term: string;
  text: string;
}

export const GLOSSARY: Record<GlossaryKey, GlossaryEntry> = {
  fw: { term: 'FW(ファイアウォール)', text: '敵の攻撃を先に受け止める壁。HPより先に減る。自分のターンの始めに0に戻る。' },
  energy: { term: '帯域', text: 'カードを使うためのコスト(EN)。毎ターンの始めに元の量に戻る。' },
  burn: { term: '過熱', text: `敵のターンの終わりにダメージ(FWを無視)。${BURN_TURNS}ターン続き、重ねると量が増える。` },
  vulnerable: { term: '脆弱', text: '敵が受けるダメージが1.5倍になる。「2T」なら2ターン続く。' },
  jam: { term: 'ジャミング', text: '敵の攻撃ダメージが30%下がる(予告の数字も下がる)。' },
  retaliate: { term: '反撃', text: '次に受ける攻撃1回で、攻撃してきた敵にダメージを返す。FWで全部防いでも発動する。' },
  pierce: { term: '貫通', text: '敵のFWを無視して、HPに直接ダメージを与える。' },
  aoe: { term: '全体', text: '生きている敵すべてに効く。' },
  nextAttack: { term: '次の攻撃+N', text: '次に使う攻撃カードのダメージが増える。使うまで残る。' },
  repeat: { term: '2回発動', text: '次に使う攻撃カードの効果が2回起きる。' },
  persistent: { term: '毎ターン(常駐効果)', text: 'その戦闘のあいだ、毎ターンの始めに効果が出る。戦闘が終わると消える。' },
  noise: { term: 'ノイズ', text: '敵が入れてくる使えないカード。手札をふさぐ。戦闘が終わると消える。' },
  weakness: { term: '弱点', text: '敵ごとに弱点(連撃・貫通・過熱・全体)がある。合う攻撃は1.5倍。狙うときに「WEAK ×1.5」と出る。' },
  combo: { term: '解析コンボ', text: '1ターンに1回、補助カードの後に攻撃カードを使うと帯域+1。' },
};

// 説明文の中から言葉を探すときの手がかり(先に書いたものから優先して当てる)
const KEYWORD_PATTERNS: Array<[GlossaryKey, RegExp]> = [
  ['pierce', /貫通/],
  ['burn', /過熱/],
  ['vulnerable', /脆弱/],
  ['jam', /ジャミング|ジャム/],
  ['retaliate', /反撃/],
  ['nextAttack', /次の?攻撃[＋+]/],
  ['repeat', /2回発動/],
  ['persistent', /毎ターン/],
  ['noise', /ノイズ/],
  ['weakness', /弱点/],
  ['combo', /解析コンボ/],
  ['aoe', /全体/],
  ['fw', /FW/],
  ['energy', /帯域|\dEN/],
];

/** 文の一部が、どの言葉の説明に当たるか(当たらなければ undefined) */
export function glossaryKeyFor(text: string): GlossaryKey | undefined {
  return KEYWORD_PATTERNS.find(([, re]) => re.test(text))?.[0];
}

/** 文に出てくる言葉を、重なりなく出てきた順に返す(カードのプレビューに説明を並べるため) */
export function findGlossaryKeys(text: string): GlossaryKey[] {
  const found: Array<{ key: GlossaryKey; index: number }> = [];
  for (const [key, re] of KEYWORD_PATTERNS) {
    const m = new RegExp(re.source, 'g').exec(text);
    if (m) found.push({ key, index: m.index });
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.key);
}

/** 言葉としてそのまま文中に出るもの(数字を含まないので色分けの対象にならない) */
export const PLAIN_KEYWORD_PATTERN = /毎ターン|ノイズ|弱点|解析コンボ|全体|貫通|過熱|脆弱|ジャミング|ジャム|反撃/g;
