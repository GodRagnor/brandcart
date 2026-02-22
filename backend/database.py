from motor.motor_asyncio import AsyncIOMotorClient
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI")
assert MONGODB_URI, "MONGODB_URI not set"

client = AsyncIOMotorClient(MONGODB_URI)
db = client.get_default_database()

def get_db():
    return db
