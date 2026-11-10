# ---- Stage 1: build the React app ----
FROM node:22-alpine AS build
WORKDIR /build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: runtime (no npm dependencies needed: server/ uses only Node built-ins) ----
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app
COPY --from=build /build/dist ./dist
COPY --from=build /build/server ./server
COPY package.json ./

# OpenShift runs containers with an arbitrary non-root UID that is always in group 0.
# Give group 0 the same permissions as the owner so any UID can read the app files.
RUN chgrp -R 0 /app && chmod -R g=u /app

USER 1001
EXPOSE 8080
CMD ["node", "server/index.js"]
