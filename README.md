# Xiangqi Backend for Voiceflow

A minimal backend that gives your Voiceflow chatbot a real, rule-legal
Chinese Chess (Xiangqi) opponent with a rendered board image. No native
dependencies (pure SVG rendering), so it deploys anywhere Node runs.

## Files
- `xiangqi.js` — board representation + full legal-move generation (all 7
  piece types, river, palace, flying-general rule, horse-leg/elephant-eye
  blocking) + win detection.
- `ai.js` — minimax (depth 3) opponent. Only ever picks from `legalMoves`,
  so it can never make an illegal move. Raise `depth` in `ai.js` for a
  stronger (slower) bot.
- `render.js` — draws the board as an SVG string (no canvas/cairo needed).
- `server.js` — Express API that Voiceflow calls.

## 1. Run it locally
```bash
npm install
npm start
```
Server runs on `http://localhost:3000`.

## 2. Deploy it (needs a public HTTPS URL for Voiceflow)
Easiest options, in order of simplicity:
- **Render.com** — "New Web Service", connect this folder/repo, build
  command `npm install`, start command `npm start`. Free tier works.
- **Railway.app** — similar, auto-detects Node.
- **Fly.io** — `fly launch` then `fly deploy`.

After deploying, set the environment variable:
```
PUBLIC_BASE_URL=https://<your-deployed-url>
```
This is used to build the absolute image URLs returned to Voiceflow. If you
skip it, image URLs will point at `localhost` and Voiceflow won't be able
to load them.

## 3. API endpoints

### `POST /new-game`
Body: `{ "color": "red" | "black" }`
Returns:
```json
{
  "sessionId": "71006fa8...",
  "status": "ongoing",
  "boardImageUrl": "https://.../board/71006fa8....svg?t=...",
  "aiMoveDescription": null
}
```
`aiMoveDescription` is non-null if the user picked black (AI moves first as Red).

### `GET /legal-moves/:sessionId`
Returns the side-to-move and every legal move, e.g.:
```json
{ "toMove": "red", "moves": [ { "from": [6,2], "to": [5,2], "piece": "soldier", "captures": null }, ... ] }
```
Use this to constrain your move-parsing LLM prompt (step 4 below) so it can
only ever select a real legal move — never a hallucinated one.

### `POST /move`
Body: `{ "sessionId": "...", "from": [r,c], "to": [r,c] }`
Applies the user's move if legal. Returns:
```json
{ "status": "ongoing" | "red_win" | "black_win", "boardImageUrl": "..." }
```
Returns `400 { "error": "Illegal move" }` if the from/to pair isn't in the
current legal-moves list.

### `POST /ai-move`
Body: `{ "sessionId": "..." }`
Makes the AI's move. Returns:
```json
{ "status": "ongoing" | "red_win" | "black_win", "boardImageUrl": "...", "aiMoveDescription": "horse from (7,1) to (5,2)" }
```

### `GET /board.svg?id=<sessionId>`
Serves the current board image. This is the URL you show in Voiceflow's
Image step. (Session id is a query param rather than part of the path —
that avoids a routing quirk where Express 4 vs Express 5 handle a literal
dot in a path parameter, like `:id.svg`, differently. If you ever add
routes yourself, prefer query params or a plain path segment over a
dot-in-path pattern for the same reason.)

