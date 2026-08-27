package realtime

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/redis/go-redis/v9"

	"github.com/unity-run-club/api/internal/siteconfig"
)

const SiteConfigChannel = "unity:realtime:site-config"

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
