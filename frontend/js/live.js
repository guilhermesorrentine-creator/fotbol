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

    document.getElementById('live-feed').innerHTML = "";
    document.getElementById('tv-team-a').innerText = liveMatchData.team_a.name.substring(0, 3).toUpperCase();
    document.getElementById('tv-team-b').innerText = liveMatchData.team_b.name.substring(0, 3).toUpperCase();
    document.getElementById('tv-score-a').innerText = 0;
    document.getElementById('tv-score-b').innerText = 0;
    document.getElementById('tv-time').innerText = "0'";
    document.getElementById('tv-corners').innerText = "0–0";
    document.getElementById('tv-fouls').innerText = "0–0";
    document.getElementById('live-betting-panel').style.display = 'block';
    document.getElementById('live-odd-1-name').innerText = liveMatchData.team_a.name.substring(0, 8);
    document.getElementById('live-odd-2-name').innerText = liveMatchData.team_b.name.substring(0, 8);

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
            document.getElementById('tv-fouls').innerText =
                `${data.state.yellow_cards_a}–${data.state.yellow_cards_b}`;
        } else if (data.type === "EVENT") {
            if (data.event.type === 'GOAL') {
                isHighlightMode = true;
                triggerGoalAnimation(data.event);
            } else {
                addEventToFeed(data.event);
            }
        } else if (data.type === "RADAR_UPDATE") {
            // Ball position handled in canvas simulation
            if (!isHighlightMode) {
                ball.x = (data.x / 100) * canvas.width;
                ball.y = (data.y / 100) * canvas.height;
            }
        } else if (data.type === "LIVE_ODDS") {
            currentLiveOdds = data.odds;
            document.getElementById('live-odd-1').innerText = data.odds.team_a;
            document.getElementById('live-odd-2').innerText = data.odds.team_b;
            if (typeof renderSidebarBets === "function") renderSidebarBets();
        } else if (data.type === "MATCH_END") {
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
    let cssClass = '';
    let icon = '⚪';
    if (evt.type === 'GOAL') { cssClass = 'goal'; icon = '⚽'; }
    else if (evt.type === 'RED_CARD') { cssClass = 'red-card'; icon = '🟥'; }
    else if (evt.type === 'YELLOW_CARD') { cssClass = 'yellow-card'; icon = '🟨'; }
    else if (evt.type === 'CORNER') { icon = '🚩'; }
    else if (evt.type === 'FOUL') { icon = '⚠️'; }

    feed.innerHTML = `<div class="feed-item ${cssClass}">
        <span class="minute">${evt.minute}'</span>
        <span>${icon} ${evt.message}</span>
    </div>` + feed.innerHTML;
}

// --- Canvas Simulation ---
const canvas = document.getElementById('pitchCanvas');
const ctx = canvas.getContext('2d');
let animationId;
let gameActive = false;
let isHighlightMode = false;
const ball = { x: 400, y: 200, vx: 0, vy: 0, radius: 6, history: [] };
const players = [];

function initPlayers() {
    players.length = 0;
    for (let i = 0; i < 11; i++) players.push({ x: 120 + (i % 3) * 80, y: 40 + (i % 4) * 90, vx: 0, vy: 0, r: 7, color: '#ef4444', bx: 120 + (i % 3) * 80, by: 40 + (i % 4) * 90 });
    for (let i = 0; i < 11; i++) players.push({ x: 680 - (i % 3) * 80, y: 40 + (i % 4) * 90, vx: 0, vy: 0, r: 7, color: '#3b82f6', bx: 680 - (i % 3) * 80, by: 40 + (i % 4) * 90 });
}

