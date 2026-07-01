const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
app.use(cors());
app.use(bodyParser.json());

/**
 * 1. START GAME
 */
app.post("/new-game", (req, res) => {

    const board = req.body.board_data;

    // for now we DON'T generate real image
    // we just return a fake image link

    res.json({
        image_url: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Chess_brd.png",
        board_data: board
    });
});


/**
 * 2. PLAYER MOVE (fake version for now)
 */
app.post("/player-move", (req, res) => {

    const { board_data, move } = req.body;

    // TODO later: update board properly

    res.json({
        valid: true,
        message: "Move accepted (demo mode)",
        board_data: board_data,
        image_url: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Chess_brd.png"
    });
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});

app.post("/player-move", (req, res) => {

    const { board_data, move } = req.body;

    // TEMP: fake move logic for now
    // (we will upgrade later to real Xiangqi rules)

    const updatedBoard = board_data;

    res.json({
        valid: true,
        player_move: move,
        bot_move: "Horse b1 -> c3",
        board_data: board_data,
        image_url: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Chess_brd.png"
    });
});