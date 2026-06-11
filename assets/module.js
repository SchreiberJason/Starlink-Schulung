/* =========================================================
   Helferline – gemeinsame Modul-Logik
   - mehrstufiger Ablauf (Schritte) in einem iframe
   - HTML5- & YouTube-Video: anschaupflichtig, kein Vorspulen, Timer
   - Weiter-Button je Videoschritt erst nach vollständigem Ansehen
   - Fortschritt wird gespeichert (localStorage): Schritt + Videoposition
     -> Techniker kann später dort weitermachen, wo er aufgehört hat
   - sendet am Ende das Fountain "End event" per postMessage
   ========================================================= */
(function(){
  "use strict";

  var END_EVENT = new URLSearchParams(location.search).get("endEvent") || "videoCompleted";

  var steps = Array.prototype.slice.call(document.querySelectorAll("[data-step]"));
  if(!steps.length) return;
  var TOTAL = steps.length, i = 0;

  var prev    = document.getElementById("prev");
  var next    = document.getElementById("next");
  var nextLbl = document.getElementById("nextLbl");
  var curEl   = document.getElementById("cur");
  var fill    = document.getElementById("fill");
  var totalEl = document.getElementById("total");
  if(totalEl) totalEl.textContent = TOTAL;

  var PLAY  = "M8 5v14l11-7z";
  var PAUSE = "M6 5h4v14H6zM14 5h4v14h-4z";
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  var FS_OPEN  = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
  var FS_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8V5a1 1 0 0 1 1-1h3M20 8V5a1 1 0 0 0-1-1h-3M4 16v3a1 1 0 0 0 1 1h3M20 16v3a1 1 0 0 1-1 1h-3"/></svg>';

  function fsActive(){ return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement; }
  function addFullscreen(player, getVid){
    var vbar = player.querySelector(".vbar");
    if(!vbar) return;
    var btn = document.createElement("button");
    btn.className = "fs"; btn.type = "button";
    btn.setAttribute("aria-label", "Vollbild");
    btn.innerHTML = FS_OPEN;
    vbar.appendChild(btn);
    btn.addEventListener("click", function(){
      if(fsActive()){
        (document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen || function(){}).call(document);
      } else if(player.requestFullscreen){ player.requestFullscreen(); }
      else if(player.webkitRequestFullscreen){ player.webkitRequestFullscreen(); }
      else if(player.msRequestFullscreen){ player.msRequestFullscreen(); }
      else { var v = getVid && getVid(); if(v && v.webkitEnterFullscreen) v.webkitEnterFullscreen(); }  // iOS-Fallback
    });
    function sync(){ btn.innerHTML = fsActive() ? FS_CLOSE : FS_OPEN; }
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
  }

  /* ---------- Fortschritt speichern / laden ---------- */
  var KEY = "hl-progress:" + location.pathname;
  var store = (function(){ try{ return JSON.parse(localStorage.getItem(KEY)) || {}; }catch(e){ return {}; } })();
  if(!store.vids) store.vids = {};
  var saveTimer = null;
  function persist(){ try{ localStorage.setItem(KEY, JSON.stringify(store)); }catch(e){} }
  function persistSoon(){ clearTimeout(saveTimer); saveTimer = setTimeout(persist, 400); }
  function saveVid(idx, t, w){
    store.vids[idx] = { t: Math.floor(t||0), w: w?1:0 };
    persistSoon();
  }
  window.addEventListener("pagehide", persist);
  document.addEventListener("visibilitychange", function(){ if(document.hidden) persist(); });

  function fmt(s){
    if(!isFinite(s) || s<0) s=0;
    var m=Math.floor(s/60), r=Math.floor(s%60);
    return (m<10?"0":"")+m+":"+(r<10?"0":"")+r;
  }
  function markWatched(player, note){
    player.dataset.watched = "1";
    if(note){
      note.classList.add("done");
      var dot=note.querySelector(".dot"), t=note.querySelector(".t");
      if(dot) dot.innerHTML = CHECK;
      if(t) t.textContent = "Video vollständig angesehen";
    }
    refreshNav();
  }
  function setIcon(pp, playing){
    var p = pp.querySelector("path");
    if(p) p.setAttribute("d", playing ? PAUSE : PLAY);
  }
  function hintFn(vhint){
    var timer=null;
    return function(){
      vhint.classList.add("show");
      clearTimeout(timer);
      timer=setTimeout(function(){ vhint.classList.remove("show"); }, 1600);
    };
  }

  /* ---------- HTML5-Video ---------- */
  function initVideo(player, step, idx){
    var vid   = player.querySelector("video");
    var big   = player.querySelector(".bigplay");
    var pp    = player.querySelector(".pp");
    var vfill = player.querySelector(".vtrack > i");
    var vtime = player.querySelector(".vtime");
    var hint  = hintFn(player.querySelector(".vhint"));
    var note  = step.querySelector(".watchnote");
    var rec   = store.vids[idx] || { t:0, w:0 };
    var maxT  = rec.t || 0;
    var done  = !!rec.w;

    function update(){
      var d = vid.duration || 0;
      vfill.style.width = d ? (vid.currentTime/d*100)+"%" : "0%";
      vtime.textContent = fmt(vid.currentTime) + " / " + fmt(d);
    }
    function toggle(){ if(vid.paused) vid.play(); else vid.pause(); }

    vid.addEventListener("loadedmetadata", function(){
      // an der zuletzt gesehenen Stelle fortsetzen
      if(!done && maxT > 1 && maxT < vid.duration - 0.5){ try{ vid.currentTime = maxT; }catch(e){} }
      update();
    });
    vid.addEventListener("timeupdate", function(){
      if(vid.currentTime > maxT + 0.5){ vid.currentTime = maxT; hint(); }
      else if(vid.currentTime > maxT){ maxT = vid.currentTime; saveVid(idx, maxT, done); }
      update();
    });
    vid.addEventListener("seeking", function(){
      if(vid.currentTime > maxT + 0.5){ vid.currentTime = maxT; hint(); }
    });
    big.addEventListener("click", toggle);
    pp.addEventListener("click", toggle);
    vid.addEventListener("play",  function(){ big.classList.add("hide"); setIcon(pp, true); });
    vid.addEventListener("pause", function(){ if(!vid.ended) big.classList.remove("hide"); setIcon(pp, false); persist(); });
    vid.addEventListener("keydown", function(e){
      if(e.key===" " || e.key==="k"){ e.preventDefault(); toggle(); } else { e.preventDefault(); }
    });
    vid.addEventListener("ended", function(){
      big.classList.remove("hide"); setIcon(pp, false);
      done = true; maxT = vid.duration || maxT;
      saveVid(idx, maxT, 1);
      markWatched(player, note);
    });

    player._pause = function(){ if(!vid.paused) vid.pause(); };
    addFullscreen(player, function(){ return vid; });
    if(done) markWatched(player, note);
    update();
  }

  /* ---------- YouTube-Video (gleiche Regeln über die IFrame-API) ---------- */
  var ytQueue = [];
  function queueYouTube(player, step, idx){ ytQueue.push({ player:player, step:step, idx:idx }); }

  function buildYouTube(item){
    var player = item.player, step = item.step, idx = item.idx;
    var mount  = player.querySelector(".ytmount");
    var big    = player.querySelector(".bigplay");
    var pp     = player.querySelector(".pp");
    var vfill  = player.querySelector(".vtrack > i");
    var vtime  = player.querySelector(".vtime");
    var hint   = hintFn(player.querySelector(".vhint"));
    var note   = step.querySelector(".watchnote");
    var rec    = store.vids[idx] || { t:0, w:0 };
    var maxT   = rec.t || 0, done = !!rec.w;
    var dur=0, poll=null;

    var yp = new YT.Player(mount, {
      videoId: player.getAttribute("data-yt"),
      playerVars: { controls:0, disablekb:1, modestbranding:1, rel:0, playsinline:1, fs:0, iv_load_policy:3 },
      events: {
        onReady: function(){
          dur = yp.getDuration() || 0;
          if(!done && maxT > 1){ try{ yp.seekTo(maxT, true); }catch(e){} }
          if(done) markWatched(player, note);
          update();
        },
        onStateChange: function(e){
          if(e.data === YT.PlayerState.PLAYING){ big.classList.add("hide"); setIcon(pp, true); startPoll(); }
          else if(e.data === YT.PlayerState.PAUSED){ if(!done) big.classList.remove("hide"); setIcon(pp, false); stopPoll(); persist(); }
          else if(e.data === YT.PlayerState.ENDED){
            done = true; big.classList.remove("hide"); setIcon(pp, false); stopPoll();
            saveVid(idx, dur, 1); markWatched(player, note); update();
          }
        }
      }
    });

    function update(){
      var cur = (yp && yp.getCurrentTime) ? (yp.getCurrentTime()||0) : 0;
      if(!dur && yp.getDuration) dur = yp.getDuration() || 0;
      vfill.style.width = dur ? (cur/dur*100)+"%" : "0%";
      vtime.textContent = fmt(cur) + " / " + fmt(dur);
    }
    function startPoll(){
      stopPoll();
      poll = setInterval(function(){
        var cur = yp.getCurrentTime() || 0;
        if(cur > maxT + 1.2){ yp.seekTo(maxT, true); hint(); }   // Vorspulen unterbinden
        else if(cur > maxT){ maxT = cur; saveVid(idx, maxT, done); }
        update();
      }, 250);
    }
    function stopPoll(){ if(poll){ clearInterval(poll); poll = null; } }
    function toggle(){
      var st = yp.getPlayerState();
      if(st === YT.PlayerState.PLAYING) yp.pauseVideo(); else yp.playVideo();
    }
    big.addEventListener("click", toggle);
    pp.addEventListener("click", toggle);
    player._pause = function(){ try{ yp.pauseVideo(); }catch(e){} };
    addFullscreen(player, null);
    update();
  }

  /* ---------- Folien-Viewer (nicht anschaupflichtig) ---------- */
  function initSlides(el){
    var base  = el.getAttribute("data-base");
    var count = parseInt(el.getAttribute("data-count"), 10) || 0;
    var stage = el.querySelector(".sstage");
    var curB  = el.querySelector(".scur");
    var prevB = el.querySelector('.snav[data-dir="-1"]');
    var nextB = el.querySelector('.snav[data-dir="1"]');
    if(!count || !stage || !prevB || !nextB) return;
    var imgs = [], idx = 1;

    function path(n){ return base + (n<10?"0":"") + n + ".jpg"; }
    function getImg(n){
      if(imgs[n]) return imgs[n];
      var im = new Image(); im.alt = "Folie " + n + " von " + count; im.draggable = false;
      im.src = path(n); stage.appendChild(im); imgs[n] = im; return im;
    }
    function show(n){
      n = Math.min(count, Math.max(1, n)); idx = n;
      var im = getImg(n);
      stage.classList.toggle("loading", !im.complete);
      if(!im.complete) im.addEventListener("load", function(){ if(idx===n) stage.classList.remove("loading"); }, { once:true });
      for(var k=1;k<=count;k++){ if(imgs[k]) imgs[k].classList.toggle("active", k===n); }
      im.classList.add("active");
      if(n<count) getImg(n+1);
      if(n>1)     getImg(n-1);
      if(curB) curB.textContent = n;
      prevB.disabled = (n===1); nextB.disabled = (n===count);
    }
    prevB.addEventListener("click", function(){ show(idx-1); });
    nextB.addEventListener("click", function(){ show(idx+1); });

    var sx=0, sy=0, tr=false;
    stage.addEventListener("touchstart", function(e){ if(e.touches.length!==1) return; sx=e.touches[0].clientX; sy=e.touches[0].clientY; tr=true; }, { passive:true });
    stage.addEventListener("touchend", function(e){
      if(!tr) return; tr=false;
      var t=e.changedTouches[0], dx=t.clientX-sx, dy=t.clientY-sy;
      if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.4){ show(dx<0?idx+1:idx-1); }
    }, { passive:true });
    document.addEventListener("keydown", function(e){
      if(el.offsetParent === null) return;            // nur wenn dieser Schritt sichtbar ist
      if(e.key==="ArrowRight"){ show(idx+1); } else if(e.key==="ArrowLeft"){ show(idx-1); }
    });
    show(1);
  }

  /* ---------- Navigation ---------- */
  function stepReady(step){
    var p = step.querySelector(".player");
    return p ? p.dataset.watched === "1" : true;   // ohne Video: immer bereit
  }
  function pauseAll(){
    steps.forEach(function(s){ var p=s.querySelector(".player"); if(p && p._pause) p._pause(); });
  }
  function refreshNav(){ if(next) next.disabled = !stepReady(steps[i]); }

  function render(){
    steps.forEach(function(s,n){ s.classList.toggle("active", n===i); });
    if(curEl) curEl.textContent = i+1;
    if(fill)  fill.style.width = ((i+1)/TOTAL*100) + "%";
    if(prev)  prev.disabled = (i===0);
    if(nextLbl) nextLbl.textContent = (i===TOTAL-1) ? "Aufgabe abschließen" : "Weiter";
    refreshNav();
    store.step = i; persistSoon();
    window.scrollTo({ top:0, behavior:"smooth" });
  }

  function notifyFountain(){
    var p = window.parent; if(!p) return;
    try{ p.postMessage(END_EVENT, "*"); }catch(e){}
    try{ p.postMessage({ event: END_EVENT }, "*"); }catch(e){}
    try{ p.postMessage({ type:  END_EVENT }, "*"); }catch(e){}
    try{ p.postMessage({ name:  END_EVENT }, "*"); }catch(e){}
    try{ p.postMessage(JSON.stringify({ event: END_EVENT }), "*"); }catch(e){}
  }

  if(prev) prev.addEventListener("click", function(){ if(i>0){ pauseAll(); i--; render(); } });
  if(next) next.addEventListener("click", function(){
    if(next.disabled) return;
    if(i < TOTAL-1){ pauseAll(); i++; render(); }
    else { pauseAll(); notifyFountain(); next.disabled = true; if(nextLbl) nextLbl.textContent = "Abgeschlossen ✓"; }
  });

  /* ---------- Init ---------- */
  steps.forEach(function(s, idx){
    var p = s.querySelector(".player");
    if(p){
      if(p.classList.contains("yt")) queueYouTube(p, s, idx);
      else initVideo(p, s, idx);
    }
    var sl = s.querySelector(".slides");
    if(sl) initSlides(sl);
  });

  if(ytQueue.length){
    window.onYouTubeIframeAPIReady = function(){ ytQueue.forEach(buildYouTube); };
    var tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }

  // gespeicherten Schritt wiederherstellen
  if(typeof store.step === "number" && store.step >= 0 && store.step < TOTAL) i = store.step;
  render();
})();
