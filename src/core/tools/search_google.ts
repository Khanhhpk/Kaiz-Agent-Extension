import { ITool } from "../tool_registry";

export const searchGoogleTool: ITool = {
    schema: {
        name: "search_google",
        description: "Thực hiện tìm kiếm trên Google và trả về danh sách các kết quả (tiêu đề, link, tóm tắt). Sử dụng công cụ này để tìm hiểu thông tin mới hoặc tìm kiếm URL để sử dụng cho công cụ scrape_webpage.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Từ khóa cần tìm kiếm trên Google"
                }
            },
            required: ["query"]
        }
    },
    execute: async (args: any) => {
        try {
            const query = args.query;
            if (!query) {
                return { content: JSON.stringify({ error: "Missing 'query' parameter" }), isError: true };
            }

            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            let html = "";
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                html = await response.text();
            } catch (err) {
                // Tự động Fallback sang proxy nếu fetch gốc bị chặn
                console.log("[search_google] Direct fetch failed, trying proxy...", err);
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                const proxyRes = await fetch(proxyUrl);
                if (proxyRes.ok) {
                    html = await proxyRes.text();
                }
            }
            
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            const results: { title: string, url: string, snippet: string }[] = [];
            
            // Phân tích các khối kết quả tìm kiếm của Google (thường nằm trong div có class "g")
            const gElements = doc.querySelectorAll('div.g');
            
            gElements.forEach(g => {
                const aElement = g.querySelector('a');
                const h3Element = g.querySelector('h3');
                
                if (aElement && h3Element) {
                    const title = h3Element.innerText.trim();
                    const link = aElement.getAttribute('href');
                    
                    if (title && link && link.startsWith('http')) {
                        // Loại bỏ các thẻ con bên trong để lấy chữ (VD: span, div, vv)
                        // Snippet thường nằm trong một khối div bên dưới thẻ a/h3
                        // Một cách thô bạo nhưng hiệu quả là lấy toàn bộ text của khối g,
                        // sau đó loại bỏ phần Title ra.
                        let snippet = (g as HTMLElement).innerText.trim();
                        if (snippet.startsWith(title)) {
                            snippet = snippet.substring(title.length).trim();
                        }
                        
                        // Lọc một số rác (VD: "Translate this page", "Cached")
                        snippet = snippet.replace(/Translate this page/g, '').replace(/Cached/g, '').trim();

                        results.push({
                            title,
                            url: link,
                            snippet
                        });
                    }
                }
            });

            if (results.length === 0) {
                 console.log("[search_google] Google returned 0 results (maybe captcha). Falling back to DuckDuckGo...");
                 const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
                 let ddgHtml = "";
                 try {
                     const ddgRes = await fetch(ddgUrl);
                     if (ddgRes.ok) ddgHtml = await ddgRes.text();
                     else throw new Error("DDG Fetch Not OK");
                 } catch (e) {
                     // Proxy fallback for DuckDuckGo
                     const ddgProxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(ddgUrl)}`;
                     const proxyRes = await fetch(ddgProxyUrl);
                     if (proxyRes.ok) ddgHtml = await proxyRes.text();
                 }

                 if (ddgHtml) {
                     const ddgDoc = parser.parseFromString(ddgHtml, "text/html");
                     // Dùng CSS selector rộng hơn để bao phủ nhiều class của DDG
                     const ddgResults = ddgDoc.querySelectorAll('.result');
                     
                     ddgResults.forEach(res => {
                         const titleEl = res.querySelector('.result__title a');
                         const snippetEl = res.querySelector('.result__snippet');
                         const urlEl = res.querySelector('.result__url') || titleEl; // Fallback lấy href từ title nếu ko có url
                         
                         if (titleEl && snippetEl && urlEl) {
                             let link = urlEl.getAttribute('href') || '';
                             if (link.includes('uddg=')) {
                                 const match = link.match(/uddg=([^&]+)/);
                                 if (match) link = decodeURIComponent(match[1]);
                             } else if (link.startsWith('//')) {
                                 link = 'https:' + link;
                             }
                             
                             results.push({
                                 title: (titleEl as HTMLElement).innerText.trim(),
                                 url: link,
                                 snippet: (snippetEl as HTMLElement).innerText.trim()
                             });
                         }
                     });
                 }
                 
                 if (results.length === 0) {
                     return {
                         content: JSON.stringify({ 
                             warning: "Không trích xuất được kết quả theo chuẩn từ Google lẫn DuckDuckGo, trả về text thô của trang",
                             raw_text: doc.body.innerText.substring(0, 3000)
                         })
                     };
                 }
            }

            return {
                content: JSON.stringify({
                    query: query,
                    results: results.slice(0, 15) // Trả về tối đa 15 kết quả
                })
            };

        } catch (error: any) {
            return { content: JSON.stringify({ error: `Search failed: ${error.message}` }), isError: true };
        }
    }
};
