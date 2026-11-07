import { clamp01 } from '../core/MathUtils.js';
import { Renderer } from '../rendering/Renderer.js';
import { ShaderProgram } from '../rendering/ShaderProgram.js';
import { Sonic } from '../characters/Sonic.js';
import { Knuckles } from '../characters/Knuckles.js';
import { Tails } from '../characters/Tails.js';
import { Environment } from '../environment/Environment.js';
import { SONIC_SHADER } from '../shaders/sonicShader.js';
import { KNUCKLES_SHADER } from '../shaders/knucklesShader.js';
import { TAILS_SHADER } from '../shaders/tailsShader.js';
import { ENVIRONMENT_SHADER } from '../shaders/environmentShader.js';

const START_Z = -32.5;
const FINISH_Z = 30;
const LANE_X = 3.8 / 3;
// Sonic: lari sebentar (translate), lalu menggulung jadi bola (rotate) sampai finish.
const SONIC_RUN_IN_END = 1.2;
const SONIC_FINISH_TIME = 8;
const SONIC_BALL_END = SONIC_FINISH_TIME;
const TAILS_FINISH_TIME = 10;
const KNUCKLES_FINISH_TIME = 12;

// Scene balapan: environment + tiga karakter di lajur masing-masing.
// Setiap karakter tetap memakai shader-nya sendiri dalam satu WebGL context.
export class RaceScene {
  constructor(gl) {
    if (!gl) throw new Error('RaceScene requires a WebGL context');

    this.gl = gl;
    this.renderer = new Renderer(gl);
    const sonicShader = new ShaderProgram(gl, SONIC_SHADER);
    const knucklesShader = new ShaderProgram(gl, KNUCKLES_SHADER);
    const tailsShader = new ShaderProgram(gl, TAILS_SHADER);
    const environmentShader = new ShaderProgram(gl, ENVIRONMENT_SHADER);

    this.environment = new Environment(gl, { renderer: this.renderer, shader: environmentShader });

    // x = posisi lajur, visualScale = penyamaan tinggi antar karakter,
    // raceMode = animasi saat balapan (Sonic punya urutan khusus).
    this.runners = [
      { name: 'Sonic', lane: 'kiri', x: -2 * LANE_X, visualScale: .9, finishTime: SONIC_FINISH_TIME, raceMode: null, character: new Sonic(gl, { renderer: this.renderer, shader: sonicShader }) },
      { name: 'Knuckles', lane: 'tengah', x: 0, visualScale: .48, finishTime: KNUCKLES_FINISH_TIME, raceMode: 'run', character: new Knuckles(gl, { renderer: this.renderer, shader: knucklesShader }) },
      { name: 'Tails', lane: 'kanan', x: 2 * LANE_X, visualScale: .78, finishTime: TAILS_FINISH_TIME, raceMode: 'fly', character: new Tails(gl, { renderer: this.renderer, shader: tailsShader }) },
    ];
    for (const runner of this.runners) {
      runner.character.setAnimation('idle');
      runner.mode = 'idle';
      runner.appliedZ = START_Z;
    }
    this.hasAppliedLineup = false;
    this.raceRequested = false;
    this.raceStartedAt = null;
  }

  startRace() {
    if (this.raceRequested) return false;
    this.raceRequested = true;
    return true;
  }

  // Kembalikan semua karakter ke garis start. Tidak bisa setelah balapan dimulai.
  resetToLineup() {
    if (this.raceRequested) return false;
    for (const runner of this.runners) {
      runner.character.reset();
      runner.character.getRoot().visible = true;
      runner.mode = 'idle';
      runner.appliedZ = START_Z;
    }
    this.hasAppliedLineup = false;
    return true;
  }

  update(dt, elapsedTime) {
    this.environment.update(elapsedTime);
    if (this.raceRequested && this.raceStartedAt === null) this.raceStartedAt = elapsedTime;
    const raceRunning = this.raceStartedAt !== null;
    const raceTime = raceRunning ? Math.max(0, elapsedTime - this.raceStartedAt) : 0;

    for (const runner of this.runners) {
      const root = runner.character.getRoot();
      // Karakter menganimasikan root-nya relatif ke origin, jadi offset lajur
      // dari frame sebelumnya dilepas dulu lalu dipasang lagi setelah update.
      if (this.hasAppliedLineup) this.#removeLineupOffset(runner, root);

      const { mode, time } = raceRunning
        ? this.#raceAnimation(runner, raceTime)
        : { mode: 'idle', time: elapsedTime };
      if (mode !== runner.mode) {
        runner.character.setAnimation(mode, raceTime);
        runner.mode = mode;
      }
      runner.character.update(raceRunning ? dt : 0, time);

      const progress = clamp01(raceTime / runner.finishTime);
      runner.appliedZ = START_Z + (FINISH_Z - START_Z) * progress;
      this.#applyLineupOffset(runner, root);
      this.#collectContactingRings(runner, root);
    }
    this.hasAppliedLineup = true;
  }

  // Mode animasi dan waktu animasi karakter pada detik ke-raceTime.
  #raceAnimation(runner, raceTime) {
    if (runner.name === 'Sonic') {
      if (raceTime < SONIC_RUN_IN_END) return { mode: 'translate', time: raceTime };
      if (raceTime < SONIC_BALL_END) return { mode: 'rotate', time: raceTime - SONIC_RUN_IN_END };
      return { mode: 'idle', time: raceTime - runner.finishTime };
    }
    if (raceTime < runner.finishTime) return { mode: runner.raceMode, time: raceTime };
    return { mode: 'idle', time: raceTime };
  }

  #applyLineupOffset(runner, root) {
    root.t[0] += runner.x;
    root.t[2] += runner.appliedZ;
    root.s = root.s.map((value) => value * runner.visualScale);
  }

  #removeLineupOffset(runner, root) {
    root.t[0] -= runner.x;
    root.t[2] -= runner.appliedZ;
    root.s = root.s.map((value) => value / runner.visualScale);
  }

  // Ring yang tersentuh karakter (cek kotak sederhana) disembunyikan.
  #collectContactingRings(runner, root) {
    const reach = Math.max(.55, runner.visualScale * .75);
    const characterBottom = root.t[1] - .2;
    const characterTop = root.t[1] + runner.visualScale * 3.5;

    for (const ring of this.environment.rings) {
      if (ring.collected) continue;
      const ringPosition = ring.node.t;
      const touches = Math.abs(root.t[0] - ringPosition[0]) <= reach
        && Math.abs(root.t[2] - ringPosition[2]) <= reach
        && ringPosition[1] >= characterBottom
        && ringPosition[1] <= characterTop;

      if (touches) {
        ring.collected = true;
        ring.node.visible = false;
      }
    }
  }

  render(renderContext) {
    this.environment.render(renderContext);
    for (const { character } of this.runners) character.render(renderContext);
  }
}
