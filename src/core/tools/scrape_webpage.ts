import { ITool } from '../tool_registry';

export const scrapeWebpageTool: ITool = {
    schema: {
        name: 'scrape_webpage',
        description:
            "CÔNG CỤ CÀO DỮ LIỆU TỪ INTERNET. Sử dụng công cụ này để bóc tách toàn bộ nội dung văn bản (text) thô và các đường link từ một địa chỉ URL bất kỳ (ví dụ: Wikipedia, Fandom, trang báo). Công cụ này được trang bị hệ thống vượt tường lửa (Cloudflare bypass) nên có thể đọc được các trang khó tính. Dùng nó khi bạn cần 'đọc' nội dung chi tiết của một trang web.",
        parameters: {
            type: 'object',
            properties: {
                url: {
                    type: 'string',
                    description: 'Đường link URL cần cào dữ liệu (VD: https://fandom.com/wiki/...)',
                },
            },
            required: ['url'],
        },
    },
    execute: async (args: any) => {
        try {
            const url = args.url;
            if (!url) {
                return { content: JSON.stringify({ error: "Missing 'url' parameter" }), isError: true };
            }
            // Fetch directly first
            let html = '';
            try {
                const response = await fetch(url);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                html = await response.text();
            } catch (err) {
                // Tự động Fallback sang Proxy nếu fetch gốc bị lỗi (do CORS của extension không cover được hết các trang)
                console.log('[scrape_webpage] Direct fetch failed, trying proxy...', err);
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
                const proxyRes = await fetch(proxyUrl);
                if (!proxyRes.ok) {
                    return {
                        content: JSON.stringify({
                            error: `Scraping failed both directly and via proxy: ${proxyRes.status}`,
                        }),
                        isError: true,
                    };
                }
                html = await proxyRes.text();
            }

            // Parse HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // Remove noise elements that shouldn't be in text
            const noiseSelectors = [
                'script',
                'style',
                'noscript',
                'canvas',
                'svg',
                'iframe',
                'video',
                'audio',
                'header',
                'footer',
                'nav',
            ];
            noiseSelectors.forEach((selector) => {
                const elements = doc.querySelectorAll(selector);
                elements.forEach((el) => el.remove());
            });

            // Lấy nội dung chữ
            // Ưu tiên các thẻ chứa nội dung chính để sạch hơn nếu có thể, nhưng nếu không thấy thì lấy toàn bộ body
            const contentElement =
                doc.querySelector('main') ||
                doc.querySelector('#mw-content-text') ||
                doc.querySelector('#content') ||
                doc.body;

            const textContent = (contentElement as HTMLElement).innerText || '';

            // Lấy tất cả các links
            const baseUrl = new URL(url);
            const linksSet = new Set<string>();
            const extractedLinks: { text: string; url: string }[] = [];

            const anchorElements = doc.querySelectorAll('a');
            anchorElements.forEach((a) => {
                const text = a.innerText?.trim();
                const href = a.getAttribute('href');

                if (
                    text &&
                    href &&
                    !href.startsWith('javascript:') &&
                    !href.startsWith('mailto:') &&
                    !href.startsWith('#')
                ) {
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
                    links: extractedLinks,
                }),
            };
        } catch (error: any) {
            return { content: JSON.stringify({ error: `Scraping failed: ${error.message}` }), isError: true };
        }
    },
};
