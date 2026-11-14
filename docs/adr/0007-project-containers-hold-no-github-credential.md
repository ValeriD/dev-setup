# Project containers hold no GitHub credential; the push is done in the Quarterdeck

Narrowed by [ADR 0010](0010-read-only-agent-extensions-token.md): one read-only, single-repository token is allowed for fetching Agent Extensions. The project repository credential and push remain in the Quarterdeck.

A Consuming Project's container started by the Quarterdeck gets no GitHub credential. Crewmates commit locally. The push and the pull request are done by a Crewmate in the Quarterdeck, where the token lives. The project folder holds the same files on both sides, so a commit made in the project container is visible in the Quarterdeck at once; the spike confirmed this. This removes a GitHub login from every container, and a compromised Crewmate can neither push nor read other repositories.

Today a Template passes an optional repo-scoped token, `DEV_SETUP_GITHUB_PAT`, into the container; left unset, the container has no credential (`README.md`, `templates/node/`). That stays as it is for a project opened by hand. This decision is about containers the Quarterdeck creates: they never receive the variable. The Quarterdeck itself gets one fine-grained token for the project's repository, passed by name.

## Considered Options

- The repo-scoped token in every project container, as the Template does: rejected because each container then holds a credential that a compromised Crewmate can use to push.
- A git gate, a container that adds the token to outgoing git traffic and applies repo and branch rules: planned for later. It complements this decision by taking the token out of the Quarterdeck as well.

## Consequences

- FirstMate's pull-request delivery mode tells the Crewmate to push and open the PR. Its "done" wording must become "commit only". Until something pushes, FirstMate shows the Spec Run as blocked ("head unreachable"). Second Mates must treat that as expected.
- For the MVP the token is readable by the mates in the Quarterdeck. Only processes started under the Herdr server hold it.
- The GitHub flow was not exercised in the spike. The token could not reach the spike repository, so a local repository stood in for origin. Cloning from GitHub, pushing and opening a pull request are proven only when the MVP is built.
