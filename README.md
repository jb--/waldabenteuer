# Waldabenteuer 🌲

Eine vollständig statische Schatzsuche-PWA für Kindergeburtstage: Offline-Karte aus OpenStreetMap-Daten, Standort, QR-Scanner, optionale Gruppentimer, Rätsel mit Lösungswort und live angezeigte Laufwege. Dazu eine lokale Offline-Werkstatt, mit der die Spielleitung erst QR-Karten druckt und dann draußen die Stationen erfasst. Kein Backend, Konto oder API-Schlüssel erforderlich.

## Lokal starten

Node.js 22 oder neuer:

```sh
npm ci
npm run dev
```

Der Entwicklungsserver ist für die UI-Entwicklung. **Offline-Funktionen werden im Produktionsbuild getestet:**

```sh
npm run build
npm run preview
```

Dann `http://localhost:4173/` öffnen. Auf dem Tablet brauchen Installation, Kamera und GPS **HTTPS**; eine HTTP-LAN-IP genügt dafür nicht. GitHub Pages stellt HTTPS bereit.

- Spiel: `/`
- Spielleitung: `/#/spielleitung`
- GitHub-Projektseite entsprechend: `/REPOSITORY/#/spielleitung`

Der Admin-Einstieg ist absichtlich nicht im Spiel verlinkt. Die Hash-Route funktioniert auch beim direkten Öffnen auf GitHub Pages und ohne Netz. Sie ist kein Passwortschutz.

## Der Ablauf: QR-Stapel mit in den Wald nehmen

1. Spielleitung öffnen und **Neues Abenteuer** wählen. Zum Beispiel **30 Vorratskarten** wählen (1–100 möglich) und **Vorrat erzeugen & drucken** drücken. Orte, Aufgaben und Lösungswörter sind dafür nicht erforderlich.
2. **Vorratskarten drucken**: eine Karte pro DIN-A4-Seite, als Papier oder über den Druckdialog als PDF. Einzelne QR-Codes lassen sich als PNG herunterladen.
3. Alle Karten tragen denselben allgemeinen Text und jeweils einen eindeutigen QR-Code. **Keine vorgegebene Stationsnummer, kein fester Ort, kein Sortieren.**
4. **Entwurf sichern**, bis „Offline bereit“ warten und die App auf dem Tablet einmal im Flugmodus testen. Karte, Admin-Editor und QR-Decoder werden vollständig gespeichert.
5. Draußen irgendeine Karte aufhängen. **Aufgehängten Code scannen** wählen, frische GPS-Position und Genauigkeit prüfen, dann **Position hier speichern**. Diese Karte ist jetzt die nächste Station.
6. An der nächsten Stelle irgendeine andere Karte verwenden. Die Reihenfolge entsteht aus dem Platzieren, nicht aus dem Erzeugen oder Drucken. Erneutes Erfassen derselben Karte aktualisiert deren Ort und erzeugt keine zweite Station.
7. Station antippen, um Name, Hinweis, Erfolgstitel und Erfolgstext zu bearbeiten. Bei Bedarf können Koordinaten manuell eingetragen werden.
8. **Spiel exportieren** lädt `hunt.json` herunter. **Nur platzierte Karten werden exportiert.** Der ungenutzte Vorrat bleibt im Entwurf. Alle gedruckten QR-Kennungen bleiben unverändert.
9. Die Datei als `public/hunt.json` ins Repository übernehmen und committen/pushen. Der Build leitet den Kartenausschnitt aus dem Export ab und lädt die dazugehörigen OSM-Daten automatisch. Nach erfolgreichem Deployment ist das neue Spiel öffentlich nutzbar.

**Feldmodus:** Beim Loslaufen „Feldmodus starten“ wählen. Karte und Scanner stehen dann im Mittelpunkt. GPS, Zoom und Kartenausschnitt bleiben nach dem Speichern erhalten. Zur Vorbereitung geht es über „Zur Werkstatt“ zurück.

**Vorrat pflegen:** Freie Karten sind eingeklappt. Über „Weitere QR-Karten erzeugen“ ergänzt ihr euren vorhandenen Stapel bis insgesamt 100 Karten, ohne bestehende Codes zu verändern. Der Druckdialog zeigt den Fortschritt und bietet alle oder nur freie Karten an; nach dem Ergänzen lassen sich direkt nur die neuen Karten drucken.

**Stationen anpassen:** Die Pfeile neben platzierten Stationen ändern die Reihenfolge. Eine Station lässt sich ausdrücklich zurück in den Vorrat legen. Ungespeicherte Stationstexte werden vor versehentlichem Schließen geschützt; beschädigte lokale Entwürfe können über eine Rettungssicherung heruntergeladen werden.

