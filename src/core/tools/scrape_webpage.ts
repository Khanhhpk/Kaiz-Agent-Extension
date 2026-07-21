import { ITool } from "../tool_registry";

export const scrapeWebpageTool: ITool = {
    schema: {
        name: "scrape_webpage",
        description: "Cào nội dung văn bản và trích xuất tất cả các đường link từ một URL. Sử dụng khi cần đọc thông tin từ một trang web (như wiki, fandom, bài báo) hoặc tìm kiếm các link liên quan để cào tiếp.",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description: "Đường link URL cần cào dữ liệu (VD: https://fandom.com/wiki/...)"
                }
            },
            required: ["url"]
        }
    },
    execute: async (args: any) => {
        try {
            const url = args.url;
            if (!url) {
                return { content: JSON.stringify({ error: "Missing 'url' parameter" }), isError: true };
            }

            // Fetch directly (assuming user has CORS extension enabled)
            const response = await fetch(url);
            
            if (!response.ok) {
                return { content: JSON.stringify({ error: `HTTP error! status: ${response.status}` }), isError: true };
            }

            const html = await response.text();
            
            // Parse HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");

            // Remove noise elements that shouldn't be in text
            const noiseSelectors = ['script', 'style', 'noscript', 'canvas', 'svg', 'iframe', 'video', 'audio', 'header', 'footer', 'nav'];
            noiseSelectors.forEach(selector => {
                const elements = doc.querySelectorAll(selector);
                elements.forEach(el => el.remove());
            });

            // Lấy nội dung chữ
            // Ưu tiên các thẻ chứa nội dung chính để sạch hơn nếu có thể, nhưng nếu không thấy thì lấy toàn bộ body
            let contentElement = doc.querySelector('main') || 
                                 doc.querySelector('#mw-content-text') || 
                                 doc.querySelector('#content') || 
                                 doc.body;

            const textContent = (contentElement as HTMLElement).innerText || "";

            // Lấy tất cả các links
            const baseUrl = new URL(url);
            const linksSet = new Set<string>();
            const extractedLinks: { text: string, url: string }[] = [];

            const anchorElements = doc.querySelectorAll('a');
            anchorElements.forEach(a => {
                const text = a.innerText?.trim();
                let href = a.getAttribute('href');
                
                if (text && href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('#')) {
                    try {
                        // Resolve relative URLs
                        const absoluteUrl = new URL(href, baseUrl.href).href;
                        // Avoid duplicates
                        if (!linksSet.has(absoluteUrl)) {
                            linksSet.add(absoluteUrl);
                            extractedLinks.push({ text, url: absoluteUrl });
                        }
                    } catch (e) {
                        // Ignore invalid URLs
                    }
                }
            });

            // Không giới hạn nội dung theo yêu cầu người dùng
            return {
                content: JSON.stringify({
                    url: baseUrl.href,
                    title: doc.title,
                    content: textContent.trim(),
                    links: extractedLinks
                })
            };

        } catch (error: any) {
            return { content: JSON.stringify({ error: `Scraping failed: ${error.message}` }), isError: true };
        }
    }
};
