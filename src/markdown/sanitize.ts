import DOMPurify from "dompurify";

const SAFE_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"]);
const SAFE_DATA_IMAGE_PATTERN = /^data:image\/(?:avif|gif|jpe?g|png|webp);base64,[a-z0-9+/=\s]+$/i;
const URL_SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/;

export function sanitizeMarkdownHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_TAGS: ["input"],
    ADD_ATTR: ["checked", "disabled", "type", "target", "rel"],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ["style", "form", "button", "select", "textarea", "option", "iframe", "object", "embed", "base"],
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
    const href = getSafeLinkHref(link.getAttribute("href") ?? "");

    if (!href) {
      link.removeAttribute("href");
      link.removeAttribute("target");
      link.removeAttribute("rel");
      continue;
    }

    link.setAttribute("href", href);

    if (href.startsWith("#")) {
      link.removeAttribute("target");
      link.removeAttribute("rel");
      continue;
    }

    link.setAttribute("target", "_blank");
    link.setAttribute("rel", "noopener noreferrer");
  }

  for (const image of Array.from(template.content.querySelectorAll("img"))) {
    const src = image.getAttribute("src");

    image.removeAttribute("srcset");
    image.removeAttribute("sizes");

    if (src && !isSafeImageSrc(src)) {
      image.removeAttribute("src");
    }
  }

  return template.innerHTML;
}

function getSafeLinkHref(value: string): string | null {
  const href = value.trim();

  if (!href || CONTROL_CHARACTER_PATTERN.test(href)) {
    return null;
  }

  if (href.startsWith("#")) {
    return href;
  }

  try {
    const url = new URL(href, document.baseURI);

    return SAFE_LINK_PROTOCOLS.has(url.protocol) ? href : null;
  } catch {
    return null;
  }
}

function isSafeImageSrc(value: string): boolean {
  const src = value.trim();

  if (!src || CONTROL_CHARACTER_PATTERN.test(src)) {
    return false;
  }

  if (src.startsWith("data:")) {
    return SAFE_DATA_IMAGE_PATTERN.test(src);
  }

  if (src.startsWith("//")) {
    return false;
  }

  if (URL_SCHEME_PATTERN.test(src)) {
    return isSameOriginHttpUrl(src);
  }

  return true;
}

function isSameOriginHttpUrl(value: string): boolean {
  try {
    const url = new URL(value, document.baseURI);

    return (url.protocol === "http:" || url.protocol === "https:") && url.origin === window.location.origin;
  } catch {
    return false;
  }
}
