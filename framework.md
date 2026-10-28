# AIPA Core Framework

This abstract framework describes the general operating model without personal identifiers, project details, or subjective views.

## Four Architectural Layers

Specification (AGENTS.md / profile.yaml / policy.md / privacy.yaml / AIPA-MANIFEST.yaml) ->
memory (memory / projects / logs / skills) ->
runtime (AIPA scripts and optional enhancements) ->
host (IDE and Git).

## Two Modes

- consume: perform user work and evolve personal skills without writing back to the public foundation.
- maintain: maintain the framework in its designated maintenance context, subject to ownership and approval constraints.

## Memory Layers

Session -> short term (logs/daily) -> long term (memory) -> project knowledge (projects/<id>/knowledge) -> personal knowledge base.

## Three Invocation Layers

Personal skills -> foundation skills (including mentors) -> model fallback. Use skill-description semantic matching first, with exact trigger phrases as a routing fallback and keywords/tags for retrieval.

## Boundary Priority

Built-in hard boundaries -> personal boundaries -> soft constraints -> suggestions. Hard conflicts stop the action; soft conflicts require a user notice/question.

## Authoritative Sources

Memory Markdown is authoritative content and persistent memory metadata holds provenance/lifecycle decisions. memory-index.json is a derived search projection; preserve legacy provenance/history before rebuilding, as required by shared contracts.

## Language

Repository content and mechanical output use English. Model output follows an explicit current request, then display.language; auto follows user input. Preserve personal source content in its original language.
