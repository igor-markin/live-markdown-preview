import DOMPurify from "dompurify";

export function sanitizeMarkdownHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["input"],
    ADD_ATTR: ["checked", "disabled", "type", "target", "rel"],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "form", "button", "select", "textarea", "option"],
    FORBID_ATTR: ["style"]
  });

  return hardenPreviewHtml(sanitized);
}

function hardenPreviewHtml(html: string): string {
  if (typeof document === "undefined") {
    return html;
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const input of Array.from(template.content.querySelectorAll("input"))) {
    if (input.getAttribute("type")?.toLowerCase() !== "checkbox") {
      input.remove();
      continue;
    }

    input.setAttribute("type", "checkbox");
    input.setAttribute("disabled", "");
  }

  for (const link of Array.from(template.content.querySelectorAll("a[href]"))) {
    const href = link.getAttribute("href") ?? "";

    if (href.startsWith("#")) {
      link.removeAttribute("target");
      link.removeAttribute("rel");
      continue;
    }

    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  }

  return template.innerHTML;
}
