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
            
            // Lấy HTML giả lập người dùng
            const response = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            
            if (!response.ok) {
                return { content: JSON.stringify({ error: `HTTP error! status: ${response.status}` }), isError: true };
            }

            const html = await response.text();
            
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
                 // Fallback nếu Google thay đổi DOM: trả về chữ thô của thẻ body chứa chữ
                 return {
                     content: JSON.stringify({ 
                         warning: "Không trích xuất được kết quả theo chuẩn, trả về text thô của trang",
                         raw_text: doc.body.innerText.substring(0, 3000)
                     })
                 };
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
