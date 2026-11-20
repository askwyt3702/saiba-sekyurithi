// 遊び方の説明(画面は components/DeckBattle/HowToPlayModal.tsx)。
// 数値はルールの定数から作るので、調整しても説明がずれない。
import type { GameIconName } from './icons';
import { DRAW_PER_TURN, ENERGY_PER_TURN, MAX_HAND_SIZE, BURN_TURNS } from './battle';
import { describeEnemyGroup } from './enemies';
import type { StorageLike } from './profile';
import {
  BATTLE_WIN_HEAL_RATIO,
  DEFAULT_RUN_NODES,
  MAX_BATTLE_XP,
  MAX_EVENT_STREAK,
  QUIZ_XP_REWARD,
  REST_HEAL_RATIO,
  RECON_COIN_DROP_RATE,
  STARTING_RECON_COINS,
  VULN_EVENT_FAIL_DAMAGE,
  XP_TO_LV2,
  XP_TO_LV3,
} from './run';
import { LOADOUT_DEFINITIONS, MAX_SECURITY_LEVEL } from './roguelike';
import { MAX_TOOLS } from './tools';
import type { RunNode } from './types';

export interface HowToPlayItem {
  /** 用語やアイコン(太字で出す) */
  term: string;
  text: string;
}

export interface HowToPlayPage {
  title: string;
  icon: GameIconName;
  lead: string;
  items: HowToPlayItem[];
}

export const HOW_TO_PLAY_SEEN_KEY = 'cyber_mystery_deck_how_to_play_seen_v1';

function describeNode(node: RunNode): string {
  if (node.kind === 'event') return node.eventId === 'vuln_check' ? 'クイズ(脆弱性診断)' : 'クイズ(パッチ適用)';
  if (node.kind === 'mystery') return 'ハプニング';
  if (node.kind === 'rest') return '休憩・保守';
  if (node.kind === 'shop') return '闇市';
  const label = describeEnemyGroup(node.enemyIds);
  if (node.kind === 'boss') return `ボス:${label}`;
  return node.eliteEnemyIds ? `戦闘:${label}(強敵ルートも選べる)` : `戦闘:${label}`;
}

