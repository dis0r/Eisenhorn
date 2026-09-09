#!/usr/bin/env python3
"""EISENHORN Trainer — GIFs auf die Slugs der App umbenennen.

    cd /pfad/zu/deinen/gifs
    python3 rename-gifs.py

Legt einen Ordner media/ an und kopiert jedes GIF unter seinem Slug-Namen
hinein. Danach media/ ins Repo-Wurzelverzeichnis verschieben.

Der Abgleich läuft über einen normalisierten Schlüssel: doppelt kodierte
Umlaute werden zurückgefaltet, Umlaute nach ASCII überführt, Sonderzeichen
entfernt, alles klein. Dadurch ist es egal, ob die Dateinamen als NFC, NFD
(macOS) oder doppelt kodiert auf der Platte liegen.
"""
import os, re, shutil, sys, unicodedata

MAP = {
    "schulterdruckenvordemkopf": ["schulterdruecken","200-schulterdruecken-vor-dem-kopf"],
    "latzugindennacken": ["latzug-in-den-nacken"],
    "latzugzurbrust": ["latzug-zur-brust"],
    "brustdruckenstehend": ["brustdruecken-stehend"],
    "bizepscurlsstehend": ["bizepscurls"],
    "aufrechtesrudernmitengemgriff": ["aufrechtes-rudern-mit-engem-griff"],
    "ruderzugseitlichstehend": ["ruderzug-seitlich-stehend"],
    "trizepsubungmitgriffstange": ["uebungen-fuer-den-trizeps"],
    "hangendesbeinheben": ["haengendes-beinheben-mit-angewinkelten-beinen"],
    "recrunchmitgriffband": ["recrunch-mit-griffband","063-recrunch-mit-griffband"],
    "trizepsubungmitgriffbandkniend": ["011-trizepsuebung-mit-griffband-kniend"],
    "rumpfrotation": ["rumpfrotation"],
    "crunches": ["crunches"],
    "kreuzhebenmitgriffstange": ["kreuzheben-mit-griffstange-deadlift"],
    "ausfallschritte": ["ausfallschritte"],
    "einbeinigekniebeugemitentlastung": ["einbeinige-kniebeuge-mit-entlastung"],
    "einbeinigebeinpresse": ["einbeinige-beinpresse"],
    "einbeinigeruckwartigebeinpresse": ["einbeinige-rueckwaertige-beinpresse"],
    "stehendeswadenheben": ["stehendes-wadenheben"],
    "beinbeugerliegend": ["beinbeuger-liegend"],
    "hackenschmidtkniebeuge": ["hackenschmidt-kniebeuge"],
    "hangendesbeinhebenmitgestrecktenbeinen": ["haengendes-beinheben-mit-gestreckten-beinen"],
    "hufthebenseitlich": ["hueftheben-seitlich"],
    "progressiveskreuzhebenmitgriffband": ["progressives-kreuzheben-mit-griffband"],
    "bankdruckenbrustdrucken": ["bankdruecken-brustdruecken"],
    "beinpresse": ["beinpresse"],
    "frontkniebeugen": ["kniebeugen","202-frontkniebeugen"],
    "adduktionmitgriffband": ["adduktion-mit-griffband"],
    "rudernvorgebeugtmituntergriff": ["rudern-vorgebeugt-mit-untergriff"],
    "klimmzugaufdiebrust": ["klimmzug-auf-die-brust"],
    "einbeinigekniebeugeamhorn": ["031-einbeinige-kniebeuge-am-horn"],
    "rudernseitlicheinarmig": ["rudern-seitlich-einarmig"],
    "brustdruckenseitlich": ["brustdruecken-seitlich"],
    "innenrotationmitseilzug": ["innenrotation-mit-seilzug"],
    "huftheben": ["hueftheben"],
    "aussenrotationmitseilzug": ["aussenrotation-mit-seilzug"],
    "rudernvorgebeugtmitobergriff": ["rudern-vorgebeugt-mit-obergriff"],
    "innenrotationseitlichmitgriffband": ["innenrotation-seitlich-mit-griffband"],
    "aussenrotationseitlichmitgriffband": ["aussenrotation-seitlich-mit-griffband"],
    "beckenhebenliegend": ["beckenheben-liegend"],
    "aufrechtesrudernmitbreitemgriff": ["aufrechtes-rudern-mit-breitem-griff"],
    "trizepsubungmitgriffband": ["trizepsuebung-mit-griffband","trizepsuebung-mit-griffband-2"],
    "schulterdruckenhinterdemkopf": ["schulterdruecken-hinter-dem-kopf"],
    "liegestutzemiteinembeinimgriffband": ["liegestuetze-mit-einem-bein-im-griffband"],
    "einbeinigeskreuzhebeneinarmig": ["einbeiniges-kreuzheben-einarmig"],
    "sumokreuzhebendeadliftsmitgriffstange": ["sumo-kreuzheben-deadlifts-mit-griffstange"],
    "rumanischeskreuzheben": ["kreuzheben-deadlifts-mit-gestreckten-beinen","205-rumaenisches-kreuzheben"],
    "planktopike": ["plank-to-pike"],
    "ausfallschrittemitgriffband": ["ausfallschritte-mit-griffband"],
    "wadenhebensitzend": ["wadenheben-sitzend"],
    "unterarmcurlsmitobergriff": ["unterarm-curls-mit-obergriff"],
    "unterarmcurlshinterdemrucken": ["unterarm-curls-hinter-dem-ruecken"],
    "negativbankdruckenmitangehobenenbeinen": ["negativ-bankdruecken-mit-angehobenen-beinen"],
    "dipsmitgewicht": ["dips-mit-gewicht"],
    "hangendesbeinhebenmitangewinkeltenbeinen": ["055-haengendes-beinheben-mit-angewinkelten-beinen"],
    "schienbeinhebensitzend": ["schienbeinheben-sitzend"],
    "einbeinigekniebeugenseitlich": ["einbeinige-kniebeugen-seitlich"],
    "crunchesmitgriffband": ["crunches-mit-griffband"],
    "butterfly": ["butterfly"],
    "dipsmitgriffband": ["dips-mit-griffband"],
    "bauchcrunchesseitlich": ["bauchcrunches-seitlich"],
    "uberkopfausfallschritte": ["ueberkopf-ausfallschritte"],
    "trizepsubungmitgriffstangekniend": ["066-trizepsuebung-mit-griffstange-kniend"],
    "nackenhebenhinten": ["nackenheben-hinten"],
    "ruderneinarmig": ["rudern-einarmig"],
    "bizepscurlsmitkorpergewicht": ["bizepscurls-mit-koerpergewicht"],
    "ausfallschrittenachvorne": ["ausfallschritte-nach-vorne"],
    "schulterhebenhinten": ["schulterheben-hinten"],
    "schulterdruckenhinterdemkopfsitzend": ["072-schulterdruecken-hinter-dem-kopf"],
    "dipsmitgriffbandtief": ["073-dips-mit-griffband-tief"],
    "hammercurls": ["hammer-curls"],
    "hangenderruderzugmitangewinkeltenbeinen": ["haengender-ruderzug-mit-angewinkelten-beinen"],
    "schulterdruckenhinterdemkopfmitgriffband": ["schulterdruecken-hinter-dem-kopf-mit-griffband"],
    "ausfallschrittemitgriffstange": ["ausfallschritte-mit-griffstange"],
    "liegestutzemitgriffband": ["liegestuetze-mit-griffband"],
    "trizepsdrucken": ["trizepsdruecken"],
    "mountainclimbers": ["mountain-climbers"],
    "schulterdruckensitzend": ["schulterdruecken-sitzend"],
    "rumpfbeugenseitlich": ["rumpfbeugen-seitlich"],
    "einarmigebizepscurls": ["einarmige-bizepscurls"],
    "rudernmitgriffband": ["rudern-mit-griffband"],
    "bankdruckeninbruckenstellung": ["bankdruecken-in-brueckenstellung"],
    "trizepsubungmitgriffbandeinarmig": ["trizepsuebung-mit-griffband-einarmig","trizepsuebung-mit-griffband-einarmig-2"],
    "beinbeugermitgriffband": ["beinbeuger-mit-griffband"],
    "plankjacks": ["plank-jacks"],
    "schulterhebenvorne": ["schulterheben-vorne"],
    "trizepsubungmitgriffstangeuntergriff": ["trizepsuebung-mit-griffstange-im-untergriff"],
    "wadenhebenstehendexzentrisch": ["wadenheben-stehend-exzentrisch"],
    "unterarmstutzmitgriffband": ["unterarmstuetz-mit-griffband"],
    "trizepsubungmitgriffstangeuntergriffkniend": ["094-trizepsuebung-mit-griffstange-untergriff-kniend"],
    "latzugmitgriffband": ["latzug-mit-griffband"],
    "einbeinigeskreuzheben": ["einbeiniges-kreuzheben"],
    "bizepscurlsmitgriffband": ["bizepscurls-mit-griffband"],
    "uberkopfkniebeugen": ["ueberkopf-kniebeugen-overhead-squats"],
    "schulterdruckensitzendmitangehobenenfussen": ["schulterdruecken-sitzend-mit-angehobenen-fuessen"],
    "schulterdruckenmitengemgriff": ["schulterdruecken-mit-engem-griff"],
    "ausfallschrittemitstufe": ["ausfallschritte-mit-stufe"],
    "laufschrittmitgriffband": ["laufschritt-mit-griffband"],
    "liegestutzemitgriffbandundgriffstange": ["liegestuetze-mit-griffband-und-griffstange"],
    "bizepscurlsmitgriffstangeundseilzug": ["bizepscurls-mit-griffstange-und-seilzug"],
    "einarmigebizepscurlsamseilzug": ["einarmige-bizepscurls-am-seilzug"],
    "seitenhebenamseilzug": ["seitenheben-am-seilzug"],
    "flyseinarmigamseilzug": ["flys-einarmig-am-seilzug"],
    "einarmigestrizepsdrucken": ["einarmiges-trizepsdruecken"],
    "rumpfrotationamseilzug": ["rumpfrotation-am-seilzug"],
    "schulterdruckenmitengemgriffsitzend": ["110-schulterdruecken-mit-engem-griff-sitzend"],
    "latzugindennackensitzend": ["111-latzug-in-den-nacken-sitzend"],
    "crossovercrunchamseilzug": ["crossover-crunch-am-seilzug"],
    "russiantwistamseilzug": ["russian-twist-am-seilzug"],
    "seitlichecrunchesamseilzug": ["seitliche-crunches-am-seilzug"],
    "latzugzurbrustsitzend": ["115-latzug-zur-brust-sitzend"],
    "facepullsamseilzug": ["facepulls-am-seilzug"],
    "einarmigerlatzugamseilzug": ["einarmiger-latzug-am-seilzug"],
    "stehendesrudernamseilzug": ["stehendes-rudern-am-seilzug"],
    "stehendesrudernmituntergriffamseilzug": ["stehendes-rudern-mit-untergriff-am-seilzug"],
    "einarmigesrudernmitobergriffamseilzug": ["einarmiges-rudern-mit-obergriff-am-seilzug"],
    "rudernimausfallschrittamseilzug": ["rudern-im-ausfallschritt-am-seilzug"],
    "stehenderruderzugmitseilzug": ["stehender-ruderzug-mit-seilzug"],
    "kickbacksamseilzug": ["kickbacks-am-seilzug"],
    "adduktionamseilzug": ["adduktion-am-seilzug"],
    "beinstreckeramseilzug": ["beinstrecker-am-seilzug"],
    "trizepsdruckenamseilzug": ["trizepsdruecken-am-seilzug"],
    "uberkopftrizepsdruckenamseilzug": ["ueberkopf-trizepsdruecken-am-seilzug"],
    "vorgebeugtesrudernmitgriffstange": ["201-vorgebeugtes-rudern-mit-griffstange"],
    "kniebeugen": ["203-kniebeugen"],
    "kreuzheben": ["204-kreuzheben"],
    "latzugmitgriffamhorn": ["206-latzug-mit-griff-am-horn"],
    "latzugalternierendmitgriffamhorn": ["207-latzug-alternierend-mit-griff-am-horn"],
    "latzugaufdiebrustmitgriffstange": ["208-latzug-auf-die-brust-mit-griffstange"],
    "brustdruckenstehendmitgriffstange": ["209-brustdruecken-stehend-mit-griffstange"],
    "schulterdruckenamhornalternierend": ["210-schulterdruecken-am-horn-alternierend"],
    "rudernvorgebeugtmitgriffamhorn": ["211-rudern-vorgebeugt-mit-griff-am-horn"],
    "vorgebeugtesrudernmitgriffamhornalternierend": ["212-vorgebeugtes-rudern-mit-griff-am-horn-alternierend"],
    "explosivesbrustdruckenamhornalternierend": ["213-explosives-brustdruecken-am-horn-alternierend"],
    "dips": ["214-dips"],
    "kreuzhebenmitgriffamhorn": ["215-kreuzheben-mit-griff-am-horn"],
    "rumanischeskreuzhebenmitgriffamhorn": ["216-rumaenisches-kreuzheben-mit-griff-am-horn"],
    "alternierendedipsstehend": ["217-alternierende-dips-stehend"],
    "farmerswalk": ["218-farmers-walk"],
    "wadenhebenmitgriffamhorn": ["219-wadenheben-mit-griff-am-horn"],
    "shrugsalternierendmitgriffamhorn": ["220-shrugs-alternierend-mit-griff-am-horn"],
    "shrugsmitgriffamhorn": ["221-shrugs-mit-griff-am-horn"],
    "fliegendemitseilzugvonunten": ["222-fliegende-mit-seilzug-von-unten"],
    "uberkopftrizepsextensionsmitseilzug": ["223-ueberkopf-trizeps-extensions-mit-seilzug"],
    "reverseflysvorgebeugtmitseilzug": ["224-reverse-flys-vorgebeugt-mit-seilzug"],
    "alternierendesrudernvorgebeugtmitseilzug": ["225-alterniederendes-rudern-vorgebeugt-mit-seilzug"],
    "schulterrotatorenalternierendamseilzug": ["226-schulterrotatoren-alternierend-am-seilzug"],
    "reverseflysasymmetrischamseilzug": ["227-reverse-flys-asymmetrisch-am-seilzug"],
    "klimmzugmitgriffstange": ["228-klimmzug-mit-griffstange"],
    "bankdruckenmitgriffstange": ["229-bankdruecken-mit-griffstange"],
    "bankdruckenmitgriffamhorn": ["230-bankdruecken-mit-griff-am-horn"],
    "alternierendesbankdruckenmitgriffamhorn": ["231-alternierendes-bankdruecken-mit-griff-am-horn"],
    "schulterrotatorenparallelamseilzug": ["232-schulterrotatoren-parallel-am-seilzug"],
}

