export type ActionType = "Slide Right" | "Slide Left" | "Flip" | "Reroll" | "+2/-2";

export interface Die {
  color: string;
  value: number;
}

export interface Player {
  id: number;
  name: string;
  isAI: boolean;
  turnsTaken: number;
  trophies: { bronze: number; silver: number; gold: number; yellow: number };
  dice: Die[];
}

export interface Card {
  id: number;
  color: string;
  action: ActionType;
}

export const ACTIONS: ActionType[] = ["Slide Right", "Slide Left", "Flip", "Reroll", "+2/-2"];
export const DEFAULT_COLORS = ["red", "yellow", "black", "white", "gray", "blue"];

export function scoreForPlayer(player: Player): number {
  return Number(player.dice.map((die) => die.value).join(""));
}

export function trophyPoints(player: Player, playerCount: number): number {
  if (playerCount >= 5) {
    return player.trophies.yellow + player.trophies.bronze * 2 + player.trophies.silver * 3 + player.trophies.gold * 4;
  }
  return player.trophies.bronze + player.trophies.silver * 2 + player.trophies.gold * 3;
}


export function generateDeck(colors: string[], multiplier: number): Card[] {
  const deck: Card[] = [];
  let id = 1;
  const copies = 2 * multiplier;
  colors.forEach((color) => {
    ACTIONS.forEach((action) => {
      for (let i = 0; i < copies; i += 1) {
        deck.push({ id, color, action });
        id += 1;
      }
    });
  });
  return deck;
}
