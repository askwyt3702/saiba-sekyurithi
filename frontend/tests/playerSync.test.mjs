// カード基地をバックエンドに保存する仕組み(game/deckbattle/api.ts・playerSync.ts)のテスト。
// 本物のサーバーの代わりに、docs/api-contract.md と同じ動きをする偽物の fetch を使う。
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const cache = new Map();

function load(url) {
  const key = url.href;
  if (cache.has(key)) return cache.get(key);
  const module = { exports: {} };
  cache.set(key, module.exports);
  const { outputText } = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const localRequire = (id) => {
    if (id.startsWith('.')) {
      const target = new URL(id + '.ts', url);
      if (!existsSync(target)) target.pathname += 'x';
      return load(target);
    }
    return require(id);
  };
  runInNewContext('(function(require,module,exports){' + outputText + '\n})', { console, JSON, Promise, Error, encodeURIComponent })(
    localRequire,
    module,
    module.exports,
  );
  return module.exports;
}

const api = load(new URL('../src/game/deckbattle/api.ts', import.meta.url));
const sync = load(new URL('../src/game/deckbattle/playerSync.ts', import.meta.url));
const profileMod = load(new URL('../src/game/deckbattle/profile.ts', import.meta.url));

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), map };
}

/** docs/api-contract.md どおりに動く偽物のサーバー */
function fakeServer() {
  const players = new Map();
  let nextId = 1;
  const server = {
    players,
    down: false,
    requests: [],
    async fetch(url, init = {}) {
      server.requests.push(`${init.method ?? 'GET'} ${url}`);
      if (server.down) throw new TypeError('Failed to fetch');
      const path = url.replace('http://api.test', '');
      const body = init.body ? JSON.parse(init.body) : null;
      const json = (status, data) => ({ ok: status < 400, status, json: async () => data });
      if (init.method === 'POST' && path === '/api/players') {
        const name = String(body.name).trim();
        if (!name || name.length > 20) return json(422, { detail: 'invalid' });
        const player = { playerId: `p-${nextId++}`, name, profile: body.profile ?? profileMod.createEmptyProfile() };
        players.set(player.playerId, player);
        return json(201, player);
      }
      const m = path.match(/^\/api\/players\/([^/]+)(\/profile)?$/);
      const player = m && players.get(decodeURIComponent(m[1]));
      if (!player) return json(404, { detail: 'player_not_found' });
      if (init.method === 'PUT' && m[2]) {
        player.profile = body.profile;
        return json(200, player);
      }
      return json(200, player);
    },
  };
  return server;
}

function setup({ storage = memoryStorage(), server = fakeServer() } = {}) {
  const ps = sync.createPlayerSync({ api: { base: 'http://api.test', fetchImpl: server.fetch }, storage });
  // 画面と同じく、カード基地の保存をサーバーへの保存につなぐ
  profileMod.setProfileSaveListener((p) => ps.onProfileSaved(p));
  return { ps, storage, server };
}

test('toProfileBody は余分な項目を落とし、数値と開始コインを範囲に収める', () => {
  const body = api.toProfileBody({
    ...profileMod.createEmptyProfile(),
    bonusStartCoins: 9,
    stats: { runsPlayed: 2.7, runsWon: -1, extra: 5 },
    seenCardIds: ['a', '', 3],
    oldField: true,
  });
  assert.equal(body.bonusStartCoins, 3);
  assert.equal(body.stats.runsPlayed, 2);
  assert.equal(body.stats.runsWon, 0);
  assert.equal(body.stats.extra, undefined);
  assert.equal(body.oldField, undefined);
  assert.equal(body.seenCardIds.join(','), 'a');
});

test('未登録ならサーバーへは何も送らず、ブラウザだけに保存する', async () => {
  const { ps, storage, server } = setup();
  await ps.start();
  assert.equal(ps.getState().status, 'unregistered');
  profileMod.saveDeckProfile({ ...profileMod.createEmptyProfile(), bonusStartCoins: 1 }, storage);
  await ps.idle();
  assert.equal(server.requests.length, 0);
  assert.equal(profileMod.loadDeckProfile(storage).bonusStartCoins, 1);
});

