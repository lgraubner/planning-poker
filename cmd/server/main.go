package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/larsgraubner/planning-poker/internal/httpserver"
	"github.com/larsgraubner/planning-poker/internal/room"
	"github.com/larsgraubner/planning-poker/internal/webui"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	n, err := strconv.Atoi(port)
	if err != nil || n < 1 || n > 65535 {
		slog.Error("PORT must be between 1 and 65535")
		os.Exit(1)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	store := room.New()
	server := &http.Server{Addr: ":" + port, Handler: httpserver.New(ctx, store, webui.Files(), os.Getenv("CLIENT_IP_HEADER")), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 15 * time.Second, WriteTimeout: 15 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 8192}
	go func() {
		tick := time.NewTicker(time.Second)
		defer tick.Stop()
		seconds := 0
		for {
			select {
			case <-ctx.Done():
				return
			case <-tick.C:
				seconds++
				store.Sweep(seconds%60 == 0)
			}
		}
	}()
	shutdownDone := make(chan struct{})
	go func() {
		<-ctx.Done()
		defer close(shutdownDone)
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("shutdown timed out")
		}
	}()
	slog.Info("server started", "port", n)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		slog.Error("server failed to listen")
		os.Exit(1)
	}
	<-shutdownDone
	slog.Info("server stopped")
}
