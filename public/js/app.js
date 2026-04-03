/* Spinout — Client */
(function () {
  'use strict';

  var socket = io({ reconnection: true, reconnectionDelay: 1000, reconnectionAttempts: Infinity });

  // ── DOM refs ──
  var $ = function (id) { return document.getElementById(id); };
  var joinScreen       = $('joinScreen');
  var appScreen        = $('appScreen');
  var inputName        = $('inputName');
  var inputCode        = $('inputCode');
  var btnJoin          = $('btnJoin');
  var btnLeave         = $('btnLeave');
  var roomBadge        = $('roomBadge');
  var userCountEl      = $('userCount');
  var canvas           = $('rouletteCanvas');
  var ctx              = canvas.getContext('2d');
  var rouletteCenter   = $('rouletteCenter');
  var btnSpin          = $('btnSpin');
  var resultArea       = $('resultArea');
  var currentGameBar   = $('currentGameBar');
  var cgEmoji          = $('cgEmoji');
  var cgName           = $('cgName');
  var cgPlayer         = $('cgPlayer');
  var roundNum         = $('roundNum');
  var timerCard        = $('timerCard');
  var timerLabel       = $('timerLabel');
  var timerDisplay     = $('timerDisplay');
  var btnTimerStart    = $('btnTimerStart');
  var btnTimerPause    = $('btnTimerPause');
  var btnTimerReset    = $('btnTimerReset');
  var voteSection      = $('voteSection');
  var voteTitle        = $('voteTitle');
  var voteCountdownBar = $('voteCountdownBar');
  var voteCountdownFill= $('voteCountdownFill');
  var voteCountdownText= $('voteCountdownText');
  var voteBarContainer = $('voteBarContainer');
  var voteContinueBar  = $('voteContinueBar');
  var voteSwitchBar    = $('voteSwitchBar');
  var voteContinueCount= $('voteContinueCount');
  var voteSwitchCount  = $('voteSwitchCount');
  var btnVoteContinue  = $('btnVoteContinue');
  var btnVoteSwitch    = $('btnVoteSwitch');
  var voteActions      = $('voteActions');
  var voteTally        = $('voteTally');
  var voteReveal       = $('voteReveal');
  var addGameForm      = $('addGameForm');
  var gameList         = $('gameList');
  var gameCount        = $('gameCount');
  var btnResetPlayed   = $('btnResetPlayed');
  var btnClearGames    = $('btnClearGames');
  var cfgMinTime       = $('cfgMinTime');
  var cfgMaxTime       = $('cfgMaxTime');
  var cfgVoteInterval  = $('cfgVoteInterval');
  var cfgSessionName   = $('cfgSessionName');
  var btnSaveConfig    = $('btnSaveConfig');
  var entryCodeDisplay = $('entryCodeDisplay');
  var btnCopyLink      = $('btnCopyLink');
  var btnExportText    = $('btnExportText');
  var shareBox         = $('shareBox');
  var onlineList       = $('onlineList');
  var onlineBar        = $('onlineBar');
  var logList          = $('logList');
  var btnClearLog      = $('btnClearLog');
  var adminBadge       = $('adminBadge');
  var confettiCanvas   = $('confettiCanvas');
  var confettiCtx      = confettiCanvas.getContext('2d');

  // ── State ──
  var currentState = null;
  var currentRotation = 0;
  var spinning = false;
  var audioCtx = null;
  var myName = '';
  var roomCode = '';
  var isAdmin = false;
  var spinSoundNodes = [];
  var SPIN_DURATION = 10000; // 10 seconds

  var COLORS = [
    '#7c3aed', '#2563eb', '#0891b2', '#059669',
    '#ca8a04', '#dc2626', '#db2777', '#9333ea',
    '#4f46e5', '#0d9488', '#65a30d', '#ea580c',
  ];

  // ═══════════════════════════════════════════════════════
  //  AUDIO ENGINE
  // ═══════════════════════════════════════════════════════
  function getAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    return audioCtx;
  }

  function playTick(pitch) {
    try {
      var c = getAudio();
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.connect(g); g.connect(c.destination);
      osc.frequency.value = pitch || (800 + Math.random() * 400);
      osc.type = 'sine';
      g.gain.value = 0.1;
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + 0.06);
    } catch (_) {}
  }

  // Dramatic spin soundtrack — rising pitch drone
  function startSpinSound() {
    try {
      var c = getAudio();
      // Low rumble
      var osc1 = c.createOscillator();
      var g1 = c.createGain();
      osc1.connect(g1); g1.connect(c.destination);
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(80, c.currentTime);
      osc1.frequency.linearRampToValueAtTime(200, c.currentTime + SPIN_DURATION / 1000);
      g1.gain.setValueAtTime(0.04, c.currentTime);
      g1.gain.linearRampToValueAtTime(0.12, c.currentTime + SPIN_DURATION / 1000 * 0.7);
      g1.gain.linearRampToValueAtTime(0.02, c.currentTime + SPIN_DURATION / 1000);
      osc1.start(c.currentTime);
      osc1.stop(c.currentTime + SPIN_DURATION / 1000 + 0.5);

      // High tension
      var osc2 = c.createOscillator();
      var g2 = c.createGain();
      osc2.connect(g2); g2.connect(c.destination);
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(300, c.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(900, c.currentTime + SPIN_DURATION / 1000);
      g2.gain.setValueAtTime(0.0, c.currentTime);
      g2.gain.linearRampToValueAtTime(0.06, c.currentTime + SPIN_DURATION / 1000 * 0.5);
      g2.gain.linearRampToValueAtTime(0.1, c.currentTime + SPIN_DURATION / 1000 * 0.9);
      g2.gain.linearRampToValueAtTime(0.0, c.currentTime + SPIN_DURATION / 1000);
      osc2.start(c.currentTime);
      osc2.stop(c.currentTime + SPIN_DURATION / 1000 + 0.5);

      spinSoundNodes = [osc1, osc2, g1, g2];
    } catch (_) {}
  }

  function stopSpinSound() {
    spinSoundNodes.forEach(function (n) { try { n.disconnect(); } catch (_) {} });
    spinSoundNodes = [];
  }

  // Victory fanfare
  function playWin() {
    try {
      var c = getAudio();
      var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0];
      notes.forEach(function (freq, i) {
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.connect(g); g.connect(c.destination);
        osc.frequency.value = freq;
        osc.type = 'sine';
        g.gain.setValueAtTime(0.15, c.currentTime + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.12 + 0.4);
        osc.start(c.currentTime + i * 0.12);
        osc.stop(c.currentTime + i * 0.12 + 0.4);
      });
      // Bass hit
      var bassOsc = c.createOscillator();
      var bassG = c.createGain();
      bassOsc.connect(bassG); bassG.connect(c.destination);
      bassOsc.type = 'sine';
      bassOsc.frequency.value = 130.81;
      bassG.gain.setValueAtTime(0.2, c.currentTime + 0.6);
      bassG.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 1.5);
      bassOsc.start(c.currentTime + 0.6);
      bassOsc.stop(c.currentTime + 1.5);
    } catch (_) {}
  }

  // Timer alert — urgent beeping
  function playTimerAlert() {
    try {
      var c = getAudio();
      for (var i = 0; i < 6; i++) {
        var osc = c.createOscillator();
        var g = c.createGain();
        osc.connect(g); g.connect(c.destination);
        osc.frequency.value = i % 2 === 0 ? 880 : 660;
        osc.type = 'square';
        g.gain.setValueAtTime(0.08, c.currentTime + i * 0.25);
        g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + i * 0.25 + 0.2);
        osc.start(c.currentTime + i * 0.25);
        osc.stop(c.currentTime + i * 0.25 + 0.2);
      }
    } catch (_) {}
  }

  // Max time alarm — continuous siren
  function playMaxAlarm() {
    try {
      var c = getAudio();
      var osc = c.createOscillator();
      var g = c.createGain();
      osc.connect(g); g.connect(c.destination);
      osc.type = 'sawtooth';
      g.gain.value = 0.1;
      // Siren effect
      for (var i = 0; i < 8; i++) {
        osc.frequency.setValueAtTime(600, c.currentTime + i * 0.4);
        osc.frequency.linearRampToValueAtTime(900, c.currentTime + i * 0.4 + 0.2);
        osc.frequency.linearRampToValueAtTime(600, c.currentTime + i * 0.4 + 0.4);
      }
      g.gain.setValueAtTime(0.1, c.currentTime);
      g.gain.linearRampToValueAtTime(0.0, c.currentTime + 3.2);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + 3.2);
    } catch (_) {}
  }

  // ═══════════════════════════════════════════════════════
  //  CONFETTI
  // ═══════════════════════════════════════════════════════
  var confettiPieces = [];
  var confettiRunning = false;

  function resizeConfetti() {
    confettiCanvas.width = window.innerWidth;
    confettiCanvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeConfetti);
  resizeConfetti();

  function launchConfetti() {
    confettiPieces = [];
    var W = confettiCanvas.width;
    var H = confettiCanvas.height;
    var colors = ['#7c3aed', '#a855f7', '#22c55e', '#eab308', '#ef4444', '#3b82f6', '#ec4899', '#f97316', '#14b8a6', '#fff'];

    for (var i = 0; i < 200; i++) {
      confettiPieces.push({
        x: Math.random() * W,
        y: Math.random() * H * -1 - 50,
        w: 4 + Math.random() * 8,
        h: 6 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 5,
        rot: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        opacity: 1,
      });
    }

    confettiCanvas.style.display = 'block';
    if (!confettiRunning) {
      confettiRunning = true;
      animateConfetti();
    }
  }

  function animateConfetti() {
    var W = confettiCanvas.width;
    var H = confettiCanvas.height;
    confettiCtx.clearRect(0, 0, W, H);

    var alive = 0;
    confettiPieces.forEach(function (p) {
      if (p.opacity <= 0) return;
      alive++;
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12; // gravity
      p.rot += p.rotSpeed;
      p.vx *= 0.99;

      if (p.y > H - 20) {
        p.vy *= -0.3;
        p.opacity -= 0.02;
      }
      if (p.y > H + 100) p.opacity = 0;

      confettiCtx.save();
      confettiCtx.translate(p.x, p.y);
      confettiCtx.rotate(p.rot * Math.PI / 180);
      confettiCtx.globalAlpha = Math.max(0, p.opacity);
      confettiCtx.fillStyle = p.color;
      confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      confettiCtx.restore();
    });

    if (alive > 0) {
      requestAnimationFrame(animateConfetti);
    } else {
      confettiRunning = false;
      confettiCanvas.style.display = 'none';
      confettiCtx.clearRect(0, 0, W, H);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════
  function esc(str) { var d = document.createElement('div'); d.textContent = str; return d.innerHTML; }
  function show(el) { el.classList.remove('hidden'); }
  function hide(el) { el.classList.add('hidden'); }
  function pad2(n) { return String(n).padStart(2, '0'); }

  function setAdminUI(admin) {
    isAdmin = admin;
    // Show/hide admin-only controls
    var els = document.querySelectorAll('.admin-only');
    els.forEach(function (el) {
      if (admin) { el.classList.remove('disabled-control'); el.removeAttribute('disabled'); }
      else { el.classList.add('disabled-control'); el.setAttribute('disabled', 'disabled'); }
    });
    if (adminBadge) {
      adminBadge.textContent = admin ? 'HOST' : '';
      adminBadge.style.display = admin ? 'inline-block' : 'none';
    }
  }

  // ═══════════════════════════════════════════════════════
  //  JOIN / LEAVE / RECONNECT
  // ═══════════════════════════════════════════════════════
  btnJoin.addEventListener('click', function () {
    var name = inputName.value.trim();
    var code = inputCode.value.trim().toUpperCase();
    if (!code) { inputCode.focus(); return; }
    if (!name) { name = 'Anônimo'; }
    myName = name;
    roomCode = code;
    // Save to sessionStorage for reconnection
    sessionStorage.setItem('spinout_name', name);
    sessionStorage.setItem('spinout_room', code);
    socket.emit('join', { code: code, name: name });
  });

  [inputName, inputCode].forEach(function (el) {
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') btnJoin.click(); });
  });

  btnLeave.addEventListener('click', function () {
    sessionStorage.removeItem('spinout_name');
    sessionStorage.removeItem('spinout_room');
    location.reload();
  });

  // Auto-reconnect on socket reconnect
  socket.on('connect', function () {
    if (roomCode && myName) {
      socket.emit('join', { code: roomCode, name: myName });
    }
  });

  socket.on('joined', function (data) {
    hide(joinScreen);
    show(appScreen);
    roomBadge.textContent = data.code;
    entryCodeDisplay.textContent = data.code;
    setAdminUI(data.isAdmin);
  });

  // Auto-join if returning
  (function () {
    var savedName = sessionStorage.getItem('spinout_name');
    var savedRoom = sessionStorage.getItem('spinout_room');
    var params = new URLSearchParams(location.search);
    var urlRoom = params.get('room');

    if (urlRoom) inputCode.value = urlRoom.toUpperCase();
    if (savedName && savedRoom) {
      myName = savedName;
      roomCode = savedRoom;
      inputName.value = savedName;
      inputCode.value = savedRoom;
      socket.emit('join', { code: savedRoom, name: savedName });
    }
  })();

  // ═══════════════════════════════════════════════════════
  //  TABS
  // ═══════════════════════════════════════════════════════
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      $('tab-' + btn.dataset.tab).classList.add('active');
    });
  });

  // ═══════════════════════════════════════════════════════
  //  STATE SYNC
  // ═══════════════════════════════════════════════════════
  socket.on('state', function (s) {
    currentState = s;
    setAdminUI(s.isAdmin);
    renderGameList(s.games);
    renderCurrentGame(s);
    renderConfig(s.config);
    renderLog(s.log);
    renderOnline(s.users);
    renderVoteState(s);
    userCountEl.textContent = s.userCount + ' online';
    gameCount.textContent = s.games.length;

    if (s.currentGame) show(timerCard);

    // Render timer display from state (not just from ticks)
    renderTimerFromState(s);

    if (s.timer.running) {
      hide(btnTimerStart); show(btnTimerPause); show(btnTimerReset);
    } else if (s.timer.phase !== 'idle') {
      show(btnTimerStart); btnTimerStart.textContent = 'Retomar';
      hide(btnTimerPause); show(btnTimerReset);
    }

    if (!spinning) {
      var avail = s.games.filter(function (g) { return !g.played; });
      if (avail.length === 0) avail = s.games;
      drawRoulette(avail);
    }
  });

  // ═══════════════════════════════════════════════════════
  //  ROULETTE DRAW
  // ═══════════════════════════════════════════════════════
  function drawRoulette(games) {
    ctx.clearRect(0, 0, 640, 640);
    var n = games.length;
    var cx = 320, cy = 320, R = 310;

    if (n === 0) {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#94a3b8';
      ctx.font = '22px Inter, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('🎮 Adicione jogos', cx, cy);
      return;
    }

    var sliceAngle = (2 * Math.PI) / n;

    for (var i = 0; i < n; i++) {
      var startAngle = i * sliceAngle + currentRotation;
      var endAngle = startAngle + sliceAngle;
      var midAngle = startAngle + sliceAngle / 2;

      // Gradient fill per slice
      var gx = cx + Math.cos(midAngle) * R * 0.5;
      var gy = cy + Math.sin(midAngle) * R * 0.5;
      var grad = ctx.createRadialGradient(cx, cy, 30, gx, gy, R);
      var baseColor = COLORS[i % COLORS.length];
      grad.addColorStop(0, lightenColor(baseColor, 25));
      grad.addColorStop(1, baseColor);

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      // Slice border
      ctx.strokeStyle = 'rgba(0,0,0,.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Text with emoji + name
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(midAngle);
      ctx.fillStyle = '#fff';
      ctx.shadowColor = 'rgba(0,0,0,.5)';
      ctx.shadowBlur = 4;
      var fontSize = Math.min(20, Math.max(11, 180 / n));
      ctx.font = 'bold ' + fontSize + 'px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      var emoji = games[i].emoji || '';
      var lbl = games[i].name.length > 14 ? games[i].name.slice(0, 13) + '..' : games[i].name;
      var textR = R - 20;
      // Emoji closer to edge
      ctx.font = fontSize + 'px Inter, sans-serif';
      ctx.fillText(emoji, textR, 0);
      // Name slightly inward
      ctx.font = 'bold ' + fontSize + 'px Inter, sans-serif';
      ctx.fillText(lbl, textR - fontSize - 4, 0);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // Outer ring glow
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, .6)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Inner decorative ring
    ctx.beginPath();
    ctx.arc(cx, cy, R - 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,.08)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tick marks at slice boundaries
    for (var j = 0; j < n; j++) {
      var a = j * sliceAngle + currentRotation;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12));
      ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
      ctx.strokeStyle = 'rgba(255,255,255,.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }

  // Helper: lighten a hex color
  function lightenColor(hex, pct) {
    var num = parseInt(hex.replace('#', ''), 16);
    var r = Math.min(255, (num >> 16) + pct);
    var g = Math.min(255, ((num >> 8) & 0xff) + pct);
    var b = Math.min(255, (num & 0xff) + pct);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // ═══════════════════════════════════════════════════════
  //  SPIN — 10s dramatic animation
  // ═══════════════════════════════════════════════════════
  function doSpin() {
    if (spinning) return;
    socket.emit('spin');
  }

  btnSpin.addEventListener('click', doSpin);

  // Click on canvas or center to spin
  canvas.addEventListener('click', doSpin);
  rouletteCenter.style.cursor = 'pointer';
  rouletteCenter.addEventListener('click', doSpin);

  socket.on('spin:start', function (data) {
    if (spinning) return;
    spinning = true;
    btnSpin.disabled = true;
    hide(resultArea); hide(timerCard);

    startSpinSound();

    var games = data.games;
    var winner = games.find(function (g) { return g.id === data.winnerId; });
    var winnerIdx = games.indexOf(winner);
    var n = games.length;
    var sliceAngle = (2 * Math.PI) / n;

    var targetAngle = -Math.PI / 2 - (winnerIdx * sliceAngle + sliceAngle / 2);
    var fullSpins = 10 + Math.floor(Math.random() * 6);
    var totalRotation = fullSpins * 2 * Math.PI + (targetAngle - (currentRotation % (2 * Math.PI)));

    var startRot = currentRotation;
    var startTime = performance.now();
    var lastTickAngle = startRot;

    function animate(now) {
      var elapsed = now - startTime;
      var t = Math.min(elapsed / SPIN_DURATION, 1);

      // Custom easing: fast start, dramatic slowdown at end
      var ease;
      if (t < 0.3) {
        ease = t / 0.3 * 0.5; // accelerate to midpoint
      } else {
        var t2 = (t - 0.3) / 0.7;
        ease = 0.5 + 0.5 * (1 - Math.pow(1 - t2, 4)); // ease out quartic
      }

      currentRotation = startRot + totalRotation * ease;

      // Tick — more frequent at start, slower at end
      var tickThreshold = sliceAngle * (0.5 + t * 0.5);
      if (Math.abs(currentRotation - lastTickAngle) > tickThreshold) {
        playTick(600 + (1 - t) * 600 + Math.random() * 200);
        lastTickAngle = currentRotation;
      }

      drawRoulette(games);

      if (t < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  });

  socket.on('spin:result', function (data) {
    spinning = false;
    stopSpinSound();
    btnSpin.disabled = false;

    var w = data.winner;
    show(resultArea);
    var resultImg = w.image
      ? '<img class="result-img" src="' + esc(w.image) + '" alt="">'
      : '<div class="result-emoji">' + esc(w.emoji) + '</div>';
    resultArea.innerHTML =
      '<div class="result-display">' +
        resultImg +
        '<div class="rn">' + esc(w.name) + '</div>' +
        '<div class="rp">🎯 Escolha de ' + esc(w.player) + '</div>' +
      '</div>';

    rouletteCenter.textContent = '!';
    playWin();
    launchConfetti();
  });

  // ═══════════════════════════════════════════════════════
  //  TIMER
  // ═══════════════════════════════════════════════════════
  btnTimerStart.addEventListener('click', function () { socket.emit('timer:start'); });
  btnTimerPause.addEventListener('click', function () { socket.emit('timer:pause'); });
  btnTimerReset.addEventListener('click', function () { socket.emit('timer:reset'); });

  socket.on('timer:tick', function (data) {
    var sec = data.seconds;
    var phase = data.phase;
    if (!currentState) return;
    updateTimerDisplay(sec, phase);
  });

  function updateTimerDisplay(sec, phase) {
    if (!currentState) return;
    var minSec = currentState.config.minTime * 60;

    if (phase === 'min' || phase === 'idle') {
      var remaining = Math.max(0, minSec - sec);
      timerDisplay.textContent = pad2(Math.floor(remaining / 60)) + ':' + pad2(remaining % 60);
      timerLabel.textContent = 'TEMPO MINIMO';
      timerDisplay.className = 'timer-display' + (remaining < 300 ? ' warning' : '');
    } else if (phase === 'overtime') {
      var overtime = sec - minSec;
      timerDisplay.textContent = '+' + pad2(Math.floor(overtime / 60)) + ':' + pad2(overtime % 60);
      timerLabel.textContent = 'TEMPO EXTRA (max ' + currentState.config.maxTime + 'min)';
      timerDisplay.className = 'timer-display overtime';
    } else if (phase === 'ended') {
      timerLabel.textContent = 'TEMPO MAXIMO ATINGIDO';
      timerDisplay.className = 'timer-display ended';
    }
  }

  function renderTimerFromState(s) {
    updateTimerDisplay(s.timer.seconds, s.timer.phase);
  }

  socket.on('timer:alert', function (type) {
    if (type === 'maxReached') {
      playMaxAlarm();
    } else {
      playTimerAlert();
    }
  });

  // ═══════════════════════════════════════════════════════
  //  VOTES
  // ═══════════════════════════════════════════════════════
  var voteTotalDuration = 30;
  var hasVoted = false;

  btnVoteContinue.addEventListener('click', function () {
    if (hasVoted) return;
    hasVoted = true;
    socket.emit('vote', { choice: 'continue' });
    btnVoteContinue.classList.add('vote-selected');
    btnVoteSwitch.disabled = true;
  });

  btnVoteSwitch.addEventListener('click', function () {
    if (hasVoted) return;
    hasVoted = true;
    socket.emit('vote', { choice: 'switch' });
    btnVoteSwitch.classList.add('vote-selected');
    btnVoteContinue.disabled = true;
  });

  socket.on('vote:open', function (data) {
    hasVoted = false;
    voteTotalDuration = data.countdown;
    show(voteSection);
    show(voteCountdownBar);
    show(voteBarContainer);
    show(voteActions);
    hide(voteTally);
    hide(voteReveal);
    voteTitle.textContent = '\uD83D\uDDF3\uFE0F Votação — Continuar ou Trocar?';
    btnVoteContinue.disabled = false;
    btnVoteSwitch.disabled = false;
    btnVoteContinue.classList.remove('vote-selected');
    btnVoteSwitch.classList.remove('vote-selected');
    voteCountdownFill.style.width = '100%';
    voteCountdownText.textContent = data.countdown + 's';
    voteContinueCount.textContent = '0';
    voteSwitchCount.textContent = '0';
    voteContinueBar.style.width = '50%';
    voteSwitchBar.style.width = '50%';
    playTimerAlert();
  });

  socket.on('vote:countdown', function (data) {
    var pct = voteTotalDuration > 0 ? (data.remaining / voteTotalDuration) * 100 : 0;
    voteCountdownFill.style.width = pct + '%';
    voteCountdownText.textContent = data.remaining + 's';
    if (data.remaining <= 5) {
      voteCountdownBar.classList.add('vote-countdown-urgent');
    } else {
      voteCountdownBar.classList.remove('vote-countdown-urgent');
    }
  });

  socket.on('vote:update', function (tally) {
    updateVoteBars(tally);
  });

  socket.on('vote:tallying', function () {
    hide(voteActions);
    hide(voteCountdownBar);
    show(voteTally);
    voteTitle.textContent = '\uD83D\uDDF3\uFE0F Contando votos...';
  });

  socket.on('vote:result', function (data) {
    hide(voteTally);
    hide(voteActions);
    hide(voteCountdownBar);
    show(voteReveal);

    if (data.result === 'tie') {
      voteTitle.textContent = '\u2696\uFE0F Empate!';
      voteReveal.innerHTML =
        '<div class="vote-result-card tie">' +
          '<div class="vote-result-icon">\u2696\uFE0F</div>' +
          '<div class="vote-result-text">Empate! Nova votação em breve...</div>' +
        '</div>';
    } else if (data.result === 'switch') {
      voteTitle.textContent = '\uD83D\uDD04 Trocar de jogo!';
      voteReveal.innerHTML =
        '<div class="vote-result-card switch">' +
          '<div class="vote-result-icon">\uD83D\uDD04</div>' +
          '<div class="vote-result-text">Maioria votou para TROCAR!</div>' +
          '<div class="vote-result-sub">Faça um novo sorteio na roleta</div>' +
        '</div>';
      playMaxAlarm();
    } else {
      voteTitle.textContent = '\u2705 Continuar!';
      voteReveal.innerHTML =
        '<div class="vote-result-card continue">' +
          '<div class="vote-result-icon">\u2705</div>' +
          '<div class="vote-result-text">Maioria votou para CONTINUAR!</div>' +
        '</div>';
      playWin();
    }

    updateVoteBars(data.tally);
  });

  function updateVoteBars(tally) {
    var total = tally.continue + tally.switch;
    var contPct = total > 0 ? (tally.continue / total * 100) : 50;
    var swPct = total > 0 ? (tally.switch / total * 100) : 50;
    voteContinueBar.style.width = contPct + '%';
    voteSwitchBar.style.width = swPct + '%';
    voteContinueCount.textContent = tally.continue;
    voteSwitchCount.textContent = tally.switch;
  }

  function renderVoteState(s) {
    if (s.votePhase === 'none') {
      hide(voteSection);
      return;
    }
    show(voteSection);
    updateVoteBars(s.votes);
    if (s.votePhase === 'voting') {
      voteTitle.textContent = '\uD83D\uDDF3\uFE0F Votação — Continuar ou Trocar?';
      show(voteCountdownBar); show(voteBarContainer); show(voteActions);
      hide(voteTally); hide(voteReveal);
      var pct = voteTotalDuration > 0 ? (s.voteCountdown / voteTotalDuration) * 100 : 0;
      voteCountdownFill.style.width = pct + '%';
      voteCountdownText.textContent = s.voteCountdown + 's';
    } else if (s.votePhase === 'tallying') {
      voteTitle.textContent = '\uD83D\uDDF3\uFE0F Contando votos...';
      hide(voteCountdownBar); hide(voteActions); hide(voteReveal);
      show(voteTally);
    } else if (s.votePhase === 'result') {
      hide(voteCountdownBar); hide(voteActions); hide(voteTally);
      show(voteReveal);
    }
  }

  // ═══════════════════════════════════════════════════════
  //  GAMES
  // ═══════════════════════════════════════════════════════
  addGameForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = $('inputGameName').value.trim();
    var player = $('inputPlayerName').value.trim();
    var emoji = $('inputGameEmoji').value.trim() || '🎮';
    var image = $('inputGameImage').value.trim();
    if (!name) return;
    socket.emit('game:add', { name: name, player: player, emoji: emoji, image: image });
    addGameForm.reset();
  });

  btnResetPlayed.addEventListener('click', function () { socket.emit('game:resetPlayed'); });
  btnClearGames.addEventListener('click', function () {
    if (confirm('Remover todos os jogos?')) socket.emit('game:clearAll');
  });

  btnClearLog.addEventListener('click', function () {
    if (confirm('Limpar todo o histórico de sorteios?')) socket.emit('log:clear');
  });

  function renderGameList(games) {
    if (!games || games.length === 0) {
      gameList.innerHTML = '<p class="text-muted">🎮 Nenhum jogo cadastrado.</p>';
      return;
    }
    gameList.innerHTML = games.map(function (g) {
      var thumb = g.image
        ? '<img class="game-thumb" src="' + esc(g.image) + '" alt="" loading="lazy">'
        : '<span class="emoji">' + esc(g.emoji) + '</span>';
      return (
        '<div class="game-item' + (g.played ? ' played' : '') + '">' +
          thumb +
          '<div class="info">' +
            '<div class="name">' + esc(g.name) + '</div>' +
            '<div class="player">' + esc(g.player) + '</div>' +
          '</div>' +
          '<button class="remove-btn admin-only" data-id="' + g.id + '" title="Remover"' +
            (!isAdmin ? ' disabled' : '') + '>✖</button>' +
        '</div>'
      );
    }).join('');
  }

  gameList.addEventListener('click', function (e) {
    var btn = e.target.closest('.remove-btn');
    if (!btn || btn.disabled) return;
    socket.emit('game:remove', { id: parseInt(btn.dataset.id, 10) });
  });

  // ═══════════════════════════════════════════════════════
  //  CONFIG
  // ═══════════════════════════════════════════════════════
  function renderConfig(cfg) {
    cfgMinTime.value = cfg.minTime;
    cfgMaxTime.value = cfg.maxTime;
    cfgVoteInterval.value = cfg.voteInterval;
    cfgSessionName.value = cfg.sessionName;
    entryCodeDisplay.textContent = roomCode || cfg.entryCode;
  }

  btnSaveConfig.addEventListener('click', function () {
    socket.emit('config:update', {
      minTime: parseInt(cfgMinTime.value, 10),
      maxTime: parseInt(cfgMaxTime.value, 10),
      voteInterval: parseInt(cfgVoteInterval.value, 10),
      sessionName: cfgSessionName.value.trim(),
    });
  });

  // ═══════════════════════════════════════════════════════
  //  CURRENT GAME / LOG / ONLINE
  // ═══════════════════════════════════════════════════════
  function renderCurrentGame(s) {
    if (s.currentGame) {
      show(currentGameBar);
      cgEmoji.textContent = s.currentGame.emoji;
      cgName.textContent = '🎮 ' + s.currentGame.name;
      cgPlayer.textContent = '🎯 Escolha de ' + s.currentGame.player;
      roundNum.textContent = s.round;
    } else { hide(currentGameBar); }
  }

  function renderLog(log) {
    if (!log || log.length === 0) {
      logList.innerHTML = '<p class="text-muted">📋 Nenhuma rodada ainda.</p>';
      return;
    }
    logList.innerHTML = log.slice().reverse().map(function (l) {
      return '<div class="log-item"><strong>' + esc(l.emoji) + ' ' + esc(l.game) + '</strong> — ' + esc(l.player) +
        '<br><span class="log-time">🎲 Rodada ' + l.round + ' • 🕒 ' + l.time + '</span></div>';
    }).join('');
  }

  function renderOnline(users) {
    if (!users || users.length === 0) {
      onlineList.innerHTML = '<p class="text-muted">👤 Ninguem online.</p>';
      onlineBar.innerHTML = '';
      return;
    }
    onlineList.innerHTML = users.map(function (u) {
      var badge = u.isAdmin ? '<span class="host-tag">👑 HOST</span>' : '';
      return '<span class="online-user"><span class="online-dot"></span>' + esc(u.name) + badge + '</span>';
    }).join('');
    onlineBar.innerHTML = '<span class="online-bar-label">👥 Na sala:</span> ' + users.map(function (u) {
      var crown = u.isAdmin ? '👑 ' : '';
      return '<span class="online-bar-user"><span class="online-dot"></span>' + crown + esc(u.name) + '</span>';
    }).join('');
  }

  // ═══════════════════════════════════════════════════════
  //  SHARE
  // ═══════════════════════════════════════════════════════
  btnCopyLink.addEventListener('click', function () {
    var url = location.origin + location.pathname + '?room=' + encodeURIComponent(roomCode);
    navigator.clipboard.writeText(url).then(function () {
      shareBox.textContent = url + '\n\nCopiado!';
      show(shareBox);
    }).catch(function () { shareBox.textContent = url; show(shareBox); });
  });

  btnExportText.addEventListener('click', function () {
    if (!currentState) return;
    var lines = [
      (currentState.config.sessionName || 'Spinout'),
      'Codigo: ' + roomCode,
      'Tempo minimo: ' + currentState.config.minTime + ' min',
      'Tempo maximo: ' + currentState.config.maxTime + ' min',
      '', 'Jogos:',
    ];
    currentState.games.forEach(function (g, i) {
      lines.push((i + 1) + '. ' + g.name + ' (' + g.player + ')');
    });
    var text = lines.join('\n');
    show(shareBox); shareBox.textContent = text;
    navigator.clipboard.writeText(text).catch(function () {});
  });

  // Transfer host
  socket.on('admin:transferred', function () {
    // Just rely on next state update
  });

})();
