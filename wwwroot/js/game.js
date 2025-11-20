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
                const pieceEl = getPieceElement(playerId, pieceId);
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
                const pieceEl = getPieceElement(player.Id, piece.Id);
                if (pieceEl) {
                    updatePiecePosition(pieceEl, player.Id, piece.Position);
                }
            });
        });
    }

    function getPieceElement(playerId, pieceId) {
        // Get the SVG piece element based on player and piece ID
        const color = COLORS[playerId];
        const playerGroup = svgEl.querySelector(`.${color}`);
        if (playerGroup) {
            const pieces = playerGroup.querySelectorAll('g');
            if (pieces.length > pieceId) {
                // Return the entire group element so both circle and text move together
                return pieces[pieceId];
            }
        }
        return null;
    }

    function updatePiecePosition(pieceEl, playerId, position) {
        // Get the use element (the circle) from the group
        const useEl = pieceEl.querySelector('use');
        if (!useEl) return;
        
        const basePositions = [
            [{x: 100, y: 100}, {x: 100, y: 200}, {x: 200, y: 100}, {x: 200, y: 200}], // Red
            [{x: 1000, y: 100}, {x: 1100, y: 100}, {x: 1000, y: 200}, {x: 1100, y: 200}], // Blue
            [{x: 1000, y: 1000}, {x: 1100, y: 1000}, {x: 1000, y: 1100}, {x: 1100, y: 1100}], // Green
            [{x: 100, y: 1000}, {x: 100, y: 1100}, {x: 200, y: 1000}, {x: 200, y: 1100}]  // Yellow
        ];

        // If piece is at base (-1)
        if (position === -1) {
            // Get the piece index from the text element
            const textEl = pieceEl.querySelector('text');
            const pieceIndex = parseInt(textEl.textContent) - 1;
            // Change the x and y attributes of the use element directly
            const pos = basePositions[playerId][pieceIndex];
            useEl.setAttribute('x', pos.x);
            useEl.setAttribute('y', pos.y);
            // Also update the text position
            textEl.setAttribute('x', pos.x);
            textEl.setAttribute('y', pos.y);
            return;
        }

        // If piece is entering the board (first move from base)
        if (position === 0) { // First position on main path
            const startPositions = [
                {x: 100, y: 500}, // Red start
                {x: 700, y: 100},  // Blue start
                {x: 1100, y: 700}, // Green start
                {x: 500, y: 1100}  // Yellow start
            ];
            const pos = startPositions[playerId];
            useEl.setAttribute('x', pos.x);
            useEl.setAttribute('y', pos.y);
            // Also update the text position
            textEl.setAttribute('x', pos.x);
            textEl.setAttribute('y', pos.y);
            return;
        }

        // If piece is in home path (40-43)
        if (position >= MAIN_PATH_LENGTH) {
            const color = COLORS[playerId];
            const homeIdx = position - MAIN_PATH_LENGTH;
            if (homeIdx < HOME_LENGTH && homePath[color][homeIdx]) {
                const node = homePath[color][homeIdx];
                useEl.setAttribute('x', node.x);
                useEl.setAttribute('y', node.y);
                // Also update the text position
                const textEl = pieceEl.querySelector('text');
                textEl.setAttribute('x', node.x);
                textEl.setAttribute('y', node.y);
            }
            return;
        }

        // If piece is on main path (1-39)
        if (position >= 1 && position < MAIN_PATH_LENGTH) {
            const color = COLORS[playerId];
            const idx = (START_INDEX[color] + position - 1) % MAIN_PATH_LENGTH;
            const node = path[idx];
            if (node) {
                useEl.setAttribute('x', node.x);
                useEl.setAttribute('y', node.y);
                // Also update the text position
                const textEl = pieceEl.querySelector('text');
                textEl.setAttribute('x', node.x);
                textEl.setAttribute('y', node.y);
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
                const w = parseFloat(svgEl.getAttribute('width')) || 500;
                const h = parseFloat(svgEl.getAttribute('height')) || 500;
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
        // Since pieces are already in SVG, we just need to add event listeners
        // Add click event listeners to all pieces
        for (let p = 0; p < PLAYER_COUNT; p++) {
            const color = COLORS[p];
            const playerGroup = svgEl.querySelector(`.${color}`);
            if (playerGroup) {
                const pieceGroups = playerGroup.querySelectorAll('g');
                pieceGroups.forEach((pieceGroup, index) => {
                    // Make the entire group clickable
                    pieceGroup.style.cursor = 'pointer';
                    pieceGroup.addEventListener('click', (e) => {
                        e.stopPropagation();
                        onPieceClick({playerId: p, pieceId: index});
                    });
                });
            }
        }
    }

    function onPieceClick(data) {
        const {playerId, pieceId} = data;
        
        if (connection) {
            connection.invoke("MovePiece", playerId, pieceId).catch(function (err) {
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