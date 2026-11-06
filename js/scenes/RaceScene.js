import { Renderer } from '../rendering/Renderer.js';
import { ShaderProgram } from '../rendering/ShaderProgram.js';
import { Sonic } from '../characters/Sonic.js';
import { Knuckles } from '../characters/Knuckles.js';
import { Tails } from '../characters/Tails.js';
import { Environment } from '../environment/Environment.js';
import {
  SONIC_ATTRIBUTE_BINDINGS,
  SONIC_FRAGMENT_SOURCE,
  SONIC_UNIFORMS,
  SONIC_VERTEX_SOURCE,
} from '../shaders/sonicShader.js';

const START_Z = -32.5;
const FINISH_Z = 30;
const LANE_X = 3.8 / 3;
const SONIC_RUN_IN_END = 1.2;
const SONIC_FINISH_TIME = 8;
const SONIC_BALL_END = SONIC_FINISH_TIME;
const TAILS_FINISH_TIME = 10;
const KNUCKLES_FINISH_TIME = 12;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

export class RaceScene {
  constructor(gl) {
    if (!gl) throw new Error('RaceScene requires a WebGL context');

    this.gl = gl;
    this.renderer = new Renderer(gl);
    this.sonicShader = new ShaderProgram(gl, {
      vertexSource: SONIC_VERTEX_SOURCE,
      fragmentSource: SONIC_FRAGMENT_SOURCE,
      attributeBindings: SONIC_ATTRIBUTE_BINDINGS,
      uniformNames: SONIC_UNIFORMS,
    });

    this.environment = new Environment(gl, {
      renderer: this.renderer,
      shader: this.sonicShader,
    });
    this.environment.shadow.visible = false;

    this.runners = [
      { name: 'Sonic', lane: 'kiri', x: -2 * LANE_X, visualScale: .9, finishTime: SONIC_FINISH_TIME, character: new Sonic(gl, { renderer: this.renderer, shader: this.sonicShader }) },
      { name: 'Knuckles', lane: 'tengah', x: 0, visualScale: .48, finishTime: KNUCKLES_FINISH_TIME, character: new Knuckles(gl, { renderer: this.renderer }) },
      { name: 'Tails', lane: 'kanan', x: 2 * LANE_X, visualScale: .78, finishTime: TAILS_FINISH_TIME, character: new Tails(gl, { renderer: this.renderer }) },
    ];
    this.runners.forEach(({ character }) => character.setAnimation('idle'));
    this.runners.forEach((runner) => {
      runner.mode = 'idle';
      runner.appliedZ = START_Z;
    });
    this.hasAppliedLineup = false;
    this.raceRequested = false;
    this.raceStartedAt = null;
  }

  startRace() {
    if (this.raceRequested) return false;
    this.raceRequested = true;
    return true;
  }

  update(dt, elapsedTime) {
    this.environment.update(elapsedTime);
    if (this.raceRequested && this.raceStartedAt === null) this.raceStartedAt = elapsedTime;
    const raceTime = this.raceStartedAt === null ? 0 : Math.max(0, elapsedTime - this.raceStartedAt);

    for (const runner of this.runners) {
      const root = runner.character.getRoot();
      if (this.hasAppliedLineup) {
        root.t[0] -= runner.x;
        root.t[2] -= runner.appliedZ;
        root.s = root.s.map((value) => value / runner.visualScale);
      }

      const raceRunning = this.raceStartedAt !== null;
      let mode = 'idle';
      let sonicModeTime = 0;
      if (raceRunning) {
        if (runner.name === 'Sonic') {
          if (raceTime < SONIC_RUN_IN_END) {
            mode = 'translate';
            sonicModeTime = raceTime;
          } else if (raceTime < SONIC_BALL_END) {
            mode = 'rotate';
            sonicModeTime = raceTime - SONIC_RUN_IN_END;
          } else {
            sonicModeTime = raceTime - runner.finishTime;
          }
        } else if (raceTime < runner.finishTime) {
          mode = runner.name === 'Tails' ? 'fly' : 'run';
        } else {
          mode = 'idle';
        }
      }

      if (mode !== runner.mode) {
        runner.character.setAnimation(mode, raceTime);
        runner.mode = mode;
      }
      runner.character.update(
        raceRunning ? dt : 0,
        runner.name === 'Sonic' ? sonicModeTime : raceTime,
      );

      const progress = clamp01(raceTime / runner.finishTime);
      runner.appliedZ = START_Z + (FINISH_Z - START_Z) * progress;

      root.t[0] += runner.x;
      root.t[2] += runner.appliedZ;
      root.s = root.s.map((value) => value * runner.visualScale);
      this.#collectContactingRings(runner, root);
    }
    this.hasAppliedLineup = true;
  }

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
