FROM node:22.23.5-alpine3.23 AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run licenses && npm run build

FROM nginx:1.30.7-alpine3.24 AS runtime
COPY nginx-runtime.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
USER nginx
EXPOSE 3000
ENTRYPOINT ["nginx"]
CMD ["-g", "daemon off;"]
