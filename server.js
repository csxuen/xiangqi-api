// Add these helper functions at the top of server.js to encode/decode the board state
function encodeBoard(board) {
  // Converts the 10x9 board array into a short, URL-safe string
  return Buffer.from(JSON.stringify(board))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeBoard(encoded) {
  try {
    let base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) base64 += '=';
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
  } catch (e) {
    return null;
  }
}

// 1. Update your public board image generator string everywhere in server.js:
// Inside /new-game, /parse-and-move, and /ai-move, change the boardImageUrl to:
const encodedSnapshot = encodeBoard(session.board);
const boardImageUrl = `${process.env.PUBLIC_BASE_URL}/board/${encodedSnapshot}.svg?t=${Date.now()}`;

// 2. Add this dedicated, immutable route at the bottom of server.js:
app.get('/board/:encodedState.svg', (req, res) => {
  const board = decodeBoard(req.params.encodedState);
  if (!board) {
    return res.status(400).send('Invalid board state');
  }
  
  // Import your SVG renderer function
  const renderBoardSVG = require('./render.js').renderBoardSVG; 
  const svgString = renderBoardSVG(board);
  
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.status(200).send(svgString);
});
