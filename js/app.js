'use strict';
/* =====================================================================
   Zumba Planer – App-Logik
   Gliederung: Hilfen · Inhalte · Zustand · Stunde · Übungen · Details
   · Kursmodus · Beat · Choreo · Fortschritt · Teilen & Backup · Mehr
   · Ereignisse · Start
   Alle Daten bleiben im Browser (localStorage). Kein Server.
   ===================================================================== */

/* ---------- Hilfen ---------- */
const $ = id => document.getElementById(id);
const esc = t => String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = '') => `<svg class="ic${c ? ' ' + c : ''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const asArray = v => Array.isArray(v) ? v : [];
const clampInt = (v, lo, hi, d) => { v = Math.round(+v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const pickOne = a => a[Math.floor(Math.random() * a.length)];
const fmt = secs => { secs = Math.max(0, Math.round(secs)); return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'); };
const nowDate = (t = Date.now()) => new Date(t).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function loadStore(key, fallback) {
  try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; } catch (e) { return fallback; }
}
let storeWarned = false;
function saveStore(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); }
  catch (e) { if (!storeWarned) { storeWarned = true; toast('Speichern nicht möglich (Speicher voll oder privater Modus)'); } }
}
const ytUrl = q => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

/* ---------- Inhalte ---------- */
const PHASES = [
  { key: 'warmup', label: 'Warm-Up', icon: 'sun', color: '#f59e0b', pool: 'warmup' },
  { key: 'main1', label: 'Hauptteil I', icon: 'flame', color: '#f43f5e', pool: 'main' },
  { key: 'main2', label: 'Hauptteil II', icon: 'bolt', color: '#a855f7', pool: 'main' },
  { key: 'cooldown', label: 'Cool-Down', icon: 'leaf', color: '#14b8a6', pool: 'cooldown' }
];
const PH = Object.fromEntries(PHASES.map(p => [p.key, p]));
const PROFILES = {
  30: { mins: [5, 10, 10, 5], n: [2, 3, 3, 2] },
  45: { mins: [8, 15, 14, 8], n: [3, 4, 4, 3] },
  55: { mins: [10, 20, 17, 8], n: [3, 5, 4, 3] },
  60: { mins: [10, 22, 20, 8], n: [3, 5, 5, 3] }
};
const profileOf = s => PROFILES[s.dur] || PROFILES[55];
const LEVELS = { leicht: 'Sanft', mittel: 'Mittel', aktiv: 'Power' };
const LEVEL_KEYS = ['alle', 'leicht', 'mittel', 'aktiv'];
const LEVEL_VAL = { leicht: .42, mittel: .7, aktiv: 1 };
const MAX_PER_PHASE = 8;

const ALL = [
  ...EXERCISES.warmup.map(e => ({ ...e, phase: 'warmup' })),
  ...EXERCISES.main.map(e => ({ ...e, phase: 'main' })),
  ...EXERCISES.cooldown.map(e => ({ ...e, phase: 'cooldown' }))
];
const EX = new Map(ALL.map(e => [e.name, e]));
const exByName = n => (typeof n === 'string' && EX.get(n)) || null;
const POOLS = { warmup: ALL.filter(e => e.phase === 'warmup'), main: ALL.filter(e => e.phase === 'main'), cooldown: ALL.filter(e => e.phase === 'cooldown') };
const MUSIC_BY_TITLE = new Map(Object.values(MUSIC).flat().map(m => [m.title, m]));

// Rhythmus aus dem Übungsnamen (Reihenfolge wichtig: „Reggaeton“ vor „Reggae“)
const RHYTHM_KEYS = [
  ['Reggaeton', 'reggaeton'], ['Dembow', 'dembow'], ['Reggae', 'reggae'], ['Merengue', 'merengue'], ['Salsa', 'salsa'], ['Salsa', 'kubanisch'],
  ['Cumbia', 'cumbia'], ['Cha-Cha', 'cha-cha'], ['Afrobeats', 'afrobeat'], ['Amapiano', 'amapiano'], ['Samba', 'samba'], ['Bachata', 'bachata'],
  ['Kizomba', 'kizomba'], ['Dancehall', 'dancehall'], ['Soca', 'soca'], ['Bollywood', 'bollywood'], ['Bhangra', 'bhangra'], ['Flamenco', 'flamenco'],
  ['K-Pop', 'k-pop'], ['Baile Funk', 'baile'], ['Soul', 'motown'], ['Shuffle', 'shuffle'], ['Intervall', 'tabata']
];
ALL.forEach(e => { const t = e.name.toLowerCase(); const r = RHYTHM_KEYS.find(([, k]) => t.includes(k)); e.rhythm = r ? r[0] : ''; });
const RHYTHM_LIST = [...new Set(ALL.map(e => e.rhythm).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'de'));

// Grobe Tempo-Schätzung aus dem Tempo-Wort der Songliste (keine gemessenen BPM)
const BPM_EST = { 'ruhig': 80, 'mittel': 100, 'schnell': 120, 'sehr schnell': 135 };
const bpmEst = m => BPM_EST[m && m.bpm] || 100;

const REST = {
  name: 'Trinkpause', level: 'leicht', muscle: 'Pause', rest: true,
  steps: ['Wasser trinken', 'Locker gehen, Schultern kreisen', 'Ruhig ein- und ausatmen'],
  tip: 'Kurz trinken und durchatmen – gleich geht es weiter.'
};

const BADGES = [
  { id: 'first', name: 'Erste Stunde', icon: 'star', ok: s => s.n >= 1 },
  { id: 'five', name: '5 Stunden', icon: 'flame', ok: s => s.n >= 5 },
  { id: 'ten', name: '10 Stunden', icon: 'bolt', ok: s => s.n >= 10 },
  { id: 'twentyfive', name: '25 Stunden', icon: 'trophy', ok: s => s.n >= 25 },
  { id: 'goal', name: 'Wochenziel', icon: 'check', ok: s => s.goalHit },
  { id: 'streak4', name: '4 Wochen am Stück', icon: 'calendar', ok: s => s.best >= 4 },
  { id: 'five_star', name: 'Fünf Sterne', icon: 'heart', ok: s => s.five },
  { id: 'hours', name: '10 h Tanzzeit', icon: 'clock', ok: s => s.mins >= 600 }
];

/* ---------- Zustand ---------- */
const DEFAULTS = {
  dur: 55, level: 'alle', favPref: false, trendPref: false, music: 'spotify', playlists: {}, theme: 'auto',
  sound: true, beat: false, voice: false, big: false, water: false, goal: 2, weight: 65, badges: []
};
let settings, favs, hist, doneLog, templates, choreo, choreos;
let cur = null;                      // aktuell angezeigte Stunde (Objekt aus hist)
let libFilter = 'alle', libRhythm = '';
let modalName = null, modalReturn = null;
let installEvt = null;

function cleanSettings(s) {
  const out = {}; if (!s || typeof s !== 'object') return out;
  if (PROFILES[s.dur]) out.dur = +s.dur;
  if (LEVEL_KEYS.includes(s.level)) out.level = s.level;
  if (['spotify', 'youtube'].includes(s.music)) out.music = s.music;
  if (['auto', 'light', 'dark'].includes(s.theme)) out.theme = s.theme;
  ['favPref', 'trendPref', 'sound', 'beat', 'voice', 'big', 'water'].forEach(k => { if (typeof s[k] === 'boolean') out[k] = s[k]; });
  if (s.goal != null) out.goal = clampInt(s.goal, 1, 14, 2);
  if (s.weight != null) out.weight = clampInt(s.weight, 30, 250, 65);
  out.playlists = {};
  if (s.playlists && typeof s.playlists === 'object') {
    PHASES.forEach(ph => { const v = s.playlists[ph.key]; if (typeof v === 'string' && spotifyEmbed(v)) out.playlists[ph.key] = v.trim().slice(0, 300); });
  }
  if (Array.isArray(s.badges)) out.badges = s.badges.filter(b => BADGES.some(x => x.id === b));
  return out;
}
const persistSettings = () => saveStore('zumba-settings', settings);
const persistFavs = () => saveStore('zumba-favs', [...favs]);
const persistHistory = () => saveStore('zumba-history', hist.map(packSession));
const persistLog = () => { if (doneLog.length > 3000) doneLog = doneLog.slice(-3000); saveStore('zumba-log', doneLog); };
const persistTpl = () => saveStore('zumba-templates', templates);
const persistChoreo = () => saveStore('zumba-choreo', choreo);
const persistChoreos = () => saveStore('zumba-choreos', choreos);
const isFav = n => favs.has(n);

/* Speicherformat einer Stunde: nur Namen und Titel, Inhalte kommen aus data.js */
function packSession(s) {
  const p = { id: s.id, dur: s.dur, level: s.level, e: {}, m: {}, tip: s.tip, notes: s.notes, date: s.date };
  PHASES.forEach(ph => { p.e[ph.key] = s[ph.key].map(e => e.name); p.m[ph.key] = s.music[ph.key].title; });
  if (s.done) p.done = true;
  if (s.doneAt) p.doneAt = s.doneAt;
  if (s.rating) p.rating = s.rating;
  if (s.participants) p.participants = s.participants;
  return p;
}
// Liest gespeicherte, geteilte oder importierte Stunden (altes und neues Format) und prüft alles
function unpackSession(r) {
  if (!r || typeof r !== 'object') return null;
  const dur = +(r.dur != null ? r.dur : r.d), lvl = r.level != null ? r.level : r.l;
  const s = {
    id: Number.isFinite(+r.id) && +r.id > 0 ? +r.id : Date.now() + Math.floor(Math.random() * 1e4),
    dur: PROFILES[dur] ? dur : 55,
    level: LEVEL_KEYS.includes(lvl) ? lvl : 'alle'
  };
  for (const ph of PHASES) {
    const src = (r.e && typeof r.e === 'object' && r.e[ph.key]) || r[ph.key];
    const arr = asArray(src).map(x => exByName(typeof x === 'string' ? x : x && x.name)).filter(Boolean).slice(0, MAX_PER_PHASE);
    if (!arr.length) return null;
    s[ph.key] = arr;
  }
  s.music = {};
  for (const ph of PHASES) {
    const m = (r.m && typeof r.m === 'object' && r.m[ph.key]) || (r.music && typeof r.music === 'object' && r.music[ph.key]);
    const t = m && typeof m === 'object' ? m.title : m;
    s.music[ph.key] = MUSIC_BY_TITLE.get(t) || pickOne(MUSIC[ph.key]);
  }
  s.tip = typeof r.tip === 'string' && r.tip ? r.tip.slice(0, 400) : pickOne(TIPS);
  s.notes = typeof r.notes === 'string' ? r.notes.slice(0, 4000) : '';
  s.date = typeof r.date === 'string' && r.date ? r.date.slice(0, 40) : nowDate();
  s.done = !!r.done;
  const rt = clampInt(r.rating, 0, 5, 0); if (rt) s.rating = rt;
  if (Number.isFinite(+r.doneAt) && +r.doneAt > 0) s.doneAt = +r.doneAt;
  const pp = clampInt(r.participants, 0, 999, 0); if (pp) s.participants = pp;
  return s;
}
function cleanLogEntry(e) {
  if (!e || typeof e !== 'object') return null;
  const t = +e.t; if (!(t > 0 && t < 4e12)) return null;
  return { id: +e.id || 0, t, dur: clampInt(e.dur, 5, 180, 55), rating: clampInt(e.rating, 0, 5, 0), p: clampInt(e.p, 0, 999, 0) };
}
function cleanChoreo(c) {
  if (!c || typeof c !== 'object') return null;
  const blocks = asArray(c.blocks).map(b => b && exByName(b.name) ? { name: b.name, reps: clampInt(b.reps, 1, 16, 2) } : null).filter(Boolean).slice(0, 16);
  return { name: typeof c.name === 'string' ? c.name.slice(0, 40) : '', bpm: clampInt(c.bpm, 60, 170, 100), blocks };
}
function cleanTemplate(t) {
  if (!t || typeof t.name !== 'string' || !t.data || !unpackSession(t.data)) return null;
  return { name: t.name.slice(0, 40), data: packSession(unpackSession(t.data)) };
}

function loadState() {
  settings = Object.assign({}, DEFAULTS, cleanSettings(loadStore('zumba-settings', {})));
  favs = new Set(asArray(loadStore('zumba-favs', [])).map(f => typeof f === 'string' ? f : f && f.name).filter(n => EX.has(n)));
  hist = asArray(loadStore('zumba-history', [])).map(h => unpackSession(h && h.session ? h.session : h)).filter(Boolean).slice(0, 40);
  let hasLog = true; try { hasLog = localStorage.getItem('zumba-log') !== null; } catch (e) {}
  doneLog = asArray(loadStore('zumba-log', [])).map(cleanLogEntry).filter(Boolean);
  if (!hasLog) { // einmalig: bereits absolvierte Stunden übernehmen
    hist.forEach(s => { if (s.done) doneLog.push({ id: s.id, t: s.doneAt || s.id, dur: s.dur, rating: s.rating || 0, p: s.participants || 0 }); });
    persistLog();
  }
  templates = asArray(loadStore('zumba-templates', [])).map(cleanTemplate).filter(Boolean).slice(0, 20);
  choreo = cleanChoreo(loadStore('zumba-choreo', null)) || { name: '', bpm: 100, blocks: [] };
  choreos = asArray(loadStore('zumba-choreos', [])).map(cleanChoreo).filter(c => c && c.blocks.length).slice(0, 20);
  cur = hist[0] && !hist[0].done ? hist[0] : null;
}

/* ---------- Toast mit „Rückgängig“ ---------- */
let toastUndo = null;
function toast(msg, undo) {
  const t = $('toast'); if (!t) return;
  $('toast-msg').textContent = msg;
  $('toast-undo').hidden = !undo; toastUndo = undo || null;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.classList.remove('show'); toastUndo = null; }, undo ? 5500 : 2600);
}

/* =====================================================================
   STUNDE
   ===================================================================== */
const allNames = s => PHASES.flatMap(p => s[p.key]).map(e => e.name);
function recentNames(k) { const set = new Set(); hist.slice(0, k).forEach(s => allNames(s).forEach(n => set.add(n))); return set; }
function recentSongs(k) { const set = new Set(); hist.slice(0, k).forEach(s => PHASES.forEach(p => set.add(s.music[p.key].title))); return set; }
function pickSong(key, avoid) { const pool = MUSIC[key], c = pool.filter(m => !avoid.has(m.title)); return pickOne(c.length ? c : pool); }

// Wählt n Übungen: Intensität zuerst, dann Favoriten/Trend, dann Abwechslung zu den letzten Stunden
function choose(pool, n, used = [], recent = new Set()) {
  let cand = pool.filter(e => !used.includes(e.name));
  if (cand.length < n) cand = pool.slice();
  const lv = settings.level;
  const rank = e => (lv !== 'alle' && e.level !== lv ? 4 : 0)
    + (settings.favPref && !isFav(e.name) && Math.random() < .75 ? 2 : 0)
    + (settings.trendPref && !e.trend && Math.random() < .75 ? 2 : 0)
    + (recent.has(e.name) && Math.random() < .7 ? 1 : 0);
  return shuffle(cand).map(e => [rank(e), e]).sort((a, b) => a[0] - b[0]).slice(0, n).map(x => x[1]);
}

function generate() {
  const p = PROFILES[settings.dur] || PROFILES[55], recent = recentNames(2), songs = recentSongs(3), used = [];
  const s = { id: Date.now(), dur: settings.dur, level: settings.level, music: {} };
  PHASES.forEach((ph, i) => { s[ph.key] = choose(POOLS[ph.pool], p.n[i], used, recent); used.push(...s[ph.key].map(e => e.name)); });
  PHASES.forEach(ph => { s.music[ph.key] = pickSong(ph.key, songs); songs.add(s.music[ph.key].title); });
  s.tip = pickOne(TIPS); s.notes = ''; s.date = nowDate(); s.done = false;
  hist.unshift(s); hist = hist.slice(0, 40); persistHistory();
  cur = s; renderSession(true); renderHistory();
  requestAnimationFrame(() => { const el = $('session'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
}

const phaseSecs = (s, i) => {
  const n = s[PHASES[i].key].length || 1;
  return Math.max(30, Math.round(profileOf(s).mins[i] * 60 / n / 5) * 5);
};
function buildTimeline(s, withRest) {
  const tl = []; let no = 0;
  PHASES.forEach((ph, pi) => {
    const secs = phaseSecs(s, pi);
    s[ph.key].forEach(ex => tl.push({ ph, ex, secs, music: s.music[ph.key], no: ++no }));
    if (withRest && pi < PHASES.length - 1) { const nx = PHASES[pi + 1]; tl.push({ ph: nx, ex: REST, secs: 30, music: s.music[nx.key], rest: true }); }
  });
  tl.total = no;
  return tl;
}

function tagsHtml(ex, withTime) {
  return (ex.rhythm ? `<span class="tag rhy">${esc(ex.rhythm)}</span>` : '')
    + (ex.trend ? '<span class="tag trend">Trend</span>' : '')
    + (LEVELS[ex.level] ? `<span class="tag lv-${esc(ex.level)}">${LEVELS[ex.level]}</span>` : '')
    + (ex.muscle ? `<span class="tag">${esc(ex.muscle)}</span>` : '')
    + (withTime ? `<span class="tag">${ic('clock')} ${fmt(withTime)}</span>` : '');
}
function energySvg(s) {
  const tl = buildTimeline(s, false), total = tl.reduce((n, t) => n + t.secs, 0), W = 300, H = 58;
  let x = 0;
  const bars = tl.map(t => {
    const w = t.secs / total * W, h = Math.max(10, (LEVEL_VAL[t.ex.level] || .6) * H);
    const r = `<rect x="${(x + .8).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${Math.max(1, w - 1.6).toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${t.ph.color}"><title>${esc(t.ex.name)}</title></rect>`;
    x += w; return r;
  }).join('');
  return `<svg class="energy" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Intensitätsverlauf der Stunde">${bars}</svg>`;
}

