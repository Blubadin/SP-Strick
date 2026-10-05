import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import { videoPlayback } from '../../core/video/VideoPlayback';
import styles from './HudVideoControls.module.css';

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(timeMs: number): string {
  const totalTenths = Math.max(0, Math.floor(timeMs / 100));
  const tenths = totalTenths % 10;
  const totalSeconds = Math.floor(totalTenths / 10);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);
  const clock = hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(totalMinutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${clock}.${tenths}`;
}

function currentSnapshot() {
  return {
    currentTimeMs: videoPlayback.getCurrentTimeMs(),
    durationMs: videoPlayback.getDurationMs(),
    playing: videoPlayback.isPlaying(),
    rate: videoPlayback.getPlaybackRate(),
    ready: videoPlayback.isReady()
  };
}

export function HudVideoControls() {
  const [snapshot, setSnapshot] = useState(currentSnapshot);
  const [seekError, setSeekError] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const scrubbingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const lastSeekAtRef = useRef(0);
  const throttleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const refresh = () => setSnapshot(currentSnapshot());
    refresh();
    return videoPlayback.subscribe(refresh);
  }, []);

  useEffect(() => () => {
    if (throttleRef.current !== null) clearTimeout(throttleRef.current);
  }, []);

  const commitSeek = useCallback(async (targetMs: number) => {
    try {
      setSeekError(false);
      await videoPlayback.seekTo(targetMs);
      setSnapshot(currentSnapshot());
    } catch {
      setSeekError(true);
    }
  }, []);

  const requestSeek = useCallback((targetMs: number, immediate = false) => {
    pendingSeekRef.current = targetMs;
    const now = performance.now();
    const elapsed = now - lastSeekAtRef.current;
    if (immediate || elapsed >= 80) {
      if (throttleRef.current !== null) clearTimeout(throttleRef.current);
      throttleRef.current = null;
      lastSeekAtRef.current = now;
      void commitSeek(targetMs);
      return;
    }
    if (throttleRef.current !== null) clearTimeout(throttleRef.current);
    throttleRef.current = setTimeout(() => {
      const target = pendingSeekRef.current;
      if (target === null) return;
      pendingSeekRef.current = null;
      lastSeekAtRef.current = performance.now();
      void commitSeek(target);
      throttleRef.current = null;
    }, 80 - elapsed);
  }, [commitSeek]);

  const seekFromPointer = (clientX: number, immediate = false) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || snapshot.durationMs <= 0) return;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    requestSeek(ratio * snapshot.durationMs, immediate);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    let target: number | undefined;
    const time = videoPlayback.getCurrentTimeMs();
    if (event.key === 'ArrowLeft') target = time - 1000;
    else if (event.key === 'ArrowRight') target = time + 1000;
    else if (event.key === 'PageDown') target = time - 3000;
    else if (event.key === 'PageUp') target = time + 3000;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = snapshot.durationMs;
    if (target === undefined) return;
    event.preventDefault();
    requestSeek(target, true);
  };

  return <div className={styles.controls} role="group" aria-label="Video controls" data-ready={snapshot.ready}>
    <div
      ref={timelineRef}
      className={styles.timeline}
      role="slider"
      aria-label="Video timeline"
      aria-valuemin={0}
      aria-valuemax={snapshot.durationMs}
      aria-valuenow={Math.min(snapshot.currentTimeMs, snapshot.durationMs || snapshot.currentTimeMs)}
      aria-valuetext={`${formatTime(snapshot.currentTimeMs)} / ${formatTime(snapshot.durationMs)}`}
      aria-disabled={!snapshot.ready || snapshot.durationMs <= 0}
      tabIndex={snapshot.ready && snapshot.durationMs > 0 ? 0 : -1}
      onKeyDown={handleKeyDown}
      onPointerDown={(event) => {
        if (!snapshot.ready || snapshot.durationMs <= 0) return;
        scrubbingRef.current = true;
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Some browser surfaces do not expose pointer capture. */ }
        seekFromPointer(event.clientX, true);
      }}
      onPointerMove={(event) => { if (scrubbingRef.current) seekFromPointer(event.clientX); }}
      onPointerUp={(event) => {
        if (!scrubbingRef.current) return;
        seekFromPointer(event.clientX, true);
        scrubbingRef.current = false;
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Pointer may have been cancelled by the browser. */ }
      }}
      onPointerCancel={(event) => {
        scrubbingRef.current = false;
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* Pointer may have been cancelled by the browser. */ }
      }}
    >
      <div className={styles.track}><span style={{ width: `${snapshot.durationMs ? Math.min(100, snapshot.currentTimeMs / snapshot.durationMs * 100) : 0}%` }} /></div>
      <span className={styles.thumb} style={{ left: `${snapshot.durationMs ? Math.min(100, snapshot.currentTimeMs / snapshot.durationMs * 100) : 0}%` }} />
    </div>
    <div className={styles.controlRow}>
      <output className={styles.time} aria-live="off">{formatTime(snapshot.currentTimeMs)} <span>/</span> {formatTime(snapshot.durationMs)}</output>
      <div className={styles.transport}>
        <button type="button" aria-label="Seek back 3 seconds" disabled={!snapshot.ready} onClick={() => void videoPlayback.seekBy(-3000)}>−3s</button>
        <button type="button" aria-label="Seek back 1 second" disabled={!snapshot.ready} onClick={() => void videoPlayback.seekBy(-1000)}>−1s</button>
        <button type="button" aria-label={snapshot.playing ? 'Pause video' : 'Play video'} className={styles.playButton} disabled={!snapshot.ready} onClick={() => videoPlayback.togglePlayback()}>
          {snapshot.playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
        </button>
        <button type="button" aria-label="Seek forward 1 second" disabled={!snapshot.ready} onClick={() => void videoPlayback.seekBy(1000)}>+1s</button>
        <button type="button" aria-label="Seek forward 3 seconds" disabled={!snapshot.ready} onClick={() => void videoPlayback.seekBy(3000)}>+3s</button>
      </div>
      <label className={styles.speedLabel}>Speed
        <select aria-label="Playback speed" disabled={!snapshot.ready} value={String(snapshot.rate)} onChange={(event) => videoPlayback.setPlaybackRate(Number(event.target.value))}>
          {SPEEDS.map((rate) => <option key={rate} value={rate}>{rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}×</option>)}
        </select>
      </label>
    </div>
    {seekError && <span role="status" className={styles.error}>Unable to seek this video.</span>}
  </div>;
}
