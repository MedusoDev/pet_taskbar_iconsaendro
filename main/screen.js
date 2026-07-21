// ── Geometria de tela/janela: onde fica o "chão" do pet em cada monitor ──
const { screen } = require('electron');
const state = require('./state');

// "Chão" de um monitor, em pixels de tela: topo da taskbar quando ela está
// visível na borda de baixo; senão (oculta/auto-hide ou em outra borda), o
// próprio rodapé da tela — ali o pet fica flutuando rente à borda.
function displayFloorY(display) {
  const { bounds, workArea } = display;
  const taskbarHeight = bounds.height - workArea.height;
  const taskbarAtBottom = workArea.y === bounds.y && taskbarHeight > 0;
  return taskbarAtBottom ? workArea.y + workArea.height : bounds.y + bounds.height;
}

function getWindowBounds() {
  // A janela cobre TODOS os monitores na horizontal (largura do desktop
  // virtual), pro pet poder passear até a segunda tela.
  const displays = screen.getAllDisplays();
  const minX = Math.min(...displays.map((d) => d.bounds.x));
  const maxX = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));

  // Cada monitor tem seu próprio chão (monitores de altura diferente ou com
  // taskbar oculta têm rodapés em Y diferentes). A janela precisa cobrir da
  // pista mais ALTA (chão mais alto − windowHeight) até o chão mais BAIXO —
  // senão o pet "some" ao viajar pra um monitor cujo chão fica fora da faixa.
  const floors = displays.map(displayFloorY);
  const y = Math.min(...floors) - state.windowHeight;
  const height = Math.max(...floors) - y;

  return { x: minX, y, width: maxX - minX, height };
}

// Geometria que o renderer precisa pra saber onde é o chão em cada trecho
// horizontal da janela (chão por monitor).
function getScreenConfig() {
  return {
    displays: screen.getAllDisplays().map((d) => ({
      x: d.bounds.x,
      width: d.bounds.width,
      floorY: displayFloorY(d),
    })),
  };
}

module.exports = { displayFloorY, getWindowBounds, getScreenConfig };
