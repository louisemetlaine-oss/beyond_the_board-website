/**
 * Chess Arena - Main Application
 * Separated from HTML for proper architecture
 */

(function() {
    'use strict';

    // ===========================================
    // State
    // ===========================================
    const game = new Chess();
    let board = null;
    let orientation = 'white';
    let aiMoves = 0;
    let aiCaptures = 0;
    let highlightedSquares = [];
    let legalMovesCache = [];
    let selectedEngine = 'Optimus_Prime';         // Black (AI opponent)
    let selectedCoachEngine = 'Optimus_Prime';    // White coach suggestions
    
    // Drag tracking state
    let isDragging = false;
    let dragSourceSquare = null;
    let currentDragTarget = null;
    let evalRequestQueue = new Map(); // For debouncing real-time evals
    let evalCache = new Map(); // Cache for computed evals
    let currentFen = ''; // Track FEN to clear cache on position change
    let defaultPaneSplit = 50;

    // ===========================================
    // DOM Elements
    // ===========================================
    const elements = {
        board: document.getElementById('board'),
        moveSelect: document.getElementById('moveSelect'),
        playMoveBtn: document.getElementById('playMoveBtn'),
        movesList: document.getElementById('movesList'),
        moveCount: document.getElementById('moveCount'),
        turnStatus: document.getElementById('turnStatus'),
        statusDot: document.getElementById('statusDot'),
        fenDisplay: document.getElementById('fenDisplay'),
        copyFenBtn: document.getElementById('copyFenBtn'),
        newGameBtn: document.getElementById('newGameBtn'),
        undoBtn: document.getElementById('undoBtn'),
        flipBtn: document.getElementById('flipBtn'),
        coachToggle: document.getElementById('coachToggle'),
        coachAdvice: document.getElementById('coachAdvice'),
        recommendedMoves: document.getElementById('recommendedMoves'),
        topMoves: document.getElementById('topMoves'),
        coachDialogue: document.getElementById('coachDialogue'),
        aiStatus: document.getElementById('aiStatus'),
        aiMoves: document.getElementById('aiMoves'),
        aiCaptures: document.getElementById('aiCaptures'),
        moveHistory: document.getElementById('moveHistory'),
        evalBar: document.getElementById('evalBar'),
        evalScore: document.getElementById('evalScore'),
        aiEvalCp: document.getElementById('aiEvalCp'),
        hudQuality: document.getElementById('hudQuality'),
        hudFromTo: document.getElementById('hudFromTo'),
        hudSan: document.getElementById('hudSan'),
        hudScore: document.getElementById('hudScore'),
        hudRank: document.getElementById('hudRank'),
        themeToggle: document.getElementById('themeToggle'),
        engineSelect: document.getElementById('engineSelect'),
        coachSelect: document.getElementById('coachSelect'),
        askCoachBtn: document.getElementById('askCoachBtn'),
        toast: document.getElementById('toast'),
        toastAlert: document.getElementById('toastAlert'),
        toastMsg: document.getElementById('toastMsg'),
        gameOverModal: document.getElementById('gameOverModal'),
        gameOverTitle: document.getElementById('gameOverTitle'),
        gameOverMsg: document.getElementById('gameOverMsg'),
        playAgainBtn: document.getElementById('playAgainBtn'),
        hudCard: document.getElementById('hudCard'),
        hudStatus: document.getElementById('hudStatus'),
        hudHint: document.getElementById('hudHint'),
        paneSplit: document.getElementById('paneSplit'),
        movesPane: document.getElementById('movesPane'),
        chatPane: document.getElementById('chatPane')
    };

    // ===========================================
    // Board Setup
    // ===========================================
    function initBoard() {
        board = Chessboard('board', {
            position: 'start',
            draggable: true,
            pieceTheme: 'https://chessboardjs.com/img/chesspieces/wikipedia/{piece}.png',
            onDragStart: onDragStart,
            onDrop: onDrop,
            onSnapEnd: onSnapEnd,
            onMouseoverSquare: onMouseoverSquare,
            onMouseoutSquare: onMouseoutSquare
        });

        $(window).resize(function() {
            board.resize();
        });
    }

    function onDragStart(source, piece, position, orientation) {
        if (game.game_over()) return false;
        if (game.turn() === 'b') return false;
        if (piece.search(/^b/) !== -1) return false;
        
        // Track drag state
        isDragging = true;
        dragSourceSquare = source;
        currentDragTarget = null;
        
        // Highlight legal moves with quality colors
        const moves = game.moves({ square: source, verbose: true });
        highlightSquare(source, 'source');
        moves.forEach(m => {
            const cached = legalMovesCache.find(cm => cm.from === source && cm.to === m.to);
            const quality = getMoveQuality(cached);
            highlightSquare(m.to, quality);
        });
        
        // Setup drag-through tracking via jQuery UI events
        setupDragTracking(source, moves);
        
        // Update HUD status
        setHudStatus('DRAGGING', 'active');
        
        return true;
    }
    
    // Track mouse position during drag to update HUD
    function setupDragTracking(source, legalMoves) {
        const $board = $('#board');
        const legalTargets = new Set(legalMoves.map(m => m.to));
        
        $board.on('mousemove.dragtrack', function(e) {
            if (!isDragging) return;
            
            // Find square under cursor
            const squareSize = $board.width() / 8;
            const offset = $board.offset();
            const relX = e.pageX - offset.left;
            const relY = e.pageY - offset.top;
            
            let file, rank;
            if (orientation === 'white') {
                file = Math.floor(relX / squareSize);
                rank = 7 - Math.floor(relY / squareSize);
            } else {
                file = 7 - Math.floor(relX / squareSize);
                rank = Math.floor(relY / squareSize);
            }
            
            if (file < 0 || file > 7 || rank < 0 || rank > 7) return;
            
            const square = String.fromCharCode(97 + file) + (rank + 1);
            
            // Only update if we moved to a new square
            if (square !== currentDragTarget) {
                currentDragTarget = square;
                
                // Check if it's a legal target
                if (legalTargets.has(square)) {
                    // Find the move info
                    const move = legalMoves.find(m => m.to === square);
                    const cached = legalMovesCache.find(cm => cm.from === source && cm.to === square);
                    
                    // Update HUD with this potential move
                    const moveInfo = {
                        san: cached?.san || move?.san,
                        from: source,
                        to: square,
                        score_cp: cached?.score_cp,
                        mate: cached?.mate,
                        rank: cached?.rank,
                        captured: cached?.captured || move?.captured,
                        is_check: cached?.is_check || (move?.san && move.san.includes('+'))
                    };
                    
                    setHoverHud(moveInfo);
                    
                    // If no score, request real-time evaluation
                    if (moveInfo.score_cp === undefined && moveInfo.mate === undefined) {
                        requestRealTimeEval(source, square, moveInfo);
                    }
                    
                    // Add visual feedback on drag target
                    highlightDragTarget(square);
                }
            }
        });
    }
    
    function highlightDragTarget(square) {
        // Remove previous drag target highlight
        $('.highlight-drag-target').removeClass('highlight-drag-target');
        // Add to current
        $('#board .square-' + square).addClass('highlight-drag-target');
    }
    
    function cleanupDragTracking() {
        $('#board').off('mousemove.dragtrack');
        $('.highlight-drag-target').removeClass('highlight-drag-target');
        isDragging = false;
        dragSourceSquare = null;
        currentDragTarget = null;
    }

    function onDrop(source, target) {
        cleanupDragTracking();
        clearHighlights();
        
        const move = game.move({
            from: source,
            to: target,
            promotion: 'q'
        });

        if (move === null) {
            setHudStatus('INVALID', 'error');
            return 'snapback';
        }

        setHudStatus('EXECUTED', 'success');
        updateUI();
        saveGame();

        if (game.game_over()) {
            setTimeout(showGameOver, 300);
            return;
        }

        setTimeout(makeAIMove, 400);
    }

    function onSnapEnd() {
        board.position(game.fen());
    }

    function onMouseoverSquare(square, piece) {
        if (game.turn() !== 'w') return;
        if (!piece || piece.search(/^b/) !== -1) return;

        const moves = game.moves({ square: square, verbose: true });
        if (moves.length === 0) return;

        // Highlight the source square
        highlightSquare(square, 'source');

        // For each target square, determine quality from cached scores
        moves.forEach(m => {
            const cached = legalMovesCache.find(cm => cm.from === square && cm.to === m.to);
            const quality = getMoveQuality(cached);
            highlightSquare(m.to, quality);
        });

        // Update HUD with best move from this piece
        const scored = moves.map(mv => {
            const cached = legalMovesCache.find(cm => cm.from === square && cm.to === mv.to);
            return { cached, mv };
        }).map(item => ({
            san: item.cached?.san || item.mv.san,
            from: item.mv.from,
            to: item.mv.to,
            score_cp: item.cached?.score_cp,
            mate: item.cached?.mate,
            rank: item.cached?.rank,
            captured: item.cached?.captured || item.mv.captured,
            is_check: item.cached?.is_check || item.mv.san.includes('+')
        }));
        const best = scored.sort((a, b) => movePriorityScore(b) - movePriorityScore(a))[0];
        if (best) {
            setHoverHud(best);
            
            // Request real-time eval if best move has no score
            if (best.score_cp === undefined && best.mate === undefined) {
                requestRealTimeEval(best.from, best.to, best);
            }
        }
    }

    function onMouseoutSquare(square, piece) {
        if (!isDragging) {
            clearHighlights();
        }
    }

    // Get move quality class based on score/rank
    function getMoveQuality(move) {
        if (!move) return 'neutral';
        
        // If we have a rank from Stockfish
        if (move.rank) {
            if (move.rank === 1) return 'excellent';
            if (move.rank <= 3) return 'good';
            if (move.rank <= 5) return 'neutral';
            return 'poor';
        }
        
        // If we have centipawn score
        if (typeof move.score_cp === 'number') {
            if (move.score_cp >= 100) return 'excellent';
            if (move.score_cp >= 0) return 'good';
            if (move.score_cp >= -100) return 'neutral';
            return 'poor';
        }
        
        // Fallback: captures/checks are decent
        if (move.captured || move.is_check) return 'good';
        return 'neutral';
    }

    function highlightSquare(square, quality = 'neutral') {
        const $square = $('#board .square-' + square);
        const className = quality === 'source' ? 'highlight-source' : `highlight-${quality}`;
        $square.addClass(className);
        highlightedSquares.push({ square, className });
    }

    function clearHighlights() {
        highlightedSquares.forEach(item => {
            if (typeof item === 'string') {
                // Legacy format
                $('#board .square-' + item).removeClass('highlight-square highlight-source highlight-excellent highlight-good highlight-neutral highlight-poor');
            } else {
                $('#board .square-' + item.square).removeClass(item.className);
            }
        });
        highlightedSquares = [];
        resetHoverHud();
    }

    // ===========================================
    // Legal Moves
    // ===========================================
    function formatScoreLabel(scoreCp, mate) {
        if (mate !== null && mate !== undefined) {
            return mate === 0 ? '#0' : `#${mate}`;
        }
        if (scoreCp === null || scoreCp === undefined || Number.isNaN(scoreCp)) {
            return '';
        }
        const pawns = (scoreCp / 100).toFixed(Math.abs(scoreCp) >= 1000 ? 0 : 2);
        return `${scoreCp > 0 ? '+' : ''}${pawns}`;
    }

    function movePriorityScore(move) {
        if (!move) return 0;
        if (move.mate !== null && move.mate !== undefined) {
            return 100000 - Math.abs(move.mate || 0) * 1000;
        }
        if (typeof move.score_cp === 'number') {
            return move.score_cp;
        }
        return (move.captured ? 10 : 0) + (move.is_check ? 5 : 0) + (move.is_mate ? 100 : 0);
    }
    
    // Deterministic comparator: rank wins; else centipawn; else heuristics
    function compareMoves(a, b) {
        if (a?.rank && b?.rank) return a.rank - b.rank;
        if (a?.rank) return -1;
        if (b?.rank) return 1;
        const aScore = typeof a.score_cp === 'number' ? a.score_cp : movePriorityScore(a);
        const bScore = typeof b.score_cp === 'number' ? b.score_cp : movePriorityScore(b);
        if (aScore !== bScore) return bScore - aScore;
        // Tie-breakers: captures then checks
        const aCaps = a?.captured ? 1 : 0;
        const bCaps = b?.captured ? 1 : 0;
        if (aCaps !== bCaps) return bCaps - aCaps;
        const aChk = a?.is_check ? 1 : 0;
        const bChk = b?.is_check ? 1 : 0;
        return bChk - aChk;
    }
    
    function textClassForQuality(quality) {
        switch (quality) {
            case 'excellent': return 'text-emerald-300';
            case 'good': return 'text-cyan-300';
            case 'neutral': return 'text-amber-300';
            case 'poor': return 'text-red-300';
            default: return 'text-base-content/60';
        }
    }

    async function updateLegalMoves() {
        // Only compute/display coach suggestions for White (user) turn.
        if (game.turn() !== 'w') {
            legalMovesCache = [];
            elements.moveCount.textContent = 0;
            return;
        }
        
        // Clear eval cache when position changes
        const newFen = game.fen();
        if (newFen !== currentFen) {
            evalCache.clear();
            currentFen = newFen;
        }
        
        // Try server (python-chess) first
        let moves = [];
        let topMoves = [];
        try {
            const res = await fetch('/api/legal-moves/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen: game.fen(), engine: selectedCoachEngine })
            });
            const data = await res.json();
            if (Array.isArray(data.top_moves)) {
                topMoves = data.top_moves;
            }
            const scoreMap = new Map();
            topMoves.forEach((mv, idx) => {
                if (mv && mv.uci) {
                    scoreMap.set(mv.uci, { score_cp: mv.score, mate: mv.mate, rank: idx + 1 });
                }
            });
            if (Array.isArray(data.legal_moves)) {
                moves = data.legal_moves.map((m, idx) => {
                    const scored = scoreMap.get(m.uci);
                    return {
                        san: m.san,
                        from: m.from,
                        to: m.to,
                        uci: m.uci,
                        captured: m.is_capture,
                        is_check: m.is_check,
                        is_mate: m.san && m.san.includes('#'),
                        score_cp: scored?.score_cp,
                        mate: scored?.mate,
                        rank: scored?.rank,
                        id: `${m.from}-${m.to}-${idx}`
                    };
                });
            }
        } catch (e) {
            showToast('Model offline. Please start FastAPI.', 'error');
            return;
        }

        if (moves.length === 0) {
            showToast('No moves returned by model.', 'error');
            return;
        }

        legalMovesCache = moves;

        // Update count
        elements.moveCount.textContent = moves.length;

        // Update select dropdown
        elements.moveSelect.innerHTML = '<option disabled selected>Choose a move...</option>';
        moves.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.san;
            const scoreTag = formatScoreLabel(m.score_cp, m.mate);
            const rankTag = m.rank ? `#${m.rank} ` : '';
            const iconTag = (!scoreTag) ? `${m.captured ? '⚔️' : ''}${m.is_check ? '♔' : ''}${m.is_mate ? '🏆' : ''}` : '';
            opt.textContent = `${rankTag}${m.san}${scoreTag ? ` (${scoreTag})` : iconTag ? ` ${iconTag}` : ''}`;
            elements.moveSelect.appendChild(opt);
        });

        // Sort list by importance
        const sorted = [...moves].sort(compareMoves);

        if (sorted.length === 0) {
            elements.movesList.innerHTML = '<p class="text-base-content/50 text-center py-4">No legal moves</p>';
            return;
        }

        elements.movesList.innerHTML = sorted.map((m, i) => {
            const isBest = m.rank === 1 || (i === 0 && !m.rank);
            const scoreTag = formatScoreLabel(m.score_cp, m.mate);
            const quality = getMoveQuality(m);
            const qualityText = textClassForQuality(quality);
            const badge = m.rank ? `<span class="best-chip">#${m.rank}</span>` : (isBest ? '<span class="best-chip">BEST</span>' : '');
            const fallbackIcon = `${m.captured ? '⚔️ ' : ''}${m.is_check ? '♔' : ''}${m.is_mate ? '🏆' : ''}`;
            return `
                <div class="move-item ${isBest ? 'best' : ''}" 
                     data-san="${m.san}" data-from="${m.from}" data-to="${m.to}">
                    <div class="flex items-center gap-2">
                        ${badge}
                        <span class="font-mono font-medium">${m.san}</span>
                    </div>
                    <div class="text-right">
                        <span class="text-xs font-mono ${qualityText} ${isBest ? 'font-semibold' : ''}">
                            ${scoreTag || fallbackIcon || '--'}
                        </span>
                    </div>
                </div>
            `;
        }).join('');

        // Event listeners with hover preview
        elements.movesList.querySelectorAll('.move-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                clearHighlights();
                highlightSquare(item.dataset.from);
                highlightSquare(item.dataset.to);
            });
            item.addEventListener('mouseleave', clearHighlights);
            item.addEventListener('click', () => {
                elements.moveSelect.value = item.dataset.san;
                playSelectedMove();
            });
        });

        // Highlight selected in dropdown change
        elements.moveSelect.onchange = () => {
            const san = elements.moveSelect.value;
            const mv = findMoveBySAN(san);
            if (mv) {
                clearHighlights();
                highlightSquare(mv.from);
                highlightSquare(mv.to);
            }
        };
    }

    function findMoveBySAN(san) {
        return legalMovesCache.find(m => m.san === san);
    }

    function playSelectedMove() {
        const san = elements.moveSelect.value;
        if (!san || san.startsWith('Choose')) return;
        if (game.turn() !== 'w') {
            showToast('Wait for Black to move', 'warning');
            return;
        }

        const move = game.move(san);
        if (move) {
            board.position(game.fen());
            clearHighlights();
            updateUI();
            saveGame();

            if (game.game_over()) {
                setTimeout(showGameOver, 300);
                return;
            }

            setTimeout(makeAIMove, 400);
        }
    }

    // ===========================================
    // AI Move
    // ===========================================
    function uciToMoveSpec(uci) {
        // Convert UCI like "e2e4" or "e7e8q" to the object chess.js expects
        if (typeof uci !== 'string' || uci.length < 4) return uci;
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promo = uci.length >= 5 ? uci[4] : undefined;
        return promo ? { from, to, promotion: promo } : { from, to };
    }

    async function makeAIMove() {
        if (game.game_over() || game.turn() !== 'b') return;

        elements.aiStatus.innerHTML = `
            <span class="flex items-center gap-1">
                <span class="loading loading-spinner loading-xs"></span>
                <span class="text-xs">Thinking</span>
            </span>
        `;

        let aiScoreCp = null;
        // Try backend API first
        try {
            const res = await fetch('/api/ai-move/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fen: game.fen(), pgn: game.pgn(), engine: selectedEngine })
            });
            const data = await res.json();

            if (data.move && data.status !== 'placeholder') {
                // Backend returns UCI; chess.js needs SAN or {from,to}
                const move = game.move(uciToMoveSpec(data.move));
                if (move) {
                    if (move.captured) aiCaptures++;
                    aiMoves++;
                    aiScoreCp = typeof data.score_cp === 'number' ? data.score_cp : null;
                    finishAIMove(aiScoreCp);
                    return;
                }
            }
        } catch (e) {
            showToast('Model offline. Please start FastAPI.', 'error');
            return;
        }
    }

    function finishAIMove(aiScoreCp = null) {
        board.position(game.fen());
        elements.aiMoves.textContent = aiMoves;
        elements.aiCaptures.textContent = aiCaptures;
        elements.aiStatus.innerHTML = `
            <span class="flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-success"></span>
                <span class="text-xs">Ready</span>
            </span>
        `;
        elements.aiEvalCp.textContent = formatScoreLabel(aiScoreCp, null) || '--';
        updateUI();
        saveGame();

        if (game.game_over()) {
            setTimeout(showGameOver, 300);
        }
    }

    // ===========================================
    // UI Updates
    // ===========================================
    async function updateUI() {
        // FEN
        elements.fenDisplay.textContent = game.fen();

        // Turn status
        const turn = game.turn() === 'w' ? 'White' : 'Black';
        elements.turnStatus.textContent = `${turn} to move`;
        elements.statusDot.className = `w-2 h-2 rounded-full ${game.turn() === 'w' ? 'bg-success' : 'bg-error'} animate-pulse`;

        // Legal moves
        await updateLegalMoves();

        // History
        updateHistory();

        // Evaluation
        updateEval();

        // Coach
        updateCoach();

        // Buttons
        elements.undoBtn.disabled = game.history().length === 0;
        elements.playMoveBtn.disabled = game.turn() !== 'w' || game.game_over();
    }

    function updateHistory() {
        const history = game.history();
        if (history.length === 0) {
            elements.moveHistory.innerHTML = '<span class="text-base-content/40">No moves yet</span>';
            return;
        }

        // Compact inline format: 1.e4 e5 2.Nf3 Nc6 ...
        let html = '';
        for (let i = 0; i < history.length; i += 2) {
            const num = Math.floor(i / 2) + 1;
            html += `<span class="text-base-content/40">${num}.</span>`;
            html += `<span class="text-base-content/80">${history[i]}</span> `;
            if (history[i + 1]) {
                html += `<span class="text-base-content/80">${history[i + 1]}</span> `;
            }
        }
        elements.moveHistory.innerHTML = html;
        elements.moveHistory.scrollTop = elements.moveHistory.scrollHeight;
    }

    function updateEval() {
        const fen = game.fen().split(' ')[0];
        const values = { p: 1, n: 3, b: 3, r: 5, q: 9 };
        let white = 0, black = 0;

        for (const c of fen) {
            const lower = c.toLowerCase();
            if (values[lower]) {
                if (c === c.toUpperCase()) white += values[lower];
                else black += values[lower];
            }
        }

        const diff = white - black;
        elements.evalScore.textContent = diff >= 0 ? `+${diff}` : `${diff}`;
        const pct = Math.min(90, Math.max(10, 50 + diff * 5));
        elements.evalBar.style.height = `${pct}%`;
    }

    function updateCoach() {
        // If coach off, clear
        if (!elements.coachToggle.checked) {
            elements.topMoves.innerHTML = '<p class="text-xs text-base-content/50 italic">Coach disabled</p>';
            return;
        }

        // Only show coach suggestions for White's turn
        if (game.turn() !== 'w') {
            elements.topMoves.innerHTML = '<p class="text-xs text-base-content/50 italic">AI is thinking...</p>';
            clearHighlights();
            return;
        }

        // Use cached legal moves (from python-chess if available)
        const moves = legalMovesCache.length ? legalMovesCache : game.moves({ verbose: true }).map(m => ({
            san: m.san, from: m.from, to: m.to, captured: m.captured,
            is_check: m.san.includes('+'), is_mate: m.san.includes('#')
        }));

        if (moves.length === 0) {
            elements.topMoves.innerHTML = '<p class="text-xs text-base-content/50">No legal moves</p>';
            return;
        }

        // Sort all moves by priority and render in a single list (no dropdown)
        const sorted = [...moves].sort(compareMoves);
        elements.topMoves.innerHTML = sorted.map((m, i) => renderMoveItem(m, i)).join('');

        // Add click/hover handlers to the single list
        addMoveItemHandlers(elements.topMoves);
    }

    function renderMoveItem(m, i) {
        const quality = getMoveQuality(m);
        const qualityClass = quality === 'excellent' ? 'move-excellent' : quality === 'good' ? 'move-good' : quality === 'poor' ? 'move-poor' : '';
        return `
            <div class="move-item ${i === 0 ? 'best' : ''} ${qualityClass}" data-san="${m.san}" data-from="${m.from}" data-to="${m.to}">
                <div class="flex items-center gap-2">
                    <span class="font-mono text-sm font-medium">${m.san}</span>
                    ${m.rank ? `<span class="best-chip">#${m.rank}</span>` : (i === 0 ? '<span class="best-chip">BEST</span>' : '')}
                </div>
                <span class="text-xs ${i === 0 ? 'text-primary font-semibold' : 'text-base-content/50'}">
                    ${formatScoreLabel(m.score_cp, m.mate) || (m.captured ? '⚔' : m.is_check ? '♔' : '')}
                </span>
            </div>
        `;
    }

    function addMoveItemHandlers(container) {
        container.querySelectorAll('.move-item').forEach(item => {
            item.addEventListener('mouseenter', () => {
                if (game.turn() !== 'w') return;
                clearHighlights();
                const from = item.dataset.from;
                const to = item.dataset.to;
                if (from && to) {
                    highlightSquare(from, 'source');
                    const cached = legalMovesCache.find(m => m.from === from && m.to === to);
                    highlightSquare(to, getMoveQuality(cached));
                    
                    const moveInfo = {
                        san: cached?.san || item.dataset.san,
                        from,
                        to,
                        score_cp: cached?.score_cp,
                        mate: cached?.mate,
                        rank: cached?.rank,
                        captured: cached?.captured,
                        is_check: cached?.is_check
                    };
                    
                    setHoverHud(moveInfo);
                    
                    // Request real-time eval if no score computed
                    if (moveInfo.score_cp === undefined && moveInfo.mate === undefined) {
                        requestRealTimeEval(from, to, moveInfo);
                    }
                }
            });
            item.addEventListener('mouseleave', clearHighlights);
            item.addEventListener('click', () => {
                if (game.turn() !== 'w') return;
                elements.moveSelect.value = item.dataset.san;
                playSelectedMove();
            });
        });
    }

    function setHoverHud(move) {
        if (!move) {
            resetHoverHud();
            return;
        }
        const score = formatScoreLabel(move.score_cp, move.mate);
        elements.hudFromTo.textContent = move.from && move.to ? `${move.from} → ${move.to}` : '--';
        elements.hudSan.textContent = move.san || '--';
        elements.hudScore.textContent = score || (move.score_cp === undefined ? '...' : '--');
        elements.hudRank.textContent = move.rank ? `#${move.rank}` : '--';
        
        const quality = getMoveQuality(move);
        elements.hudQuality.textContent = quality.toUpperCase();
        
        // Use sci-fi badge classes
        const badgeClass = {
            'excellent': 'hud-badge-excellent',
            'good': 'hud-badge-good',
            'neutral': 'hud-badge-neutral',
            'poor': 'hud-badge-poor'
        }[quality] || 'badge-ghost';
        
        elements.hudQuality.className = `badge badge-sm ${badgeClass}`;
        
        // Activate HUD card visual state
        elements.hudCard.classList.add('hud-active');
        
        // Update status if not already in special state
        if (elements.hudStatus && !elements.hudStatus.classList.contains('animate-pulse')) {
            setHudStatus('TARGETING', 'active');
        }
    }

    function resetHoverHud() {
        elements.hudFromTo.textContent = '--';
        elements.hudSan.textContent = '--';
        elements.hudScore.textContent = '--';
        elements.hudRank.textContent = '--';
        elements.hudQuality.textContent = '--';
        elements.hudQuality.className = 'badge badge-sm badge-ghost';
        elements.hudCard.classList.remove('hud-active');
        setHudStatus('STANDBY', 'idle');
    }
    
    // ===========================================
    // Sidebar Split Slider (Moves vs Chat)
    // ===========================================
    function applyPaneSplit(splitValue) {
        const val = Math.max(30, Math.min(70, Number(splitValue) || defaultPaneSplit));
        const other = 100 - val;
        if (elements.movesPane) {
            elements.movesPane.style.flexGrow = val;
            elements.movesPane.style.flexBasis = '0';
        }
        if (elements.chatPane) {
            elements.chatPane.style.flexGrow = other;
            elements.chatPane.style.flexBasis = '0';
        }
        if (elements.paneSplit) {
            elements.paneSplit.value = val;
        }
        localStorage.setItem('chess-pane-split', val);
    }

    function setHudStatus(status, type = 'idle') {
        if (!elements.hudStatus) return;
        elements.hudStatus.textContent = status;
        
        // Color based on type
        const colors = {
            'idle': 'opacity-50',
            'active': 'text-cyan-400',
            'loading': 'text-yellow-400 animate-pulse',
            'success': 'text-green-400',
            'error': 'text-red-400'
        };
        elements.hudStatus.className = `text-xs font-mono ${colors[type] || colors.idle}`;
    }
    
    // ===========================================
    // Real-Time Evaluation System
    // ===========================================
    let lastEvalTarget = null; // Track what we're evaluating to update correctly
    
    async function requestRealTimeEval(from, to, moveInfo) {
        const key = `${from}-${to}`; // Simpler key since cache clears on FEN change
        lastEvalTarget = key;
        
        // Check cache first
        if (evalCache.has(key)) {
            const cached = evalCache.get(key);
            updateMoveWithEval(moveInfo, cached);
            return;
        }
        
        // Debounce: cancel previous pending request for different move
        if (evalRequestQueue.has('pending')) {
            clearTimeout(evalRequestQueue.get('pending'));
        }
        
        setHudStatus('COMPUTING...', 'loading');
        
        // Shorter debounce (100ms) for snappier feel
        const timeoutId = setTimeout(async () => {
            try {
                const response = await fetch('/api/evaluate-move/', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        fen: game.fen(),
                        move_uci: from + to,
                        engine: selectedCoachEngine
                    })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    evalCache.set(key, data);
                    
                    // Only update HUD if we're still looking at this move
                    if (lastEvalTarget === key) {
                        updateMoveWithEval(moveInfo, data);
                        setHudStatus('ANALYZED', 'success');
                    }
                    
                    // Also update the legalMovesCache for this move
                    const idx = legalMovesCache.findIndex(m => m.from === from && m.to === to);
                    if (idx !== -1) {
                        legalMovesCache[idx].score_cp = data.score_cp;
                        legalMovesCache[idx].mate = data.mate;
                        // Re-render the move item with new score if visible
                        updateMoveItemScore(from, to, data);
                    }
                } else {
                    setHudStatus('ERROR', 'error');
                }
            } catch (e) {
                console.log('Real-time eval failed:', e);
                setHudStatus('OFFLINE', 'error');
            }
            evalRequestQueue.delete('pending');
        }, 100);
        
        evalRequestQueue.set('pending', timeoutId);
    }
    
    // Update a move item's displayed score after real-time eval
    function updateMoveItemScore(from, to, evalData) {
        const scoreText = formatScoreLabel(evalData.score_cp, evalData.mate);
        if (!scoreText) return;
        
        // Find the move item in both containers
        [elements.topMoves, elements.moreMoves].forEach(container => {
            const item = container.querySelector(`.move-item[data-from="${from}"][data-to="${to}"]`);
            if (item) {
                const scoreSpan = item.querySelector('span.text-xs:last-child');
                if (scoreSpan) {
                    scoreSpan.textContent = scoreText;
                }
            }
        });
    }
    
    function updateMoveWithEval(moveInfo, evalData) {
        if (evalData.score_cp !== undefined) {
            moveInfo.score_cp = evalData.score_cp;
        }
        if (evalData.mate !== undefined) {
            moveInfo.mate = evalData.mate;
        }
        // Re-render HUD with new data
        setHoverHud(moveInfo);
    }

    // Coach dialogue (LLM/Stockfish proxy)
    async function fetchCoachDialog() {
        if (!elements.coachToggle.checked) return;
        if (game.turn() !== 'w') {
            showToast('Wait for your turn', 'warning');
            return;
        }
        try {
            const res = await fetch('/api/coach/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fen: game.fen(),
                    pgn: game.pgn(),
                    persona: 'balanced',
                    depth: 12,
                    engine: selectedCoachEngine
                })
            });
            const data = await res.json();
            if (data.dialog) {
                elements.coachDialogue.innerHTML = `<p>${data.dialog}</p>`;
            } else {
                elements.coachDialogue.innerHTML = `<p class="text-base-content/60">No advice available.</p>`;
            }

            // If backend returns recommended moves with scores, reflect them
            if (data.recommended && Array.isArray(data.recommended) && data.recommended.length) {
                legalMovesCache = data.recommended.map((m, idx) => ({
                    san: m.san,
                    from: m.from,
                    to: m.to,
                    uci: m.uci,
                    captured: false,
                    is_check: false,
                    is_mate: m.mate,
                    score_cp: m.score_cp,
                    mate: m.mate,
                    rank: idx + 1,
                    id: `${m.from || ''}-${m.to || ''}-${idx}`
                }));
                await updateLegalMoves(); // refresh list with scored moves
            }
        } catch (e) {
            elements.coachDialogue.innerHTML = `<p class="text-error">Coach service unavailable.</p>`;
        }
    }

    // ===========================================
    // Game Controls
    // ===========================================
    function newGame() {
        game.reset();
        board.start();
        aiMoves = 0;
        aiCaptures = 0;
        elements.aiMoves.textContent = '0';
        elements.aiCaptures.textContent = '0';
        elements.aiEvalCp.textContent = '--';
        clearHighlights();
        updateUI();
        saveGame();
        showToast('New game started!', 'success');
    }

    function undoMove() {
        game.undo();
        if (game.turn() === 'b') game.undo();
        board.position(game.fen());
        clearHighlights();
        updateUI();
        saveGame();
    }

    function flipBoard() {
        orientation = orientation === 'white' ? 'black' : 'white';
        board.orientation(orientation);
    }

    function copyFen() {
        navigator.clipboard.writeText(game.fen());
        showToast('FEN copied!', 'success');
    }

    // ===========================================
    // Game Over
    // ===========================================
    function showGameOver() {
        let title = 'Game Over';
        let msg = '';

        if (game.in_checkmate()) {
            if (game.turn() === 'w') {
                title = '😔 Defeat';
                msg = 'You were checkmated.';
            } else {
                title = '🎉 Victory!';
                msg = 'You checkmated the AI!';
            }
        } else if (game.in_stalemate()) {
            title = '🤝 Stalemate';
            msg = 'The game is a draw.';
        } else if (game.in_draw()) {
            title = '🤝 Draw';
            msg = 'The game ended in a draw.';
        }

        elements.gameOverTitle.textContent = title;
        elements.gameOverMsg.textContent = msg;
        elements.gameOverModal.showModal();
    }

    // ===========================================
    // Persistence
    // ===========================================
    function saveGame() {
        localStorage.setItem('chess-arena-fen', game.fen());
        
        fetch('/api/save-game/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fen: game.fen(), pgn: game.pgn() })
        }).catch(() => {});
    }

    function loadGame() {
        const fen = localStorage.getItem('chess-arena-fen');
        if (fen) {
            try {
                game.load(fen);
                board.position(fen);
            } catch (e) {
                console.log('Could not load saved game');
            }
        }
    }

    // ===========================================
    // Utilities
    // ===========================================
    function showToast(msg, type = 'info') {
        elements.toastMsg.textContent = msg;
        elements.toastAlert.className = `alert alert-${type}`;
        elements.toast.style.display = 'block';
        setTimeout(() => { elements.toast.style.display = 'none'; }, 2500);
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // ===========================================
    // Event Listeners
    // ===========================================
    elements.playMoveBtn.addEventListener('click', playSelectedMove);
    elements.newGameBtn.addEventListener('click', newGame);
    elements.undoBtn.addEventListener('click', undoMove);
    elements.flipBtn.addEventListener('click', flipBoard);
    elements.copyFenBtn.addEventListener('click', copyFen);
    elements.playAgainBtn.addEventListener('click', () => {
        elements.gameOverModal.close();
        newGame();
    });
    elements.engineSelect.addEventListener('change', async (e) => {
        selectedEngine = e.target.value;
        localStorage.setItem('chess-arena-engine', selectedEngine);
        
        // Cancel any pending real-time eval
        if (evalRequestQueue.has('pending')) {
            clearTimeout(evalRequestQueue.get('pending'));
            evalRequestQueue.delete('pending');
        }
        
        // Clear caches so fresh data comes from the newly selected model
        evalCache.clear();
        legalMovesCache = [];
        lastEvalTarget = null;
        
        // Refresh UI (legal moves, scores, coach) with the new model
        await updateUI();
    });
    elements.coachSelect.addEventListener('change', async (e) => {
        selectedCoachEngine = e.target.value;
        localStorage.setItem('chess-arena-coach-engine', selectedCoachEngine);
        
        // Cancel any pending real-time eval
        if (evalRequestQueue.has('pending')) {
            clearTimeout(evalRequestQueue.get('pending'));
            evalRequestQueue.delete('pending');
        }
        
        // Clear caches so fresh data comes from the newly selected coach model
        evalCache.clear();
        legalMovesCache = [];
        lastEvalTarget = null;
        currentFen = ''; // force re-eval on same position
        
        // Refresh UI with the new coach model (white suggestions)
        await updateUI();
    });
    elements.askCoachBtn.addEventListener('click', fetchCoachDialog);

    // Sidebar split slider
    if (elements.paneSplit) {
        const savedSplit = localStorage.getItem('chess-pane-split');
        applyPaneSplit(savedSplit || defaultPaneSplit);
        elements.paneSplit.addEventListener('input', (e) => {
            applyPaneSplit(e.target.value);
        });
    }

    elements.themeToggle.addEventListener('change', (e) => {
        document.documentElement.dataset.theme = e.target.checked ? 'emerald' : 'dark';
        localStorage.setItem('chess-arena-theme', e.target.checked ? 'emerald' : 'dark');
    });

    // Load saved theme
    const savedTheme = localStorage.getItem('chess-arena-theme');
    if (savedTheme === 'emerald') {
        elements.themeToggle.checked = true;
        document.documentElement.dataset.theme = 'emerald';
    }

    // Load saved preferences
    const savedEngine = localStorage.getItem('chess-arena-engine');
    if (savedEngine) {
        selectedEngine = savedEngine;
        elements.engineSelect.value = savedEngine;
    }
    const savedCoachEngine = localStorage.getItem('chess-arena-coach-engine');
    if (savedCoachEngine) {
        selectedCoachEngine = savedCoachEngine;
        elements.coachSelect.value = savedCoachEngine;
    }

    // ===========================================
    // Initialize
    // ===========================================
    initBoard();
    loadGame();
    updateUI();

})();

