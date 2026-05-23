FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src/ ./src/

# Директория для персистентного state.json
VOLUME ["/data"]

EXPOSE 3000

CMD ["node", "src/index.js"]
