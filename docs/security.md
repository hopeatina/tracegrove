# Security and data handling

Short version: tracegrove runs on your machine or your CI runner. There is no tracegrove server, account or telemetry. Credentials are looked up when a run starts, kept in memory, and never written anywhere. Customer data that your agent says or returns can be redacted before it is saved, and finished runs can be encrypted at rest.

This page answers the questions an agency or a client's security reviewer usually asks first.

## Where things live

| What | Where it lives | Leaves your machine? |
| --- | --- | --- |
| Flows and config (`tracegrove.config.yaml`, `tracegrove/**`) | your repository | only if you push it |
| Credentials | your secret store (env var, file, AWS Secrets Manager / SSM, 1Password, a persona broker) | no, tracegrove reads them at run time |
| Run evidence (`.tracegrove/runs/<run>/`) | your disk, git-ignored by `init` | only if you copy or seal and send it |
| Client handoff report | a single HTML file you choose to write | only if you send it |

Tracegrove makes network requests only to the app and environments you configure, to the secret stores you reference, and, for `draft` and `heal`, through the Claude Code or Codex CLI you configured (those commands send flow and source context to that agent; don't run them on client code you are not allowed to share with that provider). The local `tracegrove ui` page loads its fonts from Google Fonts; nothing else about your run is sent.

## Credentials

The config holds references, never values:

```yaml
environments:
  staging:
    target: { url: https://staging.example.com }
    personas:
      front_desk: { from: "op://Clients/bright-smile-staging/front-desk-token" }
      other_clinic: { from: "aws-sm://clients/bright-smile/staging#other_clinic" }
```

Supported sources: `env:NAME`, `file:path`, `aws-sm://`, `aws-ssm://`, `op://` (1Password CLI), and short-lived `orgx-broker://` personas. See [environments.md](environments.md).

When a run starts, each reference is resolved into an in-memory `Secret` object. That object refuses to be serialized (`JSON.stringify` throws), prints as `<redacted>`, and is only read at the moment it goes into a request's `Authorization` header. Every live secret value is also registered with a process-wide scrubber, so any text tracegrove writes (events, summaries, receipts, JUnit, the UI) has those values replaced with `<redacted>` as a second line of defense. If a voice or chat agent ever repeats a credential back, the step fails with `conversation_secret_echo` and the value is not recorded.

`tracegrove env doctor <env>` checks that every reference resolves and that each persona is who you think it is, without printing the secret.

## Client data in transcripts and responses

A run records what your app returned and what your agent said, because that is the evidence. If those contain a caller's phone number or a customer's email, turn on capture-time redaction:

```yaml
# tracegrove.config.yaml
privacy:
  redact: [phone, email, card, ssn]
  # or your own patterns, up to 16 in total:
  #   - { name: member_id, pattern: "MBR-[0-9]{6}" }
```

Matches are replaced with `[redacted:phone]` (and so on) before anything is written: step outputs, transcripts, request logs and the variables shown for each step. `card` only matches numbers that pass the Luhn check. Redaction is part of the case definition, so the saved evidence records that it was on and the handoff report says so.

Two things it does not do:

- **It does not change what is sent to your app.** Requests and saved IDs use the real values. Checks, though, are judged on the stored, redacted copy, so that `verify-bundle` can recompute every verdict from the files alone. A check like `appointment.phone: 555-0142` will fail once `phone` is redacted; check `present: [appointment.phone]` instead, or leave that pattern off.
- **It does not rewrite your flow files.** Lines you author in `say:` or `json:` are stored as written, in your repository and in the run's copy of the case. Use synthetic test data (555 numbers, `example.com` emails, test card numbers) in flows, never real client records.

## Encrypting runs at rest

Run folders are plain files so you can read them. To keep or send one encrypted:

```bash
export TRACEGROVE_SEAL_KEY='a long passphrase from your password manager'
npx --no-install tracegrove seal --run latest --out bright-smile-2026-10-20.tgseal --remove
npx --no-install tracegrove unseal bright-smile-2026-10-20.tgseal --out ./opened
npx --no-install tracegrove verify-bundle --bundle ./opened/bundle
```

- AES-256-GCM, with the key derived from `TRACEGROVE_SEAL_KEY` using scrypt and a random salt per archive. Passphrases under 12 characters are refused.
- The key is read only from the environment, never from a flag, so it does not land in shell history or process listings.
- Tampering with any byte, or using the wrong key, fails with `seal_open_failed`; nothing is written.
- `--remove` deletes the plaintext run folder only after the new archive has been opened and checked successfully. The archive is created with owner-only permissions and never overwrites an existing file.

Sealing protects a file you store or send. It does not replace full-disk encryption on laptops and CI runners, which you should have on anyway.

## Evidence integrity

Every run produces a bundle with a manifest of content digests. `tracegrove verify-bundle` rechecks the files and recomputes the verdict without rerunning your app, so a changed file or edited verdict is detected. Bundles are not signed: verification tells you the evidence is internally consistent, not who produced it. If that matters, store bundles somewhere access-controlled or seal them.

## Writes and environments

Each environment has a safety class. Local runs use an isolated data directory per run. Staging runs must confirm cleanup or they fail. Under `production_observation`, any flow that writes, including every voice or chat conversation, is blocked before it starts. Coding agents can be set to `allow`, `ask` or `deny` per environment.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
