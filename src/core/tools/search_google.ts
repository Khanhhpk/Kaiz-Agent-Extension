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
            // BƯỚC 1: Bing là PRIMARY (engine duy nhất chấp nhận
            //         request từ extension có Allow CORS)
            // =====================================================
            console.log('[search] Searching Bing (primary)...');
            let bingHtml = await fetchBing(encodedQuery);
            let bingResults = bingHtml ? parseBing(bingHtml) : [];

            // --- Quality Check: Phát hiện kết quả rác ---
            // Bing bot-mode hay chỉ hiểu từ đầu tiên khi query dài
            // (VD: "tình hình thời tiết" → chỉ search "tình")
            // Nếu kết quả rác → retry với query bọc trong ngoặc kép
            if (isGarbageResults(bingResults, query)) {
                console.log('[search] Bing returned garbage (dictionary results). Retrying with quoted query...');
                const quotedQuery = `%22${encodedQuery}%22`;
                bingHtml = await fetchBing(quotedQuery);
                const retryResults = bingHtml ? parseBing(bingHtml) : [];

                if (retryResults.length > 0 && !isGarbageResults(retryResults, query)) {
                    // Quoted query cho kết quả tốt hơn
                    bingResults = retryResults;
                    console.log('[search] Quoted query returned good results!');
                } else {
                    console.log('[search] Quoted query also failed or returned garbage.');
                }
            }

            if (bingResults.length > 0) {
                results.push(...bingResults);
            }

            // =====================================================
            // BƯỚC 2: Fallback sang DuckDuckGo HTML POST nếu Bing thất bại
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
