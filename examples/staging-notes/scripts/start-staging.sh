#!/usr/bin/env bash
# Start the fake identity platform, a staging deployment, a broken ("flaky") preview and a production
# deployment, all as standalone processes tracegrove does not launch. Writes the gitignored secret
# material (.env.staging, a scratch AWS credentials file and the fake 1Password vault) under .staging/.
# Usage: scripts/start-staging.sh [state-dir]   (stop with scripts/stop-staging.sh)
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
state="${1:-$here/.staging}"
mkdir -p "$state"
rand() { node -e "process.stdout.write(require('crypto').randomBytes(18).toString('base64url'))"; }

owner="stg_owner_$(rand)"; stranger="stg_stranger_$(rand)"; flaky_owner="stg_flaky_owner_$(rand)"; flaky_stranger="stg_flaky_stranger_$(rand)"
observer="prd_observer_$(rand)"; clerk="sk_test_$(rand)"; client_secret="cs_$(rand)"; grant="oxk_$(rand)"
aws_id="AKIAFAKE$(node -e "process.stdout.write(require('crypto').randomBytes(6).toString('hex').toUpperCase())")"; aws_secret="$(rand)$(rand)"

cat > "$state/secrets.env" <<ENV
OWNER_TOKEN=$owner
STRANGER_TOKEN=$stranger
FLAKY_OWNER_TOKEN=$flaky_owner
FLAKY_STRANGER_TOKEN=$flaky_stranger
OBSERVER_TOKEN=$observer
CLERK_SECRET=$clerk
STRANGER_CLIENT_SECRET=$client_secret
BROKER_GRANT=$grant
AWS_KEY_ID=$aws_id
AWS_SECRET=$aws_secret
ENV
chmod 600 "$state/secrets.env"
printf 'STRANGER_CLIENT_SECRET=%s\n' "$client_secret" > "$here/.env.staging"; chmod 600 "$here/.env.staging"
printf '[notes-staging]\naws_access_key_id = %s\naws_secret_access_key = %s\n' "$aws_id" "$aws_secret" > "$state/aws-credentials"; chmod 600 "$state/aws-credentials"
printf '{"notes-prod":{"observer":{"token":"%s"}}}' "$observer" > "$state/op-items.json"; chmod 600 "$state/op-items.json"

FAKES_PORT=4810 FAKES_STATE="$state" AWS_KEY_ID="$aws_id" AWS_SECRET="$aws_secret" BROKER_GRANT="$grant" CLERK_SECRET="$clerk" \
  BROKER_REVOKE_OWNER_AFTER="${BROKER_REVOKE_OWNER_AFTER:-0}" \
  SECRETS_JSON="$(printf '{"notes/staging/personas":"{\\"owner\\":\\"%s\\",\\"stranger\\":\\"%s\\"}","notes/staging/personas-rotated":"{\\"owner\\":\\"%s\\",\\"stranger\\":\\"%s\\"}","notes/staging/clerk":"{\\"secretKey\\":\\"%s\\"}"}' "$owner" "$stranger" "$owner" "$owner" "$clerk")" \
  PARAMETERS_JSON="$(printf '{"/notes/staging/owner-token":"%s","/notes/staging/stranger-token":"%s"}' "$flaky_owner" "$flaky_stranger")" \
  CLERK_USERS_JSON='{"user_alice":"alice"}' OAUTH_CLIENTS_JSON="$(printf '{"stranger-ci":{"secret":"%s","sub":"bob"}}' "$client_secret")" \
  nohup node "$here/fakes/identity.mjs" > "$state/fakes.log" 2>&1 & echo $! > "$state/fakes.pid"

start_app() { # name port build tokens-json delete-mode
  mkdir -p "$state/$1-data"
  PORT="$2" NOTES_DIR="$state/$1-data" NOTES_BUILD="$3" NOTES_TOKENS="$4" NOTES_DELETE_MODE="$5" NOTES_INTROSPECT_URL=http://127.0.0.1:4810/introspect \
    nohup node "$here/app/app.mjs" > "$state/$1.log" 2>&1 & echo $! > "$state/$1.pid"
}
start_app staging 4811 2026.10.19-rc1 "$(printf '{"%s":"alice","%s":"bob"}' "$owner" "$stranger")" delete
start_app flaky 4812 2026.10.19-rc2 "$(printf '{"%s":"alice","%s":"bob"}' "$flaky_owner" "$flaky_stranger")" ignore
start_app prod 4813 2026.10.12 "$(printf '{"%s":"alice"}' "$observer")" delete
for port in 4810 4811 4812 4813; do
  for _ in $(seq 1 50); do curl -sf "http://127.0.0.1:$port/health" >/dev/null && break; sleep 0.1; done
done
echo "staging up; state in $state"
