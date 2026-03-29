export const config = {
  port: parseInt(process.env['PORT'] ?? '3001', 10),
  openaiApiKey: process.env['OPENAI_API_KEY'] ?? '',
  apiUrl: process.env['API_URL'] ?? 'http://localhost:8080',
  environment: process.env['NODE_ENV'] ?? 'development',
} as const;
