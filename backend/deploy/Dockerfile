# 웹 백엔드 이미지(api·worker 공용). 빌드 컨텍스트는 backend/. 비밀 값은 넣지 않고 실행할 때 환경변수로 받는다.
FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY gradlew settings.gradle build.gradle ./
COPY gradle gradle
RUN chmod +x gradlew && ./gradlew --no-daemon -q dependencies > /dev/null
COPY src src
# 테스트는 CI가 돌린다. VM(1코어)에서는 jar만 만든다.
RUN ./gradlew --no-daemon bootJar -x test

FROM eclipse-temurin:21-jre
RUN useradd --system --uid 10001 app
WORKDIR /app
COPY --from=build /src/build/libs/web.jar web.jar
USER app
ENV JAVA_OPTS=""
EXPOSE 8080
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar web.jar"]
