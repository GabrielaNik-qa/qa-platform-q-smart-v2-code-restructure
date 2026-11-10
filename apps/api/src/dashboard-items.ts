// The widgets of a dashboard, as the pages send them: today's widget ids (e.g. "kpi_avg"), at most 60.
import { z } from 'zod';

export const dashboardItems = z.array(z.string().regex(/^[a-z0-9_]{1,30}$/)).max(60);
