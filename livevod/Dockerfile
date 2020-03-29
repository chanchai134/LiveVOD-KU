FROM node:alpine

RUN apk add --no-cache tzdata
ENV TZ=Asia/Bangkok

WORKDIR /livevod-backend

COPY package*.json ./

RUN npm install

RUN mkdir uploads

COPY . .

EXPOSE 3032

CMD [ "node", "app.js" ]