const express = require('express');
const crypto = require('crypto');
const {
  RED, BLACK, initialBoard, legalMoves, applyMoveRaw, gameStatus,
} = require('./xiangqi');
const { chooseAiMove } = require('./ai');
const { renderBoardSVG, encodeBoardState, decodeBoardState } = require('./render');

const app = express();
app.use(express.json());

// Allow requests from any origin (Voiceflow, browsers, etc.)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// --- In-memory session store ---------------------------------------------
const games = new Map();

function newSessionId() { return crypto.randomBytes(8).toString('hex'); }

function pieceName(p) {
  const names = { r: 'chariot', h: 'horse', e: 'elephant', a: 'advisor', g: 'general', c: 'cannon', s: 'soldier' };
  return names[p.toLowerCase()];
}

// Human-friendly description: "horse forward, capturing your soldier"
function describeMoveFriendly(move, color) {
  // FIX: We need these lines to extract the coordinates and calculate the distance!
  const [fr, fc] = move.from, [tr, tc] = move.to;
  const rowDelta = tr - fr;
  const colDelta = tc - fc;

  let vert = '';
  if (rowDelta !== 0) {
    const movingTowardRow0 = rowDelta < 0;
    const isForward = color === RED ? movingTowardRow0 : !movingTowardRow0;
    vert = isForward ? 'forward' : 'backward'; 
  }
  let horiz = '';
  if (colDelta !== 0) horiz = colDelta > 0 ? 'right' : 'left';

  let direction;
  if (vert && horiz) direction = `${vert} and to the ${horiz}`;
  else if (vert) direction = vert;
  else if (horiz) direction = `to the ${horiz}`;
  else direction = 'in place';

  const capTxt = move.captured ? `, capturing your ${pieceName(move.captured)}` : '';
  return `${pieceName(move.piece)} ${direction}${capTxt}`; 
}

// Base URL used to build absolute image links returned to Voiceflow.
const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

// FIX: Generate an completely unique URL based entirely on the snapshot layout array
function buildSnapshotUrl(board) {
  const encodedStr = encodeBoardState(board);
  return `${BASE_URL}/board/${encodedStr}.svg?t=${Date.now()}`;
}

// --- Routes ----------------------------------------------------------------

// 1. Start a new game. Body: { color: "red" | "black" }
app.post('/new-game', (req, res) => {
  const userColor = (req.body.color || 'red').toLowerCase() === 'black' ? BLACK : RED;
  const sessionId = newSessionId();
  const board = initialBoard();
  games.set(sessionId, { board, userColor, aiColor: userColor === RED ? BLACK : RED, toMove: RED });

  const state = games.get(sessionId);
  let aiMoveDesc = null;

  // If the user chose Black, Red (AI) moves first.
  if (state.toMove === state.aiColor) {
    const move = chooseAiMove(state.board, state.aiColor);
    aiMoveDesc = describeMoveFriendly(move, state.aiColor); // FIX: Swapped to friendly translation
    state.board = applyMoveRaw(state.board, move.from, move.to);
    state.toMove = state.userColor;
  }

  res.json({
    sessionId,
    status: gameStatus(state.board, state.toMove),
    boardImageUrl: buildSnapshotUrl(state.board), // FIX: Swapped to snapshot URL
    aiMoveDescription: aiMoveDesc,
  });
});

// 2. Serve an absolute, immutable board based directly on the URL string
app.get('/board/:boardState.svg', (req, res) => {
  const board = decodeBoardState(req.params.boardState);
  if (!board) return res.status(404).send('Invalid board layout asset');
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.send(renderBoardSVG(board));
});

// 3. Apply the user's move.
app.post('/move', (req, res) => {
  const { sessionId, from, to } = req.body;
  const state = games.get(sessionId);
  if (!state) return res.status(404).json({ error: 'Game not found', received: sessionId || null });
  if (state.toMove !== state.userColor) return res.status(400).json({ error: 'Not your turn' });

  const moves = legalMoves(state.board, state.userColor);
  const match = moves.find(m => m.from[0] === from[0] && m.from[1] === from[1] && m.to[0] === to[0] && m.to[1] === to[1]);
  if (!match) return res.status(400).json({ error: 'Illegal move' });

  state.board = applyMoveRaw(state.board, match.from, match.to);
  state.toMove = state.aiColor;

  const status = gameStatus(state.board, state.toMove);
  res.json({ status, boardImageUrl: buildSnapshotUrl(state.board) }); // FIX: Swapped to snapshot URL
});

// 4. Get the legal moves list
function handleLegalMoves(req, res) {
  const sessionId = (req.body && req.body.sessionId) || req.query.id || req.params.sessionId;
  const state = games.get(sessionId);
  if (!state) return res.status(404).json({ error: 'Game not found', received: sessionId || null });
  const moves = legalMoves(state.board, state.toMove).map(m => ({
    from: m.from, to: m.to, piece: pieceName(m.piece), captures: m.captured ? pieceName(m.captured) : null,
  }));
  res.json({ toMove: state.toMove, moves });
}
app.post('/legal-moves', handleLegalMoves);
app.get('/legal-moves', handleLegalMoves);

// 5. AI takes its turn.
app.post('/ai-move', (req, res) => {
  const { sessionId } = req.body;
  const state = games.get(sessionId);
  if (!state) return res.status(404).json({ error: 'Game not found', received: sessionId || null });
  if (state.toMove !== state.aiColor) return res.status(400).json({ error: 'Not AI turn' });

  const move = chooseAiMove(state.board, state.aiColor);
  if (!move) {
    return res.json({ status: 'user_win', boardImageUrl: buildSnapshotUrl(state.board), aiMoveDescription: null });
  }
  
  const desc = describeMoveFriendly(move, state.aiColor); // FIX: Swapped to friendly translation
  state.board = applyMoveRaw(state.board, move.from, move.to);
  state.toMove = state.userColor;

  const status = gameStatus(state.board, state.toMove);
  res.json({ status, boardImageUrl: buildSnapshotUrl(state.board), aiMoveDescription: desc }); // FIX: Swapped to snapshot URL
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Xiangqi backend running on port ${PORT}`));

module.exports = app;
