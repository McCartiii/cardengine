FROM node:22-alpine
WORKDIR /app

COPY package.json ./
RUN npm install

COPY prisma ./prisma
COPY src ./src
COPY tsconfig.json ./

RUN npm run build

EXPOSE 3001
CMD ["node", "dist/index.js"]
