# EISENHORN Trainer

Progressive Web App für die EISENHORN Kraftstation. Läuft im Vollbild auf dem iPhone,
offline, ohne App Store, ohne Abo, ohne Server. Alle Daten bleiben lokal auf dem Gerät.

---

## 1. Repo anlegen und aufs iPhone bringen

Der Inhalt dieses Ordners **ist** das Repo — `index.html` muss im Wurzelverzeichnis liegen.

```
cd app
git init -b main
git add .
git commit -m "EISENHORN Trainer"
git remote add origin git@github.com:DEINNAME/eisenhorn-trainer.git
git push -u origin main
```

Dann **Settings > Pages >** Source: `GitHub Actions`. Der mitgelieferte Workflow
(`.github/workflows/deploy.yml`) veroeffentlicht bei jedem Push automatisch.
`.nojekyll` verhindert, dass Pages die Dateien vorverarbeitet.

Die Adresse (`https://DEINNAME.github.io/eisenhorn-trainer/`) in **Safari** oeffnen,
Teilen-Symbol, **Zum Home-Bildschirm**. Beim ersten Oeffnen mit Netz laedt der Service
Worker alles in den Cache, inklusive der Schriften. Ab dem zweiten Start offline nutzbar.

> **Oeffentlich oder privat?** Pages aus einem *privaten* Repo braucht einen bezahlten Plan.
> Zwei kostenlose Wege: Repo oeffentlich, GIFs draussen (`.gitignore` schliesst `media/`
> bereits aus) oder Repo privat und ueber Cloudflare Pages bzw. Netlify deployen, beide
> haben ein kostenloses Kontingent und koennen private Repos veroeffentlichen.

Lokal testen (Service Worker braucht http, Doppelklick genuegt nicht):

```
python3 -m http.server 8080
```

---

## 2. Bewegtbilder

Die App lädt pro Übung **`media/<slug>.gif`**. Deine heruntergeladenen GIFs heissen nach
dem Übungsnamen und müssen einmal auf die Slugs umbenannt werden — dafür liegen zwei
Skripte bereit, sie decken **159 von 161** Übungen ab:

**macOS / Linux**

```
cd /pfad/zu/deinen/gifs
sh /pfad/zu/app/rename-gifs.sh
```

**Windows (PowerShell)**

```
cd C:\pfad\zu\deinen\gifs
& "C:\pfad\zu\app\rename-gifs.ps1"
```

Danach liegt neben den GIFs ein Ordner `media/` — den ins Repo-Wurzelverzeichnis
verschieben, direkt neben `index.html`.

### Wenn die Bilder im Deployment fehlen

Prüfe zuerst, ob sie überhaupt hochgeladen wurden:

```
git check-ignore -v media/schulterdruecken.gif   # zeigt eine passende .gitignore-Zeile?
git ls-files media | head                        # leer = nichts eingecheckt
```

Frühere Fassungen der `.gitignore` schlossen `media/` und `*.gif` aus; git hat die
Dateien dann beim `git add` stillschweigend übersprungen. Die aktuelle `.gitignore`
lässt sie zu. Nachziehen:

```
git add media
git commit -m "Bewegtbilder"
git push
```

Ohne Datei zeigt die App das animierte **Bewegungsschema** — Schiene, Schlitten und
Griffstange fahren den Weg der Bewegung ab. Nichts bricht, es sieht nur schematisch aus.

GIFs sind gross. Vor dem Push lohnt das Verkleinern:

```
gifsicle --resize-fit 640x640 --optimize=3 --lossy=60 in.gif -o out.gif
```

**Rechtlicher Hinweis:** Die Bewegtbilder gehören der EISENHORN AG. In einem
öffentlichen Repository — und ein per GitHub Pages erreichbares Repo ist in der
Regel öffentlich — hostest du damit fremdes Material sichtbar im Netz. Für den rein
privaten Gebrauch ist das etwas anderes als eine Veröffentlichung. Wer sichergehen
will: `media/` und `*.gif` in der `.gitignore` wieder aktivieren und mit dem
Bewegungsschema arbeiten, oder bei EISENHORN eine Freigabe erfragen.

