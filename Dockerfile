FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

RUN mkdir -p auth_info_baileys && chown -R node:node /app

USER node

EXPOSE 7860

CMD ["npm", "start"]
