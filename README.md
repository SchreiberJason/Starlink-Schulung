# Starlink-Schulung (iframe-Ansichten für Fountain)

Schlanke, responsive Schulungsansichten zum Einbetten in **Fountain Flows** per `<iframe>`.
Kein Header/Footer – nur der Inhalt. Quiz/Wissensüberprüfungen laufen in Fountain, nicht hier.
Markenfarbe: Helferline-Blau `#088bcc`.

## Struktur
```
/
├─ index.html        → Folien-Ansicht „Starlink-Installation Best Practices" (18 Folien)
├─ modul-1/          → Modul 1: Das Starlink-Zertifizierungsprogramm (Einführung + Video)
├─ assets/module.css → gemeinsames Designsystem für alle Module
├─ media/            → Videos
└─ slides/           → Folienbilder
```

Jedes Modul ist ein **eigener Link**. Ein neues Modul = neuer Ordner mit `index.html`,
der `../assets/module.css` einbindet → fertig.

## Live-Links
| Ansicht | URL |
|---|---|
| Folien (Best Practices) | `https://schreiberjason.github.io/Starlink-Schulung/` |
| Modul 1 | `https://schreiberjason.github.io/Starlink-Schulung/modul-1/` |

## In Fountain einbetten
HTML/Embed-Feld im Flow:
```html
<iframe src="https://schreiberjason.github.io/Starlink-Schulung/modul-1/"
        style="width:100%;height:760px;border:0;" loading="lazy"
        title="Modul 1 – Starlink-Zertifizierungsprogramm"></iframe>
```
`height` nach Bedarf anpassen – der Inhalt skaliert responsiv mit.

## Neues Modul anlegen (z. B. Modul 2)
1. Ordner `modul-2/` mit `index.html` anlegen (am einfachsten `modul-1/index.html` kopieren).
2. Label, Überschrift, Text, Video tauschen. Videos nach `media/` legen.
3. Mehrere Seiten in einem Modul: weitere `<section class="step" data-step>…</section>`
   einfügen – die Weiter/Zurück-Navigation erscheint automatisch.
4. Commit + Push → GitHub Pages baut automatisch neu. Neue URL: `…/modul-2/`.

## Anpassen
- Farben/Stil zentral in `assets/module.css` unter `:root` (z. B. `--brand`).
- Folien aktualisieren: `pdftoppm -jpeg -r 110 -jpegopt quality=82 "NEU.pdf" slides/slide`
  (bei abweichender Folienzahl `TOTAL` in `index.html` anpassen).
