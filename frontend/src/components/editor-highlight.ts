import { Mark, mergeAttributes } from "@tiptap/core";
import type { MarkdownLexerConfiguration, MarkdownToken } from "@tiptap/core";

import { HIGHLIGHT_DELIMITER } from "@/lib/html-utils";

/**
 * 正文高亮标记。
 *
 * 存储格式使用 `==文字==`（与 Obsidian、思源笔记一致），而不是 HTML 的
 * <mark> 标签：章节正文会原样写入导出的 TXT，HTML 标签会污染稿件，
 * 而 `==` 在导出时可以被明确剥离，且用户手工编辑时也能看懂。
 *
 * 正文编辑器是纯文本 schema，高亮不靠 markdown 序列化，而是由
 * html-utils 的 newlinesToHtmlWithHighlights / htmlToNewlinesWithHighlights
 * 在读写时与 ==文字== 互相转换；这里的 markdown* 配置留作通用能力。
 */

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    editorHighlight: {
      /** 切换当前选区的高亮状态。 */
      toggleEditorHighlight: () => ReturnType;
    };
  }
}

export const HIGHLIGHT_MARK_NAME = "editorHighlight";

export const EditorHighlight = Mark.create({
  name: HIGHLIGHT_MARK_NAME,

  parseHTML() {
    return [
      {
        tag: "mark",
        getAttrs: (element) => {
          // 只接管自己渲染的 <mark>，避免粘贴外部 HTML 时混入其它高亮样式。
          const target = element as HTMLElement;
          return target.classList?.contains("editor-highlight") ? null : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "mark",
      mergeAttributes(HTMLAttributes, { class: "editor-highlight" }),
      0,
    ];
  },

  addCommands() {
    return {
      toggleEditorHighlight:
        () =>
        ({ commands }) =>
          commands.toggleMark(this.name),
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Shift-h": () => this.editor.commands.toggleEditorHighlight(),
    };
  },

  markdownTokenizer: {
    name: HIGHLIGHT_MARK_NAME,
    level: "inline",
    start: (src: string) => src.indexOf(HIGHLIGHT_DELIMITER),
    tokenize(src: string, _tokens: MarkdownToken[], helpers: MarkdownLexerConfiguration) {
      if (!src.startsWith(HIGHLIGHT_DELIMITER)) {
        return undefined;
      }
      const closeIndex = src.indexOf(HIGHLIGHT_DELIMITER, HIGHLIGHT_DELIMITER.length);
      if (closeIndex <= HIGHLIGHT_DELIMITER.length) {
        return undefined;
      }
      const inner = src.slice(HIGHLIGHT_DELIMITER.length, closeIndex);
      // `====`（空内容）不视为高亮，避免把普通等号吃成标记。
      if (!inner.trim()) {
        return undefined;
      }
      return {
        type: HIGHLIGHT_MARK_NAME,
        raw: src.slice(0, closeIndex + HIGHLIGHT_DELIMITER.length),
        text: inner,
        tokens: helpers.inlineTokens(inner) as MarkdownToken[],
      };
    },
  },

  parseMarkdown: (token, helpers) =>
    helpers.applyMark(
      HIGHLIGHT_MARK_NAME,
      helpers.parseInline((token.tokens ?? []) as never),
    ),

  renderMarkdown: (node, helpers) => `${HIGHLIGHT_DELIMITER}${helpers.renderChildren(node)}${HIGHLIGHT_DELIMITER}`,
});
