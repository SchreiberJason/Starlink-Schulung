/**
 * Helferline – Quiz-Endpunkt für Google Sheets
 * =================================================
 * Nimmt Quiz-Antworten per POST entgegen und schreibt sie in das Tabellenblatt.
 *
 * NEU in dieser Version:
 *  - eine eigene Registerkarte (Tab) PRO QUIZ (Name = Modul)
 *  - eine Spalte PRO FRAGE (Antwort des Technikers, mit ✓ / ✗)
 *  - Spalten für die benötigte Zeit (Sekunden + mm:ss)
 *
 * EINRICHTUNG / AKTUALISIERUNG
 * 1. Erweiterungen -> Apps Script. Den GESAMTEN bisherigen Code löschen
 *    und diesen hier einfügen, speichern.
 * 2. Bereitstellen -> Bereitstellungen verwalten -> ✏️ Bearbeiten
 *    -> Version: "Neue Version" -> Bereitstellen. (Die /exec-URL bleibt gleich.)
 *    Zugriff durch: "Alle" / Ausführen als: "Ich".
 * 3. Die alten Test-Zeilen/Tabs kannst du löschen. Neue Tabs + Kopfzeilen
 *    legt das Script bei der ersten Einsendung je Quiz automatisch an.
 */

// Optionaler Schutz gegen Fremd-POSTs. Leer lassen = kein Check.
var SECRET = "";

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);   // verhindert Schreibkonflikte bei gleichzeitigen Einsendungen

    var data = JSON.parse(e.postData.contents);
    if (SECRET && data.secret !== SECRET) {
      return out({ ok: false, error: "unauthorized" });
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tabName = sanitizeTabName(data.module || "Antworten");
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);

    var answers = data.answers || [];

    var base = ["Zeitstempel", "Modul", "WorkerUUID", "TaskUUID", "FlowUUID", "CompanyUUID",
                "Punktzahl", "Gesamt", "Prozent", "Bestanden", "Dauer (Sek.)", "Dauer (mm:ss)"];

    // Kopfzeile beim ersten Schreiben anlegen: feste Spalten + eine Spalte je Frage
    if (sheet.getLastRow() === 0) {
      var qHeaders = answers.map(function (a, i) { return "F" + (i + 1) + ": " + (a.q || ""); });
      sheet.appendRow(base.concat(qHeaders));
      sheet.setFrozenRows(1);
    }

    var row = [
      new Date(),
      data.module || "",
      data.workerUuid || "",
      data.taskUuid || "",
      data.flowUuid || "",
      data.companyUuid || "",
      data.score != null ? data.score : "",
      data.total != null ? data.total : "",
      data.percent != null ? data.percent : "",
      data.passed ? "ja" : "nein",
      data.durationSec != null ? data.durationSec : "",
      data.duration || ""
    ];
    // je Frage eine Spalte: gegebene Antwort, mit ✓ (richtig) bzw. ✗ (falsch)
    var answerCells = answers.map(function (a) {
      return (a.ok ? "✓ " : "✗ ") + (a.given || "");
    });

    sheet.appendRow(row.concat(answerCells));
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Tab-Namen für Google Sheets bereinigen (verbotene Zeichen, max. 100 Zeichen)
function sanitizeTabName(name) {
  return String(name).replace(/[:\\\/?*\[\]]/g, " ").trim().substring(0, 99) || "Antworten";
}
