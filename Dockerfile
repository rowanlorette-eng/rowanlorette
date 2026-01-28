FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o app

FROM alpine
WORKDIR /app
RUN apk add --no-cache ffmpeg ca-certificates
COPY --from=build /app/app .
COPY static ./static
EXPOSE 8080
CMD ["./app"]