function renderSession(animate) {
  const c = $('session'); const s = cur;
  if (!s) {
    c.className = '';
    c.innerHTML = `<div class="card"><h2>So funktioniert's</h2><ol class="intro">
        <li><span class="num">1</span><span><b>Stunde erstellen.</b> Oben Dauer und Intensität wählen. Übungen und Songs werden passend gemischt, mit Abwechslung zu den letzten Stunden.</span></li>
        <li><span class="num">2</span><span><b>Anpassen.</b> Übungen tauschen, hinzufügen oder entfernen, Songs wechseln, als Vorlage speichern.</span></li>
        <li><span class="num">3</span><span><b>Kursmodus starten.</b> Timer, Beat-Zähler, Ansagen und Musik führen Dich durch die Stunde.</span></li>
      </ol></div>`;
    return;
  }
  const total = PHASES.reduce((n, ph) => n + s[ph.key].length, 0);
  const title = `${s.dur}-Minuten-Stunde` + (LEVELS[s.level] ? ` · ${LEVELS[s.level]}` : '');
  c.className = animate ? 'anim' : '';
  c.innerHTML = `
    <div class="card s-head">
      <div class="s-top"><div><div class="s-date">${esc(s.date)}</div><h2 class="s-title">${esc(title)}</h2></div>
        ${s.done ? `<span class="badge-done">${ic('check', 'sm')} gemacht</span>` : ''}</div>
      <div class="stats">
        <div class="stat"><b>${s.dur}</b><span>Minuten</span></div>
        <div class="stat"><b>${total}</b><span>Übungen</span></div>
        <div class="stat"><b>${PHASES.length}</b><span>Songs</span></div>
      </div>
      <div class="energy-wrap">${energySvg(s)}<div class="energy-legend"><span>Warm-Up</span><span>Intensität</span><span>Cool-Down</span></div></div>
      <button class="btn btn-primary btn-lg" data-act="start">${ic('play')} Kursmodus starten</button>
      <div class="s-actions">
        <button data-act="share">${ic('share')}Teilen</button>
        <button data-act="template">${ic('star')}Vorlage</button>
        <button data-act="copy">${ic('copy')}Kopieren</button>
        <button data-act="print">${ic('print')}PDF</button>
      </div>
    </div>
    ${PHASES.map((ph, i) => renderPhase(ph, i, s)).join('')}
    <div class="tipbox">${ic('sparkle')}<span><b>Tipp für heute:</b> ${esc(s.tip)}</span></div>
    <textarea class="input notes" data-input="notes" placeholder="Notizen zur Stunde …" aria-label="Notizen zur Stunde">${esc(s.notes || '')}</textarea>`;
  if (animate) {
    c.querySelectorAll('.phase').forEach((el, i) => { el.style.animationDelay = (i + 1) * 0.06 + 's'; });
    clearTimeout(renderSession._t); renderSession._t = setTimeout(() => { c.className = ''; }, 900);
  }
}
function renderPhase(ph, i, s) {
  const per = phaseSecs(s, i), m = s.music[ph.key];
  const sp = `<a class="link-pill${settings.music === 'spotify' ? ' primary' : ''}" href="${esc(spotifyWeb(m.title))}" data-act="spotify" data-title="${esc(m.title)}">${ic('play', 'sm')} Spotify</a>`;
  const yt = `<a class="link-pill${settings.music === 'youtube' ? ' primary' : ''}" href="${esc(ytUrl(m.yt || m.title))}" target="_blank" rel="noopener">${ic('play', 'sm')} YouTube</a>`;
  return `
    <article class="phase" style="--ph:${ph.color}">
      <header class="phase-h"><span class="phase-ic">${ic(ph.icon)}</span><h3>${ph.label}</h3><span class="pill">${profileOf(s).mins[i]} min</span></header>
      <div class="song">${ic('music')}<div class="song-t"><b>${esc(m.title)}</b><small>${esc(m.bpm)} · ca. ${bpmEst(m)} BPM</small></div>
        <button class="mini" data-act="swap-song" data-ph="${ph.key}" aria-label="Anderen Song wählen" title="Anderen Song">${ic('swap')}</button></div>
      <div class="song-links">${settings.music === 'youtube' ? yt + sp : sp + yt}</div>
      <ul class="ex-list">${s[ph.key].map((ex, idx) => `
        <li class="ex">
          <button class="ex-main" data-act="ex" data-name="${esc(ex.name)}"><span class="ex-n">${esc(ex.name)}</span><span class="tags">${tagsHtml(ex, per)}</span></button>
          <button class="mini fav${isFav(ex.name) ? ' on' : ''}" data-act="fav" data-name="${esc(ex.name)}" aria-label="Favorit" aria-pressed="${isFav(ex.name)}">${ic('heart')}</button>
          <button class="mini" data-act="swap" data-ph="${ph.key}" data-i="${idx}" aria-label="Übung austauschen" title="Austauschen">${ic('swap')}</button>
          <button class="mini" data-act="remove" data-ph="${ph.key}" data-i="${idx}" aria-label="Übung entfernen" title="Entfernen">${ic('trash')}</button>
        </li>`).join('')}</ul>
      <button class="add-ex" data-act="add-ex" data-ph="${ph.key}">${ic('plus', 'sm')} Übung hinzufügen</button>
    </article>`;
}

