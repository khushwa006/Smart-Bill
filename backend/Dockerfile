# Build context MUST be the repository root:  docker build -f backend/Dockerfile -t smartbill-backend .
# (Render: set "Dockerfile Path" = backend/Dockerfile and leave the root directory empty.)
# STATUS: written but NOT built/tested by the author (no Docker in the authoring environment).

# --- Stage 1: compile + test the C++ engine on Ubuntu 22.04 (same glibc as the runtime image below)
FROM ubuntu:22.04 AS native
RUN apt-get update && apt-get install -y --no-install-recommends g++ cmake make && rm -rf /var/lib/apt/lists/*
COPY native-engine /src
RUN cmake -S /src -B /build -DCMAKE_BUILD_TYPE=Release \
 && cmake --build /build \
 && ctest --test-dir /build --output-on-failure

# --- Stage 2: build the Spring Boot jar (migrations are pulled in from ../database/migrations)
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY backend backend
COPY database database
WORKDIR /app/backend
RUN mvn -B -q -DskipTests package

# --- Stage 3: runtime
FROM eclipse-temurin:17-jre-jammy
RUN useradd --system --uid 1001 smartbill
COPY --from=native /build/schedule-engine /opt/smartbill/schedule-engine
COPY --from=build /app/backend/target/smartbill-backend-0.1.0.jar /app/app.jar
ENV NATIVE_ENGINE_PATH=/opt/smartbill/schedule-engine
USER smartbill
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "/app/app.jar"]
