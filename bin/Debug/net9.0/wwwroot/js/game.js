(function () {
    // رنگ‌ها و ایندکس‌های شروع
    const COLORS = ['red', 'blue', 'green', 'yellow'];
    const START_INDEX = { red: 0, blue: 10, green: 20, yellow: 30 };
    const PLAYER_COUNT = 4;
    const PIECES_PER_PLAYER = 4;
    const MAIN_PATH_LENGTH = 40;
    const HOME_LENGTH = 4;

    // DOM
    const svgContainer = document.getElementById('svg-container');
    const piecesLayer = document.getElementById('pieces-layer');
    const rollBtn = document.getElementById('roll-btn');
    const endBtn = document.getElementById('end-btn');
    const currentTurnEl = document.getElementById('current-turn');
    const diceResultEl = document.getElementById('dice-result');
    const messagesEl = document.getElementById('messages');

    // وضعیت بازی
    let svgEl = null;
    let path = []; // آرایه از {x,y,el,isSafe,originalUse}
    let homePath = { red: [], blue: [], green: [], yellow: [] };
    let center = { x: 400, y: 400 }; // default, از SVG اصلاح می‌شود اگر لازم باشد

    // انتخاب و حالت اجرا
    let selectedPiece = null;

    // SignalR connection
    let connection = null;

    function setMessage(txt) {
        messagesEl.textContent = txt || '';
    }

    // اتصال به سرور با استفاده از SignalR
    async function connectToGame() {
        try {
            connection = new signalR.HubConnectionBuilder()
                .withUrl("/gamehub")
                .build();

            connection.start().then(function () {
                console.log("Connected to game hub");
                // Request initial game state
                connection.invoke("GetGameState");
            }).catch(function (err) {
                return console.error(err.toString());
            });

            // Event handlers for SignalR messages
            connection.on("DiceRolled", function (diceValue, currentPlayerIndex) {
                diceResultEl.textContent = diceValue;
                currentTurnEl.textContent = COLORS[currentPlayerIndex];
                setMessage(`${COLORS[currentPlayerIndex]}: ${diceValue}`);
            });

            connection.on("PieceMoved", function (playerId, pieceId, newPosition, oldPosition) {
                const pieceEl = piecesLayer.querySelector(`.piece[data-player="${playerId}"][data-piece="${pieceId}"]`);
                if (pieceEl) {
                    // Update piece position based on new position
                    updatePiecePosition(pieceEl, playerId, newPosition);
                }
            });

            connection.on("NextPlayer", function (nextPlayerIndex) {
                currentTurnEl.textContent = COLORS[nextPlayerIndex];
                diceResultEl.textContent = '-';
                setMessage(`نوبت ${COLORS[nextPlayerIndex]}`);
            });

            connection.on("GameOver", function (winnerPlayerId) {
                setMessage(`بازیکن ${COLORS[winnerPlayerId]} برنده شد!`);
                rollBtn.disabled = true;
                endBtn.disabled = true;
            });

            connection.on("GameStateUpdated", function (gameState) {
                updateGameState(gameState);
            });

            connection.on("GameReset", function () {
                location.reload();
            });

        } catch (err) {
            console.error(err);
            setMessage('خطا در اتصال به سرور.');
        }
    }

    function updateGameState(gameState) {
        // Update UI based on game state
        currentTurnEl.textContent = COLORS[gameState.CurrentPlayerIndex];
        diceResultEl.textContent = gameState.DiceValue || '-';
        
        // Update pieces positions
        gameState.Players.forEach(player => {
            player.Pieces.forEach(piece => {
                const pieceEl = piecesLayer.querySelector(`.piece[data-player="${player.Id}"][data-piece="${piece.Id}"]`);
                if (pieceEl) {
                    updatePiecePosition(pieceEl, player.Id, piece.Position);
                }
            });
        });
    }

    function updatePiecePosition(pieceEl, playerId, position) {
        const basePositions = [
            [{x: 100, y: 100}, {x: 200, y: 100}, {x: 100, y: 200}, {x: 200, y: 200}], // Red
            [{x: 1000, y: 100}, {x: 1100, y: 100}, {x: 1000, y: 200}, {x: 1100, y: 200}], // Blue
            [{x: 1000, y: 1000}, {x: 1100, y: 1000}, {x: 1000, y: 1100}, {x: 1100, y: 1100}], // Green
            [{x: 100, y: 1000}, {x: 200, y: 1000}, {x: 100, y: 1100}, {x: 200, y: 1100}]  // Yellow
        ];

        // If piece is at base (-1)
        if (position === -1) {
            const pieceIndex = parseInt(pieceEl.dataset.piece);
            pieceEl.style.left = basePositions[playerId][pieceIndex].x + 'px';
            pieceEl.style.top = basePositions[playerId][pieceIndex].y + 'px';
            return;
        }

        // If piece is in home path (40-43)
        if (position >= MAIN_PATH_LENGTH) {
            const color = COLORS[playerId];
            const homeIdx = position - MAIN_PATH_LENGTH;
            if (homeIdx < HOME_LENGTH && homePath[color][homeIdx]) {
                const node = homePath[color][homeIdx];
                pieceEl.style.left = node.x + 'px';
                pieceEl.style.top = node.y + 'px';
            }
            return;
        }

        // If piece is on main path (0-39)
        if (position >= 0 && position < MAIN_PATH_LENGTH) {
            const color = COLORS[playerId];
            const idx = (START_INDEX[color] + position) % MAIN_PATH_LENGTH;
            const node = path[idx];
            if (node) {
                pieceEl.style.left = node.x + 'px';
                pieceEl.style.top = node.y + 'px';
            }
        }
    }

    // بارگذاری SVG از مسیر و وارد کردن inline تا بتوانیم از عناصر آن استفاده کنیم
    async function loadBoardSvg() {
        const url = '/images/mench-board.svg';
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error('SVG بارگذاری نشد');
            const txt = await res.text();
            svgContainer.innerHTML = txt;
            svgEl = svgContainer.querySelector('svg');
            const vb = svgEl.viewBox.baseVal;
            if (vb && vb.width && vb.height) {
                center = { x: vb.x + vb.width / 2, y: vb.y + vb.height / 2 };
            } else {
                const w = parseFloat(svgEl.getAttribute('width')) || 650;
                const h = parseFloat(svgEl.getAttribute('height')) || 650;
                center = { x: w / 2, y: h / 2 };
            }
            return svgEl;
        } catch (err) {
            console.error(err);
            setMessage('خطا در بارگذاری SVG تخته.');
            throw err;
        }
    }

    // استخراج مسیر اصلی از SVG شما
    function extractOrCreateOuterPath() {
        // مسیر اصلی 40 خانه‌ای بر اساس SVG شما
        const mainPathCoords = [
            // Start: Red (index 0)
            {x: 100, y: 500, safe: true},  // 0 - Red start (safe)
            {x: 200, y: 500},  // 1
            {x: 300, y: 500},  // 2
            {x: 400, y: 500},  // 3
            {x: 500, y: 500},  // 4
            {x: 500, y: 400},  // 5
            {x: 500, y: 300},  // 6
            {x: 500, y: 200},  // 7
            {x: 500, y: 100},  // 8
            {x: 600, y: 100},  // 9
            // Start: Blue (index 10)
            {x: 700, y: 100, safe: true},  // 10 - Blue start (safe)
            {x: 700, y: 200},  // 11
            {x: 700, y: 300},  // 12
            {x: 700, y: 400},  // 13
            {x: 700, y: 500},  // 14
            {x: 800, y: 500},  // 15
            {x: 900, y: 500},  // 16
            {x: 1000, y: 500}, // 17
            {x: 1100, y: 500}, // 18
            {x: 1100, y: 600}, // 19
            // Start: Green (index 20)
            {x: 1100, y: 700, safe: true}, // 20 - Green start (safe)
            {x: 1000, y: 700}, // 21
            {x: 900, y: 700},  // 22
            {x: 800, y: 700},  // 23
            {x: 700, y: 700},  // 24
            {x: 700, y: 800},  // 25
            {x: 700, y: 900},  // 26
            {x: 700, y: 1000}, // 27
            {x: 700, y: 1100}, // 28
            {x: 600, y: 1100}, // 29
            // Start: Yellow (index 30)
            {x: 500, y: 1100, safe: true}, // 30 - Yellow start (safe)
            {x: 500, y: 1000}, // 31
            {x: 500, y: 900},  // 32
            {x: 500, y: 800},  // 33
            {x: 500, y: 700},  // 34
            {x: 400, y: 700},  // 35
            {x: 300, y: 700},  // 36
            {x: 200, y: 700},  // 37
            {x: 100, y: 700},  // 38
            {x: 100, y: 600}   // 39
        ];

        path = mainPathCoords.map((coord, i) => {
            const uses = Array.from(svgEl.querySelectorAll(`use[x="${coord.x}"][y="${coord.y}"]`));
            let el = null;
            for (const use of uses) {
                const href = use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                if (href === '#Feld') {
                    el = use;
                    break;
                }
            }
            return {
                x: coord.x,
                y: coord.y,
                el: el,
                isSafe: coord.safe || false,
                originalUse: el
            };
        });
    }



    // استخراج homePathها از SVG
    function extractHomePaths() {
        // مسیرهای خانگی بر اساس SVG شما
        const homePathCoords = {
            red: [
                {x: 200, y: 600},
                {x: 300, y: 600},
                {x: 400, y: 600},
                {x: 500, y: 600}
            ],
            blue: [
                {x: 600, y: 200},
                {x: 600, y: 300},
                {x: 600, y: 400},
                {x: 600, y: 500}
            ],
            green: [
                {x: 1000, y: 600},
                {x: 900, y: 600},
                {x: 800, y: 600},
                {x: 700, y: 600}
            ],
            yellow: [
                {x: 600, y: 1000},
                {x: 600, y: 900},
                {x: 600, y: 800},
                {x: 600, y: 700}
            ]
        };

        COLORS.forEach(color => {
            homePath[color] = homePathCoords[color].map(coord => {
                const uses = Array.from(svgEl.querySelectorAll(`use[x="${coord.x}"][y="${coord.y}"]`));
                let el = null;
                for (const use of uses) {
                    const href = use.getAttribute('href') || use.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                    if (href === '#Feld') {
                        el = use;
                        break;
                    }
                }
                return { x: coord.x, y: coord.y, el: el };
            });
        });
    }

    // رندر مهره‌ها (DOM)
    function createPiecesDOM() {
        piecesLayer.innerHTML = '';
        for (let p = 0; p < PLAYER_COUNT; p++) {
            const color = COLORS[p];
            for (let i = 0; i < PIECES_PER_PLAYER; i++) {
                const el = document.createElement('div');
                el.className = `piece ${color}`;
                el.dataset.player = p.toString();
                el.dataset.piece = i.toString();
                // محل اولیه در خانه‌های پایه
                const basePositions = [
                    [{x: 141, y: 42}, {x: 183, y: 42}, {x: 141, y: 84}, {x: 183, y: 84}], // Red
                    [{x: 516, y: 42}, {x: 558, y: 42}, {x: 516, y: 84}, {x: 558, y: 84}], // Blue
                    [{x: 516, y: 516}, {x: 558, y: 516}, {x: 516, y: 558}, {x: 558, y: 558}], // Green
                    [{x: 141, y: 516}, {x: 183, y: 516}, {x: 141, y: 558}, {x: 183, y: 558}]  // Yellow
                ];
                el.style.left = basePositions[p][i].x + 'px';
                el.style.top = basePositions[p][i].y + 'px';
                el.textContent = (i + 1).toString();
                el.style.pointerEvents = 'auto';
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    onPieceClick(el);
                });
                piecesLayer.appendChild(el);
            }
        }
    }

    function onPieceClick(el) {
        const player = parseInt(el.dataset.player, 10);
        const pieceIndex = parseInt(el.dataset.piece, 10);
        
        if (connection) {
            connection.invoke("MovePiece", player, pieceIndex).catch(function (err) {
                return console.error(err.toString());
            });
        }
    }

    function setupButtons() {
        rollBtn.addEventListener('click', () => {
            if (connection) {
                connection.invoke("RollDice").catch(function (err) {
                    return console.error(err.toString());
                });
            }
        });
        
        endBtn.addEventListener('click', () => {
            if (connection) {
                connection.invoke("ResetGame").catch(function (err) {
                    return console.error(err.toString());
                });
            }
        });
    }

    async function init() {
        setMessage('درحال بارگذاری تخته...');
        await loadBoardSvg();
        extractOrCreateOuterPath();
        extractHomePaths();
        createPiecesDOM();
        setupButtons();
        connectToGame();
        setMessage('آماده. بازیکن قرمز شروع کند؛ ابتدا تاس بیندازید.');
    }

    document.addEventListener('DOMContentLoaded', () => {
        init().catch(err => console.error(err));
    });
})();