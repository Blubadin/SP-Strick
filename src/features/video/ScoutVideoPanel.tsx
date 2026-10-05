import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { db, type VideoSource } from '../../core/persistence/database';
import { audioFeedbackManager } from '../../core/preferences/AudioFeedbackManager';
import { videoPlayback, type PlaybackAdapter } from '../../core/video/VideoPlayback';
import { VideoError } from '../../core/video/VideoError';
import { createNativeVideoAdapter, createYouTubeVideoAdapter, waitForNativeVideo } from '../../core/video/videoAdapters';
import { parseYouTubeUrl, restoreLocalVideo, type LocalVideoHandle } from '../../core/video/videoSources';
import styles from './ScoutVideoPanel.module.css';

const subscribeAudio = (listener: () => void) => audioFeedbackManager.subscribe(listener);
const audioReady = () => audioFeedbackManager.isReady();

export function AudioUnlockButton() {
  const { t } = useTranslation();
  const ready = useSyncExternalStore(subscribeAudio, audioReady, () => false);
  const [blocked, setBlocked] = useState(false);
  if (ready) return null;
  return <span className={styles.audioUnlock}>
    <button type="button" onClick={() => { void audioFeedbackManager.unlock().then((unlocked) => { setBlocked(!unlocked); if (unlocked) audioFeedbackManager.playCommitTone(); }); }}>
      {t('video.enableAudio', { defaultValue: 'Enable sound' })}
    </button>
    {blocked && <small role="status">{t('video.audioBlocked', { defaultValue: 'Sound is unavailable. You can continue scouting and retry.' })}</small>}
  </span>;
}

type PickerWindow = Window & { showOpenFilePicker?: (options: { multiple: boolean; types: { description: string; accept: Record<string, string[]> }[] }) => Promise<LocalVideoHandle[]> };

