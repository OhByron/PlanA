import express from 'express';
import { config } from './config.js';

const app = express();
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', version: '0.1.0' });
});

/**
 * POST /api/suggest/acceptance-criteria
 * Body: { workItemTitle: string, workItemDescription?: string }
 * Returns: { suggestions: AcceptanceCriterion[] }
 *
 * Phase 1: generate BDD Given/When/Then criteria from story context.
 */
app.post('/api/suggest/acceptance-criteria', (_req, res) => {
  res.status(501).json({
    code: 'not_implemented',
    message: 'AI acceptance criteria generation — coming in Phase 1',
  });
});

/**
 * POST /api/suggest/description
 * Body: { title: string, type: 'story' | 'bug' | 'task' }
 * Returns: { description: TiptapJSON }
 */
app.post('/api/suggest/description', (_req, res) => {
  res.status(501).json({
    code: 'not_implemented',
    message: 'AI description enhancement — coming in Phase 1',
  });
});

/**
 * POST /api/suggest/story-points
 * Body: { workItemId: string }
 * Returns: { suggestion: number, confidence: 'low' | 'medium' | 'high', reasoning: string }
 */
app.post('/api/suggest/story-points', (_req, res) => {
  res.status(501).json({
    code: 'not_implemented',
    message: 'AI story point estimation — coming in Phase 1',
  });
});

app.listen(config.port, () => {
  console.log(`PlanA AI service running on :${config.port}`);
});
