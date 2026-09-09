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
var MUSKELN = ['Brust', 'Rücken', 'Schultern', 'Arme', 'Beine', 'Bauch'];
/* Filter-Chips aus den Gruppen bauen, die wirklich vorkommen — sonst laufen
   Liste und Daten wieder auseinander. */
var _groups = null;
function usedGroups() {
  if (!_groups) {
    var seen = {};
    EX.forEach(function (e) { seen[e.m] = 1; });
    _groups = MUSKELN.filter(function (g) { return seen[g]; })
      .concat(Object.keys(seen).filter(function (g) { return MUSKELN.indexOf(g) < 0; }).sort());
  }
  return _groups;
}

/* ---------- Speicher ---------- */
var K = 'eh.v1';
var db = load();
function load() {
  var d = { set: { ds: true, kolben: 1, bw: 64, ruest: 'Stange', rest: 75, reps: 8, hideDS: false,
                   alter: 42, sex: 'm', level: 'wieder' },
            stufen: {}, ruestOv: {}, cfg: {}, notes: {}, log: [], sessions: [] };
  try {
    var raw = localStorage.getItem(K);
    if (raw) {
      var p = JSON.parse(raw);
      /* Einstellungen key-für-key mergen, damit später ergänzte Vorgaben
         ihre Standardwerte behalten. Alles andere direkt übernehmen. */
      for (var k in p) if (k !== 'set') d[k] = p[k];
      if (p.set) for (var s in p.set) if (p.set[s] !== null && p.set[s] !== undefined) d.set[s] = p.set[s];
      for (var g in d.cfg) if (d.cfg[g]) delete d.cfg[g].sets;   // Feld aus einer Vorversion
      /* Frühere Versionen speicherten sid als Zahl — einmalig auf String ziehen,
         sonst greifen Aufklappen und Löschen im Verlauf nicht. */
      d.log.forEach(function (l) { if (l.sid !== null && l.sid !== undefined) l.sid = String(l.sid); });
    }
  } catch (e) {}
  return d;
}
function save() { try { localStorage.setItem(K, JSON.stringify(db)); } catch (e) {} }

/* ---------- Übungen ---------- */
var D = window.EH_DATA;
/* Zuordnung der EISENHORN-Muskelnamen zu den Gruppen für Torso und Wochenbilanz. */
var MGROUP = { 'Bizeps': 'Arme', 'Trizeps': 'Arme', 'Unterarm': 'Arme',
               'Nacken': 'Schultern', 'Po': 'Beine', 'Waden': 'Beine' };
function groupOf(m) { return MGROUP[m] || m; }
var EX = D.L.map(function (row) {
  var name = row[0], slug = row[1];
  var mk = (D.MUSK || {})[slug] || null;
  return { name: name, slug: slug, tx: (D.TXT || {})[slug] || null, mk: mk,
           ds: /^2\d\d-/.test(slug),
           m: mk ? groupOf(mk[0][0]) : 'Ganzkörper',
           r0: (D.RUEST || {})[slug] || ruestOf(name, slug) };
});
var BY = {}; EX.forEach(function (e) { BY[e.slug] = e; });

/* Rückfall, falls eine Übung ohne RUEST-Eintrag ergänzt wird. */
function ruestOf(name, slug) {
  var s = (name + ' ' + slug).toLowerCase();
  if (s.indexOf('seilzug') >= 0) return 'Seilzug';
  if (s.indexOf('stange') >= 0) return 'Stange';
  return 'Ohne';
}
function ruestOfEx(e) { return db.ruestOv[e.slug] || e.r0; }

/* Bewegungsrichtung für das Push/Pull-Verhältnis. Der Indikator misst die
   Balance des OBERKÖRPERS — zu viel Drücken ohne Gegenzug ist am Heimgerät der
   häufigste Weg in Schulterprobleme. Abgeleitet aus dem primären Muskel der
   EISENHORN-Daten; Bein-, Rumpf- und Nackenarbeit zählt bewusst nicht mit. */
var PPMAP = { Brust: 'push', Trizeps: 'push', Schultern: 'push',
              Rücken: 'pull', Bizeps: 'pull' };
function pushPull(e) {
  return (e.mk && PPMAP[e.mk[0][0]]) || null;
}

/* Regeneration: Stunden seit der letzten Belastung dieser Muskelgruppe. */
function hoursSince(muskel) {
  var last = 0;
  db.log.forEach(function (l) {
    if (!isSet(l) || l.warm) return;
    var e = BY[l.slug]; if (!e) return;
    var hit = e.mk ? e.mk.some(function (r) { return groupOf(r[0]) === muskel && r[1] >= 4; }) : e.m === muskel;
    if (hit && l.t > last) last = l.t;
  });
  return last ? (Date.now() - last) / 36e5 : null;
}
function recoveryHint(ids) {
  var worst = null;
  ids.forEach(function (slug) {
    var e = BY[slug]; if (!e) return;
    var hrs = hoursSince(e.m);
    if (hrs !== null && hrs < 36 && (!worst || hrs < worst.hrs)) worst = { m: e.m, hrs: hrs };
  });
  if (!worst) return null;
  return worst.m + ' zuletzt vor ' + Math.round(worst.hrs) + ' h — 48 h Pause wäre besser.';
}

/* Harte Sätze pro Muskelgruppe (Aufwärmsätze zählen nicht mit).
   Sportwissenschaftlicher Richtwert: 10–20 Arbeitssätze pro Woche. */
/* Ein Satz zählt für den primär beanspruchten Muskel voll, für unterstützende
   anteilig nach der EISENHORN-Intensität (2 von 4 = halber Satz). */
function hardSets(from) {
  var out = {};
  db.log.forEach(function (l) {
    if (!isSet(l) || l.warm || l.t < from) return;
    var e = BY[l.slug]; if (!e) return;
    if (e.mk) e.mk.forEach(function (r) {
      var g = groupOf(r[0]);
      out[g] = (out[g] || 0) + (r[1] || 4) / 4;
    });
    else out[e.m] = (out[e.m] || 0) + 1;
  });
  for (var k in out) out[k] = Math.round(out[k] * 10) / 10;
  return out;
}
function pushPullCount(from) {
  var c = { push: 0, pull: 0 };
  db.log.forEach(function (l) {
    if (!isSet(l) || l.warm || l.t < from) return;
    var e = BY[l.slug]; if (!e) return;
    var d = pushPull(e); if (d) c[d]++;
  });
  return c;
}

/* Sätze, Wiederholungen und Pausenzeit pro Übung. Ohne eigenen Eintrag gelten
   die Standardwerte aus den Einstellungen. */
/* Der offene Satz ist eine Liste von Wiederholungs-Eingaben: 4, 6, 8 gehören
   zusammen zu einem Satz. Erst beim Speichern startet die Pause. */
