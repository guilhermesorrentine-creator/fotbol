// --- Empréstimos ---

function manageLoan() {
    if (loan === 0) {
        const input = prompt("Valor do empréstimo (juros de 10%):", "500");
        const amount = parseFloat(input);
        if (isNaN(amount) || amount <= 0) return;
        loan = amount * 1.10;
        wallet += amount;
        saveState();
        alert(`🏦 Empréstimo de 🪙 ${amount.toFixed(2)} aprovado!\nDívida total: 🪙 ${loan.toFixed(2)}\n\n20% dos lucros são retidos automaticamente para amortizar.`);
    } else {
        const input = prompt(`Dívida atual: 🪙 ${loan.toFixed(2)}\nQuanto deseja pagar?`, loan.toFixed(2));
        let amount = parseFloat(input);
        if (isNaN(amount) || amount <= 0) return;
        if (amount > wallet) return alert("Saldo insuficiente!");
        if (amount > loan) amount = loan;
        wallet -= amount;
        loan -= amount;
        saveState();
        if (loan < 0.01) {
            loan = 0;
            saveState();
            alert("🎉 Dívida totalmente quitada! Parabéns!");
        } else {
            alert(`Pagamento de 🪙 ${amount.toFixed(2)} realizado. Restam 🪙 ${loan.toFixed(2)}.`);
        }
    }
}

// --- Shop ---

function openShopModal() {
    document.getElementById('shop-modal').classList.add('active');
    const sel = document.getElementById('shop-match-select');
    if (currentRound.length) {
        sel.innerHTML = currentRound.map(m => `<option value="${m.id}">${m.team_a.name} vs ${m.team_b.name}</option>`).join('');
    } else {
        sel.innerHTML = '<option value="">Sem partidas disponíveis</option>';
    }
    document.getElementById('oracle-result').innerText = '';
}

function closeShopModal() { document.getElementById('shop-modal').classList.remove('active'); }

async function buyOracleTip() {
    const matchId = document.getElementById('shop-match-select').value;
    if (!matchId) return alert("Selecione uma partida válida!");
    if (wallet < 100) return alert("Saldo insuficiente! Necessário 🪙 100.");
    const m = currentRound.find(x => x.id === matchId);
    if (!m) return alert("Partida não encontrada.");
    updateWallet(-100);
    playKaching();
    const res = await fetch('/api/shop/buy_tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating_a: m.rating_a, rating_b: m.rating_b })
    });
    const tip = await res.json();
    document.getElementById('oracle-result').innerHTML =
        `💡 <b>Chances Reais do Motor:</b><br>
        ${m.team_a.name}: <b>${tip.prob_a}%</b> &nbsp;·&nbsp;
        Empate: <b>${tip.prob_draw}%</b> &nbsp;·&nbsp;
        ${m.team_b.name}: <b>${tip.prob_b}%</b>`;
}
