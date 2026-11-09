import { openUrl } from "@tauri-apps/plugin-opener";
import Markdown from "react-markdown";

/** Los enlaces se abren en el navegador del sistema, y solo si son https. */
const components = {
  a: ({ href, children }: { href?: string; children?: React.ReactNode }) => (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href?.startsWith("https://")) openUrl(href);
      }}
    >
      {children}
    </a>
  ),
};

/** Markdown de respuestas del modelo (sin HTML; enlaces https solamente). */
export default function SafeMarkdown({ children }: { children: string }) {
  return (
    <Markdown components={components} urlTransform={(u) => (u.startsWith("https://") ? u : "")}>
      {children}
    </Markdown>
  );
}
