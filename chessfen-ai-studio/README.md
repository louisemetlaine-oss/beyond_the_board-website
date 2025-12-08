# Chess Arena 🏰♟️

An interactive chess application where you play as White against an AI opponent (Black). Features an integrated coaching system powered by ML models.

![Chess Arena](https://img.shields.io/badge/Django-6.0-green) ![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-blue) ![DaisyUI](https://img.shields.io/badge/DaisyUI-4.4-purple)

## Features

- 🎮 **Play as White** against an AI opponent
- 🤖 **AI Opponent** - Placeholder for your team's ML model (FastAPI)
- 🎓 **AI Coach** - Get move suggestions and position analysis
- 📊 **Position Evaluation** - Real-time board evaluation
- 🌙 **Dark/Light Mode** - Beautiful UI with theme toggle
- 💾 **Game Persistence** - Games save automatically
- 📋 **FEN Export** - Copy board state for ML pipelines
- 📜 **Move History** - Full game notation

## Quick Start

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run migrations
python manage.py migrate

# Start the server
python manage.py runserver
```

Visit `http://127.0.0.1:8000` in your browser.

## Project Structure

```
chess_arena/
├── chess_arena/          # Django project settings
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── game/                 # Main game app
│   ├── views.py         # Views + API placeholders
│   ├── urls.py
│   └── templates/
│       └── game/
│           └── index.html
├── static/
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── chess-arena.js
├── manage.py
└── requirements.txt
```

## Architecture at a Glance (for non-Django folks)

- Browser loads a single page at `/` from Django.
- Django renders `game/templates/game/index.html`, which pulls:
  - CSS from `static/css/app.css`
  - JS from `static/js/app.js`
  - CDN libs: Tailwind/DaisyUI, chess.js, chessboard.js, jQuery
- After load, the browser JS drives all UI and calls Django JSON APIs:
  - `/api/ai-move/`, `/api/coach/`, `/api/evaluate/`, `/api/evaluate-move/`, `/api/legal-moves/`, `/api/save-game/`, `/api/load-game/`
- Django views in `game/views.py` parse JSON, use `python-chess` + (optional) Stockfish, and return JSON. SQLite stores sessions for persistence.
- Think “Streamlit split in two”: HTML/JS handle the interface, Django handles compute/endpoints.

### Where to plug your ML/FastAPI model
- Engine abstraction lives in `game/views.py` (`get_engine_best_move`, `get_engine_analysis`, `get_single_move_eval`).
- Add a branch like `elif engine_type == 'my_neural_net':` to call your FastAPI endpoint, then return moves/evals in the same shape as the Stockfish helpers.
- Frontend already passes `engine` from the dropdown; any new engine name you add can be selected without changing the UI.

## API Endpoints (Placeholders for FastAPI)

The following endpoints are ready for your colleague's FastAPI integration:

### `POST /api/ai-move/`
Get the AI's next move for the black player.

**Request:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "pgn": "1. e4",
  "history": ["e4"]
}
```

**Expected Response:**
```json
{
  "move": "e5",
  "from": "e7",
  "to": "e5",
  "confidence": 0.95,
  "evaluation": -0.1
}
```

### `POST /api/coach/`
Get coaching analysis and move suggestions.

**Request:**
```json
{
  "fen": "...",
  "pgn": "...",
  "difficulty": "intermediate"
}
```

**Expected Response:**
```json
{
  "evaluation": 0.3,
  "best_move": "Nc3",
  "explanation": "Develop your knight to control the center...",
  "alternative_moves": [
    {"move": "Bb5", "reason": "Pin the knight"},
    {"move": "d4", "reason": "Challenge the center"}
  ],
  "position_type": "Italian Game",
  "strategic_themes": ["development", "center control"]
}
```

### `POST /api/evaluate/`
Get numerical evaluation of the current position.

**Request:**
```json
{
  "fen": "..."
}
```

**Expected Response:**
```json
{
  "evaluation": 0.2,
  "win_probability": {"white": 0.55, "draw": 0.30, "black": 0.15},
  "depth": 20
}
```

## Integrating Your FastAPI Model

1. **Option A: Proxy through Django**
   - Update the view functions in `game/views.py` to call your FastAPI endpoints
   - Use `requests` library to forward requests

2. **Option B: Direct Frontend Connection**
   - Update `API_ENDPOINTS` in `static/js/chess-arena.js` to point to your FastAPI server
   - Ensure CORS is configured on your FastAPI server

Example FastAPI integration in `views.py`:

```python
import requests

FASTAPI_URL = "http://localhost:8001"  # Your FastAPI server

@csrf_exempt
@require_http_methods(["POST"])
def ai_move(request):
    data = json.loads(request.body)
    
    # Forward to FastAPI
    response = requests.post(
        f"{FASTAPI_URL}/predict-move",
        json=data
    )
    
    return JsonResponse(response.json())
```

## Tech Stack

- **Backend**: Django 6.0
- **Frontend**: Vanilla JS + jQuery
- **Styling**: Tailwind CSS + DaisyUI
- **Chess Logic**: chess.js + chessboard.js
- **Fonts**: Outfit (UI), JetBrains Mono (code)

## UI Components

| Component | Description |
|-----------|-------------|
| Player Card | Shows your stats (moves, captures) |
| AI Coach Panel | ML-powered move suggestions |
| Position Eval | Evaluation bar + win probabilities |
| AI Opponent | Neural network player status |
| Move History | PGN notation of the game |
| Game Info | Opening, phase, material count |
| FEN Display | Copy-able board state |

## Themes

Toggle between dark mode (Night) and light mode (Emerald) using the button in the navbar.

## License

MIT

---

**Built for ML Data Collection** • Ready for FastAPI Integration