/* Offener Satz im Übungsdetail — gleiche Struktur wie im Training. */
/* Eine Sitzungs-ID je Übung und Kalendertag: mehrere im Detail gespeicherte
   Sätze gehören damit zu einer Einheit — Grundlage für "Letztes Mal" und den
   Stufenvorschlag. */
function soloSid(slug) {
  var d = new Date(); d.setHours(0, 0, 0, 0);
  return 'd' + d.getTime() + '-' + slug;
}
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
  h += '</div><div class="ghost thin" data-a="repadd">+ Wiederholung</div>';
  h += '<div class="rirbar"><span>Wie viele hättest du noch geschafft?</span><div class="rirpick">';
  [0, 1, 2, 3, 4].forEach(function (v) {
    h += '<div class="rp' + (st.rir === v && !st.warm ? ' on' : '') + '" data-a="rir:' + v + '">' + (v === 4 ? '4+' : v) + '</div>';
  });
  h += '</div></div>';
  h += '<div class="warmrow' + (st.warm ? ' on' : '') + '" data-a="warm"><span class="box"></span>' +
    'Aufwärmsatz — zählt nicht für Volumen und Rekorde</div>';
  return h + '</div>';
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
    if (l.slug !== slug || !isSet(l) || l.warm) return;
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
/* Persönlicher Rekord je Übung: der Satz mit dem höchsten Volumen
   (Startlast × Wiederholungen). Vorbild: Hevy. */
/* Zwei getrennte Rekorde: die schwerste bewältigte Stufe und der Satz mit dem
   höchsten Volumen. Sonst schlägt 20 Wdh. auf Stufe 3 jede schwere Leistung. */
function prOf(slug, exceptT) {
  var vol = null, load = null;
  db.log.forEach(function (l) {
    if (l.slug !== slug || !isSet(l) || l.warm || l.t === exceptT) return;
    var v = (l.kg || kgStart(l.stufe)) * l.reps;
    var r = { vol: v, stufe: l.stufe, reps: l.reps, rl: l.rl, t: l.t };
    if (!vol || v > vol.vol) vol = r;
    if (!load || l.stufe > load.stufe || (l.stufe === load.stufe && l.reps > load.reps)) load = r;
  });
  return vol ? { vol: vol, load: load } : null;
}
function prLine(p) {
  return Math.round(p.vol).toLocaleString('de-DE') + ' kg · Stufe ' + fmt(p.stufe) +
         ' × ' + p.reps + ' Wdh. · ' + dstr(p.t);
}

/* ---------- Startstufe aus dem Profil ----------
   Nur relevant, solange für eine Übung noch nichts protokolliert ist. Sobald
   ein Satz mit RIR vorliegt, übernimmt die Progressionslogik.

   Last = Körpergewicht × Übungsfaktor × Geschlecht × Alter × Erfahrung.
   Das ergibt eine grobe 1RM-Schätzung; für Arbeitssätze mit 8–12 Wdh. werden
   davon 65 % angesetzt und über die Kolbenformel in eine Stufe zurückgerechnet. */
var EXFAK = { Beine: .9, Po: .8, Waden: .8, Rücken: .5, Brust: .5, Nacken: .5,
              Schultern: .35, Bauch: .25, Bizeps: .22, Trizeps: .22, Unterarm: .18 };
var LEVELS = [['neu', 'Untrainiert', .7], ['wieder', 'Wiedereinsteiger', .9],
              ['geuebt', 'Geübt', 1.1], ['fort', 'Fortgeschritten', 1.3]];

function levelFak() {
  var l = LEVELS.filter(function (x) { return x[0] === db.set.level; })[0];
  return l ? l[2] : 1;
}
function ageFak() {
  var a = db.set.alter || 35;
  return a <= 35 ? 1 : Math.max(.6, 1 - (a - 35) * .01);
}
function sexFak(oben) {
  if (db.set.sex === 'w') return oben ? .6 : .75;
  if (db.set.sex === 'x') return oben ? .8 : .88;
  return 1;
}
/* Übungen mit fixierter Stufe: Der Vorbereitungstext verlangt einen Blocker
   oder die höchste Kraftstufe — die Station dient als Anschlag, nicht als Last.
   Eine kg-Schätzung wäre hier sinnlos und widerspräche der Anleitung. */
function isFixedStufe(e) {
  var t = e.tx || {};
  return /blocker|höchste (kraft)?stufe|stufe 12/i.test(((t.v || '') + ' ' + (t.a || '')));
}
function startVorschlag(slug) {
  var e = BY[slug];
  if (!e || !e.mk) return null;
  if (db.log.some(function (l) { return l.slug === slug && isSet(l); })) return null;

  var prim = e.mk[0][0], fak = EXFAK[prim] || .3;
  var unten = prim === 'Beine' || prim === 'Po' || prim === 'Waden';
  var einzeln = /einarmig|einbeinig|einarmige|seitlich einarmig/.test(e.name.toLowerCase());
  var kg = db.set.bw * fak * sexFak(!unten) * ageFak() * levelFak() * (einzeln ? .55 : 1) * .65;

  if (isFixedStufe(e)) {
    return { fix: true, txt: 'Eigengewichtsübung mit fixierter Stufe — die Vorbereitung gibt die Einstellung vor (siehe Anleitung). Steigerung läuft über Wiederholungen, nicht über die Stufe.' };
  }
  var k = cfg(), roh = kg / (mult() * k.f) - 1;
  var stufe = Math.round(roh * 2) / 2;
  if (stufe < 1) {
    return { unter: true, kg: Math.round(kg),
      txt: 'Geschätzt ' + Math.round(kg) + ' kg — das liegt unter Stufe 1 (' + fmt(kgStart(1)) +
        ' kg mit ' + setupLabel() + '). Leichteren Kolben verwenden oder Stufe 1 mit mehr Wiederholungen.' };
  }
  stufe = Math.min(12, stufe);
  return { stufe: stufe, kg: Math.round(kg),
    txt: 'Startvorschlag Stufe ' + fmt(stufe) + ' ≈ ' + kgLabel(stufe) + ' kg. Lieber zu leicht beginnen.' };
}

/* Progressionsvorschlag aus der Anstrengung (RIR = Reps in Reserve).
   Bleiben über die Sätze im Schnitt 2+ Wiederholungen übrig, ist die Stufe reif. */
