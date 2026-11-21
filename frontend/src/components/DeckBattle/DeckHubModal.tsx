// ホーム画面(ミッション選択)などから開く「カード基地」モーダル。
// 1. カード図鑑・進化ツリー / 2. 弱点ノート(復習クイズ) / 3. 戦績 / 4. 実績 をまとめて閲覧・操作できる。
import { useState } from 'react';
import type { DeckQuizQuestion } from '../../game/data/securityLearningData';
import { CARD_DEFINITIONS, REWARD_CARD_IDS } from '../../game/deckbattle/cards';
import { ENEMY_DEFINITIONS } from '../../game/deckbattle/enemies';
import {
  ACHIEVEMENTS,
  MAX_BONUS_START_COINS,
  type DeckProfile,
  getWeaknessQuestions,
  loadDeckProfile,
  resolveWeaknessReview,
  saveDeckProfile,
  unlockAllCodexEntries,
} from '../../game/deckbattle/profile';
import { playSound } from '../../game/sound/soundEffects';
import { CardArtwork } from './CardArtwork';
import { EnemyArtwork } from './EnemyArtwork';
import { GameIcon } from '../GameIcon/GameIcon';
import { CARD_KIND_ICON as KIND_ICON } from '../../game/deckbattle/icons';
import { EffectText } from './EffectText';
import './DeckBattle.css';
import './TerminalTheme.css';

type HubTab = 'codex' | 'weakness' | 'stats' | 'achievements';

interface DeckHubModalProps {
  onClose: () => void;
  initialTab?: HubTab;
}

