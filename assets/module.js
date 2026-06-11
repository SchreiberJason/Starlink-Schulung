/* =========================================================
   Helferline – gemeinsame Modul-Logik
   - mehrstufiger Ablauf (Schritte) in einem iframe
   - HTML5-Video & YouTube-Video: anschaupflichtig, kein Vorspulen, Timer
   - Weiter-Button je Videoschritt erst nach vollständigem Ansehen
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
  function initVideo(player, step){
    var vid   = player.querySelector("video");
    var big   = player.querySelector(".bigplay");
    var pp    = player.querySelector(".pp");
    var vfill = player.querySelector(".vtrack > i");
    var vtime = player.querySelector(".vtime");
    var hint  = hintFn(player.querySelector(".vhint"));
    var note  = step.querySelector(".watchnote");
    var maxT  = 0;

    function update(){
      var d = vid.duration || 0;
      vfill.style.width = d ? (vid.currentTime/d*100)+"%" : "0%";
      vtime.textContent = fmt(vid.currentTime) + " / " + fmt(d);
    }
    function toggle(){ if(vid.paused) vid.play(); else vid.pause(); }

    vid.addEventListener("timeupdate", function(){
      if(vid.currentTime > maxT + 0.5){ vid.currentTime = maxT; hint(); }
      else if(vid.currentTime > maxT){ maxT = vid.currentTime; }
      update();
    });
    vid.addEventListener("seeking", function(){
      if(vid.currentTime > maxT + 0.5){ vid.currentTime = maxT; hint(); }
    });
    vid.addEventListener("loadedmetadata", update);
    big.addEventListener("click", toggle);
    pp.addEventListener("click", toggle);
    vid.addEventListener("play",  function(){ big.classList.add("hide"); setIcon(pp, true); });
    vid.addEventListener("pause", function(){ if(!vid.ended) big.classList.remove("hide"); setIcon(pp, false); });
    vid.addEventListener("keydown", function(e){
      if(e.key===" " || e.key==="k"){ e.preventDefault(); toggle(); } else { e.preventDefault(); }
    });
    vid.addEventListener("ended", function(){
      big.classList.remove("hide"); setIcon(pp, false);
      markWatched(player, note);
    });

    player._pause = function(){ if(!vid.paused) vid.pause(); };
    update();
  }

  /* ---------- YouTube-Video (gleiche Regeln über die IFrame-API) ---------- */
  var ytQueue = [];
  function queueYouTube(player, step){ ytQueue.push({ player:player, step:step }); }

  function buildYouTube(item){
    var player = item.player, step = item.step;
    var mount  = player.querySelector(".ytmount");
    var big    = player.querySelector(".bigplay");
    var pp     = player.querySelector(".pp");
    var vfill  = player.querySelector(".vtrack > i");
    var vtime  = player.querySelector(".vtime");
    var hint   = hintFn(player.querySelector(".vhint"));
    var note   = step.querySelector(".watchnote");
    var maxT=0, dur=0, poll=null, ended=false;

    var yp = new YT.Player(mount, {
      videoId: player.getAttribute("data-yt"),
      playerVars: { controls:0, disablekb:1, modestbranding:1, rel:0, playsinline:1, fs:0, iv_load_policy:3 },
      events: {
        onReady: function(){ dur = yp.getDuration() || 0; update(); },
        onStateChange: function(e){
          if(e.data === YT.PlayerState.PLAYING){ big.classList.add("hide"); setIcon(pp, true); startPoll(); }
          else if(e.data === YT.PlayerState.PAUSED){ if(!ended) big.classList.remove("hide"); setIcon(pp, false); stopPoll(); }
          else if(e.data === YT.PlayerState.ENDED){
            ended = true; big.classList.remove("hide"); setIcon(pp, false); stopPoll();
            markWatched(player, note); update();
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
        else if(cur > maxT){ maxT = cur; }
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
    update();
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
  steps.forEach(function(s){
    var p = s.querySelector(".player");
    if(!p) return;
    if(p.classList.contains("yt")) queueYouTube(p, s);
    else initVideo(p, s);
  });

  if(ytQueue.length){
    window.onYouTubeIframeAPIReady = function(){ ytQueue.forEach(buildYouTube); };
    var tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  }

  render();
})();
