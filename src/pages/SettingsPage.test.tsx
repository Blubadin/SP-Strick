// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsPage from './SettingsPage';
import { DEFAULT_PREFERENCES, usePreferencesStore } from '../core/preferences/PreferencesStore';
import { useControllerStore } from '../core/controller/ControllerStore';
import { WGP12S_PROFILE } from '../core/controller/ControllerProfile';
import { useScoutStore } from '../core/scouting/ScoutStore';
import { audioFeedbackManager } from '../core/preferences/AudioFeedbackManager';

const { put, profilePut, tables, transaction } = vi.hoisted(() => {
  const tables = Object.fromEntries(['sessions', 'events', 'bookmarks', 'rallies', 'videoSources'].map(name => [name, { toArray: vi.fn(), clear: vi.fn() }]));
  return { put: vi.fn(), profilePut: vi.fn(), tables, transaction: vi.fn() };
});
vi.mock('../core/persistence/database', () => ({ db: { settings: { put }, customProfiles: { put: profilePut }, ...tables, transaction } }));

describe('SettingsPage', () => {
  beforeEach(() => {
    put.mockReset().mockResolvedValue(undefined);
    Object.values(tables).forEach(table => { table.toArray.mockResolvedValue([]); table.clear.mockReset().mockResolvedValue(undefined); });
    transaction.mockImplementation(async (_mode, _tables, callback) => callback());
    profilePut.mockResolvedValue(undefined);
    usePreferencesStore.setState({ ...DEFAULT_PREFERENCES });
    useControllerStore.setState({ profile: WGP12S_PROFILE, customProfiles: [] });
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it('clears rallies and video sources with match data and resets the in-memory rally', async () => {
    useScoutStore.setState({ allEvents: [{}] as never[], rallies: [{}] as never[], currentRallyId: 'rally-current' });
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Clear data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear local data' }));
    await waitFor(() => expect(tables.rallies.clear).toHaveBeenCalledOnce());
    expect(tables.videoSources.clear).toHaveBeenCalledOnce();
    expect(useScoutStore.getState()).toMatchObject({ allEvents: [], rallies: [], currentRallyId: null });
  });

  it('exports rally and video metadata without persisting file handles in the backup', async () => {
    tables.rallies.toArray.mockResolvedValue([{ id: 'rally-one', eventIds: ['event-one'] }]);
    tables.videoSources.toArray.mockResolvedValue([{ id: 'video-one', kind: 'local', fileName: 'match.mp4', fileHandle: { secretHandle: true } }]);
    let downloaded: Blob | undefined;
    const OriginalURL = URL;
    vi.stubGlobal('URL', class extends OriginalURL {
      static createObjectURL(blob: Blob) { downloaded = blob; return 'blob:test-backup'; }
      static revokeObjectURL() {}
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));
    await waitFor(() => expect(downloaded).toBeTruthy());
    const content = await new Promise<string>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.readAsText(downloaded!); });
    const backup = JSON.parse(content);
    expect(backup.rallies).toEqual([{ id: 'rally-one', eventIds: ['event-one'] }]);
    expect(backup.videoSources).toEqual([{ id: 'video-one', kind: 'local', fileName: 'match.mp4' }]);
  });

  it('persists wheel size and gameplay actions without changing physical mapping', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    expect(screen.queryByRole('switch', { name: 'Automatic point impact' })).toBeNull();
    const wheel = screen.getByRole('combobox', { name: 'Wheel size' }) as HTMLSelectElement;
    expect(wheel.value).toBe('large');
    fireEvent.change(wheel, { target: { value: 'extraLarge' } });
    await waitFor(() => expect(put).toHaveBeenCalledWith({ key: 'wheelSize', value: 'extraLarge' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'LT action' }), { target: { value: 'TOGGLE_VIDEO_PLAYBACK' } });
    await waitFor(() => expect(usePreferencesStore.getState().gameplayBindings.LEFT_TRIGGER).toBe('TOGGLE_VIDEO_PLAYBACK'));
    expect(useControllerStore.getState().profile.buttons).toEqual(WGP12S_PROFILE.buttons);
  });

  it('persists stick deadzone in a custom calibration profile', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole('slider', { name: 'Stick deadzone' }), { target: { value: '0.3' } });
    await waitFor(() => expect(useControllerStore.getState().profile.leftStick.deadzone).toBe(0.3));
    expect(profilePut).toHaveBeenCalledWith(expect.objectContaining({ builtIn: false, leftStick: expect.objectContaining({ deadzone: 0.3 }) }));
    expect(WGP12S_PROFILE.leftStick.deadzone).toBe(0.2);
  });

  it('keeps consecutive shortcut changes and uses one custom calibration while dragging deadzone', async () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.change(screen.getByRole('combobox', { name: 'LT action' }), { target: { value: 'TOGGLE_VIDEO_PLAYBACK' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'LB action' }), { target: { value: 'EDIT_LAST_EVENT' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Stick deadzone' }), { target: { value: '0.3' } });
    fireEvent.change(screen.getByRole('slider', { name: 'Stick deadzone' }), { target: { value: '0.35' } });
    await waitFor(() => expect(useControllerStore.getState().profile.leftStick.deadzone).toBe(0.35));
    expect(useControllerStore.getState().customProfiles).toHaveLength(1);
    expect(usePreferencesStore.getState().gameplayBindings).toMatchObject({ LEFT_TRIGGER: 'TOGGLE_VIDEO_PLAYBACK', LEFT_BUMPER: 'EDIT_LAST_EVENT' });
  });

  it('unlocks audio from the test button before playing confirmation', async () => {
    const unlock = vi.spyOn(audioFeedbackManager, 'unlock').mockResolvedValue(true);
    const tone = vi.spyOn(audioFeedbackManager, 'playCommitTone').mockImplementation(() => undefined);
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Test audio' }));
    await waitFor(() => expect(unlock).toHaveBeenCalledOnce());
    expect(tone).toHaveBeenCalledOnce();
  });

  it('renders preferences without entering a state update loop', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.getByRole('switch', { name: 'Haptic feedback' })).toBeTruthy();
  });
});
