package handlers

import (
	"net/http"
	"os"
	"path/filepath"
	"runtime"
)

// DocsHandler serves the OpenAPI spec and Swagger UI.
type DocsHandler struct {
	specPath string
}

func NewDocsHandler() *DocsHandler {
	// Find the openapi.yaml relative to the binary or working directory
	candidates := []string{
		"openapi.yaml",
		"apps/api/openapi.yaml",
	}

	// Also try relative to this source file (for dev)
	_, filename, _, ok := runtime.Caller(0)
	if ok {
		dir := filepath.Dir(filepath.Dir(filename)) // go up from handlers/ to api/
		candidates = append(candidates, filepath.Join(dir, "..", "openapi.yaml"))
	}

	specPath := "openapi.yaml" // fallback
	for _, c := range candidates {
		if _, err := os.Stat(c); err == nil {
			specPath = c
			break
		}
	}

	return &DocsHandler{specPath: specPath}
}

// Spec serves the raw OpenAPI YAML file.
func (h *DocsHandler) Spec(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/x-yaml")
	w.Header().Set("Access-Control-Allow-Origin", "*")
	http.ServeFile(w, r, h.specPath)
}

// UI serves a Swagger UI HTML page that loads the spec from /api/docs/openapi.yaml.
func (h *DocsHandler) UI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Write([]byte(swaggerHTML))
}

const swaggerHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>PlanA API Documentation</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css">
  <style>
    body { margin: 0; padding: 0; }
    .topbar { display: none; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/docs/openapi.yaml',
      dom_id: '#swagger-ui',
      deepLinking: true,
      presets: [SwaggerUIBundle.presets.apis],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`
