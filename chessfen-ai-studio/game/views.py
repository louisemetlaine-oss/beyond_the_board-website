"""
Views for Chess Arena game.
"""
from django.shortcuts import render
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.views.decorators.csrf import csrf_exempt
import json
import chess
import chess.engine
import random
import os


def _open_stockfish():
    """
    Try to open a Stockfish engine from PATH. Returns engine or None.
    """
    engine_path = os.environ.get("STOCKFISH_PATH", "stockfish")
    try:
        return chess.engine.SimpleEngine.popen_uci(engine_path)
    except FileNotFoundError:
        return None
    except Exception:
        return None


def _stockfish_best_move(fen: str, depth: int = 12):
    engine = _open_stockfish()
    if not engine:
        return None, None
    try:
        board = chess.Board(fen)
        info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=1)
        best = info["pv"][0]
        score = info.get("score")
        engine.quit()
        return best, score
    except Exception:
        try:
            engine.quit()
        finally:
            return None, None


def _stockfish_top_moves(fen: str, depth: int = 12, multipv: int = 8):
    engine = _open_stockfish()
    if not engine:
        return []
    try:
        board = chess.Board(fen)
        infos = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=multipv)
        moves = []
        for info in infos:
            if "pv" not in info or len(info["pv"]) == 0:
                continue
            mv = info["pv"][0]
            moves.append({
                "uci": mv.uci(),
                "san": board.san(mv),
                "score": info.get("score").pov(board.turn).score(mate_score=100000) if info.get("score") else None,
                "mate": info.get("score").pov(board.turn).mate() if info.get("score") else None,
                "from": chess.square_name(mv.from_square),
                "to": chess.square_name(mv.to_square),
            })
        engine.quit()
        return moves
    except Exception:
        try:
            engine.quit()
        finally:
            return []


def _stockfish_eval_move(fen: str, move_uci: str, depth: int = 10):
    """
    Evaluate a specific move by making it and analyzing the resulting position.
    Returns score from the perspective of the side that made the move.
    """
    engine = _open_stockfish()
    if not engine:
        return None, None
    try:
        board = chess.Board(fen)
        move = chess.Move.from_uci(move_uci)
        if move not in board.legal_moves:
            engine.quit()
            return None, None
        
        # Make the move and evaluate resulting position
        board.push(move)
        info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=1)
        engine.quit()
        
        # Score is from opponent's perspective after move, so negate it
        score = info.get("score")
        if score:
            # Get score from the perspective of who just moved (negate opponent's view)
            score_cp = -score.pov(board.turn).score(mate_score=100000)
            mate = score.pov(board.turn).mate()
            if mate is not None:
                mate = -mate
            return score_cp, mate
        return None, None
    except Exception as e:
        try:
            engine.quit()
        except:
            pass
        return None, None


# =============================================================================
# ENGINE ABSTRACTION LAYER
# =============================================================================
# This is where you plug in your ML models

def get_engine_analysis(fen: str, engine_type: str = 'stockfish', depth: int = 12, multipv: int = 8):
    """
    Unified interface for getting move analysis from any engine.
    
    To add your ML model:
    1. Add a new elif branch for your engine name
    2. Call your model's API/function
    3. Return data in the same format as stockfish
    
    Expected return format (list of dicts):
    [
        {
            "uci": "e2e4",
            "san": "e4", 
            "score": 35,  # centipawns, positive = good for side to move
            "mate": null,  # or number of moves to mate
            "from": "e2",
            "to": "e4"
        },
        ...
    ]
    """
    if engine_type == 'stockfish':
        return _stockfish_top_moves(fen, depth=depth, multipv=multipv)
    
    elif engine_type == 'random':
        # Simple random fallback
        board = chess.Board(fen)
        moves = []
        for mv in list(board.legal_moves)[:multipv]:
            moves.append({
                "uci": mv.uci(),
                "san": board.san(mv),
                "score": random.randint(-50, 50),  # Random fake score
                "mate": None,
                "from": chess.square_name(mv.from_square),
                "to": chess.square_name(mv.to_square),
            })
        return moves
    
    # =============================================================
    # ADD YOUR ML MODEL HERE
    # =============================================================
    # elif engine_type == 'my_neural_net':
    #     # Example: call your FastAPI endpoint
    #     import requests
    #     response = requests.post(
    #         'http://localhost:8001/analyze',
    #         json={'fen': fen, 'multipv': multipv}
    #     )
    #     return response.json()['moves']
    #
    # elif engine_type == 'alpha_chess':
    #     from my_models import AlphaChessModel
    #     model = AlphaChessModel.load()
    #     return model.analyze(fen, top_k=multipv)
    # =============================================================
    
    else:
        # Unknown engine, fall back to stockfish
        return _stockfish_top_moves(fen, depth=depth, multipv=multipv)


