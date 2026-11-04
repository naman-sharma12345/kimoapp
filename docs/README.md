# kimo documentation

## Start here

- [Project overview, Meta models and hackathon scope](../README.md)
- [Latest Windows download](https://github.com/naman-sharma12345/kimoapp/releases/latest)
- [Desktop usage and privacy](../desktop/README.md)
- [Three-minute real desktop demo guide](DEMO_SCRIPT.md) — recording pending
- [MIT License](../LICENSE) and [third-party notices](../desktop/THIRD_PARTY_NOTICES.md)

## Implementation and verification

- Muse Spark: [planner](../desktop/planner.mjs), [critic](../desktop/critic.mjs),
  [Meta API route](../apps/api/src/ai.ts)
- SAM 3.1: [tracking and effects](../desktop/sam.mjs),
  [Meta API route](../apps/api/src/sam.ts)
- [Creator pipeline](../desktop/creator-engine.mjs) and [compositor](../desktop/compose.mjs)
- [v0.5.0 installer qualification and source provenance](../desktop/distribution/ONLINE-0.5.0.md)
- [Measured benchmark results and limits](../desktop/test/bench/RESULTS.md)
- [Final benchmark summary](../desktop/test/bench/FINAL.md)

## Development and history

- [Design](DESIGN.md), [decisions](DECISIONS.md), [contracts](CONTRACTS.md)
- [Phase log and acceptance evidence](PHASE_LOG.md)
- [Historical frontend QA](QA.md) and [screens/recordings](screens/)
- [GitHub workflows](../.github/workflows/) — CI, deployment, release, and manual
  benchmark/data-collection workflows

The older mock logs and web recordings document frontend contract tests. They are
not live Meta inference evidence or the submission demo. Historical phase notes
and their linked artifacts are retained so measurements and limitations remain
auditable; the links above are the shorter path through the project.
