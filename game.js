const ACTIONS = ["Slide Right", "Slide Left", "Flip", "Reroll", "+1/-1"];
const DEFAULT_COLORS = ["red", "yellow", "black", "white", "gray", "blue"];
const LIGHT_DIE_TEXT_COLOR = "#111";
const DARK_DIE_TEXT_COLOR = "#f7f9ff";
const MAX_COLOR_NAME_LENGTH = 20;
const AI_THINK_DELAY_MS = 600;
const DIE_MIN_VALUE = 1;
const DIE_MAX_VALUE = 6;
const DIE_OPPOSITE_SUM = 7;
const CARD_ROW_SIZE = 4;
const CARDS_PER_TURN = 2;

const ui = {
  setupView: document.getElementById("setup-view"),
  gameView: document.getElementById("game-view"),
  playerCount: document.getElementById("player-count"),
  diceColors: document.getElementById("dice-colors"),
  deckMultiplier: document.getElementById("deck-multiplier"),
  playerConfig: document.getElementById("player-config"),
  startGame: document.getElementById("start-game"),
  turnLabel: document.getElementById("turn-label"),
  turnMeta: document.getElementById("turn-meta"),
  ranking: document.getElementById("ranking"),
  cardRow: document.getElementById("card-row"),
  confirmSelection: document.getElementById("confirm-selection"),
  message: document.getElementById("message"),
  newGame: document.getElementById("new-game"),
};

let state = null;

for (let i = 3; i <= 6; i += 1) {
  const option = document.createElement("option");
  option.value = String(i);
  option.textContent = String(i);
  ui.playerCount.append(option);
}
ui.playerCount.value = "3";
ui.diceColors.value = DEFAULT_COLORS.join(", ");

function randomDieValue() {
  return Math.floor(Math.random() * DIE_MAX_VALUE) + DIE_MIN_VALUE;
}

