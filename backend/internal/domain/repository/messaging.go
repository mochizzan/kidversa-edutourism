package repository

import "context"

// MessagingService is the outbound messaging contract (WhatsApp, etc.).
// The consent-delivery flow depends on this abstraction, not on a concrete
// gateway, so the OpenWA adapter can be swapped without touching handlers.
type MessagingService interface {
	// SendTextMessage sends a plain-text message to the given chat ID.
	SendTextMessage(ctx context.Context, chatID, text string) error
}