Mehrere Entwürfe sind auf demselben Gerät möglich. **Entwurf sichern** speichert auch unbenutzte Codes und GPS-Genauigkeiten. Über **Datei importieren** lässt sich eine Sicherung auf demselben oder einem anderen Tablet weiterbearbeiten. „Aktuelles Spiel übernehmen“ legt eine lokale bearbeitbare Kopie des veröffentlichten Spiels an. Importieren oder Bearbeiten veröffentlicht nichts.

Entwürfe sind an Browser, Gerät und Website-Adresse gebunden. Löschen von Browserdaten entfernt sie; eine Datei-Sicherung bleibt davon unabhängig. Bei einem Speicherfehler zeigt die App ausdrücklich an, dass der lokale Stand nicht gesichert werden konnte.

## Alle Stationen oder die nächste Spur

In der Werkstatt unter **Stationen auf der Schatzkarte**:

- **Alle Stationen direkt anzeigen** (`"stationVisibility": "all"`)
- **Nur die nächste Station anzeigen** (`"stationVisibility": "next"`)

Bei „next“ zeigt die Oberfläche die erste noch nicht gefundene Station und bereits entdeckte Stationen. Sobald ein Code gefunden wurde, erscheint die nächste. Das ist eine Einstellung für die Anzeige, keine Sperre: Wer einen späteren gültigen Code findet, kann ihn ebenfalls scannen. Die Reihenfolge kommt aus der Stationsliste im Export: zunächst aus dem Platzieren, danach bei Bedarf mit den Pfeilen in der Werkstatt geändert. Der vollständige Spielinhalt liegt bei einer statischen Offline-App grundsätzlich auf dem Gerät.

## Spielmodus und Lösungswörter

In der Werkstatt lässt sich wählen, ob ein QR-Scan eine Station abschließt oder zunächst eine **Aufgabe mit Lösungswort** öffnet. Im Lösungswort-Modus bleibt das nächste Ziel gesperrt, bis die richtige Antwort eingegeben wurde. Eine offene Aufgabe bleibt auch nach einem Offline-Neustart erhalten. Groß-/Kleinschreibung und zusätzliche Leerzeichen spielen bei der Antwort keine Rolle.

Aufgabe, Antwort und optionaler Tipp werden im Stationseditor festgelegt. Beim Erzeugen und Drucken des QR-Vorrats dürfen diese Felder leer bleiben. Erst beim Export eines Spiels mit Lösungswörtern braucht jede platzierte Station eine Aufgabe und Antwort. Der QR-Code selbst ändert sich dadurch nicht. Die Antworten liegen in der lokalen Spielkonfiguration; dies ist ein Spielmechanismus, kein Zugriffsschutz.

## Timer, Gruppen und GPS-Route

Neue Abenteuer starten standardmäßig **ohne Zeitdruck**. Die Werkstatt bietet eine Einstellung für Spielen mit oder ohne Zeit. Ohne Zeit werden weder laufender Timer noch Funddauern oder eine Zeit auf der Urkunde angezeigt. Die GPS-Aufzeichnung funktioniert unabhängig davon. Ältere Konfigurationen ohne `timing` behalten ihren Timer.

Bei eingeschalteter Zeitmessung gilt: Beim Start werden Teamname und Startzeit gespeichert. Der Timer läuft anhand der Uhrzeit weiter, auch wenn die App neu geladen oder geschlossen wird. Jeder Fund erhält einen Zeitstempel und die seit dem Start verstrichene Zeit. Nach dem letzten Fund wird der Timer eingefroren.

Beim Start fordert die App den Standort an und zeichnet den Weg der aktiven Gruppe lokal auf. Nach einem Neustart wird die Aufzeichnung für ein laufendes Spiel fortgesetzt. Der gelaufene Pfad erscheint bereits unterwegs als Linie auf der Schatzkarte und bleibt nach einem Neustart erhalten. Unter **Unser Team** findet ihr eure Entdeckungen, eine Karte eurer Route und die geschätzte Strecke; Funddauern erscheinen nur bei eingeschalteter Zeitmessung. Exportiert alle Gruppen als JSON oder die Route einer Gruppe als GPX.

