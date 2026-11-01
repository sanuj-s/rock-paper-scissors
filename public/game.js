(() => {
  const CHOICES = ['rock', 'paper', 'scissors'];
  const EMOJIS = { rock: '🪨', paper: '📄', scissors: '✂️' };

  /* ── DOM Elements ─────────────────────────────────────── */
  const playerScoreEl = document.getElementById('player-score');
  const cpuScoreEl    = document.getElementById('cpu-score');
  const roundCountEl  = document.getElementById('round-count');
  const playerHand    = document.getElementById('player-hand');
  const cpuHand       = document.getElementById('cpu-hand');
  const playerEmoji   = document.getElementById('player-emoji');
  const cpuEmoji      = document.getElementById('cpu-emoji');
  const resultBanner  = document.getElementById('result-banner');
  const resultText    = document.getElementById('result-text');
  const clashBurst    = document.getElementById('clash-burst');
  const historyBar    = document.getElementById('history-bar');
  const statWins      = document.getElementById('stat-wins');
  const statLosses    = document.getElementById('stat-losses');
  const statDraws     = document.getElementById('stat-draws');
  const statStreak    = document.getElementById('stat-streak');
  const choiceBtns    = document.querySelectorAll('.choice-btn');

  // Screens & Overlays
  const usernameModal    = document.getElementById('username-modal');
  const usernameInput    = document.getElementById('username-input');
  const usernameSubmit   = document.getElementById('username-submit');
  const modeScreen       = document.getElementById('mode-screen');
  const appScreen        = document.getElementById('app');
  const waitingOverlay   = document.getElementById('waiting-overlay');
  const leaderboardModal = document.getElementById('leaderboard-modal');

  // Buttons & Info
  const btnSolo         = document.getElementById('mode-solo');
  const btnOnline       = document.getElementById('mode-online');
  const btnLeaderboard  = document.getElementById('btn-show-leaderboard');
  const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
  const btnChangeName   = document.getElementById('btn-change-name');
  const btnBackMode     = document.getElementById('btn-back-mode');
  const btnCancelMatch  = document.getElementById('btn-cancel-match');

  const onlineMatchInfo = document.getElementById('online-match-info');
  const matchTitle      = document.getElementById('match-title');
  const labelPlayer     = document.getElementById('label-player');
  const labelOpponent   = document.getElementById('label-opponent');
  const opponentPickLabel = document.getElementById('opponent-pick-label');
  const welcomeText     = document.getElementById('welcome-text');
  const queueSizeText   = document.getElementById('queue-size-text');

  /* ── State ────────────────────────────────────────────── */
  let state = {
    username: localStorage.getItem('rps_username') || '',
    mode: 'solo', // 'solo' or 'online'
    roomId: null,
    playerScore: 0,
    cpuScore: 0,
    round: 1,
    wins: 0,
    losses: 0,
    draws: 0,
    streak: 0,
    history: [],
    busy: false,
    onlineActive: false
  };

  /* ── Socket.IO Setup ──────────────────────────────────── */
  const socket = io();

  socket.on('connect', () => {
    if (state.username) {
      socket.emit('set-username', { username: state.username });
    }
  });

  socket.on('waiting', (data) => {
    queueSizeText.textContent = data.message;
  });

  socket.on('queue-size', (data) => {
    queueSizeText.textContent = `Players in queue: ${data.count}`;
  });

  socket.on('match-found', (data) => {
    state.roomId = data.roomId;
    waitingOverlay.classList.add('hidden');
    startOnlineMatch(data.opponent);
    showToast(`Match found! You are playing against ${data.opponent}`, 'success');
  });

  socket.on('opponent-choice-made', () => {
    showToast(`Opponent locked in their choice!`, 'info');
  });

  socket.on('round-result', async (data) => {
    await processRoundResult(data);
  });

  socket.on('game-over', (data) => {
    state.busy = false;
    setButtonsDisabled(true);
    let msg = data.winner === state.username ? 'You won the match! 🎉' : (data.winner === 'draw' ? 'Match ended in a draw.' : 'You lost the match. 💀');
    showToast(msg, data.winner === state.username ? 'success' : 'error');
    setTimeout(() => {
      leaveRoom();
    }, 4000);
  });

  socket.on('opponent-disconnected', (data) => {
    showToast(`Opponent disconnected: ${data.reason}`, 'error');
    leaveRoom();
  });

  socket.on('error', (data) => {
    showToast(data.message, 'error');
    if (data.message.includes('queue')) {
      waitingOverlay.classList.add('hidden');
    }
  });

  /* ── UI Flow Management ───────────────────────────────── */
  function init() {
    if (!state.username) {
      showScreen('username');
    } else {
      welcomeText.textContent = `Welcome, ${state.username}!`;
      showScreen('mode');
    }
  }

  function showScreen(screen) {
    usernameModal.classList.add('hidden');
    modeScreen.classList.add('hidden');
    appScreen.classList.add('hidden');

    if (screen === 'username') usernameModal.classList.remove('hidden');
    if (screen === 'mode') modeScreen.classList.remove('hidden');
    if (screen === 'game') appScreen.classList.remove('hidden');
  }

  usernameSubmit.addEventListener('click', () => {
    const name = usernameInput.value.trim();
    if (name) {
      state.username = name;
      localStorage.setItem('rps_username', name);
      socket.emit('set-username', { username: name });
      welcomeText.textContent = `Welcome, ${state.username}!`;
      showScreen('mode');
    } else {
      showToast('Please enter a username', 'error');
    }
  });

  btnChangeName.addEventListener('click', () => {
    usernameInput.value = state.username;
    showScreen('username');
  });

  /* ── Mode Selection ───────────────────────────────────── */
  btnSolo.addEventListener('click', () => {
    state.mode = 'solo';
    resetArena();
    setupSoloMode();
    showScreen('game');
  });

  btnOnline.addEventListener('click', () => {
    state.mode = 'online';
    waitingOverlay.classList.remove('hidden');
    socket.emit('find-match');
  });

  btnCancelMatch.addEventListener('click', () => {
    socket.emit('cancel-match');
    waitingOverlay.classList.add('hidden');
  });

  btnBackMode.addEventListener('click', () => {
    if (state.mode === 'online' && state.roomId) {
      leaveRoom();
    }
    showScreen('mode');
  });

  function setupSoloMode() {
    onlineMatchInfo.classList.add('hidden');
    labelPlayer.textContent = state.username || 'You';
    labelOpponent.textContent = 'CPU';
    opponentPickLabel.textContent = 'CPU Pick';
  }

  function startOnlineMatch(opponentName) {
    resetArena();
    state.mode = 'online';
    state.onlineActive = true;
    onlineMatchInfo.classList.remove('hidden');
    matchTitle.textContent = `${state.username} vs ${opponentName}`;
    labelPlayer.textContent = state.username;
    labelOpponent.textContent = opponentName;
    opponentPickLabel.textContent = `${opponentName}'s Pick`;
    showScreen('game');
  }

  function leaveRoom() {
    if (state.roomId) {
      socket.emit('leave-room', { roomId: state.roomId });
    }
    state.roomId = null;
    state.onlineActive = false;
    showScreen('mode');
  }

  /* ── Toast Notifications ──────────────────────────────── */
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'ℹ️';
    if(type === 'success') icon = '✅';
    if(type === 'error') icon = '❌';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /* ── Leaderboard ──────────────────────────────────────── */
  btnLeaderboard.addEventListener('click', async () => {
    leaderboardModal.classList.remove('hidden');
    const tbody = document.querySelector('#leaderboard-table tbody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading...</td></tr>';
    
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      tbody.innerHTML = '';
      
      data.forEach((p, i) => {
        const tr = document.createElement('tr');
        tr.className = `rank-${i+1}`;
        tr.innerHTML = `
          <td>#${i+1}</td>
          <td>${p.username}</td>
          <td>${p.wins}</td>
          <td>${p.losses}</td>
          <td>${p.draws}</td>
          <td>${p.games_played}</td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color: var(--accent-lose);">Failed to load leaderboard</td></tr>';
    }
  });

  btnCloseLeaderboard.addEventListener('click', () => {
    leaderboardModal.classList.add('hidden');
  });

  /* ── Gameplay Logic ───────────────────────────────────── */
  function getMessage(result, playerChoice, oppChoice) {
    const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
    if (result === 'draw') return `🤝 It's a draw! Both chose ${cap(playerChoice)}`;
    if (result === 'win') return `🎉 You win! ${cap(playerChoice)} beats ${cap(oppChoice)}`;
    return `💀 You lose! ${cap(oppChoice)} beats ${cap(playerChoice)}`;
  }

  function bumpScore(el) {
    el.classList.add('bump');
    setTimeout(() => el.classList.remove('bump'), 350);
  }

  function render() {
    playerScoreEl.textContent = state.playerScore;
    cpuScoreEl.textContent    = state.cpuScore;
    roundCountEl.textContent  = `Round ${state.round}`;
    statWins.textContent      = state.wins;
    statLosses.textContent    = state.losses;
    statDraws.textContent     = state.draws;
    statStreak.textContent    = state.streak;
  }

  function addHistoryDot(result) {
    const dot = document.createElement('div');
    dot.className = `history-dot ${result}`;
    dot.title = result.charAt(0).toUpperCase() + result.slice(1);
    historyBar.appendChild(dot);
    if (historyBar.children.length > 30) {
      historyBar.removeChild(historyBar.firstChild);
    }
  }

  function spawnConfetti() {
    const colors = ['#34d399', '#60a5fa', '#a78bfa', '#fbbf24', '#f472b6', '#fb923c'];
    for (let i = 0; i < 40; i++) {
      const el = document.createElement('div');
      el.className = 'confetti';
      el.style.left = `${Math.random() * 100}vw`;
      el.style.top = `${-10 + Math.random() * 20}px`;
      el.style.background = colors[Math.floor(Math.random() * colors.length)];
      el.style.width = `${6 + Math.random() * 6}px`;
      el.style.height = `${6 + Math.random() * 6}px`;
      el.style.animationDuration = `${1 + Math.random() * 1.5}s`;
      el.style.animationDelay = `${Math.random() * 0.3}s`;
      document.body.appendChild(el);
      setTimeout(() => el.remove(), 3000);
    }
  }

  function clearArena() {
    playerHand.classList.remove('win', 'lose', 'draw', 'pop', 'shake');
    cpuHand.classList.remove('win', 'lose', 'draw', 'pop', 'shake');
    resultBanner.classList.remove('win', 'lose', 'draw', 'reveal');
    clashBurst.classList.remove('active');
  }

  function setButtonsDisabled(disabled) {
    choiceBtns.forEach((btn) => btn.classList.toggle('disabled', disabled));
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  /* ── Choice Click ─────────────────────────────────────── */
  choiceBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const choice = btn.dataset.choice;
      if (!choice || state.busy) return;

      if (state.mode === 'solo') {
        await playSolo(choice);
      } else if (state.mode === 'online') {
        socket.emit('player-choice', { roomId: state.roomId, choice });
        setButtonsDisabled(true);
        
        // Show player choice immediately locally
        clearArena();
        playerEmoji.textContent = EMOJIS[choice];
        playerHand.classList.add('pop');
        cpuHand.classList.add('shake');
        resultText.textContent = "Waiting for opponent...";
      }
    });
  });

  async function playSolo(playerChoice) {
    state.busy = true;
    setButtonsDisabled(true);
    clearArena();

    // 1. Show player pick immediately
    playerEmoji.textContent = EMOJIS[playerChoice];
    playerHand.classList.add('pop');

    // 2. CPU "thinking"
    cpuHand.classList.add('shake');
    let cycleIdx = 0;
    const cycleInterval = setInterval(() => {
      cpuEmoji.textContent = EMOJIS[CHOICES[cycleIdx % 3]];
      cycleIdx++;
    }, 80);

    try {
      // POST to API
      const res = await fetch('/api/solo-play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: state.username, choice: playerChoice })
      });
      const data = await res.json();
      
      await delay(700);

      clearInterval(cycleInterval);
      cpuHand.classList.remove('shake');
      
      // Setup payload matching socket event for reuse
      const roundData = {
        playerChoice,
        opponentChoice: data.cpuChoice,
        result: data.result,
        scores: null, // Solo doesn't track overall scores strictly like best of 5 on server, we do it local
        playerStats: data.playerStats
      };

      await animateRoundResult(roundData);
      
      // Update local stats from server
      state.wins = data.playerStats.wins;
      state.losses = data.playerStats.losses;
      state.draws = data.playerStats.draws;

    } catch (err) {
      clearInterval(cycleInterval);
      showToast('Error communicating with server', 'error');
    }

    state.busy = false;
    setButtonsDisabled(false);
  }

  async function processRoundResult(data) {
    state.busy = true;
    cpuHand.classList.remove('shake');
    await animateRoundResult(data);
    
    if (data.scores) {
      state.playerScore = data.scores.you || 0;
      state.cpuScore = data.scores.opponent || 0;
    }
    
    if (data.playerStats) {
      state.wins = data.playerStats.wins;
      state.losses = data.playerStats.losses;
      state.draws = data.playerStats.draws;
    }

    render();
    
    if (!data.gameOver) {
      state.busy = false;
      setButtonsDisabled(false);
    }
  }

  async function animateRoundResult(data) {
    const opp = data.opponentChoice;
    const pChoice = data.playerChoice;
    const result = data.result;

    cpuEmoji.textContent = EMOJIS[opp];
    cpuHand.classList.add('pop');
    clashBurst.classList.add('active');

    await delay(200);

    if (result === 'win') {
      playerHand.classList.add('win');
      cpuHand.classList.add('lose');
      if (state.mode === 'solo') {
        state.playerScore++;
        state.streak++;
      }
      bumpScore(playerScoreEl);
      spawnConfetti();
    } else if (result === 'lose') {
      playerHand.classList.add('lose');
      cpuHand.classList.add('win');
      if (state.mode === 'solo') {
        state.cpuScore++;
        state.streak = 0;
      }
      bumpScore(cpuScoreEl);
    } else {
      playerHand.classList.add('draw');
      cpuHand.classList.add('draw');
      if (state.mode === 'solo') state.streak = 0;
    }

    resultText.textContent = getMessage(result, pChoice, opp);
    resultBanner.className = `result-banner ${result} reveal`;

    state.history.push(result);
    addHistoryDot(result);
    state.round++;
    render();
    
    await delay(300);
  }

  function resetArena() {
    state.playerScore = 0;
    state.cpuScore = 0;
    state.round = 1;
    state.history = [];
    state.busy = false;
    clearArena();
    playerEmoji.textContent = '❓';
    cpuEmoji.textContent = '❓';
    resultText.textContent = 'Make your move!';
    resultBanner.className = 'result-banner';
    historyBar.innerHTML = '';
    setButtonsDisabled(false);
    render();
  }

  /* ── Keyboard support ─────────────────────────────────── */
  document.addEventListener('keydown', (e) => {
    if (state.busy || appScreen.classList.contains('hidden')) return;
    const keyMap = { '1': 'rock', '2': 'paper', '3': 'scissors', r: 'rock', p: 'paper', s: 'scissors' };
    const choice = keyMap[e.key.toLowerCase()];
    if (choice) {
      const btn = document.querySelector(`[data-choice="${choice}"]`);
      if (btn && !btn.classList.contains('disabled')) btn.click();
    }
  });

  init();
})();
