import random
import backend.api_football as api_football

def get_top_teams(league_id, teams):
    champions_keywords = ["Real Madrid", "Barcelona", "Bayern", "Manchester City", "Paris", "Arsenal", "Liverpool", "Juventus", "Inter", "Milan", "Atletico", "Dortmund"]
    liberta_keywords = ["Flamengo", "Palmeiras", "River Plate", "Boca", "Fluminense", "Sao Paulo", "Atletico Mineiro", "Gremio", "Cruzeiro", "Corinthians", "Nacional", "Penarol", "Colo"]
    worldcup_keywords = ["Brazil", "Argentina", "France", "Germany", "Spain", "England", "Portugal", "Italy", "Netherlands", "Uruguay", "Croatia", "Belgium"]
    
    keywords = champions_keywords if league_id == "2" else liberta_keywords if league_id == "13" else worldcup_keywords if league_id == "1" else []
    
    top_teams = []
    if keywords:
        for t in teams:
            for k in keywords:
                if k.lower() in t["name"].lower() and t not in top_teams:
                    top_teams.append(t)
    
    # Se não achou 8 na filtragem, preenche aleatoriamente
    random.shuffle(teams)
    for t in teams:
        if len(top_teams) >= 8:
            break
        if t not in top_teams:
            top_teams.append(t)
            
    # Traduzir nomes
    translations = {
        "Brazil": "Brasil", "Argentina": "Argentina", "France": "França", "Germany": "Alemanha",
        "Spain": "Espanha", "England": "Inglaterra", "Portugal": "Portugal", "Italy": "Itália",
        "Netherlands": "Holanda", "Uruguay": "Uruguai", "Croatia": "Croácia", "Belgium": "Bélgica",
        "Bayern München": "Bayern de Munique", "Paris Saint Germain": "PSG",
        "Atletico Madrid": "Atlético de Madrid", "AC Milan": "Milan",
        "Sao Paulo": "São Paulo", "Gremio": "Grêmio"
    }
    
    for t in top_teams[:8]:
        if t["name"] in translations:
            t["name"] = translations[t["name"]]
            
    # Mistura os 8 selecionados para o sorteio ser aleatório
    random.shuffle(top_teams)
    return top_teams[:8]

def calculate_outright_odds(teams_with_ratings):
    """ Calcula odds para o mercado: Quem será o Campeão? """
    total_rating = sum(10 ** (t["rating"] / 15) for t in teams_with_ratings)
    outrights = []
    margin = 1.15 # Margem alta (lucro da casa de apostas para mercado longo)
    for t in teams_with_ratings:
        prob = (10 ** (t["rating"] / 15)) / total_rating
        odd = margin / max(0.01, prob)
        outrights.append({
            "team": t["team"],
            "rating": t["rating"],
            "odd": round(odd, 2)
        })
    # Ordenar por favoritos (menor odd)
    outrights.sort(key=lambda x: x["odd"])
    return outrights

def calculate_odds(rating_a, rating_b):
    diff = rating_a - rating_b
    prob_a = 1 / (1 + 10 ** (-diff / 40))
    prob_b = 1 / (1 + 10 ** (diff / 40))
    
    prob_draw = 0.28
    prob_a = prob_a * 0.72
    prob_b = prob_b * 0.72
    
    margin = 1.05
    odds_1 = margin / max(0.01, prob_a)
    odds_2 = margin / max(0.01, prob_b)
    odds_x = margin / max(0.01, prob_draw)
    
    prob_over = 0.50 + ((rating_a + rating_b) - 160) * 0.01 
    prob_over = max(0.2, min(0.8, prob_over))
    odds_o25 = margin / prob_over
    odds_u25 = margin / (1 - prob_over)
    
    
    prob_btts = 0.55 - abs(diff) * 0.01
    prob_btts = max(0.2, min(0.8, prob_btts))
    odds_btts_y = margin / prob_btts
    odds_btts_n = margin / (1 - prob_btts)
    
    # New Markets
    prob_over_corners = 0.45 + (rating_a + rating_b - 160) * 0.01
    prob_over_corners = max(0.2, min(0.8, prob_over_corners))
    odds_over_corners = margin / prob_over_corners
    odds_under_corners = margin / (1 - prob_over_corners)
    
    prob_over_cards = 0.50
    odds_over_cards = margin / prob_over_cards
    odds_under_cards = margin / (1 - prob_over_cards)
    
    return {
        "1": round(odds_1, 2), "X": round(odds_x, 2), "2": round(odds_2, 2),
        "O2.5": round(odds_o25, 2), "U2.5": round(odds_u25, 2),
        "BTTS_Y": round(odds_btts_y, 2), "BTTS_N": round(odds_btts_n, 2),
        "O8.5_CORNERS": round(odds_over_corners, 2), "U8.5_CORNERS": round(odds_under_corners, 2),
        "O4.5_CARDS": round(odds_over_cards, 2), "U4.5_CARDS": round(odds_under_cards, 2)
    }


