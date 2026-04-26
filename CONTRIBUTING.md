# Contributing

Thanks for your interest. This project follows a lightweight **gitflow**
model with conventional commits.

## Branching model (gitflow)

| Branch             | Purpose                                              | Lifetime    |
| ------------------ | ---------------------------------------------------- | ----------- |
| `main`             | Production-ready. Tagged releases live here.         | Permanent   |
| `develop`          | Integration branch for the next release.             | Permanent   |
| `feature/<slug>`   | New features. Branch from `develop`, PR into `develop`. | Short-lived |
| `fix/<slug>`       | Non-urgent bug fixes. Same flow as features.         | Short-lived |
| `release/<x.y.z>`  | Stabilize a release. Branch from `develop`, merge to both `main` and `develop`. Tag from `main`. | Short-lived |
| `hotfix/<slug>`    | Urgent prod fix. Branch from `main`, merge to both `main` and `develop`. | Short-lived |

### Typical feature flow
```bash
git checkout develop && git pull
git checkout -b feature/citations-ui
# ...commits...
git push -u origin feature/citations-ui
gh pr create --base develop --title "feat(web): render citations as cards"
```

### Release flow
```bash
git checkout develop && git pull
git checkout -b release/0.2.0
# bump versions, finalize CHANGELOG, last-mile fixes
git checkout main && git merge --no-ff release/0.2.0
git tag -a v0.2.0 -m "v0.2.0"
git checkout develop && git merge --no-ff release/0.2.0
git push --all && git push --tags
```

### Hotfix flow
```bash
git checkout main && git pull
git checkout -b hotfix/embed-dim-crash
# fix + bump patch version
git checkout main && git merge --no-ff hotfix/embed-dim-crash && git tag v0.2.1
git checkout develop && git merge --no-ff hotfix/embed-dim-crash
```

## Commit messages — Conventional Commits

```
<type>(<scope>): <subject>

[optional body]
[optional footer(s)]
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`.
Common scopes: `web`, `agent`, `rag`, `db`, `shared`, `infra`, `ci`.

Examples:
- `feat(agent): add fetch_doc tool`
- `fix(rag): clamp chunk overlap to chunk size`
- `chore(infra): bump pgvector image to pg16`

## Pull request checklist

- [ ] Branched from `develop` (or `main` for hotfixes)
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (when tests exist)
- [ ] Updated relevant `spec/` doc if behavior or contract changed
- [ ] Added a migration if schema changed (`pnpm --filter @app/db generate`)
- [ ] Manual smoke test described in PR body

## Local dev

See `README.md` § Quickstart. Copy `.env.example` to `.env`, run
`pnpm stack:up`, `pnpm ollama:pull`, `pnpm db:migrate`, then `pnpm dev`.

## Code style

- Prettier (`pnpm format`) — run before pushing.
- ESLint flat config at the root; per-package overrides allowed.
- TypeScript strict mode is non-negotiable; prefer `unknown` over `any`.
- Validate every external boundary with zod (HTTP bodies, env, tool inputs).

## Reporting issues

Use the issue template under `.github/ISSUE_TEMPLATE`. Include:
- What you ran, what you expected, what happened.
- Versions: Node, pnpm, Docker, OS.
- Relevant logs (`pnpm stack:logs`).
