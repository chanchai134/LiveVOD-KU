FROM node:alpine

RUN apk add --no-cache tzdata ffmpeg
ENV TZ=Asia/Bangkok

WORKDIR /nms
RUN npm install node-media-server@2.1.4 mongoose
RUN rm /nms/node_modules/node-media-server/node_trans_session.js
RUN mkdir M

COPY . .

RUN mv /nms/node_trans_session.js /nms/node_modules/node-media-server/

EXPOSE 1935
EXPOSE 3033

CMD [ "node", "app.js" ]