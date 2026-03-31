package handlers

import (
	"crypto/rand"
	"encoding/xml"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

// TestResultHandlers handles test result ingestion and querying.
type TestResultHandlers struct {
	db DBPOOL
}

func NewTestResultHandlers(db DBPOOL) *TestResultHandlers {
	return &TestResultHandlers{db: db}
}

// ---------- JUnit XML structs ----------

type junitTestSuites struct {
	XMLName    xml.Name         `xml:"testsuites"`
	TestSuites []junitTestSuite `xml:"testsuite"`
}

type junitTestSuite struct {
	Name      string          `xml:"name,attr"`
	Tests     int             `xml:"tests,attr"`
	Failures  int             `xml:"failures,attr"`
	Errors    int             `xml:"errors,attr"`
	Time      float64         `xml:"time,attr"`
	TestCases []junitTestCase `xml:"testcase"`
}

type junitTestCase struct {
	Name      string        `xml:"name,attr"`
	ClassName string        `xml:"classname,attr"`
	Time      float64       `xml:"time,attr"`
	Failure   *junitFailure `xml:"failure"`
	Error     *junitError   `xml:"error"`
	Skipped   *struct{}     `xml:"skipped"`
}

type junitFailure struct {
	Message string `xml:"message,attr"`
	Body    string `xml:",chardata"`
}

type junitError struct {
	Message string `xml:"message,attr"`
	Body    string `xml:",chardata"`
}

// ---------- Regex for item number extraction ----------

var itemNumberRe = regexp.MustCompile(`(?:#(\d+)|([A-Z][A-Z0-9]+-(\d+)))`)

// extractItemNumber tries to find a work-item item_number from a test name.
// Returns the number and true if found.
func extractItemNumber(testName string) (int, bool) {
	m := itemNumberRe.FindStringSubmatch(testName)
	if m == nil {
		return 0, false
	}
	// Group 1: #(\d+)
	if m[1] != "" {
		n, err := strconv.Atoi(m[1])
		if err == nil {
			return n, true
		}
	}
	// Group 3: the digits after SLUG-
	if m[3] != "" {
		n, err := strconv.Atoi(m[3])
		if err == nil {
			return n, true
		}
	}
	return 0, false
}

// newUUID generates a v4 UUID string without external dependencies.
func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x",
		b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// lookupWorkItemID resolves an item_number to a work_item UUID for the given project.
func (h *TestResultHandlers) lookupWorkItemID(r *http.Request, projectID string, itemNumber int) *string {
	var id string
	err := h.db.QueryRow(r.Context(),
		`SELECT id FROM work_items WHERE project_id = $1 AND item_number = $2`,
		projectID, itemNumber,
	).Scan(&id)
	if err != nil {
		return nil
	}
	return &id
}

// ---------- Method 1: JUnit XML Import ----------

type importSummary struct {
	RunID   string `json:"run_id"`
	Total   int    `json:"total"`
	Passed  int    `json:"passed"`
	Failed  int    `json:"failed"`
	Errors  int    `json:"errors"`
	Skipped int    `json:"skipped"`
	Linked  int    `json:"linked"`
}

func (h *TestResultHandlers) ImportJUnit(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	// Read XML body — either raw XML or multipart file upload.
	var xmlData []byte
	ct := r.Header.Get("Content-Type")
	if strings.HasPrefix(ct, "multipart/") {
		file, _, err := r.FormFile("file")
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_body", "Expected a file field in multipart form")
			return
		}
		defer file.Close()
		xmlData, err = io.ReadAll(io.LimitReader(file, 10<<20)) // 10 MB limit
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_body", "Failed to read uploaded file")
			return
		}
	} else {
		var err error
		xmlData, err = io.ReadAll(io.LimitReader(r.Body, 10<<20))
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_body", "Failed to read request body")
			return
		}
	}

	// Parse JUnit XML. Try <testsuites> wrapper first, then bare <testsuite>.
	var suites []junitTestSuite

	var wrapper junitTestSuites
	if err := xml.Unmarshal(xmlData, &wrapper); err == nil && len(wrapper.TestSuites) > 0 {
		suites = wrapper.TestSuites
	} else {
		var single junitTestSuite
		if err := xml.Unmarshal(xmlData, &single); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_xml", "Failed to parse JUnit XML")
			return
		}
		suites = []junitTestSuite{single}
	}

	runID := newUUID()
	summary := importSummary{RunID: runID}

	for _, suite := range suites {
		for _, tc := range suite.TestCases {
			status := "pass"
			var errMsg *string

			if tc.Failure != nil {
				status = "fail"
				msg := tc.Failure.Message
				if msg == "" {
					msg = tc.Failure.Body
				}
				errMsg = &msg
			} else if tc.Error != nil {
				status = "error"
				msg := tc.Error.Message
				if msg == "" {
					msg = tc.Error.Body
				}
				errMsg = &msg
			} else if tc.Skipped != nil {
				status = "skip"
			}

			// Duration: JUnit time is in seconds as a float.
			var durationMs *int
			if tc.Time > 0 {
				d := int(math.Round(tc.Time * 1000))
				durationMs = &d
			}

			// Try to link to a work item.
			var workItemID *string
			itemNum, found := extractItemNumber(tc.Name)
			if found {
				workItemID = h.lookupWorkItemID(r, projectID, itemNum)
			}

			suiteName := suite.Name

			_, err := h.db.Exec(r.Context(),
				`INSERT INTO test_results
					(project_id, work_item_id, test_name, status, duration_ms, error_message, source, suite_name, run_id, reported_at)
				 VALUES ($1, $2, $3, $4, $5, $6, 'junit', $7, $8, NOW())`,
				projectID, workItemID, tc.Name, status, durationMs, errMsg, suiteName, runID,
			)
			if err != nil {
				slog.Error("test_results.ImportJUnit: insert failed", "error", err, "test", tc.Name)
				writeError(w, http.StatusInternalServerError, "db_error", "Failed to insert test result")
				return
			}

			summary.Total++
			switch status {
			case "pass":
				summary.Passed++
			case "fail":
				summary.Failed++
			case "error":
				summary.Errors++
			case "skip":
				summary.Skipped++
			}
			if workItemID != nil {
				summary.Linked++
			}
		}
	}

	writeJSON(w, http.StatusCreated, summary)
}

