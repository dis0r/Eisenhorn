/* EISENHORN Trainer — App-Logik. Vanilla JS, keine Abhängigkeiten. */
(function () {
'use strict';

/* ---------- Kraftstufen (exakt aus den EISENHORN-Kraftstufendiagrammen) ----------
   Werte gelten pro Kolben. Start = f × (Stufe + 1).
   Ab Stufe 8 ansteigende Kraftkurve: Ende = Start + dm × (Stufe − d0).
   EISENHORN DS hat zwei Schienen mit zwei Kolben → alle Werte × 2.            */
var KOLBEN = [
  { id: 12, label: 'Kolben 12', f: 3,   dm: 2,   d0: 6 },
  { id: 26, label: 'Kolben 26', f: 6.5, dm: 5.5, d0: 7 }
];
var STUFEN = []; for (var i = 0; i < 23; i++) STUFEN.push(1 + i * 0.5);
var RLABEL = { Stange: 'Griffstange', Seilzug: 'Seilzug', Ohne: 'Ohne Stange' };
var RMODES = ['Stange', 'Seilzug', 'Ohne'];
var MUSKELN = ['Brust', 'Rücken', 'Schultern', 'Arme', 'Beine', 'Bauch', 'Ganzkörper'];

/* ---------- Speicher ---------- */
var K = 'eh.v1';
var db = load();
function load() {
  var d = { set: { ds: true, kolben: 1, bw: 85, ruest: 'Stange', rest: 75, reps: 8, hideDS: false },
            stufen: {}, ruestOv: {}, cfg: {}, log: [], sessions: [] };
  try {
    var raw = localStorage.getItem(K);
    if (raw) {
      var p = JSON.parse(raw);
      /* Einstellungen key-für-key mergen, damit später ergänzte Vorgaben
         ihre Standardwerte behalten. Alles andere direkt übernehmen. */
      for (var k in p) if (k !== 'set') d[k] = p[k];
      if (p.set) for (var s in p.set) if (p.set[s] !== null && p.set[s] !== undefined) d.set[s] = p.set[s];
      for (var g in d.cfg) if (d.cfg[g]) delete d.cfg[g].sets;   // Feld aus einer Vorversion
    }
  } catch (e) {}
  return d;
}
function save() { try { localStorage.setItem(K, JSON.stringify(db)); } catch (e) {} }

/* ---------- Übungen ---------- */
var D = window.EH_DATA;
var EX = D.L.map(function (row) {
  var name = row[0], slug = row[1], det = D.DETAIL[slug] || null;
  return { name: name, slug: slug, det: det, x: (D.EXTRA || {})[slug] || null, ds: /^2\d\d-/.test(slug),
           m: det ? det.m : muskelOf(name), r0: det ? det.r : ruestOf(name, slug) };
});
var BY = {}; EX.forEach(function (e) { BY[e.slug] = e; });

function ruestOf(name, slug) {
  var s = (name + ' ' + slug).toLowerCase();
  if (s.indexOf('seilzug') >= 0) return 'Seilzug';
  if (s.indexOf('griffband') >= 0 || s.indexOf('horn') >= 0 || s.indexOf('körpergewicht') >= 0) return 'Ohne';
  if (s.indexOf('griffstange') >= 0 || s.indexOf('stange') >= 0) return 'Stange';
  if (/klimmzug|dips|liegest|plank|mountain|crunch|beinheben|unterarmst|farmer|hüftheben|beckenheben|rotation|schienbein/.test(s)) return 'Ohne';
  if (/latzug|rudern|bankdr|brustdr|schulterdr|bizepscurl|kreuzheben|kniebeug|beinpresse|wadenheben|trizeps|butterfly|aufrechtes|schulterheben|nackenheben|shrugs|ausfallschritt|beinbeuger/.test(s)) return 'Stange';
  return 'Ohne';
}
function muskelOf(name) {
  var s = name.toLowerCase();
  if (/schulter|nacken|shrug|seitenheben|facepull|rotator/.test(s)) return 'Schultern';
  if (/latzug|rudern|klimmzug|kreuzheben|ruderzug|reverse fly/.test(s)) return 'Rücken';
  if (/brust|bankdr|butterfly|fly|liegest|dips/.test(s)) return 'Brust';
  if (/bizeps|trizeps|curl|unterarm/.test(s)) return 'Arme';
  if (/knie|bein|waden|ausfallschritt|hüft|becken|adduktion|abduktion|kickback|laufschritt|schienbein/.test(s)) return 'Beine';
  if (/crunch|rumpf|plank|twist|bauch|beinheben|unterarmstütz|mountain/.test(s)) return 'Bauch';
  return 'Ganzkörper';
}
function ruestOfEx(e) { return db.ruestOv[e.slug] || e.r0; }

/* Sätze, Wiederholungen und Pausenzeit pro Übung. Ohne eigenen Eintrag gelten
   die Standardwerte aus den Einstellungen. */
/* Der offene Satz ist eine Liste von Wiederholungs-Eingaben: 4, 6, 8 gehören
   zusammen zu einem Satz. Erst beim Speichern startet die Pause. */
/* Offener Satz im Übungsdetail — gleiche Struktur wie im Training. */
function soloList(slug) {
  if (!st.solo[slug]) {
    var p = lastPerf(slug), last = null;
    if (p) {
      var rows = db.log.filter(function (l) { return l.slug === slug && isSet(l); });
      var lr = rows[rows.length - 1];
      if (lr) last = lr.rl || null;
    }
    if (last && last.length >= 3) st.solo[slug] = last.slice();
    else { var r = cfgOf(slug).reps; st.solo[slug] = [r, r, r]; }
  }
  return st.solo[slug];
}
function satzBlock(slug, list, n, prefix) {
  var h = '<div class="cursat"><div class="cursath"><span>' + prefix + ' — ' + list.length + ' Durchgänge</span>' +
    '<b>' + sum(list) + ' Wdh. gesamt</b></div><div class="replist">';
  list.forEach(function (v, i) {
    h += '<div class="reprow"><span class="mono">' + (i + 1) + '.</span>' +
      '<div class="sbtn sm" data-a="rep:' + i + '|-1">–</div>' +
      '<input type="number" inputmode="numeric" min="1" max="99" value="' + v + '" data-i="' + i + '" class="repin">' +
      '<div class="sbtn sm" data-a="rep:' + i + '|1">+</div>' +
      '<span class="rdel' + (list.length > 3 ? '' : ' off') + '" data-a="repdel:' + i + '">✕</span></div>';
  });
  return h + '</div><div class="ghost thin" data-a="repadd">+ Wiederholung</div></div>';
}

function curList() {
  var w = st.wo; if (!w) return [];
  if (!w.cur[w.idx]) {
    var done = w.done[w.idx] || [];
    var last = done.length ? done[done.length - 1].rl : null;
    if (last && last.length >= 3) w.cur[w.idx] = last.slice();
    else {
      var r0 = cfgOf(w.ids[w.idx]).reps;
      w.cur[w.idx] = [r0, r0, r0];   // ein Satz besteht aus mindestens drei Durchgängen
    }
  }
  return w.cur[w.idx];
}
/* Die Liste, die gerade bearbeitet wird: im Training der offene Satz,
   im Übungsdetail der Satz dieser Übung. */
function activeList() { return st.wo ? curList() : (st.detail ? soloList(st.detail) : []); }
function setCurAt(i, v) {
  if (isNaN(v)) return;
  var a = activeList();
  if (a[i] === undefined) return;
  a[i] = Math.max(1, Math.min(99, v));
}
function addCur() {
  var a = activeList();
  if (a.length && a.length < 12) a.push(a[a.length - 1]);
}
function delCur(i) {
  var a = activeList();
  if (a.length > 3) a.splice(i, 1);   // drei Durchgänge sind das Minimum
}
function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
function cfgOf(slug) {
  var c = (db.cfg && db.cfg[slug]) || {};
  return { reps: c.reps || db.set.reps || 8, rest: c.rest || db.set.rest || 75 };
}

/* Letzte Leistung: alle Sätze dieser Übung aus der jüngsten Einheit,
   in der sie vorkam — ohne die laufende. */
function lastPerf(slug, exceptSid) {
  var sids = [], seen = {};
  db.log.forEach(function (l) {
    if (l.slug !== slug || !isSet(l)) return;
    var id = sidOf(l);
    if (id === exceptSid) return;
    if (!seen[id]) { seen[id] = []; sids.push(id); }
    seen[id].push(l);
  });
  if (!sids.length) return null;
  var sid = sids[sids.length - 1], rows = seen[sid];
  return { t: rows[0].t, sets: rows.length,
           reps: rows.map(function (r) { return (r.rl || [r.reps]).join('·'); }),
           total: rows.reduce(function (a, r) { return a + r.reps; }, 0),
           stufe: rows[rows.length - 1].stufe };
}
function perfLine(p) {
  return p.sets + ' ' + (p.sets === 1 ? 'Satz' : 'Sätze') + ': ' + p.reps.join('  |  ') +
         ' · ' + p.total + ' Wdh. · Stufe ' + fmt(p.stufe) + ' · ' + dstr(p.t);
}
function setCfg(slug, k, v) {
  var lim = { reps: [1, 50], rest: [15, 300] }[k];
  if (!lim || isNaN(v)) return;
  if (!db.cfg) db.cfg = {};
  var c = db.cfg[slug] || (db.cfg[slug] = {});
  c[k] = Math.max(lim[0], Math.min(lim[1], v));
  save();
}
function stepper(slug, k, val, step, unit) {
  return '<div class="cfgrow"><span>' + { reps: 'Wiederholungen (Vorschlag)', rest: 'Pause danach' }[k] + '</span>' +
    '<div class="mini"><div class="sbtn sm" data-a="cfg:' + slug + '|' + k + '|' + (-step) + '">–</div>' +
    '<b>' + val + (unit || '') + '</b>' +
    '<div class="sbtn sm" data-a="cfg:' + slug + '|' + k + '|' + step + '">+</div></div></div>';
}

/* ---------- Modell ---------- */
function cfg() { return KOLBEN[db.set.kolben]; }
function mult() { return db.set.ds ? 2 : 1; }
function setupLabel() { return (db.set.ds ? 'DS · 2× ' : 'S · 1× ') + cfg().label; }
function kgStart(n) { return r2(mult() * cfg().f * (n + 1)); }
function kgEnd(n) { var k = cfg(); return n < 8 ? kgStart(n) : r2(mult() * (k.f * (n + 1) + k.dm * (n - k.d0))); }
function kgLabel(n) { var a = kgStart(n), b = kgEnd(n); return b > a ? fmt(a) + '–' + fmt(b) : fmt(a); }
function r2(x) { return Math.round(x * 100) / 100; }
function fmt(n) { return String(n).replace('.', ','); }
function stufeOf(slug) { return db.stufen[slug] === undefined ? 5 : db.stufen[slug]; }
function setStufe(slug, n) { db.stufen[slug] = Math.max(1, Math.min(12, Math.round(n * 2) / 2)); save(); }

/* ---------- Verlauf ---------- */
function histOf(slug) { return db.log.filter(function (l) { return l.slug === slug; }); }
function lastStufe(slug) { var h = histOf(slug); return h.length ? h[h.length - 1].stufe : null; }
function dstr(t) { var d = new Date(t); return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2); }
function kcal(sec) { return Math.round(6.2 * db.set.bw * sec / 3600); }
function mmss(t) { return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }

/* ---------- Auswertung ----------
   Einheiten werden aus dem Satzprotokoll rekonstruiert (Gruppierung über sid).
   Volumen eines Satzes = Startlast × Wiederholungen. */
/* Gruppierungsschlüssel einer Einheit. Altdaten ohne sid werden stundenweise
   zusammengefasst. */
function sidOf(l) { return l.sid || ('t' + Math.floor(l.t / 36e5)); }
/* Einträge mit 0 Wiederholungen sind reine Stufen-Marker, kein Satz. */
function isSet(l) { return l.reps > 0; }

function sessionList() {
  var by = {}, order = [];
  db.log.forEach(function (l) {
    if (!isSet(l)) return;
    var id = sidOf(l);
    if (!by[id]) { by[id] = { id: id, t: l.t, rows: [] }; order.push(id); }
    by[id].rows.push(l);
    by[id].t = Math.max(by[id].t, l.t);
  });
  return order.map(function (id) {
    var s = by[id], vol = 0, mus = {}, ex = {};
    s.rows.forEach(function (l) {
      var e = BY[l.slug]; if (!e) return;
      var v = (l.kg || kgStart(l.stufe)) * l.reps;
      vol += v;
      mus[e.m] = (mus[e.m] || 0) + v;
      (ex[l.slug] = ex[l.slug] || []).push(l);
    });
    var meta = db.sessions.filter(function (x) { return Math.abs(x.t - s.t) < 6e4; })[0];
    return { id: id, t: s.t, vol: Math.round(vol), mus: mus, ex: ex,
             sets: s.rows.length, exCount: Object.keys(ex).length,
             sec: meta ? meta.sec : 0, kcal: meta ? meta.kcal : 0 };
  }).sort(function (a, b) { return b.t - a.t; });
}
function rangeStart(r) {
  var d = new Date(); d.setHours(0, 0, 0, 0);
  if (r === 'woche') { var wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); }
  else if (r === 'monat') d.setDate(1);
  else d.setMonth(0, 1);
  return d.getTime();
}
function fmtKg(v) {
  return v >= 1000 ? fmt(Math.round(v / 100) / 10) + ' t' : Math.round(v) + ' kg';
}