function sessionChanged() { persistHistory(); renderSession(); renderHistory(); }
function freeCandidates(k) { const used = allNames(cur); return POOLS[PH[k].pool].filter(e => !used.includes(e.name)); }
function swapEx(k, i) {
  const cand = freeCandidates(k);
  if (!cand.length || !cur[k][i]) return toast('Keine weitere Übung verfügbar');
  cur[k][i] = choose(cand, 1)[0]; sessionChanged();
}
function addEx(k) {
  if (cur[k].length >= MAX_PER_PHASE) return toast(`Maximal ${MAX_PER_PHASE} Übungen pro Phase`);
  const cand = freeCandidates(k); if (!cand.length) return toast('Keine weitere Übung verfügbar');
  cur[k].push(choose(cand, 1)[0]); sessionChanged(); toast('Übung hinzugefügt – die Zeit pro Übung wurde angepasst');
}
function removeEx(k, i) {
  if (cur[k].length <= 1) return toast('Mindestens eine Übung pro Phase');
  const s = cur, [old] = s[k].splice(i, 1); sessionChanged();
  toast(`„${old.name}“ entfernt`, () => { s[k].splice(i, 0, old); persistHistory(); if (s === cur) renderSession(); renderHistory(); });
}
function swapSong(k) { cur.music[k] = pickSong(k, new Set([cur.music[k].title])); sessionChanged(); }

function planText(s) {
  return [`Zumba-Stunde ${s.date} (${s.dur} min${LEVELS[s.level] ? ', ' + LEVELS[s.level] : ''})`,
    ...PHASES.map((ph, i) => `${ph.label} (${profileOf(s).mins[i]} min)\nMusik: ${s.music[ph.key].title}\n` +
      s[ph.key].map((e, n) => `  ${n + 1}. ${e.name} – ${fmt(phaseSecs(s, i))}`).join('\n'))
  ].join('\n\n') + (s.notes ? `\n\nNotizen: ${s.notes}` : '');
}
function copyText(text, okMsg) {
  if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(() => toast(okMsg), () => toast('Kopieren nicht möglich'));
  else toast('Kopieren nicht möglich');
}

/* ---------- Musik ---------- */
const spotifyQuery = t => String(t).replace(/ – /, ' ').replace(/\s*\((Remix|Latin Remix|langsam)\)\s*/i, ' ').trim();
const spotifyWeb = t => 'https://open.spotify.com/search/' + encodeURIComponent(spotifyQuery(t));
const spotifyApp = t => 'spotify:search:' + encodeURIComponent(spotifyQuery(t));
// Öffnet die Spotify-App; ohne App geht es nach kurzer Zeit im Browser weiter
function openSpotify(title) {
  P.away = Date.now();
  let left = false; const mark = () => { left = true; };
  document.addEventListener('visibilitychange', mark, { once: true });
  window.addEventListener('pagehide', mark, { once: true });
  location.href = spotifyApp(title);
  setTimeout(() => { if (!left && !document.hidden) window.open(spotifyWeb(title), '_blank', 'noopener'); }, 1600);
}
const SP_RE = /^https:\/\/open\.spotify\.com\/(?:intl-[a-z-]+\/)?(playlist|album|track|artist)\/([A-Za-z0-9]{10,40})(?:[/?#].*)?$|^spotify:(playlist|album|track|artist):([A-Za-z0-9]{10,40})$/;
function spotifyEmbed(url) {
  const m = SP_RE.exec(String(url || '').trim()); if (!m) return '';
  return `https://open.spotify.com/embed/${m[1] || m[3]}/${m[2] || m[4]}?utm_source=generator&theme=0`;
}

/* =====================================================================
   ÜBUNGEN
   ===================================================================== */
const LIB_FILTERS = [['alle', 'Alle', ''], ['fav', 'Favoriten', 'heart'], ['trend', 'Trend', 'sparkle'], ['warmup', 'Warm-Up', 'sun'], ['main', 'Hauptteil', 'flame'], ['cooldown', 'Cool-Down', 'leaf']];
function renderLibrary() {
  $('lib-chips').innerHTML = LIB_FILTERS.map(([k, l, i]) => `<button class="chip${libFilter === k ? ' active' : ''}" data-act="lib-filter" data-k="${k}" aria-pressed="${libFilter === k}">${i ? ic(i) : ''}${l}${k === 'fav' && favs.size ? ` (${favs.size})` : ''}</button>`).join('');
  const sel = $('lib-rhythm');
  if (!sel.options.length) sel.innerHTML = '<option value="">Alle Rhythmen</option>' + RHYTHM_LIST.map(r => `<option value="${esc(r)}">${esc(r)}</option>`).join('');
  sel.value = libRhythm;
  const term = ($('lib-q').value || '').trim().toLowerCase();
  const list = ALL.filter(e =>
    (libFilter === 'alle' || (libFilter === 'fav' ? isFav(e.name) : libFilter === 'trend' ? e.trend : e.phase === libFilter)) &&
    (!libRhythm || e.rhythm === libRhythm) &&
    (!term || [e.name, e.muscle, e.rhythm, LEVELS[e.level], e.beschreibung].join(' ').toLowerCase().includes(term)));
  $('lib-count').textContent = list.length === 1 ? '1 Übung' : `${list.length} Übungen`;
  $('library').innerHTML = list.length ? list.map(e => `
    <div class="lib-card">
      <button class="ex-main" data-act="ex" data-name="${esc(e.name)}"><span class="ex-n">${esc(e.name)}</span><span class="tags">${tagsHtml(e)}</span><span class="lib-desc">${esc(e.beschreibung || '')}</span></button>
      <button class="mini fav${isFav(e.name) ? ' on' : ''}" data-act="fav" data-name="${esc(e.name)}" aria-label="Favorit" aria-pressed="${isFav(e.name)}">${ic('heart')}</button>
    </div>`).join('')
    : `<div class="empty">${ic(libFilter === 'fav' ? 'heart' : 'search')}<h3>${libFilter === 'fav' && !term ? 'Noch keine Favoriten' : 'Nichts gefunden'}</h3><p>${libFilter === 'fav' && !term ? 'Tippe bei einer Übung auf das Herz, um sie hier zu sammeln.' : 'Versuche einen anderen Suchbegriff oder Filter.'}</p></div>`;
}
function toggleFav(name) {
  if (!EX.has(name)) return;
  const on = !favs.has(name); on ? favs.add(name) : favs.delete(name); persistFavs();
  document.querySelectorAll('[data-act="fav"]').forEach(b => { if (b.dataset.name === name) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); } });
  syncModalFav();
  if (libFilter === 'fav' || $('tab-library').classList.contains('active')) renderLibrary();
  toast(on ? 'Zu Favoriten hinzugefügt' : 'Aus Favoriten entfernt');
}

