const ACTIONS = ["Slide Right", "Slide Left", "Flip", "Reroll", "+2/-2"];
const DEFAULT_COLORS = ["red", "yellow", "black", "white", "gray", "blue"];
const COLOR_SETS = { standard: DEFAULT_COLORS };
const LIGHT_DIE_TEXT_COLOR = "#111";
const DARK_DIE_TEXT_COLOR = "#f7f9ff";
const AI_THINK_DELAY_MS = 600;
const DIE_MIN_VALUE = 1;
const DIE_MAX_VALUE = 6;
const DIE_OPPOSITE_SUM = 7;
const CARD_ROW_SIZE = 4;
const CARDS_PER_TURN = 2;
const ACTION_ARROW = "→";
const UNKNOWN_DIE_VALUE = "?";

const ui = {
  setupView: document.getElementById("setup-view"),
  gameView: document.getElementById("game-view"),
  playerCount: document.getElementById("player-count"),
  diceColorSet: document.getElementById("dice-color-set"),
  deckMultiplier: document.getElementById("deck-multiplier"),
  trophySupply: document.getElementById("trophy-supply"),
  playerConfig: document.getElementById("player-config"),
  startGame: document.getElementById("start-game"),
  turnLabel: document.getElementById("turn-label"),
  turnMeta: document.getElementById("turn-meta"),
  ranking: document.getElementById("ranking"),
  cardRow: document.getElementById("card-row"),
  turnPlan: document.getElementById("turn-plan"),
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
ui.diceColorSet.value = "standard";

function randomDieValue() {
  return Math.floor(Math.random() * (DIE_MAX_VALUE - DIE_MIN_VALUE + 1)) + DIE_MIN_VALUE;
}

function shuffle(items) {
  const array = [...items];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function getTextColorForBackground(color) {
  return color === "white" || color === "yellow" ? LIGHT_DIE_TEXT_COLOR : DARK_DIE_TEXT_COLOR;
}

function createPlayer(id, isAI, colors) {
  return {
    id,
    name: `Player ${id + 1}`,
    isAI,
    turnsTaken: 0,
    trophies: { bronze: 0, silver: 0, gold: 0, yellow: 0 },
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
  const has5Plus = state.players.length >= 5;
  if (has5Plus) {
    return player.trophies.yellow + player.trophies.bronze * 2 + player.trophies.silver * 3 + player.trophies.gold * 4;
  }
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

// role: "self" (current player applies card to their own die) or
//        "others" (all other players apply card to their own die of that color).
// For +2/-2 the role also determines the delta direction (+2 for self, -2 for others).
function applyAction(player, color, action, role) {
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

  if (action === "+2/-2") {
    if (role === "self") {
      player.dice[dieIndex].value = Math.min(DIE_MAX_VALUE, player.dice[dieIndex].value + 2);
    } else {
      player.dice[dieIndex].value = Math.max(DIE_MIN_VALUE, player.dice[dieIndex].value - 2);
    }
  }
}

function awardTrophy(player) {
  const ranking = rankingByScore(state.players);
  const position = ranking.findIndex((item) => item.id === player.id) + 1;
  const supply = state.trophySupply;
  const has5Plus = state.players.length >= 5;

  let tiers;
  if (has5Plus) {
    if (position === 1) tiers = ["gold", "silver", "bronze", "yellow"];
    else if (position === 2) tiers = ["silver", "bronze", "yellow"];
    else if (position === 3) tiers = ["bronze", "yellow"];
    else if (position === 4) tiers = ["yellow"];
    else return;
  } else {
    if (position === 1) tiers = ["gold", "silver", "bronze"];
    else if (position === 2) tiers = ["silver", "bronze"];
    else if (position === 3) tiers = ["bronze"];
    else return;
  }

  for (const tier of tiers) {
    if (supply[tier] > 0) {
      supply[tier] -= 1;
      player.trophies[tier] += 1;
      return;
    }
  }
}

function removeSelectedCards() {
  const removed = state.cardRow.filter((card) => state.selectedCards.includes(card.id));
  state.discard.push(...removed);
  state.cardRow = state.cardRow.filter((card) => !state.selectedCards.includes(card.id));
  state.selectedCards = [];
  state.selfCardId = null;
}

function refillCardRow() {
  while (state.cardRow.length < CARD_ROW_SIZE) {
    if (state.deck.length === 0) {
      if (state.discard.length === 0) break;
      state.deck = shuffle(state.discard);
      state.discard = [];
    }
    state.cardRow.push(state.deck.pop());
  }
}

function gameIsOver() {
  const s = state.trophySupply;
  return s.gold === 0 && s.silver === 0 && s.bronze === 0 && s.yellow === 0;
}

function runTurn(selfCard, othersCard) {
  const player = state.players[state.currentPlayerIndex];
  applyAction(player, selfCard.color, selfCard.action, "self");
  state.players.forEach((other) => {
    if (other.id === player.id) return;
    applyAction(other, othersCard.color, othersCard.action, "others");
  });
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
    return;
  }
  ui.message.textContent = `${currentPlayer.name} (AI) is thinking...`;
  ui.confirmSelection.disabled = true;
  setTimeout(() => {
    if (state.finished) return;
    const picks = shuffle(state.cardRow).slice(0, CARDS_PER_TURN);
    state.selectedCards = picks.map((card) => card.id);
    state.selfCardId = picks[0].id;
    render();
    const selfCard = picks.find((c) => c.id === state.selfCardId);
    const othersCard = picks.find((c) => c.id !== state.selfCardId);
    runTurn(selfCard, othersCard);
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
  const colors = COLOR_SETS[ui.diceColorSet.value] || DEFAULT_COLORS;
  const multiplier = Number(ui.deckMultiplier.value);
  const trophyCount = Number(ui.trophySupply.value);
  const typeSelects = [...ui.playerConfig.querySelectorAll("select[data-player-type]")];

  const deck = generateDeck(colors, multiplier);
  if (deck.length < CARD_ROW_SIZE) {
    ui.message.textContent = "Not enough cards for the selected options.";
    return;
  }
  const trophySupply = {
    gold: trophyCount,
    silver: trophyCount,
    bronze: trophyCount,
    yellow: playerCount >= 5 ? trophyCount : 0,
  };

  const players = new Array(playerCount).fill(null).map((_, index) => {
    const isAI = typeSelects[index] ? typeSelects[index].value === "ai" : false;
    return createPlayer(index, isAI, colors);
  });

  state = {
    colors,
    players,
    deck,
    discard: [],
    trophySupply,
    currentPlayerIndex: 0,
    cardRow: [],
    selectedCards: [],
    selfCardId: null,
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
  const supply = state.trophySupply;
  const has5Plus = state.players.length >= 5;

  ui.turnLabel.textContent = state.finished ? "Game Over" : `Turn: ${currentPlayer.name}`;
  let supplyText = `Supply: 🥇 ${supply.gold} 🥈 ${supply.silver} 🥉 ${supply.bronze}`;
  if (has5Plus) supplyText += ` 🏅 ${supply.yellow}`;
  ui.turnMeta.textContent = supplyText;

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
      dieElement.style.color = getTextColorForBackground(die.color);
      dieElement.textContent = String(die.value);
      diceRow.append(dieElement);
    });
    const stats = document.createElement("small");
    let statsText = `Score: ${score.toLocaleString()} • Trophies: 🥇 ${player.trophies.gold} 🥈 ${player.trophies.silver} 🥉 ${player.trophies.bronze}`;
    if (has5Plus) statsText += ` 🏅 ${player.trophies.yellow}`;
    statsText += ` • Points: ${trophyPoints(player)}`;
    stats.textContent = statsText;
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
    top.style.color = getTextColorForBackground(card.color);
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
      state.selfCardId = null;
      render();
    });
    ui.cardRow.append(button);
  });

  if (state.finished) {
    ui.turnPlan.classList.add("hidden");
    ui.turnPlan.innerHTML = "";
    ui.message.textContent = winningText();
    ui.confirmSelection.disabled = true;
    return;
  }

  const picks = selectedCards();
  const hasBothCards = picks.length === CARDS_PER_TURN;
  const selfCard = hasBothCards ? picks.find((c) => c.id === state.selfCardId) || null : null;
  const othersCard = selfCard ? picks.find((c) => c.id !== state.selfCardId) || null : null;

  ui.turnPlan.innerHTML = "";
  if (hasBothCards) {
    ui.turnPlan.classList.remove("hidden");
    picks.forEach((card) => {
      const isSelf = selfCard && card.id === selfCard.id;
      const isOthers = othersCard && card.id === othersCard.id;
      const dieIndex = findDieIndex(currentPlayer, card.color);
      const dieValue = dieIndex >= 0 ? currentPlayer.dice[dieIndex].value : UNKNOWN_DIE_VALUE;

      const item = document.createElement("div");
      item.className = `turn-plan-item${isSelf ? " role-self" : isOthers ? " role-others" : ""}`;

      const top = document.createElement("div");
      top.className = "turn-plan-top";
      const roleLabel = document.createElement("strong");
      if (isSelf) {
        roleLabel.textContent = "For Me";
      } else if (isOthers) {
        roleLabel.textContent = "For Others";
      } else {
        roleLabel.textContent = "Assign Role";
      }
      top.append(roleLabel);

      if (!currentPlayer.isAI) {
        const selfButton = document.createElement("button");
        selfButton.type = "button";
        selfButton.className = "button turn-plan-button";
        selfButton.textContent = isSelf ? "✓ For Me" : "Do This To Me";
        selfButton.addEventListener("click", () => {
          state.selfCardId = card.id;
          render();
        });
        top.append(selfButton);
      }

      const desc = document.createElement("div");
      desc.className = "turn-plan-desc";
      desc.textContent = `${card.color.toUpperCase()} die ${dieValue} ${ACTION_ARROW} ${card.action}`;
      item.append(top, desc);
      ui.turnPlan.append(item);
    });
  } else {
    ui.turnPlan.classList.add("hidden");
  }

  ui.confirmSelection.disabled = !hasBothCards || currentPlayer.isAI || !state.selfCardId;

  if (!currentPlayer.isAI) {
    if (!hasBothCards) {
      ui.message.textContent = `${currentPlayer.name}: pick two cards.`;
    } else if (!state.selfCardId) {
      ui.message.textContent = `${currentPlayer.name}: choose which card applies to you.`;
    } else {
      ui.message.textContent = `${currentPlayer.name}: confirm to apply effects.`;
    }
  }
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
  if (picks.length === CARDS_PER_TURN && state.selfCardId) {
    const selfCard = picks.find((c) => c.id === state.selfCardId);
    const othersCard = picks.find((c) => c.id !== state.selfCardId);
    if (selfCard && othersCard) {
      runTurn(selfCard, othersCard);
    }
  }
});