/* Schematischer Torso. Jede Muskelgruppe ist eine Fläche, die Deckkraft
   entspricht ihrem Anteil am Volumen des gewählten Zeitraums. */
var TORSO = {
  'Schultern': 'M52 62 q-17 2 -22 16 l-3 15 13 4 8 -22 z M148 62 q17 2 22 16 l3 15 -13 4 -8 -22 z',
  'Brust':     'M62 66 q38 -9 76 0 l-4 34 q-34 8 -68 0 z',
  'Arme':      'M27 93 l-6 40 4 32 13 -2 3 -34 5 -34 z M173 93 l6 40 -4 32 -13 -2 -3 -34 -5 -34 z',
  'Bauch':     'M66 104 q34 7 68 0 l-4 46 q-30 6 -60 0 z',
  'Rücken':    'M74 40 q26 -7 52 0 l3 20 q-29 -7 -58 0 z',
  'Beine':     'M70 152 q30 6 60 0 l-6 42 -4 44 -18 1 -4 -45 -4 45 -18 -1 -4 -44 z',
  'Ganzkörper':'M52 62 q-17 2 -22 16 l-3 15 13 4 8 -22 z M148 62 q17 2 22 16 l3 15 -13 4 -8 -22 z M62 66 q38 -9 76 0 l-4 34 q-34 8 -68 0 z'
};
function torso(mus) {
  var max = 1; for (var k in mus) if (mus[k] > max) max = mus[k];
  var t = '<svg viewBox="0 0 200 250" preserveAspectRatio="xMidYMid meet">';
  t += '<g fill="#1B1E21">';
  for (var g in TORSO) if (g !== 'Ganzkörper') t += '<path d="' + TORSO[g] + '"/>';
  t += '<circle cx="100" cy="24" r="17"/></g><g fill="#3B6BE8">';
  for (var m in mus) {
    if (!TORSO[m]) continue;
    var o = Math.max(.22, Math.min(1, mus[m] / max));
    t += '<path d="' + TORSO[m] + '" opacity="' + o.toFixed(2) + '"/>';
  }
  return t + '</g></svg>';
}

