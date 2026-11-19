## Agent skills

### Issue tracker

Local markdown in `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Architecture docs

`ARCHITECTURE.md` is the current-state index, with details loaded by area. See `docs/agents/architecture.md`.

## Tests

- Never run the full suite (`npm test`). Run only the targeted command for the area you changed: `npm run test:pins`, `npm run test:skill`, `npm run test:installer`, or one named test file.
- **Close every test container when the tests end, whether they passed, failed, timed out or were interrupted.** After each test run, run `npm run test:cleanup` and check that `docker ps -a --filter label=dev-setup.test-run` lists nothing. Do not finish a task, hand back, or commit while test containers are still running.
- Run a test command that can outlast your tool timeout in the background and wait for it to finish. A run killed by SIGKILL cannot clean up after itself.
- `npm run test:cleanup` removes only what carries the `dev-setup.test-run` label and the run folders `<tmp>/dev-setup-test-*`. Never use `docker prune` or remove anything by name.
