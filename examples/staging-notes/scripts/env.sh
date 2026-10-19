# Source this to point tracegrove at the local fakes the way a developer machine points at AWS/1Password/OrgX.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state="${STAGING_STATE:-$here/.staging}"
export AWS_SHARED_CREDENTIALS_FILE="$state/aws-credentials" AWS_PROFILE=notes-staging AWS_REGION=us-east-1 AWS_ENDPOINT_URL=http://127.0.0.1:4810
export TRACEGROVE_OP_BIN="$here/fakes/op" OP_FAKE_ITEMS="$(cat "$state/op-items.json")"
export TRACEGROVE_ORGX_BROKER_URL=http://127.0.0.1:4810 TRACEGROVE_ORGX_TOKEN="$(grep ^BROKER_GRANT= "$state/secrets.env" | cut -d= -f2)"
