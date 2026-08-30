package eventautomations

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrValidation = errors.New("invalid event automation")

type repository interface {
	List(context.Context, uuid.UUID) ([]Automation, error)
	Create(context.Context, *Automation) error
	Update(context.Context, uuid.UUID, uuid.UUID, string, string, *time.Time, Status) (*Automation, error)
	Cancel(context.Context, uuid.UUID, uuid.UUID) error
}
type Service struct{ repo repository }

func NewService(repo repository) *Service { return &Service{repo: repo} }

func validate(req UpsertRequest) (string, string, Status, error) {
	name, message := strings.TrimSpace(req.Name), strings.TrimSpace(req.Message)
	if len(name) < 2 || len(name) > 120 {
		return "", "", "", fmt.Errorf("%w: name must be between 2 and 120 characters", ErrValidation)
	}
	if len(message) < 2 || len(message) > 1000 {
		return "", "", "", fmt.Errorf("%w: message must be between 2 and 1000 characters", ErrValidation)
	}
	status := StatusDraft
	if req.SendAt != nil {
		if req.SendAt.Before(time.Now().Add(-time.Minute)) {
			return "", "", "", fmt.Errorf("%w: send_at must be in the future", ErrValidation)
		}
		status = StatusScheduled
	}
	return name, message, status, nil
}
func (s *Service) List(ctx context.Context, eventID uuid.UUID) ([]Automation, error) {
	return s.repo.List(ctx, eventID)
}
func (s *Service) Create(ctx context.Context, eventID, actorID uuid.UUID, req UpsertRequest) (*Automation, error) {
	name, message, status, err := validate(req)
	if err != nil {
		return nil, err
	}
	a := &Automation{EventID: eventID, Name: name, Message: message, SendAt: req.SendAt, Status: status, CreatedBy: &actorID}
	if err := s.repo.Create(ctx, a); err != nil {
		return nil, err
	}
	return a, nil
}
func (s *Service) Update(ctx context.Context, eventID, id uuid.UUID, req UpsertRequest) (*Automation, error) {
	name, message, status, err := validate(req)
	if err != nil {
		return nil, err
	}
	return s.repo.Update(ctx, eventID, id, name, message, req.SendAt, status)
}
func (s *Service) Cancel(ctx context.Context, eventID, id uuid.UUID) error {
	return s.repo.Cancel(ctx, eventID, id)
}
