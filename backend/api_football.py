import requests
import json
import os

API_KEY = "22125f66c3f6b61b59deb3cdf8ace8a2"
BASE_URL = "https://v3.football.api-sports.io"

HEADERS = {
    "x-apisports-key": API_KEY,
    "x-rapidapi-host": "v3.football.api-sports.io"
}

CACHE_DIR = os.path.join(os.path.dirname(__file__), "cache")
if not os.path.exists(CACHE_DIR):
    os.makedirs(CACHE_DIR)

# Ligas Mapeadas
LEAGUES = {
    "1": "Copa do Mundo",
    "13": "Copa Libertadores",
    "2": "UEFA Champions League"
}

def get_cached_or_fetch(endpoint, filename, params=None):
    cache_path = os.path.join(CACHE_DIR, filename)
    if os.path.exists(cache_path):
        with open(cache_path, 'r', encoding='utf-8') as f:
            return json.load(f)
            
    print(f"Baixando da API: {endpoint} -> {params}")
    response = requests.get(f"{BASE_URL}/{endpoint}", headers=HEADERS, params=params)
    if response.status_code == 200:
        data = response.json()
        
        # Verifica se deu erro de limite da API
        if "errors" in data and data["errors"]:
            print(f"Erro na API: {data['errors']}")
            return None
            
        with open(cache_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return data
    else:
        print(f"Erro HTTP {response.status_code} ao buscar {endpoint}: {response.text}")
        return None

def fetch_teams(league_id, season=2023):
    """
    Busca os times de uma liga específica.
    """
    if league_id == "1":
        season = 2022
        
    filename = f"teams_league_{league_id}_{season}.json"
    data = get_cached_or_fetch("teams", filename, params={"league": league_id, "season": season})
    if data and "response" in data:
        teams = []
        for item in data["response"]:
            team = item["team"]
            teams.append({
                "id": team["id"],
                "name": team["name"],
                "logo": team["logo"]
            })
        return teams
    return []

def fetch_squad(team_id):
    """
    Busca o elenco (jogadores) de um time específico.
    Fazemos o cache para não gastar chamadas repetidas da API.
    """
    filename = f"squad_team_{team_id}.json"
    data = get_cached_or_fetch("players/squads", filename, params={"team": team_id})
    if data and "response" in data and len(data["response"]) > 0:
        players = data["response"][0]["players"]
        squad = []
        for p in players:
            # Map API positions to our simple engine positions
            pos = p["position"]
            engine_pos = "MID"
            if pos == "Goalkeeper": engine_pos = "GK"
            elif pos == "Defender": engine_pos = "DEF"
            elif pos == "Attacker": engine_pos = "ATK"
            
            squad.append({
                "id": str(p["id"]),
                "name": p["name"],
                "position": engine_pos,
                "number": p["number"],
                "photo": p.get("photo", "")
            })
        return squad
    return []

def initialize_cache():
    """
    Testa a chave e baixa os times das ligas principais para o cache.
    Isso consumirá apenas ~5 requests da cota diária (limite grátis é 100).
    """
    print("Iniciando cache das Ligas (Consumo: 5 requests da API)...")
    for league_id, name in LEAGUES.items():
        print(f"Puxando times da liga: {name}")
        fetch_teams(league_id, season=2023) # API Sports usa o ano base do início da temporada
    print("Cache de Times concluído!")
    
if __name__ == "__main__":
    initialize_cache()
