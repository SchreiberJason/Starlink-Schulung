/**
 * Helferline – Quiz-Endpunkt für Google Sheets  (doPost = schreiben, doGet = lesen)
 * =================================================================================
 * SCHREIBEN (doPost, vom Schulungs-iframe):
 *   - ein Tabellenblatt (Tab) PRO QUIZ (Name = Modul)
 *   - feste Spalten + EINE SPALTE PRO FRAGE; Wert = "✓ <Antwort>" / "✗ <Antwort>"
 *     (Häkchen = bestanden auf einen Blick; gegebene Antwort bleibt nachvollziehbar)
 *   - KEINE JSON-Spalte mehr, kein Task/Flow/Company (nur WorkerUUID wird gebraucht)
 *
 * LESEN (doGet, für Stardrop/n8n):
 *   GET <EXEC-URL>  -> { ok:true,
 *                       technicians:[{name,workeruuid,benutzer,passwort}],
 *                       antworten:[{modul,workeruuid,zeitstempel,prozent,bestanden,
 *                                   questions:[{q,given,ok}]}] }
 *   Stardrop ist damit vom Spaltenlayout entkoppelt.
 *
 * EINRICHTUNG:
 *   1. Erweiterungen -> Apps Script: GESAMTEN bisherigen Code durch diesen ersetzen, speichern.
 *   2. Bereitstellen -> Bereitstellungen verwalten -> ✏️ -> Version "Neue Version" -> Bereitstellen.
 *      (Die /exec-URL bleibt gleich.) Zugriff: "Alle" / Ausführen als: "Ich".
 *   3. Tab "Techniker" mit Kopfzeile: Name | WorkerUUID | Benutzer | Passwort
 *   4. SECRETS SETZEN (NICHT im Code – sonst lägen sie im öffentlichen Repo):
 *      Projekteinstellungen (Zahnrad) -> Script-Eigenschaften -> hinzufügen:
 *        READ_SECRET = <dein Lese-Secret>     (schützt das Auslesen der Technikerliste)
 *        CERT_SECRET = <dein Zertifikat-Secret>
 *      Beide müssen mit Uplinks .env übereinstimmen. Fehlt READ_SECRET, ist doGet OFFEN.
 */

// Secrets kommen aus den Script-Eigenschaften (privat, an dieses Apps-Script-Projekt gebunden),
// damit diese Datei secret-frei im öffentlichen Repo liegen kann.
var PROPS = PropertiesService.getScriptProperties();
var SECRET = PROPS.getProperty("WRITE_SECRET") || ""; // optional; leer = Schreiben offen (Schulung schreibt clientseitig)
var READ_SECRET = PROPS.getProperty("READ_SECRET") || ""; // Schutz für GET: ohne ?secret=… kein Auslesen
var CERT_SECRET = PROPS.getProperty("CERT_SECRET") || ""; // Schutz für action=certificate

// EIGENSTÄNDIGES Skript (direkt in Apps Script erstellt, NICHT aus dem Sheet heraus):
// das Ziel-Sheet muss per ID geöffnet werden, getActiveSpreadsheet() ist hier null.
// ID aus der Sheet-URL: .../spreadsheets/d/<SHEET_ID>/edit
// (Leer lassen NUR, wenn das Skript doch im Sheet gebunden ist – dann greift getActiveSpreadsheet.)
var SHEET_ID = "1ODdLgtjfy7Q9ueHoxZ5NP6nhA9IC1K1bpiZ2EoEKW_8";
function ss_() { return SHEET_ID ? SpreadsheetApp.openById(SHEET_ID) : SpreadsheetApp.getActiveSpreadsheet(); }

var BASE_COLS = ["Zeitstempel", "Modul", "WorkerUUID", "Punktzahl", "Gesamt", "Prozent", "Bestanden"];
var RESERVED_TAB = "Techniker"; // dieser Tab darf vom Quiz-Schreiben nicht angefasst werden

