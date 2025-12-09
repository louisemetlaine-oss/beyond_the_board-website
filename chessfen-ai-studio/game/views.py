"""
Views for Chess Arena game.
"""
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json
import chess
import random

import os
import requests

# Cloud endpoint from colleague (fallback to localhost if env not set)
FASTAPI_URL = os.environ.get(
    "FASTAPI_URL",
    "https://beyond-the-board-266726061553.europe-west1.run.app"
)
ENGINE_ENDPOINTS = {
    "Optimus_Prime": f"{FASTAPI_URL}/Optimus_Prime",
     "Shallow_Blue": f"{FASTAPI_URL}/Shallow_Blue",
     "Big_Brother": f"{FASTAPI_URL}/Big_Brother",
}
DEFAULT_ENGINE = "Optimus_Prime"


def _to_cp(val):
    """
    Convert pawn units (as returned by FastAPI) to centipawns for the UI.
    The frontend expects centipawns when formatting scores.
    """
    return None if val is None else val * 100


# def _open_stockfish():
#     """
#     Try to open a Stockfish engine from PATH. Returns engine or None.
#     """
#     engine_path = os.environ.get("STOCKFISH_PATH", "stockfish")
#     try:
#         return chess.engine.SimpleEngine.popen_uci(engine_path)
#     except FileNotFoundError:
#         return None
#     except Exception:
#         return None


# def _stockfish_best_move(fen: str, depth: int = 12):
#     engine = _open_stockfish()
#     if not engine:
#         return None, None
#     try:
#         board = chess.Board(fen)
#         info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=1)
#         best = info["pv"][0]
#         score = info.get("score")
#         engine.quit()
#         return best, score
#     except Exception:
#         try:
#             engine.quit()
#         finally:
#             return None, None


# def _stockfish_top_moves(fen: str, depth: int = 12, multipv: int = 8):
#     engine = _open_stockfish()
#     if not engine:
#         return []
#     try:
#         board = chess.Board(fen)
#         infos = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=multipv)
#         moves = []
#         for info in infos:
#             if "pv" not in info or len(info["pv"]) == 0:
#                 continue
#             mv = info["pv"][0]
#             moves.append({
#                 "uci": mv.uci(),
#                 "san": board.san(mv),
#                 "score": info.get("score").pov(board.turn).score(mate_score=100000) if info.get("score") else None,
#                 "mate": info.get("score").pov(board.turn).mate() if info.get("score") else None,
#                 "from": chess.square_name(mv.from_square),
#                 "to": chess.square_name(mv.to_square),
#             })
#         engine.quit()
#         return moves
#     except Exception:
#         try:
#             engine.quit()
#         finally:
#             return []


# def _stockfish_eval_move(fen: str, move_uci: str, depth: int = 10):
#     """
#     Evaluate a specific move by making it and analyzing the resulting position.
#     Returns score from the perspective of the side that made the move.
#     """
#     engine = _open_stockfish()
#     if not engine:
#         return None, None
#     try:
#         board = chess.Board(fen)
#         move = chess.Move.from_uci(move_uci)
#         if move not in board.legal_moves:
#             engine.quit()
#             return None, None
        
#         # Make the move and evaluate resulting position
#         board.push(move)
#         info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=1)
#         engine.quit()
        
#         # Score is from opponent's perspective after move, so negate it
#         score = info.get("score")
#         if score:
#             # Get score from the perspective of who just moved (negate opponent's view)
#             score_cp = -score.pov(board.turn).score(mate_score=100000)
#             mate = score.pov(board.turn).mate()
#             if mate is not None:
#                 mate = -mate
#             return score_cp, mate
#         return None, None
#     except Exception as e:
#         try:
#             engine.quit()
#         except:
#             pass
#         return None, None


def _fastapi_analyze(fen: str, engine: str = DEFAULT_ENGINE):
    """
    Call the FastAPI endpoint once and return its JSON payload.
    Expected shape (from your colleague):
    {
      "current_eval": float,
      "to_move": "white"|"black",
      "moves": [
        {"move_uci": "...", "move_san": "...", "eval_after": float, "eval_change": float, "improves": bool},
        ...
      ]
    }
    """
    endpoint = ENGINE_ENDPOINTS.get(engine, ENGINE_ENDPOINTS[DEFAULT_ENGINE])
    r = requests.get(endpoint, params={"fen": fen}, timeout=10)
    r.raise_for_status()
    return r.json()


# =============================================================================
# ENGINE ABSTRACTION LAYER (now wired to FastAPI)
# =============================================================================

