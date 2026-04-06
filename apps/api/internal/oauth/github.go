package oauth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/github"

	"github.com/OhByron/PlanA/internal/config"
)

// GitHubUser is the user profile returned by the GitHub API after OAuth exchange.
type GitHubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

// GitHubProvider manages GitHub OAuth2 PKCE flows.
type GitHubProvider struct {
	cfg *oauth2.Config
}

// NewGitHubProvider constructs a GitHubProvider from application config.
func NewGitHubProvider(cfg *config.Config) *GitHubProvider {
	return &GitHubProvider{
		cfg: &oauth2.Config{
			ClientID:     cfg.GitHubClientID,
			ClientSecret: cfg.GitHubClientSecret,
			RedirectURL:  cfg.FrontendURL + "/api/auth/github/callback",
			Scopes:       []string{"read:user", "user:email"},
			Endpoint:     github.Endpoint,
		},
	}
}

// AuthURL returns the GitHub authorisation URL for the PKCE flow.
// state must be an unguessable random value stored in a short-lived cookie.
// codeChallenge is the S256 PKCE challenge derived from codeVerifier.
func (p *GitHubProvider) AuthURL(state, codeChallenge string) string {
	return p.cfg.AuthCodeURL(
		state,
		oauth2.AccessTypeOnline,
		oauth2.SetAuthURLParam("code_challenge", codeChallenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
	)
}

// Exchange trades the authorisation code for a token and fetches the GitHub user profile.
// codeVerifier is the original random value used to derive the PKCE challenge.
// If the user's email is private, falls back to the /user/emails endpoint.
func (p *GitHubProvider) Exchange(ctx context.Context, code, codeVerifier string) (*GitHubUser, error) {
	token, err := p.cfg.Exchange(ctx, code,
		oauth2.SetAuthURLParam("code_verifier", codeVerifier),
	)
	if err != nil {
		return nil, fmt.Errorf("exchanging github code: %w", err)
	}

	client := p.cfg.Client(ctx, token)
	user, err := fetchGitHubUser(ctx, client)
	if err != nil {
		return nil, err
	}

	// GitHub omits email if the user has set it to private. Try the /user/emails
	// endpoint, but don't fail if it's inaccessible (some OAuth apps don't get this scope).
	if user.Email == "" {
		email, err := fetchPrimaryGitHubEmail(ctx, client)
		if err != nil {
			// Fall back to noreply address: {id}+{login}@users.noreply.github.com
			slog.Warn("github email fallback", "error", err, "login", user.Login)
			user.Email = fmt.Sprintf("%d+%s@users.noreply.github.com", user.ID, user.Login)
		} else {
			user.Email = email
		}
	}

	return user, nil
}

// githubEmail is a single entry from the /user/emails response.
type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

// fetchPrimaryGitHubEmail calls /user/emails and returns the primary verified address.
func fetchPrimaryGitHubEmail(ctx context.Context, client *http.Client) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user/emails", nil)
	if err != nil {
		return "", fmt.Errorf("building github emails request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetching github emails: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("github emails API returned %d: %s", resp.StatusCode, body)
	}

	var emails []githubEmail
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", fmt.Errorf("decoding github emails: %w", err)
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	return "", fmt.Errorf("no primary verified email found on github account")
}

func fetchGitHubUser(ctx context.Context, client *http.Client) (*GitHubUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.github.com/user", nil)
	if err != nil {
		return nil, fmt.Errorf("building github user request: %w", err)
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetching github user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("github user API returned %d: %s", resp.StatusCode, body)
	}

	var u GitHubUser
	if err := json.NewDecoder(resp.Body).Decode(&u); err != nil {
		return nil, fmt.Errorf("decoding github user: %w", err)
	}
	return &u, nil
}
