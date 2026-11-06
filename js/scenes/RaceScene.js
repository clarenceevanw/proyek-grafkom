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
const LANE_X = 3.8 / 3;

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
      { name: 'Sonic', lane: 'kiri', x: -2 * LANE_X, visualScale: .9, character: new Sonic(gl, { renderer: this.renderer, shader: this.sonicShader }) },
      { name: 'Knuckles', lane: 'tengah', x: 0, visualScale: .48, character: new Knuckles(gl, { renderer: this.renderer }) },
      { name: 'Tails', lane: 'kanan', x: 2 * LANE_X, visualScale: .78, character: new Tails(gl, { renderer: this.renderer }) },
    ];
    this.runners.forEach(({ character }) => character.setAnimation('idle'));
    this.hasAppliedLineup = false;
  }

  update(dt, elapsedTime) {
    this.environment.update(elapsedTime);

    for (const runner of this.runners) {
      const root = runner.character.getRoot();
      if (this.hasAppliedLineup) {
        root.t[0] -= runner.x;
        root.t[2] -= START_Z;
        root.s = root.s.map((value) => value / runner.visualScale);
      }

      runner.character.update(dt, elapsedTime);

      root.t[0] += runner.x;
      root.t[2] += START_Z;
      root.s = root.s.map((value) => value * runner.visualScale);
    }
    this.hasAppliedLineup = true;
  }

  render(renderContext) {
    this.environment.render(renderContext);
    for (const { character } of this.runners) character.render(renderContext);
  }
}
