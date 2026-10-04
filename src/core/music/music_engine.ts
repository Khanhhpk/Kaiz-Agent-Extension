/**
 * Music Engine Core
 * Trích xuất và hiện đại hóa từ app_music.js (Kaiz Collection v6.9)
 * Hỗ trợ tìm kiếm, phân giải URL stream từ Tencent, NetEase, KuGou, KuWo kèm Auto-Bypass VIP.
 */

export type MusicSource = 'tencent' | 'netease' | 'kugou' | 'kuwo';

export interface SongItem {
    id: string;
    mid?: string;
    name: string;
    singer: string;
    cover: string;
    source: MusicSource;
}

export interface LyricLine {
    time: number; // Thời gian tính bằng giây
    text: string;
}

export const DEFAULT_MUSIC_COVER =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">' +
            '<circle cx="100" cy="100" r="100" fill="#14161b"/>' +
            '<circle cx="100" cy="100" r="91" fill="none" stroke="#242732" stroke-width="1.5" opacity="0.6"/>' +
            '<circle cx="100" cy="100" r="82" fill="none" stroke="#1c1e26" stroke-width="1.2" opacity="0.5"/>' +
            '<circle cx="100" cy="100" r="73" fill="none" stroke="#242732" stroke-width="1.2" opacity="0.6"/>' +
            '<circle cx="100" cy="100" r="64" fill="none" stroke="#1c1e26" stroke-width="1" opacity="0.5"/>' +
            '<circle cx="100" cy="100" r="55" fill="none" stroke="#242732" stroke-width="1" opacity="0.6"/>' +
            '<circle cx="100" cy="100" r="41" fill="#1e2129" stroke="#d97706" stroke-width="2.5"/>' +
            '<circle cx="100" cy="100" r="37" fill="none" stroke="rgba(245,158,11,0.25)" stroke-width="1"/>' +
            '<g fill="#f59e0b">' +
            '<circle cx="93" cy="107" r="5"/>' +
            '<circle cx="107" cy="107" r="5"/>' +
            '<rect x="96" y="87" width="2.5" height="20" rx="1"/>' +
            '<rect x="110" y="87" width="2.5" height="20" rx="1"/>' +
            '<rect x="96" y="87" width="16.5" height="4" rx="1"/>' +
            '</g>' +
            '<circle cx="100" cy="100" r="8" fill="#0f1013" stroke="#333742" stroke-width="1.5"/>' +
            '<circle cx="100" cy="100" r="2.5" fill="#ffffff" opacity="0.3"/>' +
            '</svg>',
    );

function normalizeStr(str: string): string {
    return str ? str.trim().toLowerCase() : '';
}

export class MusicEngine {
    public static readonly sources: MusicSource[] = ['tencent', 'netease', 'kugou', 'kuwo'];

