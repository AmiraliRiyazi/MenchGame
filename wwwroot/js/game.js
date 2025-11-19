// game.js - نسخه آفلاین منچ (استفاده از SVG تخته‌ی آپلود شده)
(() => {
  // config
  const colors = ['red','blue','green','yellow'];
  const piecesPerPlayer = 4;

  // state
  let path = [];         // [{x, y}, ...] outer ring in order
  let homePaths = {};    // color -> array of 6 inner positions (if any)
  let players = [];      // [{color, pieces:[{posIndex, atHome}]}, ...]
  let currentPlayer = 0;
  let diceValue = 0;
  let pieceLayer, svgImg, boardRect;

  // utils
  function wait(ms){ return new Promise(res=>setTimeout(res,ms)); }

  // read SVG uses and build positions dynamically
  async function buildPathFromSVG() {
    svgImg = document.getElementById('menchSvg');
    // wait until image loaded
    if (!svgImg.complete) await new Promise(r=>svgImg.onload = r);

    // Fetch SVG file text to parse DOM positions (so we can get real coordinates)
    const svgUrl = svgImg.src;
    const txt = await fetch(svgUrl).then(r=>r.text());
    const parser = new DOMParser();
    const doc = parser.parseFromString(txt, "image/svg+xml");
    // find all <use> referencing Feld (as in your SVG)
    const uses = Array.from(doc.querySelectorAll('use')).filter(u=>{
      const href = u.getAttribute('href') || u.getAttribute('xlink:href') || '';
      return href.includes('Feld') || href.includes('feld') || href.includes('#Feld');
    });

    const points = uses.map(u=>{
      const x = parseFloat(u.getAttribute('x') || 0);
      const y = parseFloat(u.getAttribute('y') || 0);
      return {x,y};
    });

    if (points.length === 0) throw new Error('هیچ خانه‌ای در SVG پیدا نشد. اطمینان حاصل کن use href="#Feld" وجود داشته باشد.');

    // compute centroid
    const cx = points.reduce((s,p)=>s+p.x,0)/points.length;
    const cy = points.reduce((s,p)=>s+p.y,0)/points.length;

    // sort by angle (clockwise)
    points.sort((a,b)=>{
      const angA = Math.atan2(a.y - cy, a.x - cx);
      const angB = Math.atan2(b.y - cy, b.x - cx);
      return angB - angA; // descending => clockwise
    });

    // we expect outer ring to have many points (your svg had multiple use, includes start homes).
    // We'll deduplicate near-duplicate points by rounding to int and unique keys.
    const uniq = [];
    const seen = new Set();
    points.forEach(p=>{
      const key = `${Math.round(p.x)}_${Math.round(p.y)}`;
      if (!seen.has(key)) { seen.add(key); uniq.push(p); }
    });

    // choose ring size: if many, pick the longest cycle on perimeter
    // We'll assume the ring is the largest set: use uniq as candidate
    path = uniq;

    // rotate path so that left-middle point is index 0 (start for red)
    // find left-most point near center vertically
    const cy2 = path.reduce((s,p)=>s+p.y,0)/path.length;
    let bestIdx = 0;
    let bestScore = 1e9;
    for(let i=0;i<path.length;i++){
      const p = path[i];
      // prefer min x and y close to center
      const score = (p.x) + Math.abs(p.y - cy2) * 0.5;
      if (score < bestScore) { bestScore = score; bestIdx = i; }
    }
    // rotate
    path = path.slice(bestIdx).concat(path.slice(0,bestIdx));

    // debug: if path length > 60 trim to 57 if seems like outer ring larger duplicates
    if (path.length > 60) {
      // try to compress by sampling neighbors: use radial clustering to select ~57 evenly spaced
      const target = 57;
      const sampled = [];
      for(let i=0;i<target;i++){
        const idx = Math.floor(i * path.length / target);
        sampled.push(path[idx]);
      }
      path = sampled;
    }

    // scale coordinates relative to rendered image size:
    const imgBox = svgImg.getBoundingClientRect();
    // original svg viewBox scale factor
    // We'll compute factor by reading viewBox if available in svg tag
    let viewBox = doc.documentElement.getAttribute('viewBox');
    if (viewBox) {
      const parts = viewBox.split(/\s+/).map(Number);
      const vbW = parts[2], vbH = parts[3];
      const sx = imgBox.width / vbW;
      const sy = imgBox.height / vbH;
      // map path coords to DOM overlay coords
      path = path.map(p=>({
        x: (p.x - parts[0]) * sx,
        y: (p.y - parts[1]) * sy
      }));
    } else {
      // fallback: try width/height attributes
      const vbW = parseFloat(doc.documentElement.getAttribute('width')) || imgBox.width;
      const vbH = parseFloat(doc.documentElement.getAttribute('height')) || imgBox.height;
      const sx = imgBox.width / vbW;
      const sy = imgBox.height / vbH;
      path = path.map(p=>({ x:p.x * sx, y:p.y * sy }));
    }

    return path;
  }

  // initialize players state
  function initPlayers() {
    players = colors.map(color=>{
      return {
        color,
        pieces: Array.from({length: piecesPerPlayer}, (_,i)=>({ posIndex: -1, // -1 = in start home (not on board)
                                                                finished:false,
                                                                id: `${color}-${i}` }))
      };
    });
  }

  // render pieces onto overlay, placing them either in home (corners) or on path
  function renderPieces() {
    if (!pieceLayer) return;
    pieceLayer.innerHTML = '';
    // compute board container position to place absolute coords
    const container = svgImg.getBoundingClientRect();
    pieceLayer.style.width = container.width + 'px';
    pieceLayer.style.height = container.height + 'px';
    pieceLayer.style.left = svgImg.offsetLeft + 'px';
    pieceLayer.style.top = svgImg.offsetTop + 'px';
    // for each player and each piece render
    players.forEach((pl, pi)=>{
      pl.pieces.forEach((pc, idx)=>{
        const el = document.createElement('div');
        el.className = `piece ${pl.color}`;
        el.id = `piece-${pl.color}-${idx}`;
        el.style.width = '28px';
        el.style.height = '28px';
        el.style.position = 'absolute';
        // determine position:
        if (pc.posIndex === -1) {
          // home positions: place clustered at corner based on color
          const homePos = getHomePosition(pl.color, idx);
          el.style.left = homePos.x + 'px';
          el.style.top = homePos.y + 'px';
        } else {
          // on path
          const p = path[pc.posIndex % path.length];
          el.style.left = p.x + 'px';
          el.style.top = p.y + 'px';
        }
        pieceLayer.appendChild(el);
      });
    });
  }

  function getHomePosition(color, pieceIndex) {
    // compute approximate homes relative to overlay size
    const c = svgImg.getBoundingClientRect();
    // left (red) — we set start red = left middle
    if (color === 'red') {
      return { x: 40 + pieceIndex*30, y: c.height/2 - 40 };
    }
    if (color === 'blue') {
      return { x: c.width/2 - 40, y: 40 + pieceIndex*30 };
    }
    if (color === 'green') {
      return { x: c.width - 40 - pieceIndex*30, y: c.height/2 + 40 };
    }
    if (color === 'yellow') {
      return { x: c.width/2 + 40, y: c.height - 40 - pieceIndex*30 };
    }
    return {x:50,y:50};
  }

  // roll dice
  function rollDice() {
    diceValue = Math.floor(Math.random()*6) + 1;
    document.getElementById('status').innerText = `تاس: ${diceValue} — نوبت ${players[currentPlayer].color}`;
    return diceValue;
  }

  // move piece: piece is player.pieces[index], move by dice
  async function movePiece(playerIndex, pieceIndex, dice) {
    const pl = players[playerIndex];
    const piece = pl.pieces[pieceIndex];

    // if in home (-1) and dice==6 -> move to start index 0 of that player's start
    if (piece.posIndex === -1) {
      if (dice !== 6) return false; // cannot move out
      // start index for this player's color is colorStart[playerIndex]
      piece.posIndex = colorStartIndex(playerIndex);
    } else {
      piece.posIndex += dice;
      // wrap-around handled; but if piece reaches finish threshold we mark finished (simple variant)
      if (piece.posIndex >= path.length + finishOffset(playerIndex)) {
        piece.finished = true;
        // clamp to last
        piece.posIndex = path.length - 1;
      }
    }

    // collision: if another player's piece occupies same path index -> send them home (unless safe)
    players.forEach((other, oi)=>{
      if (oi === playerIndex) return;
      other.pieces.forEach(op=>{
        if (op.posIndex === piece.posIndex && !op.finished) {
          // check safe cell? (we skip safe logic for simplicity) -> send home
          op.posIndex = -1;
        }
      });
    });

    // animate re-render
    renderPieces();
    await wait(350);
    return true;
  }

  // helper: find start index (per color) - red is 0, then each color start at quarter
  function colorStartIndex(playerIndex) {
    // assume start order along path matches players array order (red,blue,green,yellow)
    const step = Math.floor(path.length / colors.length);
    return (playerIndex * step) % path.length;
  }
  function finishOffset(playerIndex) {
    // optional offset for finishing zones; keep 6 as example
    return 6;
  }

  // simple turn flow
  async function onRoll() {
    const d = rollDice();
    // choose piece automatically: prefer movable piece
    const pl = players[currentPlayer];
    const movable = pl.pieces.map((p,i)=>({p,i})).filter(pi=>{
      if (pi.p.posIndex === -1) return d === 6;
      return !pi.p.finished;
    });
    if (movable.length === 0) {
      document.getElementById('status').innerText = `نوبت ${players[currentPlayer].color} — هیچ مهره‌ای قابل حرکت نیست`;
      if (d !== 6) endTurn();
      return;
    }
    // pick first movable
    await movePiece(currentPlayer, movable[0].i, d);
    // if rolled 6 -> keep turn, else next
    if (d !== 6) endTurn();
    else document.getElementById('status').innerText = `تاس 6؛ ${players[currentPlayer].color} دوباره بازی می‌کند`;
  }

  function endTurn() {
    currentPlayer = (currentPlayer + 1) % players.length;
    document.getElementById('status').innerText = `نوبت ${players[currentPlayer].color}`;
  }

  // init
  async function init() {
    pieceLayer = document.getElementById('pieceLayer');
    try {
      await buildPathFromSVG();
    } catch (err) {
      console.error(err);
      document.getElementById('status').innerText = 'خطا در خواندن SVG: ' + err.message;
      return;
    }

    initPlayers();
    renderPieces();
    document.getElementById('status').innerText = `نوبت ${players[currentPlayer].color}`;
    document.getElementById('rollBtn').onclick = onRoll;
    document.getElementById('endTurnBtn').onclick = endTurn;

    // on resize recompute coordinates
    window.addEventListener('resize', () => {
      buildPathFromSVG().then(p=>{ renderPieces(); });
    });
  }

  // start
  window.addEventListener('load', init);
})();