/* ----------------------------- SCHREIBEN ----------------------------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var data = JSON.parse(e.postData.contents);
    if (SECRET && data.secret !== SECRET) return jsonOut_({ ok: false, error: "unauthorized" });

    // Zertifikatspfad + Status schreiben – geschützt (nur Stardrop kennt CERT_SECRET)
    if (data.action === "certificate") {
      if (CERT_SECRET && data.secret !== CERT_SECRET) return jsonOut_({ ok: false, error: "unauthorized" });
      return saveCertificate_(data);
    }

    var ss = ss_();
    var tabName = sanitizeTabName_(data.module || "Antworten");
    // Der Techniker-Tab ist die einzige Name<->WorkerUUID-Zuordnung und darf vom (offenen)
    // Quiz-Schreiben NIE getroffen werden – sonst könnte man über module:"Techniker" Zeilen
    // einschleusen, die Uplink als echten Techniker behandelt. Nur syncTechniker_/saveCertificate_
    // (Letzteres CERT_SECRET-geschützt) dürfen dort schreiben.
    if (tabName.toLowerCase() === RESERVED_TAB.toLowerCase()) {
      return jsonOut_({ ok: false, error: "Tab '" + RESERVED_TAB + "' ist reserviert" });
    }
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    var answers = data.answers || [];

    // Kopfzeile beim ersten Schreiben: feste Spalten + eine Spalte je Frage
    if (sheet.getLastRow() === 0) {
      var qHeaders = answers.map(function (a, i) { return "F" + (i + 1) + ": " + (a.q || ""); });
      sheet.appendRow(BASE_COLS.concat(qHeaders));
      sheet.setFrozenRows(1);
    }

    var row = [
      new Date(),
      safe_(data.module || ""),
      safe_(data.workerUuid || ""),
      data.score != null ? data.score : "",
      data.total != null ? data.total : "",
      data.percent != null ? data.percent : "",
      data.passed ? "ja" : "nein"
    ];
    // je Frage eine Spalte: ✓ (richtig) / ✗ (falsch) + gegebene Antwort
    var answerCells = answers.map(function (a) { return (a.ok ? "✓ " : "✗ ") + (a.given || ""); });

    sheet.appendRow(row.concat(answerCells));
    syncTechniker_(); // neue, vollständige WorkerUUIDs in den Techniker-Tab übernehmen
    return jsonOut_({ ok: true });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

// Zertifikatspfad + Status "Erledigt" in den Techniker-Tab schreiben (Zeile per WorkerUUID)
function saveCertificate_(data) {
  var ss = ss_();
  var sheet = ss.getSheetByName("Techniker");
  if (!sheet) return jsonOut_({ ok: false, error: "Tab 'Techniker' fehlt" });
  var values = sheet.getDataRange().getValues();
  if (!values.length) return jsonOut_({ ok: false, error: "Techniker leer" });
  var header = values[0].map(function (h) { return String(h).trim().toLowerCase(); });
  var wuCol = header.indexOf("workeruuid");
  var certCol = header.indexOf("zertifikat");
  var statusCol = header.indexOf("status");
  if (wuCol < 0) return jsonOut_({ ok: false, error: "Spalte 'WorkerUUID' fehlt" });
  if (certCol < 0) { certCol = header.length; sheet.getRange(1, certCol + 1).setValue("Zertifikat"); header.push("zertifikat"); }
  if (statusCol < 0) { statusCol = header.length; sheet.getRange(1, statusCol + 1).setValue("Status"); header.push("status"); }
  var wu = String(data.workerUuid || "").trim();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][wuCol] || "").trim() === wu) {
      sheet.getRange(i + 1, certCol + 1).setValue(safe_(data.path || ""));
      sheet.getRange(i + 1, statusCol + 1).setValue("Erledigt"); // kompletter Durchlauf abgeschlossen
      return jsonOut_({ ok: true, row: i + 1 });
    }
  }
  return jsonOut_({ ok: false, error: "WorkerUUID nicht gefunden: " + wu });
}

// WorkerUUIDs erst in den Techniker-Tab übernehmen, wenn der Techniker das GANZE Quiz
// durch hat = ein BESTANDENER Versuch (Bestanden=ja) in JEDEM Quiz-Tab. Ein erster
// oder fehlgeschlagener Versuch zählt NICHT (sonst stünde die UUID schon ab Beginn drin).
// Nur die WorkerUUID wird gesetzt – den Namen ergänzt der Mensch, dann läuft der Prozess.
function syncTechniker_() {
  var ss = ss_();
  var tech = ss.getSheetByName("Techniker");
  if (!tech) return;
  var values = tech.getDataRange().getValues();
  var header = (values[0] || []).map(function (h) { return String(h).trim().toLowerCase(); });
  var wuCol = header.indexOf("workeruuid");
  if (wuCol < 0) return; // ohne WorkerUUID-Spalte nichts tun
  var existing = {};
  for (var i = 1; i < values.length; i++) { var w = String(values[i][wuCol] || "").trim(); if (w) existing[w] = true; }

  var modules = ss.getSheets().filter(function (s) { return s.getName() !== "Techniker"; });
  if (!modules.length) return;
  var seen = {};   // WorkerUUID -> in wie vielen Quiz-Tabs vorhanden
  var counted = 0; // nur Tabs mit Daten UND WorkerUUID-Spalte zählen zum Soll
  modules.forEach(function (sheet) {
    var v = sheet.getDataRange().getValues();
    if (v.length < 2) return;
    var h = v[0].map(function (x) { return String(x).trim().toLowerCase(); });
    var wc = h.indexOf("workeruuid");
    if (wc < 0) return;
    var bc = h.indexOf("bestanden");
    var pc = h.indexOf("prozent");
    counted++;
    var inThis = {};
    for (var r = 1; r < v.length; r++) {
      var w = String(v[r][wc] || "").trim();
      if (!w) continue;
      // nur ein BESTANDENER Versuch zählt als "Modul abgeschlossen"
      var passed = (bc >= 0)
        ? /^(ja|yes|true|bestanden)$/i.test(String(v[r][bc] || "").trim())
        : (pc >= 0 ? parseFloat(v[r][pc]) >= 70 : false);
      if (passed) inThis[w] = true;
    }
    Object.keys(inThis).forEach(function (w) { seen[w] = (seen[w] || 0) + 1; });
  });

  if (!counted) return;
  var total = counted; // ein leerer/fremder Tab blockiert nicht mehr den Auto-Eintrag
  Object.keys(seen).forEach(function (w) {
    if (seen[w] >= total && !existing[w]) { // in allen (gewerteten) Quiz-Tabs UND noch nicht im Techniker-Tab
      var row = []; for (var c = 0; c < header.length; c++) row.push("");
      row[wuCol] = w;
      tech.appendRow(row);
      existing[w] = true;
    }
  });
}

/* ------------------------------ LESEN -------------------------------- */
function doGet(e) {
  var p = (e && e.parameter) || {};
  if (READ_SECRET && p.secret !== READ_SECRET) return jsonOut_({ ok: false, error: "unauthorized" });
  if (p.tab) return jsonOut_({ ok: true, rows: readRaw_(p.tab) });
  return jsonOut_({ ok: true, technicians: readRaw_("Techniker"), antworten: readAnswers_() });
}

