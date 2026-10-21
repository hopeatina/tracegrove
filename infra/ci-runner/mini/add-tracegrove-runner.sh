#!/usr/bin/env bash
# Add a tracegrove lane to the Mac mini's existing orgx-ci VM (hopeatina/orgx: infra/ci-runner/mini).
# Run as root inside the VM, after orgx's vm-provision.sh:
#   LIMA_HOME=~/orgx-ci/lima ~/orgx-ci/bin/limactl shell orgx-ci -- sudo bash -s < add-tracegrove-runner.sh
# Idempotent. Creates the runner-tracegrove user (no sudo, no Docker), unpacks the same pinned
# actions/runner as the orgx lanes, reuses their job hooks, installs Chromium's system libraries
# (the runner user cannot sudo for `playwright install --with-deps`) and caps the lane's memory.
set -euo pipefail

RUNNER_VERSION="${RUNNER_VERSION:-2.338.0}"
RUNNER_SHA256="${RUNNER_SHA256:-628b4a7258487b80c1d3c221095a7ded349f5ae0175fd3dfab708d07428f041b}"
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.64.1}"
user=runner-tracegrove
dir="/home/$user/actions-runner"

[ "$(id -u)" = 0 ] || { echo "add-tracegrove-runner: run as root" >&2; exit 1; }
[ "$(uname -m)" = aarch64 ] || { echo "add-tracegrove-runner: expected the aarch64 orgx-ci guest" >&2; exit 1; }
[ -x /opt/orgx-ci/configure-runner.sh ] || { echo "add-tracegrove-runner: run orgx's vm-provision.sh first" >&2; exit 1; }

id "$user" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$user"
# No Docker: orgx's job hooks remove every container, so sharing the daemon would break both repos' jobs.
gpasswd -d "$user" docker >/dev/null 2>&1 || :
rm -f "/etc/sudoers.d/$user"

if [ ! -x "$dir/run.sh" ] || ! grep -qx "$RUNNER_VERSION" "$dir/.orgx-runner-version" 2>/dev/null; then
  [ ! -f "$dir/.runner" ] || { echo "add-tracegrove-runner: runner is registered; unregister before upgrading" >&2; exit 1; }
  archive="/tmp/actions-runner-linux-arm64-$RUNNER_VERSION.tar.gz"
  [ -f "$archive" ] || curl -fsSL --retry 3 -o "$archive" \
    "https://github.com/actions/runner/releases/download/v$RUNNER_VERSION/actions-runner-linux-arm64-$RUNNER_VERSION.tar.gz"
  echo "$RUNNER_SHA256  $archive" | sha256sum -c --quiet -
  rm -rf "$dir"
  install -d -o "$user" -g "$user" "$dir"
  tar -xzf "$archive" -C "$dir"
  "$dir/bin/installdependencies.sh" >/dev/null
  echo "$RUNNER_VERSION" > "$dir/.orgx-runner-version"
  chown -R "$user:$user" "$dir"
  rm -f "$archive"
fi
envfile="$dir/.env"
touch "$envfile"
grep -q '^ACTIONS_RUNNER_HOOK_JOB_STARTED=' "$envfile" || echo "ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/orgx-ci/job-started.sh" >> "$envfile"
grep -q '^ACTIONS_RUNNER_HOOK_JOB_COMPLETED=' "$envfile" || echo "ACTIONS_RUNNER_HOOK_JOB_COMPLETED=/opt/orgx-ci/job-completed.sh" >> "$envfile"
chown "$user:$user" "$envfile"

# Chromium's shared libraries and fonts, once, as root. Browsers themselves are installed per job.
npx --yes "playwright@$PLAYWRIGHT_VERSION" install-deps chromium >/dev/null

# Same resilience as the orgx lanes, plus a memory cap so a tracegrove job can't starve orgx's heavy lane.
d="/etc/systemd/system/actions.runner.hopeatina-tracegrove.tracegrove-mini-1.service.d"
mkdir -p "$d"
cat > "$d/10-resilience.conf" <<'UNIT'
[Service]
OOMPolicy=continue
Restart=always
RestartSec=15
MemoryMax=2500M
MemorySwapMax=2G
UNIT
systemctl daemon-reload
echo "add-tracegrove-runner: $user ready with runner $RUNNER_VERSION; register it next (docs/self-hosted-runner.md)"