function suggestion(slug) {
  var rows = db.log.filter(function (l) { return l.slug === slug && isSet(l) && !l.warm && l.rir !== undefined; });
  if (rows.length < 2) return null;
  var lastSid = sidOf(rows[rows.length - 1]);
  var s = rows.filter(function (l) { return sidOf(l) === lastSid; });
  if (s.length < 2) return null;
  var avg = s.reduce(function (a, l) { return a + l.rir; }, 0) / s.length;
  var n = s[s.length - 1].stufe;
  if (avg >= 2) return { dir: 1, next: Math.min(12, n + 0.5), txt: 'Ø ' + fmt(Math.round(avg * 10) / 10) + ' Wdh. Reserve — Stufe ' + fmt(Math.min(12, n + 0.5)) + ' probieren.' };
  if (avg < 0.5) return { dir: -1, next: Math.max(1, n - 0.5), txt: 'Kaum Reserve — Stufe ' + fmt(n) + ' halten oder auf ' + fmt(Math.max(1, n - 0.5)) + ' zurück.' };
  return { dir: 0, next: n, txt: 'Passende Belastung — Stufe ' + fmt(n) + ' halten.' };
}
function perfLine(p) {
  return plural(p.sets, 'Satz', 'Sätze') + ': ' + p.reps.join('  |  ') +
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
function sidOf(l) { return String(l.sid || ('t' + Math.floor(l.t / 36e5))); }
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
      if (!l.warm) {
        vol += v;
        if (e.mk) e.mk.forEach(function (r) {
          var g = groupOf(r[0]);
          mus[g] = (mus[g] || 0) + v * (r[1] || 4) / 4;
        });
        else mus[e.m] = (mus[e.m] || 0) + v;
      }
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
/* Ein Helfer für alle Mengenangaben — sonst bleibt beim nächsten Mal wieder
   ein "1 Sätze" stehen. */
function plural(n, one, many) { return fmt(n) + ' ' + (n === 1 ? one : many); }
/* Dauer nur ausgeben, wenn sie gemessen wurde und nicht auf 0 rundet. */
function durTxt(sec) { return !sec ? '' : sec < 60 ? '<1 Min' : Math.round(sec / 60) + ' Min'; }

function fmtKg(v) {
  return Math.round(v).toLocaleString('de-DE') + ' kg';
}

/* Anatomische Körperkarte, Vorder- und Rückansicht. Jeder Muskel der
   EISENHORN-Systematik ist eine eigene Fläche; die Deckkraft entspricht dem
   Anteil an der Belastung des gewählten Zeitraums. */
/* Anatomische Körperkarte. Gezeichnet wird nur die linke Hälfte, die rechte
   entsteht durch Spiegelung an x = 100 — dadurch bleibt die Figur symmetrisch
   und jede Muskelfläche ist mit einem Pfad beschrieben. */
var FIG = {
  outline: [
    'M100 52 L92 54 L91 66 C82 69 70 73 63 82 C60 95 61 110 64 124 C67 140 71 152 74 164 C71 176 68 186 67 196 C67 200 68 203 70 206 L100 206 Z',
    'M97 204 C80 204 71 212 68 228 C64 248 63 268 66 288 C68 296 69 300 70 306 C66 326 66 348 70 368 C71 378 72 384 72 390 C70 396 68 398 74 398 L91 398 C94 396 93 390 92 384 L91 368 C92 348 93 326 93 306 L94 288 C96 262 97 232 97 204 Z',
    'M62 80 C54 88 50 104 49 122 C48 138 47 150 47 158 C46 176 43 200 40 222 C38 240 35 256 37 266 C39 274 46 275 48 266 C50 256 50 244 52 230 C55 202 58 176 61 152 C63 128 66 100 67 84 Z'
  ],
  head: 'M100 6 C89 6 85 16 85 29 C85 42 91 52 100 52 Z',
  front: {
    lines: ['M100 52 L100 206', 'M86 138 L100 138', 'M86 152 L100 152', 'M86 166 L100 166',
            'M70 204 L100 204', 'M71 292 L92 292', 'M52 166 L62 164', 'M84 124 L100 124'],
    m: {
      Nacken:    'M91 55 C89 63 87 67 84 69 C77 72 71 76 68 80 C76 76 86 73 92 71 Z',
      Schultern: 'M65 80 C57 85 52 97 52 112 C52 116 56 118 60 117 C61 104 64 91 70 84 Z',
      Brust:     'M71 82 C80 79 94 77 99 77 L99 117 C93 122 82 123 74 118 C70 115 68 108 68 98 Z',
      Bizeps:    'M53 120 C50 130 49 143 49 157 C49 161 54 163 57 161 C58 147 59 133 62 123 Z',
      Unterarm:  'M47 172 C44 190 41 212 39 232 C38 238 44 240 47 236 C50 217 52 196 55 177 Z',
      Bauch:     'M85 124 C90 123 96 123 99 123 L99 179 C94 183 88 183 85 179 Z M78 133 C80 131 82 130 83 130 C82 146 82 162 81 175 C78 172 76 169 75 165 Z',
      Beine:     'M76 213 C71 231 69 253 71 273 C72 278 84 282 88 279 C92 256 94 232 96 214 C89 217 81 217 76 213 Z',
      Waden:     'M75 312 C72 330 72 350 75 365 C77 367 81 367 82 365 C80 348 80 330 82 313 Z',
      Po: '', Rücken: '', Trizeps: ''
    }
  },
  back: {
    lines: ['M100 52 L100 206', 'M70 204 L100 204', 'M74 268 L96 262', 'M71 292 L92 292',
            'M79 106 L99 100', 'M52 166 L62 164'],
    m: {
      Nacken:    'M99 54 C93 58 87 62 83 66 C76 71 71 76 68 81 C71 90 75 99 79 105 C86 102 94 99 99 97 Z',
      Schultern: 'M65 82 C57 87 52 99 52 114 C52 118 56 120 60 119 C61 106 64 93 70 86 Z',
      Rücken:    'M99 100 C91 103 83 107 79 111 C75 120 73 130 72 137 C77 146 82 155 86 159 C92 158 96 156 99 154 Z',
      Trizeps:   'M53 120 C50 131 49 144 49 158 C49 162 54 164 57 162 C58 148 59 134 62 123 Z',
      Unterarm:  'M47 172 C44 190 41 212 39 232 C38 238 44 240 47 236 C50 217 52 196 55 177 Z',
      Po:        'M99 182 C90 182 81 185 77 191 C73 197 74 207 79 213 C84 219 93 223 99 221 Z',
      Beine:     'M77 230 C72 247 70 265 73 283 C74 287 85 290 89 287 C93 266 94 246 96 230 C89 233 82 233 77 230 Z',
      Waden:     'M70 306 C66 320 65 342 70 360 C73 364 82 364 84 360 C87 342 86 320 84 307 C79 309 74 309 70 306 Z',
      Brust: '', Bizeps: '', Bauch: ''
    }
  }
};

function figHalf(view, load, max) {
  var v = FIG[view], t = '';
  FIG.outline.forEach(function (p) {
    t += '<path d="' + p + '" fill="#15181B" stroke="#3A4147" stroke-width="1.4" stroke-linejoin="round"/>';
  });
  for (var m in v.m) {
    if (!v.m[m]) continue;
    var val = load[m] || 0;
    var o = val > 0 ? Math.max(.32, Math.min(1, val / max)) : 0;
    t += '<path d="' + v.m[m] + '" fill="' + (o ? '#3B6BE8' : '#1F2429') + '"' +
      (o ? ' opacity="' + o.toFixed(2) + '"' : '') + ' stroke="#2A3035" stroke-width=".8"/>';
  }
  return t;
}

function bodyFigure(view, load, max, dx) {
  var half = figHalf(view, load, max);
  return '<g transform="translate(' + dx + ',0)">' +
    '<path d="' + FIG.head + '" fill="#15181B" stroke="#3A4147" stroke-width="1.4"/>' +
    '<g transform="translate(200,0) scale(-1,1)"><path d="' + FIG.head + '" fill="#15181B" stroke="#3A4147" stroke-width="1.4"/></g>' +
    half + '<g transform="translate(200,0) scale(-1,1)">' + half + '</g>' +
    '<g stroke="#2A3035" stroke-width=".9" fill="none">' +
    FIG[view].lines.map(function (l) { return '<path d="' + l + '"/>'; }).join('') +
    '<g transform="translate(200,0) scale(-1,1)">' +
    FIG[view].lines.map(function (l) { return '<path d="' + l + '"/>'; }).join('') + '</g></g>' +
    '<text x="100" y="415" fill="#5A6064" font-family="ui-monospace,Menlo,monospace" font-size="11" letter-spacing="2.2" text-anchor="middle">' +
    (view === 'front' ? 'VORNE' : 'HINTEN') + '</text></g>';
}

/* load: Belastung je EISENHORN-Muskelname (nicht je Gruppe). */
function torso(load) {
  var max = 1;
  for (var k in load) if (load[k] > max) max = load[k];
  return '<svg viewBox="0 0 420 424" preserveAspectRatio="xMidYMid meet">' +
    bodyFigure('front', load, max, 0) + bodyFigure('back', load, max, 220) + '</svg>';
}

/* Belastung je einzelnem Muskel — für die Körperkarte. */
function muscleLoad(from) {
  var out = {};
  db.log.forEach(function (l) {
    if (!isSet(l) || l.warm || l.t < from) return;
    var e = BY[l.slug]; if (!e || !e.mk) return;
    e.mk.forEach(function (r) { out[r[0]] = (out[r[0]] || 0) + (r[1] || 4) / 4; });
  });
  return out;
}

/* Belastung je einzelnem Muskel — für die Körperkarte. */
function muscleLoad(from) {
  var out = {};
  db.log.forEach(function (l) {
    if (!isSet(l) || l.warm || l.t < from) return;
    var e = BY[l.slug]; if (!e || !e.mk) return;
    e.mk.forEach(function (r) { out[r[0]] = (out[r[0]] || 0) + (r[1] || 4) / 4; });
  });
  return out;
}

/* Löschen. Alle Auswertungen leiten sich aus db.log ab — entfernte Sätze
   verschwinden damit automatisch aus Verlauf, Volumen und "Letztes Mal". */
function delSession(id) {
  id = String(id);
  var ts = db.log.filter(function (l) { return sidOf(l) === id; }).map(function (l) { return l.t; });
  db.log = db.log.filter(function (l) { return sidOf(l) !== id; });
  if (ts.length) {
    var lo = Math.min.apply(null, ts) - 6e4, hi = Math.max.apply(null, ts) + 6e4;
    db.sessions = db.sessions.filter(function (s) { return s.t < lo || s.t > hi; });
  }
  save();
}
function delExercise(id, slug) {
  id = String(id);
  db.log = db.log.filter(function (l) { return !(sidOf(l) === id && l.slug === slug); });
  if (!db.log.some(function (l) { return sidOf(l) === id; })) delSession(id);
  save();
}
function delOneSet(id, slug, t) {
  id = String(id);
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
           wo: null, rest: 0, restTotal: 75, elapsed: 0, toast: null, editR: false, open: {}, restSolo: null, range: 'woche', session: null, ask: null, solo: {}, summary: null, rir: 2, warm: false, dtab: 'log' };

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
function skalaOf(e) { return e.mk || [[e.m, 4]]; }
/* Die EISENHORN-Seite nennt die beanspruchte Muskulatur als geordnete Liste
   (primär zuerst) — ohne Prozentwerte. Genau so wird sie gezeigt. */
/* EISENHORN gibt die Beanspruchung in vier Stufen an — genau so wird sie gezeigt. */
function skalaBars(e) {
  var sk = skalaOf(e), h = '<div class="skala">';
  sk.forEach(function (r) {
    var lvl = r[1] || 4, pips = '';
    for (var i = 1; i <= 4; i++) pips += '<i class="pip' + (i <= lvl ? ' on' : '') + '"></i>';
    h += '<div class="srow"><b class="mname">' + esc(r[0]) + '</b>' +
      '<span class="pips">' + pips + '</span>' +
      '<span class="rank">' + lvl + '/4</span></div>';
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
    stat(Math.round(wkVol).toLocaleString('de-DE'), 'kg Woche') +
    stat(wkKcal, 'kcal Woche') + '</div>';

  h += '<div class="rowhead"><span>Rüstart heute</span><span class="mono">einmal aufbauen</span></div><div class="seg3">';
  RMODES.forEach(function (r) {
    var on = db.set.ruest === r, c = EX.filter(function (e) { return ruestOfEx(e) === r && (!db.set.hideDS || !e.ds); }).length;
    h += '<div class="s3' + (on ? ' on' : '') + '" data-a="ruest:' + r + '"><b>' + RLABEL[r] + '</b><i>' + c + ' Übungen</i></div>';
  });
  h += '</div>';

  var rh = recoveryHint(ids);
  if (rh) h += '<div class="recov">' + esc(rh) + '</div>';

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
  ['Alle'].concat(usedGroups()).forEach(function (c) {
    h += '<div class="chip' + (st.chip === c ? ' on' : '') + '" data-a="chip:' + c + '">' + c + '</div>';
  });
  h += '</div></div><div class="list">';
  list.forEach(function (e) {
    var n = stufeOf(e.slug);
    h += '<div class="erow" data-a="open:' + e.slug + '"><div class="thumb"><span class="scan"></span></div>' +
      '<div class="ebody"><div class="ename">' + esc(e.name) + (e.ds ? ' <span class="dsflag">DS</span>' : '') + '</div>' +
      '<div class="emeta">' + e.m + ' · ' + RLABEL[ruestOfEx(e)] + '</div>' +
      '<div class="mset">' + skalaOf(e).slice(0, 4).map(function (r) { return '<span style="width:' + (6 + 6 * (r[1] || 4)) + 'px"></span>'; }).join('') + '</div></div>' +
      '<div class="eright"><b>' + kgLabel(n) + '</b><i>Stufe ' + fmt(n) + '</i></div></div>';
  });
  return h + '</div>';
}

function vDetail() {
  var ex = BY[st.detail], n = stufeOf(ex.slug), c = cfgOf(ex.slug), tx = ex.tx;
  var tab = st.dtab || 'log';

  var h = '<div class="hero-media">' + media(ex, 260) +
    '<div class="back" data-a="back">←</div>' +
    '<div class="hmeta"><div class="hname">' + esc(ex.name) + '</div>' +
    '<div class="hsub">' + ex.m + ' · ' + RLABEL[ruestOfEx(ex)] + ' · Stufe ' + fmt(n) + ' ≈ ' + kgLabel(n) + ' kg</div></div></div>';

  h += '<div class="dtabs">' +
    '<div class="dt' + (tab === 'log' ? ' on' : '') + '" data-a="dtab:log">Trainieren</div>' +
    '<div class="dt' + (tab === 'info' ? ' on' : '') + '" data-a="dtab:info">Anleitung</div></div>';

  if (tab === 'log') {
    h += '<div class="block"><div class="blockhead"><span>Stufe → Kilogramm</span>' +
      '<span class="mono">' + setupLabel() + '</span></div>' +
      '<div class="stepper"><div class="sbtn" data-a="st-:' + ex.slug + '">–</div>' +
      '<div class="sval"><div><b>' + fmt(n) + '</b><i>Stufe</i></div><div class="skg">' + kgLabel(n) + ' kg</div></div>' +
      '<div class="sbtn" data-a="st+:' + ex.slug + '">+</div></div><div class="ladder">';
    STUFEN.forEach(function (sv) {
      h += '<div class="lb' + (sv <= n ? ' on' : '') + '" style="height:' + (34 * sv / 12) + 'px" data-a="stx:' + ex.slug + '|' + sv + '"></div>';
    });
    h += '</div><div class="lrange"><span>1 · ' + fmt(kgStart(1)) + ' kg</span><span>' +
      (n >= 8 ? 'ansteigende Kraftkurve' : 'konstante Last') + '</span><span>12 · ' + fmt(kgEnd(12)) + ' kg</span></div></div>';

    var pv = lastPerf(ex.slug);
    h += '<div class="lastbox wide">' + (pv
      ? '<i>Letztes Mal</i><b>' + perfLine(pv) + '</b>'
      : '<i>Letztes Mal</i><b class="dim">noch nichts protokolliert</b>') + '</div>';

    var sg = suggestion(ex.slug);
    if (sg) h += '<div class="lastbox wide sug"><i>Vorschlag</i><b>' + esc(sg.txt) + '</b>' +
      (sg.dir !== 0 ? '<span class="applybtn" data-a="stx:' + ex.slug + '|' + sg.next + '">Stufe ' + fmt(sg.next) + ' übernehmen</span>' : '') + '</div>';
    var sv = !sg && startVorschlag(ex.slug);
    if (sv) h += '<div class="lastbox wide start"><i>Noch nie protokolliert</i><b>' + esc(sv.txt) + '</b>' +
      (sv.stufe ? '<span class="applybtn alt" data-a="stx:' + ex.slug + '|' + sv.stufe + '">Stufe ' + fmt(sv.stufe) + ' übernehmen</span>' : '') + '</div>';

    var note = (db.notes && db.notes[ex.slug]) || '';
    if (note) h += '<div class="lastbox wide note"><i>Geräte-Notiz</i><b>' + esc(note) + '</b></div>';

    h += '<div class="pad">' + satzBlock(ex.slug, soloList(ex.slug), n, 'Satz eintragen') + '</div>';
    h += '<div class="pad"><div class="ghost" data-a="restnow:' + ex.slug + '">Pause starten · ' + mmss(c.rest) + '</div></div>';

    var rec = prOf(ex.slug);
    if (rec) {
      h += '<div class="prrow"><div class="prcell"><i>Schwerste Stufe</i><b>' + fmt(rec.load.stufe) + '</b><u>' + rec.load.reps + ' Wdh. · ' + dstr(rec.load.t) + '</u></div>' +
        '<div class="prcell"><i>Bestes Volumen</i><b>' + Math.round(rec.vol.vol).toLocaleString('de-DE') + '</b><u>kg · ' + dstr(rec.vol.t) + '</u></div></div>';
    }
    h += '<div class="spacer"></div>';
  } else {
    if (tx && (tx.v || tx.a || tx.f)) {
      h += '<div class="steps">';
      [['v', 'Vorbereitung'], ['a', 'Ausgangsposition'], ['f', 'Ausführung']].forEach(function (sx, i) {
        if (!tx[sx[0]]) return;
        h += '<div class="step"><span>' + ('0' + (i + 1)).slice(-2) + '</span><div><i>' + sx[1] + '</i>' +
          '<p>' + esc(tx[sx[0]]) + '</p></div></div>';
      });
      h += '</div>';
    }
    if (tx && tx.t) h += '<div class="tipbox"><i>Tipp</i><p>' + esc(tx.t) + '</p></div>';
    if (tx && tx.vt) h += '<div class="tipbox alt"><i>Variante</i><p>' + esc(tx.vt) + '</p></div>';

    h += '<div class="block"><div class="blockhead"><span>Beanspruchte Muskulatur</span>' +
      '<span class="mono">' + (ex.mk ? 'laut eisenhorn.com' : 'eigene Einschätzung') + '</span></div>' +
      skalaBars(ex) + '</div>';

    h += '<div class="duo"><div class="dcell"><i>Muskelgruppe</i><b>' + ex.m + '</b></div>' +
      '<div class="dcell" data-a="editr"><i>Rüstart' + (st.editR ? ' — wählen' : ' · tippen zum Ändern') + '</i><b>' + RLABEL[ruestOfEx(ex)] + '</b></div></div>';
    if (st.editR) {
      h += '<div class="seg3 flat">';
      RMODES.forEach(function (r) { h += '<div class="s3' + (ruestOfEx(ex) === r ? ' on' : '') + '" data-a="setr:' + ex.slug + '|' + r + '"><b>' + RLABEL[r] + '</b></div>'; });
      h += '</div>';
    }

    h += '<div class="block"><div class="blockhead"><span>Vorgabe</span>' +
      '<span class="mono">' + c.reps + ' Wdh. · ' + mmss(c.rest) + '</span></div><div class="cfg">' +
      stepper(ex.slug, 'reps', c.reps, 1) + stepper(ex.slug, 'rest', c.rest, 15, ' s') + '</div></div>';

    var nt = (db.notes && db.notes[ex.slug]) || '';
    h += '<div class="block"><div class="blockhead"><span>Geräte-Notiz</span>' +
      '<span class="mono">Lochnummer, Sitzposition</span></div>' +
      '<textarea class="notein" data-slug="' + ex.slug + '" rows="2" placeholder="z. B. Schlitten Loch 7, Bank 2 Handbreit vor der Säule">' + esc(nt) + '</textarea></div>';

    if (tx && tx.va && tx.va.length) {
      var vl = tx.va.filter(function (x) { return BY[x[1]]; }).map(function (x) {
        var b = BY[x[1]];
        return '<div class="vrow" data-a="open:' + x[1] + '"><span>' + esc(b.name) + '</span><i>' + RLABEL[ruestOfEx(b)] + '</i></div>';
      });
      if (vl.length) h += sec('varianten', 'Verwandte Übungen · ' + vl.length, vl.join(''));
    }
    h += '<div class="spacer"></div>';
  }
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
    stat(Math.round(vol).toLocaleString('de-DE'), 'kg gestemmt', 1) +
    stat(list.length, list.length === 1 ? 'Einheit' : 'Einheiten') +
    stat(kc, 'kcal') + '</div>' +
    '<div class="pad"><div class="mono dim">' + (min ? min + ' Min · ' : '') +
    plural(list.reduce(function (a, s) { return a + s.sets; }, 0), 'Satz', 'Sätze') + '</div></div>';

  var hs = hardSets(from), pp = pushPullCount(from);
  var order = Object.keys(mus).sort(function (a, b) { return (hs[b] || 0) - (hs[a] || 0); });
  h += '<div class="rowhead"><span>Beanspruchte Muskulatur</span>' +
       (st.range === 'woche' ? '<span class="mono">Ziel 10–20 Sätze</span>' : '') + '</div>';
  if (!order.length) {
    h += '<div class="hint">In diesem Zeitraum noch kein Training protokolliert.</div>';
  } else {
    h += '<div class="bodymap">' + torso(muscleLoad(from)) + '</div>' +
      '<div class="bodylegend"><span><i></i>nicht trainiert</span>' +
      '<span><i class="mid"></i>wenig</span><span><i class="on"></i>Schwerpunkt</span></div>';
    h += '<div class="bodyblock"><div class="mvols">';
    order.forEach(function (m) {
      var s = hs[m] || 0, pct = st.range === 'woche' ? Math.min(100, 100 * s / 20) : 100 * s / (hs[order[0]] || 1);
      var lo = st.range === 'woche' && s < 10, hi = st.range === 'woche' && s > 20;
      h += '<div class="mvol"><span>' + m + '</span><i><u class="' + (lo ? 'low' : hi ? 'high' : '') +
        '" style="width:' + Math.round(pct) + '%"></u></i>' +
        '<b>' + plural(s, 'Satz', 'Sätze') + '</b>' +
        '<em>' + Math.round(mus[m] || 0).toLocaleString('de-DE') + ' kg</em></div>';
    });
    h += '</div></div>';
    if (st.range === 'woche')
      h += '<div class="pad"><p class="fine">Balken bis 20 Sätze. Orange = unter 10 (zu wenig Reiz), rot = über 20 (Erholung prüfen).</p></div>';

    var tot = pp.push + pp.pull;
    if (tot) {
      var pw = Math.round(100 * pp.push / tot);
      var warn = pw > 65 ? 'Deutlicher Drück-Überhang — mehr Ziehen (Facepulls, Rudern) schützt die Schulter.'
               : pw < 35 ? 'Viel Zug, wenig Druck — Balance prüfen.' : 'Ausgewogenes Verhältnis.';
      h += '<div class="rowhead"><span>Drücken : Ziehen</span><span class="mono">nur Oberkörper</span></div>' +
        '<div class="ppbox"><div class="ppbar"><u style="width:' + pw + '%"></u></div>' +
        '<div class="pplab"><b>' + pp.push + ' Drücken</b><b>' + pp.pull + ' Ziehen</b></div>' +
        '<p class="' + (pw > 65 || pw < 35 ? 'warn' : '') + '">' + warn + '</p></div>';
    }
  }

  h += '<div class="rowhead"><span>Einheiten</span><span class="mono">' + all.length + ' gesamt</span></div>';
  if (!list.length) h += '<div class="hint">Nichts im gewählten Zeitraum.</div>';
  list.forEach(function (s) {
    var top = Object.keys(s.mus).sort(function (a, b) { return s.mus[b] - s.mus[a]; });
    var open = String(st.session) === String(s.id);
    h += '<div class="sess' + (open ? ' open' : '') + '"><div class="sessh" data-a="sess:' + s.id + '">' +
      '<div class="sessd"><b>' + new Date(s.t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) + '</b>' +
      '<i>' + plural(s.exCount, 'Übung', 'Übungen') + ' · ' + plural(s.sets, 'Satz', 'Sätze') +
      (durTxt(s.sec) ? ' · ' + durTxt(s.sec) : '') + '</i></div>' +
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

function vProfil() {
  var s = db.set;
  var h = '<div class="pad"><h1 class="h1">Profil</h1>' +
    '<p class="lead">Daraus schätzt die App eine Startstufe für Übungen, die du noch nie protokolliert hast. Danach zählt nur noch, was du tatsächlich schaffst.</p></div>';

  h += '<div class="block edge"><div class="pad2">' +
    '<div class="rowb"><span>Körpergewicht</span><b>' + s.bw + ' kg</b></div>' +
    '<input type="range" id="bw" min="45" max="140" value="' + s.bw + '">' +
    '<div class="rowb" style="margin-top:18px"><span>Alter</span><b>' + (s.alter || 35) + ' Jahre</b></div>' +
    '<input type="range" id="alter" min="16" max="80" value="' + (s.alter || 35) + '">' +
    '</div><div class="kols">' +
    [['m', 'Männlich'], ['w', 'Weiblich'], ['x', 'Keine Angabe']].map(function (x) {
      return '<div class="kol' + (s.sex === x[0] ? ' on' : '') + '" data-a="sex:' + x[0] + '">' + x[1] + '</div>';
    }).join('') + '</div></div>';

  h += '<div class="rowhead"><span>Trainingserfahrung</span></div>';
  h += '<div class="levels">' + LEVELS.map(function (l) {
    return '<div class="lvl' + (s.level === l[0] ? ' on' : '') + '" data-a="lvl:' + l[0] + '">' +
      '<b>' + l[1] + '</b><i>Faktor ' + fmt(l[2]) + '</i></div>';
  }).join('') + '</div>';

  var demo = ['bankdruecken-brustdruecken', 'hackenschmidt-kniebeuge', '201-vorgebeugtes-rudern-mit-griffstange',
              'schulterdruecken', 'bizepscurls'].filter(function (x) { return BY[x]; });
  h += '<div class="rowhead"><span>Daraus geschätzte Startstufen</span><span class="mono">' + setupLabel() + '</span></div>';
  demo.forEach(function (slug) {
    var e = BY[slug], v = startVorschlag(slug);
    var done = db.log.some(function (l) { return l.slug === slug && isSet(l); });
    h += '<div class="erow" data-a="open:' + slug + '"><div class="ebody">' +
      '<div class="ename">' + esc(e.name) + '</div>' +
      '<div class="emeta">' + e.mk[0][0] + ' · ' + RLABEL[ruestOfEx(e)] + '</div></div>' +
      '<div class="eright">' + (done
        ? '<b class="mut">bereits trainiert</b>'
        : v && v.stufe ? '<b>Stufe ' + fmt(v.stufe) + '</b><i>' + kgLabel(v.stufe) + ' kg</i>'
        : v && v.fix ? '<b class="mut">feste Stufe</b>'
        : '<b class="mut">unter Stufe 1</b>') + '</div></div>';
  });

  h += '<div class="pad"><p class="fine">Modell: Körpergewicht × Übungsfaktor (Beine 0,9 · Brust und Rücken 0,5 · Schultern 0,35 · Arme 0,22) × Geschlecht × Alter × Erfahrung, davon 65 % als Arbeitslast für 8–12 Wiederholungen. Einarmige Varianten 55 %. Das ist eine Schätzung für den ersten Satz, keine Vorgabe — beginne bewusst zu leicht.</p></div>';
  return h;
}

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
  var nt = (db.notes && db.notes[slug]) || '';
  if (nt) h += '<div class="lastbox note"><i>Geräte-Notiz</i><b>' + esc(nt) + '</b></div>';
  var rc = prOf(slug);
  if (rc) h += '<div class="lastbox pr"><i>Rekord · schwerste Stufe</i><b>' + prLine(rc.load) + '</b></div>';
  var sg2 = suggestion(slug);
  if (sg2) h += '<div class="lastbox sug"><i>Vorschlag</i><b>' + esc(sg2.txt) + '</b></div>';

  h += '<div class="duo tight"><div class="dcell ctr"><i>Stufe</i>' +
    '<div class="mini"><div class="sbtn sm" data-a="st-:' + slug + '">–</div><b>' + fmt(n) + '</b><div class="sbtn sm" data-a="st+:' + slug + '">+</div></div>' +
    '<u>' + kgLabel(n) + ' kg</u></div>' +
    '<div class="dcell ctr"><i>Pause danach</i><div class="mini">' +
    '<div class="sbtn sm" data-a="cfg:' + slug + '|rest|-15">–</div><b>' + mmss(c.rest) + '</b>' +
    '<div class="sbtn sm" data-a="cfg:' + slug + '|rest|15">+</div></div>' +
    '<u class="dim">' + plural(done.length, 'Satz', 'Sätze') + ' erledigt</u></div></div>';

  h += '<div class="sets">';
  done.forEach(function (s, i) {
    var rl = s.rl || [s.reps];
    h += '<div class="set ok' + (s.warm ? ' warm' : '') + '"><span class="mono">' + (s.warm ? 'AUFW.' : 'SATZ ' + (i + 1)) + '</span>' +
      '<b>' + rl.join(' · ') + '<u>' + sum(rl) + ' Wdh. · St. ' + fmt(s.stufe) +
      (s.rir !== undefined ? ' · RIR ' + s.rir : '') + '</u></b>' +
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
  else if (st.tab === 'profil') h = '<div class="scroll">' + vProfil() + '</div>';
  else h = '<div class="scroll">' + vRechner() + '</div>';
  if (!st.wo && st.detail) {
    var dx = BY[st.detail], sl = soloList(st.detail);
    h = '<div class="scroll">' + h + '</div>' +
      (st.dtab !== 'info'
        ? '<div class="dockbar"><div class="cta" data-a="logone:' + st.detail + '">Satz speichern · ' +
          sl.join('/') + ' · Stufe ' + fmt(stufeOf(st.detail)) + '</div></div>'
        : '') +
      (st.rest > 0 ? restOverlay(st.restSolo) : '');
  }

  if (tabs) {
    h += '<nav>' + [['heute', 'Heute'], ['katalog', 'Übungen'], ['verlauf', 'Verlauf'], ['rechner', 'Rechner'], ['profil', 'Profil']]
      .map(function (t) { return '<div class="tab' + (st.tab === t[0] ? ' on' : '') + '" data-a="tab:' + t[0] + '"><span></span>' + t[1] + '</div>'; }).join('') + '</nav>';
  }
  if (st.summary) {
    var sm = st.summary, mus = {}, mload = {};
    sm.ids.forEach(function (slug, i) {
      var e = BY[slug], rows = sm.done[i] || [];
      if (!e || !rows.length) return;
      rows.forEach(function (r) {
        if (r.warm) return;
        var v = kgStart(r.stufe) * r.reps;
        if (e.mk) e.mk.forEach(function (x) {
          mus[groupOf(x[0])] = (mus[groupOf(x[0])] || 0) + v * (x[1] || 4) / 4;
          mload[x[0]] = (mload[x[0]] || 0) + (x[1] || 4) / 4;
        });
        else mus[e.m] = (mus[e.m] || 0) + v;
      });
    });
    var mk = Object.keys(mus).sort(function (a, b) { return mus[b] - mus[a]; });
    h += '<div class="ask" data-a="sumok"><div class="askbox sum" data-a="noop">' +
      '<i>Training abgeschlossen</i>' +
      '<b>' + Math.round(sm.vol).toLocaleString('de-DE') + ' kg gestemmt</b>' +
      '<div class="sumscroll"><div class="sumgrid"><div><u>' + mmss(sm.sec) + '</u><span>Dauer</span></div>' +
      '<div><u>' + sm.sets + '</u><span>' + (sm.sets === 1 ? 'Satz' : 'Sätze') + '</span></div>' +
      '<div><u>' + sm.kcal + '</u><span>kcal</span></div></div>' +
      '<div class="sumtorso">' + torso(mload) + '</div><div class="mvols">' +
      mk.map(function (m) { return '<div class="mvol"><span>' + m + '</span><i><u style="width:' +
        Math.round(100 * mus[m] / mus[mk[0]]) + '%"></u></i><b>' + Math.round(mus[m]).toLocaleString('de-DE') + '</b></div>'; }).join('') +
      '</div></div>' +
      '<div class="cta" data-a="sumok">Fertig</div></div></div>';
  }
  if (st.ask) {
    h += '<div class="ask" data-a="askno"><div class="askbox" data-a="noop"><b>' + esc(st.ask.title) + '</b>' +
      '<p>' + esc(st.ask.body) + '</p><div class="askbtns">' +
      '<div class="ghost" data-a="askno">Abbrechen</div>' +
      '<div class="cta warn" data-a="askyes">Löschen</div></div></div></div>';
  }
  if (st.toast) h += '<div class="toast">' + esc(st.toast) + '</div>';

  var ae = document.activeElement, wasQ = ae && ae.id === 'q';
  var pos = wasQ ? ae.selectionStart : 0;
  var repI = ae && ae.classList && ae.classList.contains('repin') ? ae.getAttribute('data-i') : null;
  /* Scrollposition merken — sonst springt die Seite bei jedem +/- nach oben. */
  var sc = app.querySelector('.scroll, .wbody'), top = sc ? sc.scrollTop : 0;
  app.innerHTML = h;
  var sc2 = app.querySelector('.scroll, .wbody');
  if (sc2 && top) sc2.scrollTop = top;
  if (wasQ) { var q = document.getElementById('q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } }
  if (repI !== null) { var r = app.querySelector('.repin[data-i="' + repI + '"]'); if (r) r.focus(); }
}

/* ---------- Events ---------- */
app.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-a]'); if (!el) return;
  var p = el.getAttribute('data-a').split(':'), a = p[0], arg = p[1] || '';
  if (a === 'noop') return;   // Klick in der Box soll nicht den Backdrop auslösen
  var two = arg.split('|');
  if (a === 'tab') { st.tab = arg; st.detail = null; }
  else if (a === 'open') { st.detail = arg; st.editR = false; st.open = {}; st.warm = false; st.dtab = 'log'; }
  else if (a === 'dtab') st.dtab = arg;
  else if (a === 'sec') st.open[arg] = !st.open[arg];
  else if (a === 'back') st.detail = null;
  else if (a === 'chip') st.chip = arg;
  else if (a === 'chipR') st.chipR = arg;
  else if (a === 'range') { st.range = arg; st.session = null; }
  else if (a === 'sess') st.session = String(st.session) === String(arg) ? null : String(arg);
  else if (a === 'asksess') {
    var s0 = sessionList().filter(function (x) { return String(x.id) === String(arg); })[0];
    st.ask = { kind: 'sess', id: arg, title: 'Einheit löschen?',
      body: s0 ? new Date(s0.t).toLocaleDateString('de-DE') + ' · ' + plural(s0.exCount, 'Übung', 'Übungen') +
        ' · ' + plural(s0.sets, 'Satz', 'Sätze') + ' · ' + fmtKg(s0.vol) + ' werden aus dem Verlauf entfernt.' : '' };
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
  else if (a === 'sumok') st.summary = null;
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
  else if (a === 'sex') { db.set.sex = arg; save(); }
  else if (a === 'lvl') { db.set.level = arg; save(); }
  else if (a === 'st+') setStufe(arg, stufeOf(arg) + 0.5);
  else if (a === 'st-') setStufe(arg, stufeOf(arg) - 0.5);
  else if (a === 'stx') setStufe(two[0], +two[1]);
  else if (a === 'editr') st.editR = !st.editR;
  else if (a === 'setr') { db.ruestOv[two[0]] = two[1]; st.editR = false; save(); }
  else if (a === 'logone') {
    var rl0 = soloList(arg).slice(), warmed = st.warm;
    logSet(arg, stufeOf(arg), sum(rl0), soloSid(arg), rl0);
    st.warm = false;   // sonst laufen alle weiteren Sätze still als Aufwärmsatz
    toast((warmed ? 'Aufwärmsatz' : 'Satz') + ' gespeichert · ' + rl0.join('/') + ' · ' + sum(rl0) + ' Wdh.');
  }
  else if (a === 'start') startWo();
  else if (a === 'endwo') { endWo(false); }
  else if (a === 'cfg') { setCfg(two[0], two[1], cfgOf(two[0])[two[1]] + (+two[2])); }
  else if (a === 'restnow') { st.rest = cfgOf(arg).rest; st.restTotal = st.rest; st.restSolo = arg; }
  else if (a === 'rep') setCurAt(+two[0], activeList()[+two[0]] + (+two[1]));
  else if (a === 'repadd') addCur();
  else if (a === 'rir') { st.rir = +arg; st.warm = false; }
  else if (a === 'warm') st.warm = !st.warm;
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
        var c1 = document.querySelector('.dockbar .cta');
        if (c1) c1.textContent = 'Satz speichern · ' + a.join('/') + ' · Stufe ' + fmt(stufeOf(st.detail));
      }
    }
    return;
  }
  if (ev.target.classList.contains('notein')) {
    if (!db.notes) db.notes = {};
    db.notes[ev.target.getAttribute('data-slug')] = ev.target.value;
    save();
    return;
  }
  if (ev.target.id === 'q') { st.q = ev.target.value; render(); }
  else if (ev.target.id === 'bw') { db.set.bw = +ev.target.value; save(); render(); }
  else if (ev.target.id === 'alter') { db.set.alter = +ev.target.value; save(); render(); }
  else if (ev.target.id === 'hideds') { db.set.hideDS = ev.target.checked; save(); render(); }
});

function toast(m) { st.toast = m; clearTimeout(toast._t); toast._t = setTimeout(function () { st.toast = null; render(); }, 1900); }

function logSet(slug, stufe, reps, sid, rl) {
  var r = { slug: slug, stufe: stufe, reps: reps, kg: kgStart(stufe), t: Date.now(), sid: sid || null };
  if (rl) r.rl = rl;
  if (st.warm) r.warm = 1; else r.rir = st.rir;
  db.log.push(r);
  db.stufen[slug] = stufe; save();
}
function startWo() {
  var ids = planIds();
  st.wo = { idx: 0, cur: {}, done: {}, ids: ids, vol: 0, sid: 'w' + Date.now() };
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
  cur.push({ stufe: n, reps: total, rl: rl, warm: st.warm ? 1 : 0, rir: st.warm ? undefined : st.rir });
  if (!st.warm) w.vol += kgStart(n) * total;
  logSet(slug, n, total, w.sid, rl);
  w.cur[w.idx] = rl.slice();
  if (!st.warm) {
    var pr = prOf(slug, db.log[db.log.length - 1].t);
    if (!pr || kgStart(n) * total > pr.vol.vol) toast('Neuer Rekord · ' + Math.round(kgStart(n) * total).toLocaleString('de-DE') + ' kg');
  }
  st.warm = false;
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
    save();
    st.summary = { sid: st.wo.sid, sec: st.elapsed, kcal: kcal(st.elapsed), sets: sets,
                   vol: Math.round(st.wo.vol), ids: st.wo.ids.slice(), done: st.wo.done };
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
