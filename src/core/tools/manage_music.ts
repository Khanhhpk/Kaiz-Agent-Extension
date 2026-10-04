/**
 * Tool: manage_music
 * Công cụ đa năng cho Agent: Tìm kiếm nhạc, duyệt danh sách (surf list), phát nhạc và điều khiển playback.
 */

import { ITool, ToolResult } from '../tool_registry';
import { MusicEngine, MusicSource, SongItem } from '../music/music_engine';
import { AudioManager } from '../music/audio_manager';
import { MusicPlayerWidget } from '../../ui/music_player_widget';

// Cache kết quả tìm kiếm gần nhất để Agent có thể chọn nhanh theo song_id
const searchCache: Map<string, SongItem> = new Map();

export const manageMusicTool: ITool = {
    schema: {
        name: 'manage_music',
        description:
            'CÔNG CỤ TÌM KIẾM VÀ PHÁT NHẠC ĐA NỀN TẢNG (Tencent, NetEase, KuGou, KuWo) KÈM AUTO-BYPASS VIP. ' +
            'Dùng khi người dùng yêu cầu bật nhạc, tìm bài hát, đổi bài, chỉnh âm lượng hoặc xem lời bài hát. ' +
            'Quy trình khuyến nghị: ' +
            '1) Gọi action="search" với query để tìm danh sách bài hát (mặc định trả về 20 bài; AI có thể tùy chỉnh tham số "limit" từ 5-50 hoặc tăng "page" để mở rộng nếu chưa thấy bài mong muốn); ' +
            '2) Đọc/lướt qua kết quả (surf list) để chọn bài đúng nhất, sau đó gọi action="play" với song_id của bài đó; ' +
            '3) Hoặc nếu người dùng muốn nghe ngay, có thể gọi trực tiếp action="play" với query để phát bài đầu tiên tìm thấy.',
        userDescription: 'Tìm kiếm và phát nhạc trực tuyến từ nhiều nền tảng với giao diện Mini Player nổi.',
        parameters: {
            type: 'object',
            properties: {
                action: {
                    type: 'string',
                    description:
                        'Hành động cần thực hiện: "search" (tìm bài hát), "play" (phát nhạc), "control" (điều khiển playback), "get_status" (xem trạng thái hiện tại), "get_lyrics" (lấy lời bài hát), "playlist" (quản lý danh sách phát theo tên/chủ đề), "favorite" (quản lý danh sách bài hát yêu thích).',
                    enum: ['search', 'play', 'control', 'get_status', 'get_lyrics', 'playlist', 'favorite'],
                },
                query: {
                    type: 'string',
                    description:
                        'Từ khóa tìm kiếm (Tên bài hát, ca sĩ, thể loại nhạc) khi dùng action="search" hoặc action="play".',
                },
                source: {
                    type: 'string',
                    description:
                        'Nền tảng tìm kiếm: "all" (quét tất cả các nguồn - khuyến nghị), "tencent" (QQ Music), "netease" (NetEase 163), "kugou", "kuwo". Mặc định là "all".',
                    enum: ['all', 'tencent', 'netease', 'kugou', 'kuwo'],
                },
                song_id: {
                    type: 'string',
                    description:
                        'ID của bài hát (dùng với action="play", action="playlist" khi thêm/xóa bài, hoặc action="favorite" để thêm bài yêu thích).',
                },
                command: {
                    type: 'string',
                    description:
                        'Lệnh điều khiển khi dùng action="control": "pause" (tạm dừng), "resume" (tiếp tục), "stop" (dừng hẳn), "next" (bài tiếp theo), "prev" (bài trước), "volume" (chỉnh âm lượng), "seek" (tua nhạc), "repeat" (đổi chế độ lặp lại all/one/none), "shuffle" (bật/tắt phát ngẫu nhiên), "clear_queue" (xóa hàng đợi), "show_widget" (hiển thị Widget), "hide_widget" (ẩn Widget), "toggle_widget" (bật/tắt hiển thị Widget).',
                    enum: [
                        'pause',
                        'resume',
                        'stop',
                        'next',
                        'prev',
                        'volume',
                        'seek',
                        'repeat',
                        'shuffle',
                        'clear_queue',
                        'show_widget',
                        'hide_widget',
                        'toggle_widget',
                    ],
                },
                mode: {
                    type: 'string',
                    description:
                        'Chế độ lặp lại khi dùng command="repeat": "all" (lặp cả danh sách), "one" (lặp 1 bài), "none" (không lặp lại, hết danh sách dừng). Mặc định là toggle.',
                    enum: ['all', 'one', 'none'],
                },
                value: {
                    type: 'number',
                    description:
                        'Giá trị cho lệnh control: mức âm lượng từ 0.0 đến 1.0 (cho command="volume") hoặc số giây cần tua tới (cho command="seek").',
                },
                page: {
                    type: 'number',
                    description:
                        'Số thứ tự trang kết quả tìm kiếm (bắt đầu từ 1, mặc định 1). Nếu không tìm thấy hoặc muốn mở rộng thêm bài hát khác, AI có thể gọi lại với page=2, 3...',
                },
                limit: {
                    type: 'number',
                    description:
                        'Số lượng kết quả tối đa trả về cho AI (mặc định 20 bài, AI có thể tự quyết định điều chỉnh từ 5 đến 50 tùy theo nhu cầu hoặc độ bao quát).',
                },
                playlist_command: {
                    type: 'string',
                    description:
                        'Lệnh quản lý playlist khi dùng action="playlist": "create" (tạo mới), "add" (thêm bài hát vào playlist), "remove" (xóa bài khỏi playlist), "delete" (xóa cả playlist), "list" (liệt kê các playlist đã lưu), "play" (phát toàn bộ playlist), "save_queue" (lưu toàn bộ hàng đợi đang phát thành playlist mới).',
                    enum: ['create', 'add', 'remove', 'delete', 'list', 'play', 'save_queue'],
                },
                playlist_name: {
                    type: 'string',
                    description:
                        'Tên danh sách phát (ví dụ: "Nhạc chill học bài", "Anime OST", "Nhạc cày code") khi dùng action="playlist".',
                },
                favorite_command: {
                    type: 'string',
                    description:
                        'Lệnh quản lý danh sách yêu thích khi dùng action="favorite": "toggle" (thêm hoặc xóa bài khỏi danh sách yêu thích), "list" (xem danh sách yêu thích), "play" (phát toàn bộ danh sách yêu thích).',
                    enum: ['toggle', 'list', 'play'],
                },
                shuffle: {
                    type: 'boolean',
                    description:
                        'Bật chế độ phát ngẫu nhiên (trộn bài) khi phát playlist hoặc danh sách yêu thích. Mặc định là false.',
                },
            },
            required: ['action'],
        },
    },
    execute: async (args: any): Promise<ToolResult> => {
        try {
            const action = args.action;
            const audioManager = AudioManager.getInstance();

            // Đảm bảo Widget Mini Player đã được khởi tạo
            MusicPlayerWidget.getInstance().init();

            // ==========================================
            // 1. ACTION: SEARCH
            // ==========================================
            if (action === 'search') {
                const query = args.query;
                if (!query || typeof query !== 'string' || !query.trim()) {
                    return {
                        content: JSON.stringify({
                            error: 'Tham số "query" là bắt buộc khi thực hiện action="search".',
                        }),
                        isError: true,
                    };
                }

                const sourceFilter: MusicSource | 'all' = args.source || 'all';
                const page = Math.max(1, typeof args.page === 'number' ? args.page : 1);
                const limit = Math.min(50, Math.max(1, typeof args.limit === 'number' ? args.limit : 20));
                const perSource = sourceFilter === 'all' ? Math.max(10, Math.ceil(limit / 2)) : limit;

                console.log(
                    `[Tool: manage_music] Đang tìm kiếm: "${query}" (Nguồn: ${sourceFilter}, Trang: ${page}, Limit: ${limit})`,
                );
                const songs = await MusicEngine.search(query.trim(), page, sourceFilter, perSource);

                if (!songs || songs.length === 0) {
                    return {
                        content: JSON.stringify({
                            success: false,
                            page,
                            message: `Không tìm thấy bài hát nào ở trang ${page} với từ khóa "${query}". AI có thể thử đổi từ khóa, tìm theo tên ca sĩ khác hoặc thử trang khác.`,
                            results: [],
                        }),
                        isError: false,
                    };
                }

                // Lưu vào cache
                songs.forEach((song) => {
                    searchCache.set(song.id, song);
                });

                // Rút gọn kết quả để gửi về cho LLM (tiết kiệm token)
                const formattedResults = songs.slice(0, limit).map((s, idx) => ({
                    index: idx + 1,
                    song_id: s.id,
                    name: s.name,
                    singer: s.singer,
                    source: s.source,
                }));

                return {
                    content: JSON.stringify({
                        success: true,
                        query: query.trim(),
                        page,
                        limit,
                        total_found: formattedResults.length,
                        message: `Tìm thấy ${formattedResults.length} bài hát (Trang ${page}). AI có thể duyệt danh sách và chọn bài phát theo song_id tương ứng. Nếu muốn mở rộng thêm kết quả, AI có thể gọi lại search với page=${page + 1}.`,
                        results: formattedResults,
                    }),
                    isError: false,
                };
            }

            // ==========================================
            // 2. ACTION: PLAY
            // ==========================================
            if (action === 'play') {
                let targetSong: SongItem | null = null;

                // Trường hợp 1: Có song_id cụ thể từ kết quả tìm kiếm
                if (args.song_id) {
                    const songId = String(args.song_id);
                    targetSong = searchCache.get(songId) || null;

                    // Nếu không có trong cache, thử tìm lại từ source
                    if (!targetSong && args.query) {
                        const fallbackList = await MusicEngine.search(args.query, 1, args.source || 'all', 5);
                        targetSong = fallbackList.find((s) => s.id === songId) || null;
                    }
                }

                // Trường hợp 2: Không có song_id nhưng có query tìm kiếm -> Tự động tìm và chọn bài đầu tiên
                if (!targetSong && args.query) {
                    const searchResults = await MusicEngine.search(args.query, 1, args.source || 'all', 5);
                    if (searchResults && searchResults.length > 0) {
                        targetSong = searchResults[0];
                        searchResults.forEach((s) => searchCache.set(s.id, s));
                        audioManager.setQueue(searchResults);
                    }
                }

                if (!targetSong) {
                    return {
                        content: JSON.stringify({
                            error: 'Không xác định được bài hát cần phát. Vui lòng cung cấp "song_id" hợp lệ từ kết quả tìm kiếm hoặc cung cấp "query" để tìm bài mới.',
                        }),
                        isError: true,
                    };
                }

                console.log(`[Tool: manage_music] Bắt đầu phát bài: ${targetSong.name} - ${targetSong.singer}`);
                const playResult = await audioManager.playSong(targetSong);

                if (!playResult.success) {
                    return {
                        content: JSON.stringify({
                            success: false,
                            error: playResult.message,
                        }),
                        isError: true,
                    };
                }

                return {
                    content: JSON.stringify({
                        success: true,
                        message: playResult.message,
                        now_playing: {
                            id: playResult.song?.id || targetSong.id,
                            name: playResult.song?.name || targetSong.name,
                            singer: playResult.song?.singer || targetSong.singer,
                            source: playResult.song?.source || targetSong.source,
                        },
                    }),
                    isError: false,
                };
            }

            // ==========================================
            // 3. ACTION: CONTROL
            // ==========================================
            if (action === 'control') {
                const cmd = args.command;
                if (!cmd) {
                    return {
                        content: JSON.stringify({
                            error: 'Tham số "command" là bắt buộc khi dùng action="control".',
                        }),
                        isError: true,
                    };
                }

                switch (cmd) {
                    case 'pause':
                        audioManager.pause();
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: 'Đã tạm dừng phát nhạc.',
                            }),
                            isError: false,
                        };

                    case 'resume':
                        audioManager.resume();
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: 'Đã tiếp tục phát nhạc.',
                            }),
                            isError: false,
                        };

                    case 'stop':
                        audioManager.stop();
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: 'Đã dừng phát nhạc và đóng trình phát.',
                            }),
                            isError: false,
                        };

                    case 'next':
                        audioManager.playNext();
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: 'Đã chuyển sang bài hát kế tiếp.',
                            }),
                            isError: false,
                        };

                    case 'prev':
                        audioManager.playPrev();
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: 'Đã chuyển về bài hát trước đó.',
                            }),
                            isError: false,
                        };

                    case 'volume': {
                        if (typeof args.value !== 'number') {
                            return {
                                content: JSON.stringify({
                                    error: 'Tham số "value" (từ 0.0 đến 1.0) là bắt buộc khi chỉnh âm lượng.',
                                }),
                                isError: true,
                            };
                        }
                        audioManager.setVolume(args.value);
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: `Đã chỉnh âm lượng lên ${Math.round(args.value * 100)}%.`,
                            }),
                            isError: false,
                        };
                    }

                    case 'seek': {
                        if (typeof args.value !== 'number') {
                            return {
                                content: JSON.stringify({
                                    error: 'Tham số "value" (số giây) là bắt buộc khi tua bài hát.',
                                }),
                                isError: true,
                            };
                        }
                        audioManager.seekTo(args.value);
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: `Đã tua bài hát tới mốc ${args.value} giây.`,
                            }),
                            isError: false,
                        };
                    }

                    case 'show_widget': {
                        MusicPlayerWidget.getInstance().show();
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: 'Đã hiển thị Mini Player Widget trên màn hình.',
                            }),
                            isError: false,
                        };
                    }

                    case 'hide_widget': {
                        MusicPlayerWidget.getInstance().hide();
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: 'Đã ẩn Mini Player Widget (nhạc vẫn tiếp tục phát trong nền).',
                            }),
                            isError: false,
                        };
                    }

                    case 'toggle_widget': {
                        MusicPlayerWidget.getInstance().toggle();
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: 'Đã bật/tắt hiển thị Mini Player Widget.',
                            }),
                            isError: false,
                        };
                    }

                    case 'repeat': {
                        if (args.mode && ['all', 'one', 'none'].includes(args.mode)) {
                            audioManager.setRepeatMode(args.mode);
                        } else {
                            audioManager.toggleRepeatMode();
                        }
                        const curMode = audioManager.getState().repeatMode;
                        return {
                            content: JSON.stringify({
                                success: true,
                                repeat_mode: curMode,
                                message: `Chế độ lặp lại: ${curMode === 'one' ? 'Lặp 1 bài (repeat-one)' : curMode === 'all' ? 'Lặp toàn bộ danh sách (repeat-all)' : 'Không lặp lại (off)'}.`,
                            }),
                            isError: false,
                        };
                    }

                    case 'shuffle': {
                        if (typeof args.shuffle === 'boolean') {
                            audioManager.setShuffleMode(args.shuffle);
                        } else {
                            audioManager.toggleShuffleMode();
                        }
                        const isShuff = audioManager.getState().shuffleMode;
                        return {
                            content: JSON.stringify({
                                success: true,
                                shuffle_mode: isShuff,
                                message: `Chế độ phát ngẫu nhiên (Shuffle): ${isShuff ? 'BẬT' : 'TẮT'}.`,
                            }),
                            isError: false,
                        };
                    }

                    case 'clear_queue': {
                        audioManager.clearQueue();
                        return {
                            content: JSON.stringify({
                                success: true,
                                message: 'Đã xóa toàn bộ hàng đợi phát nhạc.',
                            }),
                            isError: false,
                        };
                    }

                    default:
                        return {
                            content: JSON.stringify({
                                error: `Lệnh control không hợp lệ: "${cmd}".`,
                            }),
                            isError: true,
                        };
                }
            }

            // ==========================================
            // 4. ACTION: GET_STATUS
            // ==========================================
            if (action === 'get_status') {
                const state = audioManager.getState();
                return {
                    content: JSON.stringify({
                        success: true,
                        is_playing: state.isPlaying,
                        current_song: state.currentSong
                            ? {
                                  name: state.currentSong.name,
                                  singer: state.currentSong.singer,
                                  source: state.currentSong.source,
                              }
                            : null,
                        current_time_sec: Math.floor(state.currentTime),
                        duration_sec: Math.floor(state.duration),
                        volume_percent: Math.round(state.volume * 100),
                        repeat_mode: state.repeatMode,
                        shuffle_mode: state.shuffleMode,
                        queue_count: state.queue.length,
                        current_lyric: state.currentLyric || null,
                    }),
                    isError: false,
                };
            }

            // ==========================================
            // 5. ACTION: GET_LYRICS
            // ==========================================
            if (action === 'get_lyrics') {
                const state = audioManager.getState();
                if (!state.currentSong) {
                    return {
                        content: JSON.stringify({
                            success: false,
                            message: 'Hiện không có bài hát nào đang được phát.',
                        }),
                        isError: false,
                    };
                }

                const lyrics = audioManager.getLyrics();
                return {
                    content: JSON.stringify({
                        success: true,
                        song: `${state.currentSong.name} - ${state.currentSong.singer}`,
                        total_lines: lyrics.length,
                        lyrics: lyrics.slice(0, 30), // Giới hạn 30 câu để tránh tràn token
                    }),
                    isError: false,
                };
            }

            // ==========================================
            // 6. ACTION: PLAYLIST
            // ==========================================
            if (action === 'playlist') {
                const cmd = args.playlist_command;
                if (!cmd) {
                    return {
                        content: JSON.stringify({
                            error: 'Tham số "playlist_command" là bắt buộc khi dùng action="playlist" (create, add, remove, delete, list, play).',
                        }),
                        isError: true,
                    };
                }

                if (cmd === 'list') {
                    const playlists = audioManager.getPlaylists();
                    return {
                        content: JSON.stringify({
                            success: true,
                            total_playlists: playlists.length,
                            playlists: playlists.map((p) => ({
                                id: p.id,
                                name: p.name,
                                song_count: p.songs.length,
                                preview_songs: p.songs.slice(0, 5).map((s) => `${s.name} - ${s.singer}`),
                            })),
                        }),
                        isError: false,
                    };
                }

                if (cmd === 'create') {
                    if (!args.playlist_name) {
                        return {
                            content: JSON.stringify({
                                error: 'Tham số "playlist_name" là bắt buộc khi tạo playlist.',
                            }),
                            isError: true,
                        };
                    }
                    const pl = audioManager.createPlaylist(args.playlist_name);
                    return {
                        content: JSON.stringify({
                            success: true,
                            message: `Đã tạo danh sách phát "${pl.name}".`,
                            playlist: { id: pl.id, name: pl.name, song_count: pl.songs.length },
                        }),
                        isError: false,
                    };
                }

                if (cmd === 'add') {
                    if (!args.playlist_name) {
                        return {
                            content: JSON.stringify({
                                error: 'Tham số "playlist_name" là bắt buộc khi thêm bài vào playlist.',
                            }),
                            isError: true,
                        };
                    }

                    let songToAdd: SongItem | null = null;
                    if (args.song_id) {
                        const sid = String(args.song_id);
                        songToAdd =
                            searchCache.get(sid) || audioManager.getState().queue.find((s) => s.id === sid) || null;
                    }

                    if (!songToAdd) {
                        songToAdd = audioManager.getState().currentSong;
                    }

                    if (!songToAdd) {
                        return {
                            content: JSON.stringify({
                                error: 'Không tìm thấy bài hát để thêm vào playlist. Vui lòng cung cấp "song_id" hợp lệ hoặc đang phát một bài hát.',
                            }),
                            isError: true,
                        };
                    }

                    const res = audioManager.addSongToPlaylist(args.playlist_name, songToAdd);
                    return {
                        content: JSON.stringify(res),
                        isError: !res.success,
                    };
                }

                if (cmd === 'remove') {
                    if (!args.playlist_name || !args.song_id) {
                        return {
                            content: JSON.stringify({
                                error: 'Cần có "playlist_name" và "song_id" để xóa bài hát khỏi playlist.',
                            }),
                            isError: true,
                        };
                    }
                    const res = audioManager.removeSongFromPlaylist(args.playlist_name, String(args.song_id));
                    return {
                        content: JSON.stringify(res),
                        isError: !res.success,
                    };
                }

                if (cmd === 'delete') {
                    if (!args.playlist_name) {
                        return {
                            content: JSON.stringify({
                                error: 'Cần có "playlist_name" để xóa playlist.',
                            }),
                            isError: true,
                        };
                    }
                    const res = audioManager.deletePlaylist(args.playlist_name);
                    return {
                        content: JSON.stringify(res),
                        isError: !res.success,
                    };
                }

                if (cmd === 'play') {
                    if (!args.playlist_name) {
                        return {
                            content: JSON.stringify({
                                error: 'Cần có "playlist_name" để phát playlist.',
                            }),
                            isError: true,
                        };
                    }
                    const shuffle = !!args.shuffle;
                    const res = await audioManager.playPlaylist(args.playlist_name, shuffle);
                    return {
                        content: JSON.stringify(res),
                        isError: !res.success,
                    };
                }

                if (cmd === 'save_queue') {
                    if (!args.playlist_name) {
                        return {
                            content: JSON.stringify({
                                error: 'Cần có "playlist_name" để lưu hàng đợi thành playlist.',
                            }),
                            isError: true,
                        };
                    }
                    const pl = audioManager.saveQueueAsPlaylist(args.playlist_name);
                    return {
                        content: JSON.stringify({
                            success: true,
                            message: `Đã lưu hàng đợi (${pl.songs.length} bài) thành playlist "${pl.name}".`,
                            playlist: { id: pl.id, name: pl.name, song_count: pl.songs.length },
                        }),
                        isError: false,
                    };
                }

                return {
                    content: JSON.stringify({
                        error: `Lệnh playlist_command "${cmd}" không hợp lệ. Chọn: create, add, remove, delete, list, play, save_queue.`,
                    }),
                    isError: true,
                };
            }

            // ==========================================
            // 7. ACTION: FAVORITE
            // ==========================================
            if (action === 'favorite') {
                const cmd = args.favorite_command || 'list';

                if (cmd === 'list') {
                    const favs = audioManager.getFavorites();
                    return {
                        content: JSON.stringify({
                            success: true,
                            total_favorites: favs.length,
                            favorites: favs.map((s, idx) => ({
                                index: idx + 1,
                                song_id: s.id,
                                name: s.name,
                                singer: s.singer,
                                source: s.source,
                            })),
                        }),
                        isError: false,
                    };
                }

                if (cmd === 'toggle') {
                    let songToFav: SongItem | null = null;
                    if (args.song_id) {
                        const sid = String(args.song_id);
                        songToFav =
                            searchCache.get(sid) || audioManager.getState().queue.find((s) => s.id === sid) || null;
                    }

                    if (!songToFav) {
                        songToFav = audioManager.getState().currentSong;
                    }

                    if (!songToFav) {
                        return {
                            content: JSON.stringify({
                                error: 'Không tìm thấy bài hát để đánh dấu yêu thích. Vui lòng cung cấp "song_id" hoặc đang phát một bài hát.',
                            }),
                            isError: true,
                        };
                    }

                    const isFav = audioManager.toggleFavorite(songToFav);
                    return {
                        content: JSON.stringify({
                            success: true,
                            is_favorite: isFav,
                            song: `${songToFav.name} - ${songToFav.singer}`,
                            message: isFav
                                ? `Đã thêm "${songToFav.name}" vào danh sách Yêu thích.`
                                : `Đã bỏ "${songToFav.name}" khỏi danh sách Yêu thích.`,
                        }),
                        isError: false,
                    };
                }

                if (cmd === 'play') {
                    const shuffle = !!args.shuffle;
                    const res = await audioManager.playFavorites(shuffle);
                    return {
                        content: JSON.stringify(res),
                        isError: !res.success,
                    };
                }

                return {
                    content: JSON.stringify({
                        error: `Lệnh favorite_command "${cmd}" không hợp lệ. Chọn: toggle, list, play.`,
                    }),
                    isError: true,
                };
            }

            return {
                content: JSON.stringify({
                    error: `Action "${action}" không được hỗ trợ. Hãy chọn: search, play, control, get_status, get_lyrics, playlist, favorite.`,
                }),
                isError: true,
            };
        } catch (err: any) {
            console.error('[Tool: manage_music] Lỗi thực thi:', err);
            return {
                content: JSON.stringify({
                    error: err.message || 'Lỗi không xác định khi thực hiện công cụ phát nhạc.',
                }),
                isError: true,
            };
        }
    },
};
