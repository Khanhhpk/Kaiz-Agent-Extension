/**
 * PNG Chunks Utility for SillyTavern Character Cards
 * Implements Tavern Character Card V2 and CCv3 specifications:
 * - Reads/writes standard PNG chunks
 * - Embeds card JSON in `tEXt` chunks with keywords 'chara' and 'ccv3'
 * - Extracts card metadata from PNG buffers
 * - Converts any image (WebP, JPG, URL) to standard PNG via Canvas
 */

export interface PngChunk {
    type: string;
    data: Uint8Array;
    crc: number;
}

// Precomputed CRC32 IEEE 802.3 table
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    CRC_TABLE[n] = c >>> 0;
}

export class PngChunkUtil {
    private static readonly PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    /**
     * Compute CRC32 checksum for a given buffer
     */
    public static crc32(buf: Uint8Array): number {
        let crc = 0xffffffff;
        const len = buf.length;
        for (let i = 0; i < len; i++) {
            crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
        }
        return (crc ^ 0xffffffff) >>> 0;
    }

    /**
     * Encode UTF-8 string to Base64 string
     */
    public static utf8ToBase64(str: string): string {
        if (typeof window !== 'undefined' && typeof window.btoa === 'function') {
            const bytes = new TextEncoder().encode(str);
            const CHUNK_SIZE = 0x8000; // 32KB chunks for fast processing without call stack overflow
            let binary = '';
            for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
                binary += String.fromCharCode.apply(
                    null,
                    bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length)) as any,
                );
            }
            return window.btoa(binary);
        } else if (typeof Buffer !== 'undefined') {
            return Buffer.from(str, 'utf8').toString('base64');
        }
        throw new Error('No base64 encoder available');
    }

    /**
     * Decode Base64 string to UTF-8 string
     */
    public static base64ToUtf8(b64: string): string {
        const cleanedB64 = b64.replace(/\s+/g, '');
        if (typeof window !== 'undefined' && typeof window.atob === 'function') {
            const binary = window.atob(cleanedB64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            return new TextDecoder('utf-8').decode(bytes);
        } else if (typeof Buffer !== 'undefined') {
            return Buffer.from(cleanedB64, 'base64').toString('utf8');
        }
        throw new Error('No base64 decoder available');
    }

    /**
     * Parse all chunks from a valid PNG buffer
     */
    public static parseChunks(buffer: Uint8Array): PngChunk[] {
        if (buffer.length < 8) {
            throw new Error('Buffer too small to be a PNG image');
        }
        for (let i = 0; i < 8; i++) {
            if (buffer[i] !== this.PNG_SIG[i]) {
                throw new Error('Invalid PNG signature');
            }
        }

        const chunks: PngChunk[] = [];
        let offset = 8;
        const totalLen = buffer.length;

        while (offset < totalLen) {
            if (offset + 12 > totalLen) {
                break;
            }
            const len =
                ((buffer[offset] << 24) |
                    (buffer[offset + 1] << 16) |
                    (buffer[offset + 2] << 8) |
                    buffer[offset + 3]) >>>
                0;

            let type = '';
            for (let i = 0; i < 4; i++) {
                type += String.fromCharCode(buffer[offset + 4 + i]);
            }

            const dataStart = offset + 8;
            const dataEnd = dataStart + len;
            if (dataEnd + 4 > totalLen) {
                break; // Corrupted or truncated chunk
            }

            const data = buffer.slice(dataStart, dataEnd);
            const crc =
                ((buffer[dataEnd] << 24) |
                    (buffer[dataEnd + 1] << 16) |
                    (buffer[dataEnd + 2] << 8) |
                    buffer[dataEnd + 3]) >>>
                0;

            chunks.push({ type, data, crc });
            offset = dataEnd + 4;
        }

        return chunks;
    }

    /**
     * Build binary PNG buffer from an array of chunks
     */
    public static buildPng(chunks: PngChunk[]): Uint8Array {
        let totalSize = 8;
        for (const c of chunks) {
            totalSize += 12 + c.data.length;
        }

        const out = new Uint8Array(totalSize);
        out.set(this.PNG_SIG, 0);

        let offset = 8;
        for (const c of chunks) {
            const len = c.data.length;
            out[offset] = (len >>> 24) & 0xff;
            out[offset + 1] = (len >>> 16) & 0xff;
            out[offset + 2] = (len >>> 8) & 0xff;
            out[offset + 3] = len & 0xff;

            const typeBytes = new Uint8Array(4);
            for (let i = 0; i < 4; i++) {
                typeBytes[i] = c.type.charCodeAt(i);
                out[offset + 4 + i] = typeBytes[i];
            }

            out.set(c.data, offset + 8);

            // Calculate CRC over type + data
            const crcBuf = new Uint8Array(4 + len);
            crcBuf.set(typeBytes, 0);
            crcBuf.set(c.data, 4);
            const chunkCrc = this.crc32(crcBuf);

            const crcOffset = offset + 8 + len;
            out[crcOffset] = (chunkCrc >>> 24) & 0xff;
            out[crcOffset + 1] = (chunkCrc >>> 16) & 0xff;
            out[crcOffset + 2] = (chunkCrc >>> 8) & 0xff;
            out[crcOffset + 3] = chunkCrc & 0xff;

            offset += 12 + len;
        }

        return out;
    }

    /**
     * Embed character card JSON into PNG chunks ('chara' and 'ccv3')
     */
    public static embedCardData(pngBuffer: Uint8Array, cardJson: object | string): Uint8Array {
        const jsonStr = typeof cardJson === 'string' ? cardJson : JSON.stringify(cardJson);
        const b64 = this.utf8ToBase64(jsonStr);
        const chunks = this.parseChunks(pngBuffer);

        // Filter out any pre-existing chara or ccv3 chunks
        const filtered = chunks.filter((c) => {
            if (c.type !== 'tEXt') return true;
            const nullIdx = c.data.indexOf(0);
            if (nullIdx === -1) return true;
            let kw = '';
            for (let i = 0; i < nullIdx; i++) {
                kw += String.fromCharCode(c.data[i]);
            }
            return kw !== 'chara' && kw !== 'ccv3';
        });

        const makeTextChunk = (keyword: string, text: string): PngChunk => {
            const kwBytes = new Uint8Array(keyword.length);
            for (let i = 0; i < keyword.length; i++) {
                kwBytes[i] = keyword.charCodeAt(i);
            }
            const textBytes = new TextEncoder().encode(text);
            const data = new Uint8Array(kwBytes.length + 1 + textBytes.length);
            data.set(kwBytes, 0);
            data[kwBytes.length] = 0; // null separator
            data.set(textBytes, kwBytes.length + 1);
            return { type: 'tEXt', data, crc: 0 };
        };

        const charaChunk = makeTextChunk('chara', b64);
        const ccv3Chunk = makeTextChunk('ccv3', b64);

        const ihdrIdx = filtered.findIndex((c) => c.type === 'IHDR');
        const insertIdx = ihdrIdx >= 0 ? ihdrIdx + 1 : 1;
        filtered.splice(insertIdx, 0, charaChunk, ccv3Chunk);

        return this.buildPng(filtered);
    }

    /**
     * Extract card data from PNG buffer (reads 'ccv3' or 'chara' chunk)
     */
    public static extractCardData(pngBuffer: Uint8Array): Record<string, any> | null {
        try {
            const chunks = this.parseChunks(pngBuffer);
            let charaData: string | null = null;
            let ccv3Data: string | null = null;

            for (const c of chunks) {
                if (c.type === 'tEXt') {
                    const nullIdx = c.data.indexOf(0);
                    if (nullIdx === -1) continue;
                    let kw = '';
                    for (let i = 0; i < nullIdx; i++) {
                        kw += String.fromCharCode(c.data[i]);
                    }
                    const textBytes = c.data.slice(nullIdx + 1);
                    const text = new TextDecoder('utf-8').decode(textBytes);
                    if (kw === 'ccv3') ccv3Data = text;
                    if (kw === 'chara') charaData = text;
                }
            }

            const targetB64 = ccv3Data || charaData;
            if (!targetB64) return null;
            let jsonStr = '';
            try {
                jsonStr = this.base64ToUtf8(targetB64.trim());
            } catch {
                jsonStr = targetB64.trim();
            }
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error('[PngChunkUtil] Error extracting card data:', e);
            return null;
        }
    }

    /**
     * Convert any image (URL, DataURL, WebP, JPG) into a standard PNG buffer using Canvas
     */
    public static async convertImageToPng(imageSourceUrl: string): Promise<Uint8Array> {
        // If it's already a DataURL PNG, we can decode it directly
        if (imageSourceUrl.startsWith('data:image/png;base64,')) {
            const b64 = imageSourceUrl.replace('data:image/png;base64,', '');
            if (typeof Buffer !== 'undefined') {
                return new Uint8Array(Buffer.from(b64, 'base64'));
            } else if (typeof window !== 'undefined') {
                const bin = window.atob(b64);
                const bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) {
                    bytes[i] = bin.charCodeAt(i);
                }
                return bytes;
            }
        }

        // In browser context: use Image + Canvas
        if (typeof document !== 'undefined') {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = img.naturalWidth || img.width || 400;
                        canvas.height = img.naturalHeight || img.height || 600;
                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            return reject(new Error('Canvas 2D context not available'));
                        }
                        ctx.drawImage(img, 0, 0);
                        canvas.toBlob((blob) => {
                            if (!blob) {
                                return reject(new Error('Failed to export canvas to PNG blob'));
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                                resolve(new Uint8Array(reader.result as ArrayBuffer));
                            };
                            reader.onerror = () => reject(reader.error);
                            reader.readAsArrayBuffer(blob);
                        }, 'image/png');
                    } catch (canvasErr) {
                        reject(canvasErr);
                    }
                };
                img.onerror = () => {
                    // Fallback to a clean 400x600 default canvas if image failed to load
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = 400;
                        canvas.height = 600;
                        const ctx = canvas.getContext('2d')!;
                        ctx.fillStyle = '#2c3e50';
                        ctx.fillRect(0, 0, 400, 600);
                        ctx.fillStyle = '#ecf0f1';
                        ctx.font = 'bold 24px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText('Character Card', 200, 300);
                        canvas.toBlob((blob) => {
                            if (!blob) return reject(new Error('Fallback canvas failed'));
                            const reader = new FileReader();
                            reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
                            reader.onerror = () => reject(reader.error);
                            reader.readAsArrayBuffer(blob);
                        }, 'image/png');
                    } catch (_e) {
                        reject(new Error('Image load failed and fallback canvas failed: ' + imageSourceUrl));
                    }
                };
                img.src = imageSourceUrl;
            });
        }

        // If outside browser (e.g. Node tests), create minimal 1x1 PNG fallback if needed
        return new Uint8Array([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
            0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d,
            0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ]);
    }
}
