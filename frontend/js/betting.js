// --- Apostas ---

function openBetModal(match_id, type, odd, market, opt) {
    // Toggle: se a mesma seleção já está no slip, remove
    const existingIdx = slip.findIndex(b => b.match_id === match_id && b.type === type);
    if (existingIdx !== -1) {
        slip.splice(existingIdx, 1);
        renderSlip();
        renderMatches(); // atualiza estado visual dos botões
        return;
    }
    slip.push({ match_id, type, odd, marketName: market, optionName: opt, id: Date.now(), isResolved: false });
    renderSlip();
    renderMatches(); // atualiza estado visual dos botões
}

function closeModal() { document.getElementById('bet-modal').classList.remove('active'); }

// Legacy openBetModal that shows a confirm modal (kept for compatibility — slip version is used)
function confirmBet() { closeModal(); }

function removeSlipItem(id) { slip = slip.filter(b => b.id !== id); renderSlip(); }

function renderSlip() {
    const list = document.getElementById('bet-slip-list');
    const ctrls = document.getElementById('bet-slip-controls');
    list.innerHTML = "";
    if (slip.length === 0) {
        list.innerHTML = "<div style='color:var(--text-dim); font-size:0.85em;'>Bilhete vazio. Clique nas odds para adicionar.</div>";
        ctrls.style.display = 'none';
        return;
    }
    let totalOdd = 1.0;
    slip.forEach(b => {
        totalOdd *= b.odd;
        list.innerHTML += `
        <div class="slip-item">
            <div class="slip-option">${b.optionName} <span class="slip-odd">${b.odd.toFixed(2)}</span></div>
            <div class="slip-market">${b.marketName}</div>
            <button class="slip-remove" onclick="removeSlipItem(${b.id})">✕</button>
        </div>`;
    });
    document.getElementById('slip-total-odd').innerText = totalOdd.toFixed(2);
    ctrls.style.display = 'block';
}

function placeSlipBet() {
    const amt = parseFloat(document.getElementById('slip-amount').value);
    if (isNaN(amt) || amt <= 0) return alert("Valor inválido.");
    if (amt > wallet) return alert("Saldo insuficiente!");
    updateWallet(-amt);
    let totalOdd = 1.0;
    slip.forEach(b => totalOdd *= b.odd);
    if (slip.length === 1) {
        activeBets.push({ ...slip[0], amount: amt, isParlay: false });
    } else {
        activeBets.push({ isParlay: true, items: [...slip], amount: amt, odd: totalOdd, id: Date.now() });
    }
    slip = [];
    document.getElementById('slip-amount').value = "";
    renderSlip(); saveState(); renderMatches(); playKaching();
}

function renderSidebarBets() {
    const aList = document.getElementById('active-bets-list');
    const pList = document.getElementById('past-bets-list');

    aList.innerHTML = activeBets.length ? '' : '<div style="color:var(--text-dim); font-size:0.85em;">Nenhuma aposta ativa.</div>';
    activeBets.forEach(b => {
        let cashOutBtn = '';
        if (!b.isParlay && b.type && b.type.startsWith('LIVE_')) {
            let currentOdd = currentLiveOdds ? (b.type === 'LIVE_1' ? currentLiveOdds.team_a : currentLiveOdds.team_b) : b.odd;
            let cashOutValue = (b.amount * b.odd) / currentOdd * 0.9;
            cashOutBtn = `<button class="btn-fast btn-sm" style="float:right; margin-left:6px;" onclick="cashOut(${b.id}, ${cashOutValue.toFixed(2)})">Cash Out 🪙${cashOutValue.toFixed(2)}</button>`;
        }
        if (b.isParlay) {
            let pending = b.items.filter(i => !i.isResolved).length;
            aList.innerHTML += `<div class="bet-list-item" style="border-left-color:var(--yellow);">
                <b>MÚLTIPLA (${b.items.length} seleções)</b><br>
                Odd: ${b.odd.toFixed(2)} · Pendente: ${pending} jogo(s)<br>
                🪙 ${b.amount} → <span class="potential">🪙 ${(b.amount * b.odd).toFixed(2)}</span>
            </div>`;
        } else {
            aList.innerHTML += `<div class="bet-list-item">
                <b>${b.optionName}</b>${cashOutBtn}<br>
                ${b.marketName} · Odd: ${b.odd}<br>
                🪙 ${b.amount} → <span class="potential">🪙 ${(b.amount * b.odd).toFixed(2)}</span>
            </div>`;
        }
    });

    pList.innerHTML = pastBets.length ? '' : '<div style="color:var(--text-dim); font-size:0.85em;">Sem histórico.</div>';
    pastBets.slice(-15).reverse().forEach(b => {
        const statusClass = b.won ? 'won' : 'lost';
        const resText = b.won ? `+🪙 ${(b.amount * b.odd).toFixed(2)}` : `-🪙 ${b.amount}`;
        const title = b.isParlay ? `MÚLTIPLA (${b.odd.toFixed(2)})` : `${b.optionName}`;
        pList.innerHTML += `<div class="bet-list-item ${statusClass}"><b>${title}</b><br>Resultado: <b>${resText}</b></div>`;
    });
}

