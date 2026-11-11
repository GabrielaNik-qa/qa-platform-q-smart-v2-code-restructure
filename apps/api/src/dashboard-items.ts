// The widgets of a dashboard, as the pages send them: today's widget ids (e.g. "kpi_avg"), at most 60. A dashboard an
// admin arranged by hand gives each widget its width of 60 columns and maybe its height in pixels: "heat@30x400".
import { z } from 'zod';

const item = z
  .string()
  .regex(/^[a-z0-9_]{1,30}(@\d{1,2}(x\d{2,4})?)?$/)
  .refine((s) => {
    const [, size, height] = /@(\d+)(?:x(\d+))?$/.exec(s) ?? [];
    if (!size) return true;
    const w = Number(size);
    const h = height ? Number(height) : 90;
    return w >= 6 && w <= 60 && h >= 90 && h <= 1400;
  });

export const dashboardItems = z.array(item).max(60);
