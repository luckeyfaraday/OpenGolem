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
  const truncated =
    body.length > limit
      ? `${body.slice(0, limit)}\n\n[Truncated ${body.length - limit} chars]`
      : body;

  return `URL: ${parsed.toString()}\nStatus: ${response.status}\nContent-Type: ${contentType}\n\n${truncated}`;
}

export async function performWebSearch(query: string): Promise<string> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error('Query is required');
  }

  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) {
    throw new Error('BRAVE_SEARCH_API_KEY environment variable is not set');
  }

  const searchUrl = new URL('https://api.search.brave.com/res/v1/web/search');
  searchUrl.searchParams.set('q', trimmed);

  let response: Response;
  try {
    response = await fetch(searchUrl.toString(), {
      headers: {
        Accept: 'application/json',
        'X-Subscription-Token': apiKey,
      },
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

  const data = (await response.json()) as Record<string, unknown>;

  type WebResult = { url: string; title: string; description: string };
  const results: WebResult[] = [];

  const web = data.web as Record<string, unknown> | undefined;
  if (web && Array.isArray(web.results)) {
    for (const item of web.results as unknown[]) {
      if (item && typeof item === 'object') {
        const r = item as Record<string, unknown>;
        results.push({
          url: typeof r.url === 'string' ? r.url : '',
          title: typeof r.title === 'string' ? r.title : '',
          description: typeof r.description === 'string' ? r.description : '',
        });
      }
    }
  }

  const lines: string[] = [];
  lines.push(`Query: ${trimmed}`);
  lines.push('Source: Brave Search');

  const topResults = results.slice(0, 5);
  if (topResults.length > 0) {
    lines.push('Results:');
    for (const item of topResults) {
      lines.push(`- ${item.title} (${item.url})`);
      if (item.description) lines.push(`  ${item.description}`);
    }
  } else {
    lines.push('Results: No results found.');
  }

  const output = lines.join('\n');
  const limit = 20000;
  return output.length > limit
    ? `${output.slice(0, limit)}\n\n[Truncated ${output.length - limit} chars]`
    : output;
}
