/**
 * Audio Manager Singleton
 * Quản lý vòng đời phát âm thanh, hàng đợi, tiến trình và sự kiện đồng bộ với UI Widget.
 */

import { MusicEngine, SongItem, LyricLine } from './music_engine';

export interface Playlist {
    id: string;
    name: string;
    createdAt: number;
    songs: SongItem[];
}

export type RepeatMode = 'all' | 'one' | 'none';

export interface AudioState {
    currentSong: SongItem | null;
    isPlaying: boolean;
    volume: number;
    currentTime: number;
    duration: number;
    currentLyric: string;
    queue: SongItem[];
    history: SongItem[];
    favorites: SongItem[];
    playlists: Playlist[];
    repeatMode: RepeatMode;
    shuffleMode: boolean;
}

export type StateChangeListener = (state: AudioState) => void;
export type TimeUpdateListener = (currentTime: number, duration: number, currentLyric: string) => void;

export class AudioManager {
    private static instance: AudioManager;
    private audio: HTMLAudioElement;

    private currentSong: SongItem | null = null;
    private isPlaying: boolean = false;
    private volume: number = 0.8;
    private lyrics: LyricLine[] = [];
    private currentLyric: string = '';
    private queue: SongItem[] = [];
    private history: SongItem[] = [];
    private favorites: SongItem[] = [];
    private playlists: Playlist[] = [];
    private repeatMode: RepeatMode = 'all';
    private shuffleMode: boolean = false;

    private stateListeners: Set<StateChangeListener> = new Set();
    private timeListeners: Set<TimeUpdateListener> = new Set();

    private readonly AUDIO_ELEMENT_ID = 'kaiz-agent-audio-player';
    private readonly STORAGE_VOLUME_KEY = 'kaiz_music_volume';
    private readonly STORAGE_HISTORY_KEY = 'kaiz_music_history';
    private readonly STORAGE_FAVORITES_KEY = 'kaiz_music_favorites';
    private readonly STORAGE_PLAYLISTS_KEY = 'kaiz_music_playlists';
    private readonly STORAGE_REPEAT_KEY = 'kaiz_music_repeat_mode';
    private readonly STORAGE_SHUFFLE_KEY = 'kaiz_music_shuffle_mode';

    private constructor() {
        this.audio = this.getOrCreateAudioElement();
        this.loadSettings();
        this.setupAudioEvents();
    }

    public static getInstance(): AudioManager {
        if (!AudioManager.instance) {
            AudioManager.instance = new AudioManager();
        }
        return AudioManager.instance;
    }

    private getOrCreateAudioElement(): HTMLAudioElement {
        let el = document.getElementById(this.AUDIO_ELEMENT_ID) as HTMLAudioElement | null;
        if (!el) {
            el = document.createElement('audio');
            el.id = this.AUDIO_ELEMENT_ID;
            el.style.display = 'none';
            document.body.appendChild(el);
        }
        return el;
    }

