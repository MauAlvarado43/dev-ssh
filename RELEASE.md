# Publishing a release

## Version scope

- `0.x.Y`: compatible fixes, documentation, refactors, and small improvements.
- `0.X.0`: visible functionality or meaningful workflow changes.
- `1.0.0`: the first stable public experience.

While Dev SSH remains on `0.x`, every meaningful behavior change must be explicit in the release notes.

## Checklist

1. Create a `feature/<topic>` branch from `main`.
2. Open a pull request into `main`; CI validates the change.
3. Move the `Unreleased` entries in `CHANGELOG.md` into a new version section.
4. Update `version` in `package.json`.
5. Merge the pull request.
6. The `Validate and release` workflow validates the project, packages `dist/dev-ssh-{version}.vsix`, creates or updates the `v{version}` GitHub release, and uses the matching changelog section as its notes.

The release workflow requires a matching `## [{version}]` section in `CHANGELOG.md`. It fails before publication when the version or release notes are missing.

## Release notes template

```md
## [0.2.0] - YYYY-MM-DD

### Added

-

### Changed

-

### Fixed

-

### Validation

- `pnpm run check`
```

## Marketplace preparation

Before publishing to Visual Studio Marketplace, confirm the publisher, repository, issue URL, homepage, license, and gallery metadata in `package.json`.
