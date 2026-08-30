package notifications

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/unity-run-club/api/internal/email"
)

type telegramDeliveryRepository interface {
	GetByID(context.Context, uuid.UUID) (*Notification, error)
	ClaimTelegramDeliveries(context.Context, int) ([]Delivery, error)
	MarkDeliverySent(context.Context, uuid.UUID, time.Time) error
	MarkDeliverySkipped(context.Context, uuid.UUID) error
	RecordDeliveryFailure(context.Context, uuid.UUID, string, int) error
}

type telegramDeliverySender interface {
	SendNotification(context.Context, uuid.UUID, string, email.TemplateData) (bool, error)
}

// TelegramWorker drains the durable Telegram outbox independently from email delivery.
type TelegramWorker struct {
	repo         telegramDeliveryRepository
	regs         registrationGetter
	evts         eventGetter
	sender       telegramDeliverySender
	log          *slog.Logger
	pollInterval time.Duration
	maxAttempts  int
	publicAppURL string
}

func NewTelegramWorker(repo telegramDeliveryRepository, regs registrationGetter, evts eventGetter,
	sender telegramDeliverySender, log *slog.Logger, pollInterval time.Duration, maxAttempts int, publicAppURL string) *TelegramWorker {
	if pollInterval <= 0 {
		pollInterval = 5 * time.Second
	}
	return &TelegramWorker{repo: repo, regs: regs, evts: evts, sender: sender, log: log,
		pollInterval: pollInterval, maxAttempts: maxAttempts, publicAppURL: publicAppURL}
}

func (w *TelegramWorker) Run(ctx context.Context) {
	w.sweep(ctx)
	ticker := time.NewTicker(w.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			w.sweep(ctx)
		}
	}
}

func (w *TelegramWorker) sweep(ctx context.Context) {
	for {
		deliveries, err := w.repo.ClaimTelegramDeliveries(ctx, 100)
		if err != nil {
			if ctx.Err() == nil {
				w.log.Error("telegram_delivery_claim_failed", "error", err)
			}
			return
		}
		if len(deliveries) == 0 {
			return
		}
		for i := range deliveries {
			w.process(ctx, &deliveries[i])
		}
		if len(deliveries) < 100 {
			return
		}
	}
}

func (w *TelegramWorker) process(ctx context.Context, delivery *Delivery) {
	notification, err := w.repo.GetByID(ctx, delivery.NotificationID)
	if err != nil {
		w.fail(ctx, delivery.ID, fmt.Errorf("load notification: %w", err))
		return
	}
	if notification.UserID == nil {
		if err := w.repo.MarkDeliverySkipped(ctx, delivery.ID); err != nil {
			w.log.Error("telegram_delivery_skip_failed", "delivery_id", delivery.ID, "error", err)
		}
		return
	}
	data, _, err := buildTemplateData(ctx, notification, w.regs, w.evts, w.publicAppURL)
	if err != nil {
		w.fail(ctx, delivery.ID, fmt.Errorf("build Telegram data: %w", err))
		return
	}
	delivered, err := w.sender.SendNotification(ctx, *notification.UserID, string(notification.Type), data)
	if err != nil {
		w.fail(ctx, delivery.ID, err)
		return
	}
	if !delivered {
		if err := w.repo.MarkDeliverySkipped(ctx, delivery.ID); err != nil {
			w.log.Error("telegram_delivery_skip_failed", "delivery_id", delivery.ID, "error", err)
		}
		return
	}
	if err := w.repo.MarkDeliverySent(ctx, delivery.ID, time.Now()); err != nil {
		w.log.Error("telegram_delivery_mark_sent_failed", "delivery_id", delivery.ID, "error", err)
	}
}

func (w *TelegramWorker) fail(ctx context.Context, deliveryID uuid.UUID, sendErr error) {
	w.log.Warn("telegram_delivery_failed", "delivery_id", deliveryID, "error", sendErr)
	if err := w.repo.RecordDeliveryFailure(ctx, deliveryID, sendErr.Error(), w.maxAttempts); err != nil {
		w.log.Error("telegram_delivery_record_failure_failed", "delivery_id", deliveryID, "error", err)
	}
}
