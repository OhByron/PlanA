# Build stage
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Fetch dependencies first (layer cache)
COPY apps/api/go.mod apps/api/go.sum ./
RUN go mod download

COPY apps/api/ .

# Build a fully static binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /bin/api ./cmd/server

# Runtime — minimal scratch image
FROM scratch

COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=builder /bin/api /api

EXPOSE 8080
ENTRYPOINT ["/api"]