function drawPitch() {
    // Base
    ctx.fillStyle = '#1a6b38';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stripe pattern
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 10; i++) {
        if (i % 2 === 0) ctx.fillRect(i * 80, 0, 80, canvas.height);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;

    // Boundary
    ctx.strokeRect(30, 20, canvas.width - 60, canvas.height - 40);

    // Halfway line
    ctx.beginPath(); ctx.moveTo(canvas.width / 2, 20); ctx.lineTo(canvas.width / 2, canvas.height - 20); ctx.stroke();

    // Centre circle
    ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 55, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(canvas.width / 2, canvas.height / 2, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();

    // Penalty boxes
    ctx.strokeRect(30, canvas.height / 2 - 70, 100, 140);
    ctx.strokeRect(canvas.width - 130, canvas.height / 2 - 70, 100, 140);

    // Goal boxes
    ctx.strokeRect(30, canvas.height / 2 - 35, 45, 70);
    ctx.strokeRect(canvas.width - 75, canvas.height / 2 - 35, 45, 70);

    // Goals
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    ctx.strokeRect(20, canvas.height / 2 - 28, 12, 56);
    ctx.strokeRect(canvas.width - 32, canvas.height / 2 - 28, 12, 56);
}

function updateSimulation() {
    if (!gameActive) return;
    ball.x += ball.vx; ball.y += ball.vy;
    ball.vx *= 0.94; ball.vy *= 0.94;

    if (Math.abs(ball.vx) > 0.5 || Math.abs(ball.vy) > 0.5) {
        ball.history.push({ x: ball.x, y: ball.y });
        if (ball.history.length > 25) ball.history.shift();
    } else if (!isHighlightMode && ball.history.length > 0) {
        ball.history.shift();
    }

    if (!isHighlightMode && Math.random() < 0.025) {
        ball.vx += (Math.random() - 0.5) * 30;
        ball.vy += (Math.random() - 0.5) * 30;
    }

    if (ball.x < 30) { ball.x = 30; ball.vx *= -0.7; }
    if (ball.x > canvas.width - 30) { ball.x = canvas.width - 30; ball.vx *= -0.7; }
    if (ball.y < 20) { ball.y = 20; ball.vy *= -0.7; }
    if (ball.y > canvas.height - 20) { ball.y = canvas.height - 20; ball.vy *= -0.7; }

    players.forEach(p => {
        if (!isHighlightMode && Math.hypot(ball.x - p.x, ball.y - p.y) < 130) {
            p.vx += (ball.x - p.x) * 0.025;
            p.vy += (ball.y - p.y) * 0.025;
        } else {
            p.vx += (p.bx - p.x) * 0.05;
            p.vy += (p.by - p.y) * 0.05;
        }
        p.vx *= 0.82; p.vy *= 0.82;
        p.x += p.vx; p.y += p.vy;
    });
}

function drawSimulation() {
    drawPitch();

    // Ball trail
    if (ball.history.length > 2) {
        ctx.beginPath();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = isHighlightMode ? 'rgba(245,158,11,0.6)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 1.5;
        ctx.moveTo(ball.history[0].x, ball.history[0].y);
        for (let i = 1; i < ball.history.length; i++) ctx.lineTo(ball.history[i].x, ball.history[i].y);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Players
    players.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();
    });

    // Ball shadow
    ctx.beginPath();
    ctx.arc(ball.x + 2, ball.y + 2, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Ball
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();
}

function loop() { updateSimulation(); drawSimulation(); animationId = requestAnimationFrame(loop); }
function startVisuals() {
    gameActive = true;
    initPlayers();
    ball.history = [];
    ball.x = canvas.width / 2; ball.y = canvas.height / 2;
    ball.vx = 0; ball.vy = 0;
    if (!animationId) loop();
}
function stopVisuals() { gameActive = false; cancelAnimationFrame(animationId); animationId = null; }

function triggerGoalAnimation(evt) {
    const isA = evt.team === liveMatchData.team_a.name;
    ball.history = [];
    ball.x = isA ? canvas.width - 280 : 280;
    ball.y = canvas.height / 2 + (Math.random() - 0.5) * 80;
    ball.vx = isA ? 50 : -50;
    ball.vy = (Math.random() - 0.5) * 8;

    const overlay = document.getElementById('coord-overlay');
    overlay.innerHTML = `⚽ GOL! ${evt.player || ''}<br><span style="font-size:0.8em; color:var(--text-muted)">trajetória traçada</span>`;
    overlay.classList.add('show');

    setTimeout(() => {
        addEventToFeed(evt);
        const sa = document.getElementById('tv-score-a');
        const sb = document.getElementById('tv-score-b');
        if (isA) sa.innerText = parseInt(sa.innerText) + 1;
        else sb.innerText = parseInt(sb.innerText) + 1;

        setTimeout(() => {
            overlay.classList.remove('show');
            isHighlightMode = false;
            if (ws) { ball.x = canvas.width / 2; ball.y = canvas.height / 2; ball.vx = 0; ball.vy = 0; initPlayers(); }
        }, 2000);
    }, 800);
}
