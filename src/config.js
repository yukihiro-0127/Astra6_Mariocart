export const CONFIG = Object.freeze({
  title: 'AEROFORGE', trackName: 'Skyline Foundry Circuit',
  fixedStep: 1 / 60, maxFrameDelta: 0.1, laps: 3, cpuCount: 3,
  roadWidth: 22, checkpointCount: 14, countdown: 3,
  physics: { acceleration: 19, brake: 32, reverseMax: 10, maxSpeed: 40, drag: 0.12, coast: 5, turnRate: 1.55, grip: 7, offroadDrag: 1.9, gravity: 22, fallDepth: -28, recoveryDelay: 1.25, kartRadius: 1.55 },
  drift: { minSpeed: 12, chargeTime: 0.85, maxCharge: 2.1, boostDuration: 1.0, turnMultiplier: 1.18 },
  items: { pulseDuration: 2.3, shieldDuration: 7, snareDuration: 13, slowDuration: 1.7, vectorDistance: 28, gateCooldown: 4 },
  render: { maxPixelRatio: 1.5, targetFPS: 60 },
});
export const PILOTS = [
  { id: 'you', name: 'YOU · KITE', color: '#dafa86', personality: 'player', subtitle: 'Independent pilot' },
  { id: 'vale', name: 'VALE', color: '#63ddd0', personality: 'stable', subtitle: 'Precision / 安定型' },
  { id: 'cinder', name: 'CINDER', color: '#ff8a72', personality: 'aggressive', subtitle: 'Pressure / 攻撃型' },
  { id: 'vex', name: 'VEX', color: '#b2a2ee', personality: 'fast', subtitle: 'Velocity / 高速型' },
];
export const ITEMS = {
  pulse: { name: 'Pulse Boost', label: 'パルスブースト', description: '短時間の加速', color: '#daf788', glyph: '»' },
  snare: { name: 'Gravity Snare', label: 'グラビティスネア', description: '後方へ減速フィールドを設置', color: '#ff927c', glyph: '◎' },
  shield: { name: 'Arc Shield', label: 'アークシールド', description: '妨害を1回だけ防ぐ', color: '#72e0db', glyph: '◇' },
  vector: { name: 'Vector Swap', label: 'ベクタースワップ', description: '前方の安全な路面へ転移', color: '#c3b2fb', glyph: '↗' },
};
