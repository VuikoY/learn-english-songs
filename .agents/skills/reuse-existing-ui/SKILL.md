---
name: reuse-existing-ui
description: Reuse existing UI components and interaction patterns when implementing interface changes, especially when the user asks for an identical existing interface.
---

# Reuse existing UI

When a user asks to make one interface identical to another, inspect the existing implementation and use that implementation directly wherever practical. Prefer extending or relocating an existing component over creating a parallel component with duplicated markup or behavior.

Before changing code:

- Find the source component that already implements the requested interface and inspect its props, state, and callers.
- Trace the data and save flows for every requested location, including modals and alternate modes.
- Identify behavior tied to its current page, such as player ownership, routing, permissions, or persistence.

Implement the shared behavior in the smallest appropriate existing surface. Preserve the original interface's controls, layout, labels, scrolling, and interaction details. Avoid near-identical copies that can drift. Do not create new components when an existing component can be adapted or relocated cleanly; if sharing truly requires a new component, explain why before choosing that design.

After edits, inspect the diff for duplicate UI, broken callers, and differences from the requested reference. Run checks only when the user asks for verification or the project instructions require them.
