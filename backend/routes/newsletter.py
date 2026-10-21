"""
routes/newsletter.py
Stores newsletter sign-ups in a CSV file under DATA_DIR.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone
import csv
import os
import re
import threading

router = APIRouter(prefix="/newsletter", tags=["Newsletter"])

DATA_DIR = os.path.abspath(os.getenv("DATA_DIR", "data"))
SUBSCRIBERS_FILE = "subscribers.csv"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

_lock = threading.Lock()


class SubscribeRequest(BaseModel):
    email: str
    name: str = ""
    interests: list[str] = []


def _subscribers_path() -> str:
    return os.path.join(DATA_DIR, SUBSCRIBERS_FILE)


def _existing_emails(path: str) -> set[str]:
    if not os.path.exists(path):
        return set()
    with open(path, newline="", encoding="utf-8") as fh:
        return {row["email"] for row in csv.DictReader(fh)}


@router.post("/subscribe")
def subscribe(req: SubscribeRequest):
    email = req.email.strip().lower()
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")

    name = req.name.strip()[:100]
    interests = ";".join(i.strip()[:40] for i in req.interests[:10] if i.strip())

    path = _subscribers_path()
    with _lock:
        os.makedirs(DATA_DIR, exist_ok=True)
        if email in _existing_emails(path):
            return {"status": "already_subscribed"}

        is_new_file = not os.path.exists(path)
        with open(path, "a", newline="", encoding="utf-8") as fh:
            writer = csv.writer(fh)
            if is_new_file:
                writer.writerow(["email", "name", "interests", "subscribed_at"])
            writer.writerow([email, name, interests, datetime.now(timezone.utc).isoformat()])

    return {"status": "subscribed"}
