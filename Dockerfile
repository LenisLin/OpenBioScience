FROM oven/bun:1.3.14 AS builder

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl tar unzip xz-utils \
    && rm -rf /var/lib/apt/lists/*

COPY package.json bun.lock ./
COPY patches ./patches
COPY packages ./packages
RUN bun install --frozen-lockfile --ignore-scripts

COPY . .
RUN bun run package
RUN if [ ! -x resources/bundled-deeporganiser-core/linux-x64/deeporganiser-core.real ] \
      || [ ! -d resources/bundled-deeporganiser-core/linux-x64/managed-resources ]; then \
      node scripts/prepareDeepOrganiserCore.js; \
      cp resources/bundled-deeporganiser-core/linux-x64/deeporganiser-core \
        resources/bundled-deeporganiser-core/linux-x64/deeporganiser-core.real; \
    fi

FROM oven/bun:1.3.14 AS runtime

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      bubblewrap \
      ca-certificates \
      curl \
      file \
      fontconfig \
      fonts-dejavu-core \
      git \
      libicu-dev \
      procps \
      ripgrep \
      tar \
      zstd \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/out ./out
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/resources/bio ./resources/bio
COPY --from=builder /app/resources/skills ./resources/skills
COPY --from=builder /app/scripts/webui.ts ./scripts/webui.ts
COPY --from=builder /app/scripts/bootstrap-official-environment.ts ./scripts/bootstrap-official-environment.ts
COPY --from=builder /app/resources/bundled-deeporganiser-core/linux-x64/deeporganiser-core.real /opt/deeporganiser/deeporganiser-core.real
COPY --from=builder /app/resources/bundled-deeporganiser-core/linux-x64/managed-resources /opt/deeporganiser/managed-resources

RUN chmod +x /opt/deeporganiser/deeporganiser-core.real \
    && printf '%s\n' \
      '#!/usr/bin/env bash' \
      'set -euo pipefail' \
      'REAL_BIN="/opt/deeporganiser/deeporganiser-core.real"' \
      'export DEEPORGANISER_BUNDLED_MANAGED_RESOURCES="${DEEPORGANISER_BUNDLED_MANAGED_RESOURCES:-/opt/deeporganiser/managed-resources}"' \
      'has_managed_resources_mode=0' \
      'for arg in "$@"; do' \
      '  if [ "$arg" = "--managed-resources-mode" ]; then' \
      '    has_managed_resources_mode=1' \
      '    break' \
      '  fi' \
      'done' \
      'if [ "$has_managed_resources_mode" = "1" ]; then' \
      '  exec "$REAL_BIN" "$@"' \
      'fi' \
      'exec "$REAL_BIN" --managed-resources-mode bundled "$@"' \
      > /opt/deeporganiser/deeporganiser-core \
    && chmod +x /opt/deeporganiser/deeporganiser-core

ENV NODE_ENV=production \
    DEEPORGANISER_ALLOW_REMOTE=true \
    DEEPORGANISER_CORE_BIN=/opt/deeporganiser/deeporganiser-core \
    DEEPORGANISER_DATA_DIR=/data \
    DEEPORGANISER_LOG_DIR=/data/logs \
    DEEPORGANISER_NO_BUILD=1 \
    DEEPORGANISER_OPEN_BROWSER=0 \
    DEEPORGANISER_PORT=25808 \
    DEEPORGANISER_STATIC_DIR=/app/out/renderer \
    FONTCONFIG_FILE=/etc/fonts/fonts.conf \
    FONTCONFIG_PATH=/etc/fonts \
    OPENBIOSCIENCE_ENV_ROOT=/opt/openbioscience/env \
    OPENBIOSCIENCE_BIO_RESOURCE_ROOT=/app/resources/bio \
    OPENBIOSCIENCE_GENE_SET_ROOT=/app/resources/bio/gene_sets \
    OPENBIOSCIENCE_MARKER_ROOT=/app/resources/bio/markers \
    OPENBIOSCIENCE_MSIGDB_ROOT=/app/resources/bio/gene_sets/msigdb \
    OPENBIOSCIENCE_SKILL_ROOTS=/app/resources/skills \
    OPENBIOSCIENCE_WORKSPACE_ROOT=/workspace/openbioscience \
    OPENSCIENCE_BIO_TOOLS_PYTHON=/opt/openbioscience/env/environments/official/sc-py-singlecell/bin/python \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH=/opt/openbioscience/env/environments/official/sc-py-singlecell/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

VOLUME ["/data", "/opt/openbioscience/env", "/workspace/openbioscience"]
EXPOSE 25808

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD bun -e "fetch('http://127.0.0.1:25808/api/auth/status').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["bun", "scripts/webui.ts", "--no-build", "--no-open", "--remote", "--port", "25808"]