/* Löschen. Alle Auswertungen leiten sich aus db.log ab — entfernte Sätze
   verschwinden damit automatisch aus Verlauf, Volumen und "Letztes Mal". */
function delSession(id) {
  var ts = db.log.filter(function (l) { return sidOf(l) === id; }).map(function (l) { return l.t; });
  db.log = db.log.filter(function (l) { return sidOf(l) !== id; });
  if (ts.length) {
    var lo = Math.min.apply(null, ts) - 6e4, hi = Math.max.apply(null, ts) + 6e4;
    db.sessions = db.sessions.filter(function (s) { return s.t < lo || s.t > hi; });
  }
  save();
}
function delExercise(id, slug) {
  db.log = db.log.filter(function (l) { return !(sidOf(l) === id && l.slug === slug); });
  if (!db.log.some(function (l) { return sidOf(l) === id; })) delSession(id);
  save();
}
function delOneSet(id, slug, t) {
  var hit = false;
  db.log = db.log.filter(function (l) {
    if (!hit && sidOf(l) === id && l.slug === slug && l.t === t) { hit = true; return false; }
    return true;
  });
  if (!db.log.some(function (l) { return sidOf(l) === id; })) delSession(id);
  save();
}

/* ---------- Laufzeit-Zustand ---------- */
var st = { tab: 'heute', detail: null, q: '', chip: 'Alle', chipR: 'Alle',
           wo: null, rest: 0, restTotal: 75, elapsed: 0, toast: null, editR: false, open: {}, restSolo: null, range: 'woche', session: null, ask: null, solo: {} };

function planIds() {
  var r = db.set.ruest;
  var pool = EX.filter(function (e) { return (!db.set.hideDS || !e.ds); });
  var main = pool.filter(function (e) { return ruestOfEx(e) === r; });
  var free = r === 'Ohne' ? [] : pool.filter(function (e) { return ruestOfEx(e) === 'Ohne'; });
  var pick = [], seen = {}, groups = ['Beine', 'Brust', 'Rücken', 'Schultern', 'Bauch', 'Arme', 'Ganzkörper'];
  groups.forEach(function (g) {
    if (pick.length >= 5) return;
    var c = main.filter(function (e) { return e.m === g && !seen[e.slug]; })[0] ||
            free.filter(function (e) { return e.m === g && !seen[e.slug]; })[0];
    if (c) { pick.push(c.slug); seen[c.slug] = 1; }
  });
  main.concat(free).forEach(function (e) { if (pick.length < 5 && !seen[e.slug]) { pick.push(e.slug); seen[e.slug] = 1; } });
  return pick;
}

/* ---------- View-Helfer ---------- */
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]; }); }
/* Bewegungsschema — abstrahierte Station: Schiene, Schlitten, Griffstange.
   Ersetzt kein Formvideo, zeigt aber Richtung und Weg der Bewegung.
   Liegt videos/<slug>.mp4 vor, gewinnt das Video. */
var PAT = {
  druck:    { dx:  33, dy: -45, lbl: 'drücken' },
  zug:      { dx: -30, dy:  41, lbl: 'ziehen' },
  beuge:    { dx:  30, dy: -40, lbl: 'beugen · strecken' },
  hebe:     { dx:  36, dy: -49, lbl: 'heben' },
  curl:     { dx:  19, dy: -26, lbl: 'beugen' },
  rudern:   { dx:  24, dy: -32, lbl: 'ziehen' },
  rotation: { dx:   0, dy:   0, rot: 1, lbl: 'rotieren' },
  rumpf:    { dx:  10, dy: -14, lbl: 'halten · einrollen' }
};
function patternOf(e) {
  if (e.x && e.x.p) return e.x.p;
  var s = e.name.toLowerCase();
  if (/rotation|twist|fly|rotator|abduktion|adduktion|seitenheben/.test(s)) return 'rotation';
  if (/latzug|klimmzug|facepull/.test(s)) return 'zug';
  if (/rudern|ruderzug/.test(s)) return 'rudern';
  if (/kreuzheben|wadenheben|schulterheben|shrug|nackenheben|beinheben/.test(s)) return 'hebe';
  if (/kniebeug|ausfallschritt|beinpresse|laufschritt|beinbeuger|beinstrecker/.test(s)) return 'beuge';
  if (/curl|bizeps|unterarm/.test(s)) return 'curl';
  if (/crunch|plank|rumpf|unterarmstütz|mountain|farmer/.test(s)) return 'rumpf';
  return 'druck';
}
function schema(e) {
  var p = PAT[patternOf(e)] || PAT.druck;
  var mv = p.rot ? ' class="sl rot"' : ' class="sl"';
  var sty = ' style="--dx:' + p.dx + 'px;--dy:' + p.dy + 'px"';
  var t = '<svg viewBox="0 0 220 150" preserveAspectRatio="xMidYMid meet">';
  t += '<line x1="60" y1="140" x2="150" y2="18" stroke="#2C3135" stroke-width="9" stroke-linecap="round"/>';
  for (var i = 1; i <= 5; i++) {
    var f = i / 6, x = 60 + 90 * f, y = 140 - 122 * f;
    t += '<line x1="' + (x - 7) + '" y1="' + (y + 5) + '" x2="' + (x + 7) + '" y2="' + (y - 5) + '" stroke="#1A1D20" stroke-width="3"/>';
  }
  t += '<g' + mv + sty + '>';
  t += '<line x1="26" y1="101" x2="86" y2="101" stroke="#EAF0FF" stroke-width="4" stroke-linecap="round"/>';
  t += '<rect x="72" y="92" width="28" height="18" rx="2" fill="#3B6BE8"/>';
  t += '<circle cx="26" cy="101" r="5" fill="#EAF0FF"/></g>';
  t += '<text x="16" y="22" fill="#5A6064" font-family="ui-monospace,Menlo,monospace" font-size="10" letter-spacing="1.2">' + p.lbl.toUpperCase() + '</text>';
  return t + '</svg>';
}
/* Bildquelle: media/<slug>.gif — fehlt sie, wird der Originaldateiname aus dem
   EISENHORN-Download versucht; erst danach greift das Bewegungsschema. */
function mediaSrcs(e) {
  var out = ['media/' + e.slug + '.gif'];
  var orig = (D.GIF || {})[e.slug];
  if (orig) (typeof orig === 'string' ? [orig] : orig).forEach(function (n) {
    out.push('../uploads/' + encodeURIComponent(n));
  });
  return out;
}
/* Der Dateiname der heruntergeladenen GIFs kann in mehreren Kodierungen vorliegen
   (NFC, NFD, doppelt kodiert). Der onerror-Handler läuft alle Kandidaten durch;
   erst wenn keiner lädt, greift das Bewegungsschema. */
