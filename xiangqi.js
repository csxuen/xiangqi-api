// xiangqi.js — Chinese Chess (Xiangqi) rules engine
// Board is 10 rows (0-9) x 9 cols (0-8).
// Row 0 = top (Black's back rank), Row 9 = bottom (Red's back rank).
// River is between row 4 and row 5.
// Red palace: rows 7-9, cols 3-5. Black palace: rows 0-2, cols 3-5.

const RED = 'red';
const BLACK = 'black';

// Piece codes: r=chariot(rook), h=horse, e=elephant, a=advisor, g=general, c=cannon, s=soldier
// Uppercase = Red, lowercase = Black
function initialBoard() {
  return [
    ['r','h','e','a','g','a','e','h','r'],
    [null,null,null,null,null,null,null,null,null],
    [null,'c',null,null,null,null,null,'c',null],
    ['s',null,'s',null,'s',null,'s',null,'s'],
    [null,null,null,null,null,null,null,null,null],
    [null,null,null,null,null,null,null,null,null],
    ['S',null,'S',null,'S',null,'S',null,'S'],
    [null,'C',null,null,null,null,null,'C',null],
    [null,null,null,null,null,null,null,null,null],
    ['R','H','E','A','G','A','E','H','R'],
  ];
}

function isRed(p) { return p && p === p.toUpperCase(); }
function isBlack(p) { return p && p === p.toLowerCase(); }
function ownedBy(p, color) { return p && (color === RED ? isRed(p) : isBlack(p)); }
function inBounds(r, c) { return r >= 0 && r <= 9 && c >= 0 && c <= 8; }

function inPalace(r, c, color) {
  const rowsOk = color === RED ? (r >= 7 && r <= 9) : (r >= 0 && r <= 2);
  return rowsOk && c >= 3 && c <= 5;
}

function crossedRiver(r, color) {
  return color === RED ? r <= 4 : r >= 5;
}

function findGeneral(board, color) {
  const target = color === RED ? 'G' : 'g';
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++)
      if (board[r][c] === target) return [r, c];
  return null;
}

