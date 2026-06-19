from sqlalchemy import create_engine, Column, Integer, String, Float, Text
from sqlalchemy.orm import sessionmaker, declarative_base
import os

# No Vercel o filesystem é read-only exceto /tmp
_base = "/tmp" if os.path.exists("/tmp") and not os.access(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), os.W_OK) else os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(_base, "trader_de_elite.db")

engine = create_engine(f"sqlite:///{DB_PATH}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    wallet = Column(Float, default=1000.0)
    loan = Column(Float, default=0.0)
    xp = Column(Integer, default=0)
    state_json = Column(Text, default="{}")  # Para guardar stocks, apostas ativas, e historico

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
