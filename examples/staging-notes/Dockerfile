FROM node:22-alpine
WORKDIR /srv
COPY app/ ./app/
USER node
EXPOSE 8080
CMD ["node", "app/app.mjs"]
