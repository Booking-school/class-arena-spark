import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { getEnDict } from "@/i18n";

// Walks the DOM and translates Thai text nodes / placeholders / titles to
// English using the i18n dictionary when language is "en". When switching
// back to "th", restores the original text. This is a safety net so that
// pages don't show a mix of Thai and English when strings were rendered
// without going through tr().

const THAI_RE = /[\u0E00-\u0E7F]/;

// Storage for original Thai values keyed by node, so we can restore them
// when the user switches back to Thai.
const originalText = new WeakMap<Node, string>();
const originalAttr = new WeakMap<Element, Map<string, string>>();

function lookup(dict: Record<string, string>, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (dict[trimmed]) {
    // preserve surrounding whitespace
    return value.replace(trimmed, dict[trimmed]);
  }
  // try the raw value
  if (dict[value]) return dict[value];
  return null;
}

function translateTextNode(node: Text, dict: Record<string, string>) {
  const current = node.nodeValue ?? "";
  if (!THAI_RE.test(current)) return;
  if (!originalText.has(node)) originalText.set(node, current);
  const original = originalText.get(node)!;
  const replaced = lookup(dict, original);
  if (replaced && replaced !== current) node.nodeValue = replaced;
}

const ATTRS = ["placeholder", "title", "aria-label", "alt"] as const;

function translateElementAttrs(el: Element, dict: Record<string, string>) {
  for (const attr of ATTRS) {
    const cur = el.getAttribute(attr);
    if (!cur || !THAI_RE.test(cur)) continue;
    let map = originalAttr.get(el);
    if (!map) {
      map = new Map();
      originalAttr.set(el, map);
    }
    if (!map.has(attr)) map.set(attr, cur);
    const original = map.get(attr)!;
    const replaced = lookup(dict, original);
    if (replaced && replaced !== cur) el.setAttribute(attr, replaced);
  }
}

function restoreNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const o = originalText.get(node);
    if (o != null && (node as Text).nodeValue !== o) (node as Text).nodeValue = o;
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const map = originalAttr.get(el);
    if (map) {
      for (const [attr, val] of map) {
        if (el.getAttribute(attr) !== val) el.setAttribute(attr, val);
      }
    }
  }
}

function walk(root: Node, fn: (n: Node) => void) {
  fn(root);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode(n) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const tag = (n as Element).tagName;
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") {
          return NodeFilter.FILTER_REJECT;
        }
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let cur = walker.nextNode();
  while (cur) {
    fn(cur);
    cur = walker.nextNode();
  }
}

export function DomTranslator() {
  const { i18n } = useTranslation();
  const lang = i18n.resolvedLanguage ?? i18n.language;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const dict = getEnDict();
    const root = document.body;
    if (!root) return;

    const apply = (node: Node) => {
      if (lang === "en") {
        if (node.nodeType === Node.TEXT_NODE) {
          translateTextNode(node as Text, dict);
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          translateElementAttrs(node as Element, dict);
        }
      } else {
        restoreNode(node);
      }
    };

    // initial sweep
    walk(root, apply);

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === "characterData" && m.target.nodeType === Node.TEXT_NODE) {
          apply(m.target);
        } else if (m.type === "attributes" && m.target.nodeType === Node.ELEMENT_NODE) {
          apply(m.target);
        } else if (m.type === "childList") {
          m.addedNodes.forEach((n) => walk(n, apply));
        }
      }
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...ATTRS],
    });

    return () => observer.disconnect();
  }, [lang]);

  return null;
}
