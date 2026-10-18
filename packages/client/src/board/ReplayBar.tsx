/** Replay playback bar (from Planecircle): position, automatic playback, point of view. */
import { useLocalize, useT } from "../localize";
import { useGame } from "../store";

export function ReplayBar() {
  const replay = useGame((s) => s.replay);
  const seek = useGame((s) => s.replaySeek);
  const play = useGame((s) => s.replayPlay);
  const setViewer = useGame((s) => s.replayViewer);
  const leave = useGame((s) => s.leaveGame);
  const t = useT();
  const loc = useLocalize();
  if (!replay) return null;
  const { index, total, viewer, players, playing, warning } = replay;
  return (
    <div className="replay-bar" role="toolbar" aria-label={t("Replay")} data-testid="replay-bar">
      <strong className="replay-title">{t("Replay")}</strong>
      <button type="button" className="btn small" onClick={() => seek(0)} disabled={index === 0} title={t("Back to the start")}>
        |◀
      </button>
      <button
        type="button"
        className="btn small"
        onClick={() => seek(index - 1)}
        disabled={index === 0}
        title={t("Previous step")}
        data-testid="replay-prev"
      >
        ◀
      </button>
      <button
        type="button"
        className="btn small primary"
        onClick={() => play(!playing)}
        disabled={index >= total}
        data-testid="replay-play"
      >
        {playing ? t("Pause") : t("ctx:replay|Play")}
      </button>
      <button
        type="button"
        className="btn small"
        onClick={() => seek(index + 1)}
        disabled={index >= total}
        title={t("Next step")}
        data-testid="replay-next"
      >
        ▶
      </button>
      <button
        type="button"
        className="btn small"
        onClick={() => seek(total)}
        disabled={index >= total}
        title={t("Go to the end")}
        data-testid="replay-end"
      >
        ▶|
      </button>
      <input
        type="range"
        className="replay-slider"
        min={0}
        max={total}
        value={index}
        aria-label={t("Position in the game")}
        onChange={(e) => seek(Number(e.target.value))}
      />
      <span className="replay-pos" data-testid="replay-pos">
        {index} / {total}
      </span>
      <label className="replay-viewer">
        {t("Point of view")}{" "}
        <select value={viewer} onChange={(e) => setViewer(e.target.value)}>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn small ghost" onClick={leave}>
        {t("Quit")}
      </button>
      {warning ? (
        <p className="replay-warning" role="status">
          {loc(warning)}
        </p>
      ) : null}
    </div>
  );
}
