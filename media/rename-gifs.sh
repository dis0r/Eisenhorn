#!/bin/sh
# EISENHORN Trainer — GIFs auf die Slugs der App umbenennen.
#
#   cd /pfad/zu/deinen/gifs
#   sh /pfad/zu/app/rename-gifs.sh
#
# Vergleicht Dateinamen normalisiert: doppelt kodierte Umlaute werden zurueck-
# gefaltet, danach Umlaut -> ASCII, Sonderzeichen weg, Kleinschreibung. Laeuft
# daher unabhaengig davon, ob die Namen als NFC, NFD (macOS) oder doppelt
# kodiert auf der Platte liegen.
set -e
mkdir -p media

key() {
  printf '%s' "$1" \
    | sed -e 's/Ã¤/ae/g; s/Ã¶/oe/g; s/Ã¼/ue/g' \
          -e 's/Ã\x9f/ss/g; s/Ã\x84/ae/g; s/Ã\x96/oe/g; s/Ã\x9c/ue/g' \
          -e 's/ä/ae/g; s/ö/oe/g; s/ü/ue/g; s/Ä/ae/g; s/Ö/oe/g; s/Ü/ue/g; s/ß/ss/g' \
    | tr '[:upper:]' '[:lower:]' \
    | tr -cd 'a-z0-9' \
    | sed -e 's/ue/u/g; s/oe/o/g; s/ae/a/g'
}

