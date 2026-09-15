package realtime

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/redis/go-redis/v9"

	"github.com/unity-run-club/api/internal/siteconfig"
)

const SiteConfigChannel = "unity:realtime:site-config"

// EventsChannel and RegistrationsChannel carry coarse "something changed, go
// refetch" signals rather than the changed row itself -- unlike site config
// (intentionally public data, broadcast in full), an event can be a
// not-yet-public DRAFT and a registration always carries another user's PII.
// The public socket carries no event, registration, or user identifiers.
const EventsChannel = "unity:realtime:events"
const RegistrationsChannel = "unity:realtime:registrations"

type Publisher struct {
	redis *redis.Client
	log   *slog.Logger
}

func NewPublisher(redisClient *redis.Client, log *slog.Logger) *Publisher {
	return &Publisher{redis: redisClient, log: log}
}

func (p *Publisher) PublishSiteConfig(ctx context.Context, settings siteconfig.Settings) {
	payload, err := json.Marshal(settings)
	if err != nil {
		p.log.Error("realtime_site_config_encode_failed", "error", err)
		return
	}
	if err := p.redis.Publish(ctx, SiteConfigChannel, payload).Err(); err != nil {
		p.log.Warn("realtime_site_config_publish_failed", "error", err)
	}
}

// PublishEventsChanged tells connected clients the public events list may
// have changed (created, updated, deleted, or a status transition) so they
// refetch instead of waiting out their own cache staleness window. No event
// data is carried -- a DRAFT event isn't public, so the payload stays empty
// and clients just re-run their existing, already-scoped GET.
func (p *Publisher) PublishEventsChanged(ctx context.Context) {
	if err := p.redis.Publish(ctx, EventsChannel, []byte("{}")).Err(); err != nil {
		p.log.Warn("realtime_events_publish_failed", "error", err)
	}
}

// Clients refetch through the authenticated API; public notifications carry no identity.
func (p *Publisher) PublishRegistrationsChanged(ctx context.Context) {
	if err := p.redis.Publish(ctx, RegistrationsChannel, []byte("{}")).Err(); err != nil {
		p.log.Warn("realtime_registrations_publish_failed", "error", err)
	}
}
