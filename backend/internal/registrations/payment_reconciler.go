package registrations

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

type PaymentReconciler struct {
	service  *Service
	log      *slog.Logger
	workerID string
	interval time.Duration
}

func NewPaymentReconciler(service *Service, log *slog.Logger, interval time.Duration) *PaymentReconciler {
	return &PaymentReconciler{service: service, log: log, workerID: uuid.NewString(), interval: interval}
}

func (r *PaymentReconciler) Run(ctx context.Context) {
	r.reconcile(ctx)
	ticker := time.NewTicker(r.interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.reconcile(ctx)
		}
	}
}

func (r *PaymentReconciler) reconcile(ctx context.Context) {
	if err := r.service.ReconcilePendingPayments(ctx, r.workerID, 25); err != nil && ctx.Err() == nil {
		r.log.Error("payment_reconciliation_failed", "error", err)
	}
}
