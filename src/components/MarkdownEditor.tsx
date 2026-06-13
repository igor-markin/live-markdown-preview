import { defaultKeymap, history, historyKeymap, isolateHistory, redo, undo } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorState, Transaction } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { useEffect, useRef, useState } from "preact/hooks";

export interface MarkdownEditorHandle {
  focus: () => void;
  redo: () => boolean;
  replaceAll: (value: string, userEvent: string) => void;
  undo: () => boolean;
}

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  onEditorReady: (handle: MarkdownEditorHandle | null) => void;
}

const CODEMIRROR_STYLE_NONCE = "bGl2ZS1tYXJrZG93bi1wcmV2aWV3";
const GRAMMARLY_OPTOUT_ATTRIBUTES = {
  "data-enable-grammarly": "false",
  "data-gramm": "false",
  "data-gramm_editor": "false",
  spellcheck: "false"
};
const MARKDOWN_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: [tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: "var(--syntax-heading)", fontWeight: "700" },
  { tag: tags.link, color: "var(--syntax-link)", textDecoration: "underline" },
  { tag: tags.url, color: "var(--syntax-link)" },
  { tag: tags.monospace, color: "var(--syntax-code)" },
  { tag: tags.quote, color: "var(--syntax-quote)", fontStyle: "italic" },
  { tag: tags.emphasis, color: "var(--syntax-emphasis)", fontStyle: "italic" },
  { tag: tags.strong, color: "var(--syntax-strong)", fontWeight: "700" },
  { tag: tags.strikethrough, color: "var(--syntax-muted)", textDecoration: "line-through" },
  { tag: tags.contentSeparator, color: "var(--syntax-muted)" },
  { tag: [tags.processingInstruction, tags.meta, tags.punctuation], color: "var(--syntax-punctuation)" },
  { tag: [tags.string, tags.attributeValue], color: "var(--syntax-string)" },
  { tag: [tags.keyword, tags.atom], color: "var(--syntax-keyword)" }
]);

export function MarkdownEditor({ value, onChange, onEditorReady }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const suppressChangeRef = useRef(false);
  const valueRef = useRef(value);
  const [loadFailed, setLoadFailed] = useState(false);

  onChangeRef.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    if (!hostRef.current) {
      return undefined;
    }

    let cancelled = false;

    void import("@codemirror/lang-markdown")
      .then(({ markdown }) => {
        if (cancelled || !hostRef.current) {
          return;
        }

        const view = new EditorView({
          doc: valueRef.current,
          extensions: [
            lineNumbers(),
            highlightActiveLineGutter(),
            history(),
            drawSelection(),
            EditorState.allowMultipleSelections.of(true),
            EditorView.cspNonce.of(CODEMIRROR_STYLE_NONCE),
            EditorView.contentAttributes.of(GRAMMARLY_OPTOUT_ATTRIBUTES),
            EditorView.editorAttributes.of(GRAMMARLY_OPTOUT_ATTRIBUTES),
            markdown(),
            syntaxHighlighting(MARKDOWN_HIGHLIGHT_STYLE),
            EditorView.lineWrapping,
            highlightActiveLine(),
            keymap.of([{ key: "Ctrl-z", run: undo }, ...defaultKeymap, ...historyKeymap]),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                const nextValue = update.state.doc.toString();

                if (!suppressChangeRef.current) {
                  onChangeRef.current(nextValue);
                }
              }
            })
          ],
          parent: hostRef.current
        });

        viewRef.current = view;
        onEditorReady({
          focus: () => {
            view.focus();
          },
          redo: () => {
            return redo(view);
          },
          replaceAll: (nextValue, userEvent) => {
            view.dispatch({
              changes: {
                from: 0,
                to: view.state.doc.length,
                insert: nextValue
              },
              annotations: [Transaction.userEvent.of(userEvent), isolateHistory.of("full")]
            });
          },
          undo: () => {
            return undo(view);
          }
        });
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          onEditorReady(null);
        }
      });

    return () => {
      cancelled = true;
      viewRef.current?.destroy();
      onEditorReady(null);
    };
  }, [onEditorReady]);

  useEffect(() => {
    const view = viewRef.current;

    if (!view) {
      return;
    }

    const current = view.state.doc.toString();

    if (current === value) {
      return;
    }

    suppressChangeRef.current = true;

    try {
      view.dispatch({
        changes: {
          from: 0,
          to: current.length,
          insert: value
        },
        annotations: [Transaction.addToHistory.of(false)]
      });
    } finally {
      suppressChangeRef.current = false;
    }
  }, [value]);

  return (
    <div ref={hostRef} className={`editor-host${loadFailed ? " editor-loading" : ""}`}>
      {loadFailed ? "Editor unavailable" : null}
    </div>
  );
}