// ---------- Method 2: Webhook ----------

type webhookRequest struct {
	TestName     string  `json:"test_name"`
	Status       string  `json:"status"`
	DurationMs   *int    `json:"duration_ms"`
	ErrorMessage *string `json:"error_message"`
	Source       string  `json:"source"`
	SuiteName    *string `json:"suite_name"`
	WorkItemID   *string `json:"work_item_id"`
	ItemNumber   *int    `json:"item_number"`
}

func (h *TestResultHandlers) Webhook(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	var body webhookRequest
	if !readJSON(w, r, &body) {
		return
	}

	if body.TestName == "" {
		writeError(w, http.StatusBadRequest, "validation_error", "test_name is required")
		return
	}
	validStatuses := map[string]bool{"pass": true, "fail": true, "error": true, "skip": true}
	if !validStatuses[body.Status] {
		writeError(w, http.StatusBadRequest, "validation_error", "status must be one of: pass, fail, error, skip")
		return
	}

	source := body.Source
	if source == "" {
		source = "webhook"
	}

	// Resolve work item linkage.
	workItemID := body.WorkItemID
	if workItemID == nil && body.ItemNumber != nil {
		workItemID = h.lookupWorkItemID(r, projectID, *body.ItemNumber)
	}
	if workItemID == nil {
		if itemNum, found := extractItemNumber(body.TestName); found {
			workItemID = h.lookupWorkItemID(r, projectID, itemNum)
		}
	}

	var id string
	err := h.db.QueryRow(r.Context(),
		`INSERT INTO test_results
			(project_id, work_item_id, test_name, status, duration_ms, error_message, source, suite_name, reported_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
		 RETURNING id`,
		projectID, workItemID, body.TestName, body.Status, body.DurationMs, body.ErrorMessage, source, body.SuiteName,
	).Scan(&id)
	if err != nil {
		slog.Error("test_results.Webhook: insert failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to insert test result")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

// ---------- Method 3: List ----------

type testResultRow struct {
	ID           string     `json:"id"`
	ProjectID    string     `json:"project_id"`
	WorkItemID   *string    `json:"work_item_id"`
	TestName     string     `json:"test_name"`
	Status       string     `json:"status"`
	DurationMs   *int       `json:"duration_ms"`
	ErrorMessage *string    `json:"error_message"`
	Source       string     `json:"source"`
	SuiteName    *string    `json:"suite_name"`
	RunID        *string    `json:"run_id"`
	ReportedAt   time.Time  `json:"reported_at"`
	CreatedAt    time.Time  `json:"created_at"`
}

func (h *TestResultHandlers) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	if projectID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "projectID is required")
		return
	}

	pp := parsePagination(r)

	where := "WHERE project_id = $1"
	args := []any{projectID}
	argN := 2

	if v := r.URL.Query().Get("work_item_id"); v != "" {
		where += fmt.Sprintf(" AND work_item_id = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("run_id"); v != "" {
		where += fmt.Sprintf(" AND run_id = $%d", argN)
		args = append(args, v)
		argN++
	}
	if v := r.URL.Query().Get("status"); v != "" {
		where += fmt.Sprintf(" AND status = $%d", argN)
		args = append(args, v)
		argN++
	}

	var total int
	err := h.db.QueryRow(r.Context(),
		"SELECT COUNT(*) FROM test_results "+where, args...,
	).Scan(&total)
	if err != nil {
		slog.Error("test_results.List: count failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list test results")
		return
	}

	query := fmt.Sprintf(
		`SELECT id, project_id, work_item_id, test_name, status, duration_ms,
			error_message, source, suite_name, run_id, reported_at, created_at
		 FROM test_results %s
		 ORDER BY reported_at DESC
		 LIMIT $%d OFFSET $%d`, where, argN, argN+1)
	args = append(args, pp.PageSize, pp.Offset)

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		slog.Error("test_results.List: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list test results")
		return
	}
	defer rows.Close()

	items := []testResultRow{}
	for rows.Next() {
		var tr testResultRow
		if err := rows.Scan(
			&tr.ID, &tr.ProjectID, &tr.WorkItemID, &tr.TestName, &tr.Status, &tr.DurationMs,
			&tr.ErrorMessage, &tr.Source, &tr.SuiteName, &tr.RunID, &tr.ReportedAt, &tr.CreatedAt,
		); err != nil {
			slog.Error("test_results.List: scan failed", "error", err)
			writeError(w, http.StatusInternalServerError, "db_error", "Failed to read test result row")
			return
		}
		items = append(items, tr)
	}
	if err := rows.Err(); err != nil {
		slog.Error("test_results.List: rows error", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to list test results")
		return
	}

	writeJSON(w, http.StatusOK, paginatedResponse{Items: items, Total: total, Page: pp.Page, PageSize: pp.PageSize})
}

