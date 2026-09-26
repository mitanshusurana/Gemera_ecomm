FROM gradle:8.5-jdk21-alpine AS build
WORKDIR /app
COPY build.gradle settings.gradle ./
RUN gradle dependencies --no-daemon || true
COPY . .
# The test suite is database-free (H2 under the "test" profile, mocked
# services, no network), so the image build is the CI gate: a red test
# stops the image from being published.
RUN gradle test bootJar --no-daemon

# JRE, not JDK: the runtime needs no compiler or dev tooling.
FROM eclipse-temurin:21-jre-alpine
RUN apk add --no-cache ffmpeg imagemagick curl
WORKDIR /app
COPY --from=build /app/build/libs/*.jar app.jar

# Run unprivileged. ffmpeg and imagemagick are invoked on user-supplied bytes,
# so an exploit there was previously root in-container.
RUN addgroup -S -g 10001 app && adduser -S -u 10001 -G app app     && chown -R app:app /app
USER app

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3     CMD curl -fsS http://127.0.0.1:8080/actuator/health || exit 1

ENTRYPOINT ["java", "-jar", "app.jar"]