- **Für GPS-Aufzeichnung die App geöffnet im Vordergrund lassen.** Mobile Browser können Hintergrundtabs und gesperrte Geräte pausieren. Eine PWA kann eine unterbrechungsfreie Hintergrundaufzeichnung nicht garantieren.
- GPS funktioniert ohne Internet nur, wenn das Tablet passende Standort-Hardware und ein Signal hat. Insbesondere Tablets ohne GPS können offline keinen verlässlichen Standort liefern. Das Spiel funktioniert auch ohne Standortfreigabe; dann fehlen Standortpunkt und Route.
- Messungen mit mehr als 80 m gemeldeter Ungenauigkeit gehen nicht in den Laufweg ein. Zwischen zwei Messungen liegen mindestens fünf Sekunden. Lücken über zwei Minuten werden nicht als gelaufene Strecke verbunden.
- Aufzeichnung endet bei vollständigem Spiel. Ein Gruppenwechsel wechselt die aktive Aufzeichnung. Verschiedene Tablets speichern ihre Gruppen separat; es gibt keine automatische Synchronisierung oder gemeinsame Online-Rangliste.
- Routen und Namen werden nicht an einen Server gesendet. Exportdateien enthalten diese Informationen nur, wenn ihr sie selbst herunterladet und weitergebt. Sehr lange Routen werden ab 17.000 Punkten ausgedünnt.

## Für unterwegs & fürs Erinnerungsalbum

- Nach dem Start rückt die Karte nach oben. Auf dem Handy bleibt ein Scan-Button griffbereit über der Navigation.
- Die Karte lässt sich groß öffnen. Im Modus „nächste Station“ fokussiert „Weiter ins Abenteuer“ die neue Spur. Bei ausreichend genauem GPS wird die ungefähre Luftlinie zum Ziel angezeigt; das ist keine Wegbeschreibung.
- „Bildschirm wach halten“ versucht während des Spiels das automatische Sperren zu verhindern. Der Schalter lässt sich deaktivieren. Unterstützung und Energiespar-Einstellungen des Geräts bestimmen, ob das möglich ist.
- Ein dezenter Erfolgston ist freiwillig zuschaltbar und wird lokal erzeugt. Standardmäßig bleibt er aus. Wer auf dem Gerät reduzierte Bewegung eingestellt hat, erhält keine Konfetti-Animation.
- Nach dem letzten Fund sind alle Team-Abzeichen und die persönliche Entdecker-Urkunde frei. Die Urkunde mit Teamname, Abenteuer und optionaler Zeit lässt sich als SVG herunterladen und ausdrucken.
- „So geht’s“ erklärt den Spielablauf direkt in der App.

## GitHub Pages

Das Projekt enthält `.github/workflows/deploy.yml`. Es lässt sich unter einer Repository-Unteradresse oder einer eigenen Domain betreiben.

1. Repository bei GitHub anlegen und diese Dateien auf `main` pushen.
2. **Settings → Pages → Source → GitHub Actions** auswählen.
3. Der Workflow installiert Pakete, führt die Logiktests aus, bereitet die Offline-Karte vor, baut die App und veröffentlicht `dist/`.
4. Die Pages-Adresse auf jedem Spieltablet öffnen, „Offline bereit“ abwarten und installieren.

Nach einem Konfigurations-Update die PWA vor dem Ausflug online neu öffnen und gegebenenfalls erneut laden, damit die neue App-Version aktiv wird. Die Werkstatt veröffentlicht absichtlich nicht direkt auf GitHub und braucht keinen GitHub-Zugangsschlüssel.

## Konfiguration und Kartenausschnitt

`public/hunt.json` enthält Gebiet, Texte, Anzeigeoption und Stationen. IDs und Codes eines gedruckten Vorrats nicht nachträglich ändern.

```json
{
  "id": "eindeutiges-abenteuer",
  "title": "Das Geheimnis der Pinien",
  "area": "Las Raíces",
  "region": "Teneriffa",
  "stationVisibility": "next",
  "timing": false,
  "progression": "scan",
  "mapSelection": { "mode": "auto" },
  "demo": false,
  "description": "Findet gemeinsam den Waldschatz!",
  "map": {
    "file": "map.geojson",
    "center": [28.421, -16.378],
    "bounds": [
      [28.416, -16.384],
      [28.426, -16.372]
    ]
  },
  "stations": [
    {
      "id": "station-1",
      "code": "7C91BAEFA3",
      "name": "Die alte Pinie",
      "hint": "Sucht den großen Baum am Weg.",
      "position": [28.421, -16.378],
      "icon": "trees",
      "title": "Die erste Spur!",
      "message": "Juhu! Welche Geräusche hört ihr im Wald?"
    }
  ]
}
```