function media(e, h) {
  var s = mediaSrcs(e);
  return '<div class="media" style="height:' + h + 'px">' +
    '<img src="' + s[0] + '" alt="" data-try="0" data-src="' + esc(s.join('|')) + '" ' +
    'onerror="var l=this.getAttribute(\'data-src\').split(\'|\'),i=+this.getAttribute(\'data-try\')+1;' +
    'if(i<l.length){this.setAttribute(\'data-try\',i);this.src=l[i];}' +
    'else{this.parentNode.classList.add(\'novid\');}">' +
    '<div class="schema">' + schema(e) + '</div>' +
    '<span class="mlabel">Bewegungsschema</span></div>';
}
function skalaOf(e) { return (e.x && e.x.sk) ? e.x.sk : [[e.m, 100]]; }
function skalaBars(e) {
  var sk = skalaOf(e), h = '<div class="skala">';
  sk.forEach(function (r) {
    h += '<div class="srow"><span>' + esc(r[0]) + '</span><i><u style="width:' + r[1] + '%"></u></i><b>' + r[1] + '</b></div>';
  });
  return h + '</div>';
}
function sec(key, title, body) {
  var open = st.open[key];
  return '<div class="acc' + (open ? ' open' : '') + '"><div class="acch" data-a="sec:' + key + '">' +
    '<span>' + title + '</span><i>' + (open ? '–' : '+') + '</i></div>' +
    (open ? '<div class="accb">' + body + '</div>' : '') + '</div>';
}

/* Pausen-Overlay — im Training und einzeln aus dem Übungsdetail. */
function restOverlay(slug) {
  var e = BY[slug];
  return '<div class="rest"><i>Pause</i><div class="ringwrap"><div class="ring" style="background:conic-gradient(#3B6BE8 ' +
    Math.round(360 * st.rest / Math.max(1, st.restTotal)) + 'deg,#1F2326 0)"></div>' +
    '<div class="rin"><b id="rclk">' + mmss(st.rest) + '</b><span>bis zum nächsten Satz</span></div></div>' +
    (e ? '<div class="next"><i>' + (st.restSolo ? 'Übung' : 'Als Nächstes') + '</i><b>' + esc(e.name) + '</b>' +
      '<u>Stufe ' + fmt(stufeOf(slug)) + ' · ' + kgLabel(stufeOf(slug)) + ' kg · ' +
      (st.wo && !st.restSolo ? curList().join('/') : cfgOf(slug).reps) + ' Wdh.</u></div>' : '') +
    '<div class="rbtns"><div class="ghost" data-a="rest+">+30 s</div><div class="cta" data-a="rest0">Weiter</div></div>' +
    (e ? '<div class="restcfg">Pausenzeit merken: <span data-a="cfg:' + slug + '|rest|-15">– 15 s</span>' +
      '<b>' + mmss(cfgOf(slug).rest) + '</b><span data-a="cfg:' + slug + '|rest|15">+ 15 s</span></div>' : '') +
    '</div>';
}

/* ---------- Screens ---------- */
function vHeute() {
  var ids = planIds(), today = new Date();
  var wk = db.sessions.filter(function (s) { return Date.now() - s.t < 6048e5; });
  var wkKcal = wk.reduce(function (a, s) { return a + s.kcal; }, 0);
  var wkVol = wk.reduce(function (a, s) { return a + (s.vol || 0); }, 0);
  var h = '<div class="pad"><div class="eyebrow">' + ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'][today.getDay()] +
    ' · ' + today.getDate() + '. ' + ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'][today.getMonth()] +
    '</div><h1 class="hero">Gestärkt<br>ins Leben</h1></div>';

  h += '<div class="stats">' +
    stat(streak(), 'Tage Serie', 1) +
    stat((wkVol / 1000).toFixed(1).replace('.', ','), 't Woche') +
    stat(wkKcal, 'kcal Woche') + '</div>';

  h += '<div class="rowhead"><span>Rüstart heute</span><span class="mono">einmal aufbauen</span></div><div class="seg3">';
  RMODES.forEach(function (r) {
    var on = db.set.ruest === r, c = EX.filter(function (e) { return ruestOfEx(e) === r && (!db.set.hideDS || !e.ds); }).length;
    h += '<div class="s3' + (on ? ' on' : '') + '" data-a="ruest:' + r + '"><b>' + RLABEL[r] + '</b><i>' + c + ' Übungen</i></div>';
  });
  h += '</div>';

  h += '<div class="card"><div class="cardtop"><span class="dot"></span><span class="tag">MIKE5 · heute</span><span class="mono ml">0 Umbauten</span></div>' +
    '<div class="ctitle">Ganzkörper · ' + RLABEL[db.set.ruest] + '</div>' +
    '<div class="csub">' + ids.length + ' Übungen · ca. 22 Min · einmal aufbauen, kein Umbau zwischendurch</div><div class="plan">';
  ids.forEach(function (slug, i) {
    var e = BY[slug], n = stufeOf(slug);
    h += '<div class="prow" data-a="open:' + slug + '"><span class="num">' + ('0' + (i + 1)).slice(-2) + '</span>' +
      '<span class="pname">' + esc(e.name) + '</span><span class="pload">St. ' + fmt(n) + ' · ' + kgLabel(n) + ' kg</span></div>';
  });
  h += '</div><div class="cta" data-a="start">Training starten <b>→</b></div></div>';

  var gains = EX.filter(function (e) { return histOf(e.slug).length > 1; }).slice(0, 6);
  if (gains.length) {
    h += '<div class="rowhead"><span>Zuletzt gesteigert</span></div><div class="hscroll">';
    gains.forEach(function (e) {
      var hh = histOf(e.slug), d = hh[hh.length - 1].stufe - hh[0].stufe;
      h += '<div class="gcard" data-a="open:' + e.slug + '"><div class="gname">' + esc(e.name) + '</div>' +
        '<div class="grow"><b>' + fmt(hh[hh.length - 1].stufe) + '</b><i>Stufe</i><u>' + (d >= 0 ? '+' : '') + fmt(d) + '</u></div>' +
        '<div class="gkg">' + kgLabel(hh[hh.length - 1].stufe) + ' kg</div></div>';
    });
    h += '</div>';
  }
  return h;
}
function stat(v, l, acc) { return '<div class="stat"><b' + (acc ? ' class="acc"' : '') + '>' + v + '</b><i>' + l + '</i></div>'; }
function streak() {
  var d = 0, day = 864e5, t = new Date(); t.setHours(0, 0, 0, 0); var cur = t.getTime();
  var days = {}; db.sessions.forEach(function (s) { var x = new Date(s.t); x.setHours(0, 0, 0, 0); days[x.getTime()] = 1; });
  if (!days[cur]) cur -= day;
  while (days[cur]) { d++; cur -= day; }
  return d;
}

