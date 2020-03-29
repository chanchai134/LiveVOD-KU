FROM nginx

RUN rm /etc/nginx/nginx.conf

COPY nginx.conf /etc/nginx/nginx.conf

WORKDIR /www

COPY build .