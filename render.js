const CELL = 60;
const MARGIN = 40;
const W = MARGIN * 2 + CELL * 8;
const H = MARGIN * 2 + CELL * 9;

const CHAR = {
  R: '車', H: '馬', E: '相', A: '仕', G: '帥', C: '炮', S: '兵',
  r: '車', h: '馬', e: '象', a: '士', g: '將', c: '炮', s: '卒',
};

function px(col) { return MARGIN + col * CELL; }
function py(row) { return MARGIN + row * CELL; }

function encodeBoardState(board) {
  let s = '';
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) s += board[r][c] || '.';
  return s;
}

function decodeBoardState(str) {
  if (!str || str.length !== 90) return null;
  const board = [];
  for (let r = 0; r < 10; r++) {
    const row = [];
    for (let c = 0; c < 9; c++) {
      const ch = str[r * 9 + c];
      row.push(ch === '.' ? null : ch);
    }
    board.push(row);
  }
  return board;
}

function renderBoardSVG(board, opts = {}) {
  let svg = `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="'PingFang SC','Microsoft YaHei',sans-serif">`;
  svg += `<rect width="${W}" height="${H}" fill="#f4d9a0"/>`;
  for (let r = 0; r <= 9; r++) svg += `<line x1="${px(0)}" y1="${py(r)}" x2="${px(8)}" y2="${py(r)}" stroke="#5a3d1f" stroke-width="2"/>`;
  for (let c = 0; c <= 8; c++) {
    if (c === 0 || c === 8) svg += `<line x1="${px(c)}" y1="${py(0)}" x2="${px(c)}" y2="${py(9)}" stroke="#5a3d1f" stroke-width="2"/>`;
    else {
      svg += `<line x1="${px(c)}" y1="${py(0)}" x2="${px(c)}" y2="${py(4)}" stroke="#5a3d1f" stroke-width="2"/>`;
      svg += `<line x1="${px(c)}" y1="${py(5)}" x2="${px(c)}" y2="${py(9)}" stroke="#5a3d1f" stroke-width="2"/>`;
    }
  }
  svg += `<line x1="${px(3)}" y1="${py(0)}" x2="${px(5)}" y2="${py(2)}" stroke="#5a3d1f" stroke-width="2"/>`;
  svg += `<line x1="${px(5)}" y1="${py(0)}" x2="${px(3)}" y2="${py(2)}" stroke="#5a3d1f" stroke-width="2"/>`;
  svg += `<line x1="${px(3)}" y1="${py(7)}" x2="${px(5)}" y2="${py(9)}" stroke="#5a3d1f" stroke-width="2"/>`;
  svg += `<line x1="${px(5)}" y1="${py(7)}" x2="${px(3)}" y2="${py(9)}" stroke="#5a3d1f" stroke-width="2"/>`;
  svg += `<text x="${W/2 - 90}" y="${(py(4)+py(5))/2 + 8}" font-size="22" fill="#5a3d1f">楚 河</text>`;
  svg += `<text x="${W/2 + 20}" y="${(py(4)+py(5))/2 + 8}" font-size="22" fill="#5a3d1f">漢 界</text>`;
  for (let r = 0; r < 10; r++) for (let c = 0; c < 9; c++) {
    const p = board[r][c];
    if (!p) continue;
    const isRedPiece = p === p.toUpperCase();
    const cx = px(c), cy = py(r);
    svg += `<circle cx="${cx}" cy="${cy}" r="${CELL/2 - 5}" fill="#fdf1d8" stroke="${isRedPiece ? '#c0392b' : '#2c2c2c'}" stroke-width="2.5"/>`;
    svg += `<text x="${cx}" y="${cy + 9}" font-size="26" text-anchor="middle" fill="${isRedPiece ? '#c0392b' : '#2c2c2c'}" font-weight="bold">${CHAR[p]}</text>`;
  }
  svg += `</svg>`;
  return svg;
}

module.exports = { renderBoardSVG, encodeBoardState, decodeBoardState };
