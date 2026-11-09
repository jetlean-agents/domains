import type { FastifyInstance } from "fastify";
import { pool } from "../db/client.js";
import { verifyToken } from "../auth/tokens.js";
import { config } from "../config.js";

export function registerUiRoutes(app: FastifyInstance): void {
  app.get("/login", async (req, reply) => {
    reply.type("text/html").send(LOGIN_HTML);
  });

  app.post("/login", async (req, reply) => {
    const body = req.body as { token?: string };
    const token = body.token ?? "";
    const ok = await verifyToken(pool, token);
    if (!ok) {
      return reply.code(401).send({ error: "invalid_token" });
    }
    reply.setCookie("token", token, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: config.cookieSecure,
    });
    return reply.send({ ok: true });
  });

  app.get("/", async (req, reply) => {
    const token = (req.cookies as Record<string, string> | undefined)?.token ?? "";
    const ok = await verifyToken(pool, token);
    if (!ok) return reply.redirect("/login");
    reply.type("text/html").send(APP_HTML);
  });

  app.get("/drops", async (req, reply) => {
    const token = (req.cookies as Record<string, string> | undefined)?.token ?? "";
    const ok = await verifyToken(pool, token);
    if (!ok) return reply.redirect("/login");
    reply.type("text/html").send(DROPS_HTML);
  });

  app.get("/admin/tokens", async (req, reply) => {
    const token = (req.cookies as Record<string, string> | undefined)?.token ?? "";
    const ok = await verifyToken(pool, token);
    if (!ok) return reply.redirect("/login");
    reply.type("text/html").send(ADMIN_TOKENS_HTML);
  });

  app.get("/domains/:domain", async (req, reply) => {
    const token = (req.cookies as Record<string, string> | undefined)?.token ?? "";
    const ok = await verifyToken(pool, token);
    if (!ok) return reply.redirect("/login");
    reply.type("text/html").send(DOMAIN_HTML);
  });

  app.get("/watchlist", async (req, reply) => {
    const token = (req.cookies as Record<string, string> | undefined)?.token ?? "";
    const ok = await verifyToken(pool, token);
    if (!ok) return reply.redirect("/login");
    reply.type("text/html").send(WATCHLIST_HTML);
  });
}

