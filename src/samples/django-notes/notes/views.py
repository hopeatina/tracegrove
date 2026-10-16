import json

from django.http import HttpResponse, JsonResponse

from .models import Note


def health(request):
    return JsonResponse({"ok": True})


def notes(request):
    if not request.subject:
        return JsonResponse({"error": "unauthorized"}, status=401)
    if request.method == "POST":
        data = json.loads(request.body or "{}")
        note = Note.objects.create(owner=request.subject, title=data["title"], body=data["body"])
        return JsonResponse({"note": note.as_json()}, status=201)
    return JsonResponse({"notes": [n.as_json() for n in Note.objects.filter(owner=request.subject)]})


def note(request, note_id):
    if not request.subject:
        return JsonResponse({"error": "unauthorized"}, status=401)
    found = Note.objects.filter(id=note_id).first()
    if found is None:
        return JsonResponse({"error": "not_found"}, status=404)
    if found.owner != request.subject:
        return JsonResponse({"error": "forbidden"}, status=403)
    if request.method == "DELETE":
        found.delete()
        return HttpResponse(status=204)
    return JsonResponse({"note": found.as_json()})