// Raw pseudo-legal moves for a piece at (r,c), ignoring "leaves own general in check"
function pseudoMoves(board, r, c) {
  const p = board[r][c];
  if (!p) return [];
  const color = isRed(p) ? RED : BLACK;
  const type = p.toLowerCase();
  const moves = [];
  const push = (nr, nc) => {
    if (!inBounds(nr, nc)) return false;
    const target = board[nr][nc];
    if (ownedBy(target, color)) return false;
    moves.push([nr, nc]);
    return !target; // true if empty (can keep sliding), false if captured (stop)
  };

  if (type === 'r') { // chariot: slides like a rook
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      while (inBounds(nr, nc)) {
        const cont = push(nr, nc);
        if (!cont) break;
        nr += dr; nc += dc;
      }
    }
  } else if (type === 'c') { // cannon: slides like rook, but captures by jumping exactly one screen
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr, dc] of dirs) {
      let nr = r + dr, nc = c + dc;
      let screenFound = false;
      while (inBounds(nr, nc)) {
        const target = board[nr][nc];
        if (!screenFound) {
          if (!target) { moves.push([nr, nc]); }
          else { screenFound = true; }
        } else {
          if (target) {
            if (!ownedBy(target, color)) moves.push([nr, nc]);
            break;
          }
        }
        nr += dr; nc += dc;
      }
    }
  } else if (type === 'h') { // horse: L-shape, blocked by adjacent piece ("horse leg")
    const legs = [
      [1,0,2,1],[1,0,2,-1],[-1,0,-2,1],[-1,0,-2,-1],
      [0,1,1,2],[0,-1,1,-2],[0,1,-1,2],[0,-1,-1,-2],
    ];
    for (const [legR, legC, dr, dc] of legs) {
      const blockR = r + legR, blockC = c + legC;
      if (inBounds(blockR, blockC) && !board[blockR][blockC]) {
        const nr = r + dr, nc = c + dc;
        if (inBounds(nr, nc) && !ownedBy(board[nr][nc], color)) moves.push([nr, nc]);
      }
    }
  } else if (type === 'e') { // elephant: moves 2 diagonally, never crosses river, blocked by "eye"
    const diag = [[2,2],[2,-2],[-2,2],[-2,-2]];
    for (const [dr, dc] of diag) {
      const nr = r + dr, nc = c + dc;
      const eyeR = r + dr / 2, eyeC = c + dc / 2;
      if (!inBounds(nr, nc)) continue;
      if (crossedRiver(nr, color)) continue; // cannot cross river
      if (board[eyeR][eyeC]) continue; // blocked
      if (!ownedBy(board[nr][nc], color)) moves.push([nr, nc]);
    }
  } else if (type === 'a') { // advisor: 1 diagonal, stays in palace
    const diag = [[1,1],[1,-1],[-1,1],[-1,-1]];
    for (const [dr, dc] of diag) {
      const nr = r + dr, nc = c + dc;
      if (inPalace(nr, nc, color) && !ownedBy(board[nr][nc], color)) moves.push([nr, nc]);
    }
  } else if (type === 'g') { // general: 1 orthogonal, stays in palace
    const orth = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const [dr, dc] of orth) {
      const nr = r + dr, nc = c + dc;
      if (inPalace(nr, nc, color) && !ownedBy(board[nr][nc], color)) moves.push([nr, nc]);
    }
    // Flying general: generals may capture each other along an open column
    const otherGeneral = color === RED ? 'g' : 'G';
    if (c >= 0) {
      let nr = r + (color === RED ? -1 : 1);
      let blocked = false;
      while (inBounds(nr, c)) {
        if (board[nr][c]) {
          if (board[nr][c] === otherGeneral && !blocked) moves.push([nr, c]);
          break;
        }
        nr += (color === RED ? -1 : 1);
      }
    }
  } else if (type === 's') { // soldier: forward 1; after crossing river, also sideways 1
    const forward = color === RED ? -1 : 1;
    const nr = r + forward;
    if (inBounds(nr, c) && !ownedBy(board[nr][c], color)) moves.push([nr, c]);
    if (crossedRiver(r, color)) {
      for (const dc of [1, -1]) {
        const nc = c + dc;
        if (inBounds(r, nc) && !ownedBy(board[r][nc], color)) moves.push([r, nc]);
      }
    }
  }
  return moves;
}

function applyMoveRaw(board, from, to) {
  const nb = board.map(row => row.slice());
  nb[to[0]][to[1]] = nb[from[0]][from[1]];
  nb[from[0]][from[1]] = null;
  return nb;
}

function isInCheck(board, color) {
  const gen = findGeneral(board, color);
  if (!gen) return true; // general captured
  const enemy = color === RED ? BLACK : RED;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && ownedBy(p, enemy)) {
        const moves = pseudoMoves(board, r, c);
        if (moves.some(([mr, mc]) => mr === gen[0] && mc === gen[1])) return true;
      }
    }
  }
  return false;
}

// All fully legal moves for a color (pseudo-legal minus moves that leave own general in check)
function legalMoves(board, color) {
  const result = [];
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (p && ownedBy(p, color)) {
        const raw = pseudoMoves(board, r, c);
        for (const [nr, nc] of raw) {
          const nb = applyMoveRaw(board, [r, c], [nr, nc]);
          if (!isInCheck(nb, color)) {
            result.push({ from: [r, c], to: [nr, nc], piece: p, captured: board[nr][nc] });
          }
        }
      }
    }
  }
  return result;
}

function gameStatus(board, colorToMove) {
  const gen = findGeneral(board, colorToMove);
  if (!gen) return colorToMove === RED ? 'black_win' : 'red_win'; // general already gone
  const moves = legalMoves(board, colorToMove);
  if (moves.length === 0) {
    // checkmate or stalemate -> in xiangqi, stalemate = loss for the stalemated side
    return colorToMove === RED ? 'black_win' : 'red_win';
  }
  return 'ongoing';
}

module.exports = {
  RED, BLACK, initialBoard, isRed, isBlack, legalMoves, applyMoveRaw,
  isInCheck, gameStatus, findGeneral,
};
