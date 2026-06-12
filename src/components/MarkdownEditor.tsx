import { defaultKeymap, history, historyKeymap, isolateHistory, redo, undo } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers
} from "@codemirror/view";
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

export function MarkdownEditor({ value, onChange, onEditorReady }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
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
            markdown(),
            EditorView.lineWrapping,
            highlightActiveLine(),
            keymap.of([{ key: "Ctrl-z", run: undo }, ...defaultKeymap, ...historyKeymap]),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) {
                onChangeRef.current(update.state.doc.toString());
              }
            })
          ],
          parent: hostRef.current
        });

        viewRef.current = view;
        onEditorReady({
          focus: () => view.focus(),
          redo: () => redo(view),
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
          undo: () => undo(view)
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

    view.dispatch({
      changes: {
        from: 0,
        to: current.length,
        insert: value
      },
      annotations: [Transaction.userEvent.of("input"), Transaction.addToHistory.of(false)]
    });
  }, [value]);

  return (
    <div ref={hostRef} className={`editor-host${loadFailed ? " editor-loading" : ""}`}>
      {loadFailed ? "Editor unavailable" : null}
    </div>
  );
}
