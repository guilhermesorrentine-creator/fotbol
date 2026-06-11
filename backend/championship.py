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
    
    return {
        "1": round(odds_1, 2), "X": round(odds_x, 2), "2": round(odds_2, 2),
        "O2.5": round(odds_o25, 2), "U2.5": round(odds_u25, 2),
        "BTTS_Y": round(odds_btts_y, 2), "BTTS_N": round(odds_btts_n, 2)
    }

def create_matchups(teams_with_ratings, stage_name):
    matches = []
    for i in range(0, len(teams_with_ratings), 2):
        t1 = teams_with_ratings[i]
        t2 = teams_with_ratings[i+1]
        matches.append({
            "id": f"match_{stage_name}_{i//2}",
            "team_a": t1["team"], "team_b": t2["team"],
            "rating_a": t1["rating"], "rating_b": t2["rating"],
            "odds": calculate_odds(t1["rating"], t2["rating"])
        })
    return matches

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
    quarter_finals = create_matchups(teams_with_ratings, "QF")
    
    return {
        "outrights": outrights,
        "matches": quarter_finals,
        "stage": "Quartas de Final"
    }

def generate_next_round(winners, stage_name):
    # winners format: list of {"team": dict, "rating": int}
    if len(winners) < 2: return {"stage": "Campeão", "matches": []}
    
    matches = create_matchups(winners, stage_name)
    return {
        "matches": matches,
        "stage": stage_name
    }
