package app

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
)

func (a *App) wakeEmailCodes() {
	select {
	case a.EmailCodeWake <- struct{}{}:
	default:
	}
}

func (a *App) runEmailWorker(ctx context.Context, codesOnly bool) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()
	var wake <-chan struct{}
	if codesOnly {
		wake = a.EmailCodeWake
	}
	for {
		if ctx.Err() != nil {
			return
		}
		processed, err := a.runEmailBatch(ctx, 25, codesOnly)
		if err != nil && ctx.Err() == nil {
			slog.Error("email delivery batch failed", "codesOnly", codesOnly, "type", fmt.Sprintf("%T", err))
		}
		if err == nil && processed == 25 {
			continue
		}
		select {
		case <-ctx.Done():
			return
		case <-wake:
		case <-ticker.C:
		}
	}
}

// Authentication and ordinary email use separate workers (at most two concurrent
// SMTP submissions per API instance). Updates take precedence over reminders,
// with a reminder turn after four updates. Every job gets its own time budget.
func (a *App) runEmailBatch(ctx context.Context, limit int, codesOnly bool) (int, error) {
	if a.Mail == nil {
		return 0, nil
	}
	updates := 0
	for processed := 0; processed < limit; processed++ {
		if err := ctx.Err(); err != nil {
			return processed, err
		}
		work, cancel := context.WithTimeout(ctx, 12*time.Second)
		filter := bson.M{"kind": "email", "payload.event": "auth_code"}
		var found bool
		var err error
		if codesOnly {
			found, err = a.runOneJobMatching(work, filter)
		} else {
			reminderFirst := updates >= 4
			for _, reminder := range []bool{reminderFirst, !reminderFirst} {
				if reminder {
					filter["payload.event"] = "reminder"
				} else {
					filter["payload.event"] = bson.M{"$nin": []string{"auth_code", "reminder"}}
				}
				found, err = a.runOneJobMatching(work, filter)
				if found {
					if reminder {
						updates = 0
					} else {
						updates++
					}
				}
				if found || err != nil {
					break
				}
			}
		}
		cancel()
		if err != nil {
			return processed, err
		}
		if !found {
			return processed, nil
		}
	}
	return limit, nil
}
