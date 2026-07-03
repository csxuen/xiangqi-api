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

function chooseAiMove(board, aiColor, depth = 2) {
  const moves = legalMoves(board, aiColor);
  if (moves.length === 0) return null;

  const nextColor = aiColor === RED ? BLACK : RED;
  const scoredMoves = [];

  // 1. Score every single legal move
  for (const m of moves) {
    const nb = applyMoveRaw(board, m.from, m.to);
    const result = minimax(nb, nextColor, depth - 1, -Infinity, Infinity, false, aiColor);
    scoredMoves.push({ move: m, score: result.score });
  }

  // 2. Sort moves from highest score to lowest score
  scoredMoves.sort((a, b) => b.score - a.score);

  // 3. Find the absolute highest score achieved
  const bestScore = scoredMoves[0].score;

  // 4. Gather all moves that are the absolute best, or within a tiny "human error" margin (e.g., within 5 points)
  const topMoves = scoredMoves.filter(sm => sm.score >= bestScore - 5);

  // 5. Pick one of these top moves completely at random!
  const randomIndex = Math.floor(Math.random() * topMoves.length);
  return topMoves[randomIndex].move;
}

module.exports = { chooseAiMove };
