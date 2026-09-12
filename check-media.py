#!/usr/bin/env python3
"""EISENHORN Trainer — prüfen, welche Bewegtbilder fehlen.

    cd /pfad/zum/repo
    python3 check-media.py

Vergleicht den Ordner media/ mit den 161 Übungen und listet jede fehlende
Datei mit ihrer Quelladresse auf eisenhorn.com. Die App funktioniert auch
ohne — sie zeigt dann das animierte Bewegungsschema.
"""
import os, sys

BASE = 'https://eisenhorn.com/de-de/training/kraftuebungen/'

EX = [
    ("schulterdruecken", "Schulterdrücken vor dem Kopf"),
    ("latzug-in-den-nacken", "Latzug in den Nacken"),
    ("latzug-zur-brust", "Latzug zur Brust"),
    ("brustdruecken-stehend", "Brustdrücken stehend"),
    ("bizepscurls", "Bizepscurls stehend"),
    ("aufrechtes-rudern-mit-engem-griff", "Aufrechtes Rudern mit engem Griff"),
    ("ruderzug-seitlich-stehend", "Ruderzug seitlich stehend"),
    ("uebungen-fuer-den-trizeps", "Trizepsübung mit Griffstange"),
    ("haengendes-beinheben-mit-angewinkelten-beinen", "Hängendes Beinheben"),
    ("recrunch-mit-griffband", "Recrunch mit Griffband"),
    ("011-trizepsuebung-mit-griffband-kniend", "Trizepsübung mit Griffband kniend"),
    ("rumpfrotation", "Rumpfrotation"),
    ("crunches", "Crunches"),
    ("kreuzheben-mit-griffstange-deadlift", "Kreuzheben mit Griffstange"),
    ("ausfallschritte", "Ausfallschritte"),
    ("einbeinige-kniebeuge-mit-entlastung", "Einbeinige Kniebeuge mit Entlastung"),
    ("einbeinige-beinpresse", "Einbeinige Beinpresse"),
    ("einbeinige-rueckwaertige-beinpresse", "Einbeinige rückwärtige Beinpresse"),
    ("stehendes-wadenheben", "Stehendes Wadenheben"),
    ("beinbeuger-liegend", "Beinbeuger liegend"),
    ("hackenschmidt-kniebeuge", "Hackenschmidt Kniebeuge"),
    ("haengendes-beinheben-mit-gestreckten-beinen", "Hängendes Beinheben mit gestreckten Beinen"),
    ("hueftheben-seitlich", "Hüftheben seitlich"),
    ("progressives-kreuzheben-mit-griffband", "Progressives Kreuzheben mit Griffband"),
    ("bankdruecken-brustdruecken", "Bankdrücken (Brustdrücken)"),
    ("beinpresse", "Beinpresse"),
    ("kniebeugen", "Frontkniebeugen"),
    ("adduktion-mit-griffband", "Adduktion mit Griffband"),
    ("rudern-vorgebeugt-mit-untergriff", "Rudern vorgebeugt mit Untergriff"),
    ("klimmzug-auf-die-brust", "Klimmzug auf die Brust"),
    ("031-einbeinige-kniebeuge-am-horn", "Einbeinige Kniebeuge am Horn"),
    ("rudern-seitlich-einarmig", "Rudern seitlich einarmig"),
    ("brustdruecken-seitlich", "Brustdrücken seitlich"),
    ("innenrotation-mit-seilzug", "Innenrotation mit Seilzug"),
    ("hueftheben", "Hüftheben"),
    ("aussenrotation-mit-seilzug", "Aussenrotation mit Seilzug"),
    ("rudern-vorgebeugt-mit-obergriff", "Rudern vorgebeugt mit Obergriff"),
    ("innenrotation-seitlich-mit-griffband", "Innenrotation seitlich mit Griffband"),
    ("aussenrotation-seitlich-mit-griffband", "Aussenrotation seitlich mit Griffband"),
    ("beckenheben-liegend", "Beckenheben liegend"),
    ("aufrechtes-rudern-mit-breitem-griff", "Aufrechtes Rudern mit breitem Griff"),
    ("trizepsuebung-mit-griffband", "Trizepsübung mit Griffband"),
    ("schulterdruecken-hinter-dem-kopf", "Schulterdrücken hinter dem Kopf"),
    ("liegestuetze-mit-einem-bein-im-griffband", "Liegestütze mit einem Bein im Griffband"),
    ("einbeiniges-kreuzheben-einarmig", "Einbeiniges Kreuzheben einarmig"),
    ("sumo-kreuzheben-deadlifts-mit-griffstange", "Sumo-Kreuzheben mit Griffstange"),
    ("kreuzheben-deadlifts-mit-gestreckten-beinen", "Rumänisches Kreuzheben"),
    ("plank-to-pike", "Plank to pike"),
    ("ausfallschritte-mit-griffband", "Ausfallschritte mit Griffband"),
    ("wadenheben-sitzend", "Wadenheben sitzend"),
    ("unterarm-curls-mit-obergriff", "Unterarm-Curls mit Obergriff"),
    ("unterarm-curls-hinter-dem-ruecken", "Unterarm-Curls hinter dem Rücken"),
    ("negativ-bankdruecken-mit-angehobenen-beinen", "Negativ Bankdrücken mit angehobenen Beinen"),
    ("dips-mit-gewicht", "Dips mit Gewicht"),
    ("055-haengendes-beinheben-mit-angewinkelten-beinen", "Hängendes Beinheben mit angewinkelten Beinen"),
    ("trizepsuebung-mit-langem-griffband", "Trizepsübung mit langem Griffband"),
    ("schienbeinheben-sitzend", "Schienbeinheben sitzend"),
    ("einbeinige-kniebeugen-seitlich", "Einbeinige Kniebeugen seitlich"),
    ("crunches-mit-griffband", "Crunches mit Griffband"),
    ("butterfly", "Butterfly"),
    ("dips-mit-griffband", "Dips mit Griffband"),
    ("bauchcrunches-seitlich", "Bauchcrunches seitlich"),
    ("063-recrunch-mit-griffband", "Recrunch mit Griffband (kniend)"),
    ("trizepsuebung-mit-griffband-2", "Trizepsübung mit Griffband II"),
    ("ueberkopf-ausfallschritte", "Überkopf-Ausfallschritte"),
    ("066-trizepsuebung-mit-griffstange-kniend", "Trizepsübung mit Griffstange kniend"),
    ("nackenheben-hinten", "Nackenheben hinten"),
    ("rudern-einarmig", "Rudern einarmig"),
    ("bizepscurls-mit-koerpergewicht", "Bizepscurls mit Körpergewicht"),
    ("ausfallschritte-nach-vorne", "Ausfallschritte nach vorne"),
    ("schulterheben-hinten", "Schulterheben hinten"),
    ("072-schulterdruecken-hinter-dem-kopf", "Schulterdrücken hinter dem Kopf sitzend"),
    ("073-dips-mit-griffband-tief", "Dips mit Griffband tief"),
    ("hammer-curls", "Hammer Curls"),
    ("haengender-ruderzug-mit-angewinkelten-beinen", "Hängender Ruderzug mit angewinkelten Beinen"),
    ("schulterdruecken-hinter-dem-kopf-mit-griffband", "Schulterdrücken hinter dem Kopf mit Griffband"),
    ("ausfallschritte-mit-griffstange", "Ausfallschritte mit Griffstange"),
    ("liegestuetze-mit-griffband", "Liegestütze mit Griffband"),
    ("trizepsdruecken", "Trizepsdrücken"),
    ("mountain-climbers", "Mountain Climbers"),
    ("schulterdruecken-sitzend", "Schulterdrücken sitzend"),
    ("rumpfbeugen-seitlich", "Rumpfbeugen seitlich"),
    ("einarmige-bizepscurls", "Einarmige Bizepscurls"),
    ("rudern-mit-griffband", "Rudern mit Griffband"),
    ("bankdruecken-in-brueckenstellung", "Bankdrücken in Brückenstellung"),
    ("trizepsuebung-mit-griffband-einarmig", "Trizepsübung mit Griffband einarmig"),
    ("beinbeuger-mit-griffband", "Beinbeuger mit Griffband"),
    ("plank-jacks", "Plank Jacks"),
    ("schulterheben-vorne", "Schulterheben vorne"),
    ("trizepsuebung-mit-griffstange-im-untergriff", "Trizepsübung mit Griffstange Untergriff"),
    ("trizepsuebung-mit-griffband-einarmig-2", "Trizepsübung mit Griffband einarmig II"),
    ("wadenheben-stehend-exzentrisch", "Wadenheben stehend exzentrisch"),
    ("unterarmstuetz-mit-griffband", "Unterarmstütz mit Griffband"),
    ("094-trizepsuebung-mit-griffstange-untergriff-kniend", "Trizepsübung mit Griffstange Untergriff kniend"),
    ("latzug-mit-griffband", "Latzug mit Griffband"),
    ("einbeiniges-kreuzheben", "Einbeiniges Kreuzheben"),
    ("bizepscurls-mit-griffband", "Bizepscurls mit Griffband"),
    ("ueberkopf-kniebeugen-overhead-squats", "Überkopf-Kniebeugen"),
    ("schulterdruecken-sitzend-mit-angehobenen-fuessen", "Schulterdrücken sitzend mit angehobenen Füssen"),
    ("schulterdruecken-mit-engem-griff", "Schulterdrücken mit engem Griff"),
    ("ausfallschritte-mit-stufe", "Ausfallschritte mit Stufe"),
    ("laufschritt-mit-griffband", "Laufschritt mit Griffband"),
    ("liegestuetze-mit-griffband-und-griffstange", "Liegestütze mit Griffband und Griffstange"),
    ("bizepscurls-mit-griffstange-und-seilzug", "Bizepscurls mit Griffstange und Seilzug"),
    ("einarmige-bizepscurls-am-seilzug", "Einarmige Bizepscurls am Seilzug"),
    ("seitenheben-am-seilzug", "Seitenheben am Seilzug"),
    ("flys-einarmig-am-seilzug", "Flys einarmig am Seilzug"),
    ("einarmiges-trizepsdruecken", "Einarmiges Trizepsdrücken"),
    ("rumpfrotation-am-seilzug", "Rumpfrotation am Seilzug"),
    ("110-schulterdruecken-mit-engem-griff-sitzend", "Schulterdrücken mit engem Griff sitzend"),
    ("111-latzug-in-den-nacken-sitzend", "Latzug in den Nacken sitzend"),
    ("crossover-crunch-am-seilzug", "Crossover Crunch am Seilzug"),
    ("russian-twist-am-seilzug", "Russian Twist am Seilzug"),
    ("seitliche-crunches-am-seilzug", "Seitliche Crunches am Seilzug"),
    ("115-latzug-zur-brust-sitzend", "Latzug zur Brust sitzend"),
    ("facepulls-am-seilzug", "Facepulls am Seilzug"),
    ("einarmiger-latzug-am-seilzug", "Einarmiger Latzug am Seilzug"),
    ("stehendes-rudern-am-seilzug", "Stehendes Rudern am Seilzug"),
    ("stehendes-rudern-mit-untergriff-am-seilzug", "Stehendes Rudern mit Untergriff am Seilzug"),
    ("einarmiges-rudern-mit-obergriff-am-seilzug", "Einarmiges Rudern mit Obergriff am Seilzug"),
    ("rudern-im-ausfallschritt-am-seilzug", "Rudern im Ausfallschritt am Seilzug"),
    ("stehender-ruderzug-mit-seilzug", "Stehender Ruderzug mit Seilzug"),
    ("kickbacks-am-seilzug", "Kickbacks am Seilzug"),
    ("abduktion-am-seilzug", "Abduktion am Seilzug"),
    ("adduktion-am-seilzug", "Adduktion am Seilzug"),
    ("beinstrecker-am-seilzug", "Beinstrecker am Seilzug"),
    ("trizepsdruecken-am-seilzug", "Trizepsdrücken am Seilzug"),
    ("ueberkopf-trizepsdruecken-am-seilzug", "Überkopf-Trizepsdrücken am Seilzug"),
    ("200-schulterdruecken-vor-dem-kopf", "Schulterdrücken vor dem Kopf (DS)"),
    ("201-vorgebeugtes-rudern-mit-griffstange", "Vorgebeugtes Rudern mit Griffstange"),
    ("202-frontkniebeugen", "Frontkniebeugen (DS)"),
    ("203-kniebeugen", "Kniebeugen (DS)"),
    ("204-kreuzheben", "Kreuzheben (DS)"),
    ("205-rumaenisches-kreuzheben", "Rumänisches Kreuzheben (DS)"),
    ("206-latzug-mit-griff-am-horn", "Latzug mit Griff am Horn"),
    ("207-latzug-alternierend-mit-griff-am-horn", "Latzug alternierend mit Griff am Horn"),
    ("208-latzug-auf-die-brust-mit-griffstange", "Latzug auf die Brust mit Griffstange"),
    ("209-brustdruecken-stehend-mit-griffstange", "Brustdrücken stehend mit Griffstange"),
    ("210-schulterdruecken-am-horn-alternierend", "Schulterdrücken am Horn alternierend"),
    ("211-rudern-vorgebeugt-mit-griff-am-horn", "Rudern vorgebeugt mit Griff am Horn"),
    ("212-vorgebeugtes-rudern-mit-griff-am-horn-alternierend", "Vorgebeugtes Rudern am Horn alternierend"),
    ("213-explosives-brustdruecken-am-horn-alternierend", "Explosives Brustdrücken am Horn alternierend"),
    ("214-dips", "Dips (DS)"),
    ("215-kreuzheben-mit-griff-am-horn", "Kreuzheben mit Griff am Horn"),
    ("216-rumaenisches-kreuzheben-mit-griff-am-horn", "Rumänisches Kreuzheben mit Griff am Horn"),
    ("217-alternierende-dips-stehend", "Alternierende Dips stehend"),
    ("218-farmers-walk", "Farmer's walk"),
    ("219-wadenheben-mit-griff-am-horn", "Wadenheben mit Griff am Horn"),
    ("220-shrugs-alternierend-mit-griff-am-horn", "Shrugs alternierend mit Griff am Horn"),
    ("221-shrugs-mit-griff-am-horn", "Shrugs mit Griff am Horn"),
    ("222-fliegende-mit-seilzug-von-unten", "Fliegende mit Seilzug von unten"),
    ("223-ueberkopf-trizeps-extensions-mit-seilzug", "Überkopf-Trizeps-Extensions mit Seilzug"),
    ("224-reverse-flys-vorgebeugt-mit-seilzug", "Reverse Flys vorgebeugt mit Seilzug"),
    ("225-alterniederendes-rudern-vorgebeugt-mit-seilzug", "Alternierendes Rudern vorgebeugt mit Seilzug"),
    ("226-schulterrotatoren-alternierend-am-seilzug", "Schulterrotatoren alternierend am Seilzug"),
    ("227-reverse-flys-asymmetrisch-am-seilzug", "Reverse Flys asymmetrisch am Seilzug"),
    ("228-klimmzug-mit-griffstange", "Klimmzug mit Griffstange"),
    ("229-bankdruecken-mit-griffstange", "Bankdrücken mit Griffstange"),
    ("230-bankdruecken-mit-griff-am-horn", "Bankdrücken mit Griff am Horn"),
    ("231-alternierendes-bankdruecken-mit-griff-am-horn", "Alternierendes Bankdrücken mit Griff am Horn"),
    ("232-schulterrotatoren-parallel-am-seilzug", "Schulterrotatoren parallel am Seilzug"),
]


def main():
    d = 'media'
    if not os.path.isdir(d):
        print('Ordner media/ nicht gefunden. Im Repo-Wurzelverzeichnis ausführen.')
        return 1

    have = {f[:-4] for f in os.listdir(d) if f.lower().endswith('.gif')}
    missing = [(s, n) for s, n in EX if s not in have]

    print()
    print('%d von %d Übungen haben ein Bewegtbild.' % (len(EX) - len(missing), len(EX)))
    if not missing:
        print('Vollständig.')
        return 0

    print()
    print('Es fehlen %d:' % len(missing))
    print()
    for s, n in missing:
        print('  %s' % n)
        print('    %s%s/' % (BASE, s))
        print('    → media/%s.gif' % s)
        print()
    return 0


if __name__ == '__main__':
    sys.exit(main())
