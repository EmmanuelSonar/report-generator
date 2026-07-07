const { createCanvas } = require('@napi-rs/canvas');
const { Chart, registerables } = require('chart.js');

Chart.register(...registerables);

function renderLineChart({ title, series, color, width = 900, height = 260 }) {
  const canvas = createCanvas(width, height);
  // Chart.js v4 occasionally reads canvas.style; stub it for the node canvas.
  if (!canvas.style) canvas.style = {};
  const ctx = canvas.getContext('2d');

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map(p => p.date.slice(0, 10)),
      datasets: [{
        label: title,
        data: series.map(p => p.value),
        borderColor: color,
        backgroundColor: color,
        pointRadius: 0,
        borderWidth: 2,
        tension: 0.25,
        fill: false,
      }],
    },
    options: {
      responsive: false,
      animation: false,
      devicePixelRatio: 1,
      plugins: {
        legend: { display: false },
        title: { display: true, text: title, font: { size: 16 }, color: '#262931' },
      },
      scales: {
        x: { ticks: { maxTicksLimit: 8, color: '#666' }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { precision: 0, color: '#666' }, grid: { color: '#eee' } },
      },
    },
  });

  const buf = canvas.toBuffer('image/png');
  chart.destroy();
  return buf;
}

module.exports = { renderLineChart };