def get_engine_analysis(fen: str, engine_type: str = "fastapi", depth: int = 12, multipv: int = 8, engine: str = DEFAULT_ENGINE):
    data = _fastapi_analyze(fen, engine=engine)
    moves = data.get("moves", [])[:multipv]
    to_move = data.get("to_move", "white")

    # Sort best-first for side to move: white wants max eval, black wants min eval
    reverse = to_move != "black"
    moves_sorted = sorted(moves, key=lambda m: m.get("eval_after", 0), reverse=reverse)

    out = []
    for idx, mv in enumerate(moves_sorted):
        uci = mv.get("move_uci")
        try:
            mobj = chess.Move.from_uci(uci)
            frm = chess.square_name(mobj.from_square)
            to = chess.square_name(mobj.to_square)
        except Exception:
            frm = to = None
        out.append({
            "uci": uci,
            "san": mv.get("move_san"),
            "score": _to_cp(mv.get("eval_after")),
            "mate": None,
            "from": frm,
            "to": to,
            "rank": idx + 1
        })
    return out


def get_engine_best_move(fen: str, engine_type: str = "fastapi", depth: int = 12, engine: str = DEFAULT_ENGINE):
    data = _fastapi_analyze(fen, engine=engine)
    # Log incoming analysis for visibility
    try:
        first_move = data.get("moves", [None])[0]
        print(f"[engine_best] engine={engine} to_move={data.get('to_move')} current_eval={data.get('current_eval')} first_move={first_move}", flush=True)
    except Exception:
        pass
    moves = data.get("moves", [])
    to_move = data.get("to_move", "white")
    if not moves:
        return None, None

    # Best is max eval for white, min eval for black
    if to_move == "black":
        best = min(moves, key=lambda m: m.get("eval_after", 0))
    else:
        best = max(moves, key=lambda m: m.get("eval_after", 0))
    return best.get("move_uci"), _to_cp(best.get("eval_after"))


def get_single_move_eval(fen: str, move_uci: str, engine_type: str = "fastapi", depth: int = 10, engine: str = DEFAULT_ENGINE):
    data = _fastapi_analyze(fen, engine=engine)
    for mv in data.get("moves", []):
        if mv.get("move_uci") == move_uci:
            return _to_cp(mv.get("eval_after")), None
    return None, None


def index(request):
    """Main game view."""
    return render(request, 'game/index.html')


# =============================================================================
# PLACEHOLDER ENDPOINTS - Will be replaced with FastAPI integration
# =============================================================================

