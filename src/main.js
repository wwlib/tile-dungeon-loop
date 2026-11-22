const canvas = document.getElementById('game');
if (canvas) {
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#e6edf3';
  ctx.font = '16px monospace';
  ctx.fillText('Tile Dungeon initializing...', 24, 40);
}
