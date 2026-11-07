const START_Z = -32.5;
const EXIT_Z = 38;
const ENTRY_X = -4.5;
const ENTRY_DURATION = 1.8;
const ENTRY_IDLE = 3.5;
const IDLE_RECOVERY = 1.0;
const STILL_SETTLE = .45;
const POSE_BLEND_DURATION = .42;
const EXIT_DURATION = 8.8;
const ENTRY_YAW = Math.PI / 2;
const SONIC_SHORT_FORWARD_DURATION = 1.3;
const SONIC_SHORT_FORWARD_DISTANCE = 1.5;
const SONIC_RUN_CYCLE_SPEED = 20;

const idleLook = { mode: 'idle', duration: ENTRY_IDLE, motion: 'turnToFront' };
const still = { mode: 'idle', duration: STILL_SETTLE, hold: true };
const recovery = { mode: 'idle', duration: IDLE_RECOVERY };
const settle = () => ({ ...still });
const holdCurrentPose = { mode: 'idle', duration: STILL_SETTLE, holdPose: true };

const sequences = {
  sonic: [
    { mode: 'translate', duration: ENTRY_DURATION, motion: 'enter' },
    idleLook,
    settle(),
    { mode: 'arbitrary', duration: 2.6 },
    { ...holdCurrentPose, finalize: { mode: 'arbitrary', time: 2.6 } },
    { mode: 'translate', duration: SONIC_SHORT_FORWARD_DURATION, motion: 'shortForward' },
    {
      mode: 'roll', duration: EXIT_DURATION, motion: 'exit', startZ: START_Z + SONIC_SHORT_FORWARD_DISTANCE,
      continuousPose: true,
      animationOptions: { runPhaseOffset: SONIC_SHORT_FORWARD_DURATION * SONIC_RUN_CYCLE_SPEED },
    },
  ],
  tails: [
    { mode: 'fly', duration: ENTRY_DURATION, motion: 'enter' },
    idleLook,
    settle(),
    { mode: 'fly', duration: 3.4, motion: 'flightArc' },
    recovery,
    { mode: 'walk', duration: EXIT_DURATION, motion: 'exit' },
  ],
  knuckles: [
    { mode: 'translate', duration: ENTRY_DURATION, motion: 'enter' },
    idleLook,
    settle(),
    {
      mode: 'warmup', duration: 2.2,
      animationOptions: { warmupProfile: { duration: 2.2, revolutions: 1 } },
    },
    recovery,
    settle(),
    { mode: 'pushup', duration: 2.4 },
    recovery,
    settle(),
    { mode: 'punch', duration: 2.4 },
    recovery,
    settle(),
    { mode: 'walk', duration: EXIT_DURATION, motion: 'exit' },
  ],
};

function easeInOut(value) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function findPhase(sequence, elapsed) {
  let start = 0;
  for (let index = 0; index < sequence.length; index += 1) {
    const phase = sequence[index];
    if (elapsed < start + phase.duration) return { phase, index, start };
    start += phase.duration;
  }
  return null;
}

