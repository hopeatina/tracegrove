# Clean Docker qualification

From a clean checkout with the supported Node runtime and Docker Desktop or Engine:

```sh
npm ci --ignore-scripts
npm run test:container -- native-real
npm run test:container -- offline-contract
```

If the desktop credential helper stalls while looking up the public base image,
opt into an anonymous client for this qualification only:

```sh
npm run test:container -- native-real --anonymous-public-registry
npm run test:container -- offline-contract --anonymous-public-registry
```

This mode uses a temporary Docker client configuration with no copied registry
credentials. It requires a local Unix socket, preserves the observed buildx plugin
location, and compares the daemon ID before and after configuring the client.
It refuses remote daemons or a changed daemon identity. Your original client
configuration remains untouched; the temporary directory is removed and its
cleanup is recorded in `qualification.json`. Default credential behavior is
unchanged. This is an explicit public-registry option, not a fallback after an
authentication error. The image digest and runtime network restrictions stay
pinned. Docker documents these per-client controls in its
[CLI configuration reference](https://docs.docker.com/reference/cli/docker/).

The build context contains only the verifier source, locked dependencies, sample templates and container entrypoint. The base image is pinned by digest and was observed running Node 22.23.3. The image builds the compiled CLI independently of any host `dist` or `node_modules` directory.

At runtime the verifier and the notes application run inside one container. There are no OrgX credentials, model calls, database, external network or published ports. The wrapper limits the container to one CPU, 512 MiB RAM and 128 processes; the root filesystem is read-only, capabilities are dropped, and the application workspace lives in a 256 MiB temporary filesystem. Only the evidence subdirectory is mounted for writeback. Image and container IDs remain outside that mount.

Each run creates a new directory under `artifacts/qa/container-*`. An optional empty output directory can be supplied as the second argument. Nonempty directories are refused. `qualification.json` records the exact image ID, runtime exit and removal readback from the local Docker daemon. The CLI's stage results and exported bundle are in `evidence/`. A successful wrapper exit requires a passing run, verification inside the container, independent verification of the saved bundle by the operator's host CLI after container exit, and confirmed removal of the owned container. Failed or interrupted runs remain nonzero and retain available diagnostics.

The native lane proves real HTTP application behavior using the existing corpus, fixtures, readbacks and cleanup. The offline lane is separately identified as mocked fidelity. These are verifier-inside-Docker runs using the native process host; they do not implement a Docker host adapter or attest an external deployment. Django's native conformance and authenticated OrgX staging qualification remain separate requirements.
