// --- Estado Global & Inicialização ---

let wallet = 1000.0;
let loan = 0.0;
let xp = 0;
let stocks = {};
let walletHistory = [1000.0];
let username = localStorage.getItem('username');

let activeBets = JSON.parse(localStorage.getItem('activeBets') || '[]');
let pastBets = JSON.parse(localStorage.getItem('pastBets') || '[]');
let slip = [];
let currentRound = [];
let tournamentStage = "";
let playedMatches = 0;
let winners = [];
let isTournamentMode = false;
let ws;
let liveMatchData = null;

// --- XP ---
function updateXP(amount) {
    xp += amount;
    let title = "Apostador Iniciante", max = 500;
    if (xp >= 5000) { title = "Lenda das Apostas"; max = 10000; }
    else if (xp >= 2000) { title = "Trader de Elite"; max = 5000; }
    else if (xp >= 500) { title = "Analista"; max = 2000; }
    const bar = document.getElementById('xp-bar');
    if (bar) {
        document.getElementById('xp-title').innerText = title;
        bar.style.width = Math.min(100, (xp / max) * 100) + "%";
    }
}

// --- Login ---
async function doLogin() {
    const inputVal = document.getElementById('username-input').value.trim();
    if (inputVal) {
        username = inputVal;
        localStorage.setItem('username', username);
    } else if (!username) {
        return alert("Digite um nome!");
    }
    try {
        const res = await fetch('/api/users/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
        const data = await res.json();
        wallet = data.wallet;
        loan = data.loan;
        xp = data.xp;
        if (data.state_json && data.state_json !== "{}") {
            try {
                const st = JSON.parse(data.state_json);
                if (st.activeBets) activeBets = st.activeBets;
                if (st.pastBets) pastBets = st.pastBets;
                if (st.stocks) stocks = st.stocks;
                if (st.walletHistory) walletHistory = st.walletHistory;
            } catch (e) { }
        }
        document.getElementById('login-modal').classList.remove('active');
        saveState();
        if (typeof renderSidebarBets === "function") renderSidebarBets();
    } catch (e) {
        alert("Erro ao logar: " + e.message);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    if (!username) {
        document.getElementById("login-modal").classList.add("active");
    } else {
        doLogin();
    }
});

// --- Áudio ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playKaching() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
    osc.start(); osc.stop(audioCtx.currentTime + 0.3);
}
function playWhistle() {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(2500, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
    osc.start(); osc.stop(audioCtx.currentTime + 0.5);
}

// --- Chart ---
function drawChart() {
    const canvas = document.getElementById('bankroll-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (walletHistory.length < 2) return;
    const max = Math.max(...walletHistory, 1500);
    const min = Math.min(...walletHistory, 0);
    const range = max - min || 1;
    const stepX = canvas.width / (walletHistory.length - 1);

    // Fill area under line
    ctx.beginPath();
    walletHistory.forEach((val, i) => {
        const x = i * stepX;
        const y = canvas.height - ((val - min) / range) * canvas.height;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.lineTo(canvas.width, canvas.height);
    ctx.lineTo(0, canvas.height);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,217,126,0.1)';
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = '#00d97e';
    ctx.lineWidth = 1.5;
    walletHistory.forEach((val, i) => {
        const x = i * stepX;
        const y = canvas.height - ((val - min) / range) * canvas.height;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
}

// --- Save / Update ---
function saveState() {
    localStorage.setItem('wallet', wallet);
    localStorage.setItem('loan', loan);
    localStorage.setItem('activeBets', JSON.stringify(activeBets));
    localStorage.setItem('walletHistory', JSON.stringify(walletHistory));
    localStorage.setItem('pastBets', JSON.stringify(pastBets));
    localStorage.setItem('stocks', JSON.stringify(stocks));

    document.getElementById('wallet-display').innerText = `🪙 ${wallet.toFixed(2)}`;
    updateXP(0);

    const ld = document.getElementById('loan-display');
    const btnLoan = document.getElementById('btn-loan');
    if (loan > 0) {
        ld.style.display = 'block';
        ld.innerText = `Dívida: 🪙 ${loan.toFixed(2)}`;
        btnLoan.innerText = "💸 Quitar Dívida";
        btnLoan.style.background = "var(--red)";
        btnLoan.style.color = "white";
    } else {
        ld.style.display = 'none';
        btnLoan.innerText = "🏦 Empréstimo";
        btnLoan.style.background = "var(--yellow)";
        btnLoan.style.color = "black";
    }

    if (username) {
        fetch('/api/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, wallet, loan, xp, state_json: JSON.stringify({ activeBets, pastBets, stocks, walletHistory }) })
        }).catch(e => console.warn("Sync error", e));
    }

    if (typeof renderSidebarBets === "function") renderSidebarBets();
    drawChart();
}

function updateWallet(amount) { wallet += amount; saveState(); }

// --- Init ---
async function initApp() {
    const res = await fetch('/api/leagues');
    const leagues = await res.json();
    const sel = document.getElementById('league-select');
    sel.innerHTML = '<option value="">-- Selecione a Liga --</option>';
    leagues.forEach(l => sel.innerHTML += `<option value="${l.id}">${l.name}</option>`);
    saveState();
}
initApp();

// --- Generate ---
async function handleGenerate() {
    const lid = document.getElementById('league-select').value;
    if (!lid) return alert("Selecione uma liga!");
    if (lid === "1" || lid === "2" || lid === "13") {
        isTournamentMode = true;
        generateTournament(lid);
    } else {
        isTournamentMode = false;
        generateRegularRound(lid);
    }
}

async function generateTournament(lid) {
    document.getElementById('tournament-view').style.display = 'block';
    document.getElementById('matches-list').innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">⏳ Gerando chaveamento...</div>';
    document.getElementById('outrights-panel').style.display = 'block';
    playedMatches = 0; winners = [];

    const res = await fetch(`/api/tournament/generate?league_id=${lid}`);
    const data = await res.json();
    if (data.error) return alert(data.error);

    currentRound = data.matches;
    if (data.news && data.news.length > 0) {
        document.getElementById('news-ticker').style.display = 'block';
        document.getElementById('news-marquee').innerText = data.news.join("  ·  ");
    } else {
        document.getElementById('news-ticker').style.display = 'none';
    }
    tournamentStage = data.stage;
    document.getElementById('tourney-stage').innerText = `Fase atual: ${tournamentStage}`;
    document.getElementById('outrights-grid').innerHTML = "";
    data.outrights.forEach(o => {
        document.getElementById('outrights-grid').innerHTML += `
        <button class="odd-btn" style="text-align:left; padding:10px;" onclick="openBetModal('OUTRIGHT', 'CHAMP', ${o.odd}, 'Campeão do Torneio', '${o.team.name}')">
            <img src="${o.team.logo}" style="width:18px; vertical-align:middle; margin-right:5px; object-fit:contain;">
            <span style="font-size:0.9em;">${o.team.name}</span>
            <span style="color:var(--accent); float:right; font-weight:700;">${o.odd}</span>
        </button>`;
    });
    renderMatches();
}

async function generateRegularRound(lid) {
    document.getElementById('tournament-view').style.display = 'block';
    document.getElementById('matches-list').innerHTML = '<div style="color:var(--text-muted); padding:20px; text-align:center;">⏳ Gerando rodada...</div>';
    document.getElementById('outrights-panel').style.display = 'none';
    playedMatches = 0; winners = [];

    const res = await fetch(`/api/round/generate?league_id=${lid}`);
    const data = await res.json();
    if (data.error) return alert(data.error);

    // API returns {matches, news}
    currentRound = data.matches || [];
    tournamentStage = "Rodada Regular";
    document.getElementById('tourney-stage').innerText = "Campeonato — Rodada Ativa";
    renderMatches();
}

function renderMatches() {
    document.getElementById('bracket-title').innerText = `Partidas — ${tournamentStage}`;
    const list = document.getElementById('matches-list');
    list.innerHTML = "";

    currentRound.forEach(m => {
        const isPlayed = !!m.result;
        const overlay = isPlayed
            ? `<div class="match-result-overlay" style="display:flex;">
                ${m.result.scoreA} — ${m.result.scoreB}
                <div class="result-sub">Partida encerrada · Apostas resolvidas</div>
               </div>`
            : '';

        const localBets = activeBets.filter(b => b.match_id === m.id);
        let localBetsHtml = '';
        if (localBets.length > 0 && !isPlayed) {
            localBetsHtml = `<div class="local-bets-area">
                <b>Seus bilhetes:</b>
                ${localBets.map(b => `<span class="local-bet-chip">${b.optionName} · 🪙${b.amount}</span>`).join('')}
            </div>`;
        }

        // Retorna classe 'selected' se a seleção já está no slip
        const inSlip = (mid, type) => slip.some(b => b.match_id === mid && b.type === type) ? ' selected' : '';

        const playerMarketsHtml = (m.player_markets && m.player_markets.filter(x => x.market === 'GOL').length > 0)
            ? m.player_markets.filter(x => x.market === 'GOL').map(p =>
                `<button class="odd-btn${inSlip(m.id, 'GOL_' + p.player)}" style="padding:5px 6px; min-width:unset;" onclick="openBetModal('${m.id}', 'GOL_${p.player}', ${p.odd}, 'Marcador Gol', '${p.player}')">
                    <span>${p.player}</span>${p.odd}
                </button>`).join('')
            : '<span style="color:var(--text-dim); font-size:0.82em;">Indisponível</span>';

        list.innerHTML += `
        <div class="match-card ${isPlayed ? 'played' : ''}" id="card-${m.id}">
            ${overlay}
            <div class="match-header">
                <div class="match-teams">
                    <img src="${m.team_a.logo}" onerror="this.style.display='none'">
                    <span>${m.team_a.name}</span>
                    <span class="match-vs">vs</span>
                    <span>${m.team_b.name}</span>
                    <img src="${m.team_b.logo}" onerror="this.style.display='none'">
                </div>
                <div class="action-buttons">
                    <button class="btn-watch" onclick="watchMatch('${m.id}')">▶ Ao Vivo</button>
                    <button class="btn-fast" onclick="fastSimulateMatch('${m.id}')">⚡ Rápido</button>
                </div>
            </div>
            <div class="markets-container">
                <div class="market-group">
                    <div class="market-title">Resultado (1X2)</div>
                    <div class="odds-row">
                        <div class="odd-btn${inSlip(m.id,'1')}" onclick="openBetModal('${m.id}', '1', ${m.odds['1']}, 'Vencedor', '${m.team_a.name}')"><span>Casa</span>${m.odds['1']}</div>
                        <div class="odd-btn${inSlip(m.id,'X')}" onclick="openBetModal('${m.id}', 'X', ${m.odds['X']}, 'Vencedor', 'Empate')"><span>X</span>${m.odds['X']}</div>
                        <div class="odd-btn${inSlip(m.id,'2')}" onclick="openBetModal('${m.id}', '2', ${m.odds['2']}, 'Vencedor', '${m.team_b.name}')"><span>Fora</span>${m.odds['2']}</div>
                    </div>
                </div>
                <div class="market-group">
                    <div class="market-title">Gols 2.5</div>
                    <div class="odds-row">
                        <div class="odd-btn${inSlip(m.id,'O2.5')}" onclick="openBetModal('${m.id}', 'O2.5', ${m.odds['O2.5']}, 'Total Gols', '+2.5')"><span>+2.5</span>${m.odds['O2.5']}</div>
                        <div class="odd-btn${inSlip(m.id,'U2.5')}" onclick="openBetModal('${m.id}', 'U2.5', ${m.odds['U2.5']}, 'Total Gols', '-2.5')"><span>-2.5</span>${m.odds['U2.5']}</div>
                    </div>
                </div>
                <div class="market-group">
                    <div class="market-title">Ambas Marcam</div>
                    <div class="odds-row">
                        <div class="odd-btn${inSlip(m.id,'BTTS_Y')}" onclick="openBetModal('${m.id}', 'BTTS_Y', ${m.odds['BTTS_Y']}, 'Ambas Marcam', 'Sim')"><span>Sim</span>${m.odds['BTTS_Y']}</div>
                        <div class="odd-btn${inSlip(m.id,'BTTS_N')}" onclick="openBetModal('${m.id}', 'BTTS_N', ${m.odds['BTTS_N']}, 'Ambas Marcam', 'Não')"><span>Não</span>${m.odds['BTTS_N']}</div>
                    </div>
                </div>
                <div class="market-group" style="flex:2;">
                    <div class="market-title">Marcadores (Gol)</div>
                    <div class="odds-row" style="flex-wrap:wrap; justify-content:flex-start;">${playerMarketsHtml}</div>
                </div>
            </div>
            ${localBetsHtml}
        </div>`;
    });
}
