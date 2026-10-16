"""Tracegrove sample: a FastAPI notes API backed by SQLite in the per-run data dir."""
import json
import os
import sqlite3
import uuid

from fastapi import Depends, FastAPI, Header, HTTPException, Response
from pydantic import BaseModel

DB = os.path.join(os.environ.get("TRACEGROVE_DATA_DIR", "."), "notes.sqlite3")
# Test-mode auth: tracegrove issues one random bearer token per persona per run.
TRACEGROVE_TOKENS = json.loads(os.environ.get("TRACEGROVE_TOKENS", "{}"))

app = FastAPI()


def db() -> sqlite3.Connection:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    conn.execute("create table if not exists notes (id text primary key, owner text, title text, body text)")
    return conn


def current_user(authorization: str = Header("")) -> str:
    subject = TRACEGROVE_TOKENS.get(authorization.removeprefix("Bearer "))
    if not subject:
        raise HTTPException(status_code=401, detail="unauthorized")
    return subject


class NoteIn(BaseModel):
    title: str
    body: str


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/notes", status_code=201)
def create(note: NoteIn, user: str = Depends(current_user)):
    row = {"id": str(uuid.uuid4()), "owner": user, "title": note.title, "body": note.body}
    with db() as conn:
        conn.execute("insert into notes values (:id, :owner, :title, :body)", row)
    return {"note": row}


def owned(note_id: str, user: str) -> dict:
    with db() as conn:
        row = conn.execute("select * from notes where id = ?", (note_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="not_found")
    if row["owner"] != user:
        raise HTTPException(status_code=403, detail="forbidden")
    return dict(row)


@app.get("/notes/{note_id}")
def read(note_id: str, user: str = Depends(current_user)):
    return {"note": owned(note_id, user)}


@app.delete("/notes/{note_id}", status_code=204)
def delete(note_id: str, user: str = Depends(current_user)):
    owned(note_id, user)
    with db() as conn:
        conn.execute("delete from notes where id = ?", (note_id,))
    return Response(status_code=204)
