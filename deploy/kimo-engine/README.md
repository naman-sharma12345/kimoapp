---
title: kimo engine
emoji: 🎬
colorFrom: gray
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
---

The kimo v6 engine (kimo-mcp) behind an authenticated HTTP bridge for app.getkimo.tech.
Only the kimo-api Worker can call it (X-Engine-Token). Clips live in /tmp for one job and
are deleted when the result has been downloaded, or after 30 minutes. Nothing is logged
about media.
