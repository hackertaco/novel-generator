import { z } from "zod";

export const PlotOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  logline: z.string(),
  hook: z.string(),
  arc_summary: z.array(z.string()),
  key_twist: z.string(),
});

export const PlotOptionArraySchema = z.array(PlotOptionSchema);

export type PlotOption = z.infer<typeof PlotOptionSchema>;
