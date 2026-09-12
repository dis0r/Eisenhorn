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

/* ---------- Speicher ----------
   Mehrere Personen trainieren am selben Gerät. Jedes Profil hat einen eigenen
   Speicherplatz mit Einstellungen, Stufen und Verlauf; der Index merkt sich,
   wer gerade aktiv ist. Ein vorhandener Altbestand wandert ins erste Profil. */
var K = 'eh.v1';
var PK = 'eh.profiles';
function profKey(id) { return 'eh.p.' + id; }
var prof = loadProfiles();
function loadProfiles() {
  var p = null;
  try { p = JSON.parse(localStorage.getItem(PK) || 'null'); } catch (e) {}
  if (!p || !p.list || !p.list.length) {
    var id = 'p' + Date.now();
    p = { list: [{ id: id, name: 'Ich' }], cur: id };
    try {
      var old = localStorage.getItem(K);
      if (old) localStorage.setItem(profKey(id), old);
    } catch (e) {}
    try { localStorage.setItem(PK, JSON.stringify(p)); } catch (e) {}
  }
  if (!p.list.some(function (x) { return x.id === p.cur; })) p.cur = p.list[0].id;
  return p;
}
function saveProfiles() { try { localStorage.setItem(PK, JSON.stringify(prof)); } catch (e) {} }
function curProf() {
  return prof.list.filter(function (x) { return x.id === prof.cur; })[0] || prof.list[0];
}
/* Kurzstatistik eines fremden Profils, ohne es zu laden. */
function profStat(id) {
  if (id === prof.cur) return { sess: (db.sessions || []).length, sets: (db.log || []).filter(isSet).length };
  try {
    var raw = localStorage.getItem(profKey(id));
    if (!raw) return { sess: 0, sets: 0 };
    var d = JSON.parse(raw);
    return { sess: (d.sessions || []).length, sets: (d.log || []).filter(function (l) { return l && l.reps; }).length };
  } catch (e) { return { sess: 0, sets: 0 }; }
}
function switchProfile(id) {
  if (id === prof.cur) return;
  save();
  prof.cur = id; saveProfiles();
  db = load();
  st.detail = null; st.summary = null; st.rest = 0; st.restSolo = null;
  st.session = null; st.open = {}; st.solo = {}; st.mix = 0; st.pname = '';
  applyLook();
}
function addProfile(name) {
  var id = 'p' + Date.now();
  prof.list.push({ id: id, name: name });
  saveProfiles();
  switchProfile(id);
}
function delProfile(id) {
  if (prof.list.length < 2) return;
  prof.list = prof.list.filter(function (x) { return x.id !== id; });
  try { localStorage.removeItem(profKey(id)); } catch (e) {}
  if (prof.cur === id) { prof.cur = prof.list[0].id; db = load(); st.mix = 0; }
  saveProfiles();
  applyLook();
}
var db = load();
function load() {
  var d = { set: { ds: true, kolben: 1, bw: 64, ruest: 'Stange', rest: 75, reps: 10, hideDS: false, sound: true,
                   dsMode: 'alle', focus: 'ganz',
                   alter: 42, sex: 'm', level: 'wieder' },
            ver: 4, snotes: {}, stufen: {}, ruestOv: {}, eigenOv: {}, richtOv: {}, cfg: {}, notes: {}, log: [], sessions: [] };
  try {
    var raw = localStorage.getItem(profKey(prof.cur));
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
      /* Bis Schema 2 war ein Log-Eintrag ein "Satz" aus mehreren Wiederholungs-
         eingaben. Jetzt ist ein Eintrag ein Durchgang — Altdaten werden einmalig
         aufgeteilt, damit Satzzahl und Wochenbilanz stimmen. Vorhandene Daten
         bleiben dabei erhalten; ein App-Update überschreibt sie nie, sie liegen
         im Gerätespeicher und nicht in den ausgelieferten Dateien. */
      if (!(d.ver >= 2)) {
        var out2 = [];
        d.log.forEach(function (l) {
          var rl = l.rl;
          if (!rl || rl.length < 2) { out2.push(l); return; }
          rl.forEach(function (r, i) {
            var c = {}; for (var q in l) c[q] = l[q];
            c.reps = r; c.rl = [r]; c.t = l.t + i;   // eindeutiger Zeitstempel je Durchgang
            out2.push(c);
          });
        });
        d.log = out2;
        d.ver = 2;
      }
      /* Der alte Standard für Zielwiederholungen war 8. Die 3×-Regel soll auf
         10 greifen — einmalig nachziehen, sofern nie selbst verstellt. */
      if (!(d.ver >= 3)) {
        if (!d.set.reps || d.set.reps === 8) d.set.reps = 10;
        d.ver = 3;
      }
      /* Aus dem alten Schalter "DS ausblenden" wird der Drei-Zustands-Filter. */
      if (!(d.ver >= 4)) {
        if (!d.set.dsMode) d.set.dsMode = d.set.hideDS ? 'ohne' : 'alle';
        if (!d.set.focus) d.set.focus = 'ganz';
        d.ver = 4;
      }
    }
  } catch (e) {}
  return d;
}
function save() { try { localStorage.setItem(profKey(prof.cur), JSON.stringify(db)); } catch (e) {} }

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

/* ---------- Gerätevariante ----------
   Ein Teil des Katalogs setzt das EISENHORN DS (zwei Schienen) voraus.
   Drei Zustände: alles zeigen, nur DS-Übungen, oder DS ausblenden. */
var DSL = { alle: 'Alle Geräte', nur: 'nur DS', ohne: 'ohne DS' };
function dsMode() { return db.set.dsMode || (db.set.hideDS ? 'ohne' : 'alle'); }
function dsOk(e) { var m = dsMode(); return m === 'alle' ? true : m === 'nur' ? !!e.ds : !e.ds; }

/* ---------- Trainingsfokus ----------
   Trainingslehre: bei 2–3 Einheiten pro Woche ist Ganzkörper überlegen, ab 4
   lohnt der Wechsel aus Drücken / Ziehen / Unterkörper. Einzelne Gruppen sind
   für gezielte Zusatzarbeit da, nicht als Wochenplan. */
var FOCUS = [
  { id: 'ganz',  lbl: 'Ganzkörper',  g: null },
  { id: 'oben',  lbl: 'Oberkörper',  g: ['Brust', 'Rücken', 'Schultern', 'Arme'] },
  { id: 'unten', lbl: 'Unterkörper', g: ['Beine'] },
  { id: 'push',  lbl: 'Drücken',     g: ['Brust', 'Schultern', 'Arme'], dir: 'push' },
  { id: 'pull',  lbl: 'Ziehen',      g: ['Rücken', 'Arme'], dir: 'pull' },
  { id: 'core',  lbl: 'Rumpf',       g: ['Bauch'] }
];
function focusList() {
  var l = FOCUS.slice();
  usedGroups().forEach(function (g) {
    if (!FOCUS.some(function (f) { return f.lbl === g; })) l.push({ id: 'grp~' + g, lbl: g, g: [g] });
  });
  return l;
}
function focusOf(id) {
  var f = focusList().filter(function (x) { return x.id === id; })[0];
  return f || FOCUS[0];
}
function curFocus() { return focusOf(db.set.focus || 'ganz'); }
function fitsFocus(e, f) {
  if (f.dir) return pushPull(e) === f.dir;
  if (!f.g) return true;
  return f.g.indexOf(e.m) >= 0;
}
/* Stunden seit dem letzten Durchgang dieser Übung — Grundlage für Abwechslung:
   Wer lange nicht dran war, kommt zuerst. */
function hoursSinceEx(slug) {
  for (var i = db.log.length - 1; i >= 0; i--)
    if (db.log[i].slug === slug && isSet(db.log[i])) return (Date.now() - db.log[i].t) / 36e5;
  return Infinity;
}

/* ---------- Kolbenrichtung ----------
   Für einen Teil der Übungen arbeitet der Kolben abwärts (du ziehst oder
   drückst von oben nach unten: Latzug, Trizepsdrücken, Dips), für den Rest
   aufwärts. Zwischen beiden Gruppen muss das EISENHORN gedreht werden —
   deshalb sortiert der Tagesplan erst alle Abwärts-, dann alle Aufwärts-
   übungen: genau ein Drehen pro Training. Pro Übung korrigierbar. */
var RICHT_AB = /(latzug|klimmzug|trizepsdr(ü|ue)cken|trizeps ?extensions|pushdown|pull ?over|pullover|dips|facepull|face ?pull|überkopf|hängendes beinheben|crunch)/i;
var RICHTL = { ab: 'Kolben abwärts', auf: 'Kolben aufwärts', frei: 'Blocker · Richtung frei' };
/* Ist die Station geblockt (Blocker, höchste Stufe), arbeitet der Kolben gar
   nicht mit — solche Übungen passen in jede Hälfte und lösen kein Drehen aus. */
function richtOf(e) {
  if (!e) return 'auf';
  var ov = db.richtOv && db.richtOv[e.slug];
  if (ov) return ov;
  if (isFixedStufe(e)) return 'frei';
  return RICHT_AB.test(e.name) ? 'ab' : 'auf';
}
/* Mehrgelenkige Übungen zuerst: sie brauchen die frische Kraft und das
   stabilste Nervensystem, Isolation kommt danach. */
var COMPOUND_RE = /(kniebeug|kreuzheben|beinpresse|ausfallschritt|laufschritt|bankdr|brustdr|schulterdr|rudern|ruderzug|latzug|klimmzug|dips|hackenschmidt|farmers|deadlift|squat|hüftheben|clean|umsetzen|thruster|plank to pike|pike)/i;
function isCompound(e) { return !!e && COMPOUND_RE.test(e.name); }

/* Sortierung des Tagesplans: erst die Kolbenrichtung (genau ein Drehen),
   darin mehrgelenkig vor Isolation, darin die Auswahlreihenfolge. */
var RRANK = { ab: 0, frei: 1, auf: 2 };
function sortByRicht(ids) {
  return ids.map(function (id, i) {
    return { id: id, i: i, r: RRANK[richtOf(BY[id])], c: isCompound(BY[id]) ? 0 : 1 };
  })
    .sort(function (a, b) { return a.r - b.r || a.c - b.c || a.i - b.i; })
    .map(function (x) { return x.id; });
}
/* Index, ab dem die Kolbenrichtung wechselt (−1 = kein Wechsel). */
function turnAt(ids) {
  var sawAb = false;
  for (var i = 0; i < ids.length; i++) {
    var r = richtOf(BY[ids[i]]);
    if (r === 'ab') sawAb = true;
    else if (r === 'auf' && sawAb) return i;
  }
  return -1;
}

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
/* Trainingstage je Muskelgruppe im Zeitraum. Für Aufbau ist die Frequenz der
   stärkere Hebel als das Volumen einer einzelnen Einheit: zweimal 8 Durchgänge
   pro Woche wirken besser als einmal 16. */
