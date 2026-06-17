# AGENTS.md

## Project

This is a Vite + React + TypeScript browser idle RPG project.

The project is an incremental / idle RPG inspired by Bokumaka-style gameplay.
Prioritize small, safe, reviewable changes.

## Environment

* The developer mainly uses Windows PowerShell.
* Prefer Windows-compatible commands.
* Use `npm.cmd` instead of `npm` when providing or running commands in PowerShell.

## Commands

* Test: `npm.cmd test`
* Build: `npm.cmd run build`
* Balance simulation: `npm.cmd run sim:balance -- --trials 1000 --seed 12345`

## Current stability rules

* Do not perform broad rewrites unless explicitly requested.
* Keep changes small and reviewable.
* Preserve existing save data compatibility.
* Do not change `SAVE_VERSION` unless a migration is actually required.
* If `SAVE_VERSION` changes, explain why and add or verify migration logic.
* Do not remove existing tests.
* Prefer deterministic logic for simulations and tests.
* Do not change unrelated gameplay balance while implementing UI-only changes.
* Do not introduce new production dependencies unless explicitly approved.

## Gameplay-sensitive areas

Be especially careful when modifying:

* save data structure
* migration logic
* reward calculation
* mastery / proficiency logic
* rare drop logic
* battle logs
* balance simulation
* localStorage persistence

## Done when

* `npm.cmd test` passes.
* `npm.cmd run build` passes.
* If gameplay balance is affected, run:
  `npm.cmd run sim:balance -- --trials 1000 --seed 12345`
* Report all changed files.
* Summarize risks and manual QA points.
* State whether the change is ready to commit.
