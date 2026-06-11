/* =========================================================
   Helferline – Quiz / Wissensüberprüfung
   - Single- und Multiple-Choice
   - speichert Antworten + Techniker-UUID per POST an Google Apps Script
   - Bestehensregel; optional Abschluss nur bei Bestehen
   - zwei Nutzungsarten:
     a) window.HLQuiz.init(container, cfg, onResult)  -> für Inline-Quiz in Modulen
     b) window.QUIZ + <div id="quiz">                 -> eigenständige Quiz-Seite

   Frageformat:
     Single: { q:"…?", options:["A","B","C"], answer:1 }            // answer = Index
     Multi:  { q:"…?", options:["A","B","C"], multi:true, answers:[1,2] }
   ========================================================= */
(function(){
  "use strict";

  // Standard-Endpunkt (Google Apps Script). Pro Quiz via cfg.endpoint überschreibbar.
  var DEFAULT_ENDPOINT = "https://script.google.com/macros/s/AKfycbwJnj_XXt99UN-mxhv0ld79nE1Z42A3TEC-X7wzYl9H9ZT1W6aUvG-gbPL5e1r8FM43/exec";

  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var CROSS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  function esc(s){ return String(s).replace(/[&<>"]/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]; }); }
  function shuffle(a){ for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i]; a[i]=a[j]; a[j]=t; } return a; }
  function nowMs(){ return (window.performance && performance.now) ? performance.now() : Date.now(); }
  function mmss(sec){ var m=Math.floor(sec/60), r=sec%60; return (m<10?"0":"")+m+":"+(r<10?"0":"")+r; }
  function eqSet(a,b){ if(a.length!==b.length) return false; for(var i=0;i<a.length;i++){ if(a[i]!==b[i]) return false; } return true; }
  function sortNum(arr){ return arr.slice().sort(function(a,b){ return a-b; }); }
  function context(){
    var p = new URLSearchParams(location.search);
    var low = {};
    p.forEach(function(v,k){ low[k.toLowerCase()] = v; });
    function g(name){ return p.get(name) || low[name.toLowerCase()] || ""; }
    return {
      workerUuid:  g("wxWorkerUuid"),
      taskUuid:    g("wxAssignedTaskUuid"),
      flowUuid:    g("wxTaskFlowUuid"),
      companyUuid: g("wxCompanyUuid")
    };
  }

  function initQuiz(root, cfg, onResult){
    var qs = cfg.questions || [];
    if(!root || !qs.length) return null;
    // Finale-Modus: zufällige Auswahl aus einem größeren Fragenpool
    if(cfg.pickRandom && cfg.pickRandom > 0 && cfg.pickRandom < qs.length){
      qs = shuffle(qs.slice()).slice(0, cfg.pickRandom);
    }
    var passPercent = (typeof cfg.passPercent === "number") ? cfg.passPercent : 100;
    var blockOnFail = cfg.blockOnFail !== false;
    var endpoint = cfg.endpoint || DEFAULT_ENDPOINT;
    var ctx = context();
    var chosen = qs.map(function(){ return []; });
    var locked = false;
    var startTs = null;   // Startzeit (sobald das Quiz sichtbar wird)
    function startTimer(){ if(startTs === null) startTs = nowMs(); }

    var html = "";
    qs.forEach(function(q, qi){
      var multi = !!q.multi;
      html += '<div class="q" data-q="'+qi+'"><div class="qhead"><span class="qnum">'+(qi+1)+'</span>'
           +  '<div class="qtext">'+esc(q.q)+(multi?' <span class="qmulti">(Mehrfachauswahl)</span>':'')+'</div></div>'
           +  '<div class="opts'+(multi?' multi':'')+'">';
      q.options.forEach(function(opt, oi){
        html += '<button type="button" class="opt" data-q="'+qi+'" data-o="'+oi+'"><span class="mark"></span><span class="otext">'+esc(opt)+'</span></button>';
      });
      html += '</div></div>';
    });
    html += '<div class="result" data-res style="display:none"><div class="ic" data-res-ic></div><div class="txt"><b data-res-title></b><span data-res-sub></span></div></div>';
    html += '<div class="quizbar"><span class="count" data-count></span><button type="button" class="btn btn-primary" data-submit style="margin-left:auto">Antworten absenden</button><button type="button" class="btn btn-ghost" data-retry style="display:none">Erneut versuchen</button></div>';
    root.innerHTML = html;

    var submitBtn = root.querySelector("[data-submit]");
    var retryBtn  = root.querySelector("[data-retry]");
    var countEl   = root.querySelector("[data-count]");
    var resBox    = root.querySelector("[data-res]");

    function answered(){ return chosen.filter(function(c){ return c.length>0; }).length; }
    function updateCount(){ countEl.textContent = answered() + " von " + qs.length + " beantwortet"; }
    updateCount();

    // Zeitmessung starten, sobald das Quiz erstmals sichtbar wird (auch in Modulen)
    if("IntersectionObserver" in window){
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(en){ if(en.isIntersecting){ startTimer(); io.disconnect(); } });
      });
      io.observe(root);
    } else {
      startTimer();
    }

    root.addEventListener("click", function(e){
      if(locked) return;
      var opt = e.target.closest(".opt"); if(!opt) return;
      var qi = +opt.getAttribute("data-q"), oi = +opt.getAttribute("data-o");
      if(qs[qi].multi){
        var pos = chosen[qi].indexOf(oi);
        if(pos>=0) chosen[qi].splice(pos,1); else chosen[qi].push(oi);
      } else {
        chosen[qi] = [oi];
      }
      var group = opt.parentNode;
      Array.prototype.forEach.call(group.querySelectorAll(".opt"), function(b){
        b.classList.toggle("sel", chosen[qi].indexOf(+b.getAttribute("data-o"))>=0);
      });
      root.querySelector('.q[data-q="'+qi+'"]').classList.remove("missing");
      updateCount();
    });

    submitBtn.addEventListener("click", function(){
      if(locked) return;
      var firstMissing = -1;
      for(var i=0;i<qs.length;i++){
        if(chosen[i].length===0){ root.querySelector('.q[data-q="'+i+'"]').classList.add("missing"); if(firstMissing<0) firstMissing=i; }
      }
      if(firstMissing>=0){ root.querySelector('.q[data-q="'+firstMissing+'"]').scrollIntoView({ behavior:"smooth", block:"center" }); return; }

      var correct = 0, answers = [];
      qs.forEach(function(q, qi){
        var correctArr = sortNum(q.multi ? (q.answers||[]) : [q.answer]);
        var ok = eqSet(sortNum(chosen[qi]), correctArr);
        if(ok) correct++;
        answers.push({
          q: q.q,
          given:   chosen[qi].map(function(i){ return q.options[i]; }).join(" | "),
          correct: correctArr.map(function(i){ return q.options[i]; }).join(" | "),
          ok: ok
        });
        var group = root.querySelector('.q[data-q="'+qi+'"] .opts');
        group.classList.add("locked");
        // Nur die EIGENE Auswahl markieren – die richtige Antwort wird NICHT verraten
        Array.prototype.forEach.call(group.querySelectorAll(".opt"), function(b){
          var bi = +b.getAttribute("data-o");
          if(chosen[qi].indexOf(bi) < 0) return;             // nicht gewählte Optionen unmarkiert lassen
          if(correctArr.indexOf(bi) >= 0) b.classList.add("correct");  // eigene Wahl war richtig
          else b.classList.add("wrong");                      // eigene Wahl war falsch
        });
      });
      locked = true; submitBtn.style.display = "none";

      var percent = Math.round(correct/qs.length*100);
      var passed = percent >= passPercent;
      var durationSec = startTs !== null ? Math.max(0, Math.round((nowMs()-startTs)/1000)) : 0;

      send({
        module: cfg.module || document.title,
        workerUuid: ctx.workerUuid, taskUuid: ctx.taskUuid, flowUuid: ctx.flowUuid, companyUuid: ctx.companyUuid,
        score: correct, total: qs.length, percent: percent, passed: passed,
        durationSec: durationSec, duration: mmss(durationSec),
        answers: answers, secret: cfg.secret || "", ts: new Date().toISOString()
      });

      resBox.className = "result " + (passed ? "pass" : "fail");
      root.querySelector("[data-res-ic]").innerHTML = passed ? CHECK : CROSS;
      root.querySelector("[data-res-title]").textContent = (passed ? "Bestanden – " : "Nicht bestanden – ") + percent + " %";
      root.querySelector("[data-res-sub]").textContent = passed
        ? (correct + " von " + qs.length + " richtig.")
        : (correct + " von " + qs.length + " richtig. " + (passPercent>=100 ? "Es müssen alle Fragen richtig sein." : ("Mindestens " + passPercent + " % erforderlich.")));
      resBox.style.display = "flex";
      resBox.scrollIntoView({ behavior:"smooth", block:"center" });

      var canProceed = passed || !blockOnFail;
      if(!canProceed) retryBtn.style.display = "";
      if(typeof onResult === "function") onResult(canProceed, { passed:passed, percent:percent, correct:correct, total:qs.length });
    });

    retryBtn.addEventListener("click", function(){
      locked = false;
      chosen = qs.map(function(){ return []; });
      Array.prototype.forEach.call(root.querySelectorAll(".opts"), function(g){ g.classList.remove("locked"); });
      Array.prototype.forEach.call(root.querySelectorAll(".opt"), function(b){ b.classList.remove("sel","correct","wrong"); });
      resBox.style.display = "none";
      retryBtn.style.display = "none";
      submitBtn.style.display = "";
      updateCount();
      if(typeof onResult === "function") onResult(false, { reset:true });
      root.scrollIntoView({ behavior:"smooth", block:"start" });
    });

    function send(payload){
      try{ localStorage.setItem("hl-quiz:" + location.pathname + ":" + (cfg.module||""), JSON.stringify(payload)); }catch(e){}
      if(!endpoint || /PASTE|EXAMPLE/i.test(endpoint)){ console.log("[Quiz-Demo] würde gesendet:", payload); return; }
      try{
        fetch(endpoint, { method:"POST", mode:"no-cors", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body: JSON.stringify(payload) }).catch(function(){});
      }catch(e){}
    }

    return { isLocked: function(){ return locked; } };
  }

  function notifyFountain(ev){
    var p = window.parent; if(!p) return;
    [ev, { event:ev }, { type:ev }, { name:ev }, JSON.stringify({ event:ev })].forEach(function(m){
      try{ p.postMessage(m, "*"); }catch(e){}
    });
  }

  window.HLQuiz = { init: initQuiz, notifyFountain: notifyFountain };

  /* ---------- Eigenständige Quiz-Seite (window.QUIZ + #quiz) ---------- */
  if(window.QUIZ && document.getElementById("quiz")){
    var root = document.getElementById("quiz");
    var END_EVENT = window.QUIZ.endEvent || new URLSearchParams(location.search).get("endEvent") || "videoCompleted";
    var finish = document.createElement("button");
    finish.className = "btn btn-primary"; finish.type = "button";
    finish.style.cssText = "display:none;margin-top:16px";
    finish.textContent = "Aufgabe abschließen";
    initQuiz(root, window.QUIZ, function(canProceed){ finish.style.display = canProceed ? "" : "none"; });
    root.appendChild(finish);
    finish.addEventListener("click", function(){ notifyFountain(END_EVENT); finish.disabled = true; finish.textContent = "Abgeschlossen ✓"; });
  }
})();
