/* Zumba Planer – End-to-End-Test
   Start: node tests/smoke.js   (braucht Playwright mit Chromium)
   Optional: SHOTS=ordner node tests/smoke.js  → speichert Screenshots */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

let failed = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ ') + msg); if (!cond) failed++; };
const SHOTS = process.env.SHOTS;

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true, serviceWorkers: 'block' });
  const errors = [];
  const watch = pg => {
    pg.on('pageerror', e => errors.push('pageerror: ' + e.message));
    pg.on('console', m => { if (m.type() === 'error' && !/fonts\.(googleapis|gstatic)/.test(m.text())) errors.push('console: ' + m.text()); });
    pg.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Testvorlage' : undefined));
  };
  const pg = await ctx.newPage(); watch(pg);
  const shot = async (name, full) => { if (SHOTS) await pg.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!full }); };

  console.log('Start & Stunde');
  await pg.goto(base); await pg.waitForTimeout(300);
  ok(await pg.locator('.intro').count() === 1, 'Einstieg wird angezeigt');
  await shot('01-start');
  await pg.click('[data-act="set"][data-k="dur"][data-v="30"]');
  await pg.click('[data-act="set"][data-k="level"][data-v="aktiv"]');
  await pg.click('[data-act="generate"]'); await pg.waitForTimeout(500);
  ok(await pg.locator('#session .phase').count() === 4, 'Stunde mit 4 Phasen erstellt');
  ok(await pg.locator('.energy rect').count() === 10, 'Intensitätsverlauf mit 10 Übungen (30 min)');
  await shot('02-stunde', true);
  const n1 = await pg.locator('#session .ex').count();
  await pg.click('#session [data-act="add-ex"][data-ph="main1"]');
  ok(await pg.locator('#session .ex').count() === n1 + 1, 'Übung hinzugefügt');
  await pg.click('#session [data-act="remove"][data-ph="main1"][data-i="0"]');
  ok(await pg.locator('#session .ex').count() === n1, 'Übung entfernt');
  await pg.click('#toast-undo');
  ok(await pg.locator('#session .ex').count() === n1 + 1, 'Rückgängig funktioniert');
  const song = await pg.locator('#session .song-t b').first().textContent();
  await pg.click('#session [data-act="swap-song"][data-ph="warmup"]');
  ok(await pg.locator('#session .song-t b').first().textContent() !== song, 'Song getauscht');
  await pg.click('#session .ex-main >> nth=0'); await pg.waitForTimeout(300);
  ok(await pg.locator('#modal.open').count() === 1, 'Übungsdetails öffnen');
  await shot('03-details');
  await pg.click('#m-fav'); await pg.keyboard.press('Escape');
  ok(await pg.locator('#modal.open').count() === 0, 'Details schließen mit Escape');

  console.log('Kursmodus');
  await pg.click('[data-act="start"]');
  await pg.click('#t-beat'); await pg.click('#t-voice');
  await pg.click('#p-play'); await pg.waitForTimeout(3300);
  ok(await pg.evaluate(() => P.running), 'Timer läuft nach Countdown');
  await pg.waitForTimeout(1200);
  ok(await pg.locator('#p-dots i.on').count() === 1, 'Beat-Zähler läuft');
  ok(await pg.locator('#p-steps li.on').count() === 1, 'Schritt-Vorschau zeigt den aktuellen Schritt');
  ok(await pg.evaluate(() => $('player').scrollTop) === 0, 'Kursmodus startet oben (kein Scroll-Sprung)');
  await shot('04-kursmodus');
  await pg.click('#t-big'); await shot('05-kursmodus-gross'); await pg.click('#t-big');
  await pg.keyboard.press('ArrowRight');
  ok(await pg.evaluate(() => P.i) === 1, 'Pfeiltaste springt weiter');
  await pg.evaluate(() => { P.endAt = Date.now() - 1; tick(); });
  ok(await pg.evaluate(() => P.i) === 2, 'Timer wechselt automatisch zur nächsten Übung');
  for (let i = 0; i < 40 && await pg.locator('#p-done').isHidden(); i++) await pg.evaluate(() => { if (P.i >= P.tl.length - 1) finishClass(); else playerNext(); });
  ok(await pg.locator('#p-done').isVisible(), 'Abschluss-Bildschirm');
  await pg.click('#p-stars button >> nth=4');
  await pg.click('[data-act="pp"][data-d="1"]'); await pg.click('[data-act="pp"][data-d="1"]');
  await pg.fill('#p-notes', 'Super Stimmung');
  await shot('06-geschafft');
  await pg.click('[data-act="p-finish"]');
  ok(await pg.locator('#player').isHidden(), 'Kursmodus geschlossen');
  ok(await pg.locator('.badge-done').count() === 1, 'Stunde als gemacht markiert');

  console.log('Fortschritt');
  await pg.click('[data-tab="progress"]'); await pg.waitForTimeout(200);
  const facts = await pg.locator('#progress .fact b').allTextContents();
  ok(facts[1] === '1', 'eine Stunde gezählt');
  ok(facts.some(f => f.includes('5,0')), 'Ø Bewertung 5,0');
  ok(facts.includes('2'), 'Ø Teilnehmende 2');
  ok(await pg.locator('.bdg.on').count() >= 2, 'Abzeichen freigeschaltet');
  await shot('07-fortschritt', true);

  console.log('Übungen');
  await pg.click('[data-tab="library"]');
  ok(await pg.locator('#library .lib-card').count() > 40, 'Bibliothek vollständig');
  await pg.click('[data-act="lib-filter"][data-k="fav"]');
  ok(await pg.locator('#library .lib-card').count() === 1, 'Favoriten-Filter');
  await pg.click('[data-act="lib-filter"][data-k="alle"]');
  await pg.selectOption('#lib-rhythm', 'Salsa');
  const salsa = await pg.locator('#library .lib-card').count();
  ok(salsa >= 3, `Rhythmus-Filter Salsa (${salsa})`);
  await pg.fill('#lib-q', 'drehung');
  ok(await pg.locator('#library .lib-card').count() >= 1, 'Suche');
  await shot('08-uebungen');

  console.log('Choreo');
  await pg.click('[data-tab="choreo"]'); await pg.click('[data-act="ch-random"]');
  ok(await pg.locator('.ch-block').count() === 4, 'Zufalls-Choreo mit 4 Blöcken');
  await pg.click('#ch-play'); await pg.waitForTimeout(1500);
  ok((await pg.textContent('#ch-info')).startsWith('Schritt 1/4'), 'Choreo läuft im Beat');
  await shot('09-choreo');
  await pg.click('#ch-play'); await pg.click('[data-act="ch-save"]');
  ok(await pg.locator('[data-act="ch-load"]').count() === 1, 'Choreo gespeichert');

  console.log('Teilen, Vorlagen, Backup');
  await pg.click('[data-tab="progress"]'); await pg.click('[data-act="hist-open"] >> nth=0');
  await pg.click('[data-act="template"]');
  await pg.click('[data-tab="more"]');
  ok(await pg.locator('[data-act="tpl-use"]').count() === 1, 'Vorlage gespeichert');
  await shot('10-mehr', true);
  const link = await pg.evaluate(() => shareLink(cur));
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('[data-act="export"]')]);
  const file = await dl.path();
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(backup.app === 'zumba-planer' && backup.history.length === 1 && backup.log.length === 1, 'Backup enthält Verlauf und Log');

  const p2 = await ctx.newPage(); watch(p2);
  await p2.goto(link); await p2.waitForTimeout(400);
  ok(await p2.locator('#session .phase').count() === 4, 'Geteilter Link öffnet die Stunde');
  await p2.evaluate(() => localStorage.clear());
  await p2.goto(base); await p2.click('[data-tab="more"]');
  await p2.setInputFiles('input[data-change="import"]', file); await p2.waitForTimeout(400);
  ok(await p2.evaluate(() => [hist.length, doneLog.length, favs.size, templates.length, choreos.length].join()) === '1,1,1,1,1', 'Backup vollständig eingespielt');

  console.log('Sicherheit & Robustheit');
  await p2.evaluate(() => {
    localStorage.setItem('zumba-history', JSON.stringify([{ e: { warmup: ['<img src=x onerror=alert(1)>'] } }, 'Müll', null, { session: { warmup: [{ name: 'Merengue-Marsch' }], main1: [{ name: 'Salsa Grundschritt' }], main2: [{ name: 'Samba-Schritt' }], cooldown: [{ name: 'Hüftkreise' }], music: {}, date: '<b>x</b>' } }]));
    localStorage.setItem('zumba-settings', '{kaputt');
  });
  await p2.reload(); await p2.waitForTimeout(300);
  ok(await p2.evaluate(() => hist.length) === 1, 'Kaputte und fremde Einträge werden verworfen, alte Einträge bleiben lesbar');
  ok(await p2.locator('#history b').count() === 0, 'HTML aus gespeicherten Daten wird nicht ausgeführt');
  const evil = await p2.evaluate(() => toB64(JSON.stringify({ d: 55, e: { warmup: ['"><script>alert(1)</script>'] } })));
  await p2.goto(base + '#s=' + evil); await p2.waitForTimeout(300);
  ok((await p2.textContent('#toast-msg')).includes('ungültig'), 'Manipulierter Link wird abgelehnt');
  await p2.goto(base + '#s=%%%'); await p2.waitForTimeout(200);

  console.log('Dunkles Design');
  await pg.emulateMedia({ colorScheme: 'dark' });
  await pg.click('[data-act="set"][data-k="theme"][data-v="auto"]');
  await pg.click('[data-tab="plan"]'); await pg.waitForTimeout(1200);
  ok(await pg.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'Dunkelmodus folgt dem System');
  await shot('11-dunkel', true);

  console.log('Desktop');
  await pg.setViewportSize({ width: 1280, height: 900 }); await pg.click('[data-tab="library"]');
  await pg.waitForTimeout(400); await shot('12-desktop');

  ok(errors.length === 0, 'keine JavaScript- oder CSP-Fehler' + (errors.length ? ':\n    ' + errors.join('\n    ') : ''));
  await browser.close(); server.close();
  console.log(failed ? `\n${failed} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