test('登録すると、それまでブラウザで遊んだ分をサーバーに送り、ID を覚える', async () => {
  const storage = memoryStorage();
  const { ps, server } = setup({ storage });
  profileMod.saveDeckProfile({ ...profileMod.createEmptyProfile(), stats: { ...profileMod.createEmptyProfile().stats, runsWon: 4 } }, storage);
  await ps.register('  高橋 ');
  const state = ps.getState();
  assert.equal(state.status, 'synced');
  assert.equal(state.player.name, '高橋');
  assert.equal(server.players.get(state.player.playerId).profile.stats.runsWon, 4);
  assert.ok(storage.getItem(sync.PLAYER_STORAGE_KEY).includes(state.player.playerId));
});

test('登録済みなら、保存するたびにサーバーへ送り、最後の内容が残る', async () => {
  const { ps, storage, server } = setup();
  await ps.register('suge');
  const id = ps.getState().player.playerId;
  for (let i = 1; i <= 5; i++) {
    profileMod.saveDeckProfile({ ...profileMod.createEmptyProfile(), stats: { ...profileMod.createEmptyProfile().stats, runsPlayed: i } }, storage);
  }
  await ps.idle();
  assert.equal(server.players.get(id).profile.stats.runsPlayed, 5);
  assert.equal(ps.getState().status, 'synced');
  assert.equal(storage.getItem(sync.SYNC_PENDING_KEY), '0');
  // 途中の内容をまとめて送るので、5回分すべては送らない
  assert.ok(server.requests.filter((r) => r.startsWith('PUT')).length <= 2);
});

test('起動時はサーバーの内容をブラウザに写す(別のブラウザで遊んだ分が見える)', async () => {
  const server = fakeServer();
  const first = setup({ server });
  await first.ps.register('yuma');
  const id = first.ps.getState().player.playerId;
  server.players.get(id).profile = { ...profileMod.createEmptyProfile(), achievements: ['first_clear'] };

  const storage = memoryStorage({ [sync.PLAYER_STORAGE_KEY]: JSON.stringify({ playerId: id, name: 'yuma' }) });
  const second = setup({ storage, server });
  assert.equal(second.ps.getState().status, 'connecting');
  await second.ps.start();
  assert.equal(second.ps.getState().status, 'synced');
  assert.equal(profileMod.loadDeckProfile(storage).achievements.join(','), 'first_clear');
  // 読み込んだだけなので、サーバーへ送り返さない
  assert.equal(server.requests.filter((r) => r.startsWith('PUT')).length, 0);
});

test('サーバーが止まっていたらオフラインになり、つながったら送れていない分を先に送る', async () => {
  const server = fakeServer();
  const storage = memoryStorage();
  const { ps } = setup({ storage, server });
  await ps.register('takahashi');
  const id = ps.getState().player.playerId;

  server.down = true;
  profileMod.saveDeckProfile({ ...profileMod.createEmptyProfile(), wrongQuestionIds: ['q-7'] }, storage);
  await ps.idle();
  assert.equal(ps.getState().status, 'offline');
  assert.equal(storage.getItem(sync.SYNC_PENDING_KEY), '1');
  assert.equal(server.players.get(id).profile.wrongQuestionIds.length, 0);

  // 次に起動したとき:サーバーの古い内容で上書きせず、ブラウザの分を送る
  server.down = false;
  const again = setup({ storage, server });
  await again.ps.start();
  assert.equal(again.ps.getState().status, 'synced');
  assert.equal(server.players.get(id).profile.wrongQuestionIds.join(','), 'q-7');
  assert.equal(profileMod.loadDeckProfile(storage).wrongQuestionIds.join(','), 'q-7');
});

test('サーバーにプレイヤーがいなければ未登録に戻り、ブラウザの分は残す', async () => {
  const storage = memoryStorage({ [sync.PLAYER_STORAGE_KEY]: JSON.stringify({ playerId: 'gone', name: 'old' }) });
  profileMod.saveDeckProfile({ ...profileMod.createEmptyProfile(), bonusStartCoins: 2 }, storage, { silent: true });
  const { ps } = setup({ storage });
  await ps.start();
  assert.equal(ps.getState().status, 'unregistered');
  assert.equal(ps.getState().player, null);
  assert.equal(profileMod.loadDeckProfile(storage).bonusStartCoins, 2);
});

test('登録の失敗は ApiError で知らせる(つながらない=0、名前が不正=422)', async () => {
  const server = fakeServer();
  const { ps } = setup({ server });
  await assert.rejects(() => ps.register('x'.repeat(21)), (e) => e.status === 422);
  server.down = true;
  await assert.rejects(() => ps.register('ok'), (e) => e.status === 0);
  assert.equal(ps.getState().status, 'unregistered');
});