def get_engine_best_move(fen: str, engine_type: str = 'stockfish', depth: int = 12):
    """
    Unified interface for getting the best move from any engine.
    Used for AI opponent moves.
    
    To add your ML model:
    1. Add a new elif branch
    2. Return (move_uci, score_centipawns) or (move_uci, None)
    """
    if engine_type == 'stockfish':
        best, score = _stockfish_best_move(fen, depth=depth)
        if best:
            score_cp = None
            if score:
                board = chess.Board(fen)
                score_cp = score.pov(board.turn).score(mate_score=100000)
            return best.uci(), score_cp
        return None, None
    
    elif engine_type == 'random':
        board = chess.Board(fen)
        legal = list(board.legal_moves)
        if legal:
            mv = random.choice(legal)
            return mv.uci(), None
        return None, None
    
    # =============================================================
    # ADD YOUR ML MODEL HERE
    # =============================================================
    # elif engine_type == 'my_neural_net':
    #     import requests
    #     response = requests.post(
    #         'http://localhost:8001/best-move',
    #         json={'fen': fen}
    #     )
    #     data = response.json()
    #     return data['move'], data.get('score')
    # =============================================================
    
    else:
        best, score = _stockfish_best_move(fen, depth=depth)
        if best:
            return best.uci(), None
        return None, None


def get_single_move_eval(fen: str, move_uci: str, engine_type: str = 'stockfish', depth: int = 10):
    """
    Evaluate a single specific move. Used for real-time HUD updates.
    
    Returns (score_cp, mate) tuple.
    """
    if engine_type == 'stockfish':
        return _stockfish_eval_move(fen, move_uci, depth=depth)
    
    # =============================================================
    # ADD YOUR ML MODEL HERE
    # =============================================================
    # elif engine_type == 'my_neural_net':
    #     import requests
    #     response = requests.post(
    #         'http://localhost:8001/evaluate-move',
    #         json={'fen': fen, 'move': move_uci}
    #     )
    #     data = response.json()
    #     return data.get('score'), data.get('mate')
    # =============================================================
    
    else:
        return _stockfish_eval_move(fen, move_uci, depth=depth)


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
        engine_choice = data.get('engine', 'stockfish')
        
        # Use engine abstraction layer
        move, score_cp = get_engine_best_move(fen, engine_type=engine_choice, depth=12)

        # Fallback if engine failed
        if not move:
            board = chess.Board(fen)
            legal = list(board.legal_moves)
            if legal:
                mv = random.choice(legal)
                move = mv.uci()

        if not move:
            return JsonResponse({'status': 'error', 'message': 'No legal move'}, status=400)

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

        board = chess.Board(fen)

        # Use stockfish for recommendations if available
        top = _stockfish_top_moves(fen, depth=depth, multipv=3)
        if not top:
            # fallback: simple material heuristic
            legal = list(board.legal_moves)
            legal_san = [board.san(mv) for mv in legal][:3]
            return JsonResponse({
                'status': 'fallback',
                'message': 'Stockfish not available; fallback suggestions.',
                'evaluation': None,
                'best_move': legal_san[0] if legal_san else None,
                'recommended': [{'san': mv} for mv in legal_san],
                'dialog': 'Engine unavailable. Playing it safe; develop pieces and control the center.',
                'persona': persona,
            })

        best = top[0]
        recommended = []
        for mv in top:
            board_tmp = board.copy()
            move_obj = chess.Move.from_uci(mv["uci"])
            san = board_tmp.san(move_obj)
            recommended.append({
                "san": san,
                "uci": mv["uci"],
                "score_cp": mv.get("score"),
                "mate": mv.get("mate")
            })

        dialog_map = {
            'aggressive': "Hit fast and hard. Open lines, seek tactics, and keep initiative.",
            'defensive': "Stabilize the position. Cover weaknesses, trade down pressure, and neutralize threats.",
            'balanced': "Healthy development and central control. Improve pieces, avoid unnecessary risks."
        }
        dialog = dialog_map.get(persona, dialog_map['balanced'])

        return JsonResponse({
            'status': 'ok',
            'evaluation': best.get("score"),
            'best_move': recommended[0] if recommended else None,
            'recommended': recommended,
            'dialog': dialog,
            'persona': persona,
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

        # Try stockfish evaluation
        best, score = _stockfish_best_move(fen, depth=8)
        eval_cp = None
        if score:
            eval_cp = score.pov(chess.WHITE).score(mate_score=100000)

        return JsonResponse({
            'status': 'ok',
            'evaluation': eval_cp,
            'win_probability': None,  # Not calculated here
            'received_fen': fen
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
        engine_type = data.get('engine', 'stockfish')
        if not fen:
            return JsonResponse({'error': 'FEN is required'}, status=400)

        try:
            board = chess.Board(fen)
        except ValueError:
            return JsonResponse({'error': 'Invalid FEN'}, status=400)

        # Use engine abstraction layer - get top 20 moves pre-computed
        top_moves = get_engine_analysis(fen, engine_type=engine_type, depth=10, multipv=20)

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
            'top_moves': top_moves  # scored/ranked if engine available
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
        engine_type = data.get('engine', 'stockfish')
        
        if not fen or not move_uci:
            return JsonResponse({'error': 'FEN and move_uci required'}, status=400)
        
        # Use abstraction layer for single move evaluation
        score_cp, mate = get_single_move_eval(fen, move_uci, engine_type=engine_type, depth=8)
        
        return JsonResponse({
            'status': 'ok',
            'score_cp': score_cp,
            'mate': mate,
            'move_uci': move_uci
        })
    except json.JSONDecodeError:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)

