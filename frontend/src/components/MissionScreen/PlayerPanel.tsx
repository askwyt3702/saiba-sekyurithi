// ミッション選択画面の右上:プレイヤー名とサーバーへの保存の状態、名前の登録。
import { useState, type FormEvent } from 'react';
import { ApiError, MAX_PLAYER_NAME_LENGTH } from '../../game/deckbattle/api';
import { playerSync } from '../../game/deckbattle/defaultPlayerSync';
import type { SyncStatus } from '../../game/deckbattle/playerSync';
import { playSound } from '../../game/sound/soundEffects';
import { usePlayerSync } from '../DeckBattle/usePlayerSync';

const STATUS_LABEL: Record<SyncStatus, string> = {
  unregistered: 'ブラウザだけに保存中',
  connecting: 'サーバーに接続中…',
  synced: 'サーバーに保存済み',
  saving: 'サーバーに保存中…',
  offline: 'サーバーにつながりません(ブラウザに保存し、つながったら送ります)',
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 0) return 'サーバーにつながりません。docker compose up でバックエンドが動いているか確認してください。';
    if (error.status === 422) return `名前は1〜${MAX_PLAYER_NAME_LENGTH}文字で入力してください。`;
  }
  return '登録できませんでした。時間をおいてもう一度試してください。';
}

export function PlayerPanel() {
  const { player, status } = usePlayerSync();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError('名前を入力してください。');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await playerSync.register(trimmed);
      playSound('extract');
      setOpen(false);
    } catch (err) {
      playSound('alert');
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {player ? (
        <span className={`ms-player ms-player--${status}`} title={STATUS_LABEL[status]}>
          <span className="ms-player__name">👤 {player.name}</span>
          <span className="ms-player__status">{status === 'synced' ? '☁ 保存済み' : status === 'offline' ? '⚠ オフライン' : '…'}</span>
        </span>
      ) : (
        <button
          type="button"
          className="ms-player ms-player--register"
          title="名前を登録すると、カード基地(図鑑・弱点ノート・戦績・実績)がサーバーに保存されます"
          onClick={() => {
            playSound('click');
            setError(null);
            setOpen(true);
          }}
        >
          👤 プレイヤー登録
        </button>
      )}

      {open && (
        <div className="ms-modal" role="dialog" aria-modal="true" aria-labelledby="ms-register-title" onClick={() => !busy && setOpen(false)}>
          <form className="ms-modal__box" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
            <h2 id="ms-register-title" className="ms-modal__title">プレイヤー登録</h2>
            <p className="ms-modal__text">
              名前を登録すると、カード基地(図鑑・弱点ノート・戦績・実績)がサーバーに保存されます。今までこのブラウザで遊んだ分も引き継ぎます。パスワードは使わず、このブラウザが登録を覚えておきます。
            </p>
            <label className="ms-modal__label">
              名前(1〜{MAX_PLAYER_NAME_LENGTH}文字)
              <input
                className="ms-modal__input"
                value={name}
                maxLength={MAX_PLAYER_NAME_LENGTH}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                disabled={busy}
              />
            </label>
            {error && (
              <p className="ms-modal__error" role="alert">
                {error}
              </p>
            )}
            <div className="ms-modal__actions">
              <button type="button" className="ms-modal__btn ms-modal__btn--ghost" onClick={() => setOpen(false)} disabled={busy}>
                あとで
              </button>
              <button type="submit" className="ms-modal__btn" disabled={busy}>
                {busy ? '登録中…' : '登録する'}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
