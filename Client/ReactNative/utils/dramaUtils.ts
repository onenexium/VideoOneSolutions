import { DramaEpisode, PlaybackSource } from "@/types/drama";

export function formatNumber(count: number): string {
  return formatNumberCN(count);
}

export function formatNumberCN(count: number): string {
  if (count > 10000) {
    return `${(count / 10000).toFixed(1)}w`;
  }
  return count.toString();
}

export function formatNumberEN(count: number): string {
  if (count > 1000000) {
    return `${(count / 1000000).toFixed(1)}m`;
  } else if (count > 1000) {
    return `${(count / 1000).toFixed(1)}k`;
  }
  return count.toString();
}

/**
 * Pick the source to start with: the preferred quality if present, otherwise the first one.
 */
export function pickDefaultSource(
  episode: Pick<DramaEpisode, "sources">,
  preferredQuality: string = "720P"
): PlaybackSource | null {
  const sources = episode.sources ?? [];
  if (sources.length === 0) {
    return null;
  }
  return (
    sources.find(
      (s) => s.quality.toLowerCase() === preferredQuality.toLowerCase()
    ) ?? sources[0]
  );
}
