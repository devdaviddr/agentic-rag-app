export const OCR_PROMPT = `Convert this page to clean GitHub-flavored Markdown. Preserve heading levels, lists, tables (use pipe syntax), and code blocks. Do not invent text that is not on the page. Do not add commentary, preamble, or trailing notes — output only the Markdown body.`;

export const FIGURE_DETECT_PROMPT = `You are given the same page image as above. List figures, charts, diagrams, photos, or screenshots present on the page. For each, return a JSON array entry:
  { "label": "Figure 3" | "Chart" | "Diagram" | <best guess>,
    "bbox": [x, y, w, h],   // 0..1 page coordinates
    "caption": "<one tight sentence>" }
Return ONLY the JSON array. If there are no figures, return [].`;

export const FIGURE_SUMMARY_PROMPT = `Summarize this figure in 1–2 sentences for retrieval. Do not include the figure number.`;
