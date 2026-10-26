# Dev Setups

A catalogue of hardened, reusable development containers for personal projects, each with AI coding agents preinstalled and agent extensions declared as configuration rather than installed by hand.

## Language

### Containers

**Variant**:
One kind of development container in the catalogue, defined by the toolchain it ships (e.g. the Node variant).
_Avoid_: Flavour, stack, setup

**Base**:
What every Variant has in common: the hardening, the agents, and the shared extension set.
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
A host environment variable that an Extension Manifest names and the container receives by name only. Its value never appears in the catalogue, a Consuming Project's files, or an image.
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
