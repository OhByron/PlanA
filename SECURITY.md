# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main branch | Yes |
| Released tags | Yes |
| Older than 6 months | No |

## Reporting a Vulnerability

If you discover a security vulnerability in PlanA, please report it responsibly. Do not open a public GitHub issue.

**Email:** security@bignell.com

Include:
- Description of the vulnerability
- Steps to reproduce
- Impact assessment (what an attacker could do)
- Any suggested fix (optional)

## Response Timeline

- **Acknowledgment:** Within 48 hours of report
- **Initial assessment:** Within 5 business days
- **Fix and disclosure:** Within 30 days for critical issues, 90 days for others

We will credit reporters in the release notes unless they request anonymity.

## Security Practices

### Authentication
- Session tokens are JWTs signed with HMAC-SHA256 (minimum 32-character secret)
- OAuth 2.0 with PKCE flow for GitHub and Google login
- Password hashing with bcrypt (default cost)
- Session tokens expire after 7 days

### Data Protection
- VCS repository access tokens encrypted at rest with AES-256-GCM
- Encryption key required in production (fail-fast on startup if missing)
- API keys masked in API responses (only first/last 4 characters shown)
- Database credentials never exposed to the frontend

### API Security
- All SQL queries use parameterized statements (no string interpolation)
- Input validation on all endpoints
- Request body sanitization middleware
- Rate limiting on authentication endpoints
- CORS restricted to configured allowed origins in production
- WebSocket origin validation against allowed origins

### Webhook Security
- Inbound VCS webhooks validated with HMAC-SHA256 (GitHub) or token header (GitLab)
- Outbound webhooks signed with HMAC-SHA256 per-webhook secret
- Webhook secrets generated with crypto/rand (32 bytes, hex-encoded)

### Infrastructure
- Production requires HTTPS (Caddy with automatic Let's Encrypt)
- Redis password required in production
- PostgreSQL credentials required (no default fallback in production)
- Docker containers run with minimal privileges
- Database ports bound to localhost only in production

### Access Control
- Project-scoped access checks on all protected endpoints
- Org admin role required for workflow state and webhook management
- PM/PO role required for VCS connection management
- Share tokens for read-only stakeholder access (revocable, expirable)

## Dependencies

Automated dependency updates via Dependabot (weekly for packages, monthly for Docker images). Security advisories trigger immediate review.

## Disclosure Policy

We follow coordinated disclosure. Once a fix is available, we will:
1. Release a patched version
2. Publish a security advisory on GitHub
3. Credit the reporter (with permission)
4. Describe the vulnerability and its impact

## Scope

The following are in scope for security reports:
- Authentication and authorization bypass
- SQL injection, XSS, CSRF
- Server-side request forgery (SSRF)
- Sensitive data exposure
- Privilege escalation
- Webhook signature bypass

The following are out of scope:
- Denial of service (unless trivially exploitable)
- Social engineering
- Issues in dependencies (report upstream)
- Self-hosted misconfiguration (document best practices instead)