// Techniker-Tab (oder beliebiger Tab) als Objektzeilen (Header = Schlüssel, lowercase)
function readRaw_(name) {
  var sheet = ss_().getSheetByName(name);
  if (!sheet) return [];
  var values = sheet.getDataRange().getValues();
  if (!values.length) return [];
  var header = values.shift().map(function (h) { return String(h).trim().toLowerCase(); });
  return values.filter(function (r) { return r.join("").trim().length; }).map(function (r) {
    var o = {}; header.forEach(function (h, i) { o[h] = fmt_(r[i]); }); return o;
  });
}

// Alle Modul-Tabs (= alle außer "Techniker") strukturiert: Fragen aus den F-Spalten rekonstruieren
function readAnswers_() {
  var ss = ss_();
  var out = [];
  ss.getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (name === "Techniker") return;
    var values = sheet.getDataRange().getValues();
    if (values.length < 2) return;
    var header = values.shift();
    var idx = {}; // base-Spalten-Index
    header.forEach(function (h, i) { idx[String(h).trim().toLowerCase()] = i; });
    var qCols = []; // {i, q}
    header.forEach(function (h, i) {
      var hs = String(h);
      if (/^F\d+:\s*/.test(hs)) qCols.push({ i: i, q: hs.replace(/^F\d+:\s*/, "").trim() });
    });
    values.forEach(function (r) {
      if (!r.join("").trim().length) return;
      var questions = qCols.map(function (c) {
        var cell = String(r[c.i] || "");
        var ok = cell.indexOf("✓") === 0;
        var given = cell.replace(/^[✓✗]\s*/, "").trim();
        return { q: c.q, given: given, ok: ok };
      });
      out.push({
        modul: name,
        zeitstempel: fmt_(r[idx["zeitstempel"]]),
        workeruuid: r[idx["workeruuid"]] || "",
        prozent: r[idx["prozent"]] != null ? r[idx["prozent"]] : "",
        bestanden: r[idx["bestanden"]] || "",
        questions: questions
      });
    });
  });
  return out;
}

/* ----------------------------- Helfer -------------------------------- */
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fmt_(v) {
  return (v instanceof Date) ? Utilities.formatDate(v, Session.getScriptTimeZone(), "dd.MM.yyyy HH:mm:ss") : v;
}
function sanitizeTabName_(name) {
  return String(name).replace(/[:\\\/?*\[\]]/g, " ").trim().substring(0, 99) || "Antworten";
}
// Schutz vor Formel-Injection: Werte, die mit = + - @ beginnen, würden von Sheets als Formel
// ausgewertet, wenn man das Sheet öffnet (z.B. =IMPORTXML(...) zum Abgreifen anderer Tabs).
// Ein vorangestelltes ' macht den Inhalt zu reinem Text.
function safe_(v) {
  var s = String(v == null ? "" : v);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}
