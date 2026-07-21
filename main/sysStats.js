// ── Monitor de sistema: RAM, CPU e uptime, mandados ao renderer periodicamente ──
const os = require('os');

// CPU por delta de os.cpus() entre amostras (os números são acumulados
// desde o boot — a diferença entre duas leituras dá o uso do intervalo).
let prevCpuTimes = null;
function sampleCpu() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    for (const t of Object.values(cpu.times)) total += t;
    idle += cpu.times.idle;
  }
  let usage = 0;
  if (prevCpuTimes) {
    const dTotal = total - prevCpuTimes.total;
    const dIdle = idle - prevCpuTimes.idle;
    usage = dTotal > 0 ? 1 - dIdle / dTotal : 0;
  }
  prevCpuTimes = { idle, total };
  return usage;
}

function getSysStats() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  return {
    memUsedPct: (totalMem - freeMem) / totalMem,
    memUsedGb: (totalMem - freeMem) / 1024 ** 3,
    memTotalGb: totalMem / 1024 ** 3,
    cpuPct: sampleCpu(),
    uptimeSec: os.uptime(),
    cpuModel: (os.cpus()[0] || {}).model || '?',
    cpuCount: os.cpus().length,
  };
}

module.exports = { sampleCpu, getSysStats };
