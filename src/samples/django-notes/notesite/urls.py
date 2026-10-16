from django.urls import path

from notes import views

urlpatterns = [
    path("health", views.health),
    path("notes", views.notes),
    path("notes/<uuid:note_id>", views.note),
]
