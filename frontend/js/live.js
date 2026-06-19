// --- Live Match Engine ---

let currentLiveOdds = null;
let lastLiveState = null;

function placeLiveBet(type) {
    if (!currentLiveOdds || !liveMatchData) return;
    const odd = type === '1' ? currentLiveOdds.team_a : currentLiveOdds.team_b;
    const team = type === '1' ? liveMatchData.team_a.name : liveMatchData.team_b.name;
    openBetModal(liveMatchData.id, 'LIVE_' + type, odd, 'Vencedor (Ao Vivo)', team);
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
}

function exitLive() {
    if (ws) ws.close();
    stopVisuals();
    document.getElementById('live-betting-panel').style.display = 'none';
    switchView('view-hub');
}

function watchMatch(match_id) {
    liveMatchData = currentRound.find(m => m.id === match_id);
    if (!liveMatchData) return alert("Erro interno na partida.");

    document.getElementById('live-feed').innerHTML =
        '<div style="color:var(--text-dim);padding:20px;text-align:center;font-size:0.85em;">Aguardando eventos da partida...</div>';
    document.getElementById('tv-team-a').innerText = liveMatchData.team_a.name.substring(0, 3).toUpperCase();
    document.getElementById('tv-team-b').innerText = liveMatchData.team_b.name.substring(0, 3).toUpperCase();
    document.getElementById('tv-score-a').innerText = 0;
    document.getElementById('tv-score-b').innerText = 0;
    document.getElementById('tv-time').innerText = "0'";
    document.getElementById('tv-corners').innerText = '0–0';
    document.getElementById('tv-fouls').innerText = '0–0';
    document.getElementById('live-betting-panel').style.display = 'block';
    document.getElementById('live-odd-1-name').innerText = liveMatchData.team_a.name.substring(0, 10);
    document.getElementById('live-odd-2-name').innerText = liveMatchData.team_b.name.substring(0, 10);

    switchView('view-live');
    startVisuals();
    playWhistle();

    ws = new WebSocket("ws://" + window.location.host + "/ws/match");
    ws.onopen = () => ws.send(JSON.stringify({
        type: "START",
        team_a_name: liveMatchData.team_a.name,
        team_b_name: liveMatchData.team_b.name,
        rating_a: liveMatchData.rating_a,
        rating_b: liveMatchData.rating_b,
        squad_a: liveMatchData.squad_a,
        squad_b: liveMatchData.squad_b
    }));

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === "STATE_UPDATE" && !isHighlightMode) {
            lastLiveState = data.state;
            document.getElementById('tv-score-a').innerText = data.state.score_a;
            document.getElementById('tv-score-b').innerText = data.state.score_b;
            document.getElementById('tv-time').innerText = data.state.minute + "'";
            document.getElementById('tv-corners').innerText = `${data.state.corners_a}–${data.state.corners_b}`;
            document.getElementById('tv-fouls').innerText = `${data.state.yellow_cards_a}–${data.state.yellow_cards_b}`;
        } else if (data.type === "EVENT") {
            if (data.event.type === 'GOAL') {
                isHighlightMode = true;
                triggerGoalAnimation(data.event);
            } else {
                addEventToFeed(data.event);
            }
        } else if (data.type === "RADAR_UPDATE") {
            if (!isHighlightMode) {
                targetBallX = (data.x / 100) * canvas.width;
                targetBallY = (data.y / 100) * canvas.height;
            }
        } else if (data.type === "LIVE_ODDS") {
            currentLiveOdds = data.odds;
            document.getElementById('live-odd-1').innerText = data.odds.team_a;
            document.getElementById('live-odd-2').innerText = data.odds.team_b;
            if (typeof renderSidebarBets === "function") renderSidebarBets();
        } else if (data.type === "MATCH_END") {
            addEventToFeed({ type: 'END', minute: 90, message: '⏱️ Apito final! Partida encerrada.' });
            setTimeout(() => {
                stopVisuals();
                ws.close();
                document.getElementById('live-betting-panel').style.display = 'none';
                const finalState = lastLiveState || {
                    score_a: parseInt(document.getElementById('tv-score-a').innerText),
                    score_b: parseInt(document.getElementById('tv-score-b').innerText),
                    scorers: []
                };
                resolveMatch(liveMatchData, finalState);
                exitLive();
            }, 2500);
        }
    };
}

