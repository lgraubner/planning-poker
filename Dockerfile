# The build stages run natively and cross-compile, so arm64 needs no emulation.
FROM --platform=$BUILDPLATFORM node:24-bookworm-slim AS frontend
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.27-bookworm AS backend
ARG TARGETOS TARGETARCH
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY --from=frontend /app/internal/webui/dist/ internal/webui/dist/
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH go build -trimpath -ldflags="-s -w" -o /server ./cmd/server
# Distroless has no shell; a volume mounted here inherits the nonroot owner.
RUN mkdir /data

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=backend /server /server
COPY --from=backend --chown=nonroot:nonroot /data /data
EXPOSE 8080
ENTRYPOINT ["/server"]