@csrf_exempt
@require_http_methods(["POST"])
def ai_move(request):
    """
    Get AI's next move for the black player.
    Uses the engine abstraction layer - easy to swap with ML models.
    
    Expected Request Body:
    {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "pgn": "1. e4 e5 2. Nf3",
        "engine": "stockfish"  # or "random", or your custom model name
    }
    
    Expected Response:
    {
        "move": "b8c6",  # UCI format
        "status": "ok",
        "engine": "stockfish",
        "score_cp": -30
    }
    
    To add your ML model: see get_engine_best_move() function above
    """
    try:
        data = json.loads(request.body)
        fen = data.get('fen', '')
        engine_choice = data.get('engine', DEFAULT_ENGINE)
        
        # Use engine abstraction layer
        move, score_cp = get_engine_best_move(fen, engine_type='fastapi', depth=12, engine=engine_choice)

        # Log what we received/sent to help diagnose stuck AI turns
        print(f"[ai_move] engine={engine_choice} fen='{fen}' -> move={move} score={score_cp}", flush=True)

        if not move:
            return JsonResponse({'status': 'error', 'message': 'Model unavailable'}, status=503)

        return JsonResponse({
            'status': 'ok',
            'move': move,
            'engine': engine_choice,
            'score_cp': score_cp
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as exc:
        return JsonResponse({'error': str(exc)}, status=500)


@csrf_exempt
@require_http_methods(["POST"])
def coach_analysis(request):
    """
    PLACEHOLDER: Get coaching analysis and move suggestions for the player.
    
    Expected Request Body:
    {
        "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "pgn": "1. e4 e5 2. Nf3",
        "difficulty": "intermediate"  # beginner, intermediate, advanced
    }
    
    Expected Response:
    {
        "evaluation": 0.3,  # Positive = white advantage
        "best_move": "Nc3",
        "explanation": "Develop your knight to control the center...",
        "alternative_moves": [
            {"move": "Bb5", "reason": "Pin the knight and apply pressure"},
            {"move": "d4", "reason": "Challenge the center immediately"}
        ],
        "position_type": "Italian Game",
        "strategic_themes": ["development", "center control"]
    }
    
    TODO: Connect to FastAPI endpoint from your colleague's coaching model
    """
    try:
        data = json.loads(request.body)
        fen = data.get('fen', '')
        pgn = data.get('pgn', '')
        persona = data.get('persona', 'balanced')
        depth = int(data.get('depth', 10))
        engine_choice = data.get('engine', DEFAULT_ENGINE)

        board = chess.Board(fen)

        analysis = get_engine_analysis(fen, engine_type='fastapi', depth=depth, multipv=3, engine=engine_choice)
        if not analysis:
            return JsonResponse({
                'status': 'error',
                'message': 'Model unavailable',
            }, status=503)

        recommended = []
        for mv in analysis:
            recommended.append({
                "san": mv.get("san"),
                "uci": mv.get("uci"),
                "score_cp": mv.get("score"),
                "mate": mv.get("mate"),
                "from": mv.get("from"),
                "to": mv.get("to"),
            })

        dialog_map = {
            'aggressive': "Hit fast and hard. Open lines, seek tactics, and keep initiative.",
            'defensive': "Stabilize the position. Cover weaknesses, trade down pressure, and neutralize threats.",
            'balanced': "Healthy development and central control. Improve pieces, avoid unnecessary risks."
        }
        dialog = dialog_map.get(persona, dialog_map['balanced'])

        return JsonResponse({
            'status': 'ok',
            'evaluation': recommended[0].get("score") if recommended else None,
            'best_move': recommended[0] if recommended else None,
            'recommended': recommended,
            'dialog': dialog,
            'persona': persona,
            'engine': engine_choice,
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)


@csrf_exempt
@require_http_methods(["POST"])
def evaluate_position(request):
    """
    PLACEHOLDER: Get numerical evaluation of the current position.
    
    Expected Request Body:
    {
        "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1"
    }
    
    Expected Response:
    {
        "evaluation": 0.2,  # In pawns, positive = white advantage
        "win_probability": {"white": 0.55, "draw": 0.30, "black": 0.15},
        "is_theoretical": true,
        "depth": 20
    }
    
    TODO: Connect to FastAPI endpoint
    """
    try:
        data = json.loads(request.body)
        fen = data.get('fen', '')
        engine_choice = data.get('engine', DEFAULT_ENGINE)

        data = _fastapi_analyze(fen, engine=engine_choice)
        eval_cp = _to_cp(data.get("current_eval"))

        return JsonResponse({
            'status': 'ok',
            'evaluation': eval_cp,
            'win_probability': None,  # Not calculated here
            'received_fen': fen,
            'engine': engine_choice,
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)


@csrf_exempt
@require_http_methods(["POST"])
def save_game(request):
    """
    Save game state to session for persistence.
    """
    try:
        data = json.loads(request.body)
        request.session['game_state'] = {
            'fen': data.get('fen'),
            'pgn': data.get('pgn'),
            'history': data.get('history', [])
        }
        return JsonResponse({'status': 'saved'})
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)


@require_http_methods(["GET"])
def load_game(request):
    """
    Load game state from session.
    """
    game_state = request.session.get('game_state', None)
    if game_state:
        return JsonResponse({'status': 'found', 'game_state': game_state})
    return JsonResponse({'status': 'not_found', 'game_state': None})


@csrf_exempt
@require_http_methods(["POST"])
def legal_moves(request):
    """
    Return legal moves computed via python-chess for the given FEN.
    Used by the frontend dropdown/list for ranked move previews.
    """
    try:
        data = json.loads(request.body)
        fen = data.get('fen')
        engine_type = 'fastapi'
        engine_choice = data.get('engine', DEFAULT_ENGINE)
        if not fen:
            return JsonResponse({'error': 'FEN is required'}, status=400)

        try:
            board = chess.Board(fen)
        except ValueError:
            return JsonResponse({'error': 'Invalid FEN'}, status=400)

        # Use engine abstraction layer - get top 20 moves pre-computed
        top_moves = get_engine_analysis(fen, engine_type=engine_type, depth=10, multipv=20, engine=engine_choice)
        print(f"[legal_moves] engine={engine_choice} fen='{fen}' top_moves_count={len(top_moves)}", flush=True)

        moves = []
        for mv in board.legal_moves:
            san = board.san(mv)
            is_capture = board.is_capture(mv)
            board.push(mv)
            is_check = board.is_check()
            board.pop()
            moves.append({
                'from': chess.square_name(mv.from_square),
                'to': chess.square_name(mv.to_square),
                'san': san,
                'uci': mv.uci(),
                'is_capture': is_capture,
                'is_check': is_check,
            })

        return JsonResponse({
            'status': 'ok',
            'legal_moves': moves,
            'top_moves': top_moves,  # scored/ranked if engine available
            'engine': engine_choice,
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)


@csrf_exempt
@require_http_methods(["POST"])
def evaluate_move(request):
    """
    Evaluate a single specific move in real-time.
    Used for HUD updates when dragging over squares without pre-computed scores.
    
    Request Body:
    {
        "fen": "current position FEN",
        "move_uci": "e2e4",
        "engine": "stockfish"  # optional, defaults to stockfish
    }
    
    Response:
    {
        "status": "ok",
        "score_cp": 35,
        "mate": null,
        "move_uci": "e2e4"
    }
    """
    try:
        data = json.loads(request.body)
        fen = data.get('fen')
        move_uci = data.get('move_uci')
        engine_type = 'fastapi'
        engine_choice = data.get('engine', DEFAULT_ENGINE)
        
        if not fen or not move_uci:
            return JsonResponse({'error': 'FEN and move_uci required'}, status=400)
        
        # Use abstraction layer for single move evaluation
        score_cp, mate = get_single_move_eval(fen, move_uci, engine_type=engine_type, depth=8, engine=engine_choice)
        
        return JsonResponse({
            'status': 'ok',
            'score_cp': score_cp,
            'mate': mate,
            'move_uci': move_uci,
            'engine': engine_choice,
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