/* ---------- Detail-Ansicht ---------- */
function openModal(name) {
  const ex = exByName(name); if (!ex) return;
  modalName = name; modalReturn = document.activeElement;
  $('m-title').textContent = ex.name;
  $('m-tags').innerHTML = tagsHtml(ex) + (ex.duration ? `<span class="tag">${ic('clock')} ${esc(ex.duration)}</span>` : '');
  $('m-desc').textContent = ex.beschreibung || '';
  $('m-steps').innerHTML = ex.steps.map(s => `<li>${esc(s)}</li>`).join('');
  $('m-tip').textContent = ex.tip || '';
  $('m-video').href = ytUrl(ex.yt || ex.name + ' dance tutorial');
  syncModalFav();
  $('modal').classList.add('open'); document.body.classList.add('locked');
  $('m-close').focus();
}
function syncModalFav() {
  if (!modalName) return; const on = isFav(modalName), b = $('m-fav');
  b.classList.toggle('on', on); b.innerHTML = ic('heart') + (on ? ' In Deinen Favoriten' : ' Zu Favoriten hinzufügen');
}
function closeModal() {
  if (!$('modal').classList.contains('open')) return;
  $('modal').classList.remove('open'); modalName = null;
  if ($('player').hidden) document.body.classList.remove('locked');
  if (modalReturn && modalReturn.focus) modalReturn.focus();
}

/* =====================================================================
   KURSMODUS
   ===================================================================== */
const P = { tl: [], i: 0, remaining: 0, running: false, endAt: 0, timer: null, lastTick: 0, wake: null, ctx: null, embedUrl: '', bpmAdj: 0, started: false, cd: false, spoken: -1, warned: -1, beatFor: -1, shownFor: -1, away: 0 };
const CIRC = 2 * Math.PI * 88;

function openPlayer() {
  if (!cur) return;
  chStop(); closeModal();
  Object.assign(P, { tl: buildTimeline(cur, settings.water), i: 0, running: false, started: false, cd: false, embedUrl: '', bpmAdj: 0, spoken: -1, warned: -1, beatFor: -1, shownFor: -1, lastTick: 0 });
  P.remaining = P.tl[0].secs * 1000;
  $('p-main').hidden = false; $('p-done').hidden = true; $('p-cd').hidden = true;
  $('player').hidden = false; document.body.classList.add('locked');
  $('p-ring').style.strokeDasharray = CIRC.toFixed(1);
  syncSound(); syncTools(); playerRender();
  document.querySelector('.p-tools').hidden = false; $('player').scrollTop = 0;
  $('p-play').focus({ preventScroll: true });
}
function closePlayer(finished) {
  if (!finished && !$('p-main').hidden && (P.started || P.i > 0) && !confirm('Kursmodus beenden? Die Stunde wird dann nicht als gemacht gezählt.')) return;
  pauseTimer(); stopEmbed(); P.cd = false; $('p-cd').hidden = true; Beat.stop();
  try { if (document.fullscreenElement) document.exitFullscreen(); if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) {}
  $('player').hidden = true; document.body.classList.remove('locked'); $('confetti').innerHTML = '';
  if (finished) { renderSession(); renderHistory(); renderProgress(); }
}
function playerRender() {
  const c = P.tl[P.i];
  $('player').style.setProperty('--ph', c.rest ? '#38bdf8' : c.ph.color);
  $('p-phase').textContent = c.rest ? 'Trinkpause' : c.ph.label;
  $('p-count').textContent = c.rest ? 'Gleich: ' + c.ph.label : `Übung ${c.no} von ${P.tl.total}`;
  $('p-name').textContent = c.ex.name;
  $('p-tags').innerHTML = c.rest ? '' : tagsHtml(c.ex);
  $('p-tip').textContent = c.ex.tip || '';
  $('p-song').textContent = c.music.title;
  $('p-yt').href = ytUrl(c.music.yt || c.music.title);
  $('p-sp').href = spotifyWeb(c.music.title); $('p-sp').dataset.title = c.music.title;
  $('p-howto').hidden = !!c.rest;
  $('p-hint').hidden = P.started;
  updateEmbed(c);
  if (P.shownFor !== P.i) { P.shownFor = P.i; P.bpmAdj = 0; }
  renderBeatBar();
  const nx = P.tl[P.i + 1];
  $('p-next').innerHTML = nx ? `Als Nächstes: <b>${esc(nx.ex.name)}</b>${nx.ph !== c.ph && !nx.rest ? ' · ' + esc(nx.ph.label) : ''}` : 'Letzte Übung – gleich geschafft!';
  syncPlayBtn(); timerRender(); announce(); beatSync();
}
function syncPlayBtn() {
  $('p-play').innerHTML = ic(P.running ? 'pause' : 'play');
  $('p-play').setAttribute('aria-label', P.running ? 'Pause' : 'Start');
  $('p-ringbox').classList.toggle('paused', P.started && !P.running);
}
function timerRender() {
  const c = P.tl[P.i], total = c.secs * 1000;
  $('p-time').textContent = fmt(Math.ceil(P.remaining / 1000));
  $('p-ring').style.strokeDashoffset = (CIRC * (1 - P.remaining / total)).toFixed(1);
  const after = P.tl.slice(P.i + 1).reduce((n, t) => n + t.secs, 0), all = P.tl.reduce((n, t) => n + t.secs, 0);
  const left = after + P.remaining / 1000;
  $('p-left').textContent = 'noch ' + fmt(left) + ' gesamt';
  $('p-bar-fill').style.width = (100 * (1 - left / all)) + '%';
}
function startTimer() {
  P.running = true; P.endAt = Date.now() + P.remaining;
  clearInterval(P.timer); P.timer = setInterval(tick, 250);
  requestWake(); syncPlayBtn(); beatSync();
}
function pauseTimer() {
  if (P.running) P.remaining = Math.max(0, P.endAt - Date.now());
  P.running = false; clearInterval(P.timer); releaseWake();
  syncPlayBtn(); beatSync();
}
function togglePlay() {
  if (P.cd) return;
  if (!P.running && !P.started) { audio(); countdown(() => { P.started = true; startTimer(); timerRender(); announce(); }); return; }
  P.running ? pauseTimer() : startTimer(); timerRender();
}
function tick() {
  P.remaining = Math.max(0, P.endAt - Date.now());
  let skipped = false;
  // War die App im Hintergrund (z. B. Spotify), werden verpasste Übungen nachgeholt
  while (P.remaining <= 0) {
    if (P.i >= P.tl.length - 1) { finishClass(); return; }
    P.i++; P.lastTick = 0; skipped = true;
    P.endAt += P.tl[P.i].secs * 1000;
    P.remaining = Math.max(0, P.endAt - Date.now());
  }
  const sec = Math.ceil(P.remaining / 1000);
  if (skipped) {
    P.lastTick = sec; beep(880, .15); beep(1175, .2, .18);
    if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    playerRender(); return;
  }
  if (sec <= 3 && sec > 0 && sec !== P.lastTick) { P.lastTick = sec; beep(660, .07); }
  warnNext(sec);
  timerRender();
}
function playerNext() {
  if (P.i >= P.tl.length - 1) { if (confirm('Stunde jetzt abschließen?')) finishClass(); return; }
  P.i++; P.remaining = P.tl[P.i].secs * 1000; P.lastTick = 0;
  if (P.running) P.endAt = Date.now() + P.remaining;
  playerRender();
}
function playerPrev() {
  const c = P.tl[P.i], elapsed = c.secs - (P.running ? Math.max(0, P.endAt - Date.now()) : P.remaining) / 1000;
  if (elapsed > 3 || P.i === 0) P.remaining = c.secs * 1000; else { P.i--; P.remaining = P.tl[P.i].secs * 1000; }
  P.lastTick = 0; if (P.running) P.endAt = Date.now() + P.remaining;
  playerRender();
}
function finishClass() {
  pauseTimer(); Beat.stop(); P.remaining = 0;
  const s = cur; s.done = true; s.doneAt = Date.now();
  const prev = doneLog.find(e => e.id === s.id && s.doneAt - e.t < 3 * 3600e3);
  if (prev) prev.t = s.doneAt; else doneLog.push({ id: s.id, t: s.doneAt, dur: s.dur, rating: s.rating || 0, p: s.participants || 0 });
  persistLog(); persistHistory();
  const mins = Math.round(P.tl.reduce((n, t) => n + t.secs, 0) / 60);
  $('p-done-stats').innerHTML = `<div><b>${mins}</b><span>Minuten</span></div><div><b>${P.tl.total}</b><span>Übungen</span></div><div><b>~${Math.round(6.5 * settings.weight * mins / 60)}</b><span>kcal</span></div>`;
  $('p-main').hidden = true; $('p-done').hidden = false; $('p-bar-fill').style.width = '100%';
  document.querySelector('.p-tools').hidden = true; $('player').scrollTop = 0;
  $('player').style.setProperty('--ph', '#d63a6e');
  $('p-phase').textContent = 'Geschafft';
  $('p-pp').textContent = s.participants || 0;
  $('p-notes').value = s.notes || '';
  renderStars();
  beep(784, .2); beep(988, .2, .22); beep(1319, .35, .44);
  speak('Geschafft! Tolle Stunde.');
  confetti(); renderProgress(); checkBadges();
}
function renderStars() {
  const r = cur.rating || 0;
  $('p-stars').innerHTML = [1, 2, 3, 4, 5].map(n => `<button class="${n <= r ? 'on' : ''}" data-act="star" data-n="${n}" aria-label="${n} von 5 Sternen" aria-pressed="${n <= r}">${ic('star')}</button>`).join('');
}
function logEntryFor(s) { for (let i = doneLog.length - 1; i >= 0; i--) if (doneLog[i].id === s.id) return doneLog[i]; return null; }
function rate(n) {
  cur.rating = n; persistHistory(); renderStars();
  const e = logEntryFor(cur); if (e) { e.rating = n; persistLog(); }
  renderProgress(); checkBadges();
}
function setParticipants(d) {
  cur.participants = clampInt((cur.participants || 0) + d, 0, 999, 0); persistHistory();
  $('p-pp').textContent = cur.participants;
  const e = logEntryFor(cur); if (e) { e.p = cur.participants; persistLog(); }
}
function confetti() {
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const colors = ['#f59e0b', '#f43f5e', '#a855f7', '#14b8a6', '#ffffff', '#ff8db5'];
  $('confetti').innerHTML = Array.from({ length: 70 }, () =>
    `<i style="left:${(Math.random() * 100).toFixed(1)}%;background:${pickOne(colors)};animation-duration:${(2.2 + Math.random() * 2).toFixed(2)}s;animation-delay:${(Math.random() * .6).toFixed(2)}s;transform:rotate(${Math.round(Math.random() * 360)}deg)"></i>`).join('');
  setTimeout(() => { $('confetti').innerHTML = ''; }, 5200);
}

