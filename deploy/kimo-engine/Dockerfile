# kimo engine: the real kimo v6 (naman-sharma12345/kimo, branch v6-all, read-only)
# behind a small authenticated HTTP bridge, for a private Hugging Face Space.
FROM rust:1-bookworm AS engine
ARG KIMO_REF=v6-all
RUN git clone --depth 1 --branch "$KIMO_REF" https://github.com/naman-sharma12345/kimo /src
WORKDIR /src
RUN cargo build --profile gate -p kimo-mcp && cp target/gate/kimo-mcp /kimo-mcp && cargo clean
RUN bash fonts/fetch.sh && mkdir -p /fonts && cp fonts/*.ttf fonts/*.otf /fonts/ 2>/dev/null || true
RUN apt-get update && apt-get install -y --no-install-recommends cmake && rm -rf /var/lib/apt/lists/* \
 && KIMO_MODELS=/models JOBS=4 bash tools/whisper/fetch.sh

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg nodejs ca-certificates libgomp1 \
 && rm -rf /var/lib/apt/lists/*
COPY --from=engine /kimo-mcp /usr/local/bin/kimo-mcp
COPY --from=engine /fonts /usr/local/share/kimo/fonts
COPY --from=engine /models /usr/local/share/kimo/models
COPY server.mjs /app/server.mjs
ENV KIMO_FONTS=/usr/local/share/kimo/fonts \
    KIMO_MODELS=/usr/local/share/kimo/models \
    KIMO_WHISPER_BIN=/usr/local/share/kimo/models/bin/whisper-cli \
    KIMO_SPECTATOR=off \
    KIMO_TOOLS=director \
    PORT=7860
RUN useradd -m -u 1000 user
USER user
EXPOSE 7860
CMD ["node", "/app/server.mjs"]
