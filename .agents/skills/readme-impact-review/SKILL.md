---
name: readme-impact-review
description: Review code or configuration changes in this repository and decide whether README.md needs an update; revise the README when documented setup, behavior, APIs, dependencies, or deployment instructions have changed.
---

# README impact review

Use this skill when reviewing or finishing code changes in this repository, especially before presenting a change as complete.

## Workflow

1. Inspect the current diff and the relevant surrounding implementation. Include untracked files when they affect the feature; do not assume the staged diff is the whole change.
2. Compare observable behavior and setup requirements with `README.md`. Check whether the change affects:
   - user-visible features or known limitations;
   - routes, request/response shapes, or integrations;
   - environment variables, secrets, local setup, database schema, or migrations;
   - dependencies or available scripts;
   - authentication, data storage, security configuration, or deployment steps.
3. If any documented fact is now wrong or an important new setup/usage step is missing, update the smallest relevant README section in the same change. Base instructions on the implementation and repository configuration; do not document planned behavior as already available.
4. If no README update is needed, state briefly why in the final change summary. Do not edit README just to record internal refactors that have no effect on documented behavior or setup.
5. Re-read the edited section for accuracy and check that referenced files, commands, routes, and environment variable names exist in the repository.

Keep documentation concise and in the README's existing language. Never put secret values in documentation. Do not change application code as part of this skill unless the user also requested that work.