/* ---------- Spotify-Einbettung ---------- */
function updateEmbed(c) {
  const url = spotifyEmbed(settings.playlists[c.ph.key]);
  $('p-embed').hidden = !url;
  if (url && P.embedUrl !== url) { P.embedUrl = url; $('p-frame').src = url; }
  if (!url && P.embedUrl) stopEmbed();
  $('p-hint').textContent = url
    ? 'Die Musik läuft direkt in der App. Im Player einmal auf Play tippen – die Playlist läuft über die ganze Phase weiter.'
    : 'Spotify öffnet die Suche zum Song. Danach zurück in die App wechseln, der Timer läuft weiter. Tipp: Unter „Mehr“ kannst Du Playlists direkt einbetten.';
}
function stopEmbed() { P.embedUrl = ''; const f = $('p-frame'); if (f) f.src = 'about:blank'; }

/* ---------- Ton, Sprache, Bildschirm ---------- */
function audio() {
  try {
    P.ctx = P.ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (P.ctx.state === 'suspended') P.ctx.resume();
    return P.ctx;
  } catch (e) { return null; }
}
function tone(t, freq, dur, vol) {
  const c = audio(); if (!c) return;
  try {
    const o = c.createOscillator(), g = c.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(c.destination);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + .02);
  } catch (e) {}
}
function beep(freq, dur, delay = 0) { if (!settings.sound) return; const c = audio(); if (c) tone(c.currentTime + delay, freq, dur, .18); }
function syncSound() { $('p-sound').innerHTML = ic(settings.sound ? 'bell' : 'bell-off'); $('p-sound').setAttribute('aria-pressed', settings.sound); }
function speak(text) {
  if (!settings.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = 'de-DE'; u.rate = 1.02;
    const de = speechSynthesis.getVoices().find(v => /^de/i.test(v.lang)); if (de) u.voice = de;
    speechSynthesis.speak(u);
  } catch (e) {}
}
function announce() {
  if (!settings.voice || !P.running || P.spoken === P.i) return;
  P.spoken = P.i;
  const c = P.tl[P.i];
  if (c.rest) { speak('Trinkpause. 30 Sekunden.'); return; }
  let prev = null; for (let j = P.i - 1; j >= 0; j--) if (!P.tl[j].rest) { prev = P.tl[j]; break; }
  speak((!prev || prev.ph !== c.ph ? c.ph.label + '. ' : '') + c.ex.name);
}
function warnNext(sec) {
  if (!settings.voice || sec !== 10 || P.warned === P.i || P.tl[P.i].secs < 25) return;
  const nx = P.tl[P.i + 1]; if (!nx) return;
  P.warned = P.i; speak('Gleich: ' + nx.ex.name);
}
function countdown(done) {
  if (P.cd) return; P.cd = true;
  const el = $('p-cd'); let n = 3; el.hidden = false;
  const step = () => {
    if (!P.cd) { el.hidden = true; return; }
    if (n === 0) { el.hidden = true; P.cd = false; done(); return; }
    el.innerHTML = `<span>${n}</span>`; beep(n === 1 ? 880 : 660, .12); n--; setTimeout(step, 900);
  };
  step();
}
async function requestWake() { try { if (navigator.wakeLock && !P.wake) { P.wake = await navigator.wakeLock.request('screen'); P.wake.addEventListener('release', () => { P.wake = null; }); } } catch (e) {} }
function releaseWake() { try { if (P.wake) P.wake.release(); } catch (e) {} P.wake = null; }
function syncTools() {
  const set = (id, on) => { $(id).classList.toggle('on', !!on); $(id).setAttribute('aria-pressed', !!on); };
  set('t-beat', settings.beat); set('t-voice', settings.voice); set('t-big', settings.big); set('t-fs', document.fullscreenElement);
  $('t-fs').hidden = !(document.fullscreenEnabled && $('player').requestFullscreen);
  $('player').classList.toggle('big', !!settings.big);
}
function toggleFs() { try { if (document.fullscreenElement) document.exitFullscreen(); else $('player').requestFullscreen(); } catch (e) {} }

/* =====================================================================
   BEAT
   ===================================================================== */
const Beat = {
  on: false, bpm: 100, n: 0, next: 0, timer: null, cb: null, click: true,
  start(bpm, cb, click) {
    this.stop(); const c = audio(); if (!c) return;
    Object.assign(this, { bpm, cb, click, n: 0, next: c.currentTime + .1, on: true });
    this.timer = setInterval(() => this.sched(), 25);
  },
  sched() { // plant Klicks im Voraus (genauer als setInterval allein)
    const c = P.ctx; if (!c || !this.on) return;
    while (this.next < c.currentTime + .15) {
      const n = this.n, k = n % 8, cb = this.cb;
      if (this.click) tone(this.next, k ? 760 : 1180, .05, k ? .1 : .2);
      setTimeout(() => { if (this.on && this.cb === cb) cb(n); }, Math.max(0, (this.next - c.currentTime) * 1000));
      this.next += 60 / this.bpm; this.n++;
    }
  },
  stop() { clearInterval(this.timer); this.timer = null; this.on = false; this.cb = null; }
};
const dotsHtml = () => [1, 2, 3, 4, 5, 6, 7, 8].map(n => `<i class="${n === 1 ? 'one' : ''}">${n}</i>`).join('');
function lightDots(el, k) { [...el.children].forEach((d, i) => d.classList.toggle('on', i === k)); }
function beatSync() {
  const c = P.tl[P.i];
  const should = settings.beat && P.running && c && !c.rest && !$('player').hidden && !$('p-main').hidden;
  if (!should) { if (!CH.playing) Beat.stop(); return; }
  if (Beat.on && P.beatFor === P.i) return;
  P.beatFor = P.i;
  const dots = $('p-dots'), list = [...$('p-steps').children], n8 = c.ex.steps.length;
  Beat.start(bpmEst(c.music) + P.bpmAdj, n => {
    lightDots(dots, n % 8);
    const si = n8 ? Math.floor(n / 8) % n8 : -1;
    if (si >= 0) list.forEach((li, i) => li.classList.toggle('on', i === si));
  }, true);
}
function renderBeatBar() {
  const c = P.tl[P.i], show = settings.beat && !c.rest;
  $('p-beatbar').hidden = !show; if (!show) return;
  $('p-dots').innerHTML = dotsHtml();
  $('p-bpm').textContent = 'ca. ' + (bpmEst(c.music) + P.bpmAdj) + ' BPM';
  $('p-steps').innerHTML = c.ex.steps.map((s, i) => `<li class="${i ? '' : 'on'}"><span>${i + 1}/${c.ex.steps.length}</span> ${esc(s)}</li>`).join('');
  P.beatFor = -1;
}
function bpmAdj(d) {
  const base = bpmEst(P.tl[P.i].music);
  P.bpmAdj = Math.max(60 - base, Math.min(170 - base, P.bpmAdj + d));
  $('p-bpm').textContent = 'ca. ' + (base + P.bpmAdj) + ' BPM';
  if (Beat.on && !CH.playing) Beat.bpm = base + P.bpmAdj;
}

/* =====================================================================
   CHOREO
   ===================================================================== */
const CH = { playing: false };
function renderChoreo() {
  const c = $('choreo'); if (!c) return;
  const groups = [['warmup', 'Warm-Up'], ['main', 'Hauptteil'], ['cooldown', 'Cool-Down']];
  const opts = groups.map(([k, l]) => `<optgroup label="${l}">${POOLS[k].map(e => `<option value="${esc(e.name)}">${esc(e.name)}</option>`).join('')}</optgroup>`).join('');
  const counts = choreo.blocks.reduce((a, b) => a + b.reps, 0) * 8;
  c.innerHTML = `
    <div class="stage">
      <div class="info" id="ch-info">${choreo.blocks.length ? `${choreo.blocks.length} Schritte · ${counts} Zählzeiten pro Runde` : 'Füge unten Schritte hinzu oder würfle eine Choreo'}</div>
      <h2 id="ch-now">${esc(choreo.name || (choreo.blocks[0] ? choreo.blocks[0].name : 'Deine Choreo'))}</h2>
      <div class="dots" id="ch-dots">${dotsHtml()}</div>
      <div class="stp" id="ch-stp"></div>
      <button class="btn ${CH.playing ? 'btn-light' : 'btn-primary'}" id="ch-play" data-act="ch-play">${ic(CH.playing ? 'pause' : 'play')} ${CH.playing ? 'Stopp' : 'Abspielen'}</button>
    </div>
    <div class="card">
      <div class="card-h"><h2>Choreo bauen</h2><button class="btn btn-soft" data-act="ch-random">${ic('dice')} Zufall</button></div>
      <div class="ch-add"><select class="input" id="ch-sel" aria-label="Schritt wählen">${opts}</select><button class="btn btn-ghost" data-act="ch-add" aria-label="Schritt hinzufügen">${ic('plus')}</button></div>
      <div class="set-line"><span>Tempo</span><span class="stepper"><button data-act="ch-bpm" data-d="-5" aria-label="Langsamer">${ic('minus', 'sm')}</button><output id="ch-bpm">${choreo.bpm} BPM</output><button data-act="ch-bpm" data-d="5" aria-label="Schneller">${ic('plus', 'sm')}</button></span></div>
      <div id="ch-blocks">${choreo.blocks.length ? choreo.blocks.map((b, i) => `
        <div class="ch-block" data-i="${i}"><span class="nm">${i + 1}. ${esc(b.name)}</span>
          <span class="stepper"><button data-act="ch-reps" data-i="${i}" data-d="-1" aria-label="Weniger Wiederholungen">${ic('minus', 'sm')}</button><output>${b.reps}×8</output><button data-act="ch-reps" data-i="${i}" data-d="1" aria-label="Mehr Wiederholungen">${ic('plus', 'sm')}</button></span>
          <span class="ctl"><button class="mini" data-act="ch-move" data-i="${i}" data-d="-1" aria-label="Nach oben">↑</button><button class="mini" data-act="ch-move" data-i="${i}" data-d="1" aria-label="Nach unten">↓</button><button class="mini" data-act="ch-del" data-i="${i}" aria-label="Entfernen">${ic('trash')}</button></span>
        </div>`).join('')
        : '<p class="hint">Wähle einen Schritt und tippe auf +. Jeder Block läuft in 8er-Zählzeiten, die ganze Choreo wiederholt sich als Schleife.</p>'}</div>
      ${choreo.blocks.length ? `<div class="btn-row" style="margin-top:12px"><button class="btn btn-ghost" data-act="ch-save">${ic('check')} Speichern</button><button class="btn btn-ghost" data-act="ch-clear">${ic('close')} Leeren</button></div>` : ''}
    </div>
    ${choreos.length ? `<div class="card"><h2>Gespeicherte Choreos</h2>${choreos.map((x, i) => `
      <div class="list-item"><span class="nm">${esc(x.name || 'Choreo')} <small>· ${x.blocks.length} Schritte · ${x.bpm} BPM</small></span>
        <button class="btn btn-soft" data-act="ch-load" data-i="${i}">Laden</button><button class="mini" data-act="ch-remove" data-i="${i}" aria-label="Choreo löschen">${ic('trash')}</button></div>`).join('')}</div>` : ''}`;
}
function chStop() { if (CH.playing) { CH.playing = false; Beat.stop(); } }
function chToggle() {
  if (CH.playing) { chStop(); renderChoreo(); return; }
  if (!choreo.blocks.length) return toast('Erst Schritte hinzufügen');
  CH.playing = true; renderChoreo();
  const dots = $('ch-dots');
  Beat.start(choreo.bpm, n => {
    const total = choreo.blocks.reduce((a, b) => a + b.reps, 0) * 8; if (!total) return;
    const p = n % total; let acc = 0, bi = 0;
    for (; bi < choreo.blocks.length; bi++) { if (p < acc + choreo.blocks[bi].reps * 8) break; acc += choreo.blocks[bi].reps * 8; }
    const b = choreo.blocks[bi]; if (!b) return;
    const within = p - acc, rep = Math.floor(within / 8), ex = exByName(b.name);
    lightDots(dots, within % 8);
    $('ch-now').textContent = b.name;
    $('ch-info').textContent = `Schritt ${bi + 1}/${choreo.blocks.length} · Wiederholung ${rep + 1}/${b.reps} · Runde ${Math.floor(n / total) + 1}`;
    $('ch-stp').textContent = ex && ex.steps.length ? ex.steps[rep % ex.steps.length] : '';
    document.querySelectorAll('.ch-block').forEach(el => el.classList.toggle('now', +el.dataset.i === bi));
  }, true);
}
function chChanged() { chStop(); persistChoreo(); renderChoreo(); }

