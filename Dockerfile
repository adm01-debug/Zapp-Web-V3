# syntax=docker/dockerfile:1.7
# Portado do harness de produção do zapp-web (v1) para o v3.

FROM oven/bun:1.3-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM deps AS builder
WORKDIR /app
COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
# VITE_SUPABASE_PUBLISHABLE_KEY is read by externalProxy.ts as the apikey header
# for edge function calls. Falls back to VITE_SUPABASE_ANON_KEY if not provided
# (they are often the same key under different names in Lovable vs self-hosted).
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_EXTERNAL_SUPABASE_URL
ARG VITE_EXTERNAL_SUPABASE_ANON_KEY
ARG VITE_ZAPPWEB_SUPABASE_URL
ARG VITE_ZAPPWEB_SUPABASE_ANON_KEY
ARG VITE_SENTRY_DSN
ARG VITE_SENTRY_ENVIRONMENT=production
ARG VITE_APP_ENV=production

ENV VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
ENV VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
# Smart fallback: use ANON_KEY when PUBLISHABLE_KEY is not explicitly passed.
ENV VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY:-${VITE_SUPABASE_ANON_KEY}}
ENV VITE_EXTERNAL_SUPABASE_URL=${VITE_EXTERNAL_SUPABASE_URL}
ENV VITE_EXTERNAL_SUPABASE_ANON_KEY=${VITE_EXTERNAL_SUPABASE_ANON_KEY}
ENV VITE_ZAPPWEB_SUPABASE_URL=${VITE_ZAPPWEB_SUPABASE_URL}
ENV VITE_ZAPPWEB_SUPABASE_ANON_KEY=${VITE_ZAPPWEB_SUPABASE_ANON_KEY}
ENV VITE_SENTRY_DSN=${VITE_SENTRY_DSN}
ENV VITE_SENTRY_ENVIRONMENT=${VITE_SENTRY_ENVIRONMENT}
ENV VITE_APP_ENV=${VITE_APP_ENV}

# build direto pelo Vite (determinístico em CI/Docker; component-registry já versionado)
RUN bunx vite build

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -q -O - http://127.0.0.1/healthz >/dev/null || exit 1
CMD ["nginx", "-g", "daemon off;"]