function cashOut(betId, amount) {
    let bet = activeBets.find(b => b.id === betId);
    if (!bet) return;
    activeBets = activeBets.filter(b => b.id !== betId);
    updateWallet(amount);
    walletHistory.push(wallet);
    pastBets.push({ ...bet, won: true, odd: amount / bet.amount, marketName: (bet.marketName || '') + ' (Cash Out)' });
    saveState(); playKaching(); renderSidebarBets();
}

// --- Simulação Rápida ---

async function fastSimulateMatch(match_id) {
    const m = currentRound.find(x => x.id === match_id);
    if (!m) return alert("Erro: Partida não encontrada!");
    const res = await fetch('/api/match/simulate_fast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_a_name: m.team_a.name, team_b_name: m.team_b.name, rating_a: m.rating_a, rating_b: m.rating_b })
    });
    const state = await res.json();
    resolveMatch(m, state);
}

async function simulateRemainingStage() {
    const unplayed = currentRound.filter(m => !m.result);
    if (unplayed.length === 0) return alert("Rodada já concluída!");
    for (let m of unplayed) {
        const res = await fetch('/api/match/simulate_fast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team_a_name: m.team_a.name, team_b_name: m.team_b.name, rating_a: m.rating_a, rating_b: m.rating_b })
        });
        const state = await res.json();
        resolveMatch(m, state, true);
    }
    playWhistle();
    renderMatches();
}