/* =====================================================================
   FORTSCHRITT
   ===================================================================== */
function weekStart(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); }
function prevWeek(w) { const d = new Date(w); d.setDate(d.getDate() - 7); return d.getTime(); }
function computeStats() {
  const byWeek = {};
  doneLog.forEach(e => { const w = weekStart(e.t), b = byWeek[w] = byWeek[w] || { n: 0, min: 0 }; b.n++; b.min += e.dur; });
  const now = weekStart(Date.now());
  let streak = 0, w = byWeek[now] ? now : prevWeek(now);
  while (byWeek[w]) { streak++; w = prevWeek(w); }
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b);
  let best = 0, run = 0, last = 0;
  weeks.forEach(k => { run = last && prevWeek(k) === last ? run + 1 : 1; last = k; best = Math.max(best, run); });
  const mins = doneLog.reduce((n, e) => n + e.dur, 0);
  const rated = doneLog.filter(e => e.rating), withP = doneLog.filter(e => e.p);
  return {
    n: doneLog.length, mins, byWeek, now, streak, best,
    thisWeek: byWeek[now] ? byWeek[now].n : 0,
    goalHit: weeks.some(k => byWeek[k].n >= settings.goal),
    five: doneLog.some(e => e.rating === 5),
    avgRating: rated.length ? rated.reduce((n, e) => n + e.rating, 0) / rated.length : 0,
    avgP: withP.length ? withP.reduce((n, e) => n + e.p, 0) / withP.length : 0,
    kcal: Math.round(6.5 * settings.weight * mins / 60) // MET ca. 6,5 – grobe Schätzung
  };
}
function renderProgress() {
  const c = $('progress'); if (!c) return;
  const s = computeStats(), goal = settings.goal, pct = Math.min(1, s.thisWeek / goal), R = 52, C = 2 * Math.PI * R;
  const weeks = []; let w = s.now; for (let i = 0; i < 8; i++) { weeks.unshift(w); w = prevWeek(w); }
  const vals = weeks.map(k => (s.byWeek[k] ? s.byWeek[k].min : 0)), max = Math.max(60, ...vals);
  const bars = weeks.map((k, i) => {
    const h = Math.round(vals[i] / max * 70), x = 8 + i * 38.5, d = new Date(k), bh = Math.max(h, 4);
    return `<rect class="${!vals[i] ? 'zero' : i === 7 ? 'now' : ''}" x="${x}" y="${88 - bh}" width="27" height="${bh}" rx="6"/>` +
      (vals[i] ? `<text class="v" x="${x + 13.5}" y="${83 - h}">${vals[i]}</text>` : '') +
      `<text x="${x + 13.5}" y="102">${i === 7 ? 'diese' : String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.'}</text>`;
  }).join('');
  const grad = id => `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4503c"/><stop offset=".5" stop-color="#d63a6e"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>`;
  const extra = (s.avgRating ? `<div class="fact"><b>${s.avgRating.toFixed(1).replace('.', ',')} ★</b><span>Ø Bewertung</span></div>` : '')
    + (s.avgP ? `<div class="fact"><b>${Math.round(s.avgP)}</b><span>Ø Teilnehmende</span></div>` : '');
  c.innerHTML = `
    <div class="card"><div class="card-h"><h2>Diese Woche</h2><span class="pill">Ziel: ${goal}×</span></div>
      <div class="dash">
        <div class="goal-ring" role="img" aria-label="${s.thisWeek} von ${goal} Stunden diese Woche">
          <svg viewBox="0 0 124 124">${grad('ggrad')}<circle class="bg" cx="62" cy="62" r="${R}"/><circle class="fg" cx="62" cy="62" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct)).toFixed(1)}"/></svg>
          <div class="mid"><b>${s.thisWeek}/${goal}</b><span>Stunden</span></div>
        </div>
        <div class="dash-txt"><b>${s.thisWeek >= goal ? 'Wochenziel erreicht – stark!' : s.thisWeek ? `Noch ${goal - s.thisWeek} bis zum Wochenziel` : 'Diese Woche geht noch was!'}</b>
          <span>${s.streak ? `${s.streak} ${s.streak === 1 ? 'Woche' : 'Wochen'} in Folge aktiv` : 'Starte Deine Serie mit einer Stunde'}</span></div>
      </div>
        <div class="facts">
          <div class="fact"><b>${s.n}</b><span>Stunden gesamt</span></div>
          <div class="fact"><b>${s.best}</b><span>Beste Serie (Wochen)</span></div>
          <div class="fact"><b>${Math.floor(s.mins / 60)} h ${s.mins % 60} min</b><span>Tanzzeit</span></div>
          <div class="fact"><b>~${s.kcal.toLocaleString('de-DE')}</b><span>kcal geschätzt</span></div>
          ${extra}
        </div>
      <p class="hint">Serie = Wochen am Stück mit mindestens einer Stunde. Kalorien grob geschätzt (Zumba ≈ 6,5 MET bei ${settings.weight} kg).</p>
    </div>
    <div class="card"><h2>Minuten pro Woche</h2>
      <svg class="bars" viewBox="0 0 320 108" role="img" aria-label="Tanzminuten der letzten 8 Wochen: ${vals.join(', ')}">${grad('bgrad')}${bars}</svg></div>
    <div class="card"><h2>Abzeichen</h2><div class="badges">${BADGES.map(b => { const on = b.ok(s); return `<div class="bdg${on ? ' on' : ''}">${ic(b.icon)}<b>${esc(b.name)}</b>${on ? 'erreicht' : 'offen'}</div>`; }).join('')}</div></div>`;
}
function checkBadges() {
  const s = computeStats(), fresh = BADGES.filter(b => b.ok(s) && !settings.badges.includes(b.id));
  if (!fresh.length) return;
  settings.badges.push(...fresh.map(b => b.id)); persistSettings();
  setTimeout(() => toast('Neues Abzeichen: ' + fresh.map(b => b.name).join(', ')), 1200);
}
function renderHistory() {
  const c = $('history'); if (!c) return;
  if (!hist.length) {
    c.innerHTML = `<div class="card"><div class="empty">${ic('calendar')}<h3>Noch keine Stunden</h3><p>Erstelle Deine erste Stunde – sie erscheint dann hier.</p></div></div>`;
    return;
  }
  c.innerHTML = `<div class="card"><div class="card-h"><h2>Letzte Stunden</h2><span class="pill">${hist.length}</span></div><ul class="hist-list">${hist.map((s, i) => `
    <li class="hist"><button class="hist-main" data-act="hist-open" data-i="${i}">
        <span class="hist-top">${esc(s.date)} ${s.done ? ic('check', 'sm') : ''}</span>
        <span class="hist-sub"><span>${s.dur} min${LEVELS[s.level] ? ' · ' + LEVELS[s.level] : ''}</span>${s.rating ? `<span class="mini-stars" aria-label="${s.rating} Sterne">${ic('star').repeat(s.rating)}</span>` : ''}${s.participants ? `<span>${ic('users')} ${s.participants}</span>` : ''}</span>
        <span class="hist-ex">${esc(allNames(s).join(' · '))}</span>
      </button><button class="mini" data-act="hist-del" data-i="${i}" aria-label="Eintrag löschen">${ic('trash')}</button></li>`).join('')}</ul>
    <div style="text-align:center"><button class="text-btn" data-act="hist-clear">Verlauf leeren</button></div></div>`;
}
function deleteHistory(i) {
  const s = hist[i]; if (!s) return;
  hist.splice(i, 1); persistHistory();
  const wasCur = s === cur; if (wasCur) { cur = null; renderSession(); }
  renderHistory();
  toast('Eintrag gelöscht', () => { hist.splice(Math.min(i, hist.length), 0, s); persistHistory(); if (wasCur) { cur = s; renderSession(); } renderHistory(); });
}

