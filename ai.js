const { legalMoves, applyMoveRaw, RED, BLACK, isRed } = require('./xiangqi');

const VALUES = { r: 90, h: 40, e: 20, a: 20, g: 1000, c: 45, s: 10 };

function evaluate(board, forColor) {
  let score = 0;
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 9; c++) {
      const p = board[r][c];
      if (!p) continue;
      const val = VALUES[p.toLowerCase()];
      const pieceColor = isRed(p) ? RED : BLACK;
      score += pieceColor === forColor ? val : -val;
    }
  }
  return score;
}

function minimax(board, color, depth, alpha, beta, maximizing, rootColor) {
  const moves = legalMoves(board, color);
  if (depth === 0 || moves.length === 0) {
    return { score: evaluate(board, rootColor) };
  }
  const nextColor = color === RED ? BLACK : RED;
  let best = null;
  for (const m of moves) {
    const nb = applyMoveRaw(board, m.from, m.to);
    const result = minimax(nb, nextColor, depth - 1, alpha, beta, !maximizing, rootColor);
    const score = result.score;
    if (best === null || (maximizing ? score > best.score : score < best.score)) {
      best = { score, move: m };
    }
    if (maximizing) alpha = Math.max(alpha, score);
    else beta = Math.min(beta, score);
    if (beta <= alpha) break;
  }
  return best;
}

// depth 2 plies is fast and safe on slower free-tier hosting CPUs (well under
// typical caller timeouts of ~20s). Depth 3 plays noticeably better but can
// take 5-20+ seconds on a slow/shared CPU, which is enough to trip timeouts
// in callers like Voiceflow. Raise back to 3 only if your host is fast
// enough — test with `node -e` timing before relying on it in production.
function chooseAiMove(board, aiColor, depth = 2) {
  const result = minimax(board, aiColor, depth, -Infinity, Infinity, true, aiColor);
  return result ? result.move : null;
}

module.exports = { chooseAiMove };
