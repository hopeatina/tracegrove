import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    initial = True
    dependencies = []
    operations = [
        migrations.CreateModel(
            name="Note",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, primary_key=True, serialize=False)),
                ("owner", models.CharField(max_length=200)),
                ("title", models.CharField(max_length=200)),
                ("body", models.TextField()),
            ],
        ),
    ]
