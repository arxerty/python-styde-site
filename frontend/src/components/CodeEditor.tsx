import Editor from "@monaco-editor/react";
import { useEffect, useState } from "react";

function currentTheme() {
  return document.documentElement.dataset.theme === "dark" ? "vs-dark" : "light";
}

function useEditorTheme() {
  const [theme, setTheme] = useState(currentTheme);
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return theme;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: number | string;
  readOnly?: boolean;
  language?: string;
  onRun?: () => void;
}

export function CodeEditor({ value, onChange, height, readOnly = false, language = "python", onRun }: Props) {
  const theme = useEditorTheme();
  const lines = value.split("\n").length;
  const autoHeight = Math.min(Math.max(lines * 20 + 24, 140), 560);
  return (
    <div className="editor-frame">
      <Editor
        height={height ?? autoHeight}
        language={language}
        theme={theme}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        loading={<div className="editor-loading">Загрузка редактора…</div>}
        onMount={(editor, monaco) => {
          if (onRun) {
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, onRun);
          }
        }}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          tabSize: 4,
          insertSpaces: true,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
          lineNumbersMinChars: 3,
          renderLineHighlight: "line",
          scrollbar: { alwaysConsumeMouseWheel: false },
        }}
      />
    </div>
  );
}