function shuffle(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function parseColors(input) {
  const parsed = input
    .split(",")
    .map((item) => normalizeColorToken(item.trim().toLowerCase()))
    .filter(Boolean);
  return parsed.length ? parsed : DEFAULT_COLORS;
}

function normalizeColorToken(value) {
  if (new RegExp(`^[a-z]{1,${MAX_COLOR_NAME_LENGTH}}$`, "i").test(value)) return value;
  if (/^#[0-9a-f]{3,8}$/i.test(value)) return value;
  return "";
}

function createPlayer(id, isAI, colors) {
  return {
    id,
    name: `Player ${id + 1}`,
    isAI,
    turnsTaken: 0,
    trophies: { bronze: 0, silver: 0, gold: 0 },
    dice: colors.map((color) => ({ color, value: randomDieValue() })),
  };
}

function generateDeck(colors, multiplier) {
  const deck = [];
  let nextId = 1;
  const copies = 2 * multiplier;
  colors.forEach((color) => {
    ACTIONS.forEach((action) => {
      for (let i = 0; i < copies; i += 1) {
        deck.push({ id: nextId, color, action });
        nextId += 1;
      }
    });
  });
  return shuffle(deck);
}

function scoreForPlayer(player) {
  return Number(player.dice.map((die) => die.value).join(""));
}

function trophyPoints(player) {
  return player.trophies.bronze + player.trophies.silver * 2 + player.trophies.gold * 3;
}

function rankingByScore(players) {
  return [...players].sort((a, b) => {
    const delta = scoreForPlayer(b) - scoreForPlayer(a);
    if (delta !== 0) return delta;
    return a.id - b.id;
  });
}

function findDieIndex(player, color) {
  return player.dice.findIndex((die) => die.color === color);
}

function applyAction(player, color, action) {
  const dieIndex = findDieIndex(player, color);
  if (dieIndex < 0) return;

  if (action === "Slide Right") {
    const [die] = player.dice.splice(dieIndex, 1);
    player.dice.push(die);
    return;
  }

  if (action === "Slide Left") {
    const [die] = player.dice.splice(dieIndex, 1);
    player.dice.unshift(die);
    return;
  }

  if (action === "Flip") {
    player.dice[dieIndex].value = DIE_OPPOSITE_SUM - player.dice[dieIndex].value;
    return;
  }

  if (action === "Reroll") {
    player.dice[dieIndex].value = randomDieValue();
    return;
  }

  if (action === "+1/-1") {
    player.dice[dieIndex].value = Math.min(DIE_MAX_VALUE, player.dice[dieIndex].value + 1);
    state.players.forEach((otherPlayer) => {
      if (otherPlayer.id === player.id) return;
      const otherDieIndex = findDieIndex(otherPlayer, color);
      if (otherDieIndex >= 0) {
        otherPlayer.dice[otherDieIndex].value = Math.max(DIE_MIN_VALUE, otherPlayer.dice[otherDieIndex].value - 1);
      }
    });
  }
}

function awardTrophy(player) {
  const ranking = rankingByScore(state.players);
  const position = ranking.findIndex((item) => item.id === player.id) + 1;
  if (position === 1) player.trophies.gold += 1;
  if (position === 2) player.trophies.silver += 1;
  if (position === 3) player.trophies.bronze += 1;
}

function removeSelectedCards() {
  state.cardRow = state.cardRow.filter((card) => !state.selectedCards.includes(card.id));
  state.selectedCards = [];
}

function refillCardRow() {
  while (state.cardRow.length < CARD_ROW_SIZE && state.deck.length > 0) {
    state.cardRow.push(state.deck.pop());
  }
}

function gameIsOver() {
  return state.players.every((player) => player.turnsTaken >= state.turnsPerPlayer);
}

function runTurn(cardA, cardB) {
  const player = state.players[state.currentPlayerIndex];
  applyAction(player, cardA.color, cardB.action);
  applyAction(player, cardB.color, cardA.action);
  removeSelectedCards();
  refillCardRow();
  awardTrophy(player);
  player.turnsTaken += 1;

  if (gameIsOver()) {
    state.finished = true;
    render();
    return;
  }

  state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  render();
  maybeRunAiTurn();
}

function selectedCards() {
  return state.cardRow.filter((card) => state.selectedCards.includes(card.id));
}

function maybeRunAiTurn() {
  if (state.finished) return;
  const currentPlayer = state.players[state.currentPlayerIndex];
  if (!currentPlayer.isAI) {
    ui.message.textContent = `${currentPlayer.name}: pick two cards.`;
    return;
  }
  ui.message.textContent = `${currentPlayer.name} (AI) is thinking...`;
  ui.confirmSelection.disabled = true;
  setTimeout(() => {
    if (state.finished) return;
    const picks = shuffle(state.cardRow).slice(0, CARDS_PER_TURN);
    state.selectedCards = picks.map((card) => card.id);
    render();
    runTurn(picks[0], picks[1]);
  }, AI_THINK_DELAY_MS);
}

function renderPlayerConfig() {
  const count = Number(ui.playerCount.value);
  ui.playerConfig.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "player-type-grid";
  for (let i = 0; i < count; i += 1) {
    const label = document.createElement("label");
    label.textContent = `Player ${i + 1}`;
    const select = document.createElement("select");
    select.dataset.playerType = String(i);
    const human = document.createElement("option");
    human.value = "human";
    human.textContent = "Human";
    const ai = document.createElement("option");
    ai.value = "ai";
    ai.textContent = "Computer AI";
    select.append(human, ai);
    label.append(select);
    wrapper.append(label);
  }
  ui.playerConfig.append(wrapper);
}

function startGame() {
  const playerCount = Number(ui.playerCount.value);
  const colors = parseColors(ui.diceColors.value);
  const multiplier = Number(ui.deckMultiplier.value);
  const typeSelects = [...ui.playerConfig.querySelectorAll("select[data-player-type]")];

  const rawDeck = generateDeck(colors, multiplier);
  const minCardsForOneRound = CARD_ROW_SIZE + playerCount * CARDS_PER_TURN;
  if (rawDeck.length < minCardsForOneRound) {
    ui.message.textContent = "Not enough cards for the selected options.";
    return;
  }
  const turnsPerPlayer = Math.floor((rawDeck.length - CARD_ROW_SIZE) / (playerCount * CARDS_PER_TURN));
  const totalCardsNeeded = CARD_ROW_SIZE + Math.max(0, turnsPerPlayer) * playerCount * CARDS_PER_TURN;
  const deck = rawDeck.slice(0, totalCardsNeeded);

  const players = new Array(playerCount).fill(null).map((_, index) => {
    const isAI = typeSelects[index] && typeSelects[index].value === "ai";
    return createPlayer(index, Boolean(isAI), colors);
  });

  state = {
    colors,
    players,
    deck,
    turnsPerPlayer,
    currentPlayerIndex: 0,
    cardRow: [],
    selectedCards: [],
    finished: false,
  };

  refillCardRow();
  ui.setupView.classList.add("hidden");
  ui.gameView.classList.remove("hidden");
  render();
  maybeRunAiTurn();
}

function winningText() {
  const sorted = [...state.players].sort((a, b) => trophyPoints(b) - trophyPoints(a));
  const top = trophyPoints(sorted[0]);
  const winners = sorted.filter((player) => trophyPoints(player) === top);
  if (winners.length === 1) {
    return `${winners[0].name} wins with ${top} points!`;
  }
  return `Tie: ${winners.map((winner) => winner.name).join(", ")} with ${top} points each.`;
}

function render() {
  const currentPlayer = state.players[state.currentPlayerIndex];
  const rank = rankingByScore(state.players);
  const turnNumber = state.players.reduce((sum, player) => sum + player.turnsTaken, 0) + 1;
  const totalTurns = state.turnsPerPlayer * state.players.length;

  ui.turnLabel.textContent = state.finished ? "Game Over" : `Turn: ${currentPlayer.name}`;
  ui.turnMeta.textContent = `${Math.min(turnNumber, totalTurns)} / ${totalTurns}`;

  ui.ranking.innerHTML = "";
  rank.forEach((player, index) => {
    const row = document.createElement("article");
    row.className = "player-row";
    if (!state.finished && player.id === currentPlayer.id) row.classList.add("current");
    const score = scoreForPlayer(player);
    const title = document.createElement("strong");
    title.textContent = `#${index + 1} ${player.name} ${player.isAI ? "🤖" : "👤"}`;
    const diceRow = document.createElement("div");
    diceRow.className = "dice";
    player.dice.forEach((die) => {
      const dieElement = document.createElement("span");
      dieElement.className = "die";
      dieElement.style.backgroundColor = die.color;
      dieElement.style.color = die.color === "white" || die.color === "yellow" ? LIGHT_DIE_TEXT_COLOR : DARK_DIE_TEXT_COLOR;
      dieElement.textContent = String(die.value);
      diceRow.append(dieElement);
    });
    const stats = document.createElement("small");
    stats.textContent = `Score: ${score.toLocaleString()} • Trophies: 🥇 ${player.trophies.gold} 🥈 ${player.trophies.silver} 🥉 ${player.trophies.bronze} • Points: ${trophyPoints(player)}`;
    row.append(title, diceRow, stats);
    ui.ranking.append(row);
  });

  ui.cardRow.innerHTML = "";
  state.cardRow.forEach((card) => {
    const button = document.createElement("button");
    button.className = "card";
    if (state.selectedCards.includes(card.id)) button.classList.add("selected");
    button.type = "button";
    const top = document.createElement("div");
    top.className = "card-top";
    top.style.backgroundColor = card.color;
    top.style.color = card.color === "white" || card.color === "yellow" ? LIGHT_DIE_TEXT_COLOR : DARK_DIE_TEXT_COLOR;
    top.textContent = card.color.toUpperCase();
    const bottom = document.createElement("div");
    bottom.className = "card-bottom";
    bottom.textContent = card.action;
    button.append(top, bottom);
    button.addEventListener("click", () => {
      if (state.finished || currentPlayer.isAI) return;
      if (state.selectedCards.includes(card.id)) {
        state.selectedCards = state.selectedCards.filter((id) => id !== card.id);
      } else if (state.selectedCards.length < CARDS_PER_TURN) {
        state.selectedCards.push(card.id);
      }
      render();
    });
    ui.cardRow.append(button);
  });

  if (state.finished) {
    ui.message.textContent = winningText();
    ui.confirmSelection.disabled = true;
    return;
  }

  const picks = selectedCards();
  ui.confirmSelection.disabled = picks.length !== CARDS_PER_TURN || currentPlayer.isAI;
}

ui.playerCount.addEventListener("change", renderPlayerConfig);
renderPlayerConfig();

ui.startGame.addEventListener("click", startGame);
ui.newGame.addEventListener("click", () => {
  state = null;
  ui.gameView.classList.add("hidden");
  ui.setupView.classList.remove("hidden");
  ui.message.textContent = "";
});

ui.confirmSelection.addEventListener("click", () => {
  const picks = selectedCards();
  if (picks.length === CARDS_PER_TURN) runTurn(picks[0], picks[1]);
});
