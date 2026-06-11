from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import List, Dict, Any
from backend.match_engine import Match, Player
import backend.api_football as api_football
import backend.championship as championship
import asyncio
import os
import random

app = FastAPI(title="Trader de Elite - Simulador")

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.join(BASE_DIR, "frontend")

@app.get("/")
async def get_dashboard():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if not os.path.exists(index_path):
        return {"error": "Arquivo index.html não encontrado no diretório frontend/"}
    return FileResponse(index_path)

@app.get("/api/leagues")
async def get_leagues():
    return [{"id": k, "name": v} for k, v in api_football.LEAGUES.items()]

@app.get("/api/teams")
async def get_teams(league_id: str):
    return api_football.fetch_teams(league_id, 2023)

@app.get("/api/round/generate")
async def generate_round(league_id: str):
    matches = championship.generate_round(league_id)
    return matches

@app.get("/api/tournament/generate")
async def generate_tournament(league_id: str):
    return championship.generate_tournament(league_id)

class NextRoundRequest(BaseModel):
    winners: List[Dict[str, Any]]
    next_stage: str

@app.post("/api/tournament/next_round")
async def next_round(req: NextRoundRequest):
    return championship.generate_next_round(req.winners, req.next_stage)

@app.get("/api/squad")
async def get_squad(team_id: str):
    return api_football.fetch_squad(team_id)

def generate_dummy_roster(team_name, base_rating):
    positions = ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ATK', 'ATK']
    names = ["Silva", "Santos", "Oliveira", "Souza", "Rodrigues", "Ferreira", "Alves", "Pereira", "Lima", "Gomes", "Costa"]
    roster = []
    for i, pos in enumerate(positions):
        roster.append(Player(id=f"{team_name}_{i}", name=f"{names[i]} ({pos})", position=pos, rating=base_rating + random.randint(-5, 5)))
    return roster

class FastSimRequest(BaseModel):
    team_a_name: str
    team_b_name: str
    rating_a: int
    rating_b: int

@app.post("/api/match/simulate_fast")
async def simulate_fast(req: FastSimRequest):
    roster_a = generate_dummy_roster(req.team_a_name, req.rating_a)
    roster_b = generate_dummy_roster(req.team_b_name, req.rating_b)
    
    match = Match(req.team_a_name, req.team_b_name, roster_a, roster_b)
    
    while match.minute < 90:
        match.minute += 1
        match.calculate_event()
        
    return match.get_state()

@app.websocket("/ws/match")
async def match_simulation_ws(websocket: WebSocket):
    await websocket.accept()
    try:
        config_msg = await websocket.receive_json()
        if config_msg.get("type") == "START":
            team_a_name = config_msg.get("team_a_name", "Time A")
            team_b_name = config_msg.get("team_b_name", "Time B")
            rating_a = config_msg.get("rating_a", 85)
            rating_b = config_msg.get("rating_b", 85)
            
            roster_a = generate_dummy_roster(team_a_name, rating_a)
            roster_b = generate_dummy_roster(team_b_name, rating_b)
            
            match = Match(team_a_name, team_b_name, roster_a, roster_b)
            
            await websocket.send_json({"type": "STATE_UPDATE", "state": match.get_state()})
            
            while match.minute <= 90:
                await asyncio.sleep(0.5)
                match.minute += 1
                
                event = match.calculate_event()
                if event:
                    await websocket.send_json({"type": "EVENT", "event": event})
                
                if match.minute >= 90:
                    match.is_finished = True
                    
                await websocket.send_json({"type": "STATE_UPDATE", "state": match.get_state()})
                
                if match.is_finished:
                    await websocket.send_json({"type": "MATCH_END", "message": "O árbitro apita o fim de jogo!"})
                    break
                    
    except WebSocketDisconnect:
        print("Cliente desconectou do WebSocket.")