function vKatalog() {
  var list = EX.filter(function (e) {
    if (db.set.hideDS && e.ds) return false;
    if (st.chip !== 'Alle' && e.m !== st.chip) return false;
    if (st.chipR !== 'Alle' && ruestOfEx(e) !== st.chipR) return false;
    if (st.q && (e.name + ' ' + e.m + ' ' + e.slug).toLowerCase().indexOf(st.q.toLowerCase()) < 0) return false;
    return true;
  });
  var h = '<div class="pad"><div class="titlerow"><h1 class="h1">Übungen</h1><span class="mono">' + list.length + ' / ' + EX.length + '</span></div>' +
    '<div class="search"><span>⌕</span><input id="q" value="' + esc(st.q) + '" placeholder="Übung, Muskel, Zubehör…"></div>' +
    '<div class="rfilter">';
  ['Alle', 'Stange', 'Seilzug', 'Ohne'].forEach(function (c) {
    h += '<div class="rc' + (st.chipR === c ? ' on' : '') + '" data-a="chipR:' + c + '">' + (c === 'Alle' ? 'Alle Rüstarten' : RLABEL[c]) + '</div>';
  });
  h += '</div><div class="chips">';
  ['Alle'].concat(MUSKELN).forEach(function (c) {
    h += '<div class="chip' + (st.chip === c ? ' on' : '') + '" data-a="chip:' + c + '">' + c + '</div>';
  });
  h += '</div></div><div class="list">';
  list.forEach(function (e) {
    var n = stufeOf(e.slug);
    h += '<div class="erow" data-a="open:' + e.slug + '"><div class="thumb"><span class="scan"></span></div>' +
      '<div class="ebody"><div class="ename">' + esc(e.name) + (e.ds ? ' <span class="dsflag">DS</span>' : '') + '</div>' +
      '<div class="emeta">' + e.m + ' · ' + RLABEL[ruestOfEx(e)] + (e.det ? '' : ' · auto') + '</div>' +
      '<div class="mset">' + skalaOf(e).slice(0, 3).map(function (r) { return '<span style="width:' + (7 + 21 * r[1] / 100) + 'px"></span>'; }).join('') + '</div></div>' +
      '<div class="eright"><b>' + kgLabel(n) + '</b><i>Stufe ' + fmt(n) + '</i></div></div>';
  });
  return h + '</div>';
}

function vDetail() {
  var e = BY[st.detail], n = stufeOf(e.slug), d = e.det;
  var h = '<div class="hero-media">' + media(e, 300) +
    '<div class="back" data-a="back">←</div>' +
    '<div class="hmeta"><div class="hname">' + esc(e.name) + '</div></div></div>';

  h += '<div class="block"><div class="blockhead"><span>Stufe → Kilogramm</span><span class="mono">' + setupLabel() + '</span></div>' +
    '<div class="stepper"><div class="sbtn" data-a="st-:' + e.slug + '">–</div>' +
    '<div class="sval"><div><b>' + fmt(n) + '</b><i>Stufe</i></div><div class="skg">' + kgLabel(n) + ' kg</div></div>' +
    '<div class="sbtn" data-a="st+:' + e.slug + '">+</div></div><div class="ladder">';
  STUFEN.forEach(function (s) {
    h += '<div class="lb' + (s <= n ? ' on' : '') + '" style="height:' + (34 * s / 12) + 'px" data-a="stx:' + e.slug + '|' + s + '"></div>';
  });
  h += '</div><div class="lrange"><span>1 · ' + fmt(kgStart(1)) + ' kg</span><span>' +
    (n >= 8 ? 'ansteigende Kraftkurve' : 'konstante Last') + '</span><span>12 · ' + fmt(kgEnd(12)) + ' kg</span></div></div>';

  h += '<div class="duo"><div class="dcell"><i>Muskelgruppe</i><b>' + e.m + '</b></div>' +
       '<div class="dcell" data-a="editr"><i>Rüstart' + (st.editR ? ' — wählen' : ' · tippen zum Ändern') + '</i><b>' + RLABEL[ruestOfEx(e)] + '</b></div></div>';
  if (st.editR) {
    h += '<div class="seg3 flat">';
    RMODES.forEach(function (r) { h += '<div class="s3' + (ruestOfEx(e) === r ? ' on' : '') + '" data-a="setr:' + e.slug + '|' + r + '"><b>' + RLABEL[r] + '</b></div>'; });
    h += '</div>';
  }

  h += '<div class="block"><div class="blockhead"><span>Beanspruchte Muskulatur</span>' +
       (e.x && e.x.sk ? '' : '<span class="mono">automatisch abgeleitet</span>') + '</div>' + skalaBars(e) + '</div>';

  if (d) {
    h += '<div class="steps">';
    d.s.forEach(function (s, i) { h += '<div class="step"><span>' + ('0' + (i + 1)).slice(-2) + '</span><div><i>' + s[0] + '</i><p>' + esc(s[1]) + '</p></div></div>'; });
    h += '<div class="step"><span>★</span><div><i>Tipp</i><p>' + esc(d.t) + '</p></div></div></div>';
    var x = e.x;
    if (x && x.b) h += sec('beachten', 'Bitte beachten', '<p>' + esc(x.b) + '</p>');
    if (x && x.dt) h += sec('detail', 'Übung im Detail', '<p>' + esc(x.dt) + '</p>');
    if (x && x.v && x.v.length) {
      var vl = x.v.filter(function (s) { return BY[s]; }).map(function (s) {
        return '<div class="vrow" data-a="open:' + s + '"><span>' + esc(BY[s].name) + '</span><i>' + RLABEL[ruestOfEx(BY[s])] + '</i></div>';
      }).join('');
      h += sec('varianten', 'Weitere Varianten · ' + x.v.length, vl);
    }
  } else {
    h += '<div class="hint">Beschreibung noch nicht hinterlegt. <a href="https://eisenhorn.com/de-de/training/kraftuebungen/' + e.slug + '/" target="_blank" rel="noopener">Auf eisenhorn.com öffnen →</a></div>';
  }

  var hh = histOf(e.slug);
  if (hh.length) {
    var mx = Math.max.apply(null, hh.map(function (x) { return x.stufe; }));
    h += '<div class="block"><div class="blockhead"><span>Dein Verlauf</span></div><div class="chart">';
    hh.slice(-8).forEach(function (x, i, a) {
      h += '<div class="cbar"><b>' + fmt(x.stufe) + '</b><div style="height:' + (14 + 44 * x.stufe / mx) + 'px"' + (i === a.length - 1 ? ' class="on"' : '') + '></div><i>' + dstr(x.t) + '</i></div>';
    });
    h += '</div></div>';
  }

  var c = cfgOf(e.slug);
  var pv = lastPerf(e.slug);
  h += '<div class="lastbox wide">' + (pv
      ? '<i>Letztes Mal</i><b>' + perfLine(pv) + '</b>'
      : '<i>Letztes Mal</i><b class="dim">noch nichts protokolliert</b>') + '</div>';

  h += '<div class="block"><div class="blockhead"><span>Vorgabe für diese Übung</span>' +
    '<span class="mono">' + c.reps + ' Wdh. · ' + mmss(c.rest) + '</span></div><div class="cfg">' +
    stepper(e.slug, 'reps', c.reps, 1) +
    stepper(e.slug, 'rest', c.rest, 15, ' s') +
    '</div><div class="ghost" data-a="restnow:' + e.slug + '">Pause starten · ' + mmss(c.rest) + '</div></div>';

  var sl = soloList(e.slug);
  h += '<div class="pad">' + satzBlock(e.slug, sl, n, 'Satz eintragen') + '</div>' +
    '<div class="dactions"><div class="cta" data-a="logone:' + e.slug + '">Satz speichern · ' + sl.join('/') + ' · Stufe ' + fmt(n) + '</div></div>';
  return h;
}

