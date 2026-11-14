# 05: Devcontainer CLI persists the container-level extensions token

Status: done
Type: task

## Evidence

Ticket 08's real-container dummy-only filesystem scan found the extensions token in `/etc/environment`. The initial full `npm test` run failed that assertion (86 passed, 1 failed); a focused rerun confirmed the same path. The retained nested TODO regression in `tests/quarterdeck.test.mjs` scans container files and reports paths, not values.

The pinned `@devcontainers/cli@0.89.0` bundled implementation's environment-patching routine uses `.patchEtcEnvironmentMarker`, `allowSystemConfigChange`, and `cat >> /etc/environment`; its CLI context enables system configuration changes. `--skip-post-create` does not prevent the observed write. This occurs with the ordinary Template fixture, without a hostile Feature. No real credential was used.

## Impact

Name-only `-e DEV_SETUP_GITHUB_PAT` keeps the rendered JSON/export and ordinary command logs free of the supplied value, but does not keep the token out of the running container's writable filesystem. The file can outlive the process and be copied by code in the container. Ticket 08's no-file acceptance criterion is not satisfied. Accepted `docker inspect` visibility does not by itself authorize this additional persistence.

## Code/design pointers

- `quarterdeck/bin/qd-project-up`: `devcontainer up --skip-post-create`, container-level token.
- `tests/quarterdeck.test.mjs`: extensions fixture / `extensions token is absent from container files` TODO.
- `.scratch/quarterdeck/issues/08-project-container-receives-a-read-only-extensions-token.md`: no-file criterion and mechanism.
- `.scratch/quarterdeck/design.md`: Project-layer fetch and Credentials.
- `docs/adr/0010-read-only-agent-extensions-token.md`.

## Review criteria

- [ ] Determine a supported CLI mechanism or reviewed integration change that prevents the write while retaining startup-time availability, image metadata and the existing container lifecycle.
- [ ] Alternatively record an explicit human decision narrowing the no-file requirement; do not treat inspect acceptance as that decision.
- [ ] Make the retained TODO regression pass normally, including the ordinary Template and benign Feature cases; use dummy tokens only.
- [ ] Confirm generated files, container files, logs and image contents separately; image history alone is not proof of absence from every layer.

Deleting `/etc/environment` after startup would not satisfy “appears in no file”; pre-seeding undocumented CLI marker files was not introduced as a workaround. This is distinct from concern 01's arbitrary project configuration trust. Independent creation transport is implemented; no real-token run is claimed safe or complete.

## Comments

### Resolution — ticket 21 decision 1

[Ticket 21](../../quarterdeck/issues/21-mvp-security-review-decisions.md) explicitly accepts persistence inside the project container, including `/etc/environment`, until the Git gate. ADR 0010 and spec accepted risk 11 narrow the no-file requirement to rendered config, work-root exports, logs and images. The obsolete container-files TODO is replaced by ordinary/benign-Feature checks of that boundary, including saved image layers rather than history alone. Closed by requirement narrowing, not prevention of the observed write. The historical evidence remains intact; real private-source startup and permissions are still unobserved and review 04 remains open.