UML = {'ä':'ae','ö':'oe','ü':'ue','Ä':'ae','Ö':'oe','Ü':'ue','ß':'ss'}


def repair(name):
    """Doppelt kodierte Umlaute zurückholen: Zeichen als Bytes lesen, als UTF-8 dekodieren."""
    try:
        if any(0x80 <= ord(c) <= 0xFF for c in name):
            return name.encode('latin-1').decode('utf-8')
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    return name


def key(name):
    s = unicodedata.normalize('NFC', name)
    for a, b in UML.items():
        s = s.replace(a, b)
    s = unicodedata.normalize('NFD', s)
    s = ''.join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r'[^a-z0-9]', '', s.lower())
    return s.replace('ue', 'u').replace('oe', 'o').replace('ae', 'a')


def keys(name):
    """Mehrere Schreibweisen probieren — je nach System liegt der Name anders vor."""
    out = []
    for v in (name, repair(name), unicodedata.normalize('NFC', name)):
        k = key(v)
        if k and k not in out:
            out.append(k)
    return out


def main():
    src = os.getcwd()
    dst = os.path.join(src, 'media')
    os.makedirs(dst, exist_ok=True)

    files = sorted(f for f in os.listdir(src) if f.lower().endswith('.gif'))
    if not files:
        print('Keine GIF-Dateien in', src)
        return 1

    copied, missed = 0, []
    for f in files:
        base = os.path.splitext(f)[0]
        slugs = None
        for k in keys(base):
            if k in MAP:
                slugs = MAP[k]
                break
        if not slugs:
            missed.append(f)
            continue
        for slug in slugs:
            shutil.copyfile(os.path.join(src, f), os.path.join(dst, slug + '.gif'))
            copied += 1

    print()
    print('%d GIFs nach media/ kopiert (erwartet: 159).' % copied)
    if missed:
        print('%d Dateien ohne Treffer:' % len(missed))
        for f in missed:
            print('   ', f)
    print()
    print('Jetzt den Ordner media/ ins Repo-Wurzelverzeichnis verschieben.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
