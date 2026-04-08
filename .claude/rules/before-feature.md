# Before Feature — Spec-First Development

## When this applies
Before implementing ANY new feature, fixing ANY bug, or changing ANY behavior.

## Required steps (in order)

### 1. Behavior spec
Write a plain-language spec listing ALL user-facing actions the feature enables. Not just the happy path — every combination.

Format:
```
## [Feature Name] — Expected Behavior

### Actions
- [source] → [destination]: [what happens]
- ...

### Edge cases
- What if input is empty/null/undefined?
- What if it partially fails mid-operation?
- What if it's called twice quickly (race condition)?
- What if the data doesn't exist or has unexpected format?
- What if source = destination (no-op)?
- What are ALL source/destination combinations?

### What should NOT happen
- [explicitly list forbidden behaviors]
```

### 2. User approval
Present the spec to the user. Do NOT write code until they approve.

### 3. Test cases from spec
Each line in the behavior spec becomes at least one test case. Write tests BEFORE implementation (TDD red phase).

### 4. Implement
Write the minimum code to make tests pass. Every edge case from the spec must be covered.

### 5. Verify
Run tests. Manually verify at least the 3 most critical paths from the spec.

## Examples of specs

### CRUD feature
```
- Create with valid data: saves to disk, appears in sidebar
- Create with empty title: defaults to 'sem-titulo'
- Create with duplicate title: appends ' 2', ' 3', etc.
- Delete: removes from disk + sidebar + index
- Delete active note: clears editor, selects next note
```

### Drag-and-drop feature
```
- Note from folder → folder: moves, updates caderno
- Note from folder → root: moves, clears caderno
- Note from root → folder: moves, sets caderno
- Folder → folder: nests as subfolder
- Subfolder → root: promotes to top-level
- Anything → itself: no-op
- Anything → reserved folder: blocked with error
```

## Why this exists
Every bug found in testing traced back to undefined behavior — the happy path worked, but edge cases were never specified. This rule ensures edge cases are defined before code is written, not discovered after.
