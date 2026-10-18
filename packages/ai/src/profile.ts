/** Play profile of an AI level: what sets the beginner, the medium and the expert apart (from Planecircle). */
export interface Profile {
  /** Seeded randomness (beginner noise). */
  rand: () => number;
  /** Probability of taking a correct option at random rather than the best one (beginner). */
  sloppiness: number;
  /** Probability of casting nothing while something is possible (beginner). */
  forgetfulness: number;
  /** Responds during the opponent's turn and to their Summons and abilities. */
  responds: boolean;
  /** Attacks and blocks: naive, or by simulation. */
  combat: "naive" | "search";
  /** Mulligans: loose (keeps almost anything) or normal. */
  mulligan: "loose" | "normal";
  /** Budget elapsed (time-bounded searches): the best option found is kept. */
  outOfTime: () => boolean;
}

export const MEDIUM_PROFILE: Profile = {
  rand: Math.random,
  sloppiness: 0,
  forgetfulness: 0,
  responds: true,
  combat: "search",
  mulligan: "normal",
  outOfTime: () => false,
};
