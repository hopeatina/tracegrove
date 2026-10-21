# Signed evidence

Every run seals its evidence in a bundle, and `verify-bundle` rechecks its hashes and re-reduces the verdict. That proves the bundle is internally consistent. It doesn't prove who produced it: anyone with the tool can write a consistent bundle. A signature adds that.

## Sign runs

```bash
npx tracegrove keygen --name hope   # private key in .tracegrove/keys/hope.pem, public key in tracegrove/signers/hope.pub
git add tracegrove/signers/hope.pub # committing the public key is what makes it trusted
npx tracegrove test
npx tracegrove sign                 # signs the latest run; --run <name> for another
npx tracegrove verify-bundle --bundle .tracegrove/runs/<run>/bundle
# bundle ok: 2 receipt(s), re-reduced outcome passed
# signed by hope (trusted key SHA256:7040TXWqUzRn…)
```

A signature is an Ed25519 signature over the bundle's manifest digest, its outcome, the run name and the time. It is written beside the bundle as `signature.json`, so the sealed bundle bytes never change and a sealed archive carries it along. Only a bundle that verifies can be signed.

`verify-bundle` reports one of four states:

| State | Meaning | Exit |
| --- | --- | --- |
| signed by *name* (trusted) | The signature verifies, covers this exact bundle, and the key is in `tracegrove/signers/` | 0 |
| signed by *name*, key not in signers/ | The signature verifies, but nobody committed that key | 0 |
| unsigned | No `signature.json` | 0 |
| signature INVALID | The bundle or the signature changed after signing | 2 |

Pass `--signers <dir>` to check against another folder of keys, such as a client's own copy.

## In CI

Store a private key as a repository secret and set `TRACEGROVE_SIGNING_KEY` to it (PEM text, or a path to a PEM file). `tracegrove test` then signs every verified run. Commit the matching public key under `tracegrove/signers/`. The GitHub Action takes it as an input:

```yaml
- uses: hopeatina/tracegrove@codex/bootstrap
  with:
    signing-key: ${{ secrets.TRACEGROVE_SIGNING_KEY }}
    attest: 'true'      # optional, see below
```

`attest: 'true'` also publishes a [GitHub artifact attestation](https://docs.github.com/en/actions/security-for-github-actions/using-artifact-attestations) for each handoff report. It is keyless (Sigstore) and records which workflow, commit and repository produced the file; anyone can check it with `gh attestation verify report.html --repo <owner>/<repo>`. The calling workflow needs `permissions: { id-token: write, attestations: write }`.

## Where it shows

- **PR card:** the footer says "Signed by ci" when every run behind the claims is signed by a trusted key. A signature that doesn't verify fails the card.
- **Handoff report:** "What this does not cover" states whether the runs were signed, and by whom.

## What a signature does not prove

It proves that the holder of the key vouched for this exact evidence. It doesn't make the evidence more true than the checks that produced it, and a leaked key signs anything: keep private keys out of the repository (`.tracegrove/` is ignored) and remove a public key from `tracegrove/signers/` to stop trusting it.
