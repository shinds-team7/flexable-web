# 웹 화면(사이트 + /m 시연) 정적 파일을 nginx로 서비스하고 /api를 웹 백엔드로 넘긴다. 빌드 컨텍스트는 저장소 루트.
FROM node:22-bookworm-slim AS build
WORKDIR /src
COPY package.json package-lock.json ./
COPY mobile-demo/package.json mobile-demo/package-lock.json mobile-demo/
RUN npm ci && npm --prefix mobile-demo ci
COPY . .
# VITE_API_URL을 비워 같은 출처의 /api/v1을 부른다.
ENV VITE_API_URL=
# 개인정보처리방침·소개에 적는 웹 주소(예: https://<웹 도메인>). 비우면 접속한 주소를 쓴다
ARG VITE_SITE_URL=
ENV VITE_SITE_URL=$VITE_SITE_URL
RUN npm run build

FROM nginx:1.27-alpine
COPY deploy/ec2/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
