package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"

	"github.com/OhByron/PlanA/internal/config"
)

// GoogleUser is the user profile returned by the Google userinfo endpoint.
type GoogleUser struct {
	ID        string `json:"sub"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"picture"`
}

// GoogleProvider manages Google OAuth2 PKCE flows.
type GoogleProvider struct {
	cfg *oauth2.Config
}

// NewGoogleProvider constructs a GoogleProvider from application config.
func NewGoogleProvider(cfg *config.Config) *GoogleProvider {
	return &GoogleProvider{
		cfg: &oauth2.Config{
			ClientID:     cfg.GoogleClientID,
			ClientSecret: cfg.GoogleClientSecret,
			RedirectURL:  cfg.FrontendURL + "/api/auth/google/callback",
			Scopes:       []string{"openid", "email", "profile"},
			Endpoint:     google.Endpoint,
		},
	}
}

// AuthURL returns the Google authorisation URL for the PKCE flow.
func (p *GoogleProvider) AuthURL(state, codeChallenge string) string {
	return p.cfg.AuthCodeURL(
		state,
		oauth2.AccessTypeOnline,
		oauth2.SetAuthURLParam("code_challenge", codeChallenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)
}

// Exchange trades the authorisation code for a token and fetches the Google user profile.
func (p *GoogleProvider) Exchange(ctx context.Context, code, codeVerifier string) (*GoogleUser, error) {
	token, err := p.cfg.Exchange(ctx, code,
		oauth2.SetAuthURLParam("code_verifier", codeVerifier),
	)
	if err != nil {
		return nil, fmt.Errorf("exchanging google code: %w", err)
	}

	client := p.cfg.Client(ctx, token)
	user, err := fetchGoogleUser(ctx, client)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func fetchGoogleUser(ctx context.Context, client *http.Client) (*GoogleUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil)
	if err != nil {
		return nil, fmt.Errorf("building google userinfo request: %w", err)
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching google userinfo: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("google userinfo API returned %d: %s", resp.StatusCode, body)
	}

	var u GoogleUser
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, fmt.Errorf("decoding google userinfo: %w", err)
	}
	return &u, nil
}
