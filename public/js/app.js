/* =========================================================
   우리 가족 빙고 - 프론트엔드 앱 로직
   ========================================================= */
(function () {
  'use strict';

  const R = window.BingoRules;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));

  const AVATARS = ['🙂', '🐯', '🐰', '🐻', '🦊', '🐼', '🐵', '🦁', '🐶', '🐱', '🐸', '🐷', '🦄', '👧', '👦', '🧔', '👩', '👨', '👵', '👴', '🐔'];
  const AI_AVATARS = ['🤖', '👾', '🎃', '🐙', '🦑', '🐲'];
  const QUICK_MSGS = ['안녕하세요! 👋', '빙고! 🎉', '아깝다! 😲', '거의 다 왔어요! 🔥', '축하해요! 🎉', '재밌어요! 😄', '한 판 더 해요!'];

  const EMOJI_MAP = {
    사자: '🦁', 호랑이: '🐯', 코끼리: '🐘', 기린: '🦒', 하마: '🦛', 얼룩말: '🦓', 곰: '🐻', 여우: '🦊', 늑대: '🐺', 토끼: '🐰',
    다람쥐: '🐿️', 고양이: '🐱', 강아지: '🐶', 돼지: '🐷', 소: '🐮', 말: '🐴', 사슴: '🦌', 원숭이: '🐵', 판다: '🐼', 캥거루: '🦘',
    나비: '🦋', 벌: '🐝', 개미: '🐜', 메뚜기: '🦗', 사슴벌레: '🪲',
    사과: '🍎', 바나나: '🍌', 포도: '🍇', 딸기: '🍓', 수박: '🍉', 참외: '🍈', 복숭아: '🍑', 배: '🍐', 감: '🟠', 귤: '🍊',
    오렌지: '🍊', 레몬: '🍋', 자두: '🟣', 체리: '🍒', 망고: '🥭', 파인애플: '🍍', 키위: '🥝', 멜론: '🍈', 석류: '🔴', 무화과: '🟤',
    살구: '🍑', 자몽: '🍊', 블루베리: '🔵', 코코넛: '🥥', 아보카도: '🥑',
  };

  const state = {
    mode: null,           // 'solo' | 'online'
    category: 'number',
    level: 1,
    aiCount: 2,
    target: 3,
    myBoard: null,
    drawnList: [],
    drawnSet: new Set(),
    status: 'idle',        // idle | playing | ended
    ai: [],
    deckSolo: [],
    deckIdx: 0,
    winners: [],
    autoTimer: null,
    profile: { name: '', avatar: '🙂' },
    online: {
      code: null, token: null, isHost: false, myReady: false,
      category: 'number', level: 1, target: 3, players: [], winners: [], autoEnabled: false, status: 'waiting',
    },
  };

  /* ---------------- 화면/토스트/모달 유틸 ---------------- */
  function showScreen(id) {
    $$('.screen').forEach((s) => s.classList.remove('active'));
    $('#' + id).classList.add('active');
    if (id === 'screen-solo') {
      $('#soloOptions').classList.remove('hidden');
      $('#soloBoardStep').classList.add('hidden');
    }
  }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  function showModal({ emoji, title, text, actions }) {
    $('#modalEmoji').textContent = emoji || '🎉';
    $('#modalTitle').textContent = title || '';
    $('#modalText').textContent = text || '';
    const wrap = $('#modalActions');
    wrap.innerHTML = '';
    (actions || []).forEach((a) => {
      const btn = document.createElement('button');
      btn.className = a.cls || 'ghost';
      btn.textContent = a.label;
      btn.onclick = () => { hideModal(); a.onClick && a.onClick(); };
      wrap.appendChild(btn);
    });
    $('#modalBack').classList.remove('hidden');
  }
  function hideModal() { $('#modalBack').classList.add('hidden'); }

  /* ---------------- 프로필 ---------------- */
  function loadProfile() {
    try {
      const raw = localStorage.getItem('bingo_profile');
      if (raw) Object.assign(state.profile, JSON.parse(raw));
    } catch (e) { /* 무시 */ }
    $('#playerName').value = state.profile.name || '';
    $('#myAvatar').textContent = state.profile.avatar || '🙂';
  }
  function saveProfile() {
    state.profile.name = $('#playerName').value.trim();
    localStorage.setItem('bingo_profile', JSON.stringify(state.profile));
  }
  function buildAvatarPicker(container, onPick) {
    container.innerHTML = '';
    AVATARS.forEach((a) => {
      const b = document.createElement('button');
      b.textContent = a;
      b.onclick = () => { onPick(a); container.classList.add('hidden'); };
      container.appendChild(b);
    });
  }

  $$('[data-go]').forEach((btn) => btn.addEventListener('click', () => showScreen(btn.dataset.go)));
  $('#myAvatarBtn').addEventListener('click', () => {
    const p = $('#avatarPicker');
    p.classList.toggle('hidden');
    buildAvatarPicker(p, (a) => { state.profile.avatar = a; $('#myAvatar').textContent = a; saveProfile(); });
  });
  $('#playerName').addEventListener('change', saveProfile);
  $('#playerName').addEventListener('blur', saveProfile);

  /* ---------------- 선택 위젯(카테고리/난이도/인원) ---------------- */
  function buildCatGrid(el, selected, onPick, disabled) {
    el.innerHTML = '';
    R.CATEGORY_KEYS.forEach((key) => {
      const cat = R.CATEGORIES[key];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'cat-btn' + (key === selected ? ' selected' : '');
      btn.innerHTML = `<span class="emoji">${cat.emoji}</span><strong>${cat.label.replace(' 빙고', '')}</strong>`;
      if (disabled) btn.disabled = true;
      else btn.onclick = () => onPick(key);
      el.appendChild(btn);
    });
  }

  const LEVEL_META = {
    1: { name: '1단계', desc: '3줄 빙고 · 쉬움' },
    2: { name: '2단계', desc: '4줄 빙고 · 보통' },
    3: { name: '3단계', desc: '5줄 빙고 · 어려움' },
  };
  function buildLevelGrid(el, selected, onPick, disabled) {
    el.innerHTML = '';
    [1, 2, 3].forEach((lv) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'level-btn' + (lv === selected ? ' selected' : '');
      btn.innerHTML = `<strong>${LEVEL_META[lv].name}</strong><small>${LEVEL_META[lv].desc}</small>`;
      if (disabled) btn.disabled = true;
      else btn.onclick = () => onPick(lv);
      el.appendChild(btn);
    });
  }

  function buildCountGrid(el, selected, onPick) {
    el.innerHTML = '';
    for (let n = 1; n <= 5; n++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'count-btn' + (n === selected ? ' selected' : '');
      btn.textContent = n + '명';
      btn.onclick = () => onPick(n);
      el.appendChild(btn);
    }
  }

  /* ---------------- 보드 렌더링 ---------------- */
  function cellContent(item, category) {
    if (category === 'number') return `<span class="bc-num">${item}</span>`;
    const emoji = EMOJI_MAP[item] || '❔';
    return `<span class="bc-emoji">${emoji}</span><span class="bc-label">${item}</span>`;
  }
  function renderBoard(el, board, category, drawnSet, hitIdxSet) {
    el.innerHTML = '';
    if (!board) return;
    board.forEach((item, idx) => {
      const cell = document.createElement('div');
      cell.className = 'bcell';
      if (drawnSet && drawnSet.has(item)) cell.classList.add('marked');
      if (hitIdxSet && hitIdxSet.has(idx)) cell.classList.add('line-hit');
      cell.innerHTML = cellContent(item, category);
      el.appendChild(cell);
    });
  }
  function linesCountFor(board, drawnSet) {
    return R.countCompletedLines(R.markedFromDraws(board, drawnSet)).count;
  }
  function computeHitSet(board, drawnSet) {
    const marked = R.markedFromDraws(board, drawnSet);
    const { completed } = R.countCompletedLines(marked);
    const s = new Set();
    completed.forEach((line) => line.forEach((i) => s.add(i)));
    return s;
  }

  /* ---------------- 보드 만들기(자동/수동 배치) ---------------- */
  const AUTO_DESC = '항목이 무작위로 배치돼요. 마음에 안 들면 다시 섞어보세요!';
  const MANUAL_DESC = '항목을 눌러 고른 뒤 칸을 클릭하거나, 항목을 칸으로 끌어다 놓아 배치하세요. 채운 칸끼리 끌어다 놓으면 자리가 바뀌고, 칸을 다시 누르거나 뱅크 쪽으로 끌어오면 항목이 빠져요.';

  function createBoardBuilder(cfg) {
    const st = { mode: 'auto', board: null, cells: null, selected: null, locked: false };

    function isComplete() { return st.mode === 'auto' ? !!st.board : !!(st.cells && st.cells.every((v) => v !== null)); }
    function currentBoard() { return isComplete() ? (st.mode === 'auto' ? st.board.slice() : st.cells.slice()) : null; }
    function notify() { cfg.onBoardChange(currentBoard(), st.mode); }

    function remainingItems() {
      const all = R.CATEGORIES[cfg.getCategory()].items;
      const placed = new Set((st.cells || []).filter(Boolean));
      return all.filter((it) => !placed.has(it));
    }

    function placeAt(idx, item) { st.cells[idx] = item; }
    function clearAt(idx) { st.cells[idx] = null; }
    function swap(i, j) { const t = st.cells[i]; st.cells[i] = st.cells[j]; st.cells[j] = t; }

    function readDrag(e) {
      try { return JSON.parse(e.dataTransfer.getData('text/plain') || '{}'); } catch (err) { return {}; }
    }

    function renderBank() {
      cfg.bankEl.innerHTML = '';
      remainingItems().forEach((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'bank-item' + (st.selected === item ? ' selected' : '');
        b.draggable = !st.locked;
        b.innerHTML = cellContent(item, cfg.getCategory());
        b.onclick = () => { if (st.locked) return; st.selected = (st.selected === item) ? null : item; renderBank(); };
        b.addEventListener('dragstart', (e) => {
          if (st.locked) { e.preventDefault(); return; }
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'bank', item }));
        });
        cfg.bankEl.appendChild(b);
      });
    }

    function renderAutoGrid() { renderBoard(cfg.gridEl, st.board, cfg.getCategory(), null, null); }

    function renderManualGrid() {
      cfg.gridEl.innerHTML = '';
      st.cells.forEach((item, idx) => {
        const cell = document.createElement('div');
        cell.className = 'bcell buildable' + (item ? '' : ' empty');
        cell.innerHTML = item ? cellContent(item, cfg.getCategory()) : '<span class="bc-plus">+</span>';
        cell.draggable = !st.locked && !!item;
        cell.onclick = () => {
          if (st.locked) return;
          if (item) { clearAt(idx); }
          else if (st.selected) { placeAt(idx, st.selected); st.selected = null; }
          renderManual();
        };
        cell.addEventListener('dragstart', (e) => {
          if (st.locked || !item) { e.preventDefault(); return; }
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', JSON.stringify({ source: 'cell', idx }));
        });
        cell.addEventListener('dragover', (e) => {
          if (st.locked) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
        });
        cell.addEventListener('dragenter', () => { if (!st.locked) cell.classList.add('drag-over'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
        cell.addEventListener('dragend', () => cell.classList.remove('drag-over'));
        cell.addEventListener('drop', (e) => {
          if (st.locked) return;
          e.preventDefault();
          const data = readDrag(e);
          if (data.source === 'bank' && data.item) placeAt(idx, data.item);
          else if (data.source === 'cell' && Number.isInteger(data.idx)) swap(idx, data.idx);
          st.selected = null;
          renderManual();
        });
        cfg.gridEl.appendChild(cell);
      });
    }

    function renderManual() {
      renderBank();
      renderManualGrid();
      const filled = st.cells.filter(Boolean).length;
      if (cfg.fillStatusEl) cfg.fillStatusEl.textContent = `${filled}/25칸 배치했어요`;
      notify();
    }

    function setMode(mode) {
      st.mode = mode;
      st.selected = null;
      cfg.modeButtons.forEach((b) => b.classList.toggle('selected', b.dataset.mode === mode));
      cfg.bankEl.classList.toggle('hidden', mode !== 'manual');
      if (cfg.fillStatusEl) cfg.fillStatusEl.classList.toggle('hidden', mode !== 'manual');
      cfg.autoBtn.classList.toggle('hidden', mode !== 'auto');
      cfg.fillBtn.classList.toggle('hidden', mode !== 'manual');
      cfg.resetBtn.classList.toggle('hidden', mode !== 'manual');
      if (cfg.descEl) cfg.descEl.textContent = mode === 'auto' ? AUTO_DESC : MANUAL_DESC;
      if (mode === 'auto') {
        if (!st.board) st.board = R.randomBoard(cfg.getCategory());
        renderAutoGrid();
        notify();
      } else {
        if (!st.cells) st.cells = Array(25).fill(null);
        renderManual();
      }
    }

    cfg.modeButtons.forEach((b) => b.addEventListener('click', () => { if (!st.locked) setMode(b.dataset.mode); }));
    cfg.autoBtn.addEventListener('click', () => { if (st.locked) return; st.board = R.randomBoard(cfg.getCategory()); renderAutoGrid(); notify(); });
    cfg.fillBtn.addEventListener('click', () => {
      if (st.locked) return;
      const remaining = R.shuffle(remainingItems());
      let ri = 0;
      st.cells = st.cells.map((v) => (v !== null ? v : remaining[ri++]));
      renderManual();
    });
    cfg.resetBtn.addEventListener('click', () => {
      if (st.locked) return;
      st.cells = Array(25).fill(null);
      st.selected = null;
      renderManual();
    });

    // 채운 칸의 항목을 뱅크 쪽으로 끌어다 놓으면 다시 빼낼 수 있도록 처리
    cfg.bankEl.addEventListener('dragover', (e) => {
      if (st.locked || st.mode !== 'manual') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    cfg.bankEl.addEventListener('dragenter', () => { if (!st.locked) cfg.bankEl.classList.add('drag-over'); });
    cfg.bankEl.addEventListener('dragleave', () => cfg.bankEl.classList.remove('drag-over'));
    cfg.bankEl.addEventListener('drop', (e) => {
      if (st.locked || st.mode !== 'manual') return;
      e.preventDefault();
      cfg.bankEl.classList.remove('drag-over');
      const data = readDrag(e);
      if (data.source === 'cell' && Number.isInteger(data.idx)) clearAt(data.idx);
      st.selected = null;
      renderManual();
    });

    return {
      setCategory() {
        st.board = null; st.cells = null; st.selected = null;
        if (st.mode === 'auto') { st.board = R.randomBoard(cfg.getCategory()); renderAutoGrid(); }
        else { st.cells = Array(25).fill(null); renderManual(); }
        notify();
      },
      setLocked(locked) {
        st.locked = locked;
        cfg.gridEl.classList.toggle('locked', locked);
        cfg.bankEl.classList.toggle('locked', locked);
      },
      showBoard(board) {
        // 서버에 이미 제출된 보드를 그대로 보여줄 때(재접속 등) 사용
        renderBoard(cfg.gridEl, board, cfg.getCategory(), null, null);
      },
      getBoard: currentBoard,
      isComplete,
      init() { setMode('auto'); },
    };
  }

  /* ---------------- 혼자 연습하기 ---------------- */
  const soloDraft = { category: 'number', level: 1, aiCount: 2 };
  function renderSoloOptions() {
    buildCatGrid($('#catGridSolo'), soloDraft.category, (k) => { soloDraft.category = k; renderSoloOptions(); });
    buildLevelGrid($('#levelGridSolo'), soloDraft.level, (lv) => { soloDraft.level = lv; renderSoloOptions(); });
    buildCountGrid($('#aiCountGrid'), soloDraft.aiCount, (n) => { soloDraft.aiCount = n; renderSoloOptions(); });
  }

  const soloBuilder = createBoardBuilder({
    gridEl: $('#soloBoardGrid'), bankEl: $('#soloBoardBank'),
    autoBtn: $('#soloShuffle'), fillBtn: $('#soloManualFill'), resetBtn: $('#soloManualReset'),
    descEl: $('#soloBoardDesc'), fillStatusEl: $('#soloFillStatus'),
    modeButtons: $$('#soloModeToggle .mode-btn'),
    getCategory: () => soloDraft.category,
    onBoardChange: (board) => { $('#soloStart').disabled = !board; },
  });
  soloBuilder.init();

  $('#soloNext').addEventListener('click', () => {
    $('#soloOptions').classList.add('hidden');
    $('#soloBoardStep').classList.remove('hidden');
    soloBuilder.setCategory();
  });
  $('#soloStart').addEventListener('click', () => {
    const board = soloBuilder.getBoard();
    if (!board) { toast('보드 25칸을 모두 채워주세요!'); return; }
    state.category = soloDraft.category;
    state.level = soloDraft.level;
    state.aiCount = soloDraft.aiCount;
    state.myBoard = board;
    startSoloGame();
  });

  function startSoloGame() {
    state.mode = 'solo';
    state.target = R.targetLines(state.level);
    state.drawnList = [];
    state.drawnSet = new Set();
    state.status = 'playing';
    state.deckSolo = R.shuffle(R.CATEGORIES[state.category].items);
    state.deckIdx = 0;
    state.winners = [];
    state.ai = Array.from({ length: state.aiCount }, (_, i) => ({
      id: 'ai' + i, name: `컴퓨터 ${i + 1}`, avatar: AI_AVATARS[i % AI_AVATARS.length],
      board: R.randomBoard(state.category),
    }));
    showScreen('screen-game');
    resetGameScreenUI();
    renderAll();
  }

  function drawSolo() {
    if (state.status !== 'playing' || state.deckIdx >= state.deckSolo.length) return;
    const item = state.deckSolo[state.deckIdx++];
    state.drawnList.push(item);
    state.drawnSet.add(item);

    const target = state.target;
    const winners = [];
    if (linesCountFor(state.myBoard, state.drawnSet) >= target) winners.push('me');
    state.ai.forEach((a) => { if (linesCountFor(a.board, state.drawnSet) >= target) winners.push(a.id); });

    if (winners.length) { state.status = 'ended'; state.winners = winners; stopAutoSolo(); }
    renderAll();
    if (winners.length) onSoloEnd();
  }

  function startAutoSolo() {
    stopAutoSolo();
    state.autoTimer = setInterval(() => {
      if (state.status !== 'playing') { stopAutoSolo(); return; }
      drawSolo();
    }, 2500);
  }
  function stopAutoSolo() {
    if (state.autoTimer) { clearInterval(state.autoTimer); state.autoTimer = null; }
  }

  function onSoloEnd() {
    const names = state.winners.map((id) => (id === 'me' ? (state.profile.name || '나') : (state.ai.find((a) => a.id === id) || {}).name || id));
    const iWon = state.winners.includes('me');
    showModal({
      emoji: iWon ? '🎉' : '😅',
      title: `${names.join(', ')} 승리!`,
      text: iWon ? '축하해요! 빙고를 먼저 완성했어요.' : '아쉬워요, 다음엔 꼭 이겨봐요!',
      actions: [
        { label: '🔁 다시하기', cls: 'primary', onClick: () => startSoloGame() },
        { label: '🏠 처음으로', cls: 'ghost', onClick: goHome },
      ],
    });
  }

  /* ---------------- 온라인: 소켓 ---------------- */
  let socket = null;
  function ensureSocket() {
    if (socket) return socket;
    socket = io();
    wireSocketEvents();
    return socket;
  }

  const createDraft = { category: 'number', level: 1 };
  function renderCreateOptions() {
    buildCatGrid($('#catGridOnline'), createDraft.category, (k) => { createDraft.category = k; renderCreateOptions(); });
    buildLevelGrid($('#levelGridOnline'), createDraft.level, (lv) => { createDraft.level = lv; renderCreateOptions(); });
  }

  $('#createRoom').addEventListener('click', () => {
    saveProfile();
    ensureSocket();
    $('#netStatus').textContent = '';
    socket.emit('room:create', {
      name: state.profile.name || '플레이어', avatar: state.profile.avatar || '🙂',
      category: createDraft.category, level: createDraft.level,
    }, (res) => {
      if (!res.ok) { $('#netStatus').textContent = res.message; return; }
      enterLobbyFromResponse(res);
    });
  });

  $('#joinRoom').addEventListener('click', () => {
    saveProfile();
    ensureSocket();
    const code = $('#joinCode').value.trim().toUpperCase();
    if (code.length < 4) { $('#netStatus').textContent = '초대 코드를 확인해주세요.'; return; }
    $('#netStatus').textContent = '';
    socket.emit('room:join', { code, name: state.profile.name || '플레이어', avatar: state.profile.avatar || '🙂' }, (res) => {
      if (!res.ok) { $('#netStatus').textContent = res.message; return; }
      enterLobbyFromResponse(res);
    });
  });

  let lobbyLastCategory = null;
  const lobbyBuilder = createBoardBuilder({
    gridEl: $('#lobbyBoardGrid'), bankEl: $('#lobbyBoardBank'),
    autoBtn: $('#lobbyShuffle'), fillBtn: $('#lobbyManualFill'), resetBtn: $('#lobbyManualReset'),
    descEl: $('#lobbyBoardDesc'), fillStatusEl: $('#lobbyFillStatus'),
    modeButtons: $$('#lobbyModeToggle .mode-btn'),
    getCategory: () => state.online.category,
    onBoardChange: (board) => { $('#lobbyReady').disabled = !board || state.online.myReady; },
  });
  lobbyBuilder.init();

  function enterLobbyFromResponse(res) {
    state.online.code = res.code;
    state.online.token = res.token;
    applyRoomSummary(res);
    state.myBoard = null;
    lobbyLastCategory = null;
    localStorage.setItem('bingo_room', JSON.stringify({ code: res.code, token: res.token }));
    showScreen('screen-lobby');
    renderLobby();
  }

  function applyRoomSummary(summary) {
    state.online.category = summary.category;
    state.online.level = summary.level;
    state.online.target = summary.target;
    state.online.status = summary.status;
    state.online.players = summary.players || [];
    state.online.autoEnabled = !!summary.autoEnabled;
    state.online.winners = summary.winners || [];
    const me = state.online.players.find((p) => p.token === state.online.token);
    state.online.isHost = !!(me && me.host);
    state.online.myReady = !!(me && me.ready);
  }

  function renderLobby() {
    $('#lobbyCode').textContent = state.online.code || '------';
    $('#lobbyCount').textContent = state.online.players.length;
    renderRoster();

    buildCatGrid($('#catGridLobby'), state.online.category, (k) => {
      socket.emit('room:settings', { category: k, level: state.online.level });
    }, !state.online.isHost);
    buildLevelGrid($('#levelGridLobby'), state.online.level, (lv) => {
      socket.emit('room:settings', { category: state.online.category, level: lv });
    }, !state.online.isHost);
    $('#lobbySettings').classList.toggle('hidden', !state.online.isHost);

    $('#lobbyBoardStep').classList.remove('hidden');
    if (lobbyLastCategory !== state.online.category) {
      lobbyLastCategory = state.online.category;
      lobbyBuilder.setCategory();
    }
    if (state.online.myReady && state.myBoard) lobbyBuilder.showBoard(state.myBoard);
    lobbyBuilder.setLocked(state.online.myReady);
    $('#lobbyReady').disabled = state.online.myReady || !lobbyBuilder.isComplete();
    $('#lobbyReady').textContent = state.online.myReady ? '준비 완료됨 ✅' : '준비 완료! ✅';

    const connected = state.online.players.filter((p) => p.connected);
    const allReady = connected.length >= 2 && connected.every((p) => p.ready);
    $('#lobbyStart').classList.toggle('hidden', !state.online.isHost);
    $('#lobbyStart').disabled = !allReady;
    $('#lobbyWaitMsg').classList.toggle('hidden', state.online.isHost && allReady);
    $('#lobbyWaitMsg').textContent = allReady
      ? '방장이 곧 시작할 거예요! 잠시만요 ...'
      : '참가자들이 보드를 준비하는 중이에요 ...';
  }

  function renderRoster() {
    const el = $('#lobbyRoster');
    el.innerHTML = '';
    state.online.players.forEach((p) => {
      const li = document.createElement('li');
      const mine = p.token === state.online.token;
      let badges = '';
      if (p.host) badges += '<span class="rv-badge host">방장</span>';
      if (!p.connected) badges += '<span class="rv-badge off">연결 끊김</span>';
      else badges += p.ready ? '<span class="rv-badge ready">준비완료</span>' : '<span class="rv-badge">준비중</span>';
      li.innerHTML = `<span class="rv-avatar">${p.avatar}</span><span class="rv-name">${p.name}${mine ? ' (나)' : ''}</span>${badges}`;
      el.appendChild(li);
    });
  }

  $('#lobbyReady').addEventListener('click', () => {
    const board = lobbyBuilder.getBoard();
    if (!board) { toast('보드 25칸을 모두 채워주세요!'); return; }
    socket.emit('room:board-ready', { board }, (res) => {
      if (!res.ok) { toast(res.message); return; }
      state.myBoard = board;
      renderLobby();
    });
  });
  $('#lobbyStart').addEventListener('click', () => {
    socket.emit('room:start', (res) => { $('#lobbyStatus').textContent = res.ok ? '' : res.message; });
  });

  function leaveOnlineRoom() {
    if (socket) socket.emit('room:leave');
    localStorage.removeItem('bingo_room');
    state.online = {
      code: null, token: null, isHost: false, myReady: false,
      category: 'number', level: 1, target: 3, players: [], winners: [], autoEnabled: false, status: 'waiting',
    };
  }
  $('#lobbyLeave').addEventListener('click', () => {
    showModal({
      emoji: '🚪', title: '방을 나가시겠어요?', text: '대기실에서 나가면 방 정보가 사라져요.',
      actions: [
        { label: '취소', cls: 'ghost' },
        { label: '나가기', cls: 'primary', onClick: () => { leaveOnlineRoom(); showScreen('screen-home'); } },
      ],
    });
  });

  function inviteUrl() { return `${location.origin}/?code=${state.online.code}`; }
  function copyText(text, successMsg) {
    const done = () => toast(successMsg);
    const fail = () => window.prompt('아래 내용을 직접 복사해주세요', text);
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done).catch(fail);
    else fail();
  }
  $('#copyCode').addEventListener('click', () => copyText(state.online.code || '', '코드를 복사했어요!'));
  $('#copyLink').addEventListener('click', () => copyText(inviteUrl(), '초대 링크를 복사했어요!'));
  $('#shareInvite').addEventListener('click', () => {
    const text = `🎱 빙고 한 판 하실래요? 초대 코드: ${state.online.code}`;
    if (navigator.share) navigator.share({ title: '우리 가족 빙고', text, url: inviteUrl() }).catch(() => {});
    else copyText(`${text}\n${inviteUrl()}`, '초대 메시지를 복사했어요!');
  });

  (function handleInviteLink() {
    const params = new URLSearchParams(location.search);
    const code = params.get('code');
    if (code) { showScreen('screen-online'); $('#joinCode').value = code.toUpperCase(); }
  })();

  function wireSocketEvents() {
    socket.on('connect', () => tryRejoin());

    socket.on('room:update', (summary) => {
      applyRoomSummary(summary);
      if ($('#screen-lobby').classList.contains('active')) renderLobby();
      else if ($('#screen-game').classList.contains('active')) { updateControlsForMode(); renderParticipants(); }
    });

    socket.on('room:opponent-reconnected', (summary) => {
      applyRoomSummary(summary);
      toast('참가자가 다시 연결됐어요!');
      if ($('#screen-lobby').classList.contains('active')) renderLobby();
    });

    socket.on('game:start', (summary) => {
      applyRoomSummary(summary);
      state.mode = 'online';
      state.status = 'playing';
      state.drawnList = [];
      state.drawnSet = new Set();
      showScreen('screen-game');
      resetGameScreenUI();
      renderAll();
      toast('게임 시작! 🎉');
    });

    socket.on('game:draw', (payload) => {
      state.drawnList.push(payload.item);
      state.drawnSet.add(payload.item);
      state.online.players = payload.players;
      state.online.target = payload.target;
      if (payload.ended) {
        state.status = 'ended';
        state.online.winners = payload.winners;
      }
      renderAll();
      if (payload.ended) onOnlineEnd();
    });

    socket.on('room:auto-state', ({ enabled }) => { $('#autoToggle').checked = enabled; });

    socket.on('game:rematch-start', (summary) => {
      applyRoomSummary(summary);
      state.mode = 'online';
      state.myBoard = null;
      lobbyLastCategory = null;
      hideModal();
      showScreen('screen-lobby');
      renderLobby();
      toast('대기실로 돌아왔어요. 보드를 다시 준비해주세요!');
    });

    socket.on('chat:message', (payload) => addChatMessage(payload.name, payload.text, payload.token === state.online.token));
    socket.on('disconnect', () => toast('연결이 끊겼어요. 다시 연결 중...'));
  }

  function tryRejoin() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem('bingo_room') || 'null'); } catch (e) { saved = null; }
    if (!saved || !saved.code || !saved.token) return;
    socket.emit('room:rejoin', saved, (res) => {
      if (!res || !res.ok) { localStorage.removeItem('bingo_room'); return; }
      state.online.code = res.code;
      state.online.token = res.token;
      applyRoomSummary(res);
      state.myBoard = res.myBoard || null;
      state.mode = 'online';

      if (res.status === 'playing' || res.status === 'ended') {
        state.drawnList = (res.drawnList || []).slice();
        state.drawnSet = new Set(state.drawnList);
        state.status = res.status;
        showScreen('screen-game');
        resetGameScreenUI();
        renderAll();
        if (res.status === 'ended') onOnlineEnd();
      } else {
        lobbyLastCategory = null;
        showScreen('screen-lobby');
        renderLobby();
      }
    });
  }

  function onOnlineEnd() {
    const names = state.online.winners.map((tok) => (state.online.players.find((p) => p.token === tok) || {}).name || tok);
    const iWon = state.online.winners.includes(state.online.token);
    const actions = [];
    if (state.online.isHost) actions.push({ label: '🔁 재대결', cls: 'primary', onClick: () => socket.emit('room:rematch') });
    actions.push({ label: '🏠 나가기', cls: state.online.isHost ? 'ghost' : 'primary', onClick: goHome });
    showModal({
      emoji: iWon ? '🎉' : '🏆',
      title: `${names.join(', ')} 승리!`,
      text: iWon ? '축하해요! 빙고를 먼저 완성했어요.' : (state.online.isHost ? '재대결을 눌러 다시 도전해보세요!' : '방장이 재대결을 누르면 대기실로 돌아가요.'),
      actions,
    });
  }

  /* ---------------- 게임 화면 공통 렌더링 ---------------- */
  function currentCategory() { return state.mode === 'online' ? state.online.category : state.category; }
  function currentTarget() { return state.mode === 'online' ? state.online.target : state.target; }

  function resetGameScreenUI() {
    $('#drawHistory').innerHTML = '';
    $('#drawLog').innerHTML = '';
    $('#chatList').innerHTML = '';
    $('#playerProgress').innerHTML = '';
    $('#autoToggle').checked = false;
    $('#drawCurrent').innerHTML = '<span class="draw-hint">아직 아무것도 안 뽑았어요</span>';
    buildQuickMsgs();
    $$('.panel-tabs .tab').forEach((t, i) => t.classList.toggle('active', i === 0));
    $$('.tab-pane').forEach((p, i) => p.classList.toggle('active', i === 0));
  }

  function renderAll() {
    const cat = currentCategory();
    const last = state.drawnList[state.drawnList.length - 1];
    const cur = $('#drawCurrent');
    cur.innerHTML = last
      ? (cat === 'number' ? `<span>${last}</span>` : `<span class="bc-emoji">${EMOJI_MAP[last] || ''}</span><span>${last}</span>`)
      : '<span class="draw-hint">아직 아무것도 안 뽑았어요</span>';

    const hist = $('#drawHistory');
    hist.innerHTML = '';
    state.drawnList.forEach((it) => {
      const c = document.createElement('span');
      c.className = 'draw-chip';
      c.textContent = it;
      hist.appendChild(c);
    });
    hist.scrollTop = hist.scrollHeight;

    const hitSet = state.myBoard ? computeHitSet(state.myBoard, state.drawnSet) : new Set();
    renderBoard($('#gameBoardGrid'), state.myBoard, cat, state.drawnSet, hitSet);

    renderParticipants();

    const log = $('#drawLog');
    log.innerHTML = '';
    state.drawnList.forEach((it, i) => {
      const li = document.createElement('li');
      li.textContent = `${i + 1}. ${it}`;
      log.appendChild(li);
    });
    log.scrollTop = log.scrollHeight;

    updateControlsForMode();
  }

  function renderParticipants() {
    const el = $('#playerProgress');
    el.innerHTML = '';
    const target = currentTarget();
    let list;
    if (state.mode === 'solo') {
      list = [{ id: 'me', name: state.profile.name || '나', avatar: state.profile.avatar || '🙂', lines: linesCountFor(state.myBoard, state.drawnSet), isMe: true }]
        .concat(state.ai.map((a) => ({ id: a.id, name: a.name, avatar: a.avatar, lines: linesCountFor(a.board, state.drawnSet), isMe: false })));
    } else {
      list = state.online.players.map((p) => ({ id: p.token, name: p.name, avatar: p.avatar, lines: p.lines, isMe: p.token === state.online.token, host: p.host }));
    }
    list.sort((a, b) => b.lines - a.lines);
    list.forEach((p) => {
      const li = document.createElement('li');
      const pct = Math.min(100, Math.round((p.lines / target) * 100));
      li.innerHTML = `<div class="pp-top"><span class="pp-avatar">${p.avatar}</span><span class="pp-name">${p.name}${p.isMe ? ' (나)' : ''}${p.host ? ' 👑' : ''}</span><span class="pp-lines">${p.lines}/${target}줄</span></div>` +
        `<div class="pp-bar"><div class="pp-bar-fill${p.lines >= target ? ' win' : ''}" style="width:${pct}%"></div></div>`;
      el.appendChild(li);
    });
  }

  function updateControlsForMode() {
    if (state.mode === 'solo') {
      $('#btnDraw').disabled = state.status !== 'playing';
      $('#autoToggle').disabled = false;
      $('#hostNotice').textContent = '';
      $('#chatText').disabled = true; $('#chatSend').disabled = true;
      $('#chatText').placeholder = '온라인 대전에서만 대화할 수 있어요';
    } else {
      const isHost = state.online.isHost;
      $('#btnDraw').disabled = !isHost || state.status !== 'playing';
      $('#autoToggle').disabled = !isHost;
      $('#hostNotice').textContent = isHost ? '' : '👑 방장만 뽑기 버튼을 누를 수 있어요';
      $('#chatText').disabled = false; $('#chatSend').disabled = false;
      $('#chatText').placeholder = '메시지 보내기';
    }
  }

  $('#btnDraw').addEventListener('click', () => {
    if (state.mode === 'solo') drawSolo();
    else socket.emit('room:draw', (res) => { if (res && res.ok === false) toast(res.message); });
  });

  $('#autoToggle').addEventListener('change', (e) => {
    if (state.mode === 'solo') {
      if (e.target.checked) startAutoSolo(); else stopAutoSolo();
    } else {
      if (!state.online.isHost) { e.target.checked = !e.target.checked; return; }
      socket.emit('room:auto-toggle', { enabled: e.target.checked });
    }
  });

  $('#btnHome').addEventListener('click', () => {
    showModal({
      emoji: '🏠', title: '나가시겠어요?', text: '진행 중인 게임에서 나가요.',
      actions: [
        { label: '취소', cls: 'ghost' },
        { label: '나가기', cls: 'primary', onClick: goHome },
      ],
    });
  });

  function goHome() {
    stopAutoSolo();
    if (state.mode === 'online') leaveOnlineRoom();
    state.mode = null;
    hideModal();
    showScreen('screen-home');
  }

  /* ---------------- 채팅 ---------------- */
  $$('.panel-tabs .tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      $$('.panel-tabs .tab').forEach((t) => t.classList.remove('active'));
      $$('.tab-pane').forEach((p) => p.classList.remove('active'));
      tab.classList.add('active');
      $('#pane-' + tab.dataset.tab).classList.add('active');
    });
  });

  function buildQuickMsgs() {
    const wrap = $('#quickMsgs');
    wrap.innerHTML = '';
    QUICK_MSGS.forEach((m) => {
      const b = document.createElement('button');
      b.textContent = m;
      b.onclick = () => sendChat(m);
      wrap.appendChild(b);
    });
  }
  function sendChat(text) {
    if (!text || state.mode !== 'online') return;
    socket.emit('chat:message', { text });
    $('#chatText').value = '';
  }
  $('#chatSend').addEventListener('click', () => sendChat($('#chatText').value.trim()));
  $('#chatText').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat($('#chatText').value.trim()); });
  function addChatMessage(name, text, mine) {
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<b>${mine ? '나' : name}</b>: ${text}`;
    $('#chatList').appendChild(div);
    $('#chatList').scrollTop = $('#chatList').scrollHeight;
  }

  /* ---------------- 규칙 배우기 ---------------- */
  function buildLearnList() {
    const items = [
      { ico: '🧩', t: '무작위 보드', s: '25개 항목이 무작위로 5×5칸에 놓여요' },
      { ico: '📢', t: '항목 뽑기', s: '뽑힌 항목이 내 보드에 있으면 자동으로 표시돼요' },
      { ico: '➖', t: '줄 완성', s: '가로·세로·대각선 한 줄(5칸)을 채우면 빙고 한 줄이에요' },
      { ico: '🏆', t: '먼저 목표 줄 수 채우기', s: '난이도에서 정한 줄 수를 가장 먼저 채우면 승리해요' },
    ];
    const wrap = $('#learnList');
    wrap.innerHTML = '';
    items.forEach((it) => {
      const div = document.createElement('div');
      div.className = 'learn-item';
      div.innerHTML = `<span class="li-ico">${it.ico}</span><span class="li-text"><b>${it.t}</b><span>${it.s}</span></span>`;
      wrap.appendChild(div);
    });
  }

  /* ---------------- 초기화 ---------------- */
  function init() {
    loadProfile();
    renderSoloOptions();
    renderCreateOptions();
    buildLearnList();
    try {
      const saved = JSON.parse(localStorage.getItem('bingo_room') || 'null');
      if (saved && saved.code && saved.token) ensureSocket();
    } catch (e) { /* 무시 */ }
  }

  init();
})();
