const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");

const { initialBoard } = require("./game");

const app = express();

app.use(cors());
app.use(bodyParser.json());

/**
 * START NEW GAME
 */
app.post("/new-game", (req, res) => {

    res.json({
        valid: true,
        board_data: initialBoard,
        image_url: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Chess_brd.png"
    });

});


/**
 * PLAYER MOVE
 */
app.post("/player-move", (req, res) => {

    const { board_data, move } = req.body;

    // For now, we don't change the board.
    // We'll add real move logic later.

    res.json({
        valid: true,
        player_move: move,
        bot_move: "Horse b1 -> c3",
        board_data: board_data,
        image_url: "https://upload.wikimedia.org/wikipedia/commons/1/1b/Chess_brd.png"
    });

});


app.listen(3000, () => {
    console.log("Server running on port 3000");
});