---
name: commit-and-push
description: Creates clean commits and pushes changes to the current branch. Use when committing code, preparing changes for PR, or syncing local work to remote.
---

When committing and pushing changes:

1. Check repository state

Run:
git status

- Ensure there are changes to commit
- Identify modified, added, and deleted files
- If nothing to commit → stop and inform the user

---

2. Review changes before committing

Run:
git diff

- Understand what changed
- Group changes logically (do not commit unrelated changes together)

---

3. Stage changes intentionally

Preferred:
git add <specific files>

Avoid:
git add .

Only use `git add .` if all changes belong to the same logical commit.

---

4. Write a clean commit message

Use this format:

<type>: <short summary>

[optional body]

Types:

- feat: new feature
- fix: bug fix
- refactor: code restructuring without behavior change
- perf: performance improvement
- chore: maintenance / cleanup
- docs: documentation changes
- test: tests added/updated

Rules:

- Summary ≤ 72 characters
- Use imperative tense ("add", not "added")
- Be specific and meaningful

Example:

fix: correct dossier filtering by clientId

- replace JS filtering with SQL query
- add listByClientId in dossiers.service
- remove redundant in-memory filtering

---

5. Commit changes

Run:
git commit -m "<message>"

If the change is complex, include a body:

git commit

---

6. Push to current branch

Run:
git branch --show-current

Then:
git push origin <branch-name>

---

7. Handle push failures

If push is rejected:

- Run:
  git pull --rebase

- Resolve conflicts if any
- Then push again:
  git push origin <branch-name>

---

8. Final verification

Confirm:

- Commit is created
- Branch is up to date on remote

---

Important rules:

- Never commit unrelated changes together
- Never use vague messages like "update" or "fix stuff"
- Never force push unless explicitly asked
- Always ensure the commit represents a single logical change