function addEventToFeed(evt) {
    const feed = document.getElementById('live-feed');
    // Remove placeholder
    const placeholder = feed.querySelector('[data-placeholder]');
    if (placeholder) placeholder.remove();

    let cssClass = '', icon = '⚪';
    if (evt.type === 'GOAL')        { cssClass = 'goal';        icon = '⚽'; }
    else if (evt.type === 'RED_CARD')    { cssClass = 'red-card';   icon = '🟥'; }
    else if (evt.type === 'YELLOW_CARD') { cssClass = 'yellow-card';icon = '🟨'; }
    else if (evt.type === 'CORNER')      { icon = '🚩'; }
    else if (evt.type === 'FOUL')        { icon = '⚠️'; }
    else if (evt.type === 'END')         { icon = '🏁'; }

    const div = document.createElement('div');
    div.className = `feed-item ${cssClass}`;
    div.innerHTML = `<span class="minute">${evt.minute}'</span><span>${icon} ${evt.message}</span>`;
    feed.insertBefore(div, feed.firstChild);
}

// ======================== CANVAS ENGINE ========================

const canvas = document.getElementById('pitchCanvas');
const ctx = canvas.getContext('2d');
let animationId = null;
let gameActive = false;
let isHighlightMode = false;

// Ball state
const ball = { x: 400, y: 200, vx: 0, vy: 0, radius: 7, history: [] };
let targetBallX = 400, targetBallY = 200;

// Players array
const players = [];

// 4-4-2 formation base positions (canvas 800x400, pitch area ~740x360 with margins)
function getFormation(side) {
    // side: 'left' (team A, attacks right) or 'right' (team B, attacks left)
    const L = side === 'left';
    const mx = L ? 1 : -1; // mirror
    const ox = L ? 30 : 770; // origin x

    const pos = [
        // GK
        { x: ox + mx * 30,  y: 200 },
        // Defenders
        { x: ox + mx * 120, y: 80  },
        { x: ox + mx * 120, y: 153 },
        { x: ox + mx * 120, y: 247 },
        { x: ox + mx * 120, y: 320 },
        // Midfielders
        { x: ox + mx * 240, y: 90  },
        { x: ox + mx * 240, y: 167 },
        { x: ox + mx * 240, y: 233 },
        { x: ox + mx * 240, y: 310 },
        // Forwards
        { x: ox + mx * 350, y: 150 },
        { x: ox + mx * 350, y: 250 },
    ];
    return pos;
}

function initPlayers() {
    players.length = 0;
    const posA = getFormation('left');
    const posB = getFormation('right');
    posA.forEach((p, i) => players.push({
        x: p.x, y: p.y, vx: 0, vy: 0, r: 8,
        color: '#ef4444', outlineColor: '#fff',
        bx: p.x, by: p.y, num: i + 1, team: 'A'
    }));
    posB.forEach((p, i) => players.push({
        x: p.x, y: p.y, vx: 0, vy: 0, r: 8,
        color: '#3b82f6', outlineColor: '#fff',
        bx: p.x, by: p.y, num: i + 1, team: 'B'
    }));
}

