# Starlink-Schulung (iframe-Ansichten für Fountain)

Schlanke, responsive Schulungsansichten zum Einbetten in **Fountain Flows** per `<iframe>`.
Kein Header/Footer – nur der Inhalt. Quiz/Wissensüberprüfungen laufen in Fountain, nicht hier.
Markenfarbe: Helferline-Blau `#088bcc`.

## Struktur
```
/
├─ index.html        → Folien-Ansicht „Starlink-Installation Best Practices" (18 Folien)
├─ modul-1/          → Modul 1 (4 Schritte: Intro+Video, Kursanweisungen, Kursmenü, Was ist Starlink?+Video)
├─ modul-2/          → Modul 2, Teil 1 (Schnellstart-Video, App-Leitfaden (YouTube), Präsentation*)
├─ assets/
│   ├─ module.css     → gemeinsames Designsystem
│   └─ module.js      → gemeinsame Logik (Stepper, Video-/YouTube-Player, Fountain-Event)
├─ media/            → Videos
└─ slides/           → Folienbilder
```
\* Präsentation für Modul 2 / Schritt 3 ist aktuell Platzhalter (folgt).

Jedes Modul ist ein **eigener Link** und ein mehrstufiger Ablauf in einem iframe.

## Live-Links
| Ansicht | URL |
|---|---|
| Folien (Best Practices) | `https://schreiberjason.github.io/Starlink-Schulung/` |
| Modul 1 | `https://schreiberjason.github.io/Starlink-Schulung/modul-1/` |
| Modul 2 (Teil 1) | `https://schreiberjason.github.io/Starlink-Schulung/modul-2/` |

## In Fountain einbetten
HTML/Embed-Feld im Flow:
```html
<iframe src="https://schreiberjason.github.io/Starlink-Schulung/modul-2/"
        style="width:100%;height:820px;border:0;" loading="lazy"
        title="Modul 2 – Teil 1"></iframe>
```
**Wichtig (Abschluss-Signal):** In Fountain im Task das Feld **„End event"** auf `videoCompleted`
setzen und **„Hide Task Completed button"** aktivieren. Die Seite sendet dieses Event per
postMessage, sobald der Nutzer den letzten Schritt erreicht und „Aufgabe abschließen" klickt.
Anderer Event-Name? An die URL hängen: `…/modul-2/?endEvent=DEINNAME`.

## Funktionsweise der Module
- Mehrstufiger Ablauf mit „Zurück / Weiter" und Fortschrittsanzeige.
- **Videos sind anschaupflichtig:** kein Vorspulen (HTML5 **und** YouTube via IFrame-API),
  mitlaufender Timer; „Weiter" ist gesperrt, bis das Video vollständig gesehen wurde.
- Das Fountain-End-Event wird erst beim letzten Schritt („Aufgabe abschließen") gesendet.

## Neues Modul anlegen
1. Ordner `modul-N/` mit `index.html` anlegen (am einfachsten ein bestehendes Modul kopieren).
2. `../assets/module.css` und `../assets/module.js` einbinden – fertig.
3. Schritte als `<section class="step" data-step>…</section>`. `id="total"` auf die Schrittzahl setzen.
   - **HTML5-Video:** `<div class="player">…<video><source src="../media/…mp4"></video>…</div>` + `<div class="watchnote">…</div>`
   - **YouTube:** `<div class="player yt" data-yt="VIDEO_ID">…</div>` + `watchnote`
   - **Text/Übersicht/Präsentation:** beliebiger Inhalt, kein Player → Schritt ohne Ansehpflicht.
4. Commit + Push → GitHub Pages baut automatisch neu.

## Anpassen
- Farben/Stil zentral in `assets/module.css` unter `:root` (z. B. `--brand`).
