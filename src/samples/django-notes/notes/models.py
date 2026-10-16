import uuid

from django.db import models


class Note(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4)
    owner = models.CharField(max_length=200)
    title = models.CharField(max_length=200)
    body = models.TextField()

    def as_json(self):
        return {"id": str(self.id), "owner": self.owner, "title": self.title, "body": self.body}
