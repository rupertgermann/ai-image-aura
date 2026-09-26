# Domain Docs

This is a single-context repo: root `CONTEXT.md` and `docs/adr/`.

## Before exploring

Read `CONTEXT.md` and the ADRs relevant to the area being changed.

If these files are absent, proceed silently. The `/domain-modeling`
skill creates them when domain terms or decisions are resolved.

## Vocabulary

Use the terms defined in `CONTEXT.md`, including its distinctions and
synonyms to avoid.

For an undefined concept, reconsider whether the project needs the term.
Record genuine gaps for `/domain-modeling`.

## ADR conflicts

Explicitly identify any proposal that contradicts an existing ADR:

> Contradicts ADR-0007 — worth reopening because…
