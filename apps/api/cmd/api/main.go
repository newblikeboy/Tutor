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
	if e := config.LoadDevelopmentEnv(); e != nil {
		slog.Error(e.Error())
		os.Exit(1)
	}
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
	application := app.New(s, c)
	if e = application.ConfigureMedia(); e != nil {
		slog.Error("Private storage could not be initialised; check directory permissions and configuration")
		os.Exit(1)
	}
	jobsContext, stopJobs := context.WithCancel(context.Background())
	defer stopJobs()
	go application.RunJobs(jobsContext)
	srv := &http.Server{Addr: c.Addr, Handler: application.Routes(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second}
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
	stopJobs()
	ctx, cancel = context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
}
