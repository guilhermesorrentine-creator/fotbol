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

from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from backend.database import get_db, User
import json

app = FastAPI(title="Trader de Elite - Simulador")

from fastapi.staticfiles import StaticFiles

FRONTEND_DIR = os.path.join(os.path.dirname(__file__), '..', 'frontend')

app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")

@app.get("/")
async def get_dashboard():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if not os.path.exists(index_path):
        return {"error": "Arquivo index.html não encontrado no diretório frontend/"}
    return FileResponse(index_path)


class LoginRequest(BaseModel):
    username: str

@app.post("/api/users/login")
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        user = User(username=req.username)
        db.add(user)
        db.commit()
        db.refresh(user)
    return {
        "username": user.username,
        "wallet": user.wallet,
        "loan": user.loan,
        "xp": user.xp,
        "state_json": user.state_json
    }

class SyncRequest(BaseModel):
    username: str
    wallet: float
    loan: float
    xp: int
    state_json: str

@app.post("/api/users/sync")
async def sync_user(req: SyncRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == req.username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.wallet = req.wallet
    user.loan = req.loan
    user.xp = req.xp
    user.state_json = req.state_json
    db.commit()
    return {"status": "ok"}

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

class ShopTipRequest(BaseModel):
    rating_a: int
    rating_b: int

@app.post("/api/shop/buy_tip")
async def buy_tip(req: ShopTipRequest):
    diff = req.rating_a - req.rating_b
    raw_a = 1 / (1 + 10 ** (-diff / 40))
    raw_b = 1 / (1 + 10 ** (diff / 40))
    prob_draw = 0.28
    prob_a = raw_a * (1 - prob_draw)
    prob_b = raw_b * (1 - prob_draw)
    return {
        "prob_a": round(prob_a * 100, 1),
        "prob_draw": round(prob_draw * 100, 1),
        "prob_b": round(prob_b * 100, 1)
    }

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
    owned_teams: list = []

@app.post("/api/match/simulate_fast")
async def simulate_fast(req: FastSimRequest):
    if req.team_a_name in req.owned_teams: req.rating_a += 10
    if req.team_b_name in req.owned_teams: req.rating_b += 10

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
        
        if config_msg.get("type") != "START":
            await websocket.send_json({"type": "ERROR", "message": "Tipo de mensagem inválido. Esperado: START"})
            await websocket.close()
            return

        team_a_name = config_msg.get("team_a_name", "Time A")
        team_b_name = config_msg.get("team_b_name", "Time B")
        rating_a = config_msg.get("rating_a", 85)
        rating_b = config_msg.get("rating_b", 85)
        owned_teams = config_msg.get("owned_teams", [])

        if team_a_name in owned_teams: rating_a += 10
        if team_b_name in owned_teams: rating_b += 10

        raw_squad_a = config_msg.get("squad_a", [])
        raw_squad_b = config_msg.get("squad_b", [])

        if raw_squad_a and raw_squad_b:
            roster_a = [Player(id=str(p["id"]), name=p["name"], position=p["position"], rating=rating_a) for p in raw_squad_a]
            roster_b = [Player(id=str(p["id"]), name=p["name"], position=p["position"], rating=rating_b) for p in raw_squad_b]
        else:
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

            score_diff = match.score_a - match.score_b
            time_left = max(1, 90 - match.minute)

            # Radar Update
            ball_x = 50
            ball_y = random.randint(20, 80)
            if event:
                event_type = event.get("type", "")
                event_msg = event.get("message", "").lower()
                if event_type == "GOAL":
                    ball_x = 95 if score_diff > 0 else 5
                elif "perigoso" in event_msg or "chuta" in event_msg:
                    ball_x = random.randint(80, 90) if random.random() > 0.5 else random.randint(10, 20)
            else:
                ball_x = random.randint(30, 70)

            await websocket.send_json({"type": "RADAR_UPDATE", "x": ball_x, "y": ball_y})

            base_prob_a = 1 / (1 + 10 ** (-(rating_a - rating_b + score_diff * 20) / 40))
            prob_a = max(0.01, min(0.99, base_prob_a))

            live_margin = 1.10
            if score_diff > 0:
                prob_a_win = prob_a + (1 - prob_a) * ((90 - time_left) / 90)
                prob_b_win = (1 - prob_a) * (time_left / 90)
            elif score_diff < 0:
                prob_a_win = prob_a * (time_left / 90)
                prob_b_win = (1 - prob_a) + prob_a * ((90 - time_left) / 90)
            else:
                prob_a_win = prob_a * (time_left / 90)
                prob_b_win = (1 - prob_a) * (time_left / 90)

            live_odds = {
                "team_a": round(live_margin / max(0.01, prob_a_win), 2),
                "team_b": round(live_margin / max(0.01, prob_b_win), 2)
            }
            await websocket.send_json({"type": "LIVE_ODDS", "odds": live_odds})

            if match.minute >= 90:
                match.is_finished = True

            await websocket.send_json({"type": "STATE_UPDATE", "state": match.get_state()})

            if match.is_finished:
                await websocket.send_json({"type": "MATCH_END", "message": "O árbitro apita o fim de jogo!"})
                break

    except WebSocketDisconnect:
        print("Cliente desconectou do WebSocket.")
