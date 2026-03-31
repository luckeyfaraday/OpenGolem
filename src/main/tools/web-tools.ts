export async function performWebFetch(url: string): Promise<string> {
  const trimmed = url.trim();
  if (!trimmed) {
    throw new Error('URL is required');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http/https URLs are supported');
  }

  let response: Response;
  try {
    response = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'open-cowork' },
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new Error('请求超时，请检查网络连接后重试');
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Request failed with status ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || 'unknown';
  const body = await response.text();
  const limit = 20000;
  const truncated = body.length > limit
    ? `${body.slice(0, limit)}\n\n[Truncated ${body.length - limit} chars]`
    : body;

  return `URL: ${parsed.toString()}\nStatus: ${response.status}\nContent-Type: ${contentType}\n\n${truncated}`;
}

export async function performWebSearch(query: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Query is required');
  }

  const searchUrl = new URL('https://api.duckduckgo.com/');
  searchUrl.searchParams.set('q', trimmed);
  searchUrl.searchParams.set('format', 'json');
  searchUrl.searchParams.set('no_redirect', '1');
  searchUrl.searchParams.set('no_html', '1');
  searchUrl.searchParams.set('skip_disambig', '1');

  let response: Response;
  try {
    response = await fetch(searchUrl.toString(), {
      headers: { 'User-Agent': 'open-cowork' },
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      throw new Error('请求超时，请检查网络连接后重试');
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Search request failed with status ${response.status}`);
  }

  const data = await response.json() as Record<string, unknown>;
  const heading = typeof data.Heading === 'string' ? data.Heading : '';
  const abstractText = typeof data.AbstractText === 'string' ? data.AbstractText : '';
  const relatedTopics = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];

  type TopicItem = { text: string; url?: string };
  const results: TopicItem[] = [];

  const collectTopics = (topic: unknown): void => {
    if (!topic || typeof topic !== 'object') return;
    const record = topic as Record<string, unknown>;
    const text = typeof record.Text === 'string' ? record.Text : '';
    const firstUrl = typeof record.FirstURL === 'string' ? record.FirstURL : '';
    if (text) {
      results.push({ text, url: firstUrl || undefined });
    }
    const nested = Array.isArray(record.Topics) ? record.Topics : [];
    for (const nestedItem of nested) {
      collectTopics(nestedItem);
    }
  };

  for (const topic of relatedTopics) {
    collectTopics(topic);
  }

  const lines: string[] = [];
  lines.push(`Query: ${trimmed}`);
  lines.push('Source: DuckDuckGo Instant Answer');
  if (heading) lines.push(`Heading: ${heading}`);
  if (abstractText) lines.push(`Abstract: ${abstractText}`);

  const topResults = results.slice(0, 5);
  if (topResults.length > 0) {
    lines.push('Results:');
    for (const item of topResults) {
      lines.push(`- ${item.text}${item.url ? ` (${item.url})` : ''}`);
    }
  } else if (!abstractText) {
    lines.push('Results: No related topics found.');
  }

  const output = lines.join('\n');
  const limit = 20000;
  return output.length > limit
    ? `${output.slice(0, limit)}\n\n[Truncated ${output.length - limit} chars]`
    : output;
}
