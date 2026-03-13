export interface Segment {
  id: number;
  text: string;
}

export function segmentText(text: string): Segment[] {
  return text
    .split("\n\n")
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
    .map((t, i) => ({ id: i, text: t }));
}

export function reassemble(segments: Segment[]): string {
  return segments.map((s) => s.text).join("\n\n");
}
