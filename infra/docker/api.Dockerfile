# Build stage
FROM golang:1.26-alpine AS builder

RUN apk add --no-cache git

WORKDIR /app

COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api/ .

RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /bin/api ./cmd/server

# Runtime
FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget
COPY --from=builder /bin/api /api

EXPOSE 8080
ENTRYPOINT ["/api"]