function resolveMatch(m, state, silent = false) {
    const sa = state.score_a;
    const sb = state.score_b;
    m.result = { scoreA: sa, scoreB: sb };

    const winner = sa > sb ? m.team_a : (sb > sa ? m.team_b : (m.rating_a >= m.rating_b ? m.team_a : m.team_b));
    winners.push({ team: winner, rating: winner.name === m.team_a.name ? m.rating_a : m.rating_b });
    playedMatches++;

    const res1x2 = sa > sb ? "1" : (sb > sa ? "2" : "X");
    const isOver = (sa + sb) > 2.5;
    const isBtts = sa > 0 && sb > 0;
    const scorers = state.scorers || [];
    const total_corners = (state.corners_a || 0) + (state.corners_b || 0);
    const total_cards = (state.yellow_cards_a || 0) + (state.yellow_cards_b || 0) + (state.red_cards_a || 0) + (state.red_cards_b || 0);

    function checkItemWon(item) {
        if (["1","X","2"].includes(item.type)) return item.type === res1x2;
        if (item.type === "O2.5") return isOver;
        if (item.type === "U2.5") return !isOver;
        if (item.type === "BTTS_Y") return isBtts;
        if (item.type === "BTTS_N") return !isBtts;
        if (item.type === "O8.5_CORNERS") return total_corners > 8.5;
        if (item.type === "U8.5_CORNERS") return total_corners < 8.5;
        if (item.type === "O4.5_CARDS") return total_cards > 4.5;
        if (item.type === "U4.5_CARDS") return total_cards < 4.5;
        if (item.type.startsWith("GOL_")) return scorers.includes(item.optionName);
        if (item.type === "LIVE_1") return sa > sb;
        if (item.type === "LIVE_2") return sb > sa;
        return false;
    }

    let winnings = 0;
    for (let i = activeBets.length - 1; i >= 0; i--) {
        let b = activeBets[i];
        if (b.isParlay) {
            let hasMatchItem = false;
            let matchItemWon = true;
            b.items.forEach(item => {
                if (item.match_id === m.id) {
                    hasMatchItem = true;
                    item.isResolved = true;
                    item.won = checkItemWon(item);
                    if (!item.won) matchItemWon = false;
                }
            });
            if (hasMatchItem) {
                if (!matchItemWon) {
                    b.won = false;
                    pastBets.push(b);
                    activeBets.splice(i, 1);
                } else {
                    const allResolved = b.items.every(it => it.isResolved);
                    if (allResolved) {
                        b.won = true;
                        winnings += b.amount * b.odd;
                        updateXP(200);
                        pastBets.push(b);
                        activeBets.splice(i, 1);
                    }
                }
            }
        } else {
            if (b.match_id === m.id) {
                b.won = checkItemWon(b);
                if (b.won) { winnings += b.amount * b.odd; updateXP(50); }
                pastBets.push(b);
                activeBets.splice(i, 1);
            }
        }
    }

    let paidLoanStr = "";
    if (winnings > 0 && loan > 0) {
        let discount = Math.min(winnings * 0.20, loan);
        loan -= discount;
        winnings -= discount;
        paidLoanStr = `\n📉 (🪙 ${discount.toFixed(2)} retidos para dívida)`;
    }
    if (winnings > 0) updateWallet(winnings);
    else saveState();

    walletHistory.push(wallet);
    saveState();

    if (!silent) {
        if (winnings > 0) {
            playKaching();
            alert(`Placar: ${m.team_a.name} ${sa}×${sb} ${m.team_b.name}\n💰 GREEN! Você lucrou 🪙 ${winnings.toFixed(2)}!${paidLoanStr}`);
        } else {
            alert(`Placar: ${m.team_a.name} ${sa}×${sb} ${m.team_b.name}\n💸 Resultado computado.`);
        }
        playWhistle();
    }

    renderMatches();
    checkStageComplete();
}

async function checkStageComplete() {
    if (playedMatches < currentRound.length) return;

    processDividends();

    if (!isTournamentMode) {
        alert("✅ Rodada concluída!");
        return;
    }

    if (winners.length === 1) {
        alert(`🏆 TORNEIO ENCERRADO! Campeão: ${winners[0].team.name}!`);
        let winSum = 0;
        activeBets.filter(b => b.type === "CHAMP").forEach(b => {
            b.won = (b.optionName === winners[0].team.name);
            if (b.won) winSum += b.amount * b.odd;
            pastBets.push(b);
        });
        activeBets = activeBets.filter(b => b.type !== "CHAMP");
        if (winSum > 0) {
            if (loan > 0) {
                let discount = Math.min(winSum * 0.20, loan);
                loan -= discount; winSum -= discount;
            }
            updateWallet(winSum); walletHistory.push(wallet); saveState();
            playKaching();
            alert(`💰 JACKPOT! Apostas de Campeão: 🪙 ${winSum.toFixed(2)}!`);
        } else saveState();
        return;
    }

    setTimeout(() => advanceTournament(), 1000);
}

async function advanceTournament() {
    const nextStage = tournamentStage === "Quartas de Final" ? "Semi-Final" : "Final";
    const res = await fetch('/api/tournament/next_round', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winners, next_stage: nextStage })
    });
    const data = await res.json();
    currentRound = data.matches;
    tournamentStage = data.stage;
    playedMatches = 0;
    winners = [];
    document.getElementById('tourney-stage').innerText = `Fase atual: ${tournamentStage}`;
    if (tournamentStage !== "Quartas de Final") {
        document.getElementById('outrights-panel').style.display = 'none';
    }
    renderMatches();
}
