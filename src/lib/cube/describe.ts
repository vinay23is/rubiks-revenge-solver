import { Move, parseMove } from "./moves";

const FACE_WORDS = ["top", "right", "front", "bottom", "left", "back"];
const FACE_TITLE = ["Up", "Right", "Front", "Down", "Left", "Back"];

/** Plain-English description of a move for beginners. */
export function describeMove(token: string | Move): string {
  const m = typeof token === "string" ? parseMove(token) : token;
  const dir = m.amount === 2 ? "180°" : m.amount === 1 ? "clockwise" : "counter-clockwise";
  const look = m.amount === 2 ? "" : ` (as seen looking at the ${FACE_WORDS[m.face]} face)`;
  switch (m.kind) {
    case "outer":
      return `Turn the ${FACE_WORDS[m.face]} layer ${dir}${look}`;
    case "wide":
      return `Turn the ${FACE_WORDS[m.face]} two layers together ${dir}${look}`;
    case "slice":
      return `Turn only the inner layer next to the ${FACE_WORDS[m.face]} face ${dir}${look}`;
    case "rotation":
      return `Rotate the whole cube ${dir} like the ${FACE_TITLE[m.face]} face`;
  }
}
