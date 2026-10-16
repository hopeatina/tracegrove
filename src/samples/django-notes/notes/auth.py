"""Test-mode auth: tracegrove issues one random bearer token per persona per run."""
import json
import os

TOKENS = json.loads(os.environ.get("TRACEGROVE_TOKENS", "{}"))


def tracegrove_auth(get_response):
    def middleware(request):
        header = request.headers.get("Authorization", "")
        request.subject = TOKENS.get(header.removeprefix("Bearer "))
        return get_response(request)

    return middleware
