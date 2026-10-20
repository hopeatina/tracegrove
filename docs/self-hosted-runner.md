# Running CI on your own Mac

Both workflows (`tracegrove` and `proof card`) run on GitHub-hosted Ubuntu by default. Set the repository
variable `CI_RUNNER` to a self-hosted runner's label and they run there instead, at no Actions cost.
Pull requests from forks always stay on a hosted runner, so outside code never runs on your machine.

## Set up the runner (once)

On the Mac, with Node 22, Python 3.13 and git installed:

```sh
mkdir -p ~/actions-runner && cd ~/actions-runner
# Download the macOS ARM64 runner from: GitHub → repo Settings → Actions → Runners → New self-hosted runner
./config.sh --url https://github.com/hopeatina/tracegrove --token <registration token> \
  --labels tracegrove-mac --name "$(scutil --get ComputerName)" --unattended
./svc.sh install && ./svc.sh start   # runs at login, survives restarts
```

Then: repo Settings → Secrets and variables → Actions → Variables → `CI_RUNNER` = `tracegrove-mac`.
Delete the variable to go back to hosted runners.

## Notes

- The Mac must be awake and online, or jobs wait in the queue. Turn on "Prevent automatic sleeping" for a Mac mini.
- Playwright's Chromium is installed per run into the runner's cache; Docker is only needed for the
  container lanes, which use a mocked Docker client in CI.
- Each run gets a fresh checkout but shares the machine. Keep the runner on a user account that holds no
  credentials you would not hand to this repository's workflows.