n=0
miss=0
for f in *.gif *.GIF; do
  [ -e "$f" ] || continue
  slug=""
  case "$(key "${f%.*}")" in
    schulterdruckenvordemkopf) slug="schulterdruecken 200-schulterdruecken-vor-dem-kopf" ;;
    latzugindennacken) slug="latzug-in-den-nacken" ;;
    latzugzurbrust) slug="latzug-zur-brust" ;;
    brustdruckenstehend) slug="brustdruecken-stehend" ;;
    bizepscurlsstehend) slug="bizepscurls" ;;
    aufrechtesrudernmitengemgriff) slug="aufrechtes-rudern-mit-engem-griff" ;;
    ruderzugseitlichstehend) slug="ruderzug-seitlich-stehend" ;;
    trizepsubungmitgriffstange) slug="uebungen-fuer-den-trizeps" ;;
    hangendesbeinheben) slug="haengendes-beinheben-mit-angewinkelten-beinen" ;;
    recrunchmitgriffband) slug="recrunch-mit-griffband 063-recrunch-mit-griffband" ;;
    trizepsubungmitgriffbandkniend) slug="011-trizepsuebung-mit-griffband-kniend" ;;
    rumpfrotation) slug="rumpfrotation" ;;
    crunches) slug="crunches" ;;
    kreuzhebenmitgriffstange) slug="kreuzheben-mit-griffstange-deadlift" ;;
    ausfallschritte) slug="ausfallschritte" ;;
    einbeinigekniebeugemitentlastung) slug="einbeinige-kniebeuge-mit-entlastung" ;;
    einbeinigebeinpresse) slug="einbeinige-beinpresse" ;;
    einbeinigeruckwartigebeinpresse) slug="einbeinige-rueckwaertige-beinpresse" ;;
    stehendeswadenheben) slug="stehendes-wadenheben" ;;
    beinbeugerliegend) slug="beinbeuger-liegend" ;;
    hackenschmidtkniebeuge) slug="hackenschmidt-kniebeuge" ;;
    hangendesbeinhebenmitgestrecktenbeinen) slug="haengendes-beinheben-mit-gestreckten-beinen" ;;
    hufthebenseitlich) slug="hueftheben-seitlich" ;;
    progressiveskreuzhebenmitgriffband) slug="progressives-kreuzheben-mit-griffband" ;;
    bankdruckenbrustdrucken) slug="bankdruecken-brustdruecken" ;;
    beinpresse) slug="beinpresse" ;;
    frontkniebeugen) slug="kniebeugen 202-frontkniebeugen" ;;
    adduktionmitgriffband) slug="adduktion-mit-griffband" ;;
    rudernvorgebeugtmituntergriff) slug="rudern-vorgebeugt-mit-untergriff" ;;
    klimmzugaufdiebrust) slug="klimmzug-auf-die-brust" ;;
    einbeinigekniebeugeamhorn) slug="031-einbeinige-kniebeuge-am-horn" ;;
    rudernseitlicheinarmig) slug="rudern-seitlich-einarmig" ;;
    brustdruckenseitlich) slug="brustdruecken-seitlich" ;;
    innenrotationmitseilzug) slug="innenrotation-mit-seilzug" ;;
    huftheben) slug="hueftheben" ;;
    aussenrotationmitseilzug) slug="aussenrotation-mit-seilzug" ;;
    rudernvorgebeugtmitobergriff) slug="rudern-vorgebeugt-mit-obergriff" ;;
    innenrotationseitlichmitgriffband) slug="innenrotation-seitlich-mit-griffband" ;;
    aussenrotationseitlichmitgriffband) slug="aussenrotation-seitlich-mit-griffband" ;;
    beckenhebenliegend) slug="beckenheben-liegend" ;;
    aufrechtesrudernmitbreitemgriff) slug="aufrechtes-rudern-mit-breitem-griff" ;;
    trizepsubungmitgriffband) slug="trizepsuebung-mit-griffband trizepsuebung-mit-griffband-2" ;;
    schulterdruckenhinterdemkopf) slug="schulterdruecken-hinter-dem-kopf" ;;
    liegestutzemiteinembeinimgriffband) slug="liegestuetze-mit-einem-bein-im-griffband" ;;
    einbeinigeskreuzhebeneinarmig) slug="einbeiniges-kreuzheben-einarmig" ;;
    sumokreuzhebendeadliftsmitgriffstange) slug="sumo-kreuzheben-deadlifts-mit-griffstange" ;;
    rumanischeskreuzheben) slug="kreuzheben-deadlifts-mit-gestreckten-beinen 205-rumaenisches-kreuzheben" ;;
    planktopike) slug="plank-to-pike" ;;
    ausfallschrittemitgriffband) slug="ausfallschritte-mit-griffband" ;;
    wadenhebensitzend) slug="wadenheben-sitzend" ;;
    unterarmcurlsmitobergriff) slug="unterarm-curls-mit-obergriff" ;;
    unterarmcurlshinterdemrucken) slug="unterarm-curls-hinter-dem-ruecken" ;;
    negativbankdruckenmitangehobenenbeinen) slug="negativ-bankdruecken-mit-angehobenen-beinen" ;;
    dipsmitgewicht) slug="dips-mit-gewicht" ;;
    hangendesbeinhebenmitangewinkeltenbeinen) slug="055-haengendes-beinheben-mit-angewinkelten-beinen" ;;
    schienbeinhebensitzend) slug="schienbeinheben-sitzend" ;;
    einbeinigekniebeugenseitlich) slug="einbeinige-kniebeugen-seitlich" ;;
    crunchesmitgriffband) slug="crunches-mit-griffband" ;;
    butterfly) slug="butterfly" ;;
    dipsmitgriffband) slug="dips-mit-griffband" ;;
    bauchcrunchesseitlich) slug="bauchcrunches-seitlich" ;;
    uberkopfausfallschritte) slug="ueberkopf-ausfallschritte" ;;
    trizepsubungmitgriffstangekniend) slug="066-trizepsuebung-mit-griffstange-kniend" ;;
    nackenhebenhinten) slug="nackenheben-hinten" ;;
    ruderneinarmig) slug="rudern-einarmig" ;;
    bizepscurlsmitkorpergewicht) slug="bizepscurls-mit-koerpergewicht" ;;
    ausfallschrittenachvorne) slug="ausfallschritte-nach-vorne" ;;
    schulterhebenhinten) slug="schulterheben-hinten" ;;
    schulterdruckenhinterdemkopfsitzend) slug="072-schulterdruecken-hinter-dem-kopf" ;;
    dipsmitgriffbandtief) slug="073-dips-mit-griffband-tief" ;;
    hammercurls) slug="hammer-curls" ;;
    hangenderruderzugmitangewinkeltenbeinen) slug="haengender-ruderzug-mit-angewinkelten-beinen" ;;
    schulterdruckenhinterdemkopfmitgriffband) slug="schulterdruecken-hinter-dem-kopf-mit-griffband" ;;
    ausfallschrittemitgriffstange) slug="ausfallschritte-mit-griffstange" ;;
    liegestutzemitgriffband) slug="liegestuetze-mit-griffband" ;;
    trizepsdrucken) slug="trizepsdruecken" ;;
    mountainclimbers) slug="mountain-climbers" ;;
    schulterdruckensitzend) slug="schulterdruecken-sitzend" ;;
    rumpfbeugenseitlich) slug="rumpfbeugen-seitlich" ;;
    einarmigebizepscurls) slug="einarmige-bizepscurls" ;;
    rudernmitgriffband) slug="rudern-mit-griffband" ;;
    bankdruckeninbruckenstellung) slug="bankdruecken-in-brueckenstellung" ;;
    trizepsubungmitgriffbandeinarmig) slug="trizepsuebung-mit-griffband-einarmig trizepsuebung-mit-griffband-einarmig-2" ;;
    beinbeugermitgriffband) slug="beinbeuger-mit-griffband" ;;
    plankjacks) slug="plank-jacks" ;;
    schulterhebenvorne) slug="schulterheben-vorne" ;;
    trizepsubungmitgriffstangeuntergriff) slug="trizepsuebung-mit-griffstange-im-untergriff" ;;
    wadenhebenstehendexzentrisch) slug="wadenheben-stehend-exzentrisch" ;;
    unterarmstutzmitgriffband) slug="unterarmstuetz-mit-griffband" ;;
    trizepsubungmitgriffstangeuntergriffkniend) slug="094-trizepsuebung-mit-griffstange-untergriff-kniend" ;;
    latzugmitgriffband) slug="latzug-mit-griffband" ;;
    einbeinigeskreuzheben) slug="einbeiniges-kreuzheben" ;;
    bizepscurlsmitgriffband) slug="bizepscurls-mit-griffband" ;;
    uberkopfkniebeugen) slug="ueberkopf-kniebeugen-overhead-squats" ;;
    schulterdruckensitzendmitangehobenenfussen) slug="schulterdruecken-sitzend-mit-angehobenen-fuessen" ;;
    schulterdruckenmitengemgriff) slug="schulterdruecken-mit-engem-griff" ;;
    ausfallschrittemitstufe) slug="ausfallschritte-mit-stufe" ;;
    laufschrittmitgriffband) slug="laufschritt-mit-griffband" ;;
    liegestutzemitgriffbandundgriffstange) slug="liegestuetze-mit-griffband-und-griffstange" ;;
    bizepscurlsmitgriffstangeundseilzug) slug="bizepscurls-mit-griffstange-und-seilzug" ;;
    einarmigebizepscurlsamseilzug) slug="einarmige-bizepscurls-am-seilzug" ;;
    seitenhebenamseilzug) slug="seitenheben-am-seilzug" ;;
    flyseinarmigamseilzug) slug="flys-einarmig-am-seilzug" ;;
    einarmigestrizepsdrucken) slug="einarmiges-trizepsdruecken" ;;
    rumpfrotationamseilzug) slug="rumpfrotation-am-seilzug" ;;
    schulterdruckenmitengemgriffsitzend) slug="110-schulterdruecken-mit-engem-griff-sitzend" ;;
    latzugindennackensitzend) slug="111-latzug-in-den-nacken-sitzend" ;;
    crossovercrunchamseilzug) slug="crossover-crunch-am-seilzug" ;;
    russiantwistamseilzug) slug="russian-twist-am-seilzug" ;;
    seitlichecrunchesamseilzug) slug="seitliche-crunches-am-seilzug" ;;
    latzugzurbrustsitzend) slug="115-latzug-zur-brust-sitzend" ;;
    facepullsamseilzug) slug="facepulls-am-seilzug" ;;
    einarmigerlatzugamseilzug) slug="einarmiger-latzug-am-seilzug" ;;
    stehendesrudernamseilzug) slug="stehendes-rudern-am-seilzug" ;;
    stehendesrudernmituntergriffamseilzug) slug="stehendes-rudern-mit-untergriff-am-seilzug" ;;
    einarmigesrudernmitobergriffamseilzug) slug="einarmiges-rudern-mit-obergriff-am-seilzug" ;;
    rudernimausfallschrittamseilzug) slug="rudern-im-ausfallschritt-am-seilzug" ;;
    stehenderruderzugmitseilzug) slug="stehender-ruderzug-mit-seilzug" ;;
    kickbacksamseilzug) slug="kickbacks-am-seilzug" ;;
    adduktionamseilzug) slug="adduktion-am-seilzug" ;;
    beinstreckeramseilzug) slug="beinstrecker-am-seilzug" ;;
    trizepsdruckenamseilzug) slug="trizepsdruecken-am-seilzug" ;;
    uberkopftrizepsdruckenamseilzug) slug="ueberkopf-trizepsdruecken-am-seilzug" ;;
    vorgebeugtesrudernmitgriffstange) slug="201-vorgebeugtes-rudern-mit-griffstange" ;;
    kniebeugen) slug="203-kniebeugen" ;;
    kreuzheben) slug="204-kreuzheben" ;;
    latzugmitgriffamhorn) slug="206-latzug-mit-griff-am-horn" ;;
    latzugalternierendmitgriffamhorn) slug="207-latzug-alternierend-mit-griff-am-horn" ;;
    latzugaufdiebrustmitgriffstange) slug="208-latzug-auf-die-brust-mit-griffstange" ;;
    brustdruckenstehendmitgriffstange) slug="209-brustdruecken-stehend-mit-griffstange" ;;
    schulterdruckenamhornalternierend) slug="210-schulterdruecken-am-horn-alternierend" ;;
    rudernvorgebeugtmitgriffamhorn) slug="211-rudern-vorgebeugt-mit-griff-am-horn" ;;
    vorgebeugtesrudernmitgriffamhornalternierend) slug="212-vorgebeugtes-rudern-mit-griff-am-horn-alternierend" ;;
    explosivesbrustdruckenamhornalternierend) slug="213-explosives-brustdruecken-am-horn-alternierend" ;;
    dips) slug="214-dips" ;;
    kreuzhebenmitgriffamhorn) slug="215-kreuzheben-mit-griff-am-horn" ;;
    rumanischeskreuzhebenmitgriffamhorn) slug="216-rumaenisches-kreuzheben-mit-griff-am-horn" ;;
    alternierendedipsstehend) slug="217-alternierende-dips-stehend" ;;
    farmerswalk) slug="218-farmers-walk" ;;
    wadenhebenmitgriffamhorn) slug="219-wadenheben-mit-griff-am-horn" ;;
    shrugsalternierendmitgriffamhorn) slug="220-shrugs-alternierend-mit-griff-am-horn" ;;
    shrugsmitgriffamhorn) slug="221-shrugs-mit-griff-am-horn" ;;
    fliegendemitseilzugvonunten) slug="222-fliegende-mit-seilzug-von-unten" ;;
    uberkopftrizepsextensionsmitseilzug) slug="223-ueberkopf-trizeps-extensions-mit-seilzug" ;;
    reverseflysvorgebeugtmitseilzug) slug="224-reverse-flys-vorgebeugt-mit-seilzug" ;;
    alternierendesrudernvorgebeugtmitseilzug) slug="225-alterniederendes-rudern-vorgebeugt-mit-seilzug" ;;
    schulterrotatorenalternierendamseilzug) slug="226-schulterrotatoren-alternierend-am-seilzug" ;;
    reverseflysasymmetrischamseilzug) slug="227-reverse-flys-asymmetrisch-am-seilzug" ;;
    klimmzugmitgriffstange) slug="228-klimmzug-mit-griffstange" ;;
    bankdruckenmitgriffstange) slug="229-bankdruecken-mit-griffstange" ;;
    bankdruckenmitgriffamhorn) slug="230-bankdruecken-mit-griff-am-horn" ;;
    alternierendesbankdruckenmitgriffamhorn) slug="231-alternierendes-bankdruecken-mit-griff-am-horn" ;;
    schulterrotatorenparallelamseilzug) slug="232-schulterrotatoren-parallel-am-seilzug" ;;
  esac
  if [ -n "$slug" ]; then
    for s in $slug; do
      cp "$f" "media/$s.gif"
      n=$((n+1))
    done
  else
    echo "kein Treffer: $f"
    miss=$((miss+1))
  fi
done
echo "$n GIFs nach media/ kopiert (erwartet: 159), $miss ohne Treffer."
echo "Jetzt den Ordner media/ nach app/media/ verschieben."