---

## 3. Übungsdaten

`data.js` enthält alle 161 Übungen der EISENHORN-Übersichtsseite, vollständig von
eisenhorn.com übernommen — die App verlinkt nirgends mehr nach aussen.

* **`L`** — `[Name, Slug]` je Übung.
* **`MUSK`** — beanspruchte Muskulatur als `[Muskel, Intensität 1–4]`, primär zuerst.
  Daraus leitet die App Muskelgruppe, Körperkarte, Wochenbilanz und Volumenverteilung ab.
  Ein Satz zählt für den primären Muskel voll, für unterstützende anteilig (2 von 4 = halber Satz).
* **`TXT`** — Vorbereitung (`v`), Ausgangsposition (`a`), Ausführung (`f`), Tipp (`t`),
  Variantenhinweis (`vt`) und verwandte Übungen (`va`) für alle 161 Übungen.
* **`GIF`** — Zuordnung Slug → Originaldateiname des heruntergeladenen Bewegtbilds.
* **Rüstart** (Griffstange / Seilzug / Ohne Stange) wird aus dem Namen abgeleitet und lässt
  sich im Übungsdetail unter *Anleitung* antippen und dauerhaft korrigieren.
* Slugs mit Präfix `2xx-` sind DS-spezifische Übungen. Im Rechner ausblendbar.

Beide Quelldateien lagen als CSV vor; die Konvertierung nach `data.js` ist einmalig
erfolgt. Eine Übung ergänzen heisst: Zeile in `L` plus Einträge in `MUSK` und `TXT`.

---

## 4. Stufen → Kilogramm

Exakt aus den EISENHORN-Kraftstufendiagrammen, **pro Kolben**:

```
Start = f × (Stufe + 1)                       Kolben 12: f = 3     Kolben 26: f = 6,5
Ende  = Start + dm × (Stufe − d0)   ab Stufe 8  dm = 2, d0 = 6      dm = 5,5, d0 = 7
```

Bis Stufe 7 ist die Last konstant, ab Stufe 8 greift die ansteigende Kraftkurve —
deshalb zeigt die App dort einen Bereich statt einer Zahl.

Das **EISENHORN DS** hat zwei Schienen mit zwei Kolben: alle Werte **× 2**.
Gerät und Kolbentyp sind im Rechner getrennt einstellbar.

| Setup | Stufe 1 | Stufe 7 | Stufe 12 |
|---|---|---|---|
| S + Kolben 12 | 6 kg | 24 kg | 39–51 kg |
| S + Kolben 26 | 13 kg | 52 kg | 84,5–112 kg |
| DS + Kolben 12 | 12 kg | 48 kg | 78–102 kg |
| DS + Kolben 26 | 26 kg | 104 kg | 169–224 kg |

Kolben getauscht? Im Rechner umschalten — alle Anzeigen rechnen sofort um.

---

## 5. Apple Health über Kurzbefehle

Eine Web-App kommt nicht direkt an HealthKit. Der saubere Weg ohne Entwicklerkonto:

1. In der App **Rechner → Trainingsdaten exportieren**. Es landet `eisenhorn-training.json`
   in „Downloads" (iCloud Drive).
2. In der App **Kurzbefehle** einen Kurzbefehl anlegen:
   * *Datei abrufen* → `Downloads/eisenhorn-training.json`
   * *Datei-Inhalt abrufen* → *Wörterbuch abrufen*
   * *Wert für „sessions" abrufen* → *Wiederholen mit jedem Objekt*
   * darin: *Training protokollieren* — Typ „Krafttraining (funktional)",
     Dauer = `dauerMin`, Kalorien = `kcal`, Start = `start`
3. Kurzbefehl auf den Home-Bildschirm legen. Nach dem Training: exportieren, Kurzbefehl tippen.

