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
</style></head>
<body>
<header><h2>JetLean Domains — проверка доступности</h2></header>
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
