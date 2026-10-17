FROM node:22@sha256:363e1587494626837fa7f9a23bdb453d13b0ff3c67c705c2805cfc69c2d2fad7 AS build
WORKDIR /build
COPY package.json package-lock.json tsconfig.json tsconfig.build.json ./
RUN npm ci --ignore-scripts
COPY src ./src
COPY scripts/copy-samples.mjs ./scripts/copy-samples.mjs
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22@sha256:363e1587494626837fa7f9a23bdb453d13b0ff3c67c705c2805cfc69c2d2fad7
WORKDIR /opt/tracegrove
COPY --from=build /build/package.json ./package.json
COPY --from=build /build/node_modules ./node_modules
COPY --from=build /build/dist ./dist
COPY --from=build /build/samples ./samples
COPY containers/run.mjs ./containers/run.mjs
COPY containers/contracts.mjs ./containers/contracts.mjs
USER node
ENTRYPOINT ["node", "/opt/tracegrove/containers/run.mjs"]