Vollautomatisch beim Beenden geht nur mit einer nativen App (Apple Developer Program,
99 $/Jahr). Deshalb bewusst halbautomatisch — zwei Taps, keine laufenden Kosten.

Die Export-Datei ist gleichzeitig dein **Backup**: sie enthält alle Sätze, Stufen und Einheiten.

---

## 6. Was drin ist

* **Heute** — Rüstart wählen (Griffstange / Seilzug / Ohne Stange), daraus wird der
  Tagesplan gebaut: fünf Übungen, die alle mit demselben Aufbau laufen. Kein Umbau
  zwischendurch. Dazu Serie, Wochenvolumen, Wochen-kcal.
* **Übungen** — komplette Liste, Filter nach Rüstart und Muskelgruppe, Suche.
* **Übungsdetail** — Video-Loop, Stufen-Stepper mit Halbstufen, Live-Umrechnung in kg,
  Ausführungsschritte, eigener Verlauf.
* **Training** — Satz für Satz protokollieren, Pausen-Timer mit Vibration,
  laufende Zeit und kcal-Schätzung, Display bleibt an (Wake Lock).
* **Fortschritt** — Ø Stufe, Einheiten, Wochenvolumen, Entwicklung pro Übung.
* **Rechner** — Gerät × Kolben, komplette Stufentabelle, Export.

## 7. Grenzen

* kcal ist eine **Schätzung** (MET 6,2 × Körpergewicht × Zeit). Ohne Pulsgurt geht es
  nicht genauer — als Trend brauchbar, als absoluter Wert nicht.
* Kein Konto, keine Synchronisation. Ein Gerät, ein Datensatz. Backup = Export.
* Safari löscht Daten von Websites, die sieben Wochen nicht geöffnet werden. Als
  Home-Bildschirm-App gilt das nicht — trotzdem: ab und zu exportieren.

---

## 8. Dateien im Repo

| Datei | Zweck |
|---|---|
| `index.html` | Markup und komplettes CSS |
| `app.js` | Logik: Screens, Stufenmodell, Timer, Speicherung, Export |
| `data.js` | 161 Uebungen, Detailinhalte, Muskelskalen, GIF-Index |
| `sw.js` | Service Worker, Cache-first fuer den Offline-Betrieb |
| `manifest.webmanifest` | PWA-Manifest (Name, Icons, Vollbild) |
| `icon-192.png`, `icon-512.png` | App-Icons fuer den Home-Bildschirm |
| `rename-gifs.sh`, `rename-gifs.ps1` | GIFs einmalig auf die Slugs umbenennen |
| `.github/workflows/deploy.yml` | Automatisches Deployment auf GitHub Pages |
| `.gitignore` | schliesst `media/` und alle GIFs aus |
| `.nojekyll` | schaltet die Jekyll-Verarbeitung ab |
| `LICENSE` | MIT fuer den Code, EISENHORN-Inhalte ausgenommen |

Keine Abhaengigkeiten, kein Build-Schritt. `git push` genuegt.

## 9. Nach einer Aenderung

Der Service Worker liefert aus dem Cache. Nach einem Push die Version in `sw.js`
erhoehen (`const CACHE = 'eh-trainer-v4'`), sonst sieht das iPhone die alte Fassung.

---

## 10. Aufbau des Übungsdetails

Das Detail hat zwei Reiter, weil im Gym anderes zählt als beim Lernen:

* **Trainieren** — Stufenregler mit Live-Umrechnung, „Letztes Mal", Progressionsvorschlag,
  Geräte-Notiz, der offene Satz mit seinen Wiederholungsfeldern, Pausen-Timer und die
  beiden Rekorde. Der Speichern-Knopf sitzt fest am unteren Rand und ist nie wegscrollbar.
* **Anleitung** — Vorbereitung, Ausgangsposition, Ausführung, Tipp und Variantenhinweis im
  Originaltext, die beanspruchte Muskulatur mit Intensitätsskala, Rüstart, Vorgaben,
  Geräte-Notiz und die verwandten Übungen zum Durchtippen.
