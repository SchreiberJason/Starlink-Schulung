# Starlink-Installation – Schulung (iframe-Ansicht)

Schlanke, responsive Präsentations-Ansicht zum Einbetten in einen **Fountain Flow** per `<iframe>`.
Kein Header/Footer – nur die Folien + Download-Button. Das Quiz läuft in Fountain, nicht hier.

## Inhalt
- `index.html` – die eigenständige Ansicht (HTML/CSS/JS in einer Datei)
- `slides/` – die 18 Folien als Bilder (für schnelle, mobile Darstellung)
- `Starlink-Installation-Best-Practices.pdf` – Download-Datei für den Button
- `.nojekyll` – verhindert Jekyll-Verarbeitung auf GitHub Pages

## Auf GitHub Pages veröffentlichen
1. Repository auf GitHub anlegen und Inhalt pushen:
   ```bash
   git remote add origin https://github.com/<USER>/<REPO>.git
   git push -u origin main
   ```
2. Auf GitHub: **Settings → Pages → Source: Deploy from a branch**, Branch `main` / `/ (root)`.
3. Nach ein paar Minuten ist die Seite erreichbar unter:
   `https://<USER>.github.io/<REPO>/`

## In Fountain einbetten
Im Flow ein **Custom HTML / Embed**-Feld einfügen:
```html
<iframe
  src="https://<USER>.github.io/<REPO>/"
  style="width:100%; height:680px; border:0;"
  loading="lazy"
  title="Starlink-Installation – Schulung"></iframe>
```
Höhe (`height`) nach Bedarf anpassen – die Ansicht skaliert responsiv mit.

## Bedienung
- **Wischen** (Handy), **Pfeiltasten** (Desktop) oder die **Pfeil-Buttons** zum Blättern
- Fortschrittsbalken + Zähler zeigen die Position (z. B. `3 / 18`)
- **„Präsentation herunterladen (PDF)"** lädt die Originaldatei

## Anpassen
- Markenfarbe & Stil: oben in `index.html` unter `:root` (z. B. `--brand`)
- Folien aktualisieren: PDF neu rendern und `slides/` ersetzen:
  ```bash
  pdftoppm -jpeg -r 110 -jpegopt quality=82 "NEUE.pdf" slides/slide
  ```
  Bei abweichender Folienzahl `TOTAL` im `<script>` von `index.html` anpassen.