const LOGIN_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>JetLean Domains — вход</title>
<style>
  body { font-family: system-ui, sans-serif; display: flex; min-height: 100vh; align-items: center; justify-content: center; background: #0f1115; color: #e6e6e6; }
  form { background: #1a1d24; padding: 2rem; border-radius: 8px; width: 320px; }
  input { width: 100%; padding: .6rem; margin: .5rem 0; border-radius: 4px; border: 1px solid #333; background: #0f1115; color: #fff; box-sizing: border-box; }
  button { width: 100%; padding: .6rem; border-radius: 4px; border: none; background: #4f7cff; color: #fff; cursor: pointer; }
  .error { color: #ff6b6b; }
</style></head>
<body>
<form id="login-form">
  <h2>JetLean Domains</h2>
  <input type="password" name="token" placeholder="Service token" required autofocus>
  <button type="submit">Войти</button>
</form>
<script>
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const token = e.target.elements.token.value;
  const res = await fetch('/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (res.ok) {
    location.href = '/';
  } else {
    document.querySelector('form').insertAdjacentHTML('afterbegin', '<p class="error">Неверный токен</p>');
  }
});
</script>
</body></html>`;

const APP_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>JetLean Domains</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f1115; color: #e6e6e6; }
  header { padding: 1rem 2rem; border-bottom: 1px solid #222; }
  main { padding: 1rem; max-width: 960px; box-sizing: border-box; }
  @media (min-width: 640px) { main { padding: 1rem 2rem; } }
  textarea { width: 100%; min-height: 120px; background: #1a1d24; color: #fff; border: 1px solid #333; border-radius: 4px; padding: .6rem; box-sizing: border-box; font-family: monospace; }
  button { padding: .6rem 1.2rem; border-radius: 4px; border: none; background: #4f7cff; color: #fff; cursor: pointer; margin-top: .6rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: .5rem; border-bottom: 1px solid #222; }
  .status { padding: .15rem .5rem; border-radius: 4px; font-size: .85rem; }
  .status-available { background: #1f3d2c; color: #5fd988; }
  .status-registered { background: #3d1f1f; color: #ff8787; }
  .status-pending_delete, .status-redemption { background: #3d3a1f; color: #e0d35f; }
  .status-unknown { background: #2a2a2a; color: #aaa; }
  .copy { cursor: pointer; color: #4f7cff; font-size: .8rem; }
  nav a { color: #9ab3ff; text-decoration: none; margin-right: 1rem; font-size: .9rem; }
</style></head>
<body>
<header><h2>JetLean Domains — проверка доступности</h2><nav><a href="/">Проверка</a><a href="/drops">Дропы</a><a href="/watchlist">Вотчлист</a><a href="/admin/tokens">Токены</a></nav></header>
<main>
  <textarea id="domains" placeholder="example.com&#10;example.com.ua&#10;example.de"></textarea>
  <br>
  <button id="check">Проверить</button>
  <span id="status"></span>
  <div style="overflow-x: auto;">
  <table id="results" hidden>
    <thead><tr><th>Домен</th><th>Статус</th><th>До</th><th>Регистратор</th><th>Источник</th></tr></thead>
    <tbody></tbody>
  </table>
  </div>
</main>
<script>
const el = (id) => document.getElementById(id);
el('check').addEventListener('click', async () => {
  const domains = el('domains').value.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean);
  if (!domains.length) return;
  el('status').textContent = 'Проверка...';
  const res = await fetch('/api/v1/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domains }),
  });
  if (res.status === 401) { location.href = '/login'; return; }
  const data = await res.json();
  el('status').textContent = '';
  const tbody = el('results').querySelector('tbody');
  tbody.innerHTML = '';
  for (const r of data.results ?? []) {
    const tr = document.createElement('tr');
    const expiry = r.expires_at ? new Date(r.expires_at).toLocaleDateString('ru-RU') : '—';
    tr.innerHTML = \`<td>\${r.domain}\${r.status === 'available' ? ' <span class="copy" data-domain="\${r.domain}">копировать</span>' : ''}</td>
      <td><span class="status status-\${r.status}">\${r.status}</span></td>
      <td>\${expiry}</td><td>\${r.registrar ?? '—'}</td><td>\${r.source}</td>\`;
    tbody.appendChild(tr);
  }
  el('results').hidden = false;
  tbody.querySelectorAll('.copy').forEach((btn) => {
    btn.addEventListener('click', () => navigator.clipboard.writeText(btn.dataset.domain));
  });
});
</script>
</body></html>`;

const DROPS_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>JetLean Domains — дропы</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f1115; color: #e6e6e6; }
  header { padding: 1rem 2rem; border-bottom: 1px solid #222; }
  nav a { color: #9ab3ff; text-decoration: none; margin-right: 1rem; font-size: .9rem; }
  main { padding: 1rem; max-width: 1100px; box-sizing: border-box; }
  @media (min-width: 640px) { main { padding: 1rem 2rem; } }
  .filters { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
  .filters input, .filters select { background: #1a1d24; color: #fff; border: 1px solid #333; border-radius: 4px; padding: .4rem; }
  .filters label { font-size: .8rem; color: #aaa; display: flex; align-items: center; gap: .3rem; }
  button { padding: .5rem 1rem; border-radius: 4px; border: none; background: #4f7cff; color: #fff; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: .9rem; }
  th, td { text-align: left; padding: .4rem; border-bottom: 1px solid #222; }
  .toolbar { display: flex; gap: .5rem; align-items: center; margin-top: .5rem; }
</style></head>
<body>
<header><h2>JetLean Domains</h2><nav><a href="/">Проверка</a><a href="/drops">Дропы</a><a href="/watchlist">Вотчлист</a><a href="/admin/tokens">Токены</a></nav></header>
<main>
  <div class="filters">
    <input id="f-tld" placeholder="TLD (com, ua...)">
    <select id="f-source"><option value="">Источник (любой)</option><option value="zone_diff">zone_diff</option><option value="csv:expireddomains">csv:expireddomains</option><option value="csv:godaddy">csv:godaddy</option><option value="csv:dynadot">csv:dynadot</option><option value="csv:generic">csv:generic</option><option value="rdap_watch">rdap_watch</option></select>
    <input id="f-since" type="date">
    <input id="f-q" placeholder="поиск по домену">
    <input id="f-minlen" type="number" placeholder="мин. длина" style="width:7rem">
    <input id="f-maxlen" type="number" placeholder="макс. длина" style="width:7rem">
    <label><input id="f-nodigits" type="checkbox"> без цифр</label>
    <label><input id="f-nohyphens" type="checkbox"> без дефисов</label>
    <select id="f-niche"><option value="">Ниша (любая)</option><option value="auto">auto</option><option value="energy">energy</option><option value="news">news</option><option value="deals_us">deals_us</option><option value="other">other</option><option value="none">none</option></select>
    <input id="f-minscore" type="number" placeholder="мин. балл" style="width:7rem">
    <input id="f-minage" type="number" placeholder="мин. возраст (лет)" style="width:9rem">
    <label><input id="f-sortscore" type="checkbox"> сортировать по баллу</label>
    <button id="apply">Фильтровать</button>
    <a href="#" id="export">Экспорт CSV</a>
  </div>
  <div class="toolbar">
    <button id="check">Проверить доступность (выбранные)</button>
    <button id="evaluate">Оценить (выбранные)</button>
    <button id="watch">В вотчлист (выбранные)</button>
    <input id="csv-file" type="file" accept=".csv">
    <button id="upload">Загрузить CSV</button>
    <span id="status"></span>
  </div>
  <table id="results">
    <thead><tr><th><input id="select-all" type="checkbox"></th><th>Домен</th><th>TLD</th><th>Источник</th><th>Дата дропа</th><th>Статус</th><th>Балл</th><th>Ниша</th><th>Возраст</th></tr></thead>
    <tbody></tbody>
  </table>
</main>
<script>
const el = (id) => document.getElementById(id);
function query() {
  const p = new URLSearchParams();
  if (el('f-tld').value) p.set('tld', el('f-tld').value);
  if (el('f-source').value) p.set('source', el('f-source').value);
  if (el('f-since').value) p.set('since', el('f-since').value);
  if (el('f-q').value) p.set('q', el('f-q').value);
  if (el('f-minlen').value) p.set('min_len', el('f-minlen').value);
  if (el('f-maxlen').value) p.set('max_len', el('f-maxlen').value);
  if (el('f-nodigits').checked) p.set('no_digits', '1');
  if (el('f-nohyphens').checked) p.set('no_hyphens', '1');
  if (el('f-niche').value) p.set('niche', el('f-niche').value);
  if (el('f-minscore').value) p.set('min_score', el('f-minscore').value);
  if (el('f-minage').value) p.set('min_age', el('f-minage').value);
  if (el('f-sortscore').checked) p.set('sort', 'score');
  return p;
}
async function load() {
  const res = await fetch('/api/v1/drops?' + query().toString());
  if (res.status === 401) { location.href = '/login'; return; }
  const data = await res.json();
  const tbody = el('results').querySelector('tbody');
  tbody.innerHTML = '';
  for (const r of data.results ?? []) {
    const tr = document.createElement('tr');
    tr.innerHTML = \`<td><input type="checkbox" class="row-select" data-domain="\${r.domain}" data-niche="\${r.niche ?? ''}"></td>
      <td><a href="/domains/\${r.domain}">\${r.domain}</a></td><td>\${r.tld}</td><td>\${r.source}</td>
      <td>\${new Date(r.dropped_at).toLocaleDateString('ru-RU')}</td>
      <td>\${r.current_status ?? '—'}</td>
      <td>\${r.score ?? '—'}</td><td>\${r.niche ?? '—'}</td><td>\${r.age_years ?? '—'}</td>\`;
    tbody.appendChild(tr);
  }
}
el('apply').addEventListener('click', load);
el('evaluate').addEventListener('click', async () => {
  const domains = [...document.querySelectorAll('.row-select:checked')].map((cb) => cb.dataset.domain);
  if (!domains.length) return;
  el('status').textContent = 'Оценка запущена...';
  await fetch('/api/v1/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domains }),
  });
  el('status').textContent = 'Оценка запущена в фоне, обновите список через минуту';
});
el('watch').addEventListener('click', async () => {
  const rows = [...document.querySelectorAll('.row-select:checked')];
  if (!rows.length) return;
  el('status').textContent = 'Добавление в вотчлист...';
  for (const cb of rows) {
    await fetch('/api/v1/watchlist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: cb.dataset.domain, niche: cb.dataset.niche || undefined }),
    });
  }
  el('status').textContent = 'Добавлено в вотчлист';
});
el('export').addEventListener('click', (e) => {
  e.preventDefault();
  location.href = '/api/v1/drops/export.csv?' + query().toString();
});
el('select-all').addEventListener('change', (e) => {
  document.querySelectorAll('.row-select').forEach((cb) => { cb.checked = e.target.checked; });
});
el('check').addEventListener('click', async () => {
  const domains = [...document.querySelectorAll('.row-select:checked')].map((cb) => cb.dataset.domain);
  if (!domains.length) return;
  el('status').textContent = 'Проверка...';
  const q = query();
  q.set('check', '1');
  await fetch('/api/v1/drops?' + q.toString());
  el('status').textContent = '';
  await load();
});
el('upload').addEventListener('click', async () => {
  const file = el('csv-file').files[0];
  if (!file) return;
  const text = await file.text();
  el('status').textContent = 'Загрузка...';
  const res = await fetch('/api/v1/imports', {
    method: 'POST',
    headers: { 'content-type': 'text/csv' },
    body: text,
  });
  const data = await res.json();
  el('status').textContent = res.ok ? \`Импортировано: \${data.inserted}/\${data.rowCount}\` : 'Ошибка импорта';
  await load();
});
load();
</script>
</body></html>`;

const ADMIN_TOKENS_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>JetLean Domains — токены</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f1115; color: #e6e6e6; }
  header { padding: 1rem 2rem; border-bottom: 1px solid #222; }
  nav a { color: #9ab3ff; text-decoration: none; margin-right: 1rem; font-size: .9rem; }
  main { padding: 1rem 2rem; max-width: 720px; }
  input { background: #1a1d24; color: #fff; border: 1px solid #333; border-radius: 4px; padding: .5rem; margin: .3rem 0; width: 100%; box-sizing: border-box; }
  button { padding: .5rem 1rem; border-radius: 4px; border: none; background: #4f7cff; color: #fff; cursor: pointer; margin-top: .3rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: .4rem; border-bottom: 1px solid #222; }
  .hint { color: #aaa; font-size: .8rem; }
</style></head>
<body>
<header><h2>JetLean Domains</h2><nav><a href="/">Проверка</a><a href="/drops">Дропы</a><a href="/watchlist">Вотчлист</a><a href="/admin/tokens">Токены</a></nav></header>
<main>
  <p class="hint">Действия ниже требуют настоящий ADMIN_TOKEN (не cookie-сессию) — он передаётся только в заголовке каждого запроса, нигде не сохраняется.</p>
  <input id="admin-token" type="password" placeholder="ADMIN_TOKEN">
  <h3>Создать токен</h3>
  <input id="new-name" placeholder="имя токена">
  <label><input id="new-admin" type="checkbox"> admin</label>
  <button id="create">Создать</button>
  <pre id="created"></pre>
  <h3>Список токенов</h3>
  <button id="refresh">Обновить</button>
  <table id="tokens"><thead><tr><th>Имя</th><th>Admin</th><th>Создан</th><th>Отозван</th><th></th></tr></thead><tbody></tbody></table>
</main>
<script>
const el = (id) => document.getElementById(id);
function authHeaders() { return { authorization: 'Bearer ' + el('admin-token').value, 'content-type': 'application/json' }; }
async function refresh() {
  const res = await fetch('/api/v1/admin/tokens', { headers: authHeaders() });
  const data = await res.json();
  const tbody = el('tokens').querySelector('tbody');
  tbody.innerHTML = '';
  for (const t of data.tokens ?? []) {
    const tr = document.createElement('tr');
    tr.innerHTML = \`<td>\${t.name}</td><td>\${t.is_admin}</td><td>\${new Date(t.created_at).toLocaleString('ru-RU')}</td><td>\${t.revoked_at ?? '—'}</td>
      <td>\${t.revoked_at ? '' : '<button class="revoke" data-name="' + t.name + '">Отозвать</button>'}</td>\`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('.revoke').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch('/api/v1/admin/tokens', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ name: btn.dataset.name }) });
      refresh();
    });
  });
}
el('refresh').addEventListener('click', refresh);
el('create').addEventListener('click', async () => {
  const res = await fetch('/api/v1/admin/tokens', {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ name: el('new-name').value, admin: el('new-admin').checked }),
  });
  const data = await res.json();
  el('created').textContent = res.ok ? JSON.stringify(data, null, 2) : 'Ошибка: ' + JSON.stringify(data);
  refresh();
});
</script>
</body></html>`;

const DOMAIN_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>JetLean Domains — оценка домена</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f1115; color: #e6e6e6; }
  header { padding: 1rem 2rem; border-bottom: 1px solid #222; }
  nav a { color: #9ab3ff; text-decoration: none; margin-right: 1rem; font-size: .9rem; }
  main { padding: 1rem 2rem; max-width: 720px; }
  .score { font-size: 2.5rem; font-weight: bold; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
  th, td { text-align: left; padding: .4rem; border-bottom: 1px solid #222; }
  .flag { display: inline-block; padding: .15rem .5rem; border-radius: 4px; font-size: .8rem; margin-right: .3rem; background: #3d1f1f; color: #ff8787; }
  .hint { color: #aaa; font-size: .85rem; }
  button { padding: .5rem 1rem; border-radius: 4px; border: none; background: #4f7cff; color: #fff; cursor: pointer; margin-top: .6rem; }
  a.snap { color: #9ab3ff; }
</style></head>
<body>
<header><h2>JetLean Domains</h2><nav><a href="/">Проверка</a><a href="/drops">Дропы</a><a href="/watchlist">Вотчлист</a><a href="/admin/tokens">Токены</a></nav></header>
<main>
  <h3 id="domain-title"></h3>
  <div id="content"><p class="hint">Загрузка...</p></div>
  <button id="evaluate">Оценить / обновить оценку</button>
  <button id="watch">Хочу этот домен (в вотчлист)</button>
  <span id="watch-status" class="hint"></span>
</main>
<script>
const el = (id) => document.getElementById(id);
const domain = location.pathname.split('/').pop();
el('domain-title').textContent = domain;

function flagsHtml(flags) {
  if (!flags) return '';
  const labels = { spam: 'спам', topic_change: 'смена тематики', parked: 'парковка', no_history: 'нет истории' };
  return Object.entries(labels)
    .filter(([k]) => flags[k])
    .map(([, label]) => '<span class="flag">' + label + '</span>')
    .join('') || '<span class="hint">нет флагов</span>';
}

function waybackLinks(e) {
  if (!e.first_snapshot && !e.last_snapshot) return '<p class="hint">снимков Wayback не найдено</p>';
  const first = e.first_snapshot ? e.first_snapshot.replace(/[^0-9]/g, '').slice(0, 14) : null;
  const last = e.last_snapshot ? e.last_snapshot.replace(/[^0-9]/g, '').slice(0, 14) : null;
  const links = [];
  if (first) links.push('<a class="snap" target="_blank" href="https://web.archive.org/web/' + first + '/' + domain + '">первый снимок</a>');
  if (last) links.push('<a class="snap" target="_blank" href="https://web.archive.org/web/' + last + '/' + domain + '">последний снимок</a>');
  return '<p>' + links.join(' · ') + '</p>';
}

async function load() {
  const res = await fetch('/api/v1/evaluations?domain=' + encodeURIComponent(domain));
  if (res.status === 401) { location.href = '/login'; return; }
  const data = await res.json();
  const e = (data.results ?? [])[0];
  if (!e) {
    el('content').innerHTML = '<p class="hint">Оценки пока нет — нажмите «Оценить».</p>';
    return;
  }
  el('content').innerHTML = \`
    <div class="score">\${e.score} / 100\${e.partial ? ' <span class="hint">(частичная оценка)</span>' : ''}</div>
    <p>Ниша: <b>\${e.niche}</b> (уверенность \${Math.round(e.niche_confidence * 100)}%)</p>
    <p>Возраст: \${e.age_years ?? '—'} лет, снимков Wayback: \${e.snapshot_count}</p>
    <p>Флаги: \${flagsHtml(e.flags)}</p>
    \${waybackLinks(e)}
    <p>Ссылающихся страниц (оценка Common Crawl, метод: \${e.backlinks_method ?? '—'}): \${e.backlinks_estimate ?? '—'}</p>
    <table>
      <thead><tr><th>Компонент</th><th>Баллы</th></tr></thead>
      <tbody>
        <tr><td>Возраст</td><td>\${e.breakdown.age}</td></tr>
        <tr><td>История</td><td>\${e.breakdown.history}</td></tr>
        <tr><td>Чистота</td><td>\${e.breakdown.cleanliness}</td></tr>
        <tr><td>Ссылки</td><td>\${e.breakdown.backlinks ?? 'н/д (источник недоступен)'}</td></tr>
        <tr><td>Вид домена</td><td>\${e.breakdown.domain_shape}</td></tr>
        <tr><td>Зона</td><td>\${e.breakdown.zone}</td></tr>
      </tbody>
    </table>
    <p class="hint">Оценено: \${new Date(e.computed_at).toLocaleString('ru-RU')}, кэш до \${new Date(e.cache_expires_at).toLocaleString('ru-RU')}</p>\`;
}
el('evaluate').addEventListener('click', async () => {
  el('content').insertAdjacentHTML('afterbegin', '<p class="hint" id="eval-status">Оценка запущена...</p>');
  await fetch('/api/v1/evaluate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domains: [domain] }),
  });
  setTimeout(load, 3000);
});
el('watch').addEventListener('click', async () => {
  const res = await fetch('/api/v1/watchlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ domain }),
  });
  el('watch-status').textContent = res.ok ? 'Добавлено в вотчлист' : 'Ошибка добавления';
});
load();
</script>
</body></html>`;

const WATCHLIST_HTML = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>JetLean Domains — вотчлист</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 0; background: #0f1115; color: #e6e6e6; }
  header { padding: 1rem 2rem; border-bottom: 1px solid #222; }
  nav a { color: #9ab3ff; text-decoration: none; margin-right: 1rem; font-size: .9rem; }
  main { padding: 1rem; max-width: 1100px; box-sizing: border-box; }
  @media (min-width: 640px) { main { padding: 1rem 2rem; } }
  .add { display: flex; flex-wrap: wrap; gap: .5rem; margin-bottom: 1rem; }
  .add input, .add select { background: #1a1d24; color: #fff; border: 1px solid #333; border-radius: 4px; padding: .4rem; }
  button { padding: .5rem 1rem; border-radius: 4px; border: none; background: #4f7cff; color: #fff; cursor: pointer; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: .9rem; }
  th, td { text-align: left; padding: .4rem; border-bottom: 1px solid #222; }
  .hint { color: #aaa; font-size: .8rem; }
  .journal { margin-top: 2rem; }
</style></head>
<body>
<header><h2>JetLean Domains</h2><nav><a href="/">Проверка</a><a href="/drops">Дропы</a><a href="/watchlist">Вотчлист</a><a href="/admin/tokens">Токены</a></nav></header>
<main>
  <div class="add">
    <input id="new-domain" placeholder="домен">
    <select id="new-niche"><option value="">Ниша (необязательно)</option><option value="auto">auto</option><option value="energy">energy</option><option value="news">news</option><option value="deals_us">deals_us</option><option value="other">other</option></select>
    <input id="new-note" placeholder="заметка">
    <select id="new-action"><option value="take">взять как есть</option><option value="drop">drop</option><option value="new">new</option></select>
    <button id="add">Добавить в вотчлист</button>
    <span id="status" class="hint"></span>
  </div>
  <table id="results">
    <thead><tr><th>Домен</th><th>Ниша</th><th>Заметка</th><th>Статус</th><th>До</th><th>Последняя проверка</th><th>Autoreg</th><th></th></tr></thead>
    <tbody></tbody>
  </table>
  <div class="journal">
    <h3>Журнал событий</h3>
    <table id="events">
      <thead><tr><th>Домен</th><th>Тип</th><th>Сообщение</th><th>Доставлено</th><th>Когда</th></tr></thead>
      <tbody></tbody>
    </table>
  </div>
</main>
<script>
const el = (id) => document.getElementById(id);

async function load() {
  const res = await fetch('/api/v1/watchlist');
  if (res.status === 401) { location.href = '/login'; return; }
  const data = await res.json();
  const tbody = el('results').querySelector('tbody');
  tbody.innerHTML = '';
  for (const r of data.results ?? []) {
    const tr = document.createElement('tr');
    const expiry = r.expires_at ? new Date(r.expires_at).toLocaleDateString('ru-RU') : '—';
    const lastChecked = r.last_checked_at ? new Date(r.last_checked_at).toLocaleString('ru-RU') : '—';
    tr.innerHTML = \`<td>\${r.domain}</td><td>\${r.niche ?? '—'}</td><td>\${r.note ?? '—'}</td>
      <td>\${r.status}</td><td>\${expiry}</td><td>\${lastChecked}</td>
      <td>\${r.autoreg_site_id ?? '—'}</td>
      <td>
        <button class="check" data-id="\${r.id}">Проверить сейчас</button>
        <button class="take" data-id="\${r.id}">Взять в работу</button>
        <button class="remove" data-id="\${r.id}">Удалить</button>
      </td>\`;
    tbody.appendChild(tr);
  }
  tbody.querySelectorAll('.check').forEach((btn) => {
    btn.addEventListener('click', async () => {
      el('status').textContent = 'Проверка...';
      await fetch('/api/v1/watchlist/' + btn.dataset.id + '/check', { method: 'POST' });
      el('status').textContent = '';
      await load();
    });
  });
  tbody.querySelectorAll('.take').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const res = await fetch('/api/v1/watchlist/' + btn.dataset.id + '/take', { method: 'POST' });
      const data = await res.json();
      el('status').textContent = res.ok ? 'Autoreg site: ' + data.autoreg_site_id : 'Ошибка: ' + (data.error ?? 'unknown');
      await load();
    });
  });
  tbody.querySelectorAll('.remove').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await fetch('/api/v1/watchlist/' + btn.dataset.id, { method: 'DELETE' });
      await load();
    });
  });
  await loadEvents();
}

async function loadEvents() {
  const res = await fetch('/api/v1/watchlist/events?limit=50');
  if (!res.ok) return;
  const data = await res.json();
  const tbody = el('events').querySelector('tbody');
  tbody.innerHTML = '';
  for (const e of data.results ?? []) {
    const tr = document.createElement('tr');
    tr.innerHTML = \`<td>\${e.domain}</td><td>\${e.event_type}</td><td>\${e.message}</td>
      <td>\${e.notified ? 'да' : 'только журнал'}</td><td>\${new Date(e.created_at).toLocaleString('ru-RU')}</td>\`;
    tbody.appendChild(tr);
  }
}

el('add').addEventListener('click', async () => {
  const domain = el('new-domain').value.trim();
  if (!domain) return;
  el('status').textContent = 'Добавление...';
  const res = await fetch('/api/v1/watchlist', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      domain,
      niche: el('new-niche').value || undefined,
      note: el('new-note').value || undefined,
      desired_action: el('new-action').value,
    }),
  });
  el('status').textContent = res.ok ? '' : 'Ошибка добавления';
  el('new-domain').value = '';
  el('new-note').value = '';
  await load();
});

load();
</script>
</body></html>`;
