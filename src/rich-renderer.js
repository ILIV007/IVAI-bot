const TABLE_MAX_COLUMNS = 6;
const TABLE_MAX_BODY_ROWS = 12;
const FOOTNOTE_MAX_DEFINITIONS = 8;
const FOOTNOTE_MAX_TEXT = 480;
const INLINE_MATH_MAX_CHARACTERS = 240;
const BLOCK_MATH_MAX_CHARACTERS = 1200;
const BLOCK_MATH_MAX_LINES = 16;
const FOOTNOTE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;
const SAFE_LATEX_PATTERN = /^[0-9A-Za-z\s+*/^_=().,;:|{}\[\]\\-]+$/;
const SAFE_LATEX_COMMANDS = new Set([
  "alpha", "beta", "gamma", "delta", "epsilon", "theta", "lambda", "mu", "pi", "rho", "sigma", "tau", "phi", "psi", "omega",
  "Gamma", "Delta", "Theta", "Lambda", "Pi", "Sigma", "Phi", "Psi", "Omega",
  "frac", "sqrt", "sum", "prod", "int", "lim", "log", "ln", "sin", "cos", "tan", "exp", "max", "min", "left", "right",
  "cdot", "times", "pm", "mp", "le", "ge", "neq", "approx", "infty", "partial", "nabla", "overline", "underline", "mathbf", "mathrm", "text"
]);

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isSafeFootnoteId(id) {
  return FOOTNOTE_ID_PATTERN.test(String(id || ""));
}

function isSafeLatex(value, { block = false } = {}) {
  const source = String(value || "");
  const maxLength = block ? BLOCK_MATH_MAX_CHARACTERS : INLINE_MATH_MAX_CHARACTERS;
  const maxLines = block ? BLOCK_MATH_MAX_LINES : 1;
  const commands = [...source.matchAll(/\\([A-Za-z]+)/g)].map((match) => match[1]);
  return source.length > 0
    && source.length <= maxLength
    && source.split("\n").length <= maxLines
    && SAFE_LATEX_PATTERN.test(source)
    && commands.every((command) => SAFE_LATEX_COMMANDS.has(command));
}

function extractFootnoteDefinitions(lines) {
  const footnotes = new Map();
  const content = [];
  let inFence = false;

  for (const line of lines) {
    if (/^```\s*[^\s`]*\s*$/.test(line)) {
      inFence = !inFence;
      content.push(line);
      continue;
    }
    const definition = !inFence && line.match(/^\[\^([A-Za-z0-9][A-Za-z0-9_-]{0,31})\]:\s+(.+)$/);
    if (definition && footnotes.size < FOOTNOTE_MAX_DEFINITIONS && !footnotes.has(definition[1]) && definition[2].length <= FOOTNOTE_MAX_TEXT) {
      footnotes.set(definition[1], definition[2]);
      continue;
    }
    content.push(line);
  }

  return { lines: content, footnotes };
}

function renderInlineEscaped(escaped, { footnotes, allowMath }) {
  const renderFootnote = (_match, id) => {
    if (!footnotes.has(id)) return `[^${id}]`;
    return `<a href="#ivai-fn-${id}">[${id}]</a>`;
  };
  const renderMath = (match, expression) => (isSafeLatex(expression) ? `<tg-math>${expression}</tg-math>` : match);

  let rendered = escaped.replace(/\[\^([A-Za-z0-9][A-Za-z0-9_-]{0,31})\]/g, renderFootnote);
  if (allowMath) rendered = rendered.replace(/(?<!\\)\$([^$\n]{1,240})\$/g, renderMath);
  return rendered
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>");
}

function renderInline(value, options) {
  return renderInlineEscaped(escapeHtml(value), options);
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

function collectSmallTable(lines, startIndex, inlineOptions) {
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
  const head = `<thead><tr>${header.map((cell) => `<th>${renderInline(cell, inlineOptions)}</th>`).join("")}</tr></thead>`;
  const body = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${renderInline(cell, inlineOptions)}</td>`).join("")}</tr>`).join("")}</tbody>`;
  return { html: `<table>${head}${body}</table>`, endIndex: index - 1 };
}

/**
 * Conservative HTML used for the standard sendMessage/editMessage fallback.
 * All model content is escaped before the small supported subset is added.
 */
export function renderStandardAiText(text) {
  return escapeHtml(text)
    .replace(/\[\^([A-Za-z0-9][A-Za-z0-9_-]{0,31})\]/g, "[$1]")
    .replace(/^:::\s*details\s+(.+)$/gim, "<b>$1</b>")
    .replace(/^:::\s*enddetails\s*$/gim, "")
    .replace(/(?:^&gt; ?[^\n]*(?:\n|$))+/gm, (quote) => `<blockquote>${quote.trim().replace(/^&gt; ?/gm, "").replaceAll("\n", "<br>")}</blockquote>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^#{1,3}\s+(.+)$/gm, "<b>$1</b>");
}