function vVerlauf() {
  var all = sessionList(), from = rangeStart(st.range);
  var list = all.filter(function (s) { return s.t >= from; });
  var vol = list.reduce(function (a, s) { return a + s.vol; }, 0);
  var kc = list.reduce(function (a, s) { return a + s.kcal; }, 0);
  var min = Math.round(list.reduce(function (a, s) { return a + s.sec; }, 0) / 60);
  var mus = {};
  list.forEach(function (s) { for (var m in s.mus) mus[m] = (mus[m] || 0) + s.mus[m]; });

  var h = '<div class="pad"><h1 class="h1">Verlauf</h1></div>';
  h += '<div class="seg3">' + [['woche', 'Woche'], ['monat', 'Monat'], ['jahr', 'Jahr']]
    .map(function (r) { return '<div class="s3' + (st.range === r[0] ? ' on' : '') + '" data-a="range:' + r[0] + '"><b>' + r[1] + '</b></div>'; })
    .join('') + '</div>';

  h += '<div class="stats">' +
    stat(fmtKg(vol), 'gestemmt', 1) +
    stat(list.length, list.length === 1 ? 'Einheit' : 'Einheiten') +
    stat(kc, 'kcal') + '</div>' +
    '<div class="pad"><div class="mono dim">' + min + ' Min · ' +
    list.reduce(function (a, s) { return a + s.sets; }, 0) + ' Sätze</div></div>';

  var order = Object.keys(mus).sort(function (a, b) { return mus[b] - mus[a]; });
  h += '<div class="rowhead"><span>Beanspruchte Muskulatur</span></div>';
  if (!order.length) {
    h += '<div class="hint">In diesem Zeitraum noch kein Training protokolliert.</div>';
  } else {
    h += '<div class="bodyblock"><div class="torso">' + torso(mus) + '</div><div class="mvols">';
    order.forEach(function (m) {
      h += '<div class="mvol"><span>' + m + '</span><i><u style="width:' +
        Math.round(100 * mus[m] / mus[order[0]]) + '%"></u></i><b>' + fmtKg(mus[m]) + '</b></div>';
    });
    h += '</div></div>';
  }

  h += '<div class="rowhead"><span>Einheiten</span><span class="mono">' + all.length + ' gesamt</span></div>';
  if (!list.length) h += '<div class="hint">Nichts im gewählten Zeitraum.</div>';
  list.forEach(function (s) {
    var top = Object.keys(s.mus).sort(function (a, b) { return s.mus[b] - s.mus[a]; });
    var open = st.session === s.id;
    h += '<div class="sess' + (open ? ' open' : '') + '"><div class="sessh" data-a="sess:' + s.id + '">' +
      '<div class="sessd"><b>' + new Date(s.t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) + '</b>' +
      '<i>' + s.exCount + ' Übungen · ' + s.sets + ' Sätze' + (s.sec ? ' · ' + Math.round(s.sec / 60) + ' Min' : '') + '</i></div>' +
      '<div class="sessv"><b>' + fmtKg(s.vol) + '</b><i>' + top.slice(0, 2).join(' · ') + '</i></div></div>';
    if (open) {
      h += '<div class="sessb"><div class="mvols tight">';
      top.forEach(function (m) {
        h += '<div class="mvol"><span>' + m + '</span><i><u style="width:' +
          Math.round(100 * s.mus[m] / s.mus[top[0]]) + '%"></u></i><b>' + fmtKg(s.mus[m]) + '</b></div>';
      });
      h += '</div>';
      Object.keys(s.ex).forEach(function (slug) {
        var e = BY[slug]; if (!e) return;
        var rows = s.ex[slug];
        h += '<div class="sexblock"><div class="sexrow"><span data-a="open:' + slug + '">' + esc(e.name) + '</span>' +
          '<i>St. ' + fmt(rows[rows.length - 1].stufe) + '</i>' +
          '<span class="del" data-a="askex:' + s.id + '~' + slug + '">✕</span></div>';
        rows.forEach(function (r, i) {
          h += '<div class="setline"><span class="mono">Satz ' + (i + 1) + '</span>' +
            '<b>' + (r.rl || [r.reps]).join(' · ') + '</b><u>' + r.reps + ' Wdh.</u>' +
            '<span class="del" data-a="delset:' + s.id + '~' + slug + '~' + r.t + '">✕</span></div>';
        });
        h += '</div>';
      });
      h += '<div class="ghost danger" data-a="asksess:' + s.id + '">Diese Einheit löschen</div></div>';
    }
    h += '</div>';
  });
  return h;
}

function vRechner() {
  var h = '<div class="pad"><h1 class="h1">Rechner</h1><p class="lead">12 Hauptstufen, 11 Halbstufen. Was bedeutet deine Stufe in Kilogramm?</p></div>' +
    '<div class="block edge"><div class="rails">' +
    rail('EISENHORN S', '1 Schiene · 1 Kolben', !db.set.ds, 'ds:0') +
    rail('EISENHORN DS', '2 Schienen · 2 Kolben', db.set.ds, 'ds:1') + '</div><div class="kols">' +
    KOLBEN.map(function (k, i) { return '<div class="kol' + (db.set.kolben === i ? ' on' : '') + '" data-a="kol:' + i + '">' + k.label + '</div>'; }).join('') +
    '</div><div class="pad2"><div class="setupline"><span class="sq"></span>' + setupLabel() + '</div>' +
    '<div class="rowb"><span>Körpergewicht · für kcal</span><b>' + db.set.bw + ' kg</b></div>' +
    '<input type="range" id="bw" min="45" max="140" value="' + db.set.bw + '">' +
    '<label class="chk"><input type="checkbox" id="hideds"' + (db.set.hideDS ? ' checked' : '') + '> DS-Übungen ausblenden</label>' +
    '<div class="note"><span class="bar"></span><p>Stufe 1–7 hält die Last konstant. Ab Stufe 8 steigt sie im Bewegungsverlauf an — deshalb dort zwei Werte: Anfang und Ende.</p></div></div></div>';

  var maxKg = kgEnd(12);
  h += '<div class="table"><div class="thead"><span class="c1">Stufe</span><span class="c2">Anteil</span><span class="c3">Last</span></div>';
  STUFEN.forEach(function (n, i) {
    h += '<div class="trow' + (i % 2 ? ' alt' : '') + '"><span class="c1' + (n >= 8 ? ' acc' : '') + '">' + fmt(n) + '</span>' +
      '<span class="c2"><i style="width:' + Math.round(100 * kgStart(n) / maxKg) + '%"></i></span>' +
      '<span class="c3' + (n >= 8 ? ' acc' : '') + '">' + kgLabel(n) + ' kg</span></div>';
  });
  h += '</div><div class="pad"><p class="fine">Exakt aus den EISENHORN-Kraftstufendiagrammen (Werte pro Kolben). Das DS hat zwei Schienen und damit zwei Kolben — alle Werte verdoppelt.</p>' +
    '<div class="ghost" data-a="export">Trainingsdaten exportieren</div>' +
    '<div class="ghost danger" data-a="askall">Alle Trainingsdaten löschen</div>' +
    '<p class="fine">Für Apple Health: Datei exportieren, dann den Kurzbefehl „EISENHORN → Health" laufen lassen. Anleitung liegt im Repo unter README.md.</p></div>';
  return h;
}
function rail(t, s, on, a) { return '<div class="rail' + (on ? ' on' : '') + '" data-a="' + a + '"><b>' + t + '</b><i>' + s + '</i></div>'; }

