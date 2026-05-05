# [feature-set-007] Multi-agent testing

## Goal
Validate that two or more Claude agents can work concurrently against a shared bot-hive board without data loss, phantom state, or missed SSE events.

## Rationale
Bot Hive's git-lock protocol, SSE broadcast, and board merge behaviour have only ever been exercised by a single agent. Before multi-agent use cases can be considered reliable, we need at least one end-to-end run under real concurrent load — two agents racing to claim tickets, one winning each race, and a connected board staying consistent throughout. This feature set groups all work needed to design, run, and document that validation.

## Tickets
- HV-030 — Multi-agent testing harness — initial spike

## Status
In progress
