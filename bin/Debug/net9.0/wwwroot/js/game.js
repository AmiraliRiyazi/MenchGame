(function () {
    // رنگ‌ها و ایندکس‌های شروع
    const COLORS = ['red', 'blue', 'green', 'yellow'];
    const START_INDEX = { red: 0, blue: 10, green: 20, yellow: 30 };
    const PLAYER_COUNT = 4;
    const PIECES_PER_PLAYER = 4;
    const MAIN_PATH_LENGTH = 57;
    const HOME_LENGTH = 6;

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

    function setMessage(txt) {
        messagesEl.textContent = txt || '';
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
                const w = parseFloat(svgEl.getAttribute('width')) || 800;
                const h = parseFloat(svgEl.getAttribute('height')) || 800;
                center = { x: w / 2, y: h / 2 };
            }
            return svgEl;
        } catch (err) {
            console.error(err);
            setMessage('خطا در بارگذاری SVG تخته.');
            throw err;
        }
    }

    // اگر SVG شامل 57 <use href="#Feld"> باشد آن‌ها را می‌خوانیم؛ در غیر اینصورت ما 57 خانه را با use ایجاد می‌کنیم
    function extractOrCreateOuterPath() {
        // بررسی useها که به Feld اشاره کنند
        // توجه: در SVGهای مختلف href ممکن است در فضای XLink باشد؛ استفاده از querySelectorAll مناسب است
        const uses = Array.from(svgEl.querySelectorAll('use[href="#Feld"], use[*|href="#Feld"]'));
        if (uses.length >= MAIN_PATH_LENGTH) {
            path = uses.slice(0, MAIN_PATH_LENGTH).map(u => {
                const x = parseFloat(u.getAttribute('x')) || 0;
                const y = parseFloat(u.getAttribute('y')) || 0;
                const isSafe = u.hasAttribute('data-safe') || false;
                return { x, y, el: u, isSafe, originalUse: u };
            });
        } else {
            // ایجاد 57 خانه در دایره و اضافه به SVG
            const group = svgEl.querySelector('#outer-path') || svgEl;
            path = [];
            const r = 320; // شعاع
            const cx = center.x, cy = center.y;
            for (let i = 0; i < MAIN_PATH_LENGTH; i++) {
                const angle = (2 * Math.PI * i) / MAIN_PATH_LENGTH - Math.PI / 2; // شروع از بالا
                const x = Math.round((cx + Math.cos(angle) * r) * 10) / 10;
                const y = Math.round((cy + Math.sin(angle) * r) * 10) / 10;
                const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
                use.setAttributeNS('http://www.w3.org/1999/xlink', 'href', '#Feld');
                use.setAttribute('x', x);
                use.setAttribute('y', y);
                if (i % 13 === 0) use.setAttribute('data-safe', 'true');
                if (i === 0) use.setAttribute('data-start', 'red');
                if (i === 10) use.setAttribute('data-start', 'blue');
                if (i === 20) use.setAttribute('data-start', 'green');
                if (i === 30) use.setAttribute('data-start', 'yellow');
                use.setAttribute('data-i', i);
                group.appendChild(use);
                path.push({ x, y, el: use, isSafe: use.hasAttribute('data-safe'), originalUse: use });
            }
        }

        // مرتب سازی بر اساس زاویه نسبت به مرکز (ساعتگرد)
        path.sort((a, b) => {
            const ax = a.x - center.x, ay = a.y - center.y;
            const bx = b.x - center.x, by = b.y - center.y;
            const anga = Math.atan2(ay, ax);
            const angb = Math.atan2(by, bx);
            const na = (anga + 2 * Math.PI) % (2 * Math.PI);
            const nb = (angb + 2 * Math.PI) % (2 * Math.PI);
            return na - nb;
        });

        // چرخش مسیر طوری که خانه start قرمز در index 0 باشد
        const idxRed = path.findIndex(p => p.originalUse && p.originalUse.getAttribute('data-start') === 'red');
        if (idxRed !== -1) rotatePathTo(idxRed, 0);

        // اطمینان که آبی/سبز/زرد در 10/20/30 قرار گیرند
        const adjust = (color, targetIndex) => {
            const idx = path.findIndex(p => p.originalUse && p.originalUse.getAttribute('data-start') === color);
            if (idx !== -1) {
                const shift = (idx - targetIndex + path.length) % path.length;
                if (shift !== 0) rotatePath(shift);
            }
        };
        adjust('red', 0);
        adjust('blue', 10);
        adjust('green', 20);
        adjust('yellow', 30);
    }

    function rotatePathTo(idxFrom, idxTo) {
        const shift = (idxFrom - idxTo + path.length) % path.length;
        rotatePath(shift);
    }
    function rotatePath(shift) {
        if (shift === 0) return;
        for (let i = 0; i < shift; i++) {
            const v = path.shift();
            path.push(v);
        }
    }

    // استخراج homePathها از SVG (useهایی با data-home)
    function extractHomePaths() {
        COLORS.forEach(color => homePath[color] = []);
        const homeUses = Array.from(svgEl.querySelectorAll('use[data-home]'));
        if (homeUses.length > 0) {
            homeUses.forEach(u => {
                const color = u.getAttribute('data-home');
                const x = parseFloat(u.getAttribute('x')) || 0;
                const y = parseFloat(u.getAttribute('y')) || 0;
                homePath[color].push({ x, y, el: u });
            });
            Object.keys(homePath).forEach(color => {
                homePath[color].sort((a, b) => {
                    const ai = parseInt(a.el.getAttribute('data-home-i') || '0', 10);
                    const bi = parseInt(b.el.getAttribute('data-home-i') || '0', 10);
                    return ai - bi;
                });
            });
        } else {
            // fallback اگر نبود
            const offsets = {
                red: { x: -15, y: -120, dx: 0, dy: 35 },
                blue: { x: 120, y: -15, dx: -35, dy: 0 },
                green: { x: -15, y: 120, dx: 0, dy: -35 },
                yellow: { x: -120, y: -15, dx: 35, dy: 0 }
            };
            const cx = center.x, cy = center.y;
            COLORS.forEach(color => {
                const o = offsets[color];
                homePath[color] = [];
                for (let i = 0; i < HOME_LENGTH; i++) {
                    const x = cx + (o.x + o.dx * i);
                    const y = cy + (o.y + o.dy * i);
                    homePath[color].push({ x, y, el: null });
                }
            });
        }
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
                // محل اولیه در اطراف مرکز (base)
                el.style.left = (center.x + (p - 1.5) * 36) + 'px';
                el.style.top = (center.y + 220 + i * 18) + 'px';
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

    // نگهداری وضعیت منطقی بازی
    class GameEngine {
        constructor() {
            this.players = [];
            for (let p = 0; p < PLAYER_COUNT; p++) {
                const pieces = [];
                for (let i = 0; i < PIECES_PER_PLAYER; i++) {
                    pieces.push({ player: p, index: i, steps: -1 }); // -1 means at base
                }
                this.players.push({ color: COLORS[p], pieces, finishedCount: 0 });
            }
            this.currentTurn = 0;
            this.dice = 0;
            this.mustRoll = true;
            this.selected = null;
            this.moveAvailablePieces = [];
            this.uiPieces = Array.from(piecesLayer.querySelectorAll('.piece'));
            this.updateUI();
        }

        rollDice() {
            if (!this.mustRoll) {
                setMessage('اکنون نمی‌توانید تاس بیندازید.');
                return;
            }
            const d = Math.floor(Math.random() * 6) + 1;
            this.dice = d;
            diceResultEl.textContent = d;
            setMessage(`${COLORS[this.currentTurn]}: ${d}`);
            this.moveAvailablePieces = [];
            const player = this.players[this.currentTurn];
            for (const pc of player.pieces) {
                if (this.canMovePiece(pc, d)) this.moveAvailablePieces.push(pc);
            }
            if (this.moveAvailablePieces.length === 0) {
                setTimeout(() => {
                    if (d !== 6) {
                        this.nextTurn();
                    } else {
                        setMessage('6 آمد، ولی هیچ مهره‌ای قابل حرکت نیست، نوبت تکرار می‌شود.');
                    }
                }, 700);
            } else {
                setMessage(`میتوانید یکی از ${this.moveAvailablePieces.length} مهره را حرکت دهید.`);
            }
            this.mustRoll = false;
            this.updateUI();
            return d;
        }

        canMovePiece(piece, dice = this.dice) {
            const color = COLORS[piece.player];
            if (piece.steps === -1) {
                return dice === 6;
            } else {
                const newSteps = piece.steps + dice;
                if (newSteps > MAIN_PATH_LENGTH + HOME_LENGTH - 1) return false;
                return true;
            }
        }

        movePiece(piece, dice = this.dice) {
            if (!this.canMovePiece(piece, dice)) {
                setMessage('این مهره نمی‌تواند حرکت کند.');
                return false;
            }
            const color = COLORS[piece.player];
            if (piece.steps === -1 && dice === 6) {
                piece.steps = 0;
            } else {
                piece.steps += dice;
            }

            if (piece.steps >= MAIN_PATH_LENGTH) {
                const homeIdx = piece.steps - MAIN_PATH_LENGTH;
                if (homeIdx < HOME_LENGTH) {
                    this.placePieceOnHome(piece, homeIdx);
                    if (homeIdx === HOME_LENGTH - 1) {
                        const playerObj = this.players[piece.player];
                        playerObj.finishedCount++;
                        if (playerObj.finishedCount === PIECES_PER_PLAYER) {
                            this.announceWin(piece.player);
                        }
                    }
                } else {
                    // shouldn't happen because canMovePiece blocks this
                }
            } else {
                const idx = (START_INDEX[color] + piece.steps) % MAIN_PATH_LENGTH;
                this.placePieceOnPath(piece, idx);
                this.handleCollision(piece, idx);
            }

            const rolledSix = dice === 6;
            if (!rolledSix) {
                this.nextTurn();
            } else {
                setMessage('6 آمد؛ شما دوباره می‌توانید تاس بیندازید.');
                this.mustRoll = true;
            }
            this.updateUI();
            return true;
        }

        placePieceOnPath(piece, idx) {
            const node = path[idx];
            if (!node) return;
            // قرار دادن چند مهره روی یک خانه با کمی جابجایی (stack)
            const overlapping = this.countPiecesOnPathNode(idx);
            const angleOffset = (overlapping % 4) * 10;
            const offsetX = (overlapping % 2 === 0) ? -10 : 10;
            const offsetY = Math.floor(overlapping / 2) * 10;
            this.updatePieceDOMPosition(piece, node.x + offsetX, node.y + offsetY);
        }

        countPiecesOnPathNode(idx) {
            let c = 0;
            for (const pObj of this.players) {
                for (const pc of pObj.pieces) {
                    if (pc.steps >= 0 && pc.steps < MAIN_PATH_LENGTH) {
                        const nodeIdx = (START_INDEX[COLORS[pc.player]] + pc.steps) % MAIN_PATH_LENGTH;
                        if (nodeIdx === idx) c++;
                    }
                }
            }
            return c;
        }

        placePieceOnHome(piece, homeIdx) {
            const color = COLORS[piece.player];
            const node = homePath[color][homeIdx];
            if (!node) return;
            this.updatePieceDOMPosition(piece, node.x, node.y);
        }

        updatePieceDOMPosition(piece, x, y) {
            const el = this.findPieceElement(piece);
            if (!el) return;
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.classList.add('selected');
            setTimeout(() => el.classList.remove('selected'), 420);
        }

        handleCollision(movedPiece, landedIndex) {
            const isSafe = path[landedIndex] && path[landedIndex].isSafe;
            if (isSafe) return;
            for (const pObj of this.players) {
                for (const pc of pObj.pieces) {
                    if (pc.player === movedPiece.player) continue;
                    if (pc.steps >= 0 && pc.steps < MAIN_PATH_LENGTH) {
                        const idx = (START_INDEX[COLORS[pc.player]] + pc.steps) % MAIN_PATH_LENGTH;
                        if (idx === landedIndex) {
                            pc.steps = -1;
                            const el = this.findPieceElement(pc);
                            if (el) {
                                el.style.left = (center.x + (pc.player - 1.5) * 36) + 'px';
                                el.style.top = (center.y + 220 + pc.index * 18) + 'px';
                            }
                            setMessage(`${COLORS[pc.player]} مهره‌اش به خانهٔ اول بازگشت.`);
                        }
                    }
                }
            }
        }

        enterHomePath(piece) { /* منطق از طریق steps مدیریت می‌شود */ }

        checkWin() {
            for (let p = 0; p < PLAYER_COUNT; p++) {
                if (this.players[p].finishedCount === PIECES_PER_PLAYER) return p;
            }
            return -1;
        }

        announceWin(playerIndex) {
            setMessage(`بازیکن ${COLORS[playerIndex]} برنده شد!`);
            rollBtn.disabled = true;
            endBtn.disabled = true;
        }

        nextTurn() {
            this.currentTurn = (this.currentTurn + 1) % PLAYER_COUNT;
            this.mustRoll = true;
            this.dice = 0;
            diceResultEl.textContent = '-';
            this.selected = null;
            this.moveAvailablePieces = [];
            this.updateUI();
        }

        findPieceElement(piece) {
            return piecesLayer.querySelector(`.piece[data-player="${piece.player}"][data-piece="${piece.index}"]`);
        }

        updateUI() {
            currentTurnEl.textContent = COLORS[this.currentTurn];
            this.uiPieces = Array.from(piecesLayer.querySelectorAll('.piece'));
            this.uiPieces.forEach(el => {
                const pl = parseInt(el.dataset.player, 10);
                const pi = parseInt(el.dataset.piece, 10);
                const piece = this.players[pl].pieces[pi];
                if (pl === this.currentTurn && !this.mustRoll && this.moveAvailablePieces.some(m => m.player === pl && m.index === pi)) {
                    el.style.boxShadow = '0 0 0 6px rgba(13,110,253,0.12)';
                } else {
                    el.style.boxShadow = '';
                }
            });
        }
    }

    // نگهدارندهٔ نمونه بازی
    let engine = null;

    function onPieceClick(el) {
        const player = parseInt(el.dataset.player, 10);
        const pieceIndex = parseInt(el.dataset.piece, 10);
        if (player !== engine.currentTurn) {
            setMessage('این مهره مربوط به نوبت فعلی نیست.');
            return;
        }
        const piece = engine.players[player].pieces[pieceIndex];
        if (engine.mustRoll) {
            setMessage('ابتدا تاس بیندازید.');
            return;
        }
        if (!engine.canMovePiece(piece)) {
            setMessage('این مهره نمی‌تواند با مقدار تاس فعلی حرکت کند.');
            return;
        }
        engine.movePiece(piece);
    }

    function setupButtons() {
        rollBtn.addEventListener('click', () => {
            if (!engine) return;
            engine.rollDice();
        });
        endBtn.addEventListener('click', () => {
            if (!engine) return;
            engine.nextTurn();
            setMessage('نوبت پایان یافت.');
        });
    }

    async function init() {
        setMessage('درحال بارگذاری تخته...');
        await loadBoardSvg();
        extractOrCreateOuterPath();
        extractHomePaths();
        createPiecesDOM();
        engine = new GameEngine();
        setupButtons();
        setMessage('آماده. بازیکن قرمز شروع کند؛ ابتدا تاس بیندازید.');
    }

    document.addEventListener('DOMContentLoaded', () => {
        init().catch(err => console.error(err));
    });

})();