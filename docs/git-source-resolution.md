# Immutable Git source resolution

`workflow-verify source-resolve --input repositories.json --output source.json --json` freezes explicit local base/head selections across repositories. It exports a sealed owner-private source-resolution document containing the `RevisionMatrix`, full binary-capable diffs, changed paths and before/after blob bytes. Exit zero means source resolution succeeded; it is not a case review, execution verdict or deployment proof.

Create a local request using the public typed SDK (the repository reference below is a local label, not a registered remote identity):

```js
import { writeFileSync } from 'node:fs';
import { localScope, digestOfValue } from 'workflow-verify';

writeFileSync('repositories.json', JSON.stringify({
  scope: localScope(),
  repositories: [{
    repositoryRef: { id: 'application', revision: '1',
      digest: digestOfValue({ kind: 'local-git-binding', name: 'application' }) },
    root: '.', base: 'HEAD~1', head: 'HEAD',
  }],
}, null, 2), { flag: 'wx', mode: 0o600 });
```

Roots in CLI requests resolve relative to the request file. Library callers supply their own trusted local mappings. Both worktrees and bare repositories are supported; selecting a nested directory cannot silently bind its parent repository. The CLI accepts only the process's `localScope()` and writes new output files privately without overwriting existing evidence. Public JSON schemas include the Git request and resolution contracts.

`resolveGitSources(request, authorize)` requires a trusted host authorization callback before reading each repository. `GitSourceReader(matrix, bindings, authorize)` implements citation object reads and full-diff reads after restart. Bindings contain only `repositoryRef` and `root`; they do not re-resolve branch expressions. A reader refuses another scope/repository, substituted matrix rows, unavailable objects and changed full-diff bytes. Citation validation still checks exact file/excerpt digests. A later dirty checkout or moved branch does not change the selected immutable commit identities.

Git invocation uses argument arrays and [documented end-of-options handling](https://git-scm.com/docs/git-rev-parse), reads commit objects rather than worktree files, and disables replacement objects, inherited Git routing variables, external diff/text-conversion helpers, terminal prompts and lazy fetching. [Git's diff options](https://git-scm.com/docs/git-diff) define the helper exclusions. Selected commits and their tree closure are checked against Git object hashes; captured/read blobs are rehashed independently too. SHA-1 and SHA-256 Git object IDs are preserved in full. This does not create an authenticated issuer or attest a remote repository or deployed target; the host owns the Git executable, source mappings, protected object storage and admission policy.

No fetch, checkout, model call or review approval occurs. Missing or multiple merge bases block until a registered alternative revision policy exists; an empty base is never invented. Renames are represented as deletion/addition with detection disabled. Changed symlinks, submodules, unsupported paths/modes, oversized blobs and incomplete output block instead of dropping coverage.

Bounds: 32 repositories, 500 changed paths, 1 MiB per captured/cited blob, 4 MiB per full diff/tree listing/tree object, 8,192 trees per selected commit, 32 MiB of captured payload bytes and ten seconds per Git command. CLI input is at most 256 KiB. The artifact includes changed blobs and full diffs, not every source object: later citation reads require the selected objects in an authorized Git store. Full source-object transport remains separate work.

The output is a `RevisionMatrix`, not a complete runtime `SourceSelection` or qualified source-to-target proof. Independent element/coverage checking, reviewed source admission, hosted lifecycle storage and execution wiring remain separate gates. Tests use real temporary repositories, including dirty/moved checkouts, bare and SHA-256 repositories, corrupt objects, denied/revoked scope, missing objects, oversized blobs, configured helpers and the actual source/built CLI.