function vWorkout() {
  var w = st.wo, slug = w.ids[w.idx], e = BY[slug], n = stufeOf(slug);
  var done = w.done[w.idx] || [], c = cfgOf(slug), prev = lastPerf(slug, w.sid);

  var h = '<div class="wtop"><div class="x" data-a="endwo">✕</div><div class="wprog"><i>Übung ' + (w.idx + 1) + ' von ' + w.ids.length + '</i><div class="dots">' +
    w.ids.map(function (_, i) { return '<span class="' + (i < w.idx ? 'done' : i === w.idx ? 'cur' : '') + '"></span>'; }).join('') +
    '</div></div><div class="wclock"><b id="clk">' + mmss(st.elapsed) + '</b><i id="kc">' + kcal(st.elapsed) + ' kcal</i></div></div>';

  h += '<div class="wbody">' + media(e, 186) +
    '<div class="pad"><div class="wname">' + esc(e.name) + '</div><div class="wmeta">' + e.m + ' · ' + RLABEL[ruestOfEx(e)] + '</div></div>';

  h += '<div class="lastbox">' + (prev
      ? '<i>Letztes Mal</i><b>' + perfLine(prev) + '</b>'
      : '<i>Letztes Mal</i><b class="dim">noch nichts protokolliert</b>') + '</div>';

  h += '<div class="duo tight"><div class="dcell ctr"><i>Stufe</i>' +
    '<div class="mini"><div class="sbtn sm" data-a="st-:' + slug + '">–</div><b>' + fmt(n) + '</b><div class="sbtn sm" data-a="st+:' + slug + '">+</div></div>' +
    '<u>' + kgLabel(n) + ' kg</u></div>' +
    '<div class="dcell ctr"><i>Pause danach</i><div class="mini">' +
    '<div class="sbtn sm" data-a="cfg:' + slug + '|rest|-15">–</div><b>' + mmss(c.rest) + '</b>' +
    '<div class="sbtn sm" data-a="cfg:' + slug + '|rest|15">+</div></div>' +
    '<u class="dim">' + done.length + ' ' + (done.length === 1 ? 'Satz' : 'Sätze') + ' erledigt</u></div></div>';

  h += '<div class="sets">';
  done.forEach(function (s, i) {
    var rl = s.rl || [s.reps];
    h += '<div class="set ok"><span class="mono">SATZ ' + (i + 1) + '</span>' +
      '<b>' + rl.join(' · ') + '<u>' + sum(rl) + ' Wdh. · St. ' + fmt(s.stufe) + '</u></b>' +
      '<span class="tagr" data-a="undoset">↺</span></div>';
  });
  h += '</div>';

  var cl = curList();
  h += satzBlock(slug, cl, n, 'Satz ' + (done.length + 1));

  h += '<div class="pad"><div class="ghost" data-a="nextex">' +
    (w.idx === w.ids.length - 1 ? 'Training beenden' : 'Nächste Übung →') + '</div></div></div>';

  h += '<div class="wfoot"><div class="cta" data-a="logset">Satz ' + (done.length + 1) + ' speichern · ' +
    cl.join('/') + ' → Pause</div></div>';

  if (st.rest > 0) h += restOverlay(w.ids[w.idx]);
  return h;
}

/* ---------- Render ---------- */
var app = document.getElementById('app');
function render() {
  var h = '', tabs = true;
  if (st.wo) { h = vWorkout(); tabs = false; }
  else if (st.detail) { h = vDetail(); tabs = false; }
  else if (st.tab === 'heute') h = '<div class="scroll">' + vHeute() + '</div>';
  else if (st.tab === 'katalog') h = '<div class="scroll">' + vKatalog() + '</div>';
  else if (st.tab === 'verlauf') h = '<div class="scroll">' + vVerlauf() + '</div>';
  else h = '<div class="scroll">' + vRechner() + '</div>';
  if (!st.wo && st.detail) h = '<div class="scroll">' + h + '</div>' + (st.rest > 0 ? restOverlay(st.restSolo) : '');

  if (tabs) {
    h += '<nav>' + [['heute', 'Heute'], ['katalog', 'Übungen'], ['verlauf', 'Verlauf'], ['rechner', 'Rechner']]
      .map(function (t) { return '<div class="tab' + (st.tab === t[0] ? ' on' : '') + '" data-a="tab:' + t[0] + '"><span></span>' + t[1] + '</div>'; }).join('') + '</nav>';
  }
  if (st.ask) {
    h += '<div class="ask"><div class="askbox"><b>' + esc(st.ask.title) + '</b>' +
      '<p>' + esc(st.ask.body) + '</p><div class="askbtns">' +
      '<div class="ghost" data-a="askno">Abbrechen</div>' +
      '<div class="cta warn" data-a="askyes">Löschen</div></div></div></div>';
  }
  if (st.toast) h += '<div class="toast">' + esc(st.toast) + '</div>';

  var ae = document.activeElement, wasQ = ae && ae.id === 'q';
  var pos = wasQ ? ae.selectionStart : 0;
  var repI = ae && ae.classList && ae.classList.contains('repin') ? ae.getAttribute('data-i') : null;
  app.innerHTML = h;
  if (wasQ) { var q = document.getElementById('q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } }
  if (repI !== null) { var r = app.querySelector('.repin[data-i="' + repI + '"]'); if (r) r.focus(); }
}

/* ---------- Events ---------- */
app.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-a]'); if (!el) return;
  var p = el.getAttribute('data-a').split(':'), a = p[0], arg = p[1] || '';
  var two = arg.split('|');
  if (a === 'tab') { st.tab = arg; st.detail = null; }
  else if (a === 'open') { st.detail = arg; st.editR = false; st.open = {}; }
  else if (a === 'sec') st.open[arg] = !st.open[arg];
  else if (a === 'back') st.detail = null;
  else if (a === 'chip') st.chip = arg;
  else if (a === 'chipR') st.chipR = arg;
  else if (a === 'range') { st.range = arg; st.session = null; }
  else if (a === 'sess') st.session = st.session === arg ? null : arg;
  else if (a === 'asksess') {
    var s0 = sessionList().filter(function (x) { return x.id === arg; })[0];
    st.ask = { kind: 'sess', id: arg, title: 'Einheit löschen?',
      body: s0 ? new Date(s0.t).toLocaleDateString('de-DE') + ' · ' + s0.exCount + ' Übungen · ' +
        s0.sets + ' Sätze · ' + fmtKg(s0.vol) + ' werden aus dem Verlauf entfernt.' : '' };
  }
  else if (a === 'askex') {
    var p1 = arg.split('~'), e1 = BY[p1[1]];
    st.ask = { kind: 'ex', id: p1[0], slug: p1[1], title: 'Übung aus dieser Einheit löschen?',
      body: (e1 ? e1.name : '') + ' — alle Sätze dieser Übung in dieser Einheit.' };
  }
  else if (a === 'delset') {
    var p2 = arg.split('~');
    delOneSet(p2[0], p2[1], +p2[2]); toast('Satz gelöscht');
  }
  else if (a === 'askno') st.ask = null;
  else if (a === 'askyes') {
    var q0 = st.ask; st.ask = null;
    if (q0 && q0.kind === 'sess') { delSession(q0.id); st.session = null; toast('Einheit gelöscht'); }
    else if (q0 && q0.kind === 'ex') { delExercise(q0.id, q0.slug); toast('Übung gelöscht'); }
    else if (q0 && q0.kind === 'all') { db.log = []; db.sessions = []; save(); toast('Alle Trainingsdaten gelöscht'); }
  }
  else if (a === 'askall') st.ask = { kind: 'all', title: 'Alle Trainingsdaten löschen?',
    body: 'Sätze, Einheiten und der komplette Verlauf werden entfernt. Stufen, Vorgaben und Einstellungen bleiben.' };
  else if (a === 'ruest') { db.set.ruest = arg; save(); }
  else if (a === 'ds') { db.set.ds = arg === '1'; save(); }
  else if (a === 'kol') { db.set.kolben = +arg; save(); }
  else if (a === 'st+') setStufe(arg, stufeOf(arg) + 0.5);
  else if (a === 'st-') setStufe(arg, stufeOf(arg) - 0.5);
  else if (a === 'stx') setStufe(two[0], +two[1]);
  else if (a === 'editr') st.editR = !st.editR;
  else if (a === 'setr') { db.ruestOv[two[0]] = two[1]; st.editR = false; save(); }
  else if (a === 'logone') {
    var rl0 = soloList(arg).slice();
    logSet(arg, stufeOf(arg), sum(rl0), 'd' + Date.now(), rl0);
    toast('Satz gespeichert · ' + rl0.join('/') + ' · ' + sum(rl0) + ' Wdh.');
  }
  else if (a === 'start') startWo();
  else if (a === 'endwo') { endWo(false); }
  else if (a === 'cfg') { setCfg(two[0], two[1], cfgOf(two[0])[two[1]] + (+two[2])); }
  else if (a === 'restnow') { st.rest = cfgOf(arg).rest; st.restTotal = st.rest; st.restSolo = arg; }
  else if (a === 'rep') setCurAt(+two[0], activeList()[+two[0]] + (+two[1]));
  else if (a === 'repadd') addCur();
  else if (a === 'repdel') delCur(+arg);
  else if (a === 'nextex') nextEx();
  else if (a === 'undoset') undoSet();
  else if (a === 'logset') logCurrent();
  else if (a === 'rest+') { st.rest += 30; st.restTotal += 30; }
  else if (a === 'rest0') { st.rest = 0; st.restSolo = null; }
  else if (a === 'export') doExport();
  render();
});
app.addEventListener('input', function (ev) {
  if (ev.target.classList.contains('repin')) {
    var v = parseInt(ev.target.value, 10);
    if (v > 0) {
      setCurAt(+ev.target.getAttribute('data-i'), v);
      /* Abgeleitete Texte in place nachziehen — ein volles render() würde
         mitten im Tippen den Cursor verlieren. */
      var a = activeList(), tot = document.querySelector('.cursath b');
      if (tot) tot.textContent = sum(a) + ' Wdh. gesamt';
      if (st.wo) {
        var n0 = (st.wo.done[st.wo.idx] || []).length + 1;
        var c0 = document.querySelector('.wfoot .cta');
        if (c0) c0.textContent = 'Satz ' + n0 + ' speichern · ' + a.join('/') + ' → Pause';
      } else if (st.detail) {
        var c1 = document.querySelector('.dactions .cta');
        if (c1) c1.textContent = 'Satz speichern · ' + a.join('/') + ' · Stufe ' + fmt(stufeOf(st.detail));
      }
    }
    return;
  }
  if (ev.target.id === 'q') { st.q = ev.target.value; render(); }
  else if (ev.target.id === 'bw') { db.set.bw = +ev.target.value; save(); render(); }
  else if (ev.target.id === 'hideds') { db.set.hideDS = ev.target.checked; save(); render(); }
});