/* =====================================================================
   TEILEN, VORLAGEN, BACKUP
   ===================================================================== */
const toB64 = str => { let b = ''; new TextEncoder().encode(str).forEach(x => { b += String.fromCharCode(x); }); return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const fromB64 = str => { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return new TextDecoder().decode(Uint8Array.from(atob(str), x => x.charCodeAt(0))); };
function sharePayload(s) { const p = packSession(s); return { d: p.dur, l: p.level, e: p.e, m: p.m }; }
const shareLink = s => location.href.split('#')[0] + '#s=' + toB64(JSON.stringify(sharePayload(s)));
async function shareSession() {
  if (!cur) return;
  const url = shareLink(cur), text = `Zumba-Stunde (${cur.dur} min) – zum Öffnen im Zumba Planer`;
  if (navigator.share) {
    try { await navigator.share({ title: 'Zumba Planer', text, url }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  copyText(url, 'Link kopiert – einfach weitergeben');
}
function loadFromHash() {
  const m = /^#s=([A-Za-z0-9_-]{1,8000})$/.exec(location.hash); if (!m) return;
  let s = null;
  try { s = unpackSession(JSON.parse(fromB64(m[1]))); } catch (e) { s = null; }
  try { window.history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  if (!s) { toast('Link ungültig'); return; }
  s.id = Date.now(); s.date = nowDate(); s.done = false; delete s.rating; delete s.participants; delete s.doneAt; s.notes = '';
  hist.unshift(s); hist = hist.slice(0, 40); persistHistory();
  cur = s; showTab('plan'); renderSession(true); renderHistory(); toast('Geteilte Stunde geladen');
}
function saveTemplate() {
  if (!cur) return;
  const name = (prompt('Name der Vorlage:', `${cur.dur} min ${LEVELS[cur.level] || 'Gemischt'}`) || '').trim().slice(0, 40);
  if (!name) return;
  templates.unshift({ name, data: packSession(cur) }); templates = templates.slice(0, 20);
  persistTpl(); renderMore(); toast('Vorlage gespeichert – zu finden unter „Mehr“');
}
function useTemplate(i) {
  const t = templates[i], s = t && unpackSession(t.data); if (!s) return toast('Vorlage ungültig');
  s.id = Date.now(); s.date = nowDate(); s.done = false; delete s.rating; delete s.participants; delete s.doneAt; s.notes = '';
  hist.unshift(s); hist = hist.slice(0, 40); persistHistory();
  cur = s; showTab('plan'); renderSession(true); renderHistory(); toast(`Vorlage „${t.name}“ geladen`);
}
function exportData() {
  const data = { app: 'zumba-planer', v: 3, exported: new Date().toISOString(), settings, favorites: [...favs], history: hist.map(packSession), log: doneLog, templates, choreos, choreo };
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'zumba-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('Backup gespeichert');
}
function importData(input) {
  const f = input.files && input.files[0]; input.value = '';
  if (!f) return;
  if (f.size > 5e6) return toast('Datei ist zu groß');
  const r = new FileReader();
  r.onerror = () => toast('Datei nicht lesbar');
  r.onload = () => {
    let d; try { d = JSON.parse(r.result); } catch (e) { return toast('Keine gültige Backup-Datei'); }
    if (!d || d.app !== 'zumba-planer') return toast('Das ist keine Zumba-Planer-Datei');
    if (!confirm('Backup einspielen? Die aktuellen Daten auf diesem Gerät werden ersetzt.')) return;
    chStop();
    settings = Object.assign({}, DEFAULTS, cleanSettings(d.settings));
    favs = new Set(asArray(d.favorites).map(f => typeof f === 'string' ? f : f && f.name).filter(n => EX.has(n)));
    hist = asArray(d.history).map(h => unpackSession(h && h.session ? h.session : h)).filter(Boolean).slice(0, 40);
    doneLog = asArray(d.log).map(cleanLogEntry).filter(Boolean);
    templates = asArray(d.templates).map(cleanTemplate).filter(Boolean).slice(0, 20);
    choreos = asArray(d.choreos).map(cleanChoreo).filter(c => c && c.blocks.length).slice(0, 20);
    choreo = cleanChoreo(d.choreo) || { name: '', bpm: 100, blocks: [] };
    persistSettings(); persistFavs(); persistHistory(); persistLog(); persistTpl(); persistChoreos(); persistChoreo();
    cur = hist[0] && !hist[0].done ? hist[0] : null;
    applyTheme(); syncControls(); renderAll(); toast('Backup eingespielt');
  };
  r.readAsText(f);
}

/* =====================================================================
   MEHR
   ===================================================================== */
const segBtn = (k, v, label) => `<button data-act="set" data-k="${k}" data-v="${v}">${label}</button>`;
const switchRow = (k, label, sub) => `<label class="switch"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" data-change="toggle" data-k="${k}"><span class="tr"></span></label>`;
function renderMore() {
  const c = $('more'); if (!c) return;
  const standalone = window.matchMedia && matchMedia('(display-mode: standalone)').matches;
  c.innerHTML = `
    <div class="card"><h2>Einstellungen</h2>
      <div class="set-row"><span class="lbl">Design</span><div class="seg">${segBtn('theme', 'auto', 'Automatisch')}${segBtn('theme', 'light', 'Hell')}${segBtn('theme', 'dark', 'Dunkel')}</div></div>
      <div class="set-row"><span class="lbl">Musik zuerst öffnen in</span><div class="seg">${segBtn('music', 'spotify', 'Spotify')}${segBtn('music', 'youtube', 'YouTube')}</div></div>
      <div class="set-row">${switchRow('sound', 'Signaltöne', 'Countdown und Wechsel-Signal im Kursmodus')}</div>
      <div class="set-row">${switchRow('water', 'Trinkpausen', '30 Sekunden zwischen den Phasen')}</div>
      <div class="set-row">${switchRow('voice', 'Sprachansagen', 'Nächste Übung wird angesagt')}</div>
      <div class="set-row">${switchRow('beat', 'Beat-Zähler', '1–8 mit Klick und mitlaufender Anleitung')}</div>
    </div>
    <div class="card"><details class="pl"><summary>Spotify-Playlists pro Phase ${ic('chevron')}</summary>
      <p class="hint">In Spotify bei einer Playlist auf „Teilen“ → „Link kopieren“ tippen und hier einfügen. Im Kursmodus läuft die Musik dann direkt in der App.</p>
      ${PHASES.map(ph => { const v = settings.playlists[ph.key] || ''; return `<label class="pl-row"><span>${ph.label}</span><input class="input${v ? (spotifyEmbed(v) ? ' ok' : ' bad') : ''}" type="url" inputmode="url" autocomplete="off" spellcheck="false" placeholder="https://open.spotify.com/playlist/…" value="${esc(v)}" data-input="playlist" data-k="${ph.key}"></label>`; }).join('')}
    </details></div>
    <div class="card"><h2>Ziel &amp; Profil</h2>
      <div class="set-row"><div class="field"><span>Stunden pro Woche</span><span class="stepper"><button data-act="goal" data-d="-1" aria-label="Weniger">${ic('minus', 'sm')}</button><output>${settings.goal}</output><button data-act="goal" data-d="1" aria-label="Mehr">${ic('plus', 'sm')}</button></span></div></div>
      <div class="set-row"><div class="field"><label for="weight">Gewicht in kg <small class="hint">(für die Kalorien-Schätzung)</small></label><input class="input" id="weight" type="number" inputmode="numeric" min="30" max="250" value="${settings.weight}" data-change="weight"></div></div>
    </div>
    <div class="card"><h2>Vorlagen</h2>
      ${templates.length ? templates.map((t, i) => { const d = unpackSession(t.data); return `<div class="list-item"><span class="nm">${esc(t.name)} <small>· ${d ? d.dur + ' min' : ''}</small></span><button class="btn btn-soft" data-act="tpl-use" data-i="${i}">Laden</button><button class="mini" data-act="tpl-del" data-i="${i}" aria-label="Vorlage löschen">${ic('trash')}</button></div>`; }).join('')
        : '<p class="hint">Noch keine Vorlage. Erstelle eine Stunde und tippe dort auf „Vorlage“ – ideal für feste Kurse.</p>'}
    </div>
    <div class="card"><h2>Sichern &amp; Umziehen</h2>
      <div class="btn-row"><button class="btn btn-ghost" data-act="export">${ic('download')} Sichern</button>
        <button class="btn btn-ghost" data-act="import-pick">${ic('upload')} Laden</button></div>
      <input type="file" id="import-file" accept="application/json,.json" hidden data-change="import">
      <p class="hint">Das Backup enthält Verlauf, Fortschritt, Favoriten, Vorlagen, Choreos und Einstellungen – damit ziehst Du auf ein neues Handy um. Einzelne Stunden teilst Du per „Teilen“-Link.</p>
    </div>
    <div class="card"><div class="about"><span class="brand-mark">${ic('logo')}</span><div><h2>Zumba Planer</h2><p class="hint">${ALL.length} Übungen · ${MUSIC_BY_TITLE.size} Songs · ${RHYTHM_LIST.length} Rhythmen. Alle Daten bleiben auf diesem Gerät, es gibt kein Konto und kein Tracking.</p></div></div>
      ${installEvt ? `<button class="btn btn-primary btn-block" style="margin-top:12px" data-act="install">${ic('install')} Als App installieren</button>`
        : standalone ? '' : '<p class="hint">Als App nutzen: im Browser-Menü „Zum Startbildschirm hinzufügen“ wählen (iPhone: Teilen-Symbol → „Zum Home-Bildschirm“).</p>'}
    </div>`;
  syncControls();
}

/* =====================================================================
   DESIGN, TABS, STEUERUNG
   ===================================================================== */
const TABS = ['plan', 'library', 'choreo', 'progress', 'more'];
function showTab(name) {
  if (!TABS.includes(name)) return;
  if (name !== 'choreo' && CH.playing) { chStop(); renderChoreo(); }
  TABS.forEach(t => $('tab-' + t).classList.toggle('active', t === name));
  document.querySelectorAll('.tabbar button').forEach(b => { const on = b.dataset.tab === name; b.classList.toggle('active', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (name === 'library') renderLibrary();
  window.scrollTo({ top: 0 });
}
function setSetting(k, v) {
  settings[k] = v; persistSettings(); syncControls();
  if (k === 'theme') applyTheme();
  if (k === 'music' && cur) renderSession();
}
function syncControls() {
  document.querySelectorAll('[data-act="set"]').forEach(b => { const on = String(settings[b.dataset.k]) === b.dataset.v; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
  document.querySelectorAll('[data-change="toggle"]').forEach(i => { i.checked = !!settings[i.dataset.k]; });
}
const darkMq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : { matches: false };
function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && darkMq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  $('theme-btn').innerHTML = ic(settings.theme === 'auto' ? 'auto' : dark ? 'moon' : 'sun');
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#110c15' : '#faf6f2';
}
if (darkMq.addEventListener) darkMq.addEventListener('change', applyTheme);

function renderAll() { renderSession(); renderLibrary(); renderChoreo(); renderProgress(); renderHistory(); renderMore(); }

/* ---------- Ereignisse (keine Inline-Handler, damit die CSP greift) ---------- */
const ACT = {
  tab: el => showTab(el.dataset.tab),
  theme: () => {
    setSetting('theme', { auto: 'light', light: 'dark', dark: 'auto' }[settings.theme] || 'auto');
    toast({ auto: 'Design: automatisch', light: 'Design: hell', dark: 'Design: dunkel' }[settings.theme]);
  },
  set: el => setSetting(el.dataset.k, el.dataset.k === 'dur' ? +el.dataset.v : el.dataset.v),
  generate: () => generate(),
  start: () => openPlayer(),
  share: () => shareSession(),
  template: () => saveTemplate(),
  copy: () => cur && copyText(planText(cur), 'Plan kopiert'),
  print: () => window.print(),
  ex: el => openModal(el.dataset.name),
  fav: el => toggleFav(el.dataset.name),
  swap: el => swapEx(el.dataset.ph, +el.dataset.i),
  remove: el => removeEx(el.dataset.ph, +el.dataset.i),
  'add-ex': el => addEx(el.dataset.ph),
  'swap-song': el => swapSong(el.dataset.ph),
  spotify: (el, e) => { e.preventDefault(); openSpotify(el.dataset.title || ''); },
  'modal-bg': (el, e) => { if (e.target === el) closeModal(); },
  'modal-close': () => closeModal(),
  'm-fav': () => modalName && toggleFav(modalName),
  'toast-undo': () => { const u = toastUndo; toastUndo = null; $('toast').classList.remove('show'); if (u) u(); },
  'lib-filter': el => { libFilter = el.dataset.k; renderLibrary(); },
  'hist-open': el => { const s = hist[+el.dataset.i]; if (s) { cur = s; showTab('plan'); renderSession(true); } },
  'hist-del': el => deleteHistory(+el.dataset.i),
  'hist-clear': () => {
    if (!confirm('Gesamten Verlauf löschen? Deine Fortschritts-Statistik bleibt erhalten.')) return;
    hist = []; cur = null; persistHistory(); renderSession(); renderHistory();
  },
  'p-close': () => closePlayer(!$('p-done').hidden),
  'p-sound': () => { settings.sound = !settings.sound; persistSettings(); syncSound(); syncControls(); },
  'p-play': () => togglePlay(),
  'p-prev': () => playerPrev(),
  'p-next': () => playerNext(),
  'p-howto': () => openModal(P.tl[P.i].ex.name),
  't-beat': () => { settings.beat = !settings.beat; persistSettings(); syncTools(); syncControls(); renderBeatBar(); beatSync(); },
  't-voice': () => {
    settings.voice = !settings.voice; persistSettings(); syncTools(); syncControls();
    if (settings.voice) speak('Ansagen sind an.'); else if ('speechSynthesis' in window) speechSynthesis.cancel();
  },
  't-big': () => { settings.big = !settings.big; persistSettings(); syncTools(); },
  't-fs': () => toggleFs(),
  bpm: el => bpmAdj(+el.dataset.d),
  star: el => rate(+el.dataset.n),
  pp: el => setParticipants(+el.dataset.d),
  'p-finish': () => closePlayer(true),
  goal: el => { settings.goal = clampInt(settings.goal + +el.dataset.d, 1, 14, 2); persistSettings(); renderMore(); renderProgress(); },
  'tpl-use': el => useTemplate(+el.dataset.i),
  'tpl-del': el => {
    const i = +el.dataset.i, t = templates[i]; if (!t) return;
    templates.splice(i, 1); persistTpl(); renderMore();
    toast('Vorlage gelöscht', () => { templates.splice(i, 0, t); persistTpl(); renderMore(); });
  },
  export: () => exportData(),
  'import-pick': () => $('import-file').click(),
  install: async () => { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; renderMore(); },
  'ch-play': () => chToggle(),
  'ch-add': () => { const n = $('ch-sel').value; if (!EX.has(n)) return; if (choreo.blocks.length >= 16) return toast('Maximal 16 Schritte'); choreo.blocks.push({ name: n, reps: 2 }); chChanged(); },
  'ch-random': () => { const reps = [2, 2, 4, 2]; choreo.blocks = shuffle(POOLS.main).slice(0, 4).map((e, i) => ({ name: e.name, reps: reps[i] })); choreo.name = ''; chChanged(); },
  'ch-reps': el => { const b = choreo.blocks[+el.dataset.i]; if (b) { b.reps = clampInt(b.reps + +el.dataset.d, 1, 16, 2); chChanged(); } },
  'ch-move': el => { const i = +el.dataset.i, j = i + +el.dataset.d; if (j < 0 || j >= choreo.blocks.length) return; [choreo.blocks[i], choreo.blocks[j]] = [choreo.blocks[j], choreo.blocks[i]]; chChanged(); },
  'ch-del': el => { choreo.blocks.splice(+el.dataset.i, 1); chChanged(); },
  'ch-bpm': el => { choreo.bpm = clampInt(choreo.bpm + +el.dataset.d, 60, 170, 100); persistChoreo(); $('ch-bpm').textContent = choreo.bpm + ' BPM'; if (CH.playing) Beat.bpm = choreo.bpm; },
  'ch-save': () => {
    const name = (prompt('Name der Choreo:', choreo.name || 'Meine Choreo') || '').trim().slice(0, 40); if (!name) return;
    choreo.name = name; choreos.unshift(JSON.parse(JSON.stringify(choreo))); choreos = choreos.slice(0, 20);
    persistChoreos(); persistChoreo(); renderChoreo(); toast('Choreo gespeichert');
  },
  'ch-clear': () => { const old = JSON.parse(JSON.stringify(choreo)); choreo.blocks = []; choreo.name = ''; chChanged(); toast('Choreo geleert', () => { choreo = old; chChanged(); }); },
  'ch-load': el => { const c = choreos[+el.dataset.i]; if (!c) return; chStop(); choreo = JSON.parse(JSON.stringify(c)); persistChoreo(); renderChoreo(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  'ch-remove': el => {
    const i = +el.dataset.i, c = choreos[i]; if (!c) return;
    choreos.splice(i, 1); persistChoreos(); renderChoreo();
    toast('Choreo gelöscht', () => { choreos.splice(i, 0, c); persistChoreos(); renderChoreo(); });
  }
};
const INPUT = {
  'lib-search': () => renderLibrary(),
  notes: el => { if (cur) { cur.notes = el.value.slice(0, 4000); persistHistory(); } },
  playlist: el => {
    const v = el.value.trim(), ok = !v || !!spotifyEmbed(v);
    el.classList.toggle('ok', !!v && ok); el.classList.toggle('bad', !!v && !ok);
    if (ok) { if (v) settings.playlists[el.dataset.k] = v.slice(0, 300); else delete settings.playlists[el.dataset.k]; persistSettings(); }
  }
};
const CHANGE = {
  toggle: el => setSetting(el.dataset.k, el.checked),
  weight: el => { settings.weight = clampInt(el.value, 30, 250, 65); el.value = settings.weight; persistSettings(); renderProgress(); },
  import: el => importData(el),
  'lib-rhythm': el => { libRhythm = RHYTHM_LIST.includes(el.value) ? el.value : ''; renderLibrary(); }
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = ACT[el.dataset.act]; if (fn) fn(el, e);
});
document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el && INPUT[el.dataset.input]) INPUT[el.dataset.input](el, e); });
document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, e); });
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if ($('modal').classList.contains('open')) closeModal(); else if (!$('player').hidden) closePlayer(!$('p-done').hidden); return; }
  if ($('player').hidden || $('modal').classList.contains('open') || !$('p-done').hidden) return;
  if (e.target.matches('input, textarea, select')) return;
  if (e.key === ' ' && !e.target.closest('button')) { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowRight') playerNext();
  else if (e.key === 'ArrowLeft') playerPrev();
});
// Wischen im Kursmodus: links = weiter, rechts = zurück
(() => {
  let sx = 0, sy = 0;
  const m = $('p-main');
  m.addEventListener('touchstart', e => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; }, { passive: true });
  m.addEventListener('touchend', e => {
    const t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50) dx < 0 ? playerNext() : playerPrev();
  }, { passive: true });
})();
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (P.running) { tick(); requestWake(); }
  if (P.away && Date.now() - P.away < 6 * 3600e3) { P.away = 0; if (!$('player').hidden && P.running) toast('Willkommen zurück – der Timer läuft weiter'); }
});
document.addEventListener('fullscreenchange', () => { if (!$('player').hidden) syncTools(); });
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderMore(); });
window.addEventListener('appinstalled', () => { installEvt = null; renderMore(); toast('Zumba Planer ist installiert'); });
window.addEventListener('hashchange', loadFromHash);

/* ---------- Start ---------- */
loadState();
applyTheme(); syncControls(); renderAll();
try { const t = new URLSearchParams(location.search).get('tab'); if (t) showTab(t); } catch (e) {}
loadFromHash();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
