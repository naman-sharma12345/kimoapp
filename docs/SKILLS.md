# Codex craft and review skills

All requested source repositories were fetched and their discovered skills installed into the current user's `~/.codex/skills/` using the official Codex skill installer. They become automatically discoverable on the next Codex turn. The four Phase 0 skills were also read explicitly during implementation. The design bible always wins over generic visual advice.

| Requested skill / source                                                                             | Installed name(s)                                                  | Purpose                                                                     | Phases |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- | ------ |
| frontend-design ([source](https://github.com/anthropics/skills))                                     | frontend-design                                                    | Intentional implementation within the fixed design                          | 0–9    |
| taste-skill ([source](https://github.com/Leonxlnx/taste-skill))                                      | design-taste-frontend                                              | Screen taste review without changing tokens                                 | 1–9    |
| impeccable ([source](https://github.com/pbakaus/impeccable))                                         | impeccable                                                         | Spacing, alignment and detail review                                        | 1–9    |
| emil kowalski skills ([source](https://github.com/emilkowalski/skills))                              | emil-design-eng, animate, review-animations, animation-performance | Interaction and motion polish; upstream includes additional platform skills | 1–9    |
| design motion principles ([source](https://github.com/kylezantos/design-motion-principles))          | design-motion-principles                                           | Motion timing review                                                        | 0–9    |
| motion.dev animations ([source](https://github.com/199-biotechnologies/motion-dev-animations-skill)) | motion-dev-animations                                              | Correct motion/react presets                                                | 0–9    |
| web design guidelines ([source](https://github.com/vercel-labs/agent-skills))                        | web-design-guidelines                                              | UI and accessibility review                                                 | 0–9    |
| react best practices ([source](https://github.com/vercel-labs/agent-skills))                         | vercel-react-best-practices                                        | Renders, bundles and waterfalls                                             | 0–9    |
| composition patterns ([source](https://github.com/vercel-labs/agent-skills))                         | vercel-composition-patterns                                        | Component APIs                                                              | 1, 5–8 |
| react view transitions ([source](https://github.com/vercel-labs/agent-skills))                       | vercel-react-view-transitions                                      | Route transitions                                                           | 4, 9   |
| tailwind design system ([source](https://github.com/wshobson/agents))                                | tailwind-design-system                                             | CSS-first token setup                                                       | 0–1    |
| design system patterns ([source](https://github.com/wshobson/agents))                                | design-system-patterns                                             | Token hierarchy and library structure                                       | 0–1    |
| accessibility compliance ([source](https://github.com/wshobson/agents))                              | accessibility-compliance                                           | WCAG 2.2 AA review                                                          | 0–9    |
| kill ai slop ([source](https://github.com/yetone/kill-ai-slop))                                      | kill-ai-slop                                                       | Final writing and generic-design review                                     | 1–9    |
| webapp testing ([source](https://github.com/anthropics/skills))                                      | webapp-testing                                                     | Playwright behavior and screenshot checks                                   | 0–9    |
| agent browser ([source](https://github.com/vercel-labs/agent-browser))                               | agent-browser                                                      | Visual browser review; upstream ships extra platform helpers                | 0–9    |
| webgpu skill ([source](https://github.com/dgreenheck/webgpu-claude-skill))                           | webgpu-threejs-tsl                                                 | WebGPU concepts only; Three.js remains forbidden by our stack               | 6      |

## Installation evidence

`skill-installation.json` records every upstream path, actual skill name and any installer errors. Repeated entries for impeccable are upstream agent-specific copies; only the first installation is needed for each unique name. No installation error was returned. Files are installed in the user skill directory, not vendored into this repository.

## Phase 0 use

Read frontend-design, tailwind-design-system, design-system-patterns and vercel-react-best-practices. Applied CSS-first aliases, exact fixed visual values, server-rendered static specimens, and a small client-only replay island. No optional design directions, alternative dependencies or agent delegation from those skills overrides the supplied phase scope.
