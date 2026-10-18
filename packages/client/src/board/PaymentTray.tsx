/**
 * The CP payment of a card or an ability (CR 11.2): the cost ("3 CP · ≥1 Fire") against the CP chosen so far, as
 * element chips. Cards of the hand (+2 CP) and active Backups (+1 CP) are clicked on the board; a Multi-Element chip
 * gives its next element when clicked. Auto puts back the engine's suggestion; Confirm is enabled once the engine's
 * check passes (`paymentOk`). Also the LB cards to turn face up and the same-name card of a special ability.
 */
import { cpTotal, type Element, type ObjectId } from "@finalcircle/engine";
import { faceName } from "../i18n";
import { useLocalize, useT } from "../localize";
import { paymentOk, useGame } from "../store";
import { Card } from "./Card";
import { ElementIcon, GenericCp } from "./ElementIcon";

export function PaymentTray() {
  const casting = useGame((s) => s.casting);
  const view = useGame((s) => s.view);
  const faces = useGame((s) => s.faces);
  const lang = useGame((s) => s.lang);
  const confirm = useGame((s) => s.confirmCast);
  const cancel = useGame((s) => s.cancelCast);
  const cycle = useGame((s) => s.cyclePaymentElement);
  const toggleLb = useGame((s) => s.toggleLbFlip);
  const setSpecial = useGame((s) => s.setSpecial);
  const loc = useLocalize();
  const t = useT();
  if (casting?.stage !== "pay" || !view) return null;
  const { option, payment } = casting;
  const cost = option.cost ?? { elements: {}, generic: 0 };
  const objects = [...view.hand, ...view.field, ...Object.values(view.players).flatMap((p) => [...p.lb, ...p.breakZone])];
  const defOf = (id: ObjectId) => objects.find((o) => o.id === id)?.defId ?? "";
  const chips: { id: ObjectId; element: Element; cp: number; multi: boolean }[] = [];
  for (const d of payment.discard ?? []) {
    const src = option.sources.find((x) => x.kind === "discard" && x.id === d.card);
    if (src)
      chips.push({ id: d.card, element: d.as ?? (src.elements[0] as Element), cp: src.cp, multi: src.elements.length > 1 });
  }
  for (const d of payment.dull ?? []) {
    const src = option.sources.find((x) => x.kind === "dull" && x.id === d.backup);
    if (src)
      chips.push({ id: d.backup, element: d.as ?? (src.elements[0] as Element), cp: src.cp, multi: src.elements.length > 1 });
  }
  const chosen = chips.reduce((a, c) => a + c.cp, 0);
  const ok = paymentOk(casting) && (option.type !== "cast" || !option.lb || casting.lbFlip.length === option.lb.count);
  const source = option.type === "cast" ? option.card : option.source;
  const face = faces[defOf(source)];
  return (
    <div className="payment-tray" role="dialog" aria-label={t("CP payment")} data-tuto="payment">
      <div className="pay-head">
        <Card face={face} className="pay-card" />
        <div>
          <b>{faceName(face, lang)}</b>
          {option.type === "activate" ? <div className="dim">{loc(option.label)}</div> : null}
        </div>
      </div>
      <div className="pay-cost">
        <span className="pay-label">{t("Cost")}</span>
        {Object.entries(cost.elements).map(([e, n]) =>
          Array.from({ length: n ?? 0 }, (_, i) => <ElementIcon key={`${e}${i}`} element={e as Element} size={22} />),
        )}
        {cost.generic ? <GenericCp n={String(cost.generic)} size={22} /> : null}
        <span className="pay-total">{t("{n} CP", { n: cpTotal(cost) })}</span>
      </div>
      <div className="pay-chosen">
        <span className="pay-label">{t("Paid")}</span>
        {chips.length ? (
          chips.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`cp-chip${c.multi ? " multi" : ""}`}
              title={c.multi ? t("Click to change the element") : faceName(faces[defOf(c.id)], lang)}
              onClick={() => (c.multi ? cycle(c.id) : useGame.getState().clickCard(c.id))}
            >
              <ElementIcon element={c.element} size={20} />
              {c.cp === 2 ? <ElementIcon element={c.element} size={20} /> : null}
            </button>
          ))
        ) : (
          <span className="dim">{t("Click cards of your hand (2 CP) or active Backups (1 CP)")}</span>
        )}
        <span className={`pay-total${chosen >= cpTotal(cost) ? " enough" : ""}`}>{t("{n} CP", { n: chosen })}</span>
      </div>
      {option.type === "cast" && option.lb && option.lb.count ? (
        <div className="pay-extra">
          <span className="pay-label">{t("LB cards to turn face up: {n}", { n: option.lb.count })}</span>
          <div className="pay-cards">
            {option.lb.options.map((id) => (
              <Card
                key={id}
                face={faces[defOf(id)]}
                glow={casting.lbFlip.includes(id) ? "chosen" : "source"}
                onClick={() => toggleLb(id)}
                className="pay-small"
              />
            ))}
          </div>
        </div>
      ) : null}
      {option.type === "activate" && option.special && option.special.options.length > 1 ? (
        <div className="pay-extra">
          <span className="pay-label">{t("Card of the same name to discard")}</span>
          <div className="pay-cards">
            {option.special.options.map((id) => (
              <Card
                key={id}
                face={faces[defOf(id)]}
                glow={casting.special === id ? "chosen" : "source"}
                onClick={() => setSpecial(id)}
                className="pay-small"
              />
            ))}
          </div>
        </div>
      ) : null}
      <div className="pay-actions">
        <button type="button" className="btn ghost" onClick={cancel} data-testid="pay-cancel">
          {t("Cancel")}
        </button>
        <button
          type="button"
          className="btn ghost"
          onClick={() => useGame.setState({ casting: { ...casting, payment: option.suggested } })}
          data-testid="pay-auto"
        >
          {t("Auto")}
        </button>
        <button type="button" className="btn primary" disabled={!ok} onClick={confirm} data-testid="pay-confirm">
          {t("Confirm")}
        </button>
      </div>
    </div>
  );
}
