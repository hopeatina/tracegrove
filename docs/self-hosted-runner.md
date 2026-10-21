# Running CI on the Mac mini

Both workflows (`tracegrove` and `proof card`) run on GitHub-hosted Ubuntu by default. The repository
variable `CI_RUNNER` moves them to a self-hosted runner, where GitHub bills no minutes:

```sh
gh variable set CI_RUNNER --repo hopeatina/tracegrove --body '["tracegrove-mini","linux-arm64"]'
gh variable delete CI_RUNNER --repo hopeatina/tracegrove   # back to hosted
```

The runner is a third lane in the Mac mini's `orgx-ci` Lima VM, next to orgx's heavy and light lanes
(runbook: `orgx/docs/runbooks/mac-mini-ci-runner.md` in hopeatina/orgx). The VM is Ubuntu 24.04 arm64
with no host mounts and no host credentials.

| | |
| --- | --- |
| Runner | `tracegrove-mini-1`, labels `tracegrove-mini`, `linux-arm64`, no default labels |
| User | `runner-tracegrove`: no sudo, no Docker |
| Memory | `MemoryMax=2500M`, so a tracegrove job can't starve orgx's heavy lane |
| Docker lanes | `test:container` needs Docker, so the `containers` job stays hosted when `CI_RUNNER` is set |

## Set up (once)

From a Mac with `gh` signed in as the repository admin and SSH to the mini:

```sh
M="ssh hopeatina@hopes-mac-mini"
LIMA='LIMA_HOME=$HOME/orgx-ci/lima $HOME/orgx-ci/bin/limactl shell orgx-ci --'
$M "$LIMA sudo bash -s" < infra/ci-runner/mini/add-tracegrove-runner.sh
# Register: the token goes gh -> stdin -> the runner, never into argv, a file or the terminal.
gh api -X POST repos/hopeatina/tracegrove/actions/runners/registration-token --jq .token \
  | $M "$LIMA sudo -u runner-tracegrove -i /opt/orgx-ci/configure-runner.sh hopeatina/tracegrove tracegrove-mini-1 tracegrove-mini,linux-arm64"
# Start on VM boot (orgx's LaunchDaemon already keeps the VM itself running).
$M "$LIMA sudo bash -c 'cd /home/runner-tracegrove/actions-runner && ./svc.sh install runner-tracegrove && ./svc.sh start'"
gh api repos/hopeatina/tracegrove/actions/runners --jq '.runners[] | {name, status, busy}'
```

Then set `CI_RUNNER` as above.

## Trust boundary

- Fork pull requests are routed to `ubuntu-latest` by the workflows. A fork PR can edit the workflow
  file itself, though, so **before the repository goes public** set Settings → Actions → General →
  "Approval for running fork pull request workflows" to **Require approval for all external
  contributors**, and never approve a fork run that touches `.github/`.
- The VM is reused between jobs; orgx's job hooks scrub the workspace and credentials after each job.
  Only trusted, same-repository workloads should reach this runner.

## When the runner is offline

Jobs stay queued (they never pass) until it returns; GitHub cancels them after 24 hours. To fall back
to hosted runners, delete `CI_RUNNER`.

## Remove

```sh
gh api -X POST repos/hopeatina/tracegrove/actions/runners/remove-token --jq .token \
  | $M "$LIMA sudo -u runner-tracegrove -i bash -c 'cd ~/actions-runner && IFS= read -r ACTIONS_RUNNER_INPUT_TOKEN && export ACTIONS_RUNNER_INPUT_TOKEN && ./config.sh remove'"
```