export function ScoutVideoPanel({ sessionId }: { sessionId: string }) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [sources, setSources] = useState<VideoSource[]>([]);
  const [selected, setSelected] = useState<VideoSource | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | Error>('');
  const [loading, setLoading] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const reselectSource = useRef<VideoSource | null>(null);
  const files = useRef(new Map<string, File>());
  const activateRef = useRef<(source: VideoSource, requestPermission?: boolean) => Promise<void>>(async () => {});

  useEffect(() => {
    let disposed = false;
    let generation = 0;
    let release: (() => void) | undefined;
    const playerHost = host.current;
    const localFiles = files.current;
    const settingKey = `video.active.${sessionId}`;
    const activate = async (source: VideoSource, requestPermission = false) => {
      const current = ++generation;
      release?.(); release = undefined;
      playerHost?.replaceChildren();
      setSelected(source); setError(''); setLoading(true);
      let objectUrl: string | undefined;
      let destroy: (() => void) | undefined;
      const abort = new AbortController();
      let cleaned = false;
      const cleanMedia = () => {
        if (cleaned) return;
        cleaned = true; abort.abort(); destroy?.();
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      };
      try {
        let adapter: PlaybackAdapter;
        if (source.kind === 'youtube') {
          const element = document.createElement('div');
          playerHost?.appendChild(element);
          const youtube = await createYouTubeVideoAdapter(element, source.videoId!, (failure) => {
            if (!disposed && current === generation) setError(failure);
          }, 15000, source.lastPositionMs ?? 0);
          destroy = () => youtube.destroy();
          adapter = youtube;
        } else {
          const file = localFiles.get(source.id) ?? await restoreLocalVideo(source.fileHandle, requestPermission);
          if (disposed || current !== generation) return;
          const element = document.createElement('video');
          element.controls = true; element.playsInline = true; element.preload = 'metadata';
          element.setAttribute('aria-label', source.name);
          objectUrl = URL.createObjectURL(file);
          element.src = objectUrl;
          playerHost?.appendChild(element);
          const mediaError = () => { if (!disposed && current === generation) setError(new VideoError('localUnsupported', 'Unable to play this local video. Retry or reselect a supported file.')); };
          element.addEventListener('error', mediaError);
          destroy = () => { element.pause(); element.removeEventListener('error', mediaError); element.removeAttribute('src'); element.load(); };
          release = cleanMedia;
          await waitForNativeVideo(element, 15000, abort.signal);
          adapter = createNativeVideoAdapter(element);
        }
        if (disposed || current !== generation) { cleanMedia(); return; }
        if (source.kind === 'local' && source.lastPositionMs) { await adapter.seek(source.lastPositionMs); adapter.pause(); }
        const detach = videoPlayback.attach(source.id, adapter);
        release = () => {
          let position: number | undefined;
          try { if (adapter.isReady()) position = adapter.getCurrentTimeMs(); } catch { /* Media already removed. */ }
          detach(); cleanMedia();
          if (position !== undefined && Number.isFinite(position)) void db.videoSources.update(source.id, { lastPositionMs: Math.round(position) }).catch(() => {});
        };
        // Active selection is session scoped; local bytes never enter IndexedDB.
        void db.settings.put({ key: settingKey, value: source.id }).catch(() => {});
      } catch (failure) {
        cleanMedia();
        if (!disposed && current === generation) setError(failure instanceof Error ? failure : 'Video is unavailable. Retry or reselect it.');
        throw failure;
      } finally { if (!disposed && current === generation) setLoading(false); }
    };
    activateRef.current = activate;
    const unregister = videoPlayback.registerSourceActivator(async (id) => {
      const source = await db.videoSources.get(id);
      if (!source || source.sessionId !== sessionId) throw new VideoError('sourceMissing', 'This video source is unavailable in the current session.');
      await activate(source);
    });
    void Promise.all([db.videoSources.where('sessionId').equals(sessionId).toArray(), db.settings.get(settingKey)]).then(async ([saved, setting]) => {
      if (disposed || generation > 0) return;
      saved.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setSources(saved);
      const source = saved.find((item) => item.id === setting?.value) ?? saved.at(-1);
      if (source) await activate(source);
      else { setSelected(null); setError(''); setLoading(false); }
    }).catch((failure) => { if (!disposed) setError(failure instanceof Error ? failure : 'Video sources could not be loaded.'); });
    return () => { disposed = true; generation++; unregister(); release?.(); playerHost?.replaceChildren(); localFiles.clear(); };
  }, [sessionId]);

  const saveSource = async (source: VideoSource) => {
    try { await db.videoSources.put(source); }
    catch (failure) {
      if (!source.fileHandle) throw failure;
      const fallback = { ...source }; delete fallback.fileHandle;
      await db.videoSources.put(fallback);
    }
    setSources((previous) => [...previous.filter((item) => item.id !== source.id), source]);
    await activateRef.current(source);
  };

  const addYouTube = async () => {
    const videoId = parseYouTubeUrl(url);
    if (!videoId) { setError(t('video.invalidUrl', { defaultValue: 'Enter a valid YouTube watch, short, live, or share URL.' })); return; }
    const existing = sources.find((source) => source.kind === 'youtube' && source.videoId === videoId);
    try {
      await saveSource(existing ?? { id: crypto.randomUUID(), sessionId, kind: 'youtube', name: `YouTube · ${videoId}`, videoId, url: url.trim(), createdAt: new Date().toISOString() });
      setUrl('');
    } catch (failure) { setError(failure instanceof Error ? failure : 'Video could not be saved.'); }
  };

  const acceptFile = async (file: File, fileHandle?: LocalVideoHandle) => {
    const original = reselectSource.current;
    if (original && (original.fileName !== file.name || original.fileSize !== file.size || (original.lastModified !== undefined && original.lastModified !== file.lastModified))) {
      setError(t('video.wrongFile', { defaultValue: 'Select the original file to keep saved event times linked. Use Choose local video to add a different file.' })); return;
    }
    const source: VideoSource = { ...original, id: original?.id ?? crypto.randomUUID(), sessionId, kind: 'local', name: file.name, fileName: file.name, fileSize: file.size, lastModified: file.lastModified, fileHandle, createdAt: original?.createdAt ?? new Date().toISOString() };
    files.current.set(source.id, file);
    try { await saveSource(source); }
    catch (failure) { setError(failure instanceof Error ? failure : 'Local video could not be saved.'); }
  };

  const pickFile = async (original: VideoSource | null = null) => {
    reselectSource.current = original;
    const picker = (window as PickerWindow).showOpenFilePicker;
    if (!picker) { fileInput.current?.click(); return; }
    try {
      const [handle] = await picker.call(window, { multiple: false, types: [{ description: 'Video', accept: { 'video/*': ['.mp4', '.webm', '.mov', '.m4v', '.ogv'] } }] });
      if (handle) await acceptFile(await restoreLocalVideo(handle, true), handle);
    } catch (failure) {
      if (failure instanceof DOMException && failure.name === 'AbortError') return;
      // Restricted/unsupported native pickers still offer the standard browser input.
      fileInput.current?.click();
    }
  };

  return <section className={styles.panel} aria-label={t('video.title', { defaultValue: 'Match video' })}>
    <div className={styles.header}>
      <h2>{t('video.title', { defaultValue: 'Match video' })}</h2>
      <AudioUnlockButton />
    </div>
    <div className={styles.sourceControls}>
      <label htmlFor={fieldId}>{t('video.youtubeUrl', { defaultValue: 'YouTube URL' })}</label>
      <div className={styles.urlRow}>
        <input id={fieldId} type="url" inputMode="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
        <button type="button" onClick={() => { void addYouTube(); }}>{t('video.addYouTube', { defaultValue: 'Add YouTube video' })}</button>
      </div>
      <div className={styles.actions}>
        <button type="button" onClick={() => { void pickFile(); }}>{t('video.chooseLocal', { defaultValue: 'Choose local video' })}</button>
        {sources.length > 0 && <label className={styles.savedSource}>{t('video.source', { defaultValue: 'Video source' })}
          <select value={selected?.id ?? ''} onChange={(event) => { const source = sources.find((item) => item.id === event.target.value); if (source) void activateRef.current(source).catch(() => {}); }}>
            {!selected && <option value="" />}
            {sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}
          </select>
        </label>}
      </div>
      <input ref={fileInput} type="file" accept="video/*" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void acceptFile(file); event.target.value = ''; }} />
    </div>
    <div ref={host} data-video-host className={selected ? styles.player : undefined} />
    {!selected && <div className={styles.empty}>{t('video.empty', { defaultValue: 'Add a video to capture match times with your events.' })}</div>}
    {loading && <p role="status" className={styles.message}>{t('video.loading', { defaultValue: 'Loading video…' })}</p>}
    {error && <div className={styles.error}>
      <p role="alert">{error instanceof VideoError ? t(`video.errors.${error.code}`, { defaultValue: error.message }) : t('video.errorDetail', { defaultValue: '{{message}}', message: error instanceof Error ? error.message : error })}</p>
      {selected && <div className={styles.actions}>
        <button type="button" onClick={() => { void activateRef.current(selected, true).catch(() => {}); }}>{t('video.retry', { defaultValue: 'Retry video' })}</button>
        {selected.kind === 'local' && <button type="button" onClick={() => { void pickFile(selected); }}>{t('video.reselect', { defaultValue: 'Reselect file' })}</button>}
      </div>}
    </div>}
    <p className={styles.help}>{t('video.help', { defaultValue: 'Press play when ready. Local files stay on this device; after reloading, your browser may ask you to select the file again.' })}</p>
  </section>;
}