// ======================== PITCH DRAWING ========================
function drawPitch() {
    const W = canvas.width, H = canvas.height;
    const M = 18; // margin

    // Base green
    ctx.fillStyle = '#1a6b38';
    ctx.fillRect(0, 0, W, H);

    // Alternating stripes
    for (let i = 0; i < 8; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
        ctx.fillRect(i * (W / 8), 0, W / 8, H);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;

    // Boundary
    ctx.strokeRect(M, M, W - M * 2, H - M * 2);

    // Halfway line
    ctx.beginPath(); ctx.moveTo(W / 2, M); ctx.lineTo(W / 2, H - M); ctx.stroke();

    // Centre circle
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 55, 0, Math.PI * 2); ctx.stroke();

    // Centre dot
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();

    // Penalty boxes
    ctx.strokeRect(M, H / 2 - 75, 105, 150);      // left
    ctx.strokeRect(W - M - 105, H / 2 - 75, 105, 150); // right

    // 6-yard boxes
    ctx.strokeRect(M, H / 2 - 38, 45, 76);
    ctx.strokeRect(W - M - 45, H / 2 - 38, 45, 76);

    // Penalty spots
    ctx.beginPath(); ctx.arc(M + 76, H / 2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W - M - 76, H / 2, 3, 0, Math.PI * 2); ctx.fill();

    // Penalty arcs
    ctx.beginPath(); ctx.arc(M + 76, H / 2, 55, -0.9, 0.9); ctx.stroke();
    ctx.beginPath(); ctx.arc(W - M - 76, H / 2, 55, Math.PI - 0.9, Math.PI + 0.9); ctx.stroke();

    // Corner arcs
    const cr = 9;
    [[M, M, 0, Math.PI / 2], [W - M, M, Math.PI / 2, Math.PI],
     [M, H - M, -Math.PI / 2, 0], [W - M, H - M, Math.PI, 3 * Math.PI / 2]]
        .forEach(([cx, cy, s, e]) => { ctx.beginPath(); ctx.arc(cx, cy, cr, s, e); ctx.stroke(); });

    // Goals (nets)
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(M - 14, H / 2 - 32, 14, 64);
    ctx.strokeRect(W - M, H / 2 - 32, 14, 64);
    ctx.lineWidth = 1.5;
}

// ======================== SIMULATION ========================
function updateSimulation() {
    if (!gameActive) return;

    // Smoothly move ball toward target (from radar)
    if (!isHighlightMode) {
        ball.x += (targetBallX - ball.x) * 0.03;
        ball.y += (targetBallY - ball.y) * 0.03;
    }

    ball.x += ball.vx; ball.y += ball.vy;
    ball.vx *= 0.92; ball.vy *= 0.92;

    // Bounce off walls
    if (ball.x < 18) { ball.x = 18; ball.vx = Math.abs(ball.vx) * 0.7; }
    if (ball.x > canvas.width - 18) { ball.x = canvas.width - 18; ball.vx = -Math.abs(ball.vx) * 0.7; }
    if (ball.y < 18) { ball.y = 18; ball.vy = Math.abs(ball.vy) * 0.7; }
    if (ball.y > canvas.height - 18) { ball.y = canvas.height - 18; ball.vy = -Math.abs(ball.vy) * 0.7; }

    // Ball trail
    if (Math.hypot(ball.vx, ball.vy) > 1) {
        ball.history.push({ x: ball.x, y: ball.y });
        if (ball.history.length > 20) ball.history.shift();
    } else {
        if (ball.history.length > 0) ball.history.shift();
    }

    // Player AI
    players.forEach((p, idx) => {
        const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
        const isNearest = dist < 120 && !isHighlightMode;
        if (isNearest) {
            p.vx += (ball.x - p.x) * 0.018;
            p.vy += (ball.y - p.y) * 0.018;
        } else {
            // Drift toward formation position
            p.vx += (p.bx - p.x) * 0.04;
            p.vy += (p.by - p.y) * 0.04;
        }
        // Add slight random jitter
        if (!isHighlightMode && Math.random() < 0.05) {
            p.vx += (Math.random() - 0.5) * 1.5;
            p.vy += (Math.random() - 0.5) * 1.5;
        }
        p.vx *= 0.78; p.vy *= 0.78;
        p.x += p.vx; p.y += p.vy;

        // Keep on pitch
        p.x = Math.max(25, Math.min(canvas.width - 25, p.x));
        p.y = Math.max(25, Math.min(canvas.height - 25, p.y));
    });
}