function renderFootnoteFooter(footnotes, inlineOptions) {
  if (!footnotes.size) return "";
  const references = [...footnotes.entries()].map(([id, text]) => (
    `<tg-reference name="ivai-fn-${id}">[${id}] ${renderInline(text, inlineOptions)}</tg-reference>`
  ));
  return `<footer>${references.join("<br>")}</footer>`;
}

function renderRichLines(lines, { allowDetails, allowMath, depth, footnotes, includeFootnotes }) {
  const output = [];
  let paragraph = [];
  let list = null;
  let code = null;
  const inlineOptions = { footnotes, allowMath };

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
    const source = code.lines.join("\n");
    if (allowMath && language === "math" && isSafeLatex(source, { block: true })) {
      output.push(`<tg-math-block>${source}</tg-math-block>`);
    } else {
      const className = language ? ` class="language-${language}"` : "";
      output.push(`<pre><code${className}>${escapeHtml(source)}</code></pre>`);
    }
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

    if (allowMath && line === "$$") {
      const endIndex = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && candidate === "$$");
      if (endIndex > index + 1) {
        const expression = lines.slice(index + 1, endIndex).join("\n");
        if (isSafeLatex(expression, { block: true })) {
          flushStructures();
          output.push(`<tg-math-block>${expression}</tg-math-block>`);
          index = endIndex;
          continue;
        }
      }
    }
    const singleLineMath = allowMath && line.match(/^\$\$([^$\n]{1,1200})\$\$$/);
    if (singleLineMath && isSafeLatex(singleLineMath[1], { block: true })) {
      flushStructures();
      output.push(`<tg-math-block>${singleLineMath[1]}</tg-math-block>`);
      continue;
    }

    const details = allowDetails && depth === 0 && line.match(/^:::\s*details\s+(.+)$/i);
    if (details) {
      const endIndex = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && /^:::\s*enddetails\s*$/i.test(candidate));
      if (endIndex > index + 1) {
        flushStructures();
        output.push(`<details><summary>${renderInline(details[1], inlineOptions)}</summary>${renderRichLines(lines.slice(index + 1, endIndex), { allowDetails: false, allowMath, depth: depth + 1, footnotes, includeFootnotes: false })}</details>`);
        index = endIndex;
        continue;
      }
    }

    const table = collectSmallTable(lines, index, inlineOptions);
    if (table) {
      flushStructures();
      output.push(table.html);
      index = table.endIndex;
      continue;
    }

    const quote = line.match(/^> ?(.*)$/);
    if (quote) {
      flushStructures();
      const quoteLines = [renderInline(quote[1], inlineOptions)];
      while (index + 1 < lines.length && /^> ?/.test(lines[index + 1])) {
        index += 1;
        quoteLines.push(renderInline(lines[index].replace(/^> ?/, ""), inlineOptions));
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
      list.items.push(`${checkbox}${renderInline(item, inlineOptions)}`);
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
      output.push(`<h${heading[1].length}>${renderInline(heading[2], inlineOptions)}</h${heading[1].length}>`);
      continue;
    }

    if (!line.trim()) {
      flushStructures();
      continue;
    }
    paragraph.push(renderInline(line, inlineOptions));
  }

  if (code) {
    // An unclosed fence remains visible as literal text in the safe fallback style.
    paragraph.push(renderInline(`\`\`\`${code.language ? code.language : ""}`, inlineOptions));
    paragraph.push(...code.lines.map((line) => renderInline(line, inlineOptions)));
  }
  flushStructures();
  if (includeFootnotes) output.push(renderFootnoteFooter(footnotes, inlineOptions));
  return output.filter(Boolean).join("\n");
}

/**
 * Deterministically converts a deliberately small Markdown subset to Rich HTML.
 * Details, footnotes and formulas are interpreted only for explicit caller opt-in.
 */
export function renderRichAiText(text, { allowDetails = false, allowMath = false } = {}) {
  const sourceLines = String(text ?? "").replaceAll("\r\n", "\n").split("\n");
  const { lines, footnotes } = extractFootnoteDefinitions(sourceLines);
  return renderRichLines(lines, { allowDetails, allowMath, depth: 0, footnotes, includeFootnotes: true });
}
