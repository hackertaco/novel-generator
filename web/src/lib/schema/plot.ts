import { z } from "zod";

export const PlotOptionSchema = z.object({
  id: z.string(),
  title: z.string(),
  logline: z.string(),
  hook: z.string(),
  arc_summary: z.array(z.string()),
  key_twist: z.string(),
  /** Male lead archetype tag (e.g. "집착광공형", "폭군형") */
  male_archetype: z.string().default(""),
  /** Female lead archetype tag (e.g. "사이다형", "무심녀형") */
  female_archetype: z.string().default(""),
});

export const PlotOptionArraySchema = z.array(PlotOptionSchema);

export type PlotOption = z.infer<typeof PlotOptionSchema>;