function freqPerGroup(from) {
  var out = {};
  db.log.forEach(function (l) {
    if (!isSet(l) || l.warm || l.t < from) return;
    var e = BY[l.slug]; if (!e) return;
    var d = new Date(l.t); d.setHours(0, 0, 0, 0);
    var gs = e.mk ? e.mk.map(function (r) { return groupOf(r[0]); }) : [e.m];
    gs.forEach(function (g) { (out[g] = out[g] || {})[d.getTime()] = 1; });
  });
  var n = {};
  for (var g in out) n[g] = Object.keys(out[g]).length;
  return n;
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
/* Ein Durchgang = eine Serie Wiederholungen bis zur Pause. Alle Durchgänge
   einer Übung innerhalb einer Einheit bilden zusammen den Satz. Gespeichert
   wird je Durchgang; die Pause startet dabei automatisch. Beendet wird der
   Satz mit "Übung beenden" bzw. dem Wechsel zur nächsten Übung. */
function repVal(slug) {
  st.rp = st.rp || {};
  if (st.rp[slug] !== undefined) return st.rp[slug];
  for (var i = db.log.length - 1; i >= 0; i--)
    if (db.log[i].slug === slug && isSet(db.log[i])) return db.log[i].reps;
  return cfgOf(slug).reps;
}
function setRep(slug, v) {
  if (isNaN(v)) return;
  st.rp = st.rp || {};
  st.rp[slug] = Math.max(1, Math.min(99, v));
}
/* Die Durchgänge dieser Übung im laufenden Satz. */
function dgRows(slug) {
  var sid = st.wo ? st.wo.sid : soloSid(slug);
  return db.log.filter(function (l) { return l.slug === slug && sidOf(l) === sid && isSet(l); });
}
function dgSum(rows) { return rows.reduce(function (a, x) { return a + x.reps; }, 0); }
function dgBlock(slug) {
  var rows = dgRows(slug), hard = rows.filter(function (x) { return !x.warm; });
  var zt = cfgOf(slug).reps;
  var h = '<div class="cursat"><div class="cursath"><span>Durchgang ' + (hard.length + 1) + '</span>' +
    '<b>' + (hard.length ? plural(hard.length, 'Durchgang', 'Durchgänge') + ' · ' + dgSum(hard) + ' Wdh. im Satz'
                         : 'Satz noch offen') + '</b></div><div class="replist">' +
    '<div class="reprow big"><div class="sbtn" data-a="rp:' + slug + '|-1">–</div>' +
    '<input type="number" inputmode="numeric" min="1" max="99" value="' + repVal(slug) + '" data-slug="' + slug + '" class="repin">' +
    '<div class="sbtn" data-a="rp:' + slug + '|1">+</div><span class="repu">Wdh.</span></div>';
  h += '<div class="rirbar"><span>Wie viele hättest du noch geschafft?</span><div class="rirpick">';
  [0, 1, 2, 3, 4].forEach(function (v) {
    h += '<div class="rp' + (st.rir === v && !st.warm ? ' on' : '') + '" data-a="rir:' + v + '">' + (v === 4 ? '4+' : v) + '</div>';
  });
  h += '</div></div>';
  h += '<div class="rulerow">Ziel: 3 Durchgänge mit ' + zt + ' Wdh. → ' +
    (zt < repHi() ? 'danach ' + Math.min(repHi(), zt + repStep()) + ' Wdh.' : 'danach nächste Stufe, zurück auf ' + repLo() + ' Wdh.') + '</div>';
  h += '<div class="warmrow' + (st.warm ? ' on' : '') + '" data-a="warm"><span class="box"></span>' +
    'Aufwärm-Durchgang — zählt nicht für Volumen und Rekorde</div>';
  return h + '</div>';
}
/* Die bereits gespeicherten Durchgänge des laufenden Satzes. */
function dgDone(slug) {
  var rows = dgRows(slug);
  if (!rows.length) return '';
  var hard = 0;
  var h = '<div class="sets">';
  rows.forEach(function (r) {
    if (!r.warm) hard++;
    h += '<div class="set ok' + (r.warm ? ' warm' : '') + '"><span class="mono">' +
      (r.warm ? 'AUFW.' : 'DG ' + hard) + '</span><b>' + r.reps + ' Wdh.' +
      '<u>' + (isEigen(BY[slug]) ? 'Eigengewicht' : 'St. ' + fmt(r.stufe)) +
      (r.rir !== undefined ? ' · RIR ' + r.rir : '') + '</u></b>' +
      '<span class="tagr" data-a="dgdel:' + slug + '~' + r.t + '">↺</span></div>';
  });
  return h + '</div>';
}
function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
/* Pausenempfehlung nach Belastung: große mehrgelenkige Übungen brauchen
   2–3 Minuten, damit die nächste Serie nicht an der Kondition scheitert;
   Isolation kommt mit 60–90 s aus. */
var RESTG = { Beine: 150, Rücken: 120, Brust: 120, Schultern: 105, Arme: 75, Bauch: 60, Ganzkörper: 120 };
function restFor(slug) {
  var e = BY[slug]; if (!e) return db.set.rest || 90;
  var base = RESTG[e.m] || 90;
  if (!isCompound(e)) base = Math.max(60, Math.round(base * 0.65 / 15) * 15);
  return base;
}
function cfgOf(slug) {
  var c = (db.cfg && db.cfg[slug]) || {};
  return { reps: c.reps || db.set.reps || 10, rest: c.rest || restFor(slug) };
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
  var eig = isEigen(BY[slug]);
  var vol = null, load = null, rep = null, any = false;
  db.log.forEach(function (l) {
    if (l.slug !== slug || !isSet(l) || l.warm || l.t === exceptT) return;
    any = true;
    var v = setVol(l);
    var r = { vol: v, stufe: l.stufe, reps: l.reps, rl: l.rl, t: l.t };
    if (!vol || v > vol.vol) vol = r;
    if (!load || l.stufe > load.stufe || (l.stufe === load.stufe && l.reps > load.reps)) load = r;
    if (!rep || l.reps > rep.reps) rep = r;
  });
  return any ? { vol: vol, load: load, rep: rep, eigen: eig } : null;
}
function prLine(p, eig) {
  if (eig) return p.reps + ' Wdh. · Eigengewicht · ' + dstr(p.t);
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
/* Kinder und Jugendliche: Krafttraining ist ab dem Grundschulalter unbedenklich,
   solange die Last leicht bleibt und die Ausführung führt. Vor der Pubertät
   wächst Kraft über Ansteuerung, nicht über Muskelquerschnitt — schwere Stufen
   bringen dort nichts und belasten Wachstumsfugen unnötig. */
function isKid() { return (db.set.alter || 35) < 14; }
function isTeen() { var a = db.set.alter || 35; return a >= 14 && a < 18; }
function ageFak() {
  var a = db.set.alter || 35;
  if (a < 18) return Math.max(.4, .45 + (a - 6) * .046);
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
/* Eigengewichtsübungen: Die Station trägt keine Zusatzlast — gearbeitet wird
   gegen den eigenen Körper (Hängendes Beinheben, Klimmzüge, Liegestütz, Dips
   ohne Gewicht). Die eingestellte Stufe beschreibt dort keine Last, also darf
   sie nicht in Kilogramm gerechnet werden: Volumen 0, Fortschritt über
   Wiederholungen. Pro Übung im Reiter „Anleitung" umschaltbar. */
var EIGEN_RE = /(hängendes beinheben|mit körpergewicht|klimmzug|plank|l-sit|muscle-?up|^dips \(ds\)|^liegestütze$|^liegestütze mit einem bein)/i;
function isEigen(e) {
  if (!e) return false;
  var ov = db.eigenOv && db.eigenOv[e.slug];
  if (ov !== undefined) return !!ov;
  return EIGEN_RE.test(e.name) || isFixedStufe(e);
}
function setEigen(slug, v) {
  if (!db.eigenOv) db.eigenOv = {};
  db.eigenOv[slug] = !!v; save();
}
/* Volumen eines Satzes in Kilogramm. Eigengewichtssätze liefern 0 — sie zählen
   weiter als Arbeitssatz (Muskelkarte, Sätze pro Woche), nur nicht als kg. */
function setVol(l) {
  if (isEigen(BY[l.slug])) return 0;
  return (l.kg || kgStart(l.stufe)) * l.reps;
}
/* Lastangabe für Listen und Kopfzeilen. */
function loadLabel(e, n) { return isEigen(e) ? 'Eigengewicht' : kgLabel(n) + ' kg'; }
/* Reine Schätzung aus dem Profil, unabhängig davon, ob die Übung schon
   protokolliert wurde — wird zum Deckeln geerbter Stufen gebraucht. */
function schaetzung(slug) {
  var e = BY[slug];
  if (!e || !e.mk) return null;

  var prim = e.mk[0][0], fak = EXFAK[prim] || .3;
  var unten = prim === 'Beine' || prim === 'Po' || prim === 'Waden';
  var einzeln = /einarmig|einbeinig|einarmige|seitlich einarmig/.test(e.name.toLowerCase());
  var kg = db.set.bw * fak * sexFak(!unten) * ageFak() * levelFak() * (einzeln ? .55 : 1) * .65;

  if (isFixedStufe(e)) {
    return { fix: true, txt: 'Feste Einstellung — die Vorbereitung gibt sie vor (siehe Anleitung). Steigerung läuft über Wiederholungen, nicht über die Stufe.' };
  }
  if (isEigen(e)) {
    return { fix: true, txt: 'Eigengewichtsübung — du arbeitest gegen den eigenen Körper. Steigerung läuft über Wiederholungen und Ausführung.' };
  }
  var k = cfg(), roh = kg / (mult() * k.f) - 1;
  var stufe = Math.round(roh * 2) / 2;
  if (stufe < 1) {
    return { unter: true, kg: Math.round(kg),
      txt: 'Geschätzt ' + Math.round(kg) + ' kg — das liegt unter Stufe 1 (' + fmt(kgStart(1)) +
        ' kg mit ' + setupLabel() + '). ' + (isKid()
          ? (db.set.ds === false && db.set.kolben === 0
              ? 'Stufe 1 mit 12–15 sauberen Wiederholungen — oder die Übung ganz ohne Gerät üben.'
              : 'Für Kinder: Einzelschiene und Kolben 12 einstellen, dann Stufe 1 mit 12–15 sauberen Wiederholungen — oder die Übung ganz ohne Gerät üben.')
          : 'Leichteren Kolben verwenden oder Stufe 1 mit mehr Wiederholungen.') };
  }
  stufe = Math.min(12, stufe);
  return { stufe: stufe, kg: Math.round(kg),
    txt: 'Startvorschlag Stufe ' + fmt(stufe) + ' ≈ ' + kgLabel(stufe) + ' kg. ' +
      (isKid() ? 'Für Kinder bewusst niedrig — 12–15 Wiederholungen, Technik geht vor Last.' : 'Lieber zu leicht beginnen.') };
}
/* Derselbe Wert, aber nur solange die Übung noch keinen eigenen Verlauf hat —
   danach zählt, was tatsächlich geschafft wurde. */
function startVorschlag(slug) {
  if (db.log.some(function (l) { return l.slug === slug && isSet(l); })) return null;
  return schaetzung(slug);
}

/* ---------- Wiederholungsfenster ----------
   Doppelte Progression: erst innerhalb des Fensters die Wiederholungen
   hochziehen, dann eine Stufe höher und zurück an den unteren Rand. Ein
   Stufensprung ist am EISENHORN groß (Kolben 26 im DS: Stufe 5 → 5,5 sind
   +6,5 kg), deshalb ist der Zwischenschritt über die Wiederholungen wichtig. */
function repLo() { return db.set.reps || 10; }
function repHi() { return repLo() + 4; }
function repStep() { return 2; }

/* Progressionsvorschlag aus Wiederholungen und Anstrengung (RIR = Reps in
   Reserve). */
function suggestion(slug) {
  var all = db.log.filter(function (l) { return l.slug === slug && isSet(l) && !l.warm; });
  if (!all.length) return null;
  var lastSid0 = sidOf(all[all.length - 1]);
  var ls = all.filter(function (l) { return sidOf(l) === lastSid0; });
  var target = cfgOf(slug).reps, n0 = ls[ls.length - 1].stufe;
  var clean = ls.filter(function (l) { return l.reps >= target; });
  /* RIR-Trend statt Momentaufnahme: die letzten bis zu drei Einheiten,
     die jüngste doppelt gewichtet — ein schlechter Tag kippt so nichts. */
  var sids = [], seenS = {};
  for (var q = all.length - 1; q >= 0 && sids.length < 3; q--) {
    var sq = sidOf(all[q]);
    if (!seenS[sq]) { seenS[sq] = 1; sids.push(sq); }
  }
  var wsum = 0, wn = 0;
  sids.forEach(function (sd, i) {
    var wgt = i === 0 ? 2 : 1;
    all.forEach(function (l) {
      if (sidOf(l) !== sd || l.rir === undefined) return;
      wsum += l.rir * wgt; wn += wgt;
    });
  });
  var avgR = wn ? wsum / wn : null;
  var rir0 = ls.filter(function (l) { return l.rir !== undefined; });
  /* Progressive Überlastung: drei saubere Durchgänge auf Zielwiederholungen —
     und keine Anzeichen, dass es gerade noch so ging. */
  if (clean.length >= 3 && (avgR === null || avgR >= 1)) {
    /* Schritt 1: Wiederholungen innerhalb des Fensters erhöhen. */
    if (target < repHi()) {
      var nz = Math.min(repHi(), target + repStep());
      return { dir: 0, reps: nz, ziel: true,
        txt: clean.length + '× ' + target + ' Wdh. sauber — gleiche Stufe, jetzt ' + nz + ' Wdh. anstreben (Fenster ' + repLo() + '–' + repHi() + ').' };
    }
    /* Schritt 2: Fenster ausgereizt — eine Stufe höher, Wiederholungen zurück. */
    if (isEigen(BY[slug]))
      return { dir: 0, reps: target + repStep(), eigen: true,
        txt: clean.length + '× ' + target + ' Wdh. geschafft — Eigengewichtsübung: Fenster nach oben verschieben (' + (target + repStep()) + ' Wdh.) oder langsamer ausführen.' };
    return { dir: 1, next: Math.min(12, n0 + 0.5), reps: repLo(), ziel: true,
      txt: 'Fenster ausgereizt (' + clean.length + '× ' + target + ' Wdh.) — Stufe ' + fmt(Math.min(12, n0 + 0.5)) + ' und zurück auf ' + repLo() + ' Wdh.' };
  }
  var rows = rir0;
  if (rows.length < 2) return null;
  var lastSid = sidOf(rows[rows.length - 1]);
  var s = rows.filter(function (l) { return sidOf(l) === lastSid; });
  if (s.length < 2) return null;
  var avg = s.reduce(function (a, l) { return a + l.rir; }, 0) / s.length;
  var n = s[s.length - 1].stufe;
  if (isEigen(BY[slug])) {
    var tot = s.reduce(function (a, l) { return a + l.reps; }, 0);
    if (avg >= 2) return { dir: 0, next: n, eigen: true, txt: 'Ø ' + fmt(Math.round(avg * 10) / 10) + ' Wdh. Reserve bei ' + tot + ' Wdh. — Eigengewichtsübung: mehr Wiederholungen oder langsamere Ausführung statt höherer Stufe.' };
    if (avg < 0.5) return { dir: 0, next: n, eigen: true, txt: 'Kaum Reserve — Wiederholungen halten, ggf. Satzzahl reduzieren.' };
    return { dir: 0, next: n, eigen: true, txt: 'Passende Belastung — ' + tot + ' Wdh. halten.' };
  }
  if (avg >= 2) return { dir: 1, next: Math.min(12, n + 0.5), txt: 'Ø ' + fmt(Math.round(avg * 10) / 10) + ' Wdh. Reserve — Stufe ' + fmt(Math.min(12, n + 0.5)) + ' probieren.' };
  if (avg < 0.5) return { dir: -1, next: Math.max(1, n - 0.5), txt: 'Kaum Reserve — Stufe ' + fmt(n) + ' halten oder auf ' + fmt(Math.max(1, n - 0.5)) + ' zurück.' };
  return { dir: 0, next: n, txt: 'Passende Belastung — Stufe ' + fmt(n) + ' halten.' };
}
/* Ein Knopf, der den Vorschlag genau so übernimmt, wie er formuliert ist. */
function sugBtn(slug, sg) {
  if (!sg) return '';
  if (sg.dir !== 0 && sg.next !== undefined)
    return '<span class="applybtn" data-a="prog:' + slug + '|' + sg.next + '|' + (sg.reps || 0) + '">Stufe ' +
      fmt(sg.next) + (sg.reps ? ' · ' + sg.reps + ' Wdh.' : '') + ' übernehmen</span>';
  if (sg.reps)
    return '<span class="applybtn alt" data-a="prog:' + slug + '|0|' + sg.reps + '">' + sg.reps + ' Wdh. übernehmen</span>';
  return '';
}
function perfLine(p, eig) {
  return plural(p.sets, 'Durchgang', 'Durchgänge') + ': ' + p.reps.join('  |  ') +
         ' · ' + p.total + ' Wdh. · ' + (eig ? 'Eigengewicht' : 'Stufe ' + fmt(p.stufe)) + ' · ' + dstr(p.t);
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
/* Ohne eigenen Verlauf gilt die Schätzung aus dem Profil — sonst startet ein
   Kind mit derselben Vorgabe wie ein Erwachsener. */
function stufeOf(slug) {
  if (db.stufen[slug] !== undefined) return db.stufen[slug];
  var v = schaetzung(slug);
  if (v && v.stufe) return v.stufe;
  if (v && v.unter) return 1;
  return 5;
}
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
      var v = setVol(l);
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
    t += '<path d="' + p + '" fill="var(--fig-fill)" stroke="var(--fig-edge)" stroke-width="1.4" stroke-linejoin="round"/>';
  });
  for (var m in v.m) {
    if (!v.m[m]) continue;
    var val = load[m] || 0;
    var o = val > 0 ? Math.max(.32, Math.min(1, val / max)) : 0;
    t += '<path d="' + v.m[m] + '" fill="' + (o ? 'var(--acc)' : 'var(--fig-rest)') + '"' +
      (o ? ' opacity="' + o.toFixed(2) + '"' : '') + ' stroke="var(--fig-line)" stroke-width=".8"/>';
  }
  return t;
}

function bodyFigure(view, load, max, dx) {
  var half = figHalf(view, load, max);
  return '<g transform="translate(' + dx + ',0)">' +
    '<path d="' + FIG.head + '" fill="var(--fig-fill)" stroke="var(--fig-edge)" stroke-width="1.4"/>' +
    '<g transform="translate(200,0) scale(-1,1)"><path d="' + FIG.head + '" fill="var(--fig-fill)" stroke="var(--fig-edge)" stroke-width="1.4"/></g>' +
    half + '<g transform="translate(200,0) scale(-1,1)">' + half + '</g>' +
    '<g stroke="var(--fig-line)" stroke-width=".9" fill="none">' +
    FIG[view].lines.map(function (l) { return '<path d="' + l + '"/>'; }).join('') +
    '<g transform="translate(200,0) scale(-1,1)">' +
    FIG[view].lines.map(function (l) { return '<path d="' + l + '"/>'; }).join('') + '</g></g>' +
    '<text x="100" y="415" fill="var(--fig-label)" font-family="ui-monospace,Menlo,monospace" font-size="11" letter-spacing="2.2" text-anchor="middle">' +
    (view === 'front' ? 'VORNE' : 'HINTEN') + '</text></g>';
}

/* Vordere Halbfigur, stark verkleinert: nur Umriss plus getroffene Muskeln.
   prim = primär beanspruchte Flächen (voll), sec = sekundär (halb). */
function miniFig(ex) {
  var hit = {};
  (ex.mk || [[ex.m, 4]]).forEach(function (r) { hit[r[0]] = Math.max(hit[r[0]] || 0, r[1] >= 3 ? 1 : .45); });
  var half = function (view) {
    var v = FIG[view], t = '';
    FIG.outline.forEach(function (p) { t += '<path d="' + p + '" fill="var(--fig-fill)"/>'; });
    for (var m in v.m) {
      if (!v.m[m]) continue;
      var o = hit[m] || 0;
      if (!o) continue;
      t += '<path d="' + v.m[m] + '" fill="var(--acc)" opacity="' + o + '"/>';
    }
    return t;
  };
  /* Trifft die Übung ausschließlich Rückseiten-Muskeln, zeigt die Marke die
     Rückansicht — sonst die Vorderseite. */
  var backOnly = Object.keys(hit).length > 0 && Object.keys(hit).every(function (m) {
    return !FIG.front.m[m] && !!FIG.back.m[m];
  });
  var view = backOnly ? 'back' : 'front', hp = half(view);
  return '<svg viewBox="40 44 120 268" preserveAspectRatio="xMidYMid meet" aria-hidden="true">' +
    '<path d="' + FIG.head + '" fill="var(--fig-fill)"/>' +
    '<g transform="translate(200,0) scale(-1,1)"><path d="' + FIG.head + '" fill="var(--fig-fill)"/></g>' +
    hp + '<g transform="translate(200,0) scale(-1,1)">' + hp + '</g></svg>';
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
           wo: null, rest: 0, restTotal: 75, elapsed: 0, toast: null, editR: false, open: {}, restSolo: null, range: 'woche', session: null, ask: null, solo: {}, summary: null, rir: 2, warm: false, dtab: 'log', mix: 0, pname: '' };

function planIds() {
  var r = db.set.ruest, f = curFocus();
  var pool = EX.filter(function (e) { return dsOk(e) && fitsFocus(e, f); });
  /* Innerhalb einer Gruppe zuerst, was am längsten nicht trainiert wurde —
     so kommt jede Einheit auf einen anderen Mix, ohne den Plan zu verwürfeln. */
  var fresh = function (a, b) { return hoursSinceEx(b.slug) - hoursSinceEx(a.slug); };
  var main = pool.filter(function (e) { return ruestOfEx(e) === r; }).sort(fresh);
  var free = r === 'Ohne' ? [] : pool.filter(function (e) { return ruestOfEx(e) === 'Ohne'; }).sort(fresh);
  var pick = [], seen = {}, mix = st.mix || 0;
  /* Beim Mischen rückt die Auswahl innerhalb jeder Gruppe weiter — gleicher
     Aufbau, gleiche Reihenfolge, andere Übungen. */
  var nth = function (arr, k) { return arr.length ? arr[(k + arr.length) % arr.length] : null; };
  var groups = (f.g && f.g.length ? f.g.slice() : ['Beine', 'Brust', 'Rücken', 'Schultern', 'Bauch', 'Arme']).concat(['Ganzkörper']);
  /* Zwei Runden über die Gruppen: erst je eine Übung, dann auffüllen —
     bei einem engen Fokus (eine Gruppe) landen so mehrere Übungen daraus. */
  [0, 1].forEach(function () {
    groups.forEach(function (g) {
      if (pick.length >= 5) return;
      var cand = main.filter(function (e) { return e.m === g && !seen[e.slug]; });
      if (!cand.length) cand = free.filter(function (e) { return e.m === g && !seen[e.slug]; });
      var c = nth(cand, mix);
      if (c) { pick.push(c.slug); seen[c.slug] = 1; }
    });
  });
  var restp = main.concat(free).filter(function (e) { return !seen[e.slug]; });
  while (pick.length < 5 && restp.length) {
    var rc = nth(restp, mix + pick.length);
    restp = restp.filter(function (e) { return e.slug !== rc.slug; });
    pick.push(rc.slug); seen[rc.slug] = 1;
  }
  return sortByRicht(pick);
}

/* ---------- Deload ----------
   Vier Wochen steigende oder gleich hohe Belastung ohne leichte Woche: dann
   ist eine Entlastungswoche fällig — Volumen etwa 40 % zurück, Stufen halten.
   Ohne diese Pause laufen Sehnen und Nervensystem der Muskulatur hinterher. */
function weekKey(t) {
  var d = new Date(t); d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}
function deloadHint() {
  var wks = {};
  db.log.forEach(function (l) {
    if (!isSet(l) || l.warm) return;
    var k = weekKey(l.t);
    (wks[k] = wks[k] || { sets: 0, days: {} }).sets++;
    wks[k].days[new Date(l.t).toDateString()] = 1;
  });
  var keys = Object.keys(wks).map(Number).sort(function (a, b) { return a - b; });
  var cur = weekKey(Date.now());
  var past = keys.filter(function (k) { return k < cur; }).slice(-4);
  if (past.length < 4) return null;
  var vals = past.map(function (k) { return wks[k].sets; });
  var tage = past.map(function (k) { return Object.keys(wks[k].days).length; });
  if (tage.some(function (n) { return n < 2; })) return null;
  var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  if (min < max * 0.7) return null;                 // es gab schon eine leichte Woche
  /* Läuft die aktuelle Woche schon entlastet, ist der Hinweis erledigt. */
  var nun = wks[cur] ? wks[cur].sets : 0;
  if (nun && nun < min * 0.7) return null;
  return { txt: '4 Wochen durchgezogen (' + vals.join(' · ') + ' Durchgänge). Diese Woche als Entlastung fahren: etwa 40 % weniger Durchgänge, Stufen unverändert lassen.' };
}

/* ---------- Aufwärmen ----------
   Vor dem ersten schweren Durchgang einer Übung: zwei leichte Durchgänge bei
   rund 50 % und 70 % der Arbeitsstufe. Kostet zwei Minuten und ist der
   wirksamste Verletzungsschutz beim Wiedereinstieg. */
function warmPlan(slug) {
  var e = BY[slug]; if (!e) return null;
  var rows = dgRows(slug);
  if (rows.length) return null;                 // schon dran gewesen
  if (isEigen(e)) return { eigen: true, txt: 'Erst zwei leichte Durchgänge mit halber Wiederholungszahl und ruhigem Tempo — dann der erste Arbeitsdurchgang.' };
  var n = stufeOf(slug);
  /* Auf den untersten Stufen gibt es nichts abzustufen — dann wärmt man
     ohne Last auf, nicht mit einer rechnerisch gleichen Stufe. */
  if (n <= 1.5) return { eigen: true, txt: 'Zwei lockere Durchgänge auf Stufe ' + fmt(n) + ' mit halber Wiederholungszahl und ruhigem Tempo — dann der erste Arbeitsdurchgang.' };
  var a = Math.max(1, Math.round(n * 0.5 * 2) / 2), b = Math.max(1, Math.round(n * 0.7 * 2) / 2);
  if (b >= n) b = Math.max(1, n - 0.5);
  if (a >= b) a = Math.max(1, b - 0.5);
  return { a: a, b: b, n: n,
    txt: 'Stufe ' + fmt(a) + ' (' + kgLabel(a) + ' kg) und Stufe ' + fmt(b) + ' (' + kgLabel(b) + ' kg), je 6–8 Wdh. — dann Stufe ' + fmt(n) + '.' };
}
function warmBox(slug) {
  var w = warmPlan(slug); if (!w) return '';
  return '<div class="lastbox wide warmup"><i>Aufwärmen zuerst</i><b>' + esc(w.txt) + '</b>' +
    (w.a ? '<span class="applybtn alt" data-a="warmset:' + slug + '|' + w.a + '">Stufe ' + fmt(w.a) + ' · Aufwärmen starten</span>' : '') + '</div>';
}

/* ---------- Empfehlung für die nächste Einheit ----------
   Trainerlogik in drei Regeln: was in dieser Woche unter dem Richtwert von
   10 Arbeitsdurchgängen liegt, hat Vorrang; Muskeln unter 48 h Erholung werden
   gemieden; der Fokus der letzten Einheit kommt nicht direkt wieder. */
function nextPlan() {
  var wk = rangeStart('woche');
  var hs = hardSets(wk), fq = freqPerGroup(wk);
  var last = db.sessions.length ? db.sessions[db.sessions.length - 1] : null;
  var lastF = last && last.focus;
  var best = null;
  FOCUS.forEach(function (f) {
    var gs = f.g && f.g.length ? f.g : ['Beine', 'Brust', 'Rücken', 'Schultern', 'Bauch', 'Arme'];
    var score = 0, frisch = [], mager = [], selten = [];
    gs.forEach(function (g) {
      var sets = hs[g] || 0;
      var defizit = Math.max(0, 10 - sets);
      score += defizit;
      if (defizit >= 6) mager.push(g);
      /* Frequenz: unter zwei Einheiten pro Woche und Muskel fehlt ein Reiz. */
      var f = fq[g] || 0;
      if (f < 2) { score += (2 - f) * 4; if (sets > 0) selten.push(g); }
      var hrs = hoursSince(g);
      if (hrs !== null && hrs < 48) { score -= (48 - hrs) / 4; frisch.push(g); }
    });
    score = score / gs.length * 1.4;
    if (f.id === lastF) score -= 6;
    if (f.id === 'ganz' && db.sessions.length < 8) score += 2;   // Einsteiger: Ganzkörper zuerst
    if (!best || score > best.score) best = { f: f, score: score, mager: mager, frisch: frisch, selten: selten };
  });
  if (!best) return null;
  var t = [];
  var lst = function (a) { return a.slice(0, 2); };
  if (best.mager.length) {
    var mg = lst(best.mager);
    t.push(mg.join(' und ') + (mg.length > 1 ? ' liegen' : ' liegt') + ' diese Woche unter 10 Durchgängen');
  }
  if (best.frisch.length) {
    var fr = lst(best.frisch);
    t.push(fr.join(' und ') + (fr.length > 1 ? ' brauchen' : ' braucht') + ' noch Erholung');
  }
  if (best.selten.length) {
    var sl = best.selten.slice(0, 2);
    t.push(sl.join(' und ') + (sl.length > 1 ? ' waren' : ' war') + ' diese Woche nur einmal dran (zweimal wäre besser)');
  }
  if (lastF && lastF !== best.f.id) t.push('zuletzt war ' + focusOf(lastF).lbl + ' dran');
  return { id: best.f.id, lbl: best.f.lbl, txt: t.length ? t.join(' · ') : 'ausgewogene Verteilung über die Woche' };
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
  t += '<line x1="60" y1="140" x2="150" y2="18" stroke="var(--line2)" stroke-width="9" stroke-linecap="round"/>';
  for (var i = 1; i <= 5; i++) {
    var f = i / 6, x = 60 + 90 * f, y = 140 - 122 * f;
    t += '<line x1="' + (x - 7) + '" y1="' + (y + 5) + '" x2="' + (x + 7) + '" y2="' + (y - 5) + '" stroke="var(--line)" stroke-width="3"/>';
  }
  t += '<g' + mv + sty + '>';
  t += '<line x1="26" y1="101" x2="86" y2="101" stroke="var(--accfg)" stroke-width="4" stroke-linecap="round"/>';
  t += '<rect x="72" y="92" width="28" height="18" rx="2" fill="var(--acc)"/>';
  t += '<circle cx="26" cy="101" r="5" fill="var(--accfg)"/></g>';
  t += '<text x="16" y="22" fill="var(--fig-label)" font-family="ui-monospace,Menlo,monospace" font-size="10" letter-spacing="1.2">' + p.lbl.toUpperCase() + '</text>';
  return t + '</svg>';
}
/* Bildquelle: media/<slug>.gif — fehlt sie, wird der Originaldateiname aus dem
   EISENHORN-Download versucht; erst danach greift das Bewegungsschema. */
/* Bildquellen in Reihenfolge. Zuerst der umbenannte Slug-Name, danach die
   Originaldateinamen aus dem EISENHORN-Download — in mehreren Kodierungen, weil
   die Umlaute je nach System unterschiedlich auf der Platte liegen. Dadurch
   funktioniert media/ auch OHNE den Lauf von rename-gifs.sh. */
function mediaSrcs(e) {
  var out = ['media/' + e.slug + '.gif'];
  var orig = (D.GIF || {})[e.slug];
  if (orig) (typeof orig === 'string' ? [orig] : orig).forEach(function (n) {
    out.push('media/' + encodeURIComponent(n));
  });
  return out;
}
/* Der Dateiname der heruntergeladenen GIFs kann in mehreren Kodierungen vorliegen
   (NFC, NFD, doppelt kodiert). Der onerror-Handler läuft alle Kandidaten durch;
   erst wenn keiner lädt, greift das Bewegungsschema. */
function media(e, h) {
  /* ?keep=1 markiert Bilder, die der Service Worker offline behalten darf —
     nur das Detailbild, nicht 161 Listenkacheln. */
  var s = mediaSrcs(e).map(function (u) { return u + '?keep=1'; });
  return '<div class="media" style="height:' + h + 'px">' +
    '<img src="' + s[0] + '" alt="" data-try="0" data-src="' + esc(s.join('|')) + '" ' +
    'onerror="var l=this.getAttribute(\'data-src\').split(\'|\'),i=+this.getAttribute(\'data-try\')+1;' +
    'if(i<l.length){this.setAttribute(\'data-try\',i);this.src=l[i];}' +
    'else{this.parentNode.classList.add(\'novid\');}">' +
    '<div class="schema">' + schema(e) + '</div>' +
    '<span class="mlabel">Bewegungsschema</span></div>';
}
/* Kleines Vorschaubild für Listen. Die Bewegungs-GIFs sind 0,4–0,8 MB groß —
   161 davon in einer Liste wären zig Megabyte Datenverkehr und dutzende
   gleichzeitig laufende Animationen. Deshalb lädt die Liste NICHTS aus dem
   Netz: sie zeigt ein Bild nur, wenn es schon im Offline-Cache liegt (also
   nachdem die Übung einmal im Detail offen war). Sonst bleibt das Raster. */
function thumb(e) {
  return '<div class="thumb" data-thumb="' + e.slug + '">' + miniFig(e) + '</div>';
}
/* Nach jedem Rendern: für sichtbare Zeilen im Cache nachsehen. */
var _thumbSeen = {};
function wireThumbs() {
  if (!window.caches || !window.IntersectionObserver) return;
  var nodes = app.querySelectorAll('.thumb[data-thumb]');
  if (!nodes.length) return;
  var io = new IntersectionObserver(function (ents) {
    ents.forEach(function (en) {
      if (!en.isIntersecting) return;
      var el = en.target, slug = el.getAttribute('data-thumb');
      io.unobserve(el);
      if (_thumbSeen[slug] === 0) return;
      var e = BY[slug]; if (!e) return;
      var cands = mediaSrcs(e).map(function (u) { return u + '?keep=1'; });
      (function next(i) {
        if (i >= cands.length) { _thumbSeen[slug] = 0; return; }
        caches.match(cands[i]).then(function (hit) {
          if (!hit) return next(i + 1);
          _thumbSeen[slug] = cands[i];
          if (!el.querySelector('img')) {
            var img = document.createElement('img');
            img.alt = ''; img.src = cands[i];
            el.appendChild(img);
          }
        }).catch(function () { next(i + 1); });
      })(0);
    });
  }, { rootMargin: '120px' });
  Array.prototype.forEach.call(nodes, function (n) { io.observe(n); });
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
  /* Die verbleibende Zeit steigt als Fläche von unten — sichtbar auch
     quer über den Raum, ohne die Ziffern zu lesen. */
  var frac = st.rest / Math.max(1, st.restTotal);
  return '<div class="rest"><div class="restfill" style="height:' + (frac * 100).toFixed(1) + '%"></div>' +
    '<span class="sheetgrab"></span><i>Pause</i><div class="ringwrap plain">' +
    '<div class="rin"><b id="rclk">' + mmss(st.rest) + '</b><span>bis zum nächsten Durchgang</span></div></div>' +
    (function () {
      var dn = slug ? dgRows(slug).filter(function (x) { return !x.warm; }) : [];
      return '<div class="restinfo">Durchgang gespeichert · ' + (dn.length ? plural(dn.length, 'Durchgang', 'Durchgänge') + ' im offenen Satz' : 'Satz läuft') + '</div>';
    })() +
    (e ? '<div class="next"><i>' + (st.restSolo ? 'Übung' : 'Als Nächstes') + '</i><b>' + esc(e.name) + '</b>' +
      '<u>' + (isEigen(e) ? 'Eigengewicht' : 'Stufe ' + fmt(stufeOf(slug)) + ' · ' + kgLabel(stufeOf(slug)) + ' kg') + ' · ' +
      repVal(slug) + ' Wdh.</u></div>' : '') +
    '<div class="rbtns"><div class="ghost" data-a="rest+">+30 s</div><div class="cta" data-a="rest0">Pause beenden</div></div>' +
    '<span class="sheethint flow">Nach unten wischen beendet die Pause</span>' +
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
    '</div><h1 class="hero">Gestärkt<br>ins Leben</h1>' +
    (prof.list.length > 1 ? '<div class="whois" data-a="tab:profil">Training für <b>' + esc(curProf().name) + '</b></div>' : '') +
    '</div>';

  h += '<div class="stats">' +
    stat(streak(), 'Tage Serie', 1) +
    stat(Math.round(wkVol).toLocaleString('de-DE'), 'kg Woche') +
    stat(wkKcal, 'kcal Woche') + '</div>';

  var np = nextPlan();
  if (np && np.id !== (db.set.focus || 'ganz'))
    h += '<div class="reco"><i>Empfehlung für heute</i><b>' + np.lbl + '</b><u>' + esc(np.txt) + '</u>' +
      '<span class="applybtn" data-a="focus:' + np.id + '">übernehmen</span></div>';

  h += '<div class="rowhead"><span>Fokus heute</span><span class="mono">' + curFocus().lbl + '</span></div><div class="rfilter wrap">';
  focusList().forEach(function (f) {
    var cnt = EX.filter(function (e) { return dsOk(e) && fitsFocus(e, f); }).length;
    if (!cnt) return;   // Fokus ohne passende Übungen führt in einen leeren Plan
    h += '<div class="rc' + ((db.set.focus || 'ganz') === f.id ? ' on' : '') + '" data-a="focus:' + f.id + '">' + f.lbl + ' <em>' + cnt + '</em></div>';
  });
  h += '</div>';

  h += '<div class="rowhead"><span>Gerät</span><span class="mono">' + DSL[dsMode()] + '</span></div><div class="rfilter">';
  ['alle', 'nur', 'ohne'].forEach(function (m) {
    h += '<div class="rc' + (dsMode() === m ? ' on' : '') + '" data-a="dsm:' + m + '">' + DSL[m] + '</div>';
  });
  h += '</div>';

  h += '<div class="rowhead"><span>Rüstart heute</span><span class="mono">einmal aufbauen</span></div><div class="seg3">';
  RMODES.forEach(function (r) {
    var on = db.set.ruest === r, c = EX.filter(function (e) { return ruestOfEx(e) === r && dsOk(e); }).length;
    h += '<div class="s3' + (on ? ' on' : '') + '" data-a="ruest:' + r + '"><b>' + RLABEL[r] + '</b><i>' + c + ' Übungen</i></div>';
  });
  h += '</div>';

  var rh = recoveryHint(ids);
  if (rh) h += '<div class="recov">' + esc(rh) + '</div>';
  var dl = deloadHint();
  if (dl) h += '<div class="recov deload"><b>Entlastungswoche fällig</b> ' + esc(dl.txt) + '</div>';

  if (!ids.length) {
    return h + '<div class="card"><div class="cardtop"><span class="dot"></span><span class="tag">MIKE5 · heute</span></div>' +
      '<div class="ctitle">' + curFocus().lbl + ' · ' + RLABEL[db.set.ruest] + '</div>' +
      '<div class="csub">Keine Übung passt zu dieser Kombination aus Fokus, Gerät und Rüstart.</div>' +
      '<div class="ghost thin" data-a="focus:ganz">Auf Ganzkörper zurücksetzen</div></div><div class="spacer"></div>';
  }

  h += '<div class="card"><div class="cardtop"><span class="dot"></span><span class="tag">MIKE5 · heute</span><span class="mono ml">' +
    (turnAt(ids) > 0 ? '1× drehen' : 'kein Umbau') + '</span></div>' +
    '<div class="ctitle">' + curFocus().lbl + ' · ' + RLABEL[db.set.ruest] + '</div>' +
    '<div class="csub">' + ids.length + ' Übungen · ca. 22 Min · einmal aufbauen, ' +
    (turnAt(ids) > 0 ? 'einmal drehen' : 'ohne Drehen') + '</div><div class="plan">';
  var tp = turnAt(ids);
  ids.forEach(function (slug, i) {
    if (i === tp) h += '<div class="prow turn"><span class="num">↻</span>' +
      '<span class="pname">EISENHORN einmal drehen</span><span class="pload">' + RICHTL[richtOf(BY[slug])] + '</span></div>';
    var e = BY[slug], n = stufeOf(slug);
    h += '<div class="prow" data-a="open:' + slug + '"><span class="num">' + ('0' + (i + 1)).slice(-2) + '</span>' +
      '<span class="pname">' + esc(e.name) + '</span><span class="pload">' +
      (isEigen(e) ? 'Eigengewicht' : 'St. ' + fmt(n) + ' · ' + kgLabel(n) + ' kg') + '</span></div>';
  });
  h += '</div><div class="ghost thin" data-a="mix">Andere Übungen vorschlagen</div>' +
    '<div class="cta" data-a="start">Training starten <b>→</b></div></div>';

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
function stat(v, l, acc) { return '<div class="stat"><b' + (acc ? ' class="hl"' : '') + '>' + v + '</b><i>' + l + '</i></div>'; }
function streak() {
  var d = 0, day = 864e5, t = new Date(); t.setHours(0, 0, 0, 0); var cur = t.getTime();
  var days = {}; db.sessions.forEach(function (s) { var x = new Date(s.t); x.setHours(0, 0, 0, 0); days[x.getTime()] = 1; });
  if (!days[cur]) cur -= day;
  while (days[cur]) { d++; cur -= day; }
  return d;
}

function vKatalog() {
  var list = EX.filter(function (e) {
    if (!dsOk(e)) return false;
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
  h += '</div><div class="rfilter">';
  ['alle', 'nur', 'ohne'].forEach(function (m) {
    h += '<div class="rc' + (dsMode() === m ? ' on' : '') + '" data-a="dsm:' + m + '">' + DSL[m] + '</div>';
  });
  h += '</div><div class="chips">';
  ['Alle'].concat(usedGroups()).forEach(function (c) {
    h += '<div class="chip' + (st.chip === c ? ' on' : '') + '" data-a="chip:' + c + '">' + c + '</div>';
  });
  h += '</div></div><div class="list">';
  list.forEach(function (e) {
    var n = stufeOf(e.slug);
    h += '<div class="erow" data-a="open:' + e.slug + '">' + thumb(e) +
      '<div class="ebody"><div class="ename">' + esc(e.name) + (e.ds ? ' <span class="dsflag">DS</span>' : '') + '</div>' +
      '<div class="emeta">' + e.m + ' · ' + RLABEL[ruestOfEx(e)] + '</div>' +
      '<div class="mset">' + skalaOf(e).slice(0, 4).map(function (r) { return '<span style="width:' + (6 + 6 * (r[1] || 4)) + 'px"></span>'; }).join('') + '</div></div>' +
      '<div class="eright">' + (isEigen(e) ? '<b>Eigen</b><i>Körpergewicht</i>' : '<b>' + kgLabel(n) + '</b><i>Stufe ' + fmt(n) + '</i>') + '</div></div>';
  });
  return h + '</div>';
}

function vDetail() {
  var ex = BY[st.detail], n = stufeOf(ex.slug), c = cfgOf(ex.slug), tx = ex.tx;
  var tab = st.dtab || 'log', eig = isEigen(ex);

  var h = '<div class="hero-media">' + media(ex, 260) +
    '<div class="back" data-a="back">←</div>' +
    '<div class="hmeta"><div class="hname">' + esc(ex.name) + '</div>' +
    '<div class="hsub">' + ex.m + ' · ' + RLABEL[ruestOfEx(ex)] + ' · ' +
    (eig ? 'Eigengewicht — Last wird nicht gerechnet' : 'Stufe ' + fmt(n) + ' ≈ ' + kgLabel(n) + ' kg') + '</div></div></div>';

  h += '<div class="dtabs">' +
    '<div class="dt' + (tab === 'log' ? ' on' : '') + '" data-a="dtab:log">Trainieren</div>' +
    '<div class="dt' + (tab === 'info' ? ' on' : '') + '" data-a="dtab:info">Anleitung</div></div>';

  if (tab === 'log') {
    if (eig) {
      h += '<div class="lastbox wide note"><i>Eigengewichtsübung</i><b>Du arbeitest gegen den eigenen Körper — die Geräteeinstellung ist ein Anschlag, keine Last. Diese Sätze zählen als Arbeitssätze, aber mit 0 kg Volumen. Fortschritt läuft über Wiederholungen und Ausführung.</b></div>';
    } else {
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
    }

    var pv = lastPerf(ex.slug);
    h += '<div class="lastbox wide">' + (pv
      ? '<i>Letztes Mal</i><b>' + perfLine(pv, eig) + '</b>'
      : '<i>Letztes Mal</i><b class="dim">noch nichts protokolliert</b>') + '</div>';

    var sg = suggestion(ex.slug);
    if (sg) h += '<div class="lastbox wide sug"><i>Vorschlag</i><b>' + esc(sg.txt) + '</b>' + sugBtn(ex.slug, sg) + '</div>';
    var sv = !sg && startVorschlag(ex.slug);
    if (sv) h += '<div class="lastbox wide start"><i>Noch nie protokolliert</i><b>' + esc(sv.txt) + '</b>' +
      (sv.stufe ? '<span class="applybtn alt" data-a="stx:' + ex.slug + '|' + sv.stufe + '">Stufe ' + fmt(sv.stufe) + ' übernehmen</span>' : '') + '</div>';

    var note = (db.notes && db.notes[ex.slug]) || '';
    if (note) h += '<div class="lastbox wide note"><i>Geräte-Notiz</i><b>' + esc(note) + '</b></div>';

    h += dgDone(ex.slug);
    h += warmBox(ex.slug);
    h += '<div class="pad">' + dgBlock(ex.slug) + '</div>';
    h += '<div class="pad"><div class="ghost" data-a="endex:' + ex.slug + '">Übung beenden · Satz abschließen</div></div>';

    var rec = prOf(ex.slug);
    if (rec && rec.eigen) {
      h += '<div class="prrow"><div class="prcell"><i>Meiste Wiederholungen</i><b>' + rec.rep.reps + '</b><u>Wdh. · ' + dstr(rec.rep.t) + '</u></div>' +
        '<div class="prcell"><i>Belastung</i><b>Eigen</b><u>kein kg-Volumen</u></div></div>';
    } else if (rec) {
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

    h += '<div class="block"><div class="blockhead"><span>Belastungsart</span>' +
      '<span class="mono">' + (eig ? 'kein kg-Volumen' : 'Stufe = Last') + '</span></div>' +
      '<div class="warmrow' + (eig ? ' on' : '') + '" data-a="eigen:' + ex.slug + '"><span class="box"></span>' +
      'Eigengewichtsübung — Gewicht nicht rechnen</div>' +
      '<div class="pad2"><p class="fine">Für Übungen, bei denen du deinen eigenen Körper bewegst (z. B. Hängendes Beinheben). Die Stufe wäre dort keine Last — solche Sätze zählen für Muskelkarte und Satzzahl, aber mit 0 kg.</p></div></div>';

    h += '<div class="duo"><div class="dcell"><i>Muskelgruppe</i><b>' + ex.m + '</b></div>' +
      '<div class="dcell" data-a="editr"><i>Rüstart' + (st.editR ? ' — wählen' : ' · tippen zum Ändern') + '</i><b>' + RLABEL[ruestOfEx(ex)] + '</b></div></div>';
    h += '<div class="duo"><div class="dcell" data-a="richt:' + ex.slug + '"><i>Aufbaurichtung · tippen zum Ändern</i><b>' + RICHTL[richtOf(ex)] + '</b></div>' +
      '<div class="dcell"><i>Reihenfolge</i><b>' +
      ({ ab: 'erste Hälfte', frei: 'beliebig — vor dem Drehen', auf: 'zweite Hälfte' })[richtOf(ex)] + '</b></div></div>';
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
    plural(list.reduce(function (a, s) { return a + s.sets; }, 0), 'Durchgang', 'Durchgänge') + '</div></div>';

  var hs = hardSets(from), pp = pushPullCount(from);
  var order = Object.keys(mus).sort(function (a, b) { return (hs[b] || 0) - (hs[a] || 0); });
  h += '<div class="rowhead"><span>Beanspruchte Muskulatur</span>' +
       (st.range === 'woche' ? '<span class="mono">Ziel 10–20 Durchgänge</span>' : '') + '</div>';
  if (!order.length) {
    h += '<div class="blank"><u>00</u><b>Noch keine Daten</b>' +
      '<span>Sobald du den ersten Durchgang speicherst, färbt sich hier die Muskelkarte und die Wochenbilanz füllt sich.</span></div>';
  } else {
    h += '<div class="bodymap">' + torso(muscleLoad(from)) + '</div>' +
      '<div class="bodylegend"><span><i></i>nicht trainiert</span>' +
      '<span><i class="mid"></i>wenig</span><span><i class="on"></i>Schwerpunkt</span></div>';
    h += '<div class="bodyblock"><div class="mvols">';
    order.forEach(function (m) {
      var s = hs[m] || 0, pct = st.range === 'woche' ? Math.min(100, 100 * s / 20) : 100 * s / (hs[order[0]] || 1);
      var lo = st.range === 'woche' && s < 10, hi = st.range === 'woche' && s > 20;
      h += '<div class="mvol"><span>' + m + '</span><i class="' + (st.range === 'woche' ? 'zone' : '') + '"><u class="' + (lo ? 'low' : hi ? 'high' : '') +
        '" style="width:' + Math.round(pct) + '%"></u></i>' +
        '<b>' + plural(s, 'Durchgang', 'Durchgänge') + '</b>' +
        '<em>' + Math.round(mus[m] || 0).toLocaleString('de-DE') + ' kg</em></div>';
    });
    h += '</div></div>';
    if (st.range === 'woche')
      h += '<div class="pad"><p class="fine">Balken bis 20 Durchgänge pro Woche. Orange = unter 10 (zu wenig Reiz), rot = über 20 (Erholung prüfen).</p></div>';

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
  if (!list.length) h += '<div class="blank"><u>00</u><b>Keine Einheit im Zeitraum</b>' +
    '<span>Wechsle oben den Zeitraum oder starte ein Training.</span></div>';
  list.forEach(function (s) {
    var top = Object.keys(s.mus).sort(function (a, b) { return s.mus[b] - s.mus[a]; });
    var open = String(st.session) === String(s.id);
    h += '<div class="sess' + (open ? ' open' : '') + '"><div class="sessh" data-a="sess:' + s.id + '">' +
      '<div class="sessd"><b>' + new Date(s.t).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }) + '</b>' +
      '<i>' + plural(s.exCount, 'Übung', 'Übungen') + ' · ' + plural(s.sets, 'Durchgang', 'Durchgänge') +
      (durTxt(s.sec) ? ' · ' + durTxt(s.sec) : '') + '</i></div>' +
      '<div class="sessv"><b>' + fmtKg(s.vol) + '</b><i>' + top.slice(0, 2).join(' · ') + '</i></div></div>';
    if (open) {
      h += '<div class="sessb">';
      var sn = (db.snotes || {})[s.id];
      if (sn) h += '<div class="lastbox note flat"><i>Notiz</i><b>' + esc(sn) + '</b></div>';
      h += '<div class="mvols tight">';
      top.forEach(function (m) {
        h += '<div class="mvol"><span>' + m + '</span><i><u style="width:' +
          Math.round(100 * s.mus[m] / s.mus[top[0]]) + '%"></u></i><b>' + fmtKg(s.mus[m]) + '</b></div>';
      });
      h += '</div>';
      Object.keys(s.ex).forEach(function (slug) {
        var e = BY[slug]; if (!e) return;
        var rows = s.ex[slug];
        h += '<div class="sexblock"><div class="sexrow"><span data-a="open:' + slug + '">' + esc(e.name) + '</span>' +
          '<i>' + (isEigen(e) ? 'Eigen' : 'St. ' + fmt(rows[rows.length - 1].stufe)) + ' · ' + plural(rows.length, 'Durchgang', 'Durchgänge') + '</i>' +
          '<span class="del" data-a="askex:' + s.id + '~' + slug + '">✕</span></div>';
        rows.forEach(function (r, i) {
          h += '<div class="setline"><span class="mono">Durchgang ' + (i + 1) + '</span>' +
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
  var h = '<div class="pad"><h1 class="h1">Rechner</h1><p class="lead">12 Hauptstufen, 11 Halbstufen. Was deine Stufe in Kilogramm bedeutet.</p></div>' +
    '<div class="block edge"><div class="rails">' +
    rail('EISENHORN S', '1 Schiene · 1 Kolben', !db.set.ds, 'ds:0') +
    rail('EISENHORN DS', '2 Schienen · 2 Kolben', db.set.ds, 'ds:1') + '</div><div class="kols">' +
    KOLBEN.map(function (k, i) { return '<div class="kol' + (db.set.kolben === i ? ' on' : '') + '" data-a="kol:' + i + '">' + k.label + '</div>'; }).join('') +
    '</div><div class="pad2"><div class="setupline"><span class="sq"></span>' + setupLabel() + '</div>' +
    '<div class="rowb"><span>Körpergewicht · für kcal</span><b>' + db.set.bw + ' kg</b></div>' +
    '<input type="range" id="bw" min="20" max="140" value="' + db.set.bw + '">' +
    '<div class="rfilter tight">' + ['alle', 'nur', 'ohne'].map(function (m) {
      return '<div class="rc' + (dsMode() === m ? ' on' : '') + '" data-a="dsm:' + m + '">' + DSL[m] + '</div>';
    }).join('') + '</div>' +
    '<div class="note"><span class="bar"></span><p>Stufe 1–7 hält die Last konstant. Ab Stufe 8 steigt sie im Bewegungsverlauf an — deshalb dort zwei Werte: Anfang und Ende.</p></div></div></div>';

  var maxKg = kgEnd(12);
  h += '<div class="table"><div class="thead"><span class="c1">Stufe</span><span class="c2">Anteil</span><span class="c3">Last</span></div>';
  STUFEN.forEach(function (n, i) {
    h += '<div class="trow' + (i % 2 ? ' alt' : '') + '"><span class="c1' + (n >= 8 ? ' acc' : '') + '">' + fmt(n) + '</span>' +
      '<span class="c2"><i style="width:' + Math.round(100 * kgStart(n) / maxKg) + '%"></i></span>' +
      '<span class="c3' + (n >= 8 ? ' acc' : '') + '">' + kgLabel(n) + ' kg</span></div>';
  });
  h += '</div><div class="pad"><p class="fine">Exakt aus den EISENHORN-Kraftstufendiagrammen (Werte pro Kolben). Das DS hat zwei Schienen und damit zwei Kolben — alle Werte verdoppelt.</p>' +
    '<div class="ghost" data-a="export">Daten sichern</div>' +
    '<label class="ghost" for="impf">Sicherung einlesen</label>' +
    '<input type="file" id="impf" accept="application/json,.json" style="display:none">' +
    '<p class="fine">Die Daten liegen im Speicher dieses Geräts, nicht in den App-Dateien. Ein Update überschreibt sie nicht. ' +
    'Für den Gerätewechsel: sichern und die Datei hier einlesen — vorhandene Durchgänge werden erkannt, nichts wird doppelt angelegt.</p>' +
    '<div class="ghost danger" data-a="askall">Alle Trainingsdaten löschen</div>' +
    '<p class="fine">Für Apple Health: Datei exportieren, dann den Kurzbefehl „EISENHORN → Health" laufen lassen. Anleitung liegt im Repo unter README.md.</p></div>';
  return h;
}
function rail(t, s, on, a) { return '<div class="rail' + (on ? ' on' : '') + '" data-a="' + a + '"><b>' + t + '</b><i>' + s + '</i></div>'; }

function vProfil() {
  var s = db.set;
  var h = '<div class="pad"><h1 class="h1">Profil</h1>' +
    '<p class="lead">Grundlage für die Startstufe bei Übungen ohne Verlauf. Danach zählt nur, was du tatsächlich schaffst.</p></div>';

  h += '<div class="rowhead"><span>Wer trainiert</span><span class="mono">' +
    plural(prof.list.length, 'Profil', 'Profile') + '</span></div><div class="levels">';
  prof.list.forEach(function (p) {
    var ps = profStat(p.id);
    h += '<div class="lvl' + (p.id === prof.cur ? ' on' : '') + '" data-a="prof:' + p.id + '">' +
      '<b>' + esc(p.name) + '</b><i>' + (p.id === prof.cur ? 'aktiv · ' : '') +
      plural(ps.sess, 'Einheit', 'Einheiten') + '</i></div>';
  });
  h += '</div><div class="block edge"><div class="pad2">' +
    '<input class="pinput" id="pnew" type="text" maxlength="18" placeholder="Name" value="' + esc(st.pname || '') + '">' +
    '<div class="ghostrow"><div class="ghost" data-a="pnew">Neues Profil</div>' +
    '<div class="ghost" data-a="pren">Umbenennen</div></div>' +
    '<p class="fine">Jedes Profil hat eigene Einstellungen, Stufen und einen eigenen Verlauf. Gewechselt wird oben mit einem Tipp.</p>' +
    (prof.list.length > 1 ? '<div class="ghost danger" data-a="pdel">„' + esc(curProf().name) + '" löschen</div>' : '') +
    '</div></div>';

  h += '<div class="rowhead"><span>Körper</span><span class="mono">' + esc(curProf().name) + '</span></div>';
  h += '<div class="block edge"><div class="pad2">' +
    '<div class="rowb"><span>Körpergewicht</span><b>' + s.bw + ' kg</b></div>' +
    '<input type="range" id="bw" min="20" max="140" value="' + s.bw + '">' +
    '<div class="rowb" style="margin-top:18px"><span>Alter</span><b>' + (s.alter || 35) + ' Jahre</b></div>' +
    '<input type="range" id="alter" min="6" max="80" value="' + (s.alter || 35) + '">' +
    '</div><div class="kols">' +
    [['m', 'Männlich'], ['w', 'Weiblich'], ['x', 'Keine Angabe']].map(function (x) {
      return '<div class="kol' + (s.sex === x[0] ? ' on' : '') + '" data-a="sex:' + x[0] + '">' + x[1] + '</div>';
    }).join('') + '</div></div>';

  if (isKid() || isTeen()) {
    var kidOk = db.set.kolben === 0 && !db.set.ds && (s.reps || 10) >= 12 && s.level === 'neu';
    h += '<div class="rowhead"><span>' + (isKid() ? 'Kind · ' + s.alter + ' Jahre' : 'Jugendlich · ' + s.alter + ' Jahre') +
      '</span><span class="mono">' + (kidOk ? 'eingestellt' : 'Vorschlag offen') + '</span></div>' +
      '<div class="block edge"><div class="pad2">' +
      '<div class="onblist kid">' +
      '<div><u>Einzelschiene</u><span>Das DS zieht mit zwei Kolben doppelt. Auf S umstellen halbiert jede Stufe.</span></div>' +
      '<div><u>Kolben 12</u><span>Der leichte Zylinder. Stufe 1 sind damit an der Einzelschiene 6 kg statt 13 kg.</span></div>' +
      '<div><u>12–15 Wiederholungen</u><span>Leicht und oft. Erst wenn 15 sauber und ohne Schwung gehen, eine halbe Stufe höher.</span></div>' +
      '<div><u>Untrainiert</u><span>Setzt alle Startschätzungen niedriger an.</span></div>' +
      '<div><u>Technik vor Last</u><span>' + (isKid()
        ? 'Vor der Pubertät wächst Kraft über Ansteuerung, nicht über Muskelmasse. Schwere Stufen bringen nichts. Eigengewichtübungen sind gleichwertig.'
        : 'Ab etwa 14 darf die Last langsam steigen — in halben Stufen und erst bei sauberer Ausführung.') + '</span></div>' +
      '</div>' +
      (kidOk
        ? '<div class="restinfo">Gerät und Vorgaben passen zum Alter.</div>'
        : '<div class="ghost" data-a="kidset">Diese Einstellungen übernehmen</div>') +
      '</div></div>';
  }

  h += '<div class="rowhead"><span>Darstellung</span></div>' +
    '<div class="block edge"><div class="pad2">' +
    '<div class="rowb"><span>Schriftgröße</span><b>' + Math.round((db.set.ts || 1) * 100) + ' %</b></div>' +
    '<input type="range" id="tsize" min="85" max="145" step="5" value="' + Math.round((db.set.ts || 1) * 100) + '">' +
    '<div class="rfilter tight">' + [['auto', 'Systemfarben'], ['dark', 'Immer dunkel'], ['light', 'Immer hell']].map(function (p) {
      return '<div class="rc' + ((db.set.theme || 'dark') === p[0] ? ' on' : '') + '" data-a="theme:' + p[0] + '">' + p[1] + '</div>';
    }).join('') + '</div>' +
    '<p class="fine">„Systemfarben" folgt der Einstellung des Telefons.</p>' +
    '</div></div>';

  h += '<div class="rowhead"><span>Signal und Vorgaben</span></div>' +
    '<div class="block edge"><div class="warmrow' + (s.sound === false ? '' : ' on') + '" data-a="sound">' +
    '<span class="box"></span>Ton am Pausenende — zwei kurze Signale</div>' +
    '<div class="pad2"><div class="rowb"><span>Zielwiederholungen</span><b>' + (s.reps || 10) + '</b></div>' +
    '<input type="range" id="zreps" min="4" max="20" value="' + (s.reps || 10) + '">' +
    '<p class="fine">Drei Durchgänge auf diesem Wert lösen den Stufenvorschlag aus. Pro Übung überschreibbar.</p></div></div>';

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

  h += '<div class="wbody">';
  if (w.idx > 0 && w.idx === turnAt(w.ids))
    h += '<div class="turnbar"><b>↻ EISENHORN jetzt drehen</b><i>Ab hier arbeitet der Kolben ' +
      (richtOf(e) === 'ab' ? 'abwärts' : 'aufwärts') + ' — danach kein Drehen mehr.</i></div>';
  h += media(e, 186) +
    '<div class="pad"><div class="wnamerow"><div class="minimap">' + miniFig(e) + '</div>' +
    '<div><div class="wname">' + esc(e.name) + '</div>' +
    '<div class="wmeta">' + e.m + ' · ' + RLABEL[ruestOfEx(e)] + ' · ' + RICHTL[richtOf(e)] + '</div></div></div></div>';

  h += '<div class="lastbox">' + (prev
      ? '<i>Letztes Mal</i><b>' + perfLine(prev, isEigen(e)) + '</b>'
      : '<i>Letztes Mal</i><b class="dim">noch nichts protokolliert</b>') + '</div>';
  var nt = (db.notes && db.notes[slug]) || '';
  if (nt) h += '<div class="lastbox note"><i>Geräte-Notiz</i><b>' + esc(nt) + '</b></div>';
  var rc = prOf(slug);
  if (rc) h += '<div class="lastbox pr"><i>Rekord · ' + (rc.eigen ? 'meiste Wiederholungen' : 'schwerste Stufe') + '</i><b>' +
    prLine(rc.eigen ? rc.rep : rc.load, rc.eigen) + '</b></div>';
  var sg2 = suggestion(slug);
  if (sg2) h += '<div class="lastbox sug"><i>Vorschlag</i><b>' + esc(sg2.txt) + '</b></div>';

  h += '<div class="duo tight">' + (isEigen(e)
    ? '<div class="dcell ctr"><i>Belastung</i><div class="mini"><b>Eigen</b></div><u>Gewicht wird nicht gerechnet</u></div>'
    : '<div class="dcell ctr"><i>Stufe</i>' +
      '<div class="mini"><div class="sbtn sm" data-a="st-:' + slug + '">–</div><b>' + fmt(n) + '</b><div class="sbtn sm" data-a="st+:' + slug + '">+</div></div>' +
      '<u>' + kgLabel(n) + ' kg</u></div>') +
    '<div class="dcell ctr"><i>Pause danach</i><div class="mini">' +
    '<div class="sbtn sm" data-a="cfg:' + slug + '|rest|-15">–</div><b>' + mmss(c.rest) + '</b>' +
    '<div class="sbtn sm" data-a="cfg:' + slug + '|rest|15">+</div></div>' +
    '<u class="dim">' + plural(done.length, 'Durchgang', 'Durchgänge') + ' im Satz</u></div></div>';

  h += '<div class="sets">';
  var hd = 0;
  done.forEach(function (s) {
    if (!s.warm) hd++;
    h += '<div class="set ok' + (s.warm ? ' warm' : '') + '"><span class="mono">' + (s.warm ? 'AUFW.' : 'DG ' + hd) + '</span>' +
      '<b>' + s.reps + ' Wdh.<u>' + (isEigen(e) ? 'Eigengewicht' : 'St. ' + fmt(s.stufe)) +
      (s.rir !== undefined ? ' · RIR ' + s.rir : '') + '</u></b>' +
      '<span class="tagr" data-a="undoset">↺</span></div>';
  });
  h += '</div>';

  h += warmBox(slug) + dgBlock(slug);

  h += '<div class="pad"><div class="ghost" data-a="nextex">' +
    (w.idx === w.ids.length - 1 ? 'Übung beenden · Training beenden' : 'Übung beenden · nächste Übung →') + '</div>' +
    '<div class="ghostrow">' +
    (w.idx > 0 ? '<div class="ghost thin2" data-a="prevex">← zurück</div>' : '') +
    '<div class="ghost thin2" data-a="swapex">Übung tauschen</div>' +
    (w.idx < w.ids.length - 1 ? '<div class="ghost thin2" data-a="skipex">überspringen →</div>' : '') +
    '</div></div></div>';

  h += '<div class="wfoot"><div class="cta" data-a="logset">Durchgang speichern · ' +
    repVal(slug) + ' Wdh. → Pause</div></div>';

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
    h = '<div class="scroll">' + h + '</div>' +
      (st.dtab !== 'info'
        ? '<div class="dockbar"><div class="cta" data-a="logone:' + st.detail + '">Durchgang speichern · ' +
          repVal(st.detail) + ' Wdh. → Pause</div></div>'
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
      '<div><u>' + sm.sets + '</u><span>' + (sm.sets === 1 ? 'Durchgang' : 'Durchgänge') + '</span></div>' +
      '<div><u>' + sm.kcal + '</u><span>kcal</span></div></div>' +
      '<div class="sumtorso">' + torso(mload) + '</div><div class="mvols">' +
      mk.map(function (m) { return '<div class="mvol"><span>' + m + '</span><i><u style="width:' +
        Math.round(100 * mus[m] / mus[mk[0]]) + '%"></u></i><b>' + Math.round(mus[m]).toLocaleString('de-DE') + '</b></div>'; }).join('') +
      '</div>' +
      /* Direkt im Anschluss: der sinnvolle Mix für die nächste Einheit. */
      (function () {
        var np2 = nextPlan(); if (!np2) return '';
        return '<div class="reco flat"><i>Nächstes Mal</i><b>' + np2.lbl + '</b><u>' + esc(np2.txt) + '</u></div>';
      })() +
      '<div class="sumnote"><i>Notiz zur Einheit</i>' +
      '<textarea class="notein sess" data-sid="' + esc(sm.sid) + '" rows="2" placeholder="Schlaf, Tagesform, Beschwerden — was die Zahlen erklärt"></textarea></div>' +
      '</div>' +
      '<div class="cta" data-a="sumok">Fertig</div></div></div>';
  }
  /* Erststart: die vier Begriffe erklären, mit denen die App arbeitet. */
  if (!db.set.onb && !st.wo && !st.summary) {
    h += '<div class="ask"><div class="askbox onb" data-a="noop">' +
      '<i>Kurz zur Orientierung</i><b>Fünf Begriffe</b>' +
      '<div class="onblist">' +
      '<div><u>Gerät</u><span>EISENHORN S hat eine Schiene, das DS zwei — im DS zieht jeder Kolben doppelt. Stell es unter „Gerät" ein.</span></div>' +
      '<div><u>Kolben</u><span>Der Widerstandszylinder: Kolben 12 ist leicht, Kolben 26 schwer. Er bestimmt, wie viel Kilogramm eine Stufe bedeutet.</span></div>' +
      '<div><u>Stufe</u><span>1 bis 12 in Halbschritten — die Einstellung am Gerät. Der Rechner zeigt dir jede Stufe in Kilogramm.</span></div>' +
      '<div><u>Durchgang und Satz</u><span>Ein Durchgang ist eine Serie bis zur Pause. Alle Durchgänge einer Übung sind zusammen ein Satz.</span></div>' +
      '<div><u>Rüstart</u><span>Griffstange, Seilzug oder ohne. Der Tagesplan nimmt nur Übungen einer Rüstart — einmal aufbauen, kein Umbau.</span></div>' +
      '</div><div class="cta" data-a="onbok">Los geht\'s</div></div></div>';
  }
  if (st.ask) {
    h += '<div class="ask" data-a="askno"><div class="askbox" data-a="noop"><b>' + esc(st.ask.title) + '</b>' +
      '<p>' + esc(st.ask.body) + '</p><div class="askbtns">' +
      '<div class="ghost" data-a="askno">Abbrechen</div>' +
      '<div class="cta warn" data-a="askyes">Löschen</div></div></div></div>';
  }
  /* Bei offener Pause sitzt der Tastenblock unten — dann wandert der Toast
     nach oben, sonst verdeckt er „+30 s" und „Pause beenden". */
  if (st.toast) h += '<div class="toast' + (st.rest > 0 || st.summary || st.ask ? ' top' : '') + '">' + esc(st.toast) + '</div>';

  var ae = document.activeElement, wasQ = ae && ae.id === 'q';
  var pos = wasQ ? ae.selectionStart : 0;
  var repI = ae && ae.classList && ae.classList.contains('repin') ? ae.getAttribute('data-slug') : null;
  /* Scrollposition merken — sonst springt die Seite bei jedem +/- nach oben.
     Die Wiederherstellung läuft zweimal: sofort und nach dem nächsten Layout,
     weil nachgeladene Bilder und Muskelkarten die Höhe noch verschieben. */
  var sc = app.querySelector('.scroll, .wbody'), top = sc ? sc.scrollTop : 0;
  var keep = st._enter ? 0 : top;
  app.innerHTML = h;
  var sc2 = app.querySelector('.scroll, .wbody');
  if (sc2) {
    /* Ohne das Abschalten des weichen Scrollens animiert der Browser die
       Wiederherstellung — die Seite gleitet sichtbar nach oben. */
    var sb = sc2.style.scrollBehavior;
    sc2.style.scrollBehavior = 'auto';
    sc2.scrollTop = keep;
    requestAnimationFrame(function () {
      if (keep && sc2.scrollTop !== keep) sc2.scrollTop = keep;
      sc2.style.scrollBehavior = sb;
    });
  }
  if (wasQ) { var q = document.getElementById('q'); if (q) { q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {} } }
  if (repI !== null) { var r = app.querySelector('.repin[data-slug="' + repI + '"]'); if (r) r.focus(); }
  wireThumbs();
  wireA11y();
  /* Gestaffelter Einlauf beim Ansichtswechsel — die Seite liest sich von oben
     nach unten. Nur beim Wechsel, nicht bei jedem Zähler-Tipp. */
  if (st._enter) {
    st._enter = false;
    var sc3 = app.querySelector('.scroll');
    if (sc3 && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      Array.prototype.slice.call(sc3.children, 0, 7).forEach(function (el, i) {
        el.style.animation = 'enter .34s cubic-bezier(.22,.8,.2,1) ' + (i * 42) + 'ms both';
      });
    }
  }
}

/* ---------- Bedienhilfen ----------
   Die Oberfläche ist aus <div> gebaut. Damit VoiceOver und Tastatur trotzdem
   funktionieren, bekommt nach jedem Rendern jedes tippbare Element eine Rolle,
   eine Reihenfolge im Fokus und einen Namen. */
var A11Y = {
  tab: 'Reiter', open: 'Übung öffnen', dtab: 'Reiter', sec: 'Abschnitt aufklappen',
  back: 'Zurück', logset: 'Durchgang speichern', logone: 'Durchgang speichern',
  nextex: 'Übung beenden', prevex: 'Eine Übung zurück', skipex: 'Übung überspringen',
  swapex: 'Übung tauschen', endex: 'Satz abschließen', warm: 'Aufwärm-Durchgang umschalten',
  'rest+': 'Pause um 30 Sekunden verlängern', rest0: 'Pause beenden', restnow: 'Pause starten',
  'st+': 'Stufe erhöhen', 'st-': 'Stufe verringern', stx: 'Stufe wählen',
  rp: 'Wiederholungen ändern', rir: 'Reserve wählen', prog: 'Vorschlag übernehmen',
  warmset: 'Aufwärmen starten', dgdel: 'Durchgang zurücknehmen', undoset: 'Letzten Durchgang zurücknehmen',
  focus: 'Fokus wählen', dsm: 'Gerätefilter', ruest: 'Rüstart wählen', kol: 'Kolben wählen',
  start: 'Training starten', del: 'Löschen', delex: 'Übung löschen', delsess: 'Einheit löschen',
  richt: 'Aufbaurichtung ändern', eigen: 'Eigengewichtsübung umschalten', sound: 'Ton umschalten',
  onbok: 'Verstanden', sumok: 'Fertig', export: 'Daten exportieren'
};
function wireA11y() {
  var nodes = app.querySelectorAll('[data-a]');
  Array.prototype.forEach.call(nodes, function (n) {
    var a = (n.getAttribute('data-a') || '').split(':')[0];
    if (a === 'noop') return;
    if (!n.getAttribute('role')) n.setAttribute('role', 'button');
    if (!n.hasAttribute('tabindex')) n.setAttribute('tabindex', '0');
    if (!n.getAttribute('aria-label')) {
      var txt = (n.textContent || '').replace(/\s+/g, ' ').trim();
      n.setAttribute('aria-label', txt && txt.length > 1 ? txt : (A11Y[a] || 'Schaltfläche'));
    }
    if (n.classList.contains('on') || n.classList.contains('s3') || n.classList.contains('rc') ||
        n.classList.contains('chip') || n.classList.contains('rail') || n.classList.contains('dt'))
      n.setAttribute('aria-pressed', n.classList.contains('on') ? 'true' : 'false');
  });
  app.querySelectorAll('input,textarea').forEach(function (i) {
    if (!i.getAttribute('aria-label')) {
      var ph = i.getAttribute('placeholder');
      if (ph) i.setAttribute('aria-label', ph);
      else if (i.classList.contains('repin')) i.setAttribute('aria-label', 'Wiederholungen in diesem Durchgang');
      else if (i.type === 'range') i.setAttribute('aria-label', 'Wert einstellen');
    }
  });
}
/* ---------- Wischgesten ----------
   Nach unten über einem Overlay schließt es (iOS-Grammatik für Sheets), nach
   links über einer Verlaufszeile löscht den Durchgang — das ✕ bleibt daneben
   für alle, die lieber tippen. */
(function () {
  var x0 = 0, y0 = 0, el = null, mode = null;
  app.addEventListener('touchstart', function (ev) {
    var t = ev.touches[0]; x0 = t.clientX; y0 = t.clientY; el = null; mode = null;
    var line = ev.target.closest('.setline');
    var sheet = ev.target.closest('.rest, .askbox');
    if (line && line.querySelector('.del')) { el = line; mode = 'del'; }
    else if (sheet) { el = sheet; mode = 'sheet'; }
  }, { passive: true });
  app.addEventListener('touchmove', function (ev) {
    if (!el || mode !== 'del') return;
    var t = ev.touches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (dx < -18 && Math.abs(dx) > Math.abs(dy)) el.classList.add('swiping');
    if (dx < -60) el.classList.add('armed'); else el.classList.remove('armed');
  }, { passive: true });
  app.addEventListener('touchend', function (ev) {
    if (!el) return;
    var t = ev.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0;
    if (mode === 'del') {
      var armed = el.classList.contains('armed');
      el.classList.remove('swiping', 'armed');
      if (armed) { var d = el.querySelector('.del'); if (d) d.click(); }
    } else if (mode === 'sheet' && dy > 70 && Math.abs(dy) > Math.abs(dx)) {
      if (st.rest > 0) { st.rest = 0; st.restSolo = null; render(); }
      else if (st.summary) { st.summary = null; render(); }
      else if (st.ask) { st.ask = null; render(); }
    }
    el = null; mode = null;
  }, { passive: true });
})();

/* Tastatur: Leertaste und Enter lösen dieselbe Aktion aus wie ein Tipp. */
app.addEventListener('keydown', function (ev) {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  var el = ev.target.closest && ev.target.closest('[data-a]');
  if (!el || /input|textarea/i.test(ev.target.tagName)) return;
  ev.preventDefault(); el.click();
});

/* ---------- Events ---------- */
app.addEventListener('click', function (ev) {
  var el = ev.target.closest('[data-a]'); if (!el) return;
  var p = el.getAttribute('data-a').split(':'), a = p[0], arg = p[1] || '';
  if (a === 'noop') return;   // Klick in der Box soll nicht den Backdrop auslösen
  var two = arg.split('|');
  if (a === 'tab') { st.tab = arg; st.detail = null; st._enter = true; }
  else if (a === 'open') { st._enter = true; st.detail = arg; st.editR = false; st.open = {}; st.warm = false; st.dtab = 'log'; }
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
        ' · ' + plural(s0.sets, 'Durchgang', 'Durchgänge') + ' · ' + fmtKg(s0.vol) + ' werden aus dem Verlauf entfernt.' : '' };
  }
  else if (a === 'askex') {
    var p1 = arg.split('~'), e1 = BY[p1[1]];
    st.ask = { kind: 'ex', id: p1[0], slug: p1[1], title: 'Übung aus dieser Einheit löschen?',
      body: (e1 ? e1.name : '') + ' — alle Durchgänge dieser Übung in dieser Einheit.' };
  }
  else if (a === 'delset') {
    var p2 = arg.split('~');
    delOneSet(p2[0], p2[1], +p2[2]); toast('Durchgang gelöscht');
  }
  else if (a === 'sumok') st.summary = null;
  else if (a === 'onbok') { db.set.onb = 1; save(); }
  else if (a === 'askno') st.ask = null;
  else if (a === 'askyes') {
    var q0 = st.ask; st.ask = null;
    if (q0 && q0.kind === 'sess') { delSession(q0.id); st.session = null; toast('Einheit gelöscht'); }
    else if (q0 && q0.kind === 'ex') { delExercise(q0.id, q0.slug); toast('Übung gelöscht'); }
    else if (q0 && q0.kind === 'prof') { delProfile(q0.id); toast('Profil gelöscht'); }
    else if (q0 && q0.kind === 'all') { db.log = []; db.sessions = []; save(); toast('Alle Trainingsdaten gelöscht'); }
  }
  else if (a === 'askall') st.ask = { kind: 'all', title: 'Alle Trainingsdaten löschen?',
    body: 'Durchgänge, Einheiten und der komplette Verlauf werden entfernt. Stufen, Vorgaben und Einstellungen bleiben.' };
  else if (a === 'ruest') { db.set.ruest = arg; st.mix = 0; save(); }
  else if (a === 'dsm') { db.set.dsMode = arg; db.set.hideDS = arg === 'ohne'; st.mix = 0; save(); }
  else if (a === 'focus') { db.set.focus = arg; st.mix = 0; save(); toast('Fokus: ' + focusOf(arg).lbl); }
  else if (a === 'mix') { st.mix = (st.mix || 0) + 1; toast('Neuer Vorschlag'); }
  else if (a === 'prof') {
    if (st.wo) toast('Training läuft — erst beenden');
    else { switchProfile(arg); toast('Profil: ' + curProf().name); }
  }
  else if (a === 'pnew') {
    var pn = (st.pname || '').trim();
    if (!pn) toast('Erst einen Namen eintragen');
    else if (st.wo) toast('Training läuft — erst beenden');
    else { addProfile(pn); st.pname = ''; toast('Profil „' + pn + '“ angelegt'); }
  }
  else if (a === 'pren') {
    var pr0 = (st.pname || '').trim();
    if (!pr0) toast('Erst einen Namen eintragen');
    else { curProf().name = pr0; saveProfiles(); st.pname = ''; toast('Umbenannt in „' + pr0 + '“'); }
  }
  else if (a === 'pdel') {
    if (st.wo) toast('Training läuft — erst beenden');
    else st.ask = { kind: 'prof', id: prof.cur, title: 'Profil „' + curProf().name + '“ löschen?',
      body: 'Einstellungen, Stufen und der komplette Verlauf dieser Person werden entfernt. Andere Profile bleiben unberührt.' };
  }
  else if (a === 'ds') { db.set.ds = arg === '1'; save(); }
  else if (a === 'kol') { db.set.kolben = +arg; save(); }
  else if (a === 'sex') { db.set.sex = arg; save(); }
  else if (a === 'lvl') { db.set.level = arg; save(); }
  else if (a === 'kidset') {
    db.set.ds = false; db.set.kolben = 0; db.set.reps = 12;
    db.set.rest = 60; db.set.level = 'neu';
    db.set.dsMode = 'ohne'; db.set.hideDS = true;   // eine Schiene, also keine DS-Übungen
    st.mix = 0;
    /* Von Hand gesetzte oder geerbte Stufen nach unten deckeln — ein Verlauf
       aus dem Erwachsenentraining darf hier nicht stehen bleiben. */
    Object.keys(db.stufen || {}).forEach(function (sl) {
      var v0 = schaetzung(sl);
      if (!v0 || v0.fix) return;
      var cap = v0.stufe || 1;
      if (db.stufen[sl] > cap) db.stufen[sl] = cap;
    });
    save(); toast('Auf leichtes Training eingestellt');
  }
  else if (a === 'sound') { db.set.sound = !(db.set.sound !== false); save(); if (db.set.sound) beep(); }
  else if (a === 'theme') { db.set.theme = arg; save(); applyLook(); }
  else if (a === 'st+') setStufe(arg, stufeOf(arg) + 0.5);
  else if (a === 'st-') setStufe(arg, stufeOf(arg) - 0.5);
  else if (a === 'stx') setStufe(two[0], +two[1]);
  /* Vorschlag übernehmen: Stufe und/oder Zielwiederholungen in einem Schritt. */
  else if (a === 'prog') {
    if (+two[1] > 0) setStufe(two[0], +two[1]);
    if (+two[2] > 0) setCfg(two[0], 'reps', +two[2]);
    setRep(two[0], +two[2] > 0 ? +two[2] : repVal(two[0]));
    toast('Übernommen' + (+two[1] > 0 ? ' · Stufe ' + fmt(+two[1]) : '') + (+two[2] > 0 ? ' · ' + two[2] + ' Wdh.' : ''));
  }
  else if (a === 'editr') st.editR = !st.editR;
  else if (a === 'setr') { db.ruestOv[two[0]] = two[1]; st.editR = false; save(); }
  else if (a === 'eigen') { setEigen(arg, !isEigen(BY[arg])); toast(isEigen(BY[arg]) ? 'Gewicht wird nicht gerechnet' : 'Stufe zählt wieder als Last'); }
  else if (a === 'logone') {
    var rv0 = repVal(arg), warmed = st.warm;
    logSet(arg, stufeOf(arg), rv0, soloSid(arg), [rv0]);
    st.warm = false;   // sonst laufen alle weiteren Durchgänge still als Aufwärmen
    if (warmed) restoreWarm(arg);
    buzz();
    st.rest = cfgOf(arg).rest; st.restTotal = st.rest; st.restSolo = arg;
    toast((warmed ? 'Aufwärm-Durchgang' : 'Durchgang') + ' gespeichert · ' + rv0 + ' Wdh. · Pause läuft');
  }
  /* Satz abschließen: die Durchgänge sind längst gespeichert, hier wird nur
     die Pause beendet und der Zähler wieder freigegeben. */
  else if (a === 'endex') {
    var dgh = dgRows(arg).filter(function (x) { return !x.warm; });
    st.rest = 0; st.restSolo = null;
    toast(dgh.length ? 'Satz beendet · ' + plural(dgh.length, 'Durchgang', 'Durchgänge') + ' · ' + dgSum(dgh) + ' Wdh.'
                     : 'Kein Durchgang gespeichert');
  }
  else if (a === 'dgdel') {
    var pd = arg.split('~');
    db.log = db.log.filter(function (l) { return !(l.slug === pd[0] && l.t === +pd[1]); });
    save(); toast('Durchgang zurückgenommen');
  }
  else if (a === 'start') startWo();
  else if (a === 'endwo') { endWo(false); }
  else if (a === 'cfg') { setCfg(two[0], two[1], cfgOf(two[0])[two[1]] + (+two[2])); }
  else if (a === 'restnow') { st.rest = cfgOf(arg).rest; st.restTotal = st.rest; st.restSolo = arg; }
  else if (a === 'rp') setRep(two[0], repVal(two[0]) + (+two[1]));
  else if (a === 'rir') { st.rir = +arg; st.warm = false; }
  else if (a === 'warm') st.warm = !st.warm;
  /* Aufwärmen starten: Stufe absenken, Durchgang als Aufwärmen markieren,
     Wiederholungen auf 6–8 setzen. Nach dem Speichern greift wieder die
     Arbeitsstufe (der Vorschlag steht im Detail). */
  else if (a === 'warmset') {
    st.warmBack = { slug: two[0], stufe: stufeOf(two[0]) };
    setStufe(two[0], +two[1]); st.warm = true; setRep(two[0], 8);
    toast('Aufwärmen · Stufe ' + fmt(+two[1]) + ' · zurück auf ' + fmt(st.warmBack.stufe) + ' danach');
  }
  else if (a === 'nextex') nextEx();
  else if (a === 'prevex') { if (st.wo.idx > 0) { st.wo.idx--; st.rest = 0; } }
  /* Überspringen: ohne Durchgang weiter — die Übung bleibt aus dem Plan heraus. */
  else if (a === 'skipex') {
    if (st.wo.idx < st.wo.ids.length - 1) { st.wo.idx++; st.rest = 0; toast('Übung übersprungen'); }
  }
  /* Tauschen: gleiche Muskelgruppe, gleiche Rüstart, gleiche Kolbenrichtung —
     damit weder Umbau noch Drehen dazukommt. Bevorzugt wird, was am längsten
     nicht dran war. */
  else if (a === 'swapex') {
    var wo = st.wo, old = BY[wo.ids[wo.idx]];
    var alt = EX.filter(function (x) {
      return x.slug !== old.slug && x.m === old.m && dsOk(x) &&
        ruestOfEx(x) === ruestOfEx(old) && richtOf(x) === richtOf(old) &&
        wo.ids.indexOf(x.slug) < 0;
    }).sort(function (a1, b1) { return hoursSinceEx(b1.slug) - hoursSinceEx(a1.slug); })[0];
    if (!alt) toast('Keine passende Alternative ohne Umbau');
    else if ((wo.done[wo.idx] || []).length) toast('Schon Durchgänge protokolliert — überspringen statt tauschen');
    else { wo.ids[wo.idx] = alt.slug; toast('Getauscht: ' + alt.name); }
  }
  else if (a === 'richt') {
    if (!db.richtOv) db.richtOv = {};
    var cyc = { ab: 'auf', auf: 'frei', frei: 'ab' };
    db.richtOv[arg] = cyc[richtOf(BY[arg])]; save();
    toast('Aufbaurichtung: ' + RICHTL[db.richtOv[arg]]);
  }
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
      var sg0 = ev.target.getAttribute('data-slug');
      setRep(sg0, v);
      /* Abgeleitete Texte in place nachziehen — ein volles render() würde
         mitten im Tippen den Cursor verlieren. */
      var c0 = document.querySelector('.wfoot .cta') || document.querySelector('.dockbar .cta');
      if (c0) c0.textContent = 'Durchgang speichern · ' + repVal(sg0) + ' Wdh. → Pause';
    }
    return;
  }
  if (ev.target.classList.contains('sess')) {
    /* Notiz an die Einheit hängen, nicht an die Übung. */
    var sid1 = ev.target.getAttribute('data-sid');
    db.snotes = db.snotes || {};
    db.snotes[sid1] = ev.target.value;
    save();
    return;
  }
  if (ev.target.classList.contains('notein')) {
    if (!db.notes) db.notes = {};
    db.notes[ev.target.getAttribute('data-slug')] = ev.target.value;
    save();
    return;
  }
  if (ev.target.id === 'q') { st.q = ev.target.value; render(); }
  else if (ev.target.id === 'pnew') { st.pname = ev.target.value; }
  else if (ev.target.id === 'bw') { db.set.bw = +ev.target.value; save(); render(); }
  else if (ev.target.id === 'alter') { db.set.alter = +ev.target.value; save(); render(); }
  else if (ev.target.id === 'zreps') { db.set.reps = +ev.target.value; save(); render(); }
  else if (ev.target.id === 'tsize') { db.set.ts = +ev.target.value / 100; save(); applyLook(); render(); }
  else if (ev.target.id === 'hideds') { db.set.hideDS = ev.target.checked; save(); render(); }
  else if (ev.target.id === 'impf' && ev.target.files && ev.target.files[0]) doImport(ev.target.files[0]);
});
app.addEventListener('keydown', function (ev) {
  if (ev.key === 'Enter' && ev.target.id === 'pnew') {
    ev.preventDefault();
    var b = app.querySelector('[data-a="pnew"]'); if (b) b.click();
  }
}, true);

function toast(m) { st.toast = m; clearTimeout(toast._t); toast._t = setTimeout(function () { st.toast = null; render(); }, 1900); }

/* War der Durchgang ein Aufwärmsatz mit abgesenkter Stufe, stellt die App die
   Arbeitsstufe direkt wieder her — sonst trainiert man versehentlich leicht. */
function restoreWarm(slug) {
  if (st.warmBack && st.warmBack.slug === slug) {
    setStufe(slug, st.warmBack.stufe);
    setRep(slug, cfgOf(slug).reps);
    st.warmBack = null;
  }
}
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
/* Einen Durchgang protokollieren. Danach startet die Pause automatisch; der
   Satz bleibt offen, bis die Übung beendet wird. */
function logCurrent() {
  var w = st.wo, slug = w.ids[w.idx], n = stufeOf(slug), total = repVal(slug);
  var cur = w.done[w.idx] || (w.done[w.idx] = []);
  cur.push({ stufe: n, reps: total, rl: [total], warm: st.warm ? 1 : 0, rir: st.warm ? undefined : st.rir });
  if (!st.warm && !isEigen(BY[slug])) w.vol += kgStart(n) * total;
  logSet(slug, n, total, w.sid, [total]);
  if (!st.warm && !isEigen(BY[slug])) {
    var pr = prOf(slug, db.log[db.log.length - 1].t);
    if (!pr || kgStart(n) * total > pr.vol.vol) toast('Neuer Rekord · ' + Math.round(kgStart(n) * total).toLocaleString('de-DE') + ' kg');
  }
  var wasWarm = cur[cur.length - 1].warm;
  st.warm = false;
  if (wasWarm) restoreWarm(slug);
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

/* Letzten Durchgang der aktuellen Übung zurücknehmen. */
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
    if (!sets) { toast('Training ohne Durchgänge verworfen'); st.wo = null; st.rest = 0; st.elapsed = 0; wake(false); return; }
    db.sessions.push({ t: Date.now(), sec: st.elapsed, kcal: kcal(st.elapsed), sets: sets, vol: Math.round(st.wo.vol), ruest: db.set.ruest, focus: db.set.focus || 'ganz' });
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
    if (st.rest === 0) { buzz(); beep(); toast('Pause vorbei — nächster Durchgang'); render(); return; }
    var r = document.getElementById('rclk'); if (r) r.textContent = mmss(st.rest);
    var ring = document.querySelector('.ring');
    if (ring) ring.style.background = 'conic-gradient(var(--acc) ' + Math.round(360 * st.rest / Math.max(1, st.restTotal)) + 'deg,var(--line) 0)';
  }
  var c = document.getElementById('clk'); if (c) c.textContent = mmss(st.elapsed);
  var kc = document.getElementById('kc'); if (kc) kc.textContent = kcal(st.elapsed) + ' kcal';
}, 1000);

function buzz() { if (navigator.vibrate) navigator.vibrate(60); }
/* Signal am Pausenende: zwei kurze Töne, im Profil abschaltbar. Der
   AudioContext entsteht beim ersten Tippen — Autoplay-Sperren greifen sonst. */
var actx = null;
function beep() {
  if (db.set.sound === false) return;
  try {
    var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    if (!actx) actx = new AC();
    if (actx.state === 'suspended') actx.resume();
    [0, 0.28].forEach(function (off, i) {
      var o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime + off;
      o.type = 'sine'; o.frequency.value = i ? 1046 : 784;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.22);
      o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + 0.24);
    });
  } catch (e) {}
}
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
    }), log: db.log, stufen: db.stufen,
    /* Rohdaten für das Wiedereinlesen — die Felder oben sind für Health
       umbenannt und taugen nicht als Sicherung. */
    ver: db.ver || 4, sessionsRaw: db.sessions, cfg: db.cfg, notes: db.notes,
    ruestOv: db.ruestOv, eigenOv: db.eigenOv, richtOv: db.richtOv, snotes: db.snotes, set: db.set };
  var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  var dd = new Date(), p2 = function (x) { return ('0' + x).slice(-2); };
  a.download = 'eisenhorn-training-' + dd.getFullYear() + '-' + p2(dd.getMonth() + 1) + '-' + p2(dd.getDate()) + '.json';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  toast(db.sessions.length + ' Einheiten exportiert');
}

