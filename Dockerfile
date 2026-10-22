FROM node:22-alpine
WORKDIR /usr/src/app
ENV TZ=Europe/Stockholm
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
COPY static ./static
EXPOSE 80 443
CMD ["npm","start"]
