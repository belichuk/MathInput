# ADR 0001: Addressing for variable-arity constructs

## Status

Accepted for 0.6.0; implementation deferred to 0.7.0.

## Decision

Keep the current named-branch path format for 0.6.0. Before matrices or other variable-arity
constructs ship, generalise a path step to a name-or-index selector. `data-path` is an internal,
unstable rendering detail and is not a public integration API.

## Consequences

The current immutable tree, selection bridge, and serialized values remain compatible. Big
operators will generalise the existing attachment primitive (NE/SE/N/S) rather than introduce a
bespoke primitive; `atom` is the fifth render primitive.
