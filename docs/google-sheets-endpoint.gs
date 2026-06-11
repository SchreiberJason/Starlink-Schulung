/**
 * Helferline – Quiz-Endpunkt für Google Sheets
 * =================================================
 * Nimmt Quiz-Antworten per POST entgegen und schreibt eine Zeile in das Tabellenblatt "Antworten".
 *
 * EINRICHTUNG
 * 1. Neue Google-Tabelle anlegen: https://sheets.new  (z. B. "Starlink-Schulung – Quizantworten")
 * 2. Erweiterungen -> Apps Script. Den gesamten Inhalt dieser Datei einfügen, speichern.
 * 3. (Optional) SECRET unten setzen und im Quiz (window.QUIZ.secret) denselben Wert eintragen.
 * 4. Bereitstellen -> Neue Bereitstellung -> Typ "Web-App":
 *        Ausführen als:        Ich
 *        Zugriff durch:        Alle (auch anonym)
 *    Bereitstellen, Zugriff autorisieren.
 * 5. Die Web-App-URL (endet auf /exec) kopieren und mir geben bzw. in window.QUIZ.endpoint eintragen.
 */

// Optionaler Schutz gegen Fremd-POSTs. Leer lassen = kein Check.
var SECRET = "";

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);   // verhindert Schreibkonflikte bei gleichzeitigen Einsendungen

    var data = JSON.parse(e.postData.contents);
    if (SECRET && data.secret !== SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: "unauthorized" }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName("Antworten") || ss.insertSheet("Antworten");
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["Zeitstempel", "Modul", "WorkerUUID", "TaskUUID", "FlowUUID", "CompanyUUID",
                       "Punktzahl", "Gesamt", "Prozent", "Bestanden", "Antworten (JSON)"]);
    }
    sheet.appendRow([
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
      JSON.stringify(data.answers || [])
    ]);

    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}
