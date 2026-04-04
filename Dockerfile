# ---------- build ----------
FROM golang:1.25 AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o app

# ---------- runtime ----------
# Используем NVIDIA CUDA базовый образ
FROM nvidia/cuda:12.2.0-runtime-ubuntu22.04

# Устанавливаем ffmpeg с NVENC/CUDA поддержкой и зависимости
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        ca-certificates \
        && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /app/app .
COPY static ./static

EXPOSE 8089
CMD ["./app"]