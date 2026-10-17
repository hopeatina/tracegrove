# Django notes sample

This local Django application uses real HTTP and file-backed persistence. It has no ORM models, database connection, OrgX SDK, provider account or authoring inference. The runner uses the same cases, fixtures, assertions and HTTP adapter as the Node notes sample.

Use Python 3.13 and the verifier's supported Node 22 runtime. From this generated sample directory:

```sh
python3.13 -m venv .venv
.venv/bin/python -m pip install --require-hashes -r app/requirements.lock
workflow-verify doctor --config verification/workflow.yaml
workflow-verify plan --config verification/workflow.yaml --output request.json
workflow-verify run --request request.json --json
```

The launch recipe issues temporary owner and intruder credentials, allocates a fresh loopback port and writes notes inside the attempt's owned workspace. The local supervisor terminates the application group and removes that workspace after confirmed cleanup. No application data is written into the sample's source directory.

The source identity binds `app/django_app.py` and `app/requirements.lock`. The launcher observes Python's executable version and digest separately. Startup refuses installed dependency versions that disagree with the lock. This establishes local behavior; it does not attest installed dependency bytes or prove a production deployment.

The lock pins Django 6.1.2, asgiref and sqlparse to the downloaded pure-Python wheel hashes. Install with `--require-hashes`; do not replace the lock with an unpinned install. These dependencies use BSD licenses and remain distributed separately from this sample's Apache-2.0 source. The [Django standalone-settings documentation](https://docs.djangoproject.com/en/6.1/topics/settings/#using-settings-without-setting-django-settings-module) describes the settings/setup path.

Export the completed execution with `workflow-verify export`, then use `workflow-verify verify-bundle` to check its saved evidence. Product assertions, successful cleanup and a verified local bundle each describe their own evidence; none enables hosted execution.
