import { describe, it, expect } from "vitest";
import {
  sendViaHeliusSender,
  getHeliusPriorityFee,
  createJitoTipInstruction,
  randomJitoTipAccount,
} from "../src/index.js";

describe("Helius primitives exported from shared root", () => {
  it("exports sendViaHeliusSender", () => expect(typeof sendViaHeliusSender).toBe("function"));
  it("exports getHeliusPriorityFee", () => expect(typeof getHeliusPriorityFee).toBe("function"));
  it("exports createJitoTipInstruction", () => expect(typeof createJitoTipInstruction).toBe("function"));
  it("exports randomJitoTipAccount", () => expect(typeof randomJitoTipAccount).toBe("function"));
});