Board coordinates are `[row, col]`, row 0 = top (Black's back rank),
row 9 = bottom (Red's back rank), col 0-8 left to right.

---

## 4. Wiring it up in Voiceflow, step by step

### Step A — Start Game
1. Add two **Buttons**: "Play as Red" / "Play as Black" → set variable
   `player_color` to `"red"` / `"black"`.
2. Add an **API Step**:
   - Method: `POST`
   - URL: `https://<your-url>/new-game`
   - Body (JSON): `{ "color": "{player_color}" }`
   - Save response `sessionId` → variable `session_id`
   - Save response `status` → variable `game_status`
   - Save response `boardImageUrl` → variable `board_image`
   - Save response `aiMoveDescription` → variable `ai_move_desc`
3. Add an **Image Step**, source = `{board_image}`.
4. Add a **Condition**: if `ai_move_desc` is not empty →
   Text step: `"I opened with {ai_move_desc}."` → Image step again
   (re-show `{board_image}` — it'll already reflect the AI's opening move).

### Step B — The move loop
This is a loop, so build it as its own block/component you can jump back
into.

1. **Capture step** (or a Choice with "type your move") — save user's
   text to `user_move_text`.
2. **API Step** — fetch current legal moves for parsing:
   - `GET /legal-moves/{session_id}`
   - Save `moves` → variable `legal_moves_json`
3. **AI Step (Voiceflow's native LLM step, or an API call to Claude/OpenAI)**
   — this is where natural language gets turned into a move. Prompt template:

   ```
   You are converting a Chinese Chess (Xiangqi) move instruction into one
   exact move from a list of legal moves.

   Legal moves (JSON): {legal_moves_json}

   User said: "{user_move_text}"

   Pick the single legal move that best matches what the user described.
   Respond with ONLY raw JSON, no other text, in this exact shape:
   {"from":[r,c],"to":[r,c]} — copied exactly from one of the legal moves
   above. If nothing in the list plausibly matches, respond with exactly:
   {"error":"no_match"}
   ```

   Save the model's output → variable `parsed_move_json`.

4. **Code Step** (Voiceflow supports a JS code step) — parse
   `parsed_move_json` into `move_from` / `move_to` variables, and set a
   boolean `move_parse_failed` if it was `{"error":"no_match"}` or invalid
   JSON.

5. **Condition**: if `move_parse_failed` → Text: *"I couldn't match that to
   a legal move — try describing it differently (e.g. 'chariot from column
   1 forward to row 5')."* → loop back to step 1.

6. **API Step** — apply the move:
   - `POST /move`
   - Body: `{ "sessionId": "{session_id}", "from": {move_from}, "to": {move_to} }`
   - Save `status` → `game_status`, `boardImageUrl` → `board_image`
   - If the API returns `400` (illegal — shouldn't normally happen since
     you constrained the LLM, but handle it) → Text: "That move isn't
     legal right now." → loop back to step 1.

7. **Image step** — show `{board_image}`.

8. **Condition** on `game_status`:
   - `user_win` → Text: **"You win! 🎉"** → End (or offer rematch)
   - anything else (`ongoing`) → continue to Step C

### Step C — AI's turn
1. **API Step**:
   - `POST /ai-move`, body `{ "sessionId": "{session_id}" }`
   - Save `status` → `game_status`, `boardImageUrl` → `board_image`,
     `aiMoveDescription` → `ai_move_desc`
2. **Text step**: `"I moved my {ai_move_desc}."`
3. **Image step**: show `{board_image}`.
4. **Condition** on `game_status`:
   - `red_win` / `black_win` (whichever is the AI's color) → Text:
     **"You lose."** → End
   - `ongoing` → **loop back to Step B, step 1** (capture next user move)

### Variables checklist
| Variable | Set by | Purpose |
|---|---|---|
| `player_color` | button choice | which side the user plays |
| `session_id` | `/new-game` | identifies this game on the backend |
| `board_image` | every API step | URL shown in the Image step |
| `game_status` | every API step | drives win/loss/loop conditions |
| `user_move_text` | capture step | raw user input |
| `legal_moves_json` | `/legal-moves` | fed to the LLM parsing step |
| `parsed_move_json` | LLM step | LLM's chosen move |
| `move_from` / `move_to` | code step | parsed into `/move` body |

### Notes / gotchas
- **Cache-busting**: `boardImageUrl` includes a `?t=timestamp` query param
  specifically so Voiceflow's chat UI doesn't cache a stale board image
  when only the query param would otherwise stay the same.
- **SVG rendering**: most chat widgets/webviews render `<img src="...svg">`
  fine. If your deployment channel doesn't support SVG images, you'll need
  to convert to PNG — easiest fix is adding `@napi-rs/canvas` (prebuilt
  binaries, no compile step, unlike `node-canvas`) and rasterizing the SVG,
  or calling a hosted SVG→PNG API.
- **Sessions are in-memory** (a JS `Map`). Fine for a demo/single-instance
  deployment; for production swap it for Redis or a small database so games
  survive restarts/scaling.
- **AI strength**: `ai.js` depth defaults to 3 plies (fast, beginner-club
  strength — appropriate for a *learning assistant*). Bump to 4-5 in
  `chooseAiMove(board, aiColor, depth)` for stronger but slower play.
