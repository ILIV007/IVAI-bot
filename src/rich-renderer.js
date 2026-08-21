const TABLE_MAX_COLUMNS = 6;
const TABLE_MAX_BODY_ROWS = 12;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInlineEscaped(escaped) {
  return escaped
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function safeCodeLanguage(rawLanguage) {
  const language = String(rawLanguage || "").trim().toLowerCase();
  return /^[a-z0-9+#.-]{1,32}$/.test(language) ? language : "";
}

function parseTableRow(line) {
  const value = String(line || "").trim();
  if (!value.includes("|")) return null;
  const cells = value.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  return cells.length >= 2 && cells.length <= TABLE_MAX_COLUMNS ? cells : null;
}

function isTableDivider(cells) {
  return Array.isArray(cells) && cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function collectSmallTable(lines, startIndex) {
  const header = parseTableRow(lines[startIndex]);
  const divider = parseTableRow(lines[startIndex + 1]);
  if (!header || !divider || header.length !== divider.length || !isTableDivider(divider)) return null;
  const rows = [];
  let index = startIndex + 2;
  while (index < lines.length && String(lines[index]).includes("|")) {
    const cells = parseTableRow(lines[index]);
    // A malformed or over-wide contiguous row invalidates the entire candidate,
    // so a partial native table can never be emitted.
    if (!cells || cells.length !== header.length) return null;
    rows.push(cells);
    index += 1;
  }
  if (!rows.length || rows.length > TABLE_MAX_BODY_ROWS) return null;
  const head = `<thead><tr>${header.map((cell) => `<th>${renderInlineEscaped(escapeHtml(cell))}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInlineEscaped(escapeHtml(cell))}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return { html: `<table>${head}${body}</table>`, endIndex: index - 1 };
}

/**
 * Conservative HTML used for the standard sendMessage/editMessage fallback.
 * All model content is escaped before the small supported subset is added.
 */
export function renderStandardAiText(text) {
  return escapeHtml(text)
    .replace(/^:::\s*details\s+(.+)$/gim, "<b>$1</b>")
    .replace(/^:::\s*enddetails\s*$/gim, "")
    .replace(/(?:^&gt; ?[^\n]*(?:\n|$))+/gm, (quote) => `<blockquote>${quote.trim().replace(/^&gt; ?/gm, "").replaceAll("\n", "<br>")}</blockquote>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^#{1,3}\s+(.+)$/gm, "<b>$1</b>");
}

function renderRichAiTextInternal(text, { allowDetails, depth }) {
  const lines = String(text ?? "").replaceAll("\r\n", "\n").split("\n");
  const output = [];
  let paragraph = [];
  let list = null;
  let code = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    output.push(`<p>${paragraph.join("<br>")}</p>`);
    paragraph = [];
  };
  const flushList = () => {
    if (!list) return;
    output.push(`<${list.type}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.type}>`);
    list = null;
  };
  const flushCode = () => {
    if (!code) return;
    const language = safeCodeLanguage(code.language);
    const className = language ? ` class="language-${language}"` : "";
    output.push(`<pre><code${className}>${escapeHtml(code.lines.join("\n"))}</code></pre>`);
    code = null;
  };
  const flushStructures = () => {
    flushParagraph();
    flushList();
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fence = line.match(/^```\s*([^\s`]*)\s*$/);
    if (code) {
      if (fence) flushCode();
      else code.lines.push(line);
      continue;
    }
    if (fence) {
      flushStructures();
      code = { language: fence[1], lines: [] };
      continue;
    }

    const details = allowDetails && depth === 0 && line.match(/^:::\s*details\s+(.+)$/i);
    if (details) {
      const endIndex = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^:::\s*enddetails\s*$/i.test(candidate));
      if (endIndex > index + 1) {
        flushStructures();
        const body = lines.slice(index + 1, endIndex).join("\n");
        output.push(`<details><summary>${renderInlineEscaped(escapeHtml(details[1]))}</summary>${renderRichAiTextInternal(body, { allowDetails: false, depth: depth + 1 })}</details>`);
        index = endIndex;
        continue;
      }
    }

    const table = collectSmallTable(lines, index);
    if (table) {
      flushStructures();
      output.push(table.html);
      index = table.endIndex;
      continue;
    }

    const quote = line.match(/^> ?(.*)$/);
    if (quote) {
      flushStructures();
      const quoteLines = [renderInlineEscaped(escapeHtml(quote[1]))];
      while (index + 1 < lines.length && /^> ?/.test(lines[index + 1])) {
        index += 1;
        quoteLines.push(renderInlineEscaped(escapeHtml(lines[index].replace(/^> ?/, ""))));
      }
      output.push(`<blockquote>${quoteLines.join("<br>")}</blockquote>`);
      continue;
    }

    const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const unordered = line.match(/^\s*[-*+]\s+(.*)$/);
    if (task || ordered || unordered) {
      flushParagraph();
      const type = ordered ? "ol" : "ul";
      if (!list || list.type !== type) {
        flushList();
        list = { type, items: [] };
      }
      const item = task ? task[2] : (ordered ? ordered[1] : unordered[1]);
      const checkbox = task ? `<input type="checkbox"${/[xX]/.test(task[1]) ? " checked" : ""}> ` : "";
      list.items.push(`${checkbox}${renderInlineEscaped(escapeHtml(item))}`);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      flushStructures();
      output.push("<hr/>");
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushStructures();
      output.push(`<h${heading[1].length}>${renderInlineEscaped(escapeHtml(heading[2]))}</h${heading[1].length}>`);
      continue;
    }

    if (!line.trim()) {
      flushStructures();
      continue;
    }
    paragraph.push(renderInlineEscaped(escapeHtml(line)));
  }

  if (code) {
    // An unclosed fence remains visible as literal text in the safe fallback style.
    paragraph.push(renderInlineEscaped(escapeHtml(`\`\`\`${code.language ? code.language : ""}`)));
    paragraph.push(...code.lines.map((line) => renderInlineEscaped(escapeHtml(line))));
  }
  flushStructures();
  return output.join("\n");
}

/**
 * Deterministically converts a deliberately small Markdown subset to Rich HTML.
 * Details blocks are interpreted only for an explicit caller opt-in.
 */
export function renderRichAiText(text, { allowDetails = false } = {}) {
  return renderRichAiTextInternal(text, { allowDetails, depth: 0 });
}
