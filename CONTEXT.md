# Dev Setups

A catalogue of hardened, reusable development containers for personal projects, each with AI coding agents preinstalled and agent extensions declared as configuration rather than installed by hand.

## Language

### Containers

**Variant**:
One kind of development container in the catalogue, defined by the toolchain it ships (e.g. the Node variant).
_Avoid_: Flavour, stack, setup

**Base**:
What every Variant and the Quarterdeck have in common: the hardening, the agents, and the shared extension set.
_Avoid_: Core, common layer

**Consuming Project**:
A project that develops inside a published Variant by pointing to it from its own devcontainer config.
_Avoid_: Client project, downstream repo

**Template**:
The scaffold a Consuming Project is created from, which wires it to a published Variant image.
_Avoid_: Starter, boilerplate

**Egress Allowlist**:
The destinations a container may reach; everything else is blocked. Assembled from the same three scopes as Extension Layers.
_Avoid_: Whitelist, firewall rules

**Named Secret**:
A host environment variable that an Extension Manifest names and the container receives by name only. Its value never appears in the catalogue, a Consuming Project's files, or an image. It is either declared by the MCP server that uses it, or **container-wide**: declared for the whole container, because the project itself (not one Agent Extension) needs it.
_Avoid_: Credential, token, env var

### Agents

**Agent**:
An AI coding CLI that runs inside the container. Currently Claude Code and Codex.
_Avoid_: Assistant, bot, AI

**Agent Extension**:
Anything that changes what an Agent can do: a plugin, a skill, an MCP server, or a hook.
_Avoid_: Add-on, addon, tool

**Extension Layer**:
A declared list of Agent Extensions that applies at one scope. There are three: Base, Variant and Consuming Project. The effective set is their union.
_Avoid_: Overlay, profile, preset

**Extension Manifest**:
The file that declares one Extension Layer: each entry names its kind, its pinned source, and which Agents receive it.
_Avoid_: Config, plugin list

**Preset**:
A named, reusable set of Agent Extensions kept in this repository, which a Consuming Project can adopt into its own Extension Layer.
_Avoid_: Template, bundle, profile

**Pinned Ref**:
An immutable pointer to an Agent Extension's exact content: a commit SHA or an exact package version.
_Avoid_: Version, tag, branch

### Orchestration

**Quarterdeck**:
The one long-lived container you work from. It holds the session manager, the mates and every skill, and it starts and reaches into each Consuming Project's container. It is built on Base but is not a Variant, because it serves no single project.
_Avoid_: Helm, control container, main container

**First Mate**:
The single orchestrating Agent in the Quarterdeck that you talk to. It hands work to Second Mates and reports back.
_Avoid_: Orchestrator, coordinator, FirstMate (as a role; that spelling names the upstream tool)

**Second Mate**:
An orchestrating Agent in the Quarterdeck that owns one Consuming Project. It starts Crewmates for that project and checks their results.
_Avoid_: Project mate, sub-orchestrator, supervisor

**Crewmate**:
An Agent session started by a mate to do one piece of work. A coding Crewmate runs inside the Consuming Project's container.
_Avoid_: Worker, subagent, task agent

**Spec**:
The product document that says what one feature must do, written after the grilling. It is never the build notes inside a Crewmate's instructions; those are brief notes.
_Avoid_: PRD, requirements, Firstmate spec

**Spec Run**:
One Spec taken from the First Mate's grilling handoff to its final pull request by a Second Mate: a planning Crewmate writes the Spec, design and tickets, then one Crewmate per ticket makes one commit per ticket.
_Avoid_: Task, job, ship (as a noun)

**Brief**:
The instruction file a Crewmate starts from. For a ticket's Crewmate it points at the ticket.
_Avoid_: Prompt, task description

**Charter**:
A Second Mate's standing instructions: which Consuming Project it owns and how it runs a Spec Run.
_Avoid_: Role prompt, system prompt

**Scout**:
A Crewmate that only investigates and writes a report. It changes nothing.
_Avoid_: Researcher, explorer

**Idea**:
Something you thought of for a project that has had no grilling yet. It is kept on hold with the First Mate and is never started until you grill it.
_Avoid_: Backlog item, todo, ticket