function drawSimulation() {
    drawPitch();

    // Ball trail
    if (ball.history.length > 2) {
        ctx.beginPath();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = isHighlightMode ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 2;
        ball.history.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Find nearest player to ball
    let nearestDist = Infinity, nearestIdx = -1;
    players.forEach((p, i) => {
        const d = Math.hypot(ball.x - p.x, ball.y - p.y);
        if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
    });

    // Draw players
    players.forEach((p, i) => {
        const isNearest = i === nearestIdx && nearestDist < 40;

        // Shadow
        ctx.beginPath();
        ctx.ellipse(p.x + 1, p.y + 3, p.r + 2, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Glow if nearest
        if (isNearest) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r + 5, 0, Math.PI * 2);
            ctx.fillStyle = p.color === '#ef4444' ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)';
            ctx.fill();
        }

        // Body
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = p.outlineColor;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Number
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${p.r - 1}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(p.num, p.x, p.y);
    });

    // Ball shadow
    ctx.beginPath();
    ctx.ellipse(ball.x + 2, ball.y + 4, ball.radius, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();

    // Ball glow (highlight mode = goal)
    if (isHighlightMode) {
        const glow = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, ball.radius * 4);
        glow.addColorStop(0, 'rgba(245,158,11,0.7)');
        glow.addColorStop(1, 'rgba(245,158,11,0)');
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius * 4, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
    }

    // Ball
    const ballGrad = ctx.createRadialGradient(ball.x - 2, ball.y - 2, 1, ball.x, ball.y, ball.radius);
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(1, '#cccccc');
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = ballGrad;
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pentagon patches on ball
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(ball.x + 2, ball.y - 2, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(ball.x - 2, ball.y + 2, 2, 0, Math.PI * 2); ctx.fill();
}

function loop() {
    updateSimulation();
    drawSimulation();
    animationId = requestAnimationFrame(loop);
}

function startVisuals() {
    gameActive = true;
    initPlayers();
    ball.history = [];
    ball.x = canvas.width / 2; ball.y = canvas.height / 2;
    ball.vx = 0; ball.vy = 0;
    targetBallX = canvas.width / 2; targetBallY = canvas.height / 2;
    if (animationId) cancelAnimationFrame(animationId);
    animationId = null;
    loop();
}

function stopVisuals() {
    gameActive = false;
    if (animationId) { cancelAnimationFrame(animationId); animationId = null; }
}

// ======================== GOAL ANIMATION ========================
function triggerGoalAnimation(evt) {
    const isA = evt.team === liveMatchData.team_a.name;
    ball.history = [];
    ball.x = isA ? canvas.width - 300 : 300;
    ball.y = canvas.height / 2 + (Math.random() - 0.5) * 60;
    ball.vx = isA ? 55 : -55;
    ball.vy = (Math.random() - 0.5) * 10;
    targetBallX = isA ? canvas.width - 22 : 22;
    targetBallY = canvas.height / 2;

    const overlay = document.getElementById('coord-overlay');
    overlay.innerHTML = `
        <div style="font-size:1.6em; font-weight:900; color:var(--accent);">⚽ GOL!</div>
        <div style="font-size:0.9em; margin-top:4px;">${evt.player || ''}</div>
        <div style="font-size:0.75em; color:var(--text-muted); margin-top:2px;">${evt.minute}'</div>`;
    overlay.classList.add('show');

    setTimeout(() => {
        addEventToFeed(evt);
        const sa = document.getElementById('tv-score-a');
        const sb = document.getElementById('tv-score-b');
        if (isA) sa.innerText = parseInt(sa.innerText) + 1;
        else sb.innerText = parseInt(sb.innerText) + 1;

        // Score flash animation
        const el = isA ? sa : sb;
        el.style.transition = 'color 0.2s';
        el.style.color = '#fbbf24';
        setTimeout(() => { el.style.color = ''; }, 1000);

        setTimeout(() => {
            overlay.classList.remove('show');
            isHighlightMode = false;
            ball.x = canvas.width / 2; ball.y = canvas.height / 2;
            ball.vx = 0; ball.vy = 0;
            targetBallX = canvas.width / 2; targetBallY = canvas.height / 2;
            initPlayers();
        }, 2200);
    }, 900);
}
