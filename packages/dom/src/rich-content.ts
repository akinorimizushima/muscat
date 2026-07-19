const ALLOWED_ELEMENTS = new Set(["p", "br", "strong", "em", "u", "s", "a"]);
const REMOVED_ELEMENTS = new Set(["script", "style", "iframe", "object", "embed"]);
const SAFE_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);
const TEXT_ALIGNMENTS = new Set(["left", "center", "right"]);

export function isSafeRichTextUrl(value: string): boolean {
  const trimmed = value.trim();
  if (
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  )
    return true;
  try {
    return SAFE_SCHEMES.has(new URL(trimmed, "https://muscat.invalid").protocol);
  } catch {
    return false;
  }
}

function sanitizeChildren(parent: ParentNode, ownerDocument: Document): void {
  // Take a snapshot because sanitizing mutates the live NodeList.
  // oxlint-disable-next-line unicorn/no-useless-spread
  for (const child of [...parent.childNodes]) {
    if (child.nodeType !== ownerDocument.ELEMENT_NODE) continue;
    const element = child as HTMLElement;

    const tagName = element.tagName.toLowerCase();
    if (REMOVED_ELEMENTS.has(tagName)) {
      element.remove();
      continue;
    }

    sanitizeChildren(element, ownerDocument);
    if (!ALLOWED_ELEMENTS.has(tagName)) {
      element.replaceWith(...element.childNodes);
      continue;
    }

    const href = tagName === "a" ? element.getAttribute("href") : null;
    const textAlign = tagName === "p" ? element.style.textAlign.trim().toLowerCase() : "";
    // Take a snapshot because removing entries mutates the live NamedNodeMap.
    // oxlint-disable-next-line unicorn/no-useless-spread
    for (const attribute of [...element.attributes]) element.removeAttribute(attribute.name);
    if (href !== null && isSafeRichTextUrl(href)) element.setAttribute("href", href);
    if (TEXT_ALIGNMENTS.has(textAlign)) element.setAttribute("style", `text-align: ${textAlign}`);
  }
}

export function sanitizeRichContent(html: string, ownerDocument = document): string {
  const template = ownerDocument.createElement("template");
  template.innerHTML = html;
  sanitizeChildren(template.content, ownerDocument);
  return template.innerHTML;
}

export function appendRichContent(element: HTMLElement, html: string): void {
  const safe = sanitizeRichContent(html, element.ownerDocument);
  const template = element.ownerDocument.createElement("template");
  template.innerHTML = safe;
  element.append(template.content.cloneNode(true));
}