function capturePose(root) {
  const pose = [];
  const visit = (node) => {
    pose.push({
      node,
      t: [...node.t],
      r: [...node.r],
      s: [...node.s],
      aa: node.aa ? { a: [...node.aa.a], ang: node.aa.ang } : null,
    });
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return pose;
}

function blendAxisRotation(from, to, amount) {
  if (!from && !to) return null;
  if (!from) return { a: [...to.a], ang: to.ang * amount };
  if (!to) {
    const shortestAngle = ((from.ang + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    return { a: [...from.a], ang: shortestAngle * (1 - amount) };
  }

  let targetAxis = [...to.a];
  let targetAngle = to.ang;
  const dot = from.a.reduce((sum, value, index) => sum + value * targetAxis[index], 0);
  if (dot < 0) {
    targetAxis = targetAxis.map((value) => -value);
    targetAngle = -targetAngle;
  }
  const axis = from.a.map((value, index) => value + (targetAxis[index] - value) * amount);
  const length = Math.hypot(...axis) || 1;
  return {
    a: axis.map((value) => value / length),
    ang: from.ang + (targetAngle - from.ang) * amount,
  };
}

function blendPose(sourcePose, amount, targetPose = null) {
  for (let index = 0; index < sourcePose.length; index += 1) {
    const source = sourcePose[index];
    const node = source.node;
    const target = targetPose ? targetPose[index] : node;
    node.t = source.t.map((value, axis) => value + (target.t[axis] - value) * amount);
    node.r = source.r.map((value, axis) => value + (target.r[axis] - value) * amount);
    node.s = source.s.map((value, axis) => value + (target.s[axis] - value) * amount);
    node.aa = blendAxisRotation(source.aa, target.aa, amount);
  }
}

export class CharacterIntroductionScene {
  constructor(raceScene) {
    if (!raceScene || !Array.isArray(raceScene.runners) || !raceScene.environment) {
      throw new TypeError('CharacterIntroductionScene requires a RaceScene with runners and environment');
    }
    this.raceScene = raceScene;
    this.active = false;
    this.runner = null;
    this.sequence = null;
    this.elapsed = 0;
    this.phaseIndex = -1;
    this.poseTransition = null;
  }

  start(characterName) {
    const key = String(characterName).toLowerCase();
    const runner = this.raceScene.runners.find(({ name }) => name.toLowerCase() === key);
    if (!runner || !sequences[key] || !this.raceScene.resetToLineup()) return false;

    for (const candidate of this.raceScene.runners) {
      const root = candidate.character.getRoot();
      root.visible = candidate === runner;
      root.s = root.s.map((value) => value * candidate.visualScale);
      candidate.introApplied = { x: 0, y: 0, z: 0, yaw: 0 };
    }
    this.runner = runner;
    this.sequence = sequences[key];
    this.elapsed = 0;
    this.phaseIndex = -1;
    this.poseTransition = null;
    this.active = true;
    return true;
  }

  cancel() {
    if (!this.active) return false;
    this.#finish();
    return true;
  }

  update(dt, elapsedTime) {
    if (!this.active) return;
    this.raceScene.environment.update(elapsedTime);
    this.elapsed += dt;

    const current = findPhase(this.sequence, this.elapsed);
    if (!current) {
      this.#finish();
      return;
    }

    const { phase, index, start } = current;
    const phaseTime = this.elapsed - start;
    const { character, visualScale } = this.runner;
    const root = character.getRoot();
    const applied = this.runner.introApplied;
    root.t[0] -= applied.x;
    root.t[1] -= applied.y;
    root.t[2] -= applied.z;
    root.r[1] -= applied.yaw;
    root.s = root.s.map((value) => value / visualScale);

    if (index !== this.phaseIndex) {
      if (phase.holdPose) {
        if (phase.finalize) {
          character.setAnimation(phase.finalize.mode, 0);
          character.update(0, phase.finalize.time);
        }
        character.setAnimation('idle', 0);
        this.poseTransition = null;
      } else if (phase.continuousPose) {
        character.setAnimation(phase.mode, phaseTime, phase.animationOptions);
        this.poseTransition = null;
      } else {
        const previousPose = capturePose(root);
        let targetPose = null;
        if (phase.hold) {
          character.reset();
          character.setAnimation('idle', 0);
          targetPose = capturePose(root);
        } else {
          character.setAnimation(phase.mode, phaseTime, phase.animationOptions);
        }
        this.poseTransition = {
          source: previousPose,
          target: targetPose,
          start: this.elapsed,
          duration: POSE_BLEND_DURATION,
        };
      }
      this.runner.mode = phase.mode;
      this.phaseIndex = index;
    }
    if (!phase.hold && !phase.holdPose) character.update(dt, phaseTime);
    if (this.poseTransition) {
      const transitionTime = this.elapsed - this.poseTransition.start;
      const amount = easeInOut(transitionTime / this.poseTransition.duration);
      blendPose(this.poseTransition.source, amount, this.poseTransition.target);
      if (amount >= 1) this.poseTransition = null;
    }

    const progress = easeInOut(phaseTime / phase.duration);
    let x = 0;
    let y = 0;
    let z = START_Z;
    let yaw = 0;
    if (phase.motion === 'enter') {
      x = ENTRY_X * (1 - progress);
      yaw = ENTRY_YAW;
      if (this.runner.name !== 'Tails') root.t[2] = 0;
    } else if (phase.motion === 'turnToFront') {
      yaw = ENTRY_YAW * (1 - progress);
    } else if (phase.motion === 'shortForward') {
      z += SONIC_SHORT_FORWARD_DISTANCE * progress;
      root.t[2] = 0;
    } else if (phase.motion === 'flightArc') {
      const lift = 2.2 * Math.sin(Math.PI * Math.max(0, Math.min(1, phaseTime / phase.duration)));
      y = lift - root.t[1];
    } else if (phase.motion === 'exit') {
      const startZ = phase.startZ ?? START_Z;
      z = startZ + (EXIT_Z - startZ) * progress;
    }

    root.t[0] += x;
    root.t[1] += y;
    root.t[2] += z;
    root.r[1] += yaw;
    root.s = root.s.map((value) => value * visualScale);
    this.runner.introApplied = { x, y, z, yaw };
  }

  render(renderContext) {
    this.raceScene.render(renderContext);
  }

  #finish() {
    this.active = false;
    this.runner = null;
    this.sequence = null;
    this.phaseIndex = -1;
    this.poseTransition = null;
    this.raceScene.resetToLineup();
  }
}
