export function setupMarked() {
  marked.setOptions({
    gfm: true,
    breaks: true,
    pedantic: false,
    smartLists: true,
    smartypants: false,
    xhtml: false,
  });
}

// ЭТУ ФУНКЦИЮ ОСТАВЛЯЕМ ПРИВАТНОЙ (НЕ ЭКСПОРТИРУЕМ)
function processDiscordMarkdown(text) {
  let processed = text;
  processed = processed.replace(/\|\|(.+?)\|\|/g, (match, text) => {
    return `<span class="spoiler" style="background:#2d2d2d;border-radius:4px;padding:0 4px;cursor:pointer;" onclick="this.style.background='transparent'">${text}</span>`;
  });
  processed = processed.replace(/(^|\s)@(\w+)/g, (match, space, username) => {
    return `${space}<span style="color:#5865F2;font-weight:500;">@${username}</span>`;
  });
  return processed;
}

export function renderDescription(markdown, containerElement) {
  try {
    setupMarked();

    const processedMarkdown = processDiscordMarkdown(markdown);
    const rawHtml = marked.parse(processedMarkdown);
    const safeHtml = DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: [
        "p",
        "br",
        "hr",
        "strong",
        "b",
        "em",
        "i",
        "u",
        "strike",
        "s",
        "del",
        "ins",
        "code",
        "pre",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "ul",
        "ol",
        "li",
        "a",
        "blockquote",
        "span",
        "div",
        "table",
        "thead",
        "tbody",
        "tr",
        "th",
        "td",
        "img",
      ],
      ALLOWED_ATTR: [
        "href",
        "target",
        "rel",
        "src",
        "alt",
        "title",
        "class",
        "id",
        "style",
      ],
      ALLOWED_URI_REGEXP:
        /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    });

    // Вставляем HTML в контейнер
    containerElement.innerHTML = safeHtml;

    // Обработка ссылок
    containerElement.querySelectorAll("a").forEach((a) => {
      const href = a.getAttribute("href");
      if (href && !href.toLowerCase().startsWith("javascript:")) {
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
    });

    // Подсветка кода
    if (typeof Prism !== "undefined") {
      containerElement.querySelectorAll("pre code").forEach((block) => {
        Prism.highlightElement(block);
      });
    }
  } catch (e) {
    console.error("Error rendering markdown:", e);
    containerElement.textContent = markdown;
  }
}