    private loadSettings(): void {
        try {
            const savedVol = localStorage.getItem(this.STORAGE_VOLUME_KEY);
            if (savedVol !== null) {
                const parsed = parseFloat(savedVol);
                if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
                    this.volume = parsed;
                }
            }
            this.audio.volume = this.volume;

            const savedHistory = localStorage.getItem(this.STORAGE_HISTORY_KEY);
            if (savedHistory) {
                const parsedHist = JSON.parse(savedHistory);
                if (Array.isArray(parsedHist)) {
                    this.history = parsedHist.slice(0, 30);
                }
            }

            const savedFavs = localStorage.getItem(this.STORAGE_FAVORITES_KEY);
            if (savedFavs) {
                const parsedFavs = JSON.parse(savedFavs);
                if (Array.isArray(parsedFavs)) {
                    this.favorites = parsedFavs;
                }
            }

            const savedPlaylists = localStorage.getItem(this.STORAGE_PLAYLISTS_KEY);
            if (savedPlaylists) {
                const parsedPlaylists = JSON.parse(savedPlaylists);
                if (Array.isArray(parsedPlaylists)) {
                    this.playlists = parsedPlaylists;
                }
            }

            const savedRepeat = localStorage.getItem(this.STORAGE_REPEAT_KEY);
            if (savedRepeat === 'all' || savedRepeat === 'one' || savedRepeat === 'none') {
                this.repeatMode = savedRepeat;
            }

            const savedShuffle = localStorage.getItem(this.STORAGE_SHUFFLE_KEY);
            if (savedShuffle !== null) {
                this.shuffleMode = savedShuffle === 'true';
            }
        } catch (e) {
            console.warn('[AudioManager] Lỗi đọc cấu hình từ localStorage:', e);
        }
    }

    private saveSettings(): void {
        try {
            localStorage.setItem(this.STORAGE_VOLUME_KEY, String(this.volume));
            localStorage.setItem(this.STORAGE_HISTORY_KEY, JSON.stringify(this.history.slice(0, 30)));
            localStorage.setItem(this.STORAGE_FAVORITES_KEY, JSON.stringify(this.favorites));
            localStorage.setItem(this.STORAGE_PLAYLISTS_KEY, JSON.stringify(this.playlists));
            localStorage.setItem(this.STORAGE_REPEAT_KEY, this.repeatMode);
            localStorage.setItem(this.STORAGE_SHUFFLE_KEY, String(this.shuffleMode));
        } catch (e) {
            console.warn('[AudioManager] Lỗi lưu cấu hình vào localStorage:', e);
        }
    }

    private setupAudioEvents(): void {
        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            this.notifyStateChange();
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            this.notifyStateChange();
        });

        this.audio.addEventListener('ended', () => {
            this.isPlaying = false;
            this.notifyStateChange();
            this.handleTrackEnded();
        });

        this.audio.addEventListener('timeupdate', () => {
            const curTime = this.audio.currentTime || 0;
            const dur = this.audio.duration || 0;

            // Tìm lời bài hát tương ứng với curTime
            if (this.lyrics.length > 0) {
                let matching = this.lyrics[0];
                for (let i = this.lyrics.length - 1; i >= 0; i--) {
                    if (curTime >= this.lyrics[i].time) {
                        matching = this.lyrics[i];
                        break;
                    }
                }
                if (matching && matching.text !== this.currentLyric) {
                    this.currentLyric = matching.text;
                }
            }

            this.timeListeners.forEach((listener) => {
                try {
                    listener(curTime, dur, this.currentLyric);
                } catch (err) {
                    console.error('[AudioManager] Lỗi trong timeListener:', err);
                }
            });
        });

        this.audio.addEventListener('error', (e) => {
            console.error('[AudioManager] Lỗi phát audio:', e);
            this.isPlaying = false;
            this.notifyStateChange();
        });
    }

    /**
     * Bắt đầu phát bài hát
     */
    public async playSong(
        song: SongItem,
        queueContext?: SongItem[],
    ): Promise<{ success: boolean; message: string; song?: SongItem }> {
        try {
            this.currentSong = song;
            this.currentLyric = 'Đang tải thông tin bài hát...';
            this.lyrics = [];
            this.notifyStateChange();

            if (queueContext && queueContext.length > 0) {
                this.queue = [...queueContext];
            }

            // Thêm vào lịch sử
            this.history = this.history.filter((s) => s.id !== song.id);
            this.history.unshift(song);
            this.saveSettings();

            // 1. Phân giải link phát
            const resolved = await MusicEngine.resolvePlayableSong(song);
            if (!resolved || !resolved.url) {
                this.currentLyric = 'Không tìm thấy link phát nhạc (Bản quyền).';
                this.notifyStateChange();
                return {
                    success: false,
                    message: `Không thể lấy link phát cho bài hát '${song.name}' (Khóa bản quyền trên tất cả các nguồn).`,
                };
            }

            const playableSong = resolved.song;
            this.currentSong = playableSong;

            // 2. Tải lời bài hát song song
            MusicEngine.getRawLyric(playableSong)
                .then((rawLrc) => {
                    if (rawLrc) {
                        this.lyrics = MusicEngine.parseLyrics(rawLrc);
                        if (this.lyrics.length > 0) {
                            this.currentLyric = this.lyrics[0].text;
                        } else {
                            this.currentLyric = '♪ Nhạc không lời hoặc không có lyric';
                        }
                    } else {
                        this.currentLyric = '♪ Không có lời bài hát';
                    }
                    this.notifyStateChange();
                })
                .catch(() => {
                    this.currentLyric = '♪ Không có lời bài hát';
                    this.notifyStateChange();
                });

            // 3. Nạp URL và phát
            this.audio.src = resolved.url;
            this.audio.currentTime = 0;
            this.audio.volume = this.volume;

            await this.audio.play();
            this.isPlaying = true;
            this.notifyStateChange();

            return {
                success: true,
                message: `Đang phát: ${playableSong.name} - ${playableSong.singer} (${playableSong.source.toUpperCase()})`,
                song: playableSong,
            };
        } catch (err: any) {
            console.error('[AudioManager] playSong error:', err);
            this.isPlaying = false;
            this.notifyStateChange();

            // Nếu lỗi do chính sách Autoplay của trình duyệt
            if (err.name === 'NotAllowedError') {
                return {
                    success: false,
                    message:
                        'Trình duyệt yêu cầu người dùng bấm tương tác trước khi tự động phát âm thanh (Autoplay Policy). Bạn có thể bấm nút Play trên Mini Widget để tiếp tục.',
                };
            }

            return {
                success: false,
                message: `Lỗi phát bài hát: ${err.message || String(err)}`,
            };
        }
    }

    public togglePlay(): void {
        if (!this.currentSong) return;
        if (this.isPlaying) {
            this.pause();
        } else {
            this.resume();
        }
    }

    public pause(): void {
        this.audio.pause();
        this.isPlaying = false;
        this.notifyStateChange();
    }

    public resume(): void {
        if (this.audio.src) {
            this.audio.play().catch((e) => console.warn('[AudioManager] resume error:', e));
            this.isPlaying = true;
            this.notifyStateChange();
        }
    }

    public stop(): void {
        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = '';
        this.isPlaying = false;
        this.currentSong = null;
        this.lyrics = [];
        this.currentLyric = '';
        this.notifyStateChange();
    }

    public setVolume(val: number): void {
        const clamped = Math.max(0, Math.min(1, val));
        this.volume = clamped;
        this.audio.volume = clamped;
        this.saveSettings();
        this.notifyStateChange();
    }

    public seekTo(seconds: number): void {
        if (!this.audio.duration) return;
        const clamped = Math.max(0, Math.min(this.audio.duration, seconds));
        this.audio.currentTime = clamped;
    }

    public seekPercent(pct: number): void {
        if (!this.audio.duration) return;
        const clampedPct = Math.max(0, Math.min(100, pct));
        this.audio.currentTime = (clampedPct / 100) * this.audio.duration;
    }

    private handleTrackEnded(): void {
        if (this.repeatMode === 'one' && this.currentSong) {
            this.audio.currentTime = 0;
            this.audio.play().catch((e) => console.warn('[AudioManager] repeat error:', e));
            this.isPlaying = true;
            this.notifyStateChange();
            return;
        }

        if (this.queue.length === 0) return;

        const currentIndex = this.queue.findIndex((s) => s.id === this.currentSong?.id);

        if (this.shuffleMode && this.queue.length > 1) {
            let randomIndex = currentIndex;
            while (randomIndex === currentIndex) {
                randomIndex = Math.floor(Math.random() * this.queue.length);
            }
            this.playSong(this.queue[randomIndex], this.queue);
            return;
        }

        if (currentIndex === this.queue.length - 1 && this.repeatMode === 'none') {
            this.stop();
            return;
        }

        this.playNext();
    }

    public playNext(): void {
        if (this.queue.length === 0) return;
        const currentIndex = this.queue.findIndex((s) => s.id === this.currentSong?.id);

        if (this.shuffleMode && this.queue.length > 1) {
            let randomIndex = currentIndex;
            while (randomIndex === currentIndex) {
                randomIndex = Math.floor(Math.random() * this.queue.length);
            }
            this.playSong(this.queue[randomIndex], this.queue);
            return;
        }

        const nextIndex = (currentIndex + 1) % this.queue.length;
        this.playSong(this.queue[nextIndex], this.queue);
    }

    public playPrev(): void {
        if (this.queue.length === 0) return;
        const currentIndex = this.queue.findIndex((s) => s.id === this.currentSong?.id);
        const prevIndex = (currentIndex - 1 + this.queue.length) % this.queue.length;
        this.playSong(this.queue[prevIndex], this.queue);
    }

    public setQueue(songs: SongItem[]): void {
        this.queue = [...songs];
        this.notifyStateChange();
    }

    public removeFromQueue(songId: string): void {
        this.queue = this.queue.filter((s) => s.id !== songId);
        this.notifyStateChange();
    }

    public clearQueue(): void {
        this.queue = [];
        this.notifyStateChange();
    }

    public saveQueueAsPlaylist(name: string): Playlist {
        return this.createPlaylist(name, [...this.queue]);
    }

    public toggleRepeatMode(): RepeatMode {
        if (this.repeatMode === 'all') {
            this.repeatMode = 'one';
        } else if (this.repeatMode === 'one') {
            this.repeatMode = 'none';
        } else {
            this.repeatMode = 'all';
        }
        this.saveSettings();
        this.notifyStateChange();
        return this.repeatMode;
    }

    public setRepeatMode(mode: RepeatMode): void {
        this.repeatMode = mode;
        this.saveSettings();
        this.notifyStateChange();
    }

    public toggleShuffleMode(): boolean {
        this.shuffleMode = !this.shuffleMode;
        this.saveSettings();
        this.notifyStateChange();
        return this.shuffleMode;
    }

    public setShuffleMode(enabled: boolean): void {
        this.shuffleMode = enabled;
        this.saveSettings();
        this.notifyStateChange();
    }

    public getState(): AudioState {
        return {
            currentSong: this.currentSong,
            isPlaying: this.isPlaying,
            volume: this.volume,
            currentTime: this.audio.currentTime || 0,
            duration: this.audio.duration || 0,
            currentLyric: this.currentLyric,
            queue: this.queue,
            history: this.history,
            favorites: this.favorites,
            playlists: this.playlists,
            repeatMode: this.repeatMode,
            shuffleMode: this.shuffleMode,
        };
    }

    // ==========================================
    // QUẢN LÝ PLAYLISTS & FAVORITES
    // ==========================================

    public getPlaylists(): Playlist[] {
        return this.playlists;
    }

    public getPlaylist(idOrName: string): Playlist | undefined {
        const query = idOrName.toLowerCase().trim();
        return this.playlists.find((p) => p.id === idOrName || p.name.toLowerCase() === query);
    }

    public createPlaylist(name: string, initialSongs: SongItem[] = []): Playlist {
        const cleanName = name.trim();
        const existing = this.getPlaylist(cleanName);
        if (existing) {
            return existing;
        }

        const newPlaylist: Playlist = {
            id: 'pl_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            name: cleanName,
            createdAt: Date.now(),
            songs: [...initialSongs],
        };

        this.playlists.push(newPlaylist);
        this.saveSettings();
        this.notifyStateChange();
        return newPlaylist;
    }

    public addSongToPlaylist(idOrName: string, song: SongItem): { success: boolean; message: string } {
        let pl = this.getPlaylist(idOrName);
        if (!pl) {
            pl = this.createPlaylist(idOrName, [song]);
            return {
                success: true,
                message: `Đã tạo mới playlist "${pl.name}" và thêm bài hát "${song.name}".`,
            };
        }

        if (pl.songs.some((s) => s.id === song.id)) {
            return {
                success: false,
                message: `Bài hát "${song.name}" đã tồn tại trong playlist "${pl.name}".`,
            };
        }

        pl.songs.push(song);
        this.saveSettings();
        this.notifyStateChange();
        return {
            success: true,
            message: `Đã thêm bài "${song.name}" vào playlist "${pl.name}".`,
        };
    }

    public removeSongFromPlaylist(idOrName: string, songId: string): { success: boolean; message: string } {
        const pl = this.getPlaylist(idOrName);
        if (!pl) {
            return { success: false, message: `Không tìm thấy playlist "${idOrName}".` };
        }

        const initialLen = pl.songs.length;
        pl.songs = pl.songs.filter((s) => s.id !== songId);
        if (pl.songs.length === initialLen) {
            return { success: false, message: `Bài hát với ID "${songId}" không nằm trong playlist "${pl.name}".` };
        }

        this.saveSettings();
        this.notifyStateChange();
        return { success: true, message: `Đã xóa bài hát khỏi playlist "${pl.name}".` };
    }

    public deletePlaylist(idOrName: string): { success: boolean; message: string } {
        const idx = this.playlists.findIndex(
            (p) => p.id === idOrName || p.name.toLowerCase() === idOrName.toLowerCase().trim(),
        );
        if (idx === -1) {
            return { success: false, message: `Không tìm thấy playlist "${idOrName}" để xóa.` };
        }

        const removed = this.playlists.splice(idx, 1)[0];
        this.saveSettings();
        this.notifyStateChange();
        return { success: true, message: `Đã xóa playlist "${removed.name}".` };
    }

    public async playPlaylist(
        idOrName: string,
        shuffle: boolean = false,
    ): Promise<{ success: boolean; message: string; count?: number }> {
        const pl = this.getPlaylist(idOrName);
        if (!pl) {
            return { success: false, message: `Không tìm thấy playlist "${idOrName}".` };
        }

        if (pl.songs.length === 0) {
            return { success: false, message: `Playlist "${pl.name}" hiện chưa có bài hát nào.` };
        }

        let songList = [...pl.songs];
        if (shuffle) {
            songList = this.shuffleArray(songList);
        }

        this.setQueue(songList);
        const playResult = await this.playSong(songList[0], songList);
        return {
            success: playResult.success,
            message: playResult.success
                ? `Đang phát playlist "${pl.name}" (${pl.songs.length} bài${shuffle ? ' - Trộn ngẫu nhiên' : ''}). Bài đầu tiên: ${songList[0].name}`
                : playResult.message,
            count: pl.songs.length,
        };
    }

    // ==========================================
    // FAVORITES
    // ==========================================

    public getFavorites(): SongItem[] {
        return this.favorites;
    }

    public isFavorite(songId: string): boolean {
        return this.favorites.some((s) => s.id === songId);
    }

    public toggleFavorite(song: SongItem): boolean {
        const idx = this.favorites.findIndex((s) => s.id === song.id);
        let isNowFav: boolean;
        if (idx >= 0) {
            this.favorites.splice(idx, 1);
            isNowFav = false;
        } else {
            this.favorites.unshift(song);
            isNowFav = true;
        }
        this.saveSettings();
        this.notifyStateChange();
        return isNowFav;
    }

    public async playFavorites(
        shuffle: boolean = false,
    ): Promise<{ success: boolean; message: string; count?: number }> {
        if (this.favorites.length === 0) {
            return { success: false, message: 'Danh sách Yêu thích của bạn hiện đang trống.' };
        }

        let songList = [...this.favorites];
        if (shuffle) {
            songList = this.shuffleArray(songList);
        }

        this.setQueue(songList);
        const playResult = await this.playSong(songList[0], songList);
        return {
            success: playResult.success,
            message: playResult.success
                ? `Đang phát danh sách Yêu thích (${this.favorites.length} bài${shuffle ? ' - Trộn ngẫu nhiên' : ''}). Bài đầu tiên: ${songList[0].name}`
                : playResult.message,
            count: this.favorites.length,
        };
    }

    private shuffleArray<T>(array: T[]): T[] {
        const arr = [...array];
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }

    public getLyrics(): LyricLine[] {
        return this.lyrics;
    }

    public onStateChange(listener: StateChangeListener): () => void {
        this.stateListeners.add(listener);
        listener(this.getState());
        return () => this.stateListeners.delete(listener);
    }

    public onTimeUpdate(listener: TimeUpdateListener): () => void {
        this.timeListeners.add(listener);
        return () => this.timeListeners.delete(listener);
    }

    private notifyStateChange(): void {
        const state = this.getState();
        this.stateListeners.forEach((listener) => {
            try {
                listener(state);
            } catch (err) {
                console.error('[AudioManager] Lỗi trong stateListener:', err);
            }
        });
    }
}
