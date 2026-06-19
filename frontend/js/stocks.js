// --- Bolsa de Valores ---

function getOwnedTeams() {
    return Object.keys(stocks).filter(k => stocks[k].isOwned);
}

function openStocksModal() {
    document.getElementById('stocks-modal').classList.add('active');
    const list = document.getElementById('stocks-list');
    list.innerHTML = "";

    const aliveTeams = currentRound.flatMap(m => [m.team_a, m.team_b]);
    if (aliveTeams.length === 0) {
        list.innerHTML = "<p style='color:var(--text-muted);'>Sem times disponíveis. Gere uma rodada primeiro.</p>";
        return;
    }

    aliveTeams.forEach(t => {
        const m = currentRound.find(x => x.team_a.id === t.id || x.team_b.id === t.id);
        const rating = m ? (m.team_a.id === t.id ? m.rating_a : m.rating_b) : 80;
        const price = (rating / 5).toFixed(2);
        const myShares = stocks[t.name]?.shares || 0;
        const myShorts = stocks[t.name]?.shorts || 0;
        const isOwned = stocks[t.name]?.isOwned;

        list.innerHTML += `
        <div class="stock-item">
            <div class="stock-item-row">
                <div>
                    <span class="stock-name">${t.name}</span>
                    ${isOwned ? '<span class="stock-owned-badge">👑 Dono</span>' : ''}
                </div>
                <span class="stock-price">🪙 ${price}</span>
            </div>
            <div class="stock-item-row" style="color:var(--text-muted); font-size:0.82em;">
                <span>Ações: <b style="color:var(--text)">${myShares}</b> &nbsp;·&nbsp; Shorts: <b style="color:var(--text)">${myShorts}</b></span>
            </div>
            <div class="stock-actions">
                <button class="btn-confirm btn-sm" style="flex:1;" onclick="buyStock('${t.name}', ${price})">Comprar ação</button>
                <button class="btn-danger btn-sm" style="flex:1;" onclick="shortStock('${t.name}', ${price})">Short</button>
            </div>
            ${!isOwned
                ? `<button onclick="buyTeam('${t.name}', 10000)" style="width:100%; margin-top:4px; background:var(--yellow); color:#000; border:none; padding:7px; font-weight:700; border-radius:var(--radius-sm); cursor:pointer;">🏟️ Comprar Clube (🪙 10.000)</button>`
                : `<div style="color:var(--yellow); font-size:0.82em; text-align:center; margin-top:4px;">Você é o dono! (+10 Rating permanente)</div>`
            }
        </div>`;
    });
}

function closeStocksModal() { document.getElementById('stocks-modal').classList.remove('active'); }

function buyStock(teamName, price) {
    if (wallet < price) return alert("Saldo insuficiente!");
    updateWallet(-price); playKaching();
    if (!stocks[teamName]) stocks[teamName] = { shares: 0, avgPrice: 0, shorts: 0, isOwned: false };
    const totalSpent = (stocks[teamName].shares * stocks[teamName].avgPrice) + price;
    stocks[teamName].shares += 1;
    stocks[teamName].avgPrice = totalSpent / stocks[teamName].shares;
    saveState(); openStocksModal();
}

function shortStock(teamName, price) {
    if (wallet < price) return alert("Saldo insuficiente para cobrir margem!");
    updateWallet(-price); playKaching();
    if (!stocks[teamName]) stocks[teamName] = { shares: 0, avgPrice: 0, shorts: 0, isOwned: false };
    stocks[teamName].shorts += 1;
    saveState(); openStocksModal();
}

function buyTeam(teamName, price) {
    if (wallet < price) return alert("Faltam recursos para comprar o clube!");
    updateWallet(-price); playKaching();
    if (!stocks[teamName]) stocks[teamName] = { shares: 0, avgPrice: 0, shorts: 0, isOwned: false };
    stocks[teamName].isOwned = true;
    alert(`🎉 Parabéns, Magnata! Você agora é o dono do ${teamName}. Eles jogarão com +10 de Rating!`);
    saveState(); openStocksModal();
}

function processDividends() {
    let divs = 0;
    for (let t in stocks) {
        const sh = stocks[t].shares;
        const s = stocks[t].shorts;
        if (sh > 0) divs += sh * 2.0;
        if (s > 0 && winners && winners.length > 0) {
            const isAlive = winners.some(w => w.team.name === t);
            if (!isAlive) divs += s * 5.0;
        }
    }
    if (divs > 0) {
        updateWallet(divs);
        alert(`📈 Seus investimentos renderam 🪙 ${divs.toFixed(2)} nesta rodada!`);
        playKaching();
    }
}
