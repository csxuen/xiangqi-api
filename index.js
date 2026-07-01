const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const { initialBoard, applyMove } = require("./game");

const app = express();
app.use(cors());
app.use(bodyParser.json());

const games = {};

/**
 * START GAME
 */
app.post("/new-game", (req, res) => {

    const game_id = Date.now().toString();

    games[game_id] = {
        board: JSON.parse(JSON.stringify(initialBoard))
    };

    res.json({
        game_id,
        image_url: "https://quickchart.io/chart?text=Game+Started"
    });
});


/**
 * PLAYER MOVE
 */
app.post("/player-move", async (req, res) => {

    const { game_id, move } = req.body;

    const game = games[game_id];

    if (!game) {
        return res.json({
            valid: false,
            message: "Game not found"
        });
    }

    const parsed = parseMove(move);

    // find piece position
    let from = null;

    for (let p in game.board) {
        if (p.includes(parsed.piece)) {
            from = game.board[p];
            break;
        }
    }

    if (!from || !parsed.to) {
        return res.json({
            valid: false,
            message: "Invalid move format"
        });
    }

    // PLAYER MOVE
    const result1 = applyMove(game.board, from, parsed.to);
    game.board = result1.board;

    const image_after_player =
        generateImage(game.board);

    // BOT MOVE (simple fixed for now)
    const botFrom = "b_horse1";
    const botTo = "c3";

    const result2 = applyMove(game.board, game.board[botFrom], botTo);
    game.board = result2.board;

    const image_after_bot =
        generateImage(game.board);

    res.json({
        valid: true,
        player_move: move,
        bot_move: "horse b1 -> c3",
        image_after_player,
        image_after_bot
    });

});


/**
 * SIMPLE IMAGE (NO INSTALLS)
 */
function generateImage(board) {

    const text = Object.entries(board)
        .map(([p, pos]) => `${p}:${pos}`)
        .join("|");

    return `https://quickchart.io/chart?c={
        type:'bar',
        data:{
            labels:['${encodeURIComponent(text)}'],
            datasets:[{label:'board',data:[1]}]
        }
    }`;
}


/**
 * MOVE PARSER
 */
function parseMove(text) {

    text = text.toLowerCase();

    let piece = null;
    let to = null;

    if (text.includes("horse")) piece = "horse";
    if (text.includes("rook")) piece = "rook";
    if (text.includes("cannon")) piece = "cannon";
    if (text.includes("soldier")) piece = "soldier";
    if (text.includes("general")) piece = "general";

    const match = text.match(/[a-i][1-9][0]?/);
    if (match) to = match[0];

    return { piece, to };
}

app.listen(3000, () => {
    console.log("Server running on port 3000");
});