function toast(m) { st.toast = m; clearTimeout(toast._t); toast._t = setTimeout(function () { st.toast = null; render(); }, 1900); }

function logSet(slug, stufe, reps, sid, rl) {
  var r = { slug: slug, stufe: stufe, reps: reps, kg: kgStart(stufe), t: Date.now(), sid: sid || null };
  if (rl) r.rl = rl;
  db.log.push(r);
  db.stufen[slug] = stufe; save();
}
function startWo() {
  var ids = planIds();
  st.wo = { idx: 0, cur: {}, done: {}, ids: ids, vol: 0, sid: Date.now() };
  st.elapsed = 0; st.rest = 0; st.detail = null; wake(true);
}
/* Einen Satz protokollieren. Der Satzzähler läuft automatisch hoch, die
   Wiederholungen gibst du je Satz selbst ein. Danach startet die Pause. */
/* Den offenen Satz als Ganzes protokollieren: alle Wiederholungs-Eingaben
   gehören zu diesem einen Satz. Danach startet die Pause. */
function logCurrent() {
  var w = st.wo, slug = w.ids[w.idx], n = stufeOf(slug);
  var rl = curList().slice(), total = sum(rl);
  var cur = w.done[w.idx] || (w.done[w.idx] = []);
  cur.push({ stufe: n, reps: total, rl: rl });
  w.vol += kgStart(n) * total;
  logSet(slug, n, total, w.sid, rl);
  w.cur[w.idx] = rl.slice();
  buzz();
  st.rest = cfgOf(slug).rest;
  st.restTotal = st.rest;
}

/* Zur nächsten Übung — oder Training beenden. */
function nextEx() {
  var w = st.wo;
  if (w.idx >= w.ids.length - 1) { endWo(true); return; }
  w.idx++;
  st.rest = 0;
}

/* Letzten Satz der aktuellen Übung zurücknehmen. */
function undoSet() {
  var w = st.wo, cur = w.done[w.idx];
  if (!cur || !cur.length) return;
  var s = cur.pop();
  w.vol -= kgStart(s.stufe) * s.reps;
  for (var i = db.log.length - 1; i >= 0; i--) {
    if (db.log[i].sid === w.sid && db.log[i].slug === w.ids[w.idx]) { db.log.splice(i, 1); break; }
  }
  save();
}
function endWo(complete) {
  if (complete) {
    var sets = 0; for (var k in st.wo.done) sets += st.wo.done[k].length;
    if (!sets) { toast('Training ohne Sätze verworfen'); st.wo = null; st.rest = 0; st.elapsed = 0; wake(false); return; }
    db.sessions.push({ t: Date.now(), sec: st.elapsed, kcal: kcal(st.elapsed), sets: sets, vol: Math.round(st.wo.vol), ruest: db.set.ruest });
    save(); toast('Gespeichert · ' + mmss(st.elapsed) + ' · ' + kcal(st.elapsed) + ' kcal');
    st.tab = 'verlauf';
  } else toast('Training abgebrochen');
  st.wo = null; st.rest = 0; st.elapsed = 0; wake(false);
}

/* Timer */
setInterval(function () {
  if (!st.wo && st.rest <= 0) return;
  if (st.wo) st.elapsed++;
  if (st.rest > 0) {
    st.rest--;
    if (st.rest === 0) { buzz(); render(); return; }
    var r = document.getElementById('rclk'); if (r) r.textContent = mmss(st.rest);
    var ring = document.querySelector('.ring');
    if (ring) ring.style.background = 'conic-gradient(#3B6BE8 ' + Math.round(360 * st.rest / Math.max(1, st.restTotal)) + 'deg,#1F2326 0)';
  }
  var c = document.getElementById('clk'); if (c) c.textContent = mmss(st.elapsed);
  var kc = document.getElementById('kc'); if (kc) kc.textContent = kcal(st.elapsed) + ' kcal';
}, 1000);

function buzz() { if (navigator.vibrate) navigator.vibrate(60); }
var wl = null;
function wake(on) {
  try {
    if (on && navigator.wakeLock) navigator.wakeLock.request('screen').then(function (l) { wl = l; }).catch(function () {});
    if (!on && wl) { wl.release(); wl = null; }
  } catch (e) {}
}

/* Export für Apple Health / Backup */
function doExport() {
  var out = { app: 'EISENHORN Trainer', exported: new Date().toISOString(), setup: setupLabel(),
    sessions: db.sessions.map(function (s) {
      return { start: new Date(s.t - s.sec * 1000).toISOString(), end: new Date(s.t).toISOString(),
               dauerMin: Math.round(s.sec / 60), kcal: s.kcal, saetze: s.sets, volumenKg: s.vol, ruestart: s.ruest };
    }), log: db.log, stufen: db.stufen };
  var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'eisenhorn-training.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast(db.sessions.length + ' Einheiten exportiert');
}

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
