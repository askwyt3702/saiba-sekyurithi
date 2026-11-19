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
import './DeckBattle.css';

type HubTab = 'codex' | 'weakness' | 'stats' | 'achievements';

interface DeckHubModalProps {
  onClose: () => void;
  initialTab?: HubTab;
}

export function DeckHubModal({ onClose, initialTab = 'codex' }: DeckHubModalProps) {
  const [tab, setTab] = useState<HubTab>(initialTab);
  const [profile, setProfile] = useState<DeckProfile>(() => loadDeckProfile());
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

  const onUnlockAllCodex = () => {
    playSound('extract');
    const updated = unlockAllCodexEntries(profile);
    setProfile(updated);
    saveDeckProfile(updated);
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
              図鑑・進化ツリー・弱点ノート復習・戦績・実績（次回開始コインボーナス: 🪙 {profile.bonusStartCoins} / {MAX_BONUS_START_COINS}）
            </p>
          </div>
          <button type="button" className="db-btn db-btn--ghost" onClick={onClose}>
            閉じる
          </button>
        </div>

        <div className="db-hub__tabs" role="tablist">
          <button type="button" className={`db-hub__tab ${tab === 'codex' ? 'db-hub__tab--active' : ''}`} onClick={() => setTab('codex')}>
            🎴 図鑑・進化 ({profile.seenCardIds.length}/{REWARD_CARD_IDS.length})
          </button>
          <button type="button" className={`db-hub__tab ${tab === 'weakness' ? 'db-hub__tab--active' : ''}`} onClick={() => setTab('weakness')}>
            📖 弱点ノート ({weaknessList.length})
          </button>
          <button type="button" className={`db-hub__tab ${tab === 'stats' ? 'db-hub__tab--active' : ''}`} onClick={() => setTab('stats')}>
            📊 戦績
          </button>
          <button type="button" className={`db-hub__tab ${tab === 'achievements' ? 'db-hub__tab--active' : ''}`} onClick={() => setTab('achievements')}>
            🏆 実績 ({profile.achievements.length}/{ACHIEVEMENTS.length})
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
                className={`db-btn db-fast-toggle ${allCodexUnlocked ? '' : 'db-fast-toggle--on'}`}
                disabled={allCodexUnlocked}
                onClick={onUnlockAllCodex}
                title="試作用: 全40種のカード・全Lv.3進化先・敵図鑑をすべて解放します"
              >
                {allCodexUnlocked ? '✔ 全カード図鑑解放済み' : '🧪 試用：全カード図鑑を埋める'}
              </button>
            </div>
            <div className="db-codex-grid">
              {REWARD_CARD_IDS.map((id) => {
                const def = CARD_DEFINITIONS[id];
                const seen = profile.seenCardIds.includes(id);
                return (
                  <div key={id} className={`db-codex-card ${seen ? '' : 'db-codex-card--locked'}`}>
                    <div className="db-codex-card__top">
                      <span>
                        {seen ? def.icon : '❓'} <strong>{seen ? def.name : '未発見のカード'}</strong>
                      </span>
                      <span className="db-muted">{def.rarity.toUpperCase()}</span>
                    </div>
                    {seen ? (
                      <>
                        <CardArtwork defId={def.id} kind={def.kind} rarity={def.rarity} level={2} />
                        <div className="db-muted" style={{ fontSize: 11 }}>
                          Lv.1: {def.levels[1].cost}EN / {def.levels[1].text}
                        </div>
                        <div className="db-muted" style={{ fontSize: 11 }}>
                          Lv.2: {def.levels[2].cost}EN / {def.levels[2].text}
                        </div>
                        <div className="db-codex-card__lore">{def.lore}</div>
                        <div className="db-codex-branches">
                          {def.branches.map((b) => {
                            const unlocked = profile.unlockedBranches.includes(b.id);
                            return (
                              <div key={b.id} className={`db-codex-branch ${unlocked ? 'db-codex-branch--open' : ''}`}>
                                <span>
                                  {unlocked ? `${b.icon ?? def.icon} ${b.name}` : '🔒 未進化ルート'}
                                </span>
                                <span className="db-muted">{unlocked ? `${b.cost}EN / ${b.text}` : 'Lv.3進化で解放'}</span>
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
                const seen = profile.seenEnemyIds.includes(enemy.id);
                return (
                  <div key={enemy.id} className="db-deck-pill">
                    <span>
                      {seen ? enemy.icon : '❓'} {seen ? enemy.name : '未遭遇'}
                    </span>
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
                  <h3 style={{ margin: '0 0 8px', color: '#67e8f9', fontSize: 14 }}>
                    {selectedChoiceId !== null ? activeReview.category : '弱点復習クイズ'}
                  </h3>
                  <p className="db-event-prompt">{activeReview.prompt}</p>
                  {activeReview.codeSnippet && <pre className="db-event-code">{activeReview.codeSnippet}</pre>}
                  <div className="db-event-choices">
                    {activeReview.choices.map((c) => {
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
                          ].join(' ')}
                        >
                          <div className="db-event-choice__title">{c.title}</div>
                          <div className="db-event-choice__desc">{c.description}</div>
                        </button>
                      );
                    })}
                  </div>
                  {selectedChoiceId && (
                    <div
                      className={`db-event-feedback ${
                        activeReview.choices.find((c) => c.id === selectedChoiceId)?.isCorrect
                          ? 'db-event-feedback--ok'
                          : 'db-event-feedback--ng'
                      }`}
                    >
                      <div className="db-event-feedback__badge">
                        {activeReview.choices.find((c) => c.id === selectedChoiceId)?.isCorrect
                          ? '✔ 復習クリア！次回ラン開始時に 🪙 解析コイン+1 を獲得しました'
                          : '✖ まだ不正解です。解説を確認して再挑戦できます'}
                      </div>
                      <p>{activeReview.choices.find((c) => c.id === selectedChoiceId)?.feedback}</p>
                      <p className="db-event-feedback__sub">
                        <strong>対策:</strong> {activeReview.defenseMeasure}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : weaknessList.length === 0 ? (
              <div className="db-muted" style={{ padding: 18, textAlign: 'center' }}>
                現在、弱点ノートに記録されたミス問題はありません！
                <br />
                イベントマスで間違えた問題があるとここに自動保存され、復習で正解すると次回ラン開始時の 🪙 解析コインが +1 されます。
              </div>
            ) : (
              <div className="db-xp-list">
                <div className="db-muted" style={{ marginBottom: 6 }}>
                  復習で正解するとノートから消え、次回ラン開始時に 🪙 解析コイン +1（最大 {MAX_BONUS_START_COINS} 枚）が付きます。
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
                        {ach.icon} <strong>{ach.title}</strong>
                      </span>
                      <span className={done ? 'db-xp-row__lv' : 'db-muted'}>{done ? '解除済 ✔' : '未解除'}</span>
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
