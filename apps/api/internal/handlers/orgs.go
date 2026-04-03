package handlers

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"

	"github.com/OhByron/ProjectA/internal/auth"
)

// OrgHandlers handles CRUD for organisations.
type OrgHandlers struct {
	db DBPOOL
}

func NewOrgHandlers(db DBPOOL) *OrgHandlers { return &OrgHandlers{db: db} }

// orgColumns is the canonical column list for RETURNING clauses (no table alias).
const orgColumns = `id, name, slug, contact_name, contact_email, contact_phone,
	address_line1, address_line2, city, state, postal_code, country,
	archived_at, created_at, updated_at`

// orgColumnsAliased is the same list prefixed with "o." for JOINed queries.
const orgColumnsAliased = `o.id, o.name, o.slug, o.contact_name, o.contact_email, o.contact_phone,
	o.address_line1, o.address_line2, o.city, o.state, o.postal_code, o.country,
	o.archived_at, o.created_at, o.updated_at`

type orgResponse struct {
	ID           string     `json:"id"`
	Name         string     `json:"name"`
	Slug         string     `json:"slug"`
	ContactName  *string    `json:"contact_name"`
	ContactEmail *string    `json:"contact_email"`
	ContactPhone *string    `json:"contact_phone"`
	AddressLine1 *string    `json:"address_line1"`
	AddressLine2 *string    `json:"address_line2"`
	City         *string    `json:"city"`
	State        *string    `json:"state"`
	PostalCode   *string    `json:"postal_code"`
	Country      *string    `json:"country"`
	ArchivedAt   *time.Time `json:"archived_at"`
	CreatedAt    time.Time  `json:"created_at"`
	UpdatedAt    time.Time  `json:"updated_at"`
}

func (o *orgResponse) scanFields() []any {
	return []any{
		&o.ID, &o.Name, &o.Slug, &o.ContactName, &o.ContactEmail, &o.ContactPhone,
		&o.AddressLine1, &o.AddressLine2, &o.City, &o.State, &o.PostalCode, &o.Country,
		&o.ArchivedAt, &o.CreatedAt, &o.UpdatedAt,
	}
}

type createOrgRequest struct {
	Name         string  `json:"name"`
	ContactName  *string `json:"contact_name"`
	ContactEmail *string `json:"contact_email"`
	ContactPhone *string `json:"contact_phone"`
	AddressLine1 *string `json:"address_line1"`
	AddressLine2 *string `json:"address_line2"`
	City         *string `json:"city"`
	State        *string `json:"state"`
	PostalCode   *string `json:"postal_code"`
	Country      *string `json:"country"`
}

type updateOrgRequest struct {
	Name         *string `json:"name"`
	Slug         *string `json:"slug"`
	ContactName  *string `json:"contact_name"`
	ContactEmail *string `json:"contact_email"`
	ContactPhone *string `json:"contact_phone"`
	AddressLine1 *string `json:"address_line1"`
	AddressLine2 *string `json:"address_line2"`
	City         *string `json:"city"`
	State        *string `json:"state"`
	PostalCode   *string `json:"postal_code"`
	Country      *string `json:"country"`
}

// List returns all organisations the authenticated user is a member of.
// By default excludes archived orgs; pass ?include_archived=true to include them.
func (h *OrgHandlers) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid authentication")
		return
	}

	pp := parsePagination(r)

	includeArchived := r.URL.Query().Get("include_archived") == "true"
	fromWhere := `FROM organizations o
		   JOIN organization_members om ON om.organization_id = o.id
		  WHERE om.user_id = $1`
	if !includeArchived {
		fromWhere += " AND o.archived_at IS NULL"
	}

	// Count total matching rows.
	var total int
	err := h.db.QueryRow(r.Context(), "SELECT COUNT(*) "+fromWhere, claims.UserID).Scan(&total)
	if err != nil {
		slog.Error("orgs.List: count query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list organizations")
		return
	}

	query := fmt.Sprintf("SELECT %s %s ORDER BY o.name LIMIT $2 OFFSET $3", orgColumnsAliased, fromWhere)

	rows, err := h.db.Query(r.Context(), query, claims.UserID, pp.PageSize, pp.Offset)
	if err != nil {
		slog.Error("orgs.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list organizations")
		return
	}
	defer rows.Close()

	orgs := make([]orgResponse, 0)
	for rows.Next() {
		var o orgResponse
		if err := rows.Scan(o.scanFields()...); err != nil {
			slog.Error("orgs.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to list organizations")
			return
		}
		orgs = append(orgs, o)
	}
	if err := rows.Err(); err != nil {
		slog.Error("orgs.List: rows iteration failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list organizations")
		return
	}

	writeJSON(w, http.StatusOK, paginatedResponse{Items: orgs, Total: total, Page: pp.Page, PageSize: pp.PageSize})
}

