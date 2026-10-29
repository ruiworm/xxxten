/**
 * HTML Utils
 *
 * HTML 相关的工具函数。
 */

/** 正文高亮在纯文本中的定界符，与 Obsidian、思源笔记一致。 */
export const HIGHLIGHT_DELIMITER = "==";

/** 匹配 `==文字==`：要求两端非空白，避免把 `a == b` 这类普通等号误判为高亮。 */
const HIGHLIGHT_TEXT_PATTERN = /==(?=\S)(.+?)(?<=\S)==/g;

/** 匹配编辑器渲染出的高亮标签（属性顺序不敏感）。 */
const HIGHLIGHT_TAG_PATTERN = /<mark\b[^>]*class="[^"]*editor-highlight[^"]*"[^>]*>([\s\S]*?)<\/mark>/gi;

/**
 * 将 HTML 内容转换为换行符格式
 * 用于保存到数据库时，将 Tiptap 的 HTML 格式转换为纯文本换行符
 *
 * 处理逻辑：
 * 1. 将 </p> 替换为换行符
 * 2. 移除所有 HTML 标签
 * 3. 将 HTML 实体反转义（&lt; → <, &gt; → >, &amp; → &）
 *
 * @param html HTML 内容
 * @returns 纯文本内容，使用换行符分隔段落
 */
export function htmlToNewlines(html: string): string {
  if (!html) return "";

  let result = html;

  // 1. 将 </p> 替换为换行符
  result = result.replace(/<\/p\b>/gi, "\n");

  // 2. 移除 <p> 标签（包括带属性的）
  result = result.replace(/<p\b[^>]*>/gi, "");

  // 3. 移除其他所有 HTML 标签（如 <br> 等）
  result = result.replace(/<[^>]+>/g, "");

  // 4. 将 HTML 实体反转义
  result = decodeHtmlEntities(result);

  // 5. 只移除最后一个段落标签产生的换行，保留正文中的空白和空段落
  if (/<\/p\b>$/i.test(html)) {
    result = result.slice(0, -1);
  }

  return result;
}

/**
 * 将 HTML 实体反转义为原始字符
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&"); // &amp; 必须最后处理
}

/**
 * 剥掉正文里的高亮定界符，用于导出预览等「所见即所得」的只读展示。
 * 与后端导出时的清理规则保持一致。
 */
export function stripHighlightDelimiters(text: string): string {
  if (!text) return "";
  return text.replace(HIGHLIGHT_TEXT_PATTERN, (_match, inner: string) => inner);
}

/**
 * 将换行符格式的文本转换为 HTML
 * 用于从数据库加载时，将纯文本换行符转换为 Tiptap 可以显示的 HTML 格式
 *
 * 处理逻辑：
 * 1. 对文本进行 HTML 转义
 * 2. 按换行符分割段落，每段用 <p></p> 包裹
 *
 * @param text 纯文本内容，使用换行符分隔段落
 * @param preserveWhitespace 是否保留仅含空白字符的段落
 * @returns HTML 内容，包含 <p></p> 段落标签
 */
export function newlinesToHtml(text: string, preserveWhitespace = false): string {
  if (!text) return "";

  // 按换行分割成段落（保留空行）
  const paragraphs = text.split("\n");

  // 构建 HTML（保留空段落，转换为空的 <p></p> 标签）。
  const htmlParts: string[] = [];
  for (const p of paragraphs) {
    if (!preserveWhitespace && !p.trim()) {
      htmlParts.push("<p></p>");
    } else {
      htmlParts.push(`<p>${escapeHtml(p)}</p>`);
    }
  }

  return htmlParts.join("");
}

/**
 * HTML 转义（用于文本内容）
 */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}


/**
 * 将纯文本里的 `==高亮==` 转成编辑器可识别的 <mark> 标签。
 * 输入假定已做 HTML 转义。
 */
function markHighlightsInEscapedText(escaped: string): string {
  return escaped.replace(
    HIGHLIGHT_TEXT_PATTERN,
    (_match, inner: string) => `<mark class="editor-highlight">${inner}</mark>`,
  );
}

/**
 * 将换行符格式的正文转换为 HTML，并把 `==高亮==` 还原为编辑器的高亮标记。
 *
 * 与 newlinesToHtml 的区别只有一点：正文编辑器支持高亮，
 * 而提示词等纯文本编辑区不需要，因此单独提供而不改动原函数行为。
 */
export function newlinesToHtmlWithHighlights(text: string, preserveWhitespace = false): string {
  if (!text) return "";

  const paragraphs = text.split("\n");
  const htmlParts: string[] = [];
  for (const p of paragraphs) {
    if (!preserveWhitespace && !p.trim()) {
      htmlParts.push("<p></p>");
    } else {
      htmlParts.push(`<p>${markHighlightsInEscapedText(escapeHtml(p))}</p>`);
    }
  }

  return htmlParts.join("");
}

/**
 * 将编辑器 HTML 转回换行符纯文本，并把高亮标签写回 `==高亮==`。
 *
 * 必须先做标签替换再走 htmlToNewlines：后者会剥掉所有 HTML 标签，
 * 不先处理就会把高亮本身一起丢掉。
 */
export function htmlToNewlinesWithHighlights(html: string): string {
  if (!html) return "";
  const withDelimiters = html.replace(
    HIGHLIGHT_TAG_PATTERN,
    (_match, inner: string) => `${HIGHLIGHT_DELIMITER}${inner}${HIGHLIGHT_DELIMITER}`,
  );
  return htmlToNewlines(withDelimiters);
}
