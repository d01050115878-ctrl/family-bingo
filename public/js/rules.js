/* =========================================================
   숫자·테마 빙고 규칙 엔진 (브라우저 & Node 양쪽에서 사용)
   ========================================================= */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BingoRules = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const SIZE = 5;
  const CELLS = SIZE * SIZE; // 25칸 = 카테고리별 항목 25개와 정확히 대응

  const CATEGORIES = {
    number: {
      key: 'number', label: '숫자 빙고', emoji: '🔢',
      items: Array.from({ length: 25 }, (_, i) => String(i + 1)),
    },
    animal: {
      key: 'animal', label: '동물·곤충 빙고', emoji: '🐯',
      items: [
        '사자', '호랑이', '코끼리', '기린', '하마', '얼룩말', '곰', '여우', '늑대', '토끼',
        '다람쥐', '고양이', '강아지', '돼지', '소', '말', '사슴', '원숭이', '판다', '캥거루',
        '나비', '벌', '개미', '메뚜기', '사슴벌레',
      ],
    },
    fruit: {
      key: 'fruit', label: '과일 빙고', emoji: '🍎',
      items: [
        '사과', '바나나', '포도', '딸기', '수박', '참외', '복숭아', '배', '감', '귤',
        '오렌지', '레몬', '자두', '체리', '망고', '파인애플', '키위', '멜론', '석류', '무화과',
        '살구', '자몽', '블루베리', '코코넛', '아보카도',
      ],
    },
  };
  const CATEGORY_KEYS = Object.keys(CATEGORIES);

  // 난이도(레벨) -> 승리에 필요한 줄 수
  const DIFFICULTIES = { 1: 3, 2: 4, 3: 5 };
  function targetLines(level) { return DIFFICULTIES[level] || DIFFICULTIES[1]; }
  function normalizeLevel(level) {
    const n = Number(level);
    return DIFFICULTIES[n] ? n : 1;
  }

  function buildLines() {
    const lines = [];
    for (let r = 0; r < SIZE; r++) lines.push(Array.from({ length: SIZE }, (_, c) => r * SIZE + c));
    for (let c = 0; c < SIZE; c++) lines.push(Array.from({ length: SIZE }, (_, r) => r * SIZE + c));
    lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + i));
    lines.push(Array.from({ length: SIZE }, (_, i) => i * SIZE + (SIZE - 1 - i)));
    return lines; // 5행 + 5열 + 대각선 2개 = 12줄
  }
  const LINES = buildLines();

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function randomBoard(categoryKey) {
    const cat = CATEGORIES[categoryKey];
    if (!cat) return null;
    return shuffle(cat.items);
  }

  function isValidCategory(key) { return !!CATEGORIES[key]; }

  function normalizeCategory(key) { return isValidCategory(key) ? key : 'number'; }

  function isValidBoard(board, categoryKey) {
    const cat = CATEGORIES[categoryKey];
    if (!cat || !Array.isArray(board) || board.length !== CELLS) return false;
    const need = new Set(cat.items);
    const seen = new Set();
    for (const v of board) {
      if (!need.has(v) || seen.has(v)) return false;
      seen.add(v);
    }
    return seen.size === CELLS;
  }

  function markedFromDraws(board, drawnSet) {
    return board.map((v) => drawnSet.has(v));
  }

  function countCompletedLines(markedBoolArray) {
    let count = 0;
    const completed = [];
    LINES.forEach((line) => {
      if (line.every((idx) => markedBoolArray[idx])) {
        count++;
        completed.push(line);
      }
    });
    return { count, completed };
  }

  return {
    SIZE, CELLS, CATEGORIES, CATEGORY_KEYS, DIFFICULTIES,
    targetLines, normalizeLevel, normalizeCategory,
    LINES, shuffle, randomBoard, isValidCategory, isValidBoard,
    markedFromDraws, countCompletedLines,
  };
});