/* Sicherung einlesen. Zusammenführen statt ersetzen: gleiche Durchgänge
   (Übung + Zeitstempel) werden übersprungen, Stufen und Notizen nur dort
   übernommen, wo hier noch nichts steht. */
function doImport(file) {
  var rd = new FileReader();
  rd.onload = function () {
    var p; try { p = JSON.parse(rd.result); } catch (e) { toast('Datei nicht lesbar'); render(); return; }
    var neu = 0;
    var seen = {}; db.log.forEach(function (l) { seen[l.slug + '|' + l.t] = 1; });
    (p.log || []).forEach(function (l) {
      if (!l || !l.slug || seen[l.slug + '|' + l.t]) return;
      seen[l.slug + '|' + l.t] = 1; db.log.push(l); neu++;
    });
    db.log.sort(function (a, b) { return a.t - b.t; });
    var st0 = {}; db.sessions.forEach(function (x) { st0[x.t] = 1; });
    (p.sessionsRaw || p.sessions || []).forEach(function (x) {
      if (x && x.t && !st0[x.t] && x.sec !== undefined) { st0[x.t] = 1; db.sessions.push(x); }
    });
    db.sessions.sort(function (a, b) { return a.t - b.t; });
    ['stufen', 'cfg', 'notes', 'ruestOv', 'eigenOv', 'richtOv', 'snotes'].forEach(function (k) {
      var src = p[k]; if (!src) return;
      db[k] = db[k] || {};
      for (var q in src) if (db[k][q] === undefined) db[k][q] = src[q];
    });
    save();
    toast(neu ? neu + ' Durchgänge übernommen' : 'Nichts Neues in der Sicherung');
    render();
  };
  rd.readAsText(file);
}

/* Schriftgröße und Farbschema anwenden. Die Größe skaliert die ganze
   Oberfläche, damit Abstände und Tippflächen mitwachsen. */
function applyLook() {
  var r = document.documentElement;
  r.style.setProperty('--ts', db.set.ts || 1);
  r.setAttribute('data-theme', db.set.theme || 'dark');
}
applyLook();
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(function () {});
})();
