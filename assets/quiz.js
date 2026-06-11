/* =========================================================
   Helferline – Quiz / Wissensüberprüfung (iframe)
   - liest Konfiguration aus window.QUIZ
   - speichert Antworten + Techniker-UUID per POST an Google Apps Script
   - Bestehensregel; optional Abschluss nur bei Bestehen
   - sendet bei Abschluss das Fountain "End event"

   Erwartetes window.QUIZ:
   {
     module: "Modul X – Wissensüberprüfung",
     endpoint: "https://script.google.com/macros/s/.../exec",  // leer => Demo-Modus
     secret: "optionaler-shared-secret",
     passPercent: 80,
     blockOnFail: true,
     endEvent: "videoCompleted",
     questions: [ { q:"…?", options:["A","B","C"], answer:1 }, … ]  // answer = Index der richtigen Option
   }
   ========================================================= */
(function(){
  "use strict";

  var cfg = window.QUIZ || {};
  var qs  = cfg.questions || [];
  var root = document.getElementById("quiz");
  if(!root || !qs.length) return;

  var params = new URLSearchParams(location.search);
  var ctx = {
    workerUuid:  params.get("wxWorkerUuid")       || "",
    taskUuid:    params.get("wxAssignedTaskUuid") || "",
    flowUuid:    params.get("wxTaskFlowUuid")     || "",
    companyUuid: params.get("wxCompanyUuid")      || ""
  };
  var END_EVENT   = cfg.endEvent || params.get("endEvent") || "videoCompleted";
  var passPercent = (typeof cfg.passPercent === "number") ? cfg.passPercent : 80;
  var blockOnFail = cfg.blockOnFail !== false;       // Standard: muss bestehen
  var demo = !cfg.endpoint || /PASTE|DEIN|EXAMPLE/i.test(cfg.endpoint);

  var chosen = []; for(var k=0;k<qs.length;k++) chosen.push(-1);
  var locked = false;

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }

  /* ---------- Aufbau ---------- */
  var html = "";
  qs.forEach(function(q, qi){
    html += '<div class="q" data-q="'+qi+'"><div class="qhead"><span class="qnum">'+(qi+1)+'</span><div class="qtext">'+esc(q.q)+'</div></div><div class="opts">';
    q.options.forEach(function(opt, oi){
      html += '<button type="button" class="opt" data-q="'+qi+'" data-o="'+oi+'"><span class="mark"></span><span class="otext">'+esc(opt)+'</span></button>';
    });
    html += '</div></div>';
  });
  html += '<div class="result" id="qresult" style="display:none"><div class="ic" id="qresIc"></div><div class="txt"><b id="qresTitle"></b><span id="qresSub"></span></div></div>';
  html += '<div class="quizbar"><span class="count" id="qcount"></span><button class="btn btn-primary" id="qsubmit" style="margin-left:auto">Antworten absenden</button><button class="btn btn-ghost" id="qfinish" style="display:none">Aufgabe abschließen <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></button><button class="btn btn-ghost" id="qretry" style="display:none">Erneut versuchen</button></div>';
  root.innerHTML = html;

  var submitBtn = document.getElementById("qsubmit");
  var finishBtn = document.getElementById("qfinish");
  var retryBtn  = document.getElementById("qretry");
  var countEl   = document.getElementById("qcount");
  var resBox    = document.getElementById("qresult");

  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function updateCount(){
    var done = chosen.filter(function(c){ return c>=0; }).length;
    countEl.textContent = done + " von " + qs.length + " beantwortet";
  }
  updateCount();

  /* ---------- Auswahl ---------- */
  root.addEventListener("click", function(e){
    if(locked) return;
    var opt = e.target.closest(".opt");
    if(!opt) return;
    var qi = +opt.getAttribute("data-q"), oi = +opt.getAttribute("data-o");
    chosen[qi] = oi;
    var group = opt.parentNode;
    Array.prototype.forEach.call(group.querySelectorAll(".opt"), function(b){ b.classList.toggle("sel", b===opt); });
    var card = root.querySelector('.q[data-q="'+qi+'"]'); if(card) card.classList.remove("missing");
    updateCount();
  });

  /* ---------- Absenden ---------- */
  submitBtn.addEventListener("click", function(){
    if(locked) return;
    // alle beantwortet?
    var firstMissing = -1;
    for(var i=0;i<qs.length;i++){
      var card = root.querySelector('.q[data-q="'+i+'"]');
      if(chosen[i] < 0){ card.classList.add("missing"); if(firstMissing<0) firstMissing=i; }
    }
    if(firstMissing >= 0){
      root.querySelector('.q[data-q="'+firstMissing+'"]').scrollIntoView({ behavior:"smooth", block:"center" });
      return;
    }

    // auswerten
    var correct = 0, answers = [];
    qs.forEach(function(q, qi){
      var ok = chosen[qi] === q.answer; if(ok) correct++;
      answers.push({ q:q.q, given:q.options[chosen[qi]], correct:q.options[q.answer], ok:ok });
      var group = root.querySelector('.q[data-q="'+qi+'"] .opts');
      group.classList.add("locked");
      Array.prototype.forEach.call(group.querySelectorAll(".opt"), function(b){
        var oi = +b.getAttribute("data-o");
        if(oi === q.answer) b.classList.add("correct");
        else if(oi === chosen[qi]) b.classList.add("wrong");
      });
    });
    locked = true;
    submitBtn.style.display = "none";

    var percent = Math.round(correct/qs.length*100);
    var passed = percent >= passPercent;

    // speichern
    send({
      module: cfg.module || document.title,
      workerUuid: ctx.workerUuid, taskUuid: ctx.taskUuid,
      flowUuid: ctx.flowUuid, companyUuid: ctx.companyUuid,
      score: correct, total: qs.length, percent: percent,
      passed: passed, answers: answers,
      secret: cfg.secret || "",
      ts: new Date().toISOString()
    });

    // Ergebnis anzeigen
    resBox.className = "result " + (passed ? "pass" : "fail");
    document.getElementById("qresIc").innerHTML = passed ? CHECK : CROSS;
    document.getElementById("qresTitle").textContent = passed
      ? ("Bestanden – " + percent + " %")
      : ("Nicht bestanden – " + percent + " %");
    document.getElementById("qresSub").textContent = passed
      ? (correct + " von " + qs.length + " richtig. Du kannst die Aufgabe jetzt abschließen.")
      : (correct + " von " + qs.length + " richtig. Mindestens " + passPercent + " % erforderlich.");
    resBox.style.display = "flex";
    resBox.scrollIntoView({ behavior:"smooth", block:"center" });

    if(passed || !blockOnFail){ finishBtn.style.display = ""; }
    else { retryBtn.style.display = ""; }
  });

  /* ---------- Erneut versuchen ---------- */
  retryBtn.addEventListener("click", function(){
    locked = false;
    for(var i=0;i<qs.length;i++) chosen[i] = -1;
    Array.prototype.forEach.call(root.querySelectorAll(".opts"), function(g){ g.classList.remove("locked"); });
    Array.prototype.forEach.call(root.querySelectorAll(".opt"), function(b){ b.classList.remove("sel","correct","wrong"); });
    resBox.style.display = "none";
    retryBtn.style.display = "none";
    submitBtn.style.display = "";
    updateCount();
    root.scrollIntoView({ behavior:"smooth", block:"start" });
  });

  /* ---------- Abschluss -> Fountain ---------- */
  finishBtn.addEventListener("click", function(){
    notifyFountain();
    finishBtn.disabled = true;
    finishBtn.textContent = "Abgeschlossen ✓";
  });
  function notifyFountain(){
    var p = window.parent; if(!p) return;
    try{ p.postMessage(END_EVENT, "*"); }catch(e){}
    try{ p.postMessage({ event: END_EVENT }, "*"); }catch(e){}
    try{ p.postMessage({ type:  END_EVENT }, "*"); }catch(e){}
    try{ p.postMessage({ name:  END_EVENT }, "*"); }catch(e){}
    try{ p.postMessage(JSON.stringify({ event: END_EVENT }), "*"); }catch(e){}
  }

  /* ---------- Übertragung ---------- */
  function send(payload){
    try{ localStorage.setItem("hl-quiz:"+location.pathname, JSON.stringify(payload)); }catch(e){}  // lokale Sicherung
    if(demo){ console.log("[Quiz-Demo] würde gesendet:", payload); return; }
    try{
      fetch(cfg.endpoint, {
        method: "POST",
        mode: "no-cors",                                  // Apps Script ohne CORS-Header
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      }).catch(function(){});
    }catch(e){}
  }
})();
