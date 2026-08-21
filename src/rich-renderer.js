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

/**
 * Conservative HTML used for the standard sendMessage/editMessage fallback.
 * All model content is escaped before the small supported subset is added.
 */
export function renderStandardAiText(text) {
  return escapeHtml(text)
    .replace(/(?:^&gt; ?[^\n]*(?:\n|$))+/gm, (quote) => `<blockquote>${quote.trim().replace(/^&gt; ?/gm, "").replaceAll("\n", "<br>")}</blockquote>`)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/^#{1,3}\s+(.+)$/gm, "<b>$1</b>");
}

/**
 * Deterministically converts a deliberately small Markdown subset to Rich HTML.
 * It never accepts raw model HTML and has no network or AI dependency.
 */
export function renderRichAiText(text) {
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
    const attributes = list.type === "ol" ? "" : "";
    output.push(`<${list.type}${attributes}>${list.items.map((item) => `<li>${item}</li>`).join("")}</${list.type}>`);
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
    code = null;
  }
  flushStructures();
  return output.join("\n");
}
