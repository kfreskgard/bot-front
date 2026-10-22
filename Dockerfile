ARG NODE_IMAGE=node:22-alpine@sha256:ce8d97f7cfc7c5386421eb932df20a29df99b1a7f469f6157d5c9956702ffadc

FROM ${NODE_IMAGE} AS build
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY scripts ./scripts
COPY shared ./shared
COPY web ./web
RUN npm run build:web

FROM ${NODE_IMAGE}
WORKDIR /usr/src/app
ENV TZ=Europe/Stockholm
COPY package*.json tsconfig.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY shared ./shared
COPY --from=build /usr/src/app/dist/web ./dist/web
EXPOSE 80 443
CMD ["npm", "start"]