def create_matchups(teams_with_ratings, stage_name):
    matches = []
    news = []
    events = [
        ("se machucou feio no treino", -5, "Queda de rendimento"),
        ("foi visto na balada ontem", -3, "Indisciplina"),
        ("está voando nos treinos físicos", 4, "Motivação alta"),
        ("deu declaração polêmica no vestiário", -2, "Crise interna"),
        ("prometeu Hat-Trick no próximo jogo", 3, "Super Confiança")
    ]
    for i in range(0, len(teams_with_ratings), 2):
        t1 = teams_with_ratings[i]
        t2 = teams_with_ratings[i+1]
        
        squad_a = api_football.fetch_squad(str(t1["team"]["id"]))
        squad_b = api_football.fetch_squad(str(t2["team"]["id"]))
        
        player_markets = []
        for sq, team_dict, t_name in [(squad_a, t1, t1["team"]["name"]), (squad_b, t2, t2["team"]["name"])]:
            atks = [p for p in sq if p.get("position") == "ATK"]
            mids = [p for p in sq if p.get("position") == "MID"]
            defs = [p for p in sq if p.get("position") == "DEF"]
            
            for p in (atks[:2] + mids[:1]):
                player_markets.append({"player": p["name"], "team": t_name, "market": "GOL", "odd": round(random.uniform(2.5, 6.0), 2)})
            for p in defs[:2]:
                player_markets.append({"player": p["name"], "team": t_name, "market": "CARTÃO", "odd": round(random.uniform(2.0, 4.5), 2)})
            
            if sq and random.random() < 0.35: # 35% de chance de evento por time
                ev = random.choice(events)
                rp = random.choice(sq[:11])
                team_dict["rating"] += ev[1] # Aplica o buff/nerf
                news.append(f"📰 {t_name}: {rp['name']} {ev[0]}! ({ev[2]})")
                
        matches.append({
            "id": f"match_{stage_name}_{i//2}",
            "team_a": t1["team"], "team_b": t2["team"],
            "rating_a": t1["rating"], "rating_b": t2["rating"],
            "odds": calculate_odds(t1["rating"], t2["rating"]),
            "squad_a": squad_a,
            "squad_b": squad_b,
            "player_markets": player_markets
        })
    return matches, news

def generate_round(league_id: str):
    """Gera uma rodada simples com todos os times da liga em confrontos aleatórios."""
    all_teams = api_football.fetch_teams(league_id, 2023)
    if not all_teams or len(all_teams) < 2:
        return {"error": "Times insuficientes para gerar rodada."}

    random.shuffle(all_teams)
    teams_with_ratings = [{"team": t, "rating": random.randint(78, 96)} for t in all_teams]
    # Garante número par de times
    if len(teams_with_ratings) % 2 != 0:
        teams_with_ratings = teams_with_ratings[:-1]

    matches, news = create_matchups(teams_with_ratings, "RD")
    return {"matches": matches, "news": news}

def generate_tournament(league_id: str):
    all_teams = api_football.fetch_teams(league_id, 2023)
    if not all_teams or len(all_teams) < 8:
        return {"error": "Ligas não possuem times suficientes."}
    
    top_8 = get_top_teams(league_id, all_teams)
    
    # Atribui ratings fixos pro campeonato
    teams_with_ratings = []
    for t in top_8:
        teams_with_ratings.append({
            "team": t,
            "rating": random.randint(78, 96) # Forças variadas
        })
        
    outrights = calculate_outright_odds(teams_with_ratings)
    quarter_finals, news = create_matchups(teams_with_ratings, "QF")
    
    return {
        "outrights": outrights,
        "matches": quarter_finals,
        "stage": "Quartas de Final",
        "news": news
    }

def generate_next_round(winners, stage_name):
    # winners format: list of {"team": dict, "rating": int}
    valid = [w for w in winners if isinstance(w.get("team"), dict) and "id" in w["team"]]
    if len(valid) < 2:
        return {"stage": "Campeão", "matches": []}

    if len(valid) % 2 != 0:
        valid = valid[:-1]

    matches, news = create_matchups(valid, stage_name)
    return {
        "matches": matches,
        "stage": stage_name,
        "news": news
    }