export function buildHowToPlayPages(): HowToPlayPage[] {
  const route = DEFAULT_RUN_NODES.map((n, i) => `${i + 1}. ${describeNode(n)}`).join(' → ');
  const loadouts = Object.values(LOADOUT_DEFINITIONS);
  const hps = loadouts.map((l) => l.maxHp);
  const healPercent = Math.round(BATTLE_WIN_HEAL_RATIO * 100);
  return [
    {
      title: 'このゲームの目的',
      icon: 'target',
      lead: `侵入者(ハッカー)として${DEFAULT_RUN_NODES.length}つのマスを順番に進み、最後の監視AIを倒せばクリア。途中でHPが0になるとやり直し。`,
      items: [
        { term: 'マスの順番', text: route },
        { term: '初期ビルド', text: `ランを始める前に${loadouts.length}種類から選ぶ(${loadouts.map((l) => l.name).join('・')})。HP・デッキ・最初の常駐ツールが変わる。` },
        { term: 'HP(回線耐久)', text: `最大HPは初期ビルドで${Math.min(...hps)}〜${Math.max(...hps)}。次のマスにも引き継ぐ。通常の戦闘に勝つと最大HPの${healPercent}%回復する。` },
        { term: '高難度モード', text: `セキュリティLv.0〜${MAX_SECURITY_LEVEL}を選べる。Lvが上がるほど敵が強くなる(Lv.3以上は最大HP−10)。まずはLv.0から。` },
        { term: 'デッキ', text: '攻撃・防御・補助のカードの山。戦闘の報酬や闇市で、カードを足したり減らしたりできる。' },
        { term: '注意', text: 'ブラウザを読み込み直すと、ランは最初からになる(カード基地の記録は残る)。' },
      ],
    },
    {
      title: '戦闘の流れ',
      icon: 'battle',
      lead: '自分のターンにカードを使い、「ターン終了」を押すと敵が動く。これをくり返して、敵を全部倒せば勝ち。',
      items: [
        { term: '帯域(EN)', text: `カードを使うのに必要なエネルギー。毎ターン${ENERGY_PER_TURN}に戻り、余った分は次のターンに持ち越さない。カードの左上の数字が必要な帯域。` },
        { term: '手札', text: `毎ターン${DRAW_PER_TURN}枚引く(最大${MAX_HAND_SIZE}枚)。使わなかったカードはターン終了で捨て札へ。山札が尽きたら捨て札を混ぜて戻す。` },
        { term: '使い方', text: 'カードをクリックすると使う。敵が2体以上いるときは、攻撃カードを選んでから狙う敵をクリックする(Escでやめる)。' },
        { term: 'FW(ファイアウォール)', text: '受けるダメージを先に引いてくれる盾。次の自分のターンが始まると0に戻る。' },
        { term: '敵の予告', text: '敵の頭の上に、次のターンにすることが出る。攻撃 / FWを張る / 攻撃力アップ / 検知(次のターンの帯域−1) / ノイズを入れる。予告を見て、守るか攻めるかを決める。' },
      ],
    },
    {
      title: 'カードが育つ',
      icon: 'sprout',
      lead: 'このゲームのいちばんの特徴。カードは1枚ずつ経験値を持ち、使うほど強くなる。',
      items: [
        { term: '経験値', text: `戦闘で使った回数+1(勝ったとき)が入る。1回の戦闘で1枚あたり最大${MAX_BATTLE_XP}。` },
        { term: 'Lv.2', text: `経験値${XP_TO_LV2}で自動で強くなる。` },
        { term: 'Lv.3(進化)', text: `経験値${XP_TO_LV3}で、2〜3種類の進化先から1つを選ぶ。同じ名前のカードでも、別々の進化先にできる。` },
        { term: '報酬', text: '戦闘に勝つと、カード3枚から1枚をもらう・デッキのカードを1枚消す・スキップ、から選べる。' },
      ],
    },
    {
      title: '用語',
      icon: 'book',
      lead: 'カードや敵の説明に出てくる言葉。敵の下に出る印も同じ意味。',
      items: [
        { term: '弱点', text: '敵ごとに弱点(連撃・貫通・過熱・全体)がある。合う攻撃は1.5倍。狙うときに「WEAK ×1.5」と出る。' },
        { term: '脆弱', text: '敵が受けるダメージが1.5倍になる。「2T」なら2ターン続く。' },
        { term: 'ジャミング', text: '敵の攻撃ダメージが30%下がる(予告の数字も下がる)。' },
        { term: '過熱', text: `敵のターンの終わりにダメージ(FWを無視)。${BURN_TURNS}ターン続き、重ねると量が増える。` },
        { term: '反撃', text: '次に受ける攻撃1回で、攻撃してきた敵にダメージを返す。FWで全部防いでも発動する。' },
        { term: '貫通', text: '敵のFWを無視して、HPに直接ダメージを与える。' },
        { term: '次の攻撃+N', text: '次に使う攻撃カードのダメージが増える。使うまで残る。' },
        { term: '解析コンボ', text: '1ターンに1回、補助カードの後に攻撃カードを使うと帯域+1。' },
        { term: 'ノイズ', text: '敵が入れてくる使えないカード。手札をふさぐ。戦闘が終わると消える。' },
      ],
    },
    {
      title: 'イベント・コイン・ツール',
      icon: 'tools',
      lead: '戦闘以外のマスと、戦いを助ける道具。',
      items: [
        { term: 'クイズのマス', text: `セキュリティの3択クイズ。正解すると次の問題に挑める(最大${MAX_EVENT_STREAK}問)。正解するほど報酬が良くなる(1問目:経験値+${QUIZ_XP_REWARD} → 2問目:回復・カード追加・カード削除のどれか → 3問目:常駐ツールかレアカード)。脆弱性診断で間違えるとHP−${VULN_EVENT_FAIL_DAMAGE}。` },
        { term: '解析コイン', text: `${STARTING_RECON_COINS}枚で始まり、倒した敵から${Math.round(RECON_COIN_DROP_RATE * 100)}%で出る。クイズの「事前調査」(はずれの選択肢を1つ消す)と闇市で使う。` },
        { term: '闇市', text: 'コインで回復・使い捨てツール・カードの削除・常駐ツールと交換できるマス。' },
        { term: 'ハプニング', text: 'ランダムな出来事。HPを払って大きな見返りを狙うか、安全な方を選ぶ。' },
        { term: '休憩・保守', text: `道中とボスの直前にある整備マス。HPを最大の${Math.round(REST_HEAL_RATIO * 100)}%回復する・カードを1つ上のレベルにする・カードを1枚消す、から1つ選ぶ。` },
        { term: '使い捨てツール', text: `戦闘中に帯域0で使える道具(最大${MAX_TOOLS}個)。最初に「緊急パッチ」(HP回復)を1個持っている。` },
        { term: '常駐ツール', text: '手に入れると、その後の戦闘でずっと効く(毎ターンFW+3など)。' },
      ],
    },
    {
      title: 'カード基地と記録',
      icon: 'layers',
      lead: 'ランをやり直しても残る記録。ミッション選択画面から開く。',
      items: [
        { term: 'カード基地', text: '図鑑(出会ったカード・敵)、弱点ノート(間違えたクイズの復習)、戦績、実績が見られる。' },
        { term: '弱点ノート', text: '間違えたクイズを復習して正解すると、次のランの開始時に解析コインが増える。' },
        { term: 'プレイヤー登録', text: '名前を登録すると、カード基地の記録がサーバーにも保存される(パスワードは使わない)。登録しなくても遊べる。' },
        { term: '試用高速成長', text: '試作用の設定。ONにすると経験値が多く入り、すぐ進化を試せる。普段はOFF。' },
      ],
    },
  ];
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** 遊び方をもう見たか(初めて戦闘画面を開いたときだけ自動で出すため) */
export function hasSeenHowToPlay(storage: StorageLike | null = browserStorage()): boolean {
  try {
    return storage?.getItem(HOW_TO_PLAY_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markHowToPlaySeen(storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(HOW_TO_PLAY_SEEN_KEY, '1');
  } catch {
    // 保存できない環境では、毎回出るだけなので無視する
  }
}
