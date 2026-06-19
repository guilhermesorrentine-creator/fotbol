import random

class Player:
    def __init__(self, id: str, name: str, position: str, rating: int):
        self.id = id
        self.name = name
        self.position = position # 'GK', 'DEF', 'MID', 'ATK'
        self.rating = rating
        self.has_yellow_card = False
        self.has_red_card = False

class Match:
    """
    Motor de simulação de partida com jogadores individuais.
    """
    def __init__(self, team_a_name: str, team_b_name: str, roster_a: list, roster_b: list):
        self.team_a = team_a_name
        self.team_b = team_b_name
        self.roster_a = roster_a # Lista de objetos Player
        self.roster_b = roster_b
        
        self.minute = 0
        self.score_a = 0
        self.score_b = 0
        self.corners_a = 0
        self.corners_b = 0
        self.scorers = []
        self.is_finished = False

    def get_active_players(self, roster):
        return [p for p in roster if not p.has_red_card]

    def calculate_event(self):
        active_a = self.get_active_players(self.roster_a)
        active_b = self.get_active_players(self.roster_b)
        
        # Penaliza o time que tiver jogadores a menos (expulsos)
        rating_a = sum(p.rating for p in active_a) / 11.0 if active_a else 0
        rating_b = sum(p.rating for p in active_b) / 11.0 if active_b else 0
        
        goal_chance_a = (rating_a / 100.0) * 0.025
        goal_chance_b = (rating_b / 100.0) * 0.025
        
        corner_chance_a = (rating_a / 100.0) * 0.05
        corner_chance_b = (rating_b / 100.0) * 0.05
        
        foul_chance_a = 0.035
        foul_chance_b = 0.035
        
        rand = random.random()
        event = None
        
        if rand < foul_chance_a:
            event = self.process_foul(self.team_a, active_a)
        elif rand < foul_chance_a + foul_chance_b:
            event = self.process_foul(self.team_b, active_b)
        elif rand < foul_chance_a + foul_chance_b + goal_chance_a:
            self.score_a += 1
            scorer = self.choose_scorer(active_a)
            if scorer: self.scorers.append(scorer.name)
            event = {"type": "GOAL", "team": self.team_a, "player": scorer.name if scorer else "Desconhecido", "minute": self.minute, "message": f"GOL do {self.team_a}! {scorer.name if scorer else ''} mandou pra rede!"}
        elif rand < foul_chance_a + foul_chance_b + goal_chance_a + goal_chance_b:
            self.score_b += 1
            scorer = self.choose_scorer(active_b)
            if scorer: self.scorers.append(scorer.name)
            event = {"type": "GOAL", "team": self.team_b, "player": scorer.name if scorer else "Desconhecido", "minute": self.minute, "message": f"GOL do {self.team_b}! Golaço de {scorer.name if scorer else ''}!"}
        elif rand < foul_chance_a + foul_chance_b + goal_chance_a + goal_chance_b + corner_chance_a:
            self.corners_a += 1
            event = {"type": "CORNER", "team": self.team_a, "minute": self.minute, "message": f"Escanteio cobrado pelo {self.team_a}."}
        elif rand < foul_chance_a + foul_chance_b + goal_chance_a + goal_chance_b + corner_chance_a + corner_chance_b:
            self.corners_b += 1
            event = {"type": "CORNER", "team": self.team_b, "minute": self.minute, "message": f"Escanteio perigoso para o {self.team_b}."}
            
        return event

    def process_foul(self, team_name, active_players):
        if not active_players: return None
        player = random.choice(active_players)
        
        card_rand = random.random()
        if card_rand < 0.05: # 5% de vermelho direto
            player.has_red_card = True
            return {"type": "RED_CARD", "team": team_name, "player": player.name, "minute": self.minute, "message": f"VERMELHO DIRETO! {player.name} ({team_name}) cometeu falta dura e foi expulso!"}
        elif card_rand < 0.35: # 30% de amarelo
            if player.has_yellow_card:
                player.has_red_card = True
                return {"type": "RED_CARD", "team": team_name, "player": player.name, "minute": self.minute, "message": f"SEGUNDO AMARELO! {player.name} ({team_name}) está fora do jogo."}
            else:
                player.has_yellow_card = True
                return {"type": "YELLOW_CARD", "team": team_name, "player": player.name, "minute": self.minute, "message": f"Cartão amarelo para {player.name} ({team_name})."}
        else:
            return {"type": "FOUL", "team": team_name, "player": player.name, "minute": self.minute, "message": f"Falta marcada contra o {team_name} cometida por {player.name}."}

    def choose_scorer(self, active_players):
        if not active_players: return None
        weights = []
        for p in active_players:
            if p.position == 'ATK': weights.append(10)
            elif p.position == 'MID': weights.append(4)
            elif p.position == 'DEF': weights.append(1)
            else: weights.append(0) # Goleiro não faz gol nessa simulação
        
        # Se os pesos somarem 0, usa uniform (ex: só sobrou goleiro)
        if sum(weights) == 0:
            return random.choice(active_players)
            
        return random.choices(active_players, weights=weights, k=1)[0]

    def get_state(self):
        return {
            "minute": self.minute,
            "team_a": self.team_a,
            "team_b": self.team_b,
            "score_a": self.score_a,
            "score_b": self.score_b,
            "corners_a": self.corners_a,
            
            "corners_b": self.corners_b,
            "is_finished": self.is_finished,
            "scorers": self.scorers,
            "yellow_cards_a": len([p for p in self.roster_a if p.has_yellow_card and not p.has_red_card]),
            "yellow_cards_b": len([p for p in self.roster_b if p.has_yellow_card and not p.has_red_card]),
            "red_cards_a": len([p for p in self.roster_a if p.has_red_card]),
            "red_cards_b": len([p for p in self.roster_b if p.has_red_card])
        }

