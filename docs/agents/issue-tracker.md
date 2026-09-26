# Issue tracker: GitHub

Issues and specs live as GitHub issues. Use the `gh` CLI from this
repository; infer the repository from its Git remote.

## Conventions

- Create: `gh issue create --title "..." --body-file issue.md`
- Read: `gh issue view <number> --comments`
- Inspect structured details: `gh issue view <number> --json number,title,body,labels,comments`
- List: `gh issue list --state open --json number,title,labels`
- Comment: `gh issue comment <number> --body-file comment.md`
- Apply/remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- Close: `gh issue close <number>`

Write multiline bodies to a file and pass it with `--body-file`.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Skill terminology

- “Publish to the issue tracker”: create a GitHub issue.
- “Fetch the relevant ticket”: read the issue, its labels, and comments.
