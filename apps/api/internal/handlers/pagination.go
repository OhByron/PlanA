package handlers

import (
	"net/http"
	"strconv"
)

const (
	defaultPageSize = 50
	maxPageSize     = 200
)

type pageParams struct {
	Page     int
	PageSize int
	Offset   int
}

// parsePagination extracts page and page_size from query params.
// Returns sensible defaults if not provided. page is 1-indexed.
func parsePagination(r *http.Request) pageParams {
	page := 1
	pageSize := defaultPageSize

	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}

	if v := r.URL.Query().Get("page_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			pageSize = n
			if pageSize > maxPageSize {
				pageSize = maxPageSize
			}
		}
	}

	return pageParams{
		Page:     page,
		PageSize: pageSize,
		Offset:   (page - 1) * pageSize,
	}
}

type paginatedResponse struct {
	Items    any `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
}