export function DeckHubModal({ onClose, initialTab = 'codex' }: DeckHubModalProps) {
  const [tab, setTab] = useState<HubTab>(initialTab);
  const [profile, setProfile] = useState<DeckProfile>(() => loadDeckProfile());
  // 試作用:図鑑をすべて表示する(表示だけで、保存はしない)
  const [previewAllCodex, setPreviewAllCodex] = useState(false);
  const codexProfile = previewAllCodex ? unlockAllCodexEntries(profile) : profile;
  const [activeReview, setActiveReview] = useState<DeckQuizQuestion | null>(null);
  const [selectedChoiceId, setSelectedChoiceId] = useState<string | null>(null);

  const weaknessList = getWeaknessQuestions(profile.wrongQuestionIds);
  const winRate =
    profile.stats.runsPlayed > 0
      ? Math.round((profile.stats.runsWon / profile.stats.runsPlayed) * 100)
      : 0;

  const totalBranches = REWARD_CARD_IDS.reduce((acc, id) => acc + CARD_DEFINITIONS[id].branches.length, 0);
  const allEnemiesCount = Object.keys(ENEMY_DEFINITIONS).length;
  const allCodexUnlocked =
    profile.seenCardIds.length >= REWARD_CARD_IDS.length &&
    profile.unlockedBranches.length >= totalBranches &&
    profile.seenEnemyIds.length >= allEnemiesCount;

  const onTogglePreviewAll = () => {
    playSound('click');
    setPreviewAllCodex((v) => !v);
  };

  const onAnswerReview = (choiceId: string) => {
    if (!activeReview || selectedChoiceId) return;
    const choice = activeReview.choices.find((c) => c.id === choiceId);
    if (!choice) return;
    playSound(choice.isCorrect ? 'extract' : 'alert');
    setSelectedChoiceId(choiceId);
    if (choice.isCorrect) {
      const updated = resolveWeaknessReview(profile, activeReview.id, true);
      setProfile(updated);
      saveDeckProfile(updated);
    }
  };

  const openReview = (q: DeckQuizQuestion) => {
    playSound('click');
    setActiveReview(q);
    setSelectedChoiceId(null);
  };

  return (
    <div className="db-overlay" role="dialog" aria-modal="true" aria-label="カード基地" onClick={onClose}>
      <div className="db-result db-result--wide db-hub" onClick={(e) => e.stopPropagation()}>
        <div className="db-hub__head">
          <div>
            <div className="db-result__title" style={{ fontSize: 18 }}>
              DECK BREACH // カード基地
            </div>
            <p className="db-muted" style={{ margin: '2px 0 0' }}>
              図鑑・進化ツリー・弱点ノート復習・戦績・実績（次回開始コインボーナス: <GameIcon name="coin" /> {profile.bonusStartCoins} / {MAX_BONUS_START_COINS}）
            </p>
          </div>
          <button type="button" className="db-btn db-btn--ghost" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="db-hub__tabs" role="tablist">
          <button type="button" className={`db-hub__tab ${tab === 'codex' ? 'db-hub__tab--active' : ''}`} onClick={() => setTab('codex')}>
            <GameIcon name="layers" /> 図鑑・進化 ({profile.seenCardIds.length}/{REWARD_CARD_IDS.length})
          </button>
          <button type="button" className={`db-hub__tab ${tab === 'weakness' ? 'db-hub__tab--active' : ''}`} onClick={() => setTab('weakness')}>
            <GameIcon name="book" /> 弱点ノート ({weaknessList.length})
          </button>
          <button type="button" className={`db-hub__tab ${tab === 'stats' ? 'db-hub__tab--active' : ''}`} onClick={() => setTab('stats')}>
            <GameIcon name="stats" /> 戦績
          </button>
          <button type="button" className={`db-hub__tab ${tab === 'achievements' ? 'db-hub__tab--active' : ''}`} onClick={() => setTab('achievements')}>
            <GameIcon name="trophy" /> 実績 ({profile.achievements.length}/{ACHIEVEMENTS.length})
          </button>
        </div>

        {tab === 'codex' && (
          <div className="db-hub__body">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
                marginBottom: 8,
              }}
            >
              <div className="db-muted">
                進化解放数: {profile.unlockedBranches.length} / {totalBranches} 分岐
              </div>
              <button
                type="button"
                className={`db-btn db-fast-toggle ${previewAllCodex ? 'db-fast-toggle--on' : ''}`}
                disabled={allCodexUnlocked}
                onClick={onTogglePreviewAll}
                title="試作用: 全40種のカード・全Lv.3進化先・敵を表示します(記録には残りません)"
              >
                <GameIcon name={allCodexUnlocked ? 'check' : 'flask'} /> {allCodexUnlocked ? '全カード図鑑解放済み' : previewAllCodex ? '試用表示中(記録には残らない)' : '試用：全カード図鑑を表示'}
              </button>
            </div>
            <div className="db-codex-grid">
              {REWARD_CARD_IDS.map((id) => {
                const def = CARD_DEFINITIONS[id];
                const seen = codexProfile.seenCardIds.includes(id);
                return (
                  <div key={id} className={`db-codex-card ${seen ? '' : 'db-codex-card--locked'}`}>
                    <div className="db-codex-card__top">
                      <span>
                        <GameIcon name={seen ? KIND_ICON[def.kind] : 'unknown'} /> <strong>{seen ? def.name : '未発見のカード'}</strong>
                      </span>
                      <span className="db-muted">{def.rarity.toUpperCase()}</span>
                    </div>
                    {seen ? (
                      <>
                        <CardArtwork defId={def.id} kind={def.kind} rarity={def.rarity} level={2} />
                        <div className="db-muted" style={{ fontSize: 11 }}>
                          Lv.1: {def.levels[1].cost}EN / <EffectText text={def.levels[1].text} />
                        </div>
                        <div className="db-muted" style={{ fontSize: 11 }}>
                          Lv.2: {def.levels[2].cost}EN / <EffectText text={def.levels[2].text} />
                        </div>
                        <div className="db-codex-card__lore">{def.lore}</div>
                        <div className="db-codex-branches">
                          {def.branches.map((b) => {
                            const unlocked = codexProfile.unlockedBranches.includes(b.id);
                            return (
                              <div key={b.id} className={`db-codex-branch ${unlocked ? 'db-codex-branch--open' : ''}`}>
                                <span>
                                  <GameIcon name={unlocked ? 'evolve' : 'lock'} /> {unlocked ? b.name : '未進化ルート'}
                                </span>
                                <span className="db-muted">{unlocked ? <>{b.cost}EN / <EffectText text={b.text} /></> : 'Lv.3進化で解放'}</span>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <div className="db-muted" style={{ fontSize: 11, marginTop: 6 }}>
                        ラン中の報酬やイベントで入手すると図鑑に登録されます。
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <h3 className="db-hub__sub">遭遇した防御システム（敵図鑑）</h3>
            <div className="db-deck-grid">
              {Object.values(ENEMY_DEFINITIONS).map((enemy) => {
                const seen = codexProfile.seenEnemyIds.includes(enemy.id);
                return (
                  <div key={enemy.id} className="db-deck-pill">
                    <span>
                      <GameIcon name={seen ? enemy.icon : 'unknown'} /> {seen ? enemy.name : '未遭遇'}
                    </span>
                    {seen && <EnemyArtwork defId={enemy.id} compact />}
                    <span className="db-muted">{seen ? `最大HP ${enemy.maxHp}` : '戦闘で遭遇すると登録'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'weakness' && (
          <div className="db-hub__body">
            {activeReview ? (
              <div>
                <button type="button" className="db-btn db-btn--ghost" style={{ marginBottom: 10 }} onClick={() => setActiveReview(null)}>
                  ← 問題一覧に戻る
                </button>
                <div className="db-event-card" style={{ padding: 14 }}>
                  <div className="db-event-head">
                    <div className="db-event-head__left">
                      <span className="db-brand__tag">WEAKNESS REVIEW // 弱点復習</span>
                      {selectedChoiceId !== null && activeReview.mitreId && (
                        <span className="db-event-tag db-event-tag--attck">ATT&amp;CK: {activeReview.mitreId}</span>
                      )}
                      {selectedChoiceId !== null && activeReview.cweId && (
                        <span className="db-event-tag db-event-tag--cwe">{activeReview.cweId}</span>
                      )}
                    </div>
                  </div>
                  <h3 className="db-event-cat" style={{ fontSize: 15 }}>
                    {selectedChoiceId !== null ? activeReview.category : '弱点復習クイズ // 状況と選択肢から正しいものを特定せよ'}
                  </h3>
                  {activeReview.scanTerminalLog && (
                    <div className="db-event-scanlog">{activeReview.scanTerminalLog}</div>
                  )}
                  <p className="db-event-prompt">&gt; {activeReview.prompt}</p>
                  {activeReview.codeSnippet && <pre className="db-event-code">{activeReview.codeSnippet}</pre>}
                  <div className="db-event-choices" role="radiogroup" aria-label="弱点復習クイズの選択肢">
                    {activeReview.choices.map((c, idx) => {
                      const picked = selectedChoiceId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={selectedChoiceId !== null}
                          onClick={() => onAnswerReview(c.id)}
                          className={[
                            'db-event-choice',
                            picked && c.isCorrect ? 'db-event-choice--ok' : '',
                            picked && !c.isCorrect ? 'db-event-choice--ng' : '',
                            selectedChoiceId && c.isCorrect ? 'db-event-choice--reveal-ok' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <div className="db-event-choice__head">
                            <div className="db-event-choice__title">
                              [{idx + 1}] {c.title}
                            </div>
                            {selectedChoiceId !== null && c.isCorrect && (
                              <span className="db-event-choice__badge db-event-choice__badge--ok"><GameIcon name="check" /> 正解</span>
                            )}
                            {picked && !c.isCorrect && (
                              <span className="db-event-choice__badge db-event-choice__badge--ng"><GameIcon name="cross" /> 選択した回答</span>
                            )}
                          </div>
                          {c.command && <code className="db-event-choice__cmd">{c.command}</code>}
                          <div className="db-event-choice__desc">{c.description}</div>
                        </button>
                      );
                    })}
                  </div>
                  {selectedChoiceId && (() => {
                    const pickedChoice = activeReview.choices.find((c) => c.id === selectedChoiceId);
                    const correctChoice = activeReview.choices.find((c) => c.isCorrect);
                    const isReviewOk = Boolean(pickedChoice?.isCorrect);
                    return (
                      <div className={`db-event-feedback ${isReviewOk ? 'db-event-feedback--ok' : 'db-event-feedback--ng'}`}>
                        <div className="db-event-feedback__badge">
                          {isReviewOk
                            ? <><GameIcon name="check" /> 復習クリア！次回ラン開始時に解析コイン+1 を獲得しました</>
                            : <><GameIcon name="cross" /> まだ不正解です。解説を確認して再挑戦できます</>}
                        </div>
                        <p>{pickedChoice?.feedback}</p>
                        {!isReviewOk && correctChoice && (
                          <div className="db-event-feedback__correct-box">
                            <strong><GameIcon name="hint" /> 正解の選択肢：「{correctChoice.title}」</strong>
                            <p style={{ margin: '4px 0 0' }}>{correctChoice.feedback}</p>
                          </div>
                        )}
                        <p className="db-event-feedback__sub">
                          <strong>なぜ危険か:</strong> {activeReview.whyDangerous}
                        </p>
                        <p className="db-event-feedback__sub">
                          <strong>{activeReview.defenseMeasure}</strong>
                        </p>
                        <div className="db-result__actions" style={{ marginTop: 10 }}>
                          {!isReviewOk && (
                            <button type="button" className="db-btn db-btn--end" onClick={() => setSelectedChoiceId(null)}>
                              もう一度この問題に挑戦する
                            </button>
                          )}
                          <button type="button" className="db-btn db-btn--ghost" onClick={() => setActiveReview(null)}>
                            問題一覧に戻る
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : weaknessList.length === 0 ? (
              <div className="db-muted" style={{ padding: 18, textAlign: 'center' }}>
                現在、弱点ノートに記録されたミス問題はありません！
                <br />
                イベントマスで間違えた問題があるとここに自動保存され、復習で正解すると次回ラン開始時の解析コインが +1 されます。
              </div>
            ) : (
              <div className="db-xp-list">
                <div className="db-muted" style={{ marginBottom: 6 }}>
                  復習で正解するとノートから消え、次回ラン開始時に解析コイン +1（最大 {MAX_BONUS_START_COINS} 枚）が付きます。
                </div>
                {weaknessList.map((q) => (
                  <div key={q.id} className="db-xp-row">
                    <div>
                      <div style={{ fontWeight: 700 }}>{q.category}</div>
                      <div className="db-muted" style={{ fontSize: 11 }}>
                        {q.prompt}
                      </div>
                    </div>
                    <button type="button" className="db-btn db-btn--end" onClick={() => openReview(q)}>
                      復習する
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'stats' && (
          <div className="db-hub__body">
            <div className="db-stats-grid">
              <div className="db-stat-box">
                <span className="db-muted">総挑戦回数</span>
                <strong>{profile.stats.runsPlayed} 回</strong>
              </div>
              <div className="db-stat-box">
                <span className="db-muted">クリア回数 (ARGUS撃破)</span>
                <strong>
                  {profile.stats.runsWon} 回 ({winRate}%)
                </strong>
              </div>
              <div className="db-stat-box">
                <span className="db-muted">エリート撃破数</span>
                <strong>{profile.stats.elitesDefeated} 回</strong>
              </div>
              <div className="db-stat-box">
                <span className="db-muted">イベント最大連続正解</span>
                <strong>{profile.stats.maxEventStreak} 問</strong>
              </div>
              <div className="db-stat-box">
                <span className="db-muted">クイズ累計正解</span>
                <strong>{profile.stats.totalQuizCorrect} 問</strong>
              </div>
              <div className="db-stat-box">
                <span className="db-muted">弱点ノート復習クリア</span>
                <strong>{profile.stats.reviewsCleared} 問</strong>
              </div>
            </div>
          </div>
        )}

        {tab === 'achievements' && (
          <div className="db-hub__body">
            <div className="db-codex-grid">
              {ACHIEVEMENTS.map((ach) => {
                const done = profile.achievements.includes(ach.id);
                return (
                  <div key={ach.id} className={`db-codex-card ${done ? 'db-codex-branch--open' : 'db-codex-card--locked'}`}>
                    <div className="db-codex-card__top">
                      <span>
                        <GameIcon name={ach.icon} /> <strong>{ach.title}</strong>
                      </span>
                      <span className={done ? 'db-xp-row__lv' : 'db-muted'}>{done ? <>解除済 <GameIcon name="check" /></> : '未解除'}</span>
                    </div>
                    <div className="db-muted" style={{ fontSize: 11, marginTop: 4 }}>
                      {ach.description}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
