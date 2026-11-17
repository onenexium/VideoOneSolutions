// 短剧频道数据模型
export interface DramaChannelMeta {
  dramaId: string;
  dramaTitle: string;
  dramaPlayTimes: number;
  dramaCoverUrl: string;
  newRelease: boolean;
  dramaLength: number;
  dramaVideoOrientation: number;
}

// 短剧频道数据结构
export interface DramaChannelData {
  loop: DramaChannelMeta[];
  trending: DramaChannelMeta[];
  new: DramaChannelMeta[];
  recommend: DramaChannelMeta[];
  /** Rail keys behind the sections, for "See all" (GET /v1/rails/{key}); absent for the mock catalogue. */
  railKeys?: { trending?: string; new?: string };
}

/** One page of series cards (a rail or Browse); `nextCursor` is null at the end. */
export interface DramaCardPage {
  items: DramaChannelMeta[];
  nextCursor: string | null;
}

// 短剧列表项组件属性
export interface DramaItemProps {
  drama: DramaChannelMeta;
  onPress: (drama: DramaChannelMeta) => void;
  showRank?: boolean;
  rank?: number;
  showPlayCount?: boolean;
  showNewBadge?: boolean;
  width?: number;
  height?: number;
}

// 轮播图组件属性
export interface CarouselProps {
  data: DramaMeta[];
  onItemPress: (drama: DramaMeta) => void;
}

// 列表组件属性
export interface DramaListProps {
  data: DramaMeta[];
  onItemPress: (drama: DramaMeta) => void;
  type: "trending" | "new" | "recommend";
}

/** Identifies an episode on ott-api so a playback session can be opened for it. */
export interface PlaybackRef {
  series: string; // series short ID
  number: number; // episode number
  language: string; // language version, e.g. "hi"
}

/** One playable rendition of an episode (an HLS URL, or a specific quality). */
export interface PlaybackSource {
  quality: string;
  url: string;
}

// Episode data
export interface DramaEpisode {
  vid: string;
  drama_id: string;
  caption: string;
  duration: number;
  cover_url: string;
  sources: PlaybackSource[];
  play_times: number;
  subtitle: string;
  create_time: string;
  name: string;
  uid: number;
  like: number;
  comment: number;
  height: number;
  width: number;
  order: number;
  display_type: number;
  /** Locked for this viewer: it costs coins and has not been unlocked. */
  vip: boolean;
  /** What it costs in coins; 0 or absent when free. */
  coins?: number;
  /** This viewer liked it. */
  liked?: boolean;
  /** Set for episodes served by ott-api: the URL comes from a playback session. */
  playback?: PlaybackRef;
}

// Feed流相关类型定义
export interface DramaMeta {
  drama_id: string;
  drama_title: string;
  drama_play_times: number;
  drama_cover_url: string;
  new_release: boolean;
  drama_length: number;
  drama_video_orientation: number;
}

export interface VideoMeta {
  vid: string;
  drama_id: string;
  caption: string;
  duration: number;
  cover_url: string;
  sources: PlaybackSource[];
  play_times: number;
  subtitle: string;
  create_time: string;
  name: string;
  uid: number;
  like: number;
  comment: number;
  height: number;
  width: number;
  order: number;
  display_type: number;
  vip: boolean;
  /** Set for episodes served by ott-api: the URL comes from a playback session. */
  playback?: PlaybackRef;
}

export interface FeedItem {
  drama_meta: DramaMeta;
  video_meta: VideoMeta;
}

// 剧集列表请求参数
export interface DramaListRequestParams {
  drama_id: string;
}
