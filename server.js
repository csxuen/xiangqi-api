const express = require('express');
const crypto = require('crypto');
const {
  RED, BLACK, initialBoard, legalMoves, applyMoveRaw, gameStatus,
} = require('./xiangqi');
const { chooseAiMove } = require('./ai');
const { renderBoardSVG, encodeBoardState, decodeBoardState } = require('./render');

const app = express();
app.use(express.json());

// Allow requests from any origin (Voiceflow, browsers, etc.) — this is a
// small demo backend, not something handling sensitive data, so a wide-open
// CORS policy is fine here and rules out CORS as a source of "can't connect"
// errors from any calling platform.
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// --- In-memory session store ---------------------------------------------
// For production, swap this Map for Redis/a DB keyed by sessionId so games
// survive server restarts and you can run more than one instance.
const games = new Map();

function newSessionId() { return crypto.randomBytes(8).toString('hex'); }

function pieceName(p) {
  const names = { r: 'chariot', h: 'horse', e: 'elephant', a: 'advisor', g: 'general', c: 'cannon', s: 'soldier' };
  return names[p.toLowerCase()];
}

// Human-friendly description: "horse moves forward, capturing your soldier"
// instead of raw board coordinates. Direction is relative to the mover's own
// side — Red advances toward row 0, Black advances toward row 9.
function describeMoveFriendly(move, color) {
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
  return `${pieceName(move.piece)} moves ${direction}${capTxt}`;
}

function describeMove(move) {
  const [fr, fc] = move.from, [tr, tc] = move.to;
  const capTxt = move.captured ? `, capturing your ${pieceName(move.captured)}` : '';
  return `${pieceName(move.piece)} from (${fr},${fc}) to (${tr},${tc})${capTxt}`;
}

// Base URL used to build absolute image links returned to Voiceflow.
// Set PUBLIC_BASE_URL env var to your deployed URL, e.g. https://your-app.onrender.com
const BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

function boardImageUrl(sessionId) {
  // cache-bust with a timestamp so Voiceflow/the chat client doesn't show a stale cached image
  return `${BASE_URL}/board.svg?id=${sessionId}&t=${Date.now()}`;
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
    state.board = applyMoveRaw(state.board, move.from, move.to);
    aiMoveDesc = describeMove(move);
    state.toMove = state.userColor;
  }

  res.json({
    sessionId,
    status: gameStatus(state.board, state.toMove),
    boardImageUrl: boardImageUrl(sessionId),
    aiMoveDescription: aiMoveDesc,
  });
});

// 2. Serve the current board as SVG
// (sessionId is passed as ?id=... rather than "/board/:id.svg" — the dot-in-path
//  pattern behaves differently between Express 4 and Express 5, so this avoids
//  that trap entirely regardless of which version ends up installed.)
app.get('/board.svg', (req, res) => {
  const state = games.get(req.query.id);
  if (!state) return res.status(404).send('Game not found');
  res.set('Content-Type', 'image/svg+xml');
  res.send(renderBoardSVG(state.board));
});

// 3. Apply the user's move.
// Body: { sessionId, from: [r,c], to: [r,c] }
// (The natural-language -> {from,to} parsing happens in Voiceflow via an LLM
//  step constrained to this session's legal-moves list — see /legal-moves.)
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
  res.json({ status, boardImageUrl: boardImageUrl(sessionId) });
});

// 4. Get the legal moves list for the side to move — feed this to your
//    LLM parsing step so it can only ever pick a real, legal move.
//
// IMPORTANT: use the POST version (/legal-moves, sessionId in the JSON body)
// from Voiceflow. Some Voiceflow API tool configurations do not reliably
// substitute {variables} that live inside the URL field at runtime (even
// though they substitute correctly in a manual test, and even though the
// exact same variable substitutes fine inside a JSON body) — so the GET
// versions below are kept only for direct/manual testing with tools like
// Hoppscotch, not for use from Voiceflow.
function handleLegalMoves(req, res) {
  const sessionId = (req.body && req.body.sessionId) || req.query.id || req.params.sessionId;
  const state = games.get(sessionId);
  if (!state) return res.status(404).json({ error: 'Game not found', received: sessionId || null });
  const moves = legalMoves(state.board, state.toMove).map(m => ({
    from: m.from, to: m.to, piece: pieceName(m.piece), captures: m.captured ? pieceName(m.captured) : null,
  }));
  res.json({ toMove: state.toMove, moves });
}
app.post('/legal-moves', handleLegalMoves);   // <-- use this one from Voiceflow
app.get('/legal-moves', handleLegalMoves);    // for manual/browser testing only
app.get('/legal-moves/:sessionId', handleLegalMoves); // for manual/browser testing only

// 5. AI takes its turn.
app.post('/ai-move', (req, res) => {
  const { sessionId } = req.body;
  const state = games.get(sessionId);
  if (!state) return res.status(404).json({ error: 'Game not found', received: sessionId || null });
  if (state.toMove !== state.aiColor) return res.status(400).json({ error: 'Not AI turn' });

  const move = chooseAiMove(state.board, state.aiColor);
  if (!move) {
    // no legal moves for AI = AI is checkmated/stalemated = user wins
    return res.json({ status: 'user_win', boardImageUrl: boardImageUrl(sessionId), aiMoveDescription: null });
  }
  state.board = applyMoveRaw(state.board, move.from, move.to);
  const desc = describeMove(move);
  state.toMove = state.userColor;

  const status = gameStatus(state.board, state.toMove);
  res.json({ status, boardImageUrl: boardImageUrl(sessionId), aiMoveDescription: desc });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Xiangqi backend running on port ${PORT}`));

module.exports = app;

// Paste this at the very bottom of your server.js file
function describeMoveFriendly(move, board, playerColor) {
  const pieceNames = {
    'k': 'General', 'a': 'Advisor', 'e': 'Elephant',
    'h': 'Horse', 'r': 'Chariot', 'c': 'Cannon', 'p': 'Pawn'
  };
  
  const fromRow = move.from[0];
  const fromCol = move.from[1];
  const toRow = move.to[0];
  const toCol = move.to[1];
  
  // Guard check to make sure the piece still exists on the board
  const pieceString = board[fromRow][fromCol];
  if (!pieceString || pieceString === '.') return "a piece";
  
  const piece = pieceString.toLowerCase();
  const pieceName = pieceNames[piece] || 'Piece';
  
  let action = '';
  if (fromRow === toRow) {
    action = `moves sideways to column ${9 - toCol}`;
  } else if ((playerColor === 'red' && toRow < fromRow) || (playerColor === 'black' && toRow > fromRow)) {
    action = `advances forward`;
  } else {
    action = `retreats backward`;
  }
  
  const targetPiece = board[toRow][toCol];
  let captureText = '';
  if (targetPiece && targetPiece !== '.') {
    captureText = ` and captures your ${pieceNames[targetPiece.toLowerCase()]}`;
  }
  
  return `${pieceName} on column ${9 - fromCol} ${action}${captureText}`;
}