    /**
     * Fetch dữ liệu với cơ chế CORS Proxy fallback
     */
    public static async fetchWithFallback<T = any>(rawUrl: string): Promise<T | null> {
        try {
            const res = await fetch(rawUrl);
            if (res.ok) {
                return (await res.json()) as T;
            }
        } catch (_e) {
            // Thử tiếp qua CORS Proxy nếu direct fetch bị chặn
        }

        try {
            const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(rawUrl)}`;
            const resProxy = await fetch(proxyUrl);
            if (!resProxy.ok) {
                console.warn(`[MusicEngine] Proxy HTTP status ${resProxy.status}: ${rawUrl}`);
                return null;
            }
            return (await resProxy.json()) as T;
        } catch (errProxy) {
            console.warn(`[MusicEngine] Fetch thất bại cả direct và proxy: ${rawUrl}`, errProxy);
            return null;
        }
    }

    /**
     * Tìm kiếm bài hát trên một hoặc toàn bộ các nền tảng
     */
    public static async search(
        keyword: string,
        page: number = 1,
        sourceFilter: MusicSource | 'all' = 'all',
        limitPerSource: number = 10,
    ): Promise<SongItem[]> {
        const normKeyword = normalizeStr(keyword);
        if (!normKeyword) return [];

        const sourcesToSearch: MusicSource[] = sourceFilter === 'all' ? this.sources : [sourceFilter];

        const searchPromises = sourcesToSearch.map(async (src): Promise<SongItem[]> => {
            try {
                if (src === 'tencent') {
                    const url = `https://api.vkeys.cn/v2/music/tencent/search/song?word=${encodeURIComponent(
                        normKeyword,
                    )}&page=${page}&num=${limitPerSource}`;
                    const res = await this.fetchWithFallback<any>(url);
                    if (res && res.data && Array.isArray(res.data)) {
                        return res.data.map((item: any) => {
                            let singerStr = 'Unknown';
                            if (typeof item.singer === 'string') {
                                singerStr = item.singer;
                            } else if (Array.isArray(item.singer)) {
                                singerStr = item.singer
                                    .map((s: any) => (typeof s === 'string' ? s : s.name || ''))
                                    .filter(Boolean)
                                    .join(' / ');
                            }

                            let coverUrl = item.cover;
                            if (!coverUrl && item.albummid) {
                                coverUrl = `https://y.qq.com/music/photo_new/T002R300x300M000${item.albummid}.jpg`;
                            }
                            if (coverUrl && coverUrl.startsWith('http:')) {
                                coverUrl = coverUrl.replace('http:', 'https:');
                            }

                            return {
                                id: String(item.mid || item.id),
                                mid: item.mid,
                                name: item.song || item.songname || item.name || 'Unknown',
                                singer: singerStr || 'Unknown',
                                cover: coverUrl || DEFAULT_MUSIC_COVER,
                                source: 'tencent' as MusicSource,
                            };
                        });
                    }
                } else if (src === 'kugou') {
                    const url = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(
                        normKeyword,
                    )}&page=${page}&pagesize=${limitPerSource}&showtype=1`;
                    const res = await this.fetchWithFallback<any>(url);
                    if (res && res.data && res.data.info && Array.isArray(res.data.info)) {
                        return res.data.info.map((item: any) => ({
                            id: String(item.hash || item.filehash),
                            mid: item.hash || item.filehash,
                            name: item.songname || item.filename || 'Unknown',
                            singer: item.singername || 'Unknown',
                            cover: DEFAULT_MUSIC_COVER,
                            source: 'kugou' as MusicSource,
                        }));
                    }
                } else {
                    // NetEase ('netease') hoặc KuWo ('kuwo')
                    const url = `https://music-api.gdstudio.xyz/api.php?types=search&source=${src}&name=${encodeURIComponent(
                        normKeyword,
                    )}&count=${limitPerSource}&pages=${page}`;
                    const data = await this.fetchWithFallback<any[]>(url);
                    if (data && Array.isArray(data)) {
                        return data.map((item: any) => {
                            let coverUrl = item.pic || item.cover || item.pic_url || item.cover_url || item.pic120;
                            if (!coverUrl && item.al && item.al.picUrl) coverUrl = item.al.picUrl;
                            if (!coverUrl && item.album && item.album.picUrl) coverUrl = item.album.picUrl;

                            if (coverUrl) {
                                if (coverUrl.startsWith('http:')) coverUrl = coverUrl.replace('http:', 'https:');
                                if (!coverUrl.startsWith('data:')) {
                                    coverUrl = `https://wsrv.nl/?url=${encodeURIComponent(coverUrl)}`;
                                }
                            }

                            let singerName = 'Unknown';
                            if (Array.isArray(item.artist)) {
                                singerName = item.artist
                                    .map((a: any) => (typeof a === 'string' ? a : a.name || ''))
                                    .filter(Boolean)
                                    .join(' / ');
                            } else if (typeof item.artist === 'string') {
                                singerName = item.artist;
                            } else if (typeof item.singer === 'string') {
                                singerName = item.singer;
                            }

                            return {
                                id: String(item.id || item.mid),
                                mid: String(item.lyric_id || item.mid || item.id),
                                name: item.name || item.song || 'Unknown',
                                singer: singerName || 'Unknown',
                                cover: coverUrl || DEFAULT_MUSIC_COVER,
                                source: src,
                            };
                        });
                    }
                }
            } catch (err) {
                console.warn(`[MusicEngine] Lỗi tìm kiếm nguồn ${src}:`, err);
            }
            return [];
        });

        const resultsArray = await Promise.allSettled(searchPromises);
        const allResults: SongItem[] = [];

        resultsArray.forEach((res) => {
            if (res.status === 'fulfilled' && Array.isArray(res.value)) {
                res.value.forEach((song) => {
                    if (
                        !allResults.some(
                            (s) =>
                                normalizeStr(s.name) === normalizeStr(song.name) &&
                                normalizeStr(s.singer) === normalizeStr(song.singer),
                        )
                    ) {
                        allResults.push(song);
                    }
                });
            }
        });

        return allResults;
    }

    /**
     * Lấy trực tiếp URL phát nhạc từ nguồn gốc
     */
    public static async getDirectUrl(song: SongItem): Promise<string | null> {
        const src = song.source || 'tencent';
        try {
            if (src === 'tencent') {
                const idParam = song.mid ? `mid=${song.mid}` : `id=${song.id}`;
                const urlReq = `https://api.vkeys.cn/v2/music/tencent?${idParam}`;
                const res = await this.fetchWithFallback<any>(urlReq);
                if (res && res.data && res.data.url) return res.data.url;
            } else {
                const urlReq = `https://music-api.gdstudio.xyz/api.php?types=url&source=${src}&id=${song.id}&br=320`;
                const data = await this.fetchWithFallback<any>(urlReq);
                if (data && data.url && !data.url.includes('music.163.com/404')) {
                    return data.url;
                }
            }
        } catch (e) {
            console.warn(`[MusicEngine] Không thể lấy direct URL cho ${song.name}:`, e);
        }
        return null;
    }

    /**
     * Lấy URL phát nhạc kèm cơ chế Auto-Bypass VIP tự động tìm nguồn thay thế
     */
    public static async resolvePlayableSong(song: SongItem): Promise<{ url: string; song: SongItem } | null> {
        // 1. Thử lấy từ nguồn gốc trước
        const directUrl = await this.getDirectUrl(song);
        if (directUrl) {
            return { url: directUrl, song };
        }

        // 2. Kích hoạt Auto-Bypass VIP: tìm bài trên các nguồn khác
        console.log(
            `[MusicEngine] Bài hát '${song.name}' có thể bị khóa VIP ở nguồn ${song.source}. Đang quét nguồn thay thế...`,
        );
        const mainSinger = (song.singer || '').split('/')[0].trim();
        const fallbackQuery = `${song.name} ${mainSinger}`.trim();
        const fallbackSources = this.sources.filter((s) => s !== song.source);

        for (const src of fallbackSources) {
            try {
                const results = await this.search(fallbackQuery, 1, src, 5);
                if (results && results.length > 0) {
                    for (const candidate of results) {
                        const fallbackUrl = await this.getDirectUrl(candidate);
                        if (fallbackUrl) {
                            console.log(`[MusicEngine] Đã tự động thay thế bằng nguồn: ${src.toUpperCase()}`);
                            return {
                                url: fallbackUrl,
                                song: {
                                    ...candidate,
                                    // Giữ ảnh bìa cũ nếu bài candidate là cover mặc định
                                    cover: candidate.cover !== DEFAULT_MUSIC_COVER ? candidate.cover : song.cover,
                                },
                            };
                        }
                    }
                }
            } catch (_err) {
                continue;
            }
        }

        return null;
    }

    /**
     * Lấy lời bài hát thô
     */
    public static async getRawLyric(song: SongItem): Promise<string | null> {
        const src = song.source || 'tencent';
        try {
            if (src === 'tencent') {
                const idParam = song.mid ? `mid=${song.mid}` : `id=${song.id}`;
                const urlReq = `https://api.vkeys.cn/v2/music/tencent/lyric?${idParam}`;
                const res = await this.fetchWithFallback<any>(urlReq);
                if (res && res.data && res.data.lyric) return res.data.lyric;
            } else {
                const queryId = song.mid || song.id;
                const urlReq = `https://music-api.gdstudio.xyz/api.php?types=lyric&source=${src}&id=${queryId}`;
                const data = await this.fetchWithFallback<any>(urlReq);
                if (data && data.lyric) return data.lyric;
            }
        } catch (e) {
            console.warn(`[MusicEngine] Lấy lời bài hát thất bại cho ${song.name}:`, e);
        }
        return null;
    }

    /**
     * Phân giải chuỗi LRC thành mảng mốc thời gian { time, text }
     */
    public static parseLyrics(rawLrc: string): LyricLine[] {
        if (!rawLrc) return [];
        const lines = rawLrc.split('\n');
        const re = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/g;
        const result: LyricLine[] = [];

        lines.forEach((line) => {
            const matches: RegExpExecArray[] = [];
            let match: RegExpExecArray | null;
            while ((match = re.exec(line)) !== null) {
                matches.push(match);
            }
            re.lastIndex = 0;
            const text = line.replace(re, '').trim();

            if (matches.length > 0 && text) {
                matches.forEach((m) => {
                    const min = parseInt(m[1], 10);
                    const sec = parseInt(m[2], 10);
                    const ms = parseInt(m[3], 10);
                    const timeInSeconds = min * 60 + sec + (m[3].length === 2 ? ms / 100 : ms / 1000);
                    result.push({ time: timeInSeconds, text });
                });
            }
        });

        result.sort((a, b) => a.time - b.time);
        return result;
    }
}
