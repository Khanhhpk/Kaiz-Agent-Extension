import { ITool } from '../tool_registry';

export const searchGoogleTool: ITool = {
    schema: {
        name: 'search_google',
        description:
            'CÔNG CỤ TÌM KIẾM WEB. Hoạt động giống như việc bạn tìm kiếm Internet. Nó sẽ trả về danh sách các kết quả (gồm Tiêu đề, Tóm tắt ngắn, và URL). LUÔN DÙNG TOOL NÀY ĐẦU TIÊN khi bạn cần tra cứu kiến thức mới hoặc tìm link.',
        parameters: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Từ khóa cần tìm kiếm trên Google',
                },
            },
            required: ['query'],
        },
    },
    execute: async (args: any) => {
        try {
            const query = args.query;
            if (!query) {
                return { content: JSON.stringify({ error: "Missing 'query' parameter" }), isError: true };
            }

            const encodedQuery = encodeURIComponent(query).replace(/%20/g, '+');
            const parser = new DOMParser();
            const results: { title: string; url: string; snippet: string }[] = [];
            let engine = 'Bing';

            // === HELPER: Parse Bing HTML thành danh sách kết quả ===
            const parseBing = (bingHtml: string): { title: string; url: string; snippet: string }[] => {
                const parsed: { title: string; url: string; snippet: string }[] = [];
                const bingDoc = parser.parseFromString(bingHtml, 'text/html');
                const bingResults = bingDoc.querySelectorAll('.b_algo');
                bingResults.forEach((res) => {
                    const titleEl = res.querySelector('h2 a');
                    const snippetEl = res.querySelector('.b_caption p') || res.querySelector('.b_snippet');
                    if (titleEl && titleEl.getAttribute('href')) {
                        parsed.push({
                            title: titleEl.textContent?.trim() || '',
                            url: titleEl.getAttribute('href')!,
                            snippet: snippetEl?.textContent?.trim() || '',
                        });
                    }
                });
                return parsed;
            };

            // === HELPER: Kiểm tra kết quả có phải rác không ===
            // Bing bot-mode thường trả về kết quả từ điển/định nghĩa thay vì kết quả thực
            const isGarbageResults = (
                items: { title: string; url: string; snippet: string }[],
                originalQuery: string,
            ): boolean => {
                if (items.length === 0) return true;
                // Kiểm tra 3 kết quả đầu tiên
                const checkCount = Math.min(items.length, 3);
                let garbageCount = 0;
                // Các domain từ điển/định nghĩa phổ biến mà Bing hay trả khi bị ngáo NLP
                const dictDomains = [
                    'dictionary.cambridge.org',
                    'merriam-webster.com',
                    'en.wiktionary.org',
                    'tudientienganh.com',
                    'hvdic.thivien.net',
                    'lingolandedu.com',
                    'dict.laban.vn',
                    'tratu.soha.vn',
                    'test-english.com',
                    'langeek.co',
                    'rdsic.edu.vn',
                ];
                // Các pattern cho thấy kết quả là định nghĩa từ, không phải kết quả search thật
                const dictPatterns = [
                    /definition\b/i,
                    /meaning\b/i,
                    /nghĩa là gì/i,
                    /từ điển/i,
                    /tra từ/i,
                    /\bdefinition\b.*\bmeaning\b/i,
                ];
                for (let i = 0; i < checkCount; i++) {
                    const item = items[i];
                    const urlLower = item.url.toLowerCase();
                    const titleLower = item.title.toLowerCase();
                    // Kiểm tra URL thuộc domain từ điển
                    const isDictUrl = dictDomains.some((d) => urlLower.includes(d));
                    // Kiểm tra title có pattern từ điển
                    const isDictTitle = dictPatterns.some((p) => p.test(titleLower));
                    if (isDictUrl || isDictTitle) garbageCount++;
                }
                // Nếu 2/3 kết quả đầu là từ điển → rác
                return garbageCount >= 2;
            };

            // === HELPER: Fetch Bing với params giả lập trình duyệt ===
            const fetchBing = async (q: string): Promise<string> => {
                // ghc=1, lq=0, pq=query, cvid=uuid: giả lập params của session search thật
                // KHÔNG dùng credentials:'include' vì xung đột với Allow CORS extension
                // (extension set ACAO:* nhưng credentials yêu cầu ACAO:<specific-origin>)
                const cvid = Array.from(crypto.getRandomValues(new Uint8Array(16)))
                    .map((b) => b.toString(16).padStart(2, '0'))
                    .join('')
                    .toUpperCase();
                const bingUrl = `https://www.bing.com/search?q=${q}&qs=n&form=QBRE&sp=-1&ghc=1&lq=0&pq=${q}&cvid=${cvid}`;
                try {
                    const res = await fetch(bingUrl);
                    if (res.ok) return await res.text();
                } catch (_e) {
                    /* ignore */
                }
                return '';
            };

            // =====================================================
            // BƯỚC 1: SearXNG PRIMARY — meta-search engine tổng hợp
            //         nhiều nguồn, trả JSON sạch, không bị bot-mode
            // =====================================================
            const SEARXNG_INSTANCES = [
                'https://searx.be/search',
                'https://priv.au/search',
                'https://search.inetol.net/search',
                'https://searx.tiekoetter.com/search',
                'https://etsi.me/search',
            ];

            const fetchSearXNG = async (q: string): Promise<{ title: string; url: string; snippet: string }[]> => {
                // Thử các instances song song, lấy instance nào trả lời đúng trước
                const tryInstance = (base: string) =>
                    fetch(`${base}?q=${q}&format=json`, { signal: AbortSignal.timeout(5000) })
                        .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
                        .then((data: any) => {
                            const items = (data.results || []) as any[];
                            if (items.length === 0) return Promise.reject('no results');
                            return items.slice(0, 15).map((item: any) => ({
                                title: item.title || '',
                                url: item.url || '',
                                snippet: item.content || '',
                            }));
                        });

                // Race tất cả instances, lấy kết quả đầu tiên thành công
                return Promise.any(SEARXNG_INSTANCES.map(tryInstance)).catch(() => []);
            };

            console.log('[search] Searching SearXNG (primary)...');
            const searxResults = await fetchSearXNG(encodedQuery);

            if (searxResults.length > 0) {
                engine = 'SearXNG';
                results.push(...searxResults);
            }

            // =====================================================
            // BƯỚC 2: Bing SECONDARY — fallback nếu SearXNG fail
            //         (toàn bộ instances bị rate-limit/blocked)
            // =====================================================
            let bingHtml = '';
            let bingResults: { title: string; url: string; snippet: string }[] = [];
            if (results.length === 0) {
                console.log('[search] SearXNG failed. Searching Bing (secondary)...');
                bingHtml = await fetchBing(encodedQuery);
                bingResults = bingHtml ? parseBing(bingHtml) : [];

                // --- Quality Check + Smart Retry ---
                // Bing bot-mode chỉ parse từ ĐẦU TIÊN của query.
                // Nếu từ đó là adjective thông dụng (best, most, top...) → từ điển
                // Fix: đảo query để noun ý nghĩa lên đầu, hoặc bọc quotes.
                if (isGarbageResults(bingResults, query)) {
                    console.log('[search] Bing returned garbage. Trying smart retries...');

                    // Danh sách adjective/adverb thông dụng hay làm Bing bị ngáo
                    const leadingStopWords = [
                        'best',
                        'most',
                        'top',
                        'new',
                        'latest',
                        'upcoming',
                        'good',
                        'great',
                        'worst',
                        'all',
                        'every',
                        'some',
                        'many',
                        'few',
                        'several',
                        'tình',
                        'các',
                        'những',
                        'bộ',
                        'phim',
                        'cách',
                        'hướng',
                        'danh',
                    ];

                    // Chiến lược 1: Nếu từ đầu tiên là stop-word → đảo query
                    // VD: "best anime 2026" → "anime 2026 best"
                    const firstWord = query.trim().split(/\s+/)[0].toLowerCase();
                    let reorderedUsed = false;

                    if (leadingStopWords.includes(firstWord)) {
                        const words = query.trim().split(/\s+/);
                        const reordered = [...words.slice(1), words[0]].join(' ');
                        const reorderedEncoded = encodeURIComponent(reordered).replace(/%20/g, '+');
                        console.log(`[search] Reordering query: "${query}" → "${reordered}"`);
                        bingHtml = await fetchBing(reorderedEncoded);
                        const reorderedResults = bingHtml ? parseBing(bingHtml) : [];
                        if (reorderedResults.length > 0 && !isGarbageResults(reorderedResults, query)) {
                            bingResults = reorderedResults;
                            reorderedUsed = true;
                            console.log('[search] Reordered query returned good results!');
                        }
                    }

                    // Chiến lược 2: Bọc toàn bộ query trong ngoặc kép (tốt cho tiếng Việt)
                    if (!reorderedUsed) {
                        const quotedQuery = `%22${encodedQuery}%22`;
                        console.log('[search] Retrying with quoted query...');
                        bingHtml = await fetchBing(quotedQuery);
                        const quotedResults = bingHtml ? parseBing(bingHtml) : [];
                        if (quotedResults.length > 0 && !isGarbageResults(quotedResults, query)) {
                            bingResults = quotedResults;
                            console.log('[search] Quoted query returned good results!');
                        } else {
                            console.log('[search] All Bing retries failed or returned garbage.');
                        }
                    }
                }

                if (bingResults.length > 0) {
                    results.push(...bingResults);
                }
            } // end if SearXNG failed

            // =====================================================
            // BƯỚC 3: Fallback sang DuckDuckGo HTML POST
            // =====================================================
            if (results.length === 0) {
                console.log('[search] Bing returned 0 results. Falling back to DuckDuckGo HTML POST...');
                const ddgPostUrl = `https://html.duckduckgo.com/html/`;
                let ddgHtml = '';
                try {
                    const ddgRes = await fetch(ddgPostUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: `q=${encodedQuery}`,
                    });
                    if (ddgRes.ok) ddgHtml = await ddgRes.text();
                    else throw new Error('DDG HTML POST Not OK');
                } catch (_e) {
                    // DDG Lite GET via proxy
                    try {
                        const ddgLiteUrl = `https://lite.duckduckgo.com/lite/?q=${encodedQuery}`;
                        const ddgProxyUrl = `https://corsproxy.io/?${encodeURIComponent(ddgLiteUrl)}`;
                        const proxyRes = await fetch(ddgProxyUrl);
                        if (proxyRes.ok) ddgHtml = await proxyRes.text();
                    } catch (_e2) {
                        /* ignore */
                    }
                }

                if (ddgHtml) {
                    engine = 'DuckDuckGo';
                    const ddgDoc = parser.parseFromString(ddgHtml, 'text/html');

                    // Parse DDG HTML POST results
                    const resultElements = ddgDoc.querySelectorAll('.result');
                    if (resultElements.length > 0) {
                        resultElements.forEach((res) => {
                            const aEl = res.querySelector('h2.result__title a.result__a');
                            const snippetEl = res.querySelector('.result__snippet');
                            if (aEl) {
                                let link = aEl.getAttribute('href') || '';
                                if (link.startsWith('//')) link = 'https:' + link;
                                results.push({
                                    title: aEl.textContent?.trim() || '',
                                    url: link,
                                    snippet: snippetEl?.textContent?.trim() || '',
                                });
                            }
                        });
                    } else {
                        // Parse DDG Lite results (if proxy fallback was used)
                        const linkElements = ddgDoc.querySelectorAll('a.result-link');
                        const snippetElements = ddgDoc.querySelectorAll('td.result-snippet');
                        for (let i = 0; i < linkElements.length; i++) {
                            const aEl = linkElements[i];
                            const snippetEl = snippetElements[i];
                            if (aEl) {
                                let link = aEl.getAttribute('href') || '';
                                if (link.startsWith('//')) link = 'https:' + link;
                                results.push({
                                    title: aEl.textContent?.trim() || '',
                                    url: link,
                                    snippet: snippetEl?.textContent?.trim() || '',
                                });
                            }
                        }
                    }
                }
            }

            // =====================================================
            // BƯỚC 3: Fallback cuối cùng sang Google
            // =====================================================
            if (results.length === 0) {
                console.log('[search] DDG also failed. Falling back to Google...');
                const googleUrl = `https://www.google.com/search?q=${encodedQuery}`;
                let googleHtml = '';
                try {
                    const googleRes = await fetch(googleUrl);
                    if (googleRes.ok) googleHtml = await googleRes.text();
                } catch (_e) {
                    try {
                        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(googleUrl)}`;
                        const proxyRes = await fetch(proxyUrl);
                        if (proxyRes.ok) googleHtml = await proxyRes.text();
                    } catch (_e2) {
                        /* ignore */
                    }
                }

                if (googleHtml) {
                    engine = 'Google';
                    const googleDoc = parser.parseFromString(googleHtml, 'text/html');
                    const gElements = googleDoc.querySelectorAll('div.g');
                    gElements.forEach((g) => {
                        const aElement = g.querySelector('a');
                        const h3Element = g.querySelector('h3');
                        if (aElement && h3Element) {
                            const title = h3Element.textContent?.trim() || '';
                            const link = aElement.getAttribute('href');
                            if (title && link && link.startsWith('http')) {
                                let snippet = g.textContent?.trim() || '';
                                if (snippet.startsWith(title)) {
                                    snippet = snippet.substring(title.length).trim();
                                }
                                snippet = snippet
                                    .replace(/Translate this page/g, '')
                                    .replace(/Cached/g, '')
                                    .trim();
                                results.push({ title, url: link, snippet });
                            }
                        }
                    });
                }
            }

            // =====================================================
            // BƯỚC 4: Trả về kết quả hoặc raw text
            // =====================================================
            if (results.length === 0) {
                return {
                    content: JSON.stringify({
                        warning: 'Không trích xuất được kết quả từ bất kỳ search engine nào',
                        raw_text: bingHtml
                            ? parser.parseFromString(bingHtml, 'text/html')?.body?.textContent?.substring(0, 3000) || ''
                            : 'No text',
                    }),
                };
            }

            return {
                content: JSON.stringify({
                    query: query,
                    engine: engine,
                    results: results.slice(0, 15),
                }),
            };
        } catch (error: any) {
            return { content: JSON.stringify({ error: `Search failed: ${error.message}` }), isError: true };
        }
    },
};