In der Werkstatt kann das Kartengebiet automatisch aus den platzierten Stationen mit rund 400 m Rand abgeleitet oder ausdrücklich gewählt werden: **Las Raíces, Anaga, La Orotava, Teide oder ganz Teneriffa**. Eigene Gebiete lassen sich über Mittelpunkt und Radius anlegen; der Mittelpunkt kann auch vom aktuellen GPS-Standort übernommen werden. Bei ausdrücklich gewählten Gebieten müssen alle exportierten Stationen innerhalb der Grenzen liegen.

Die Karte für ganz Teneriffa wird mitgeliefert: rund **37 MB GeoJSON mit etwa 89.500 OSM-Objekten**. Damit funktionieren Erkundungen auf der gesamten Insel nach der ersten vollständigen Offline-Vorbereitung. Wege und Details werden abhängig vom Zoom angezeigt.

Für ein eigenes Gebiet außerhalb der Insel vor dem Ausflug **Gebiet offline laden** verwenden. Die Werkstatt lädt OSM-Rohdaten über Overpass und speichert sie lokal in IndexedDB. Anschließend ohne Netz prüfen. Das Herunterladen braucht Internet; Erfassen und Bearbeiten danach nicht.

`npm run build` vergleicht die Karten-Metadaten mit den gewünschten Grenzen. Nur bei einem geänderten Ausschnitt werden die OSM-Daten erneut geladen. Ein Netzfehler bricht den Build ab, damit keine falsche Karte veröffentlicht wird. Manuelle Aktualisierung: `npm run map:download`. Die erzeugte GeoJSON-Datei samt Metadaten mit committen. Die ganze Insel liegt unter `public/regions/tenerife.geojson`; kleinere automatisch erzeugte Karten unter `public/map.geojson`.

Der Export aus der Werkstatt enthält die Konfiguration. Die endgültige Spielkarte wird am Computer oder im GitHub-Workflow passend dazu vorbereitet. Lokal gespeicherte Entwürfe und Zusatzkarten werden dadurch nicht automatisch veröffentlicht.

## Offline-Paket und Datenquellen

Der Service Worker speichert alle Build-Dateien einschließlich Konfiguration, Karte, Editor, QR-Decoder, Icons und Manifest vorab in einem versionierten Cache. Die Schriften DM Sans und Fraunces werden lokal mitgeliefert und ebenfalls offline gespeichert; ihre SIL-Lizenzen liegen unter `public/licenses/`. Keine externen Schriftanfragen, CDN-Skripte oder nachgeladenen Kartentiles werden benötigt. Installation wird erst nach erfolgreicher Speicherung aller Dateien aktiviert. Fortschritt und Entwürfe liegen unabhängig davon in `localStorage` und bleiben bei App-Updates erhalten.

Die Karte ist eine lokale Vektordarstellung aus OpenStreetMap-Rohdaten (ODbL). Es werden keine Tiles von `tile.openstreetmap.org` heruntergeladen; dessen [Tile-Nutzungsregeln](https://operations.osmfoundation.org/policies/tiles/) erlauben keine solchen Offline-Vorräte. Datenquelle: [Overpass API](https://wiki.openstreetmap.org/wiki/Overpass_API). Attribution und Lizenz: [OpenStreetMap-Mitwirkende / ODbL](https://www.openstreetmap.org/copyright). Die stilisierten Baumsymbole sind Dekoration und keine vermessenen Einzelbäume.

Das mitgelieferte Beispiel ist **Las Raíces bei La Esperanza, Teneriffa**. Stationen, Verstecke und Aufgaben sind ein austauschbares Beispiel, keine vor Ort geprüfte Route. Vor eurem Geburtstag entsprechend vorbereiten.

## Tests

```sh
npm test
npx playwright install chromium
npm run build
npm run test:e2e
```

Logiktests decken QR-Zuordnung, unveränderliche Pool-Codes, Exportreihenfolge, unbenutzte Codes, GPS-Prüfung, Kartengrenzen, Timer, Gruppen, Stationssichtbarkeit und Routenlücken ab. Browsertests prüfen den Offline-Neustart, den kompletten Spielablauf, echten QR-Pixel-Decode über eine simulierte Kamera, GPS-Erfassung mit simuliertem Standort, verweigerte Berechtigungen, Admin-Export, Feldmodus, Vorratserweiterung, Stationsreihenfolge, Rettungssicherung, Urkunden, Bildschirm-Wachhalten und mobile Darstellung. Vor dem Einsatz einmal zusätzlich Kamera, Druck und Offline-GPS auf dem tatsächlichen Tablet prüfen.