// ---------- Method 4: Get single test result by ID ----------

// Get returns a single test result by its ID.
func (h *TestResultHandlers) Get(w http.ResponseWriter, r *http.Request) {
	resultID := chi.URLParam(r, "resultID")
	if resultID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "resultID is required")
		return
	}

	var tr testResultRow
	err := h.db.QueryRow(r.Context(),
		`SELECT id, project_id, work_item_id, test_name, status, duration_ms,
			error_message, source, suite_name, run_id, reported_at, created_at
		 FROM test_results WHERE id = $1`, resultID,
	).Scan(
		&tr.ID, &tr.ProjectID, &tr.WorkItemID, &tr.TestName, &tr.Status, &tr.DurationMs,
		&tr.ErrorMessage, &tr.Source, &tr.SuiteName, &tr.RunID, &tr.ReportedAt, &tr.CreatedAt,
	)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeError(w, http.StatusNotFound, "not_found", "Test result not found")
			return
		}
		slog.Error("test_results.Get: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to get test result")
		return
	}

	writeJSON(w, http.StatusOK, tr)
}

// ---------- Method 5: Summary per work item ----------

type testSummary struct {
	Total   int        `json:"total"`
	Pass    int        `json:"pass"`
	Fail    int        `json:"fail"`
	Error   int        `json:"error"`
	Skip    int        `json:"skip"`
	LastRun *time.Time `json:"last_run"`
	Status  string     `json:"status"`
}

func (h *TestResultHandlers) Summary(w http.ResponseWriter, r *http.Request) {
	workItemID := chi.URLParam(r, "workItemID")
	if workItemID == "" {
		writeError(w, http.StatusBadRequest, "missing_param", "workItemID is required")
		return
	}

	// Verify work item exists.
	var exists bool
	err := h.db.QueryRow(r.Context(),
		`SELECT EXISTS(SELECT 1 FROM work_items WHERE id = $1)`, workItemID,
	).Scan(&exists)
	if err != nil || !exists {
		if err != nil {
			slog.Error("test_results.Summary: existence check failed", "error", err)
		}
		if !exists {
			writeError(w, http.StatusNotFound, "not_found", "Work item not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to check work item")
		return
	}

	var s testSummary
	err = h.db.QueryRow(r.Context(),
		`SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE status = 'pass'),
			COUNT(*) FILTER (WHERE status = 'fail'),
			COUNT(*) FILTER (WHERE status = 'error'),
			COUNT(*) FILTER (WHERE status = 'skip'),
			MAX(reported_at)
		 FROM test_results
		 WHERE work_item_id = $1`, workItemID,
	).Scan(&s.Total, &s.Pass, &s.Fail, &s.Error, &s.Skip, &s.LastRun)
	if err != nil {
		if err == pgx.ErrNoRows {
			writeJSON(w, http.StatusOK, testSummary{Status: "pass"})
			return
		}
		slog.Error("test_results.Summary: query failed", "error", err)
		writeError(w, http.StatusInternalServerError, "db_error", "Failed to get test summary")
		return
	}

	// Determine worst status.
	if s.Fail > 0 {
		s.Status = "fail"
	} else if s.Error > 0 {
		s.Status = "error"
	} else {
		s.Status = "pass"
	}

	writeJSON(w, http.StatusOK, s)
}
