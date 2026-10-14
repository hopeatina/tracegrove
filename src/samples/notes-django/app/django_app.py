"""Local Django notes API: real file persistence, no ORM or database connection."""
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from importlib.metadata import version
import json
import os
from pathlib import Path
from uuid import UUID, uuid4
from wsgiref.simple_server import WSGIRequestHandler, make_server

import django
from django.conf import settings
from django.core.wsgi import get_wsgi_application
from django.http import HttpResponse, JsonResponse
from django.urls import re_path


@dataclass(frozen=True)
class Note:
    id: str
    title: str
    body: str
    ownerId: str
    createdAt: str

    @classmethod
    def create(cls, payload: object, owner: str) -> "Note":
        if not isinstance(payload, dict) or not all(isinstance(payload.get(key), str) for key in ("title", "body")):
            raise ValueError("invalid_note")
        return cls(str(uuid4()), payload["title"], payload["body"], owner, datetime.now(timezone.utc).isoformat())


class NoteStore:
    def __init__(self, root: Path):
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)

    def path(self, identifier: str) -> Path:
        return self.root / f"{UUID(identifier)}.json"

    def read(self, identifier: str) -> Note | None:
        try:
            return Note(**json.loads(self.path(identifier).read_text()))
        except (ValueError, FileNotFoundError):
            return None

    def write(self, note: Note) -> None:
        path = self.path(note.id)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(asdict(note)))
        temporary.replace(path)

    def owned(self, owner: str) -> list[dict]:
        return [asdict(note) for path in sorted(self.root.glob("*.json"))
                if (note := self.read(path.stem)) is not None and note.ownerId == owner]


class NotesAPI:
    def __init__(self, store: NoteStore, tokens: dict[str, str], build: str):
        self.store, self.tokens, self.build = store, tokens, build

    def health(self, request):
        return JsonResponse({"ok": True, "build": self.build, "notes": len(list(self.store.root.glob("*.json")))})

    def notes(self, request, identifier: str | None = None):
        authorization = request.headers.get("Authorization", "")
        owner = self.tokens.get(authorization[7:]) if authorization.startswith("Bearer ") else None
        if not owner:
            return JsonResponse({"error": "unauthorized"}, status=401)
        if identifier is None:
            if request.method == "GET":
                return JsonResponse({"notes": self.store.owned(owner)})
            if request.method == "POST":
                try:
                    note = Note.create(json.loads(request.body or b"{}"), owner)
                except (ValueError, UnicodeDecodeError):
                    return JsonResponse({"error": "invalid_note"}, status=400)
                self.store.write(note)
                return JsonResponse({"note": asdict(note)}, status=201)
            return JsonResponse({"error": "method_not_allowed"}, status=405)
        note = self.store.read(identifier)
        if note is None:
            return JsonResponse({"error": "not_found"}, status=404)
        if note.ownerId != owner:
            return JsonResponse({"error": "forbidden"}, status=403)
        if request.method == "GET":
            return JsonResponse({"note": asdict(note)})
        if request.method == "DELETE":
            self.store.path(identifier).unlink()
            return HttpResponse(status=204)
        return JsonResponse({"error": "method_not_allowed"}, status=405)


class QuietHandler(WSGIRequestHandler):
    def log_message(self, format, *args):
        pass


def check_dependencies() -> None:
    # Fail readiness when the installed versions disagree with the pinned input.
    for line in Path(__file__).with_name("requirements.lock").read_text().splitlines():
        if line and not line.startswith("#"):
            name, expected = line.split()[0].split("==")
            if version(name) != expected:
                raise RuntimeError("Install the dependencies from app/requirements.lock")


check_dependencies()
settings.configure(DEBUG=False, ROOT_URLCONF=__name__, ALLOWED_HOSTS=["127.0.0.1"],
                   INSTALLED_APPS=[], DATABASES={}, MIDDLEWARE=[], DATA_UPLOAD_MAX_MEMORY_SIZE=65536)
django.setup()
api = NotesAPI(NoteStore(Path(os.environ["NOTES_DIR"])), json.loads(os.environ["NOTES_TOKENS"]),
               os.environ.get("NOTES_BUILD", "django-sample"))
urlpatterns = [re_path(r"^health$", api.health), re_path(r"^notes(?:/(?P<identifier>[^/]+))?$", api.notes)]

if __name__ == "__main__":
    with make_server("127.0.0.1", int(os.environ.get("PORT", "0")), get_wsgi_application(), handler_class=QuietHandler) as server:
        print(f"listening {server.server_port}", flush=True)
        server.serve_forever()
