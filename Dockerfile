FROM node:20.20.0-alpine3.23
WORKDIR /app
COPY package.json ./
RUN npm install --production --no-optional --legacy-peer-deps && npm cache clean --force
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
