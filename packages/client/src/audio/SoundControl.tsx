/** Sound setting (from Planecircle): speaker (muted / on, shortcut M) and volume. */
import { useT } from "../localize";
import { useAudio } from "./sfx";

const SPEAKER = "M4 9v6h4l5 4V5L8 9H4z";
const WAVES = "M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12";
const CROSS = "M16.5 9.5l5 5M21.5 9.5l-5 5";

export function SoundControl() {
  const { volume, muted, setVolume, toggleMute } = useAudio();
  const silent = muted || volume === 0;
  const t = useT();
  return (
    <div className="sound-control">
      <button
        type="button"
        className="sound-toggle"
        onClick={toggleMute}
        aria-label={silent ? t("Turn sound on") : t("Mute sound")}
        title={silent ? t("Turn sound on (M)") : t("Mute sound (M)")}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d={SPEAKER} fill="currentColor" />
          <path d={silent ? CROSS : WAVES} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={muted ? 0 : volume}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label={t("Sound effects volume")}
      />
    </div>
  );
}
