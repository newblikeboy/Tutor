package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	"tutorplatform/internal/app"
	"tutorplatform/internal/config"
	"tutorplatform/internal/storage"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	c, e := config.Load()
	if e != nil {
		slog.Error(e.Error())
		os.Exit(1)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	s, e := storage.Connect(ctx, c.URI, c.Database)
	cancel()
	if e != nil {
		slog.Error("database connection failed; check private configuration")
		os.Exit(1)
	}
	defer s.Client.Disconnect(context.Background())
	srv := &http.Server{Addr: c.Addr, Handler: app.New(s, c).Routes(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)
	go func() {
		slog.Info("API listening", "address", c.Addr, "environment", c.Env)
		if e := srv.ListenAndServe(); e != nil && e != http.ErrServerClosed {
			slog.Error("HTTP server failed")
			os.Exit(1)
		}
	}()
	<-done
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
