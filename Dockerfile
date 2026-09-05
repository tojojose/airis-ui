FROM node:22-alpine AS product-build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY app ./app
COPY public ./public
COPY next.config.ts postcss.config.mjs tsconfig.json ./

ARG NEXT_PUBLIC_TROMINOS_API_URL=https://api.trominos.com
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_TROMINOS_API_URL=${NEXT_PUBLIC_TROMINOS_API_URL}
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY}

RUN test -n "$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY" && npm run build

FROM node:22-alpine AS marketing-build

WORKDIR /marketing

COPY marketing/package.json marketing/package-lock.json ./
RUN npm ci

COPY marketing/app ./app
COPY marketing/public ./public
COPY marketing/next.config.ts marketing/tsconfig.json ./

RUN npm run build

FROM nginxinc/nginx-unprivileged:alpine

# --chmod is load-bearing, not tidiness. This base image runs nginx as UID 101,
# and COPY otherwise preserves the host file's mode. A 0600 nginx.conf on the
# build machine therefore produces an image where the nginx user cannot open its
# own config: the container exits with
#   [emerg] open() "/etc/nginx/conf.d/default.conf" failed (13: Permission denied)
# In ECS that is a task that never turns healthy, so deployment_circuit_breaker
# rolls back to the previous image and the service reports itself STABLE while
# silently serving the old build. Pinning the mode here makes the image immune
# to however the file happens to be permissioned on whoever's machine built it.
# The earlier build stages are unaffected because they run as root.
COPY --chmod=644 nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=product-build /app/out /usr/share/nginx/html
COPY --from=marketing-build /marketing/out /usr/share/nginx/html/marketing

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
