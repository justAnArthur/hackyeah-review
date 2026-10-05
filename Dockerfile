FROM oven/bun:1

# pdftotext reads pdf decks, unzip reads pptx and docx; tar unpacks repo tarballs
RUN apt-get update \
  && apt-get install -y --no-install-recommends poppler-utils unzip ca-certificates tar \
  && rm -rf /var/lib/apt/lists/*

# the claude CLI is a council member: the glm-5.3 models come through z.ai's anthropic
# endpoint, which the coding plan only allows inside its coding tools. CLAUDE_API_KEY
# (or ZAI_API_KEY) is injected as the CLI's login at spawn time
RUN bun add -g @anthropic-ai/claude-code
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .
RUN bun run build

ENV NODE_ENV=production DATA_DIR=/data PORT=3000 TRUST_PROXY=1
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD bun -e "fetch('http://localhost:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "app/server/index.ts"]
