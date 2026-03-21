from pathlib import Path

from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().with_name(".env"))

MONGODB_URI = os.getenv("MONGODB_URI")
if not MONGODB_URI:
    raise RuntimeError("MONGODB_URI not set")

client = AsyncIOMotorClient(MONGODB_URI)
db = client.get_default_database()

def get_db():
    return db