// Create creates a new organisation and adds the creator as an admin member.
func (h *OrgHandlers) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid authentication")
		return
	}

	var req createOrgRequest
	if !readJSON(w, r, &req) {
		return
	}
	if req.Name == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "Name is required")
		return
	}

	slug := slugify(req.Name)

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		slog.Error("orgs.Create: begin tx failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create organization")
		return
	}
	defer tx.Rollback(r.Context())

	var org orgResponse
	err = tx.QueryRow(r.Context(),
		fmt.Sprintf(`INSERT INTO organizations (name, slug, contact_name, contact_email, contact_phone,
			address_line1, address_line2, city, state, postal_code, country)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		 RETURNING %s`, orgColumns),
		req.Name, slug, req.ContactName, req.ContactEmail, req.ContactPhone,
		req.AddressLine1, req.AddressLine2, req.City, req.State, req.PostalCode, req.Country,
	).Scan(org.scanFields()...)
	if err != nil {
		slog.Error("orgs.Create: insert org failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create organization")
		return
	}

	_, err = tx.Exec(r.Context(),
		`INSERT INTO organization_members (organization_id, user_id, role) VALUES ($1, $2, 'admin')`,
		org.ID, claims.UserID)
	if err != nil {
		slog.Error("orgs.Create: insert member failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create organization")
		return
	}

	if err := tx.Commit(r.Context()); err != nil {
		slog.Error("orgs.Create: commit failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to create organization")
		return
	}

	writeJSON(w, http.StatusCreated, org)
}

// Get returns a single organisation by ID, verifying the user is a member.
func (h *OrgHandlers) Get(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid authentication")
		return
	}

	orgID := chi.URLParam(r, "orgID")

	var org orgResponse
	err := h.db.QueryRow(r.Context(),
		fmt.Sprintf(`SELECT %s
		   FROM organizations o
		   JOIN organization_members om ON om.organization_id = o.id
		  WHERE o.id = $1 AND om.user_id = $2`, orgColumnsAliased),
		orgID, claims.UserID).Scan(org.scanFields()...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Organization not found")
			return
		}
		slog.Error("orgs.Get: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to get organization")
		return
	}

	writeJSON(w, http.StatusOK, org)
}

// Update patches an organisation. Only admin members may update.
func (h *OrgHandlers) Update(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid authentication")
		return
	}

	orgID := chi.URLParam(r, "orgID")

	var role string
	err := h.db.QueryRow(r.Context(),
		`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
		orgID, claims.UserID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Organization not found")
			return
		}
		slog.Error("orgs.Update: membership check failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update organization")
		return
	}
	if role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "Only admins can update the organization")
		return
	}

	var req updateOrgRequest
	if !readJSON(w, r, &req) {
		return
	}

	fields := []string{}
	args := []any{}
	argN := 1

	if req.Name != nil {
		fields = append(fields, fmt.Sprintf("name = $%d", argN))
		args = append(args, *req.Name)
		argN++
		fields = append(fields, fmt.Sprintf("slug = $%d", argN))
		args = append(args, slugify(*req.Name))
		argN++
	}
	if req.Slug != nil {
		fields = append(fields, fmt.Sprintf("slug = $%d", argN))
		args = append(args, *req.Slug)
		argN++
	}
	for _, f := range []struct {
		name string
		val  *string
	}{
		{"contact_name", req.ContactName},
		{"contact_email", req.ContactEmail},
		{"contact_phone", req.ContactPhone},
		{"address_line1", req.AddressLine1},
		{"address_line2", req.AddressLine2},
		{"city", req.City},
		{"state", req.State},
		{"postal_code", req.PostalCode},
		{"country", req.Country},
	} {
		if f.val != nil {
			fields = append(fields, fmt.Sprintf("%s = $%d", f.name, argN))
			args = append(args, *f.val)
			argN++
		}
	}

	if len(fields) == 0 {
		writeError(w, http.StatusBadRequest, "validation_error", "No fields to update")
		return
	}

	fields = append(fields, "updated_at = NOW()")
	args = append(args, orgID)

	query := fmt.Sprintf(
		`UPDATE organizations SET %s WHERE id = $%d RETURNING %s`,
		strings.Join(fields, ", "), argN, orgColumns)

	var org orgResponse
	err = h.db.QueryRow(r.Context(), query, args...).Scan(org.scanFields()...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Organization not found")
			return
		}
		slog.Error("orgs.Update: update failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to update organization")
		return
	}

	writeJSON(w, http.StatusOK, org)
}

// Archive soft-deletes an organisation by setting archived_at. Admin only.
func (h *OrgHandlers) Archive(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid authentication")
		return
	}

	orgID := chi.URLParam(r, "orgID")

	var role string
	err := h.db.QueryRow(r.Context(),
		`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
		orgID, claims.UserID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Organization not found")
			return
		}
		slog.Error("orgs.Archive: membership check failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to archive organization")
		return
	}
	if role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "Only admins can archive the organization")
		return
	}

	var org orgResponse
	err = h.db.QueryRow(r.Context(),
		fmt.Sprintf(`UPDATE organizations SET archived_at = NOW(), updated_at = NOW()
		 WHERE id = $1 AND archived_at IS NULL
		 RETURNING %s`, orgColumns),
		orgID).Scan(org.scanFields()...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Organization not found or already archived")
			return
		}
		slog.Error("orgs.Archive: update failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to archive organization")
		return
	}

	// Cascade: archive all projects under this org's teams
	if _, err := h.db.Exec(r.Context(),
		`UPDATE projects SET archived_at = NOW(), updated_at = NOW()
		 WHERE team_id IN (SELECT id FROM teams WHERE organization_id = $1)
		   AND archived_at IS NULL`,
		orgID); err != nil {
		slog.Error("orgs.Archive: cascade to projects failed", "error", err)
	}

	writeJSON(w, http.StatusOK, org)
}

// Unarchive restores a previously archived organisation. Admin only.
func (h *OrgHandlers) Unarchive(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid authentication")
		return
	}

	orgID := chi.URLParam(r, "orgID")

	var role string
	err := h.db.QueryRow(r.Context(),
		`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
		orgID, claims.UserID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Organization not found")
			return
		}
		slog.Error("orgs.Unarchive: membership check failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to unarchive organization")
		return
	}
	if role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "Only admins can unarchive the organization")
		return
	}

	var org orgResponse
	err = h.db.QueryRow(r.Context(),
		fmt.Sprintf(`UPDATE organizations SET archived_at = NULL, updated_at = NOW()
		 WHERE id = $1 AND archived_at IS NOT NULL
		 RETURNING %s`, orgColumns),
		orgID).Scan(org.scanFields()...)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Organization not found or not archived")
			return
		}
		slog.Error("orgs.Unarchive: update failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to unarchive organization")
		return
	}

	// Cascade: unarchive all projects under this org's teams
	if _, err := h.db.Exec(r.Context(),
		`UPDATE projects SET archived_at = NULL, updated_at = NOW()
		 WHERE team_id IN (SELECT id FROM teams WHERE organization_id = $1)
		   AND archived_at IS NOT NULL`,
		orgID); err != nil {
		slog.Error("orgs.Unarchive: cascade to projects failed", "error", err)
	}

	writeJSON(w, http.StatusOK, org)
}

// Delete removes an organisation permanently. Only admin members may delete.
func (h *OrgHandlers) Delete(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Missing or invalid authentication")
		return
	}

	orgID := chi.URLParam(r, "orgID")

	var role string
	err := h.db.QueryRow(r.Context(),
		`SELECT role FROM organization_members WHERE organization_id = $1 AND user_id = $2`,
		orgID, claims.UserID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeError(w, http.StatusNotFound, "not_found", "Organization not found")
			return
		}
		slog.Error("orgs.Delete: membership check failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete organization")
		return
	}
	if role != "admin" {
		writeError(w, http.StatusForbidden, "forbidden", "Only admins can delete the organization")
		return
	}

	_, err = h.db.Exec(r.Context(), `DELETE FROM organizations WHERE id = $1`, orgID)
	if err != nil {
		slog.Error("orgs.Delete: delete failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to delete organization")
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